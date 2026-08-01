/**
 * ============================================
 * Fairy Tails K9 ÔÇö Training Planner
 * Google Apps Script (paste into your Google Sheet)
 * ============================================
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet named "FT Training Planner Data"
 * 2. Create 4 tabs with these EXACT names and headers in row 1:
 *
 *    Tab: Dogs
 *    Headers: id | name | breed | ownerName | equipment | notes | archived | createdAt | updatedAt
 *      (plus weekNumber | weekNumberSetDate | trainingEndDate |
 *       break1Start | break1End | break2Start | break2End — auto-added by ensureDogColumns_)
 *
 *    Tab: Assignments
 *    Headers: dogId | date | slotId | createdAt | updatedAt
 *
 *    Tab: Config_Slots
 *    Headers: id | label | shortLabel | period
 *
 *    Tab: Config_Equipment
 *    Headers: id | label | colour | textColour
 *
 *    Tab: Deletions (auto-created by handleDeleteDog)
 *    Headers: id | deletedAt
 *
 *    Tab: Report_Dismissals (auto-created by handleDismissReport_)
 *    Headers: dogId | date | dismissedAt
 *
 * 3. Go to Extensions ÔåÆ Apps Script
 * 4. Delete any default code and paste this entire file
 * 5. Click Deploy ÔåÆ New deployment
 * 6. Type: Web app
 * 7. Execute as: Me
 * 8. Who has access: Anyone
 * 9. Click Deploy and copy the URL
 */

// ---- Entry points ----

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getAll';
  var result;

  try {
    switch (action) {
      case 'getAll':
        result = handleGetAll();
        break;
      case 'ping':
        result = { success: true, message: 'Connected to FT Training Planner' };
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result;

  // Serialise all writes through the SAME script lock the weekly auto-increment
  // uses, so concurrent saves/deletes can't interleave a row rewrite (or a
  // deleteRow that shifts indices) into the increment's read-modify-write, and
  // can't tear each other's whole-row writes. Best-effort: if the lock can't be
  // acquired we still proceed (never silently drop a fire-and-forget write) —
  // that only degrades to the old unlocked behaviour, which essentially never
  // happens because every holder releases within well under a second.
  var lock = LockService.getScriptLock();
  var haveLock = false;
  try { lock.waitLock(25000); haveLock = true; } catch (eLock) { haveLock = false; }

  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    switch (action) {
      case 'saveDog':
        result = handleSaveDog(body.data);
        break;
      case 'archiveDog':
        result = handleArchiveDog(body.data);
        break;
      case 'deleteDog':
        result = handleDeleteDog(body.data);
        break;
      case 'setSlot':
        result = handleSetSlot(body.data);
        break;
      case 'removeSlot':
        result = handleRemoveSlot(body.data);
        break;
      case 'saveTimeSlots':
        result = handleSaveConfig('Config_Slots', body.data, ['id', 'label', 'shortLabel', 'period']);
        break;
      case 'saveEquipment':
        result = handleSaveConfig('Config_Equipment', body.data, ['id', 'label', 'colour', 'textColour']);
        break;
      case 'syncAll':
        result = handleSyncAll(body.data);
        break;
      case 'dismissReportDate':
        result = handleDismissReport_(body.data);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  } finally {
    // Flush buffered writes before releasing so the next lock holder sees them
    // (see autoIncrementWeekNumbers). Guarded so a flush error can't leak the lock.
    if (haveLock) {
      try { SpreadsheetApp.flush(); } catch (eFlush) {}
      lock.releaseLock();
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- Config ----

var SPREADSHEET_ID = '1QSlQTWJ0QcvrxFIGMzE4QZeJFT8FCl1yeZ5OG0_hFf8';

// Missed-report tracker (see the "Training report tracker" section at the end
// of this file). Literals only at global scope - never service calls (Apps
// Script re-evaluates globals on EVERY request; a quota-bearing read here
// would burn 2,880 reads/day against the TV's 30s poll).
var REPORTS_FORM_ID = '240177109303044';                // JotForm EU " Training Report"
var REPORTS_BASE_URL = 'https://eu-api.jotform.com';    // EU account - never api.jotform.com
var REPORTS_WINDOW_DAYS = 21;                           // fetch window; TV shows last 14
var REPORTS_CACHE_KEY = 'reportsV1';
var REPORTS_CACHE_TTL_S = 300;                          // fresh result cache
var REPORTS_FAIL_TTL_S = 120;                           // failed-refresh cache (outage = 1 fetch / 2 min)
var REPORTS_LKG_PROP = 'reportsLKG';                    // last-known-good fallback
var REPORTS_API_KEY_PROP = 'JOTFORM_API_KEY';           // set by owner in editor UI; read lazily
var DISMISS_SHEET = 'Report_Dismissals';

// ---- Helpers ----

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      // Handle Date objects from Sheets (format as YYYY-MM-DD)
      if (val instanceof Date) {
        var yyyy = val.getFullYear();
        var mm = ('0' + (val.getMonth() + 1)).slice(-2);
        var dd = ('0' + val.getDate()).slice(-2);
        obj[headers[j]] = yyyy + '-' + mm + '-' + dd;
      } else {
        obj[headers[j]] = (val === '' || val === null || val === undefined) ? '' : String(val);
      }
    }
    // Skip completely empty rows
    if (Object.values(obj).every(function(v) { return v === ''; })) continue;
    rows.push(obj);
  }
  return rows;
}

function findRowIndex(sheet, colIndex, value) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(value)) return i + 1; // 1-based sheet row
  }
  return -1;
}

function findRowIndex2(sheet, col1Index, val1, col2Index, val2) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][col1Index]) === String(val1) && String(data[i][col2Index]) === String(val2)) {
      return i + 1;
    }
  }
  return -1;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

// Dog columns added after the original schema. handleSaveDog/handleSyncAll map
// over the live header row, so a field with no matching header column is silently
// dropped. ensureDogColumns_ appends any missing header so new fields persist
// without anyone hand-editing the Sheet. Idempotent: a no-op read once present.
var DOG_EXTRA_COLUMNS = [
  'weekNumber', 'weekNumberSetDate',
  'trainingEndDate', 'break1Start', 'break1End', 'break2Start', 'break2End'
];

function ensureDogColumns_() {
  var sheet = getSheet('Dogs');
  if (!sheet) return;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var missing = DOG_EXTRA_COLUMNS.filter(function (col) {
    return headers.indexOf(col) === -1;
  });
  if (missing.length === 0) return;
  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
}

// ---- Weekly training-week auto-increment (server-side, time-independent) ----
//
// Every dog's training week must advance by 1 each ISO-week automatically. This
// used to live ONLY in the planner PWA (FT.Storage.autoIncrementWeekNumbers, run
// at app boot), so weeks went static in any week nobody opened/rebooted the app —
// the always-on Sheet + TV display had no way to move them.
//
// Now the increment also runs server-side, invoked from handleGetAll. The TV
// display's 24/7 30-second poll (and any planner sync) therefore advances every
// tracked dog within ~30s of a new week starting, with no client interaction and
// no installed trigger required. The script timezone (Europe/London, see
// appsscript.json) defines when "Monday" begins.
//
// Idempotent and race-safe with the client routine: both add the same
// weeksElapsed from the same base and then stamp weekNumberSetDate = thisMonday,
// and the incremented week is always written together with the stamp, so whoever
// runs first stamps the week and the per-dog `weekNumberSetDate < thisMonday`
// guard turns any second pass into a no-op (no double-increment). A
// ScriptProperties marker makes the heavy path run at most once per week.
//
// The script lock below is the SAME lock doPost acquires for every write, so the
// once-weekly read-modify-write here is genuinely mutually exclusive with
// handleSaveDog / handleSyncAll / handleDeleteDog etc. That matters: without it a
// concurrent deleteDog (deleteRow) could shift the rows out from under our cached
// indices and we'd stamp the wrong dog, and a concurrent saveDog could clobber
// half of our row. (A GAS lock is cooperative — it only excludes code that also
// takes it — which is why doPost must take it too.)

function getMondayStr_(d) {
  var day = d.getDay(); // 0=Sun .. 6=Sat, in the script's timezone
  var diff = day === 0 ? -6 : 1 - day;
  var monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() + diff);
  var mm = ('0' + (monday.getMonth() + 1)).slice(-2);
  var dd = ('0' + monday.getDate()).slice(-2);
  return monday.getFullYear() + '-' + mm + '-' + dd;
}

function formatCellDate_(v) {
  if (v instanceof Date) {
    var mm = ('0' + (v.getMonth() + 1)).slice(-2);
    var dd = ('0' + v.getDate()).slice(-2);
    return v.getFullYear() + '-' + mm + '-' + dd;
  }
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function ymdToMs_(s) {
  var p = String(s).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
}

function autoIncrementWeekNumbers() {
  var currentMonday = getMondayStr_(new Date());

  // Cheap early-out: the real work only needs to happen once per ISO-week. The
  // first request after a new Monday begins does it and stamps this marker; every
  // later poll that week returns after a single ScriptProperties read.
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('weekIncDone') === currentMonday) {
    return { success: true, skipped: 'already-done', monday: currentMonday };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (eLock) {
    return { success: false, error: 'lock unavailable' };
  }

  try {
    // Re-check inside the lock: another request may have just finished.
    if (props.getProperty('weekIncDone') === currentMonday) {
      return { success: true, skipped: 'already-done', monday: currentMonday };
    }

    ensureDogColumns_();
    var sheet = getSheet('Dogs');
    if (!sheet) return { success: false, error: 'Dogs sheet not found' };

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      props.setProperty('weekIncDone', currentMonday);
      return { success: true, updated: 0, monday: currentMonday };
    }

    var headers = data[0];
    var wkCol = headers.indexOf('weekNumber');
    var setCol = headers.indexOf('weekNumberSetDate');
    var updCol = headers.indexOf('updatedAt');
    if (wkCol === -1 || setCol === -1) {
      return { success: false, error: 'weekNumber/weekNumberSetDate column missing' };
    }

    var nowIso = new Date().toISOString();
    var curMs = ymdToMs_(currentMonday);
    var updated = 0;

    for (var i = 1; i < data.length; i++) {
      var raw = data[i][wkCol];
      if (raw === '' || raw === null || raw === undefined) continue; // not tracking a week
      var wk = parseInt(raw, 10);
      if (isNaN(wk)) continue;

      var changed = false;

      // Self-heal the pre-d053912 concatenation corruption ("11" + 1 -> "111").
      // Mirrors the planner's repairWeekNumber: a tracked week >= 100 is bogus.
      if (wk >= 100) { wk = Math.floor(wk / 10); changed = true; }

      var setStr = formatCellDate_(data[i][setCol]);

      if (!setStr) {
        // Tracked but never stamped: record this week as the baseline, do NOT
        // increment (matches the planner's first-seen behaviour).
        changed = true;
      } else if (setStr < currentMonday) {
        var weeksElapsed = Math.round((curMs - ymdToMs_(setStr)) / 604800000);
        // Guard NaN as well as 0/negative. A malformed weekNumberSetDate (e.g. a
        // hand-typed '2025-12' or bare '2025') makes ymdToMs_ return NaN, and
        // `NaN < 1` is FALSE — so the old `weeksElapsed < 1` check let NaN through
        // and wrote weekNumber = wk + NaN = NaN. `!(x >= 1)` catches NaN, 0 and
        // negatives, so a bad date just re-baselines this week (+1) instead.
        if (!(weeksElapsed >= 1)) weeksElapsed = 1;
        wk = wk + weeksElapsed;
        changed = true;
      }

      if (changed) {
        // Isolate the per-row write: one malformed or protected row must never
        // throw out of the whole loop. The 'weekIncDone' marker is only set AFTER
        // the loop, so an abort would leave every OTHER dog un-advanced and re-spin
        // this locked read-modify-write on every 30s TV poll. Skip the row instead.
        try {
          var rowNum = i + 1;
          // updatedAt | weekNumber | weekNumberSetDate are adjacent in the schema
          // (updatedAt is the last original column; ensureDogColumns_ appends
          // weekNumber then weekNumberSetDate right after it). Write all three in a
          // single setValues so the row update is atomic and the read-to-write
          // window is as small as possible. Fall back to cell-by-cell if a future
          // schema reorders them.
          if (updCol !== -1 && wkCol === updCol + 1 && setCol === wkCol + 1) {
            sheet.getRange(rowNum, updCol + 1, 1, 3).setValues([[nowIso, wk, currentMonday]]);
          } else {
            sheet.getRange(rowNum, wkCol + 1).setValue(wk);
            sheet.getRange(rowNum, setCol + 1).setValue(currentMonday);
            if (updCol !== -1) sheet.getRange(rowNum, updCol + 1).setValue(nowIso);
          }
          updated++;
        } catch (rowErr) {
          Logger.log('autoIncrementWeekNumbers: skipped Dogs row ' + (i + 1) + ': ' + rowErr);
        }
      }
    }

    props.setProperty('weekIncDone', currentMonday);
    return { success: true, updated: updated, monday: currentMonday };
  } finally {
    // Commit buffered writes BEFORE releasing the lock so the next holder reads
    // them. Otherwise GAS may flush at execution-end (after releaseLock) and a
    // saveDog that grabs the lock next reads stale rows and loses the increment —
    // the canonical LockService pitfall. Guarded so a flush error can't leak the
    // lock (the release must always run).
    try { SpreadsheetApp.flush(); } catch (eFlush) {}
    lock.releaseLock();
  }
}

// ---- GET handlers ----

function handleGetAll() {
  // Advance every dog's training week if a new ISO-week has begun. Wrapped so a
  // failure here can never break the read the TV display depends on every 30s.
  try { autoIncrementWeekNumbers(); } catch (errInc) { Logger.log('handleGetAll: autoIncrementWeekNumbers threw: ' + errInc); }

  ensureDogColumns_(); // self-heal: make sure new dog fields have header columns
  var dogsSheet = getSheet('Dogs');
  var assignSheet = getSheet('Assignments');
  var slotsSheet = getSheet('Config_Slots');
  var equipSheet = getSheet('Config_Equipment');

  var dogs = dogsSheet ? sheetToObjects(dogsSheet) : [];
  var assignments = assignSheet ? sheetToObjects(assignSheet) : [];
  var timeSlots = slotsSheet ? sheetToObjects(slotsSheet) : [];
  var equipment = equipSheet ? sheetToObjects(equipSheet) : [];

  // Tombstones: ids of dogs that were permanently deleted. Returned so every
  // client (and stale device) learns the deletion and never resurrects the dog.
  var deletedIds = getDeletedIds();

  // Parse equipment arrays back from comma-separated strings
  dogs.forEach(function(dog) {
    if (dog.equipment && typeof dog.equipment === 'string' && dog.equipment !== '') {
      dog.equipment = dog.equipment.split(',').map(function(s) { return s.trim(); });
    } else {
      dog.equipment = [];
    }
    dog.archived = dog.archived === 'true';
  });

  // Group assignments by date for easier consumption
  var slotsByDate = {};
  assignments.forEach(function(a) {
    if (!slotsByDate[a.date]) slotsByDate[a.date] = {};
    slotsByDate[a.date][a.dogId] = {
      dogId: a.dogId,
      slotId: a.slotId,
      date: a.date,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    };
  });

  // Missed-report tracker data. Wrapped like autoIncrementWeekNumbers above:
  // a JotForm outage or any bug in this feature must never break the read the
  // TV depends on. ok:false tells the TV "unavailable - render no tracker"
  // (never fake "missed"). Dismissals are read fresh each poll (not cached)
  // so a remote delete lands within one 30s cycle.
  var reports;
  try {
    var activeDogs = dogs.filter(function(d) { return !d.archived; })
                         .map(function(d) { return { id: d.id, name: d.name }; });
    reports = getReportsForGetAll_(activeDogs);
    reports.dismissed = getDismissedDates_();
  } catch (eRep) {
    reportsSafeLog_('handleGetAll: reports threw: ' + eRep);
    reports = { ok: false, dismissed: {} };
  }

  return {
    success: true,
    dogs: dogs,
    slotsByDate: slotsByDate,
    timeSlots: timeSlots,
    equipment: equipment,
    deletedIds: deletedIds,
    reports: reports
  };
}

// ---- POST handlers ----

function handleSaveDog(dog) {
  // Never re-create a permanently-deleted dog. A stale device's fire-and-forget
  // saveDog (or a local-only push that raced the delete) would otherwise append
  // the row straight back. The Deletions tombstone makes the server authoritative.
  if (dog && dog.id && isDeletedId(dog.id)) {
    return { success: true, skipped: 'deleted', id: dog.id };
  }

  ensureDogColumns_(); // make sure new dog fields have header columns before writing
  var sheet = getSheet('Dogs');
  var headers = getHeaders(sheet);
  var equipStr = Array.isArray(dog.equipment) ? dog.equipment.join(',') : (dog.equipment || '');
  var now = new Date().toISOString();

  var rowData = headers.map(function(h) {
    if (h === 'equipment') return equipStr;
    if (h === 'archived') return String(dog.archived || false);
    if (h === 'updatedAt') return now;
    return (dog[h] != null && dog[h] !== '') ? dog[h] : '';
  });

  var existingRow = findRowIndex(sheet, 0, dog.id); // col 0 = id
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, headers.length).setValues([rowData]);
  } else {
    if (!rowData[headers.indexOf('createdAt')]) {
      rowData[headers.indexOf('createdAt')] = now;
    }
    sheet.appendRow(rowData);
  }

  return { success: true, dog: dog };
}

function handleArchiveDog(data) {
  var sheet = getSheet('Dogs');
  var rowIndex = findRowIndex(sheet, 0, data.id);
  if (rowIndex > 0) {
    var headers = getHeaders(sheet);
    var archivedCol = headers.indexOf('archived') + 1;
    var updatedCol = headers.indexOf('updatedAt') + 1;
    sheet.getRange(rowIndex, archivedCol).setValue('true');
    sheet.getRange(rowIndex, updatedCol).setValue(new Date().toISOString());
    return { success: true };
  }
  return { error: 'Dog not found: ' + data.id };
}

function handleSetSlot(data) {
  var sheet = getSheet('Assignments');
  var headers = getHeaders(sheet);
  var now = new Date().toISOString();

  // Find existing assignment for this dog+date
  var existingRow = findRowIndex2(sheet, 0, data.dogId, 1, data.date);

  var rowData = headers.map(function(h) {
    if (h === 'updatedAt') return now;
    return data[h] || '';
  });

  if (existingRow > 0) {
    if (data.slotId) {
      // Update existing
      sheet.getRange(existingRow, 1, 1, headers.length).setValues([rowData]);
    } else {
      // Remove (no slot selected)
      sheet.deleteRow(existingRow);
    }
  } else if (data.slotId) {
    // New assignment
    if (!rowData[headers.indexOf('createdAt')]) {
      rowData[headers.indexOf('createdAt')] = now;
    }
    sheet.appendRow(rowData);
  }

  return { success: true };
}

function handleRemoveSlot(data) {
  var sheet = getSheet('Assignments');
  var existingRow = findRowIndex2(sheet, 0, data.dogId, 1, data.date);
  if (existingRow > 0) {
    sheet.deleteRow(existingRow);
  }
  return { success: true };
}

function handleSaveConfig(sheetName, items, columns) {
  var sheet = getSheet(sheetName);
  // Clear existing data (keep headers)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  // Write new data
  items.forEach(function(item) {
    var row = columns.map(function(col) { return item[col] || ''; });
    sheet.appendRow(row);
  });
  return { success: true };
}

function handleSyncAll(data) {
  // Full sync: receives all data from the planner and overwrites the sheet
  ensureDogColumns_(); // make sure new dog fields have header columns before writing
  if (data.dogs) {
    var dogsSheet = getSheet('Dogs');
    if (dogsSheet.getLastRow() > 1) {
      dogsSheet.getRange(2, 1, dogsSheet.getLastRow() - 1, dogsSheet.getLastColumn()).clearContent();
    }
    var dogHeaders = getHeaders(dogsSheet);
    var deletedSet = getDeletedIdSet();
    data.dogs.forEach(function(dog) {
      if (dog.id && deletedSet[dog.id]) return; // never resurrect a tombstoned dog
      var equipStr = Array.isArray(dog.equipment) ? dog.equipment.join(',') : (dog.equipment || '');
      var row = dogHeaders.map(function(h) {
        if (h === 'equipment') return equipStr;
        if (h === 'archived') return String(dog.archived || false);
        return (dog[h] != null && dog[h] !== '') ? dog[h] : '';
      });
      dogsSheet.appendRow(row);
    });
  }

  if (data.assignments) {
    var assignSheet = getSheet('Assignments');
    if (assignSheet.getLastRow() > 1) {
      assignSheet.getRange(2, 1, assignSheet.getLastRow() - 1, assignSheet.getLastColumn()).clearContent();
    }
    var assignHeaders = getHeaders(assignSheet);
    data.assignments.forEach(function(a) {
      var row = assignHeaders.map(function(h) { return a[h] || ''; });
      assignSheet.appendRow(row);
    });
  }

  if (data.timeSlots) {
    handleSaveConfig('Config_Slots', data.timeSlots, ['id', 'label', 'shortLabel', 'period']);
  }

  if (data.equipment) {
    handleSaveConfig('Config_Equipment', data.equipment, ['id', 'label', 'colour', 'textColour']);
  }

  return { success: true, message: 'Full sync complete' };
}

// ---- Permanent deletion + tombstones ----
//
// Deleting a dog must be permanent and survive every sync. We (1) remove the
// Dogs row and its Assignments, and (2) write the id to a "Deletions" tab
// (auto-created: headers id | deletedAt). getAll returns these ids so every
// client tombstones them, and handleSaveDog / handleSyncAll refuse to write a
// tombstoned id back. That closes all resurrection paths: pull re-add, the
// local-only saveDog push, and the destructive full-rewrite from a stale device.

function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) sheet.appendRow(headers);
  }
  return sheet;
}

function getDeletedIds() {
  var sheet = getSheet('Deletions');
  if (!sheet) return [];
  return sheetToObjects(sheet)
    .map(function(r) { return r.id; })
    .filter(function(id) { return id !== '' && id != null; });
}

function getDeletedIdSet() {
  var set = {};
  getDeletedIds().forEach(function(id) { set[id] = true; });
  return set;
}

function isDeletedId(id) {
  return getDeletedIdSet()[id] === true;
}

function handleDeleteDog(data) {
  var id = data && data.id;
  if (!id) return { error: 'deleteDog requires an id' };

  // 1. Remove the dog's row from Dogs (so the TV display stops showing it).
  var dogsSheet = getSheet('Dogs');
  if (dogsSheet) {
    var rowIndex = findRowIndex(dogsSheet, 0, id);
    if (rowIndex > 0) dogsSheet.deleteRow(rowIndex);
  }

  // 2. Remove every assignment for this dog. Delete bottom-up so earlier
  //    row indices don't shift as we go.
  var assignSheet = getSheet('Assignments');
  if (assignSheet) {
    var aData = assignSheet.getDataRange().getValues();
    for (var i = aData.length - 1; i >= 1; i--) {
      if (String(aData[i][0]) === String(id)) assignSheet.deleteRow(i + 1);
    }
  }

  // 3. Record the tombstone (idempotent) so no sync can bring it back.
  var delSheet = getOrCreateSheet('Deletions', ['id', 'deletedAt']);
  if (findRowIndex(delSheet, 0, id) < 0) {
    delSheet.appendRow([id, new Date().toISOString()]);
  }

  return { success: true, id: id };
}

// ---- Training report tracker ----
//
// Daily training reports are submitted to a JotForm EU form. getAll returns,
// per active dog, the report dates found in the last REPORTS_WINDOW_DAYS so
// the TV display can flag missing ones (the TV computes "missed" client-side:
// Mon-Thu required, 17:00 cutoff, 14-day expiry). Submissions carry a
// free-text dog name (qid 1) and an authoritative date field (qid 2 - NOT
// created_at, reports are often back-filled next morning), so names are
// matched against the planner's dog list in three ambiguity-guarded tiers.
//
// The JotForm fetch is cached 5 min (CacheService) with a last-known-good
// fallback in Script Properties; a failed refresh is cached 2 min so an
// outage costs at most one UrlFetch per 2 minutes, and getAll itself never
// fails or blocks on this feature. The API key lives ONLY in Script
// Properties (JOTFORM_API_KEY) - never in code, logs, or responses.
//
// Manual overrides: the TV remote can dismiss a chip via doPost action
// 'dismissReportDate', which appends dogId | date | dismissedAt to the
// Report_Dismissals tab (permanent audit log; delete the row by hand to
// un-dismiss). getAll reads that tab fresh every poll.

// -- Pure helpers (no GAS services - covered by the node test harness at
//    ft-training-planner/.claude/reports-matching-test.js) --

// Lowercase, punctuation -> space, collapse whitespace. "Enzo & Miles" -> "enzo miles"
function normalizeName_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokens of a normalized name, minus the connector "and".
function nameTokens_(norm) {
  return String(norm || '').split(' ').filter(function(t) {
    return t !== '' && t !== 'and';
  });
}

// True when a and b differ by at most one edit (insert/delete/replace).
// Ported from the feeding display's matcher. The <4-char guard keeps short
// names ("Ty", "Gus") exact-only, where a single edit is too big a leap.
function oneEditApart_(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  var i = 0;
  while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i++;
  var j = 0;
  while (j < a.length - i && j < b.length - i &&
         a.charAt(a.length - 1 - j) === b.charAt(b.length - 1 - j)) j++;

  return (a.length - i - j) <= 1 && (b.length - i - j) <= 1;
}

function buildDogIndex_(activeDogs) {
  return (activeDogs || []).map(function(d) {
    var norm = normalizeName_(d && d.name);
    return { id: d && d.id, norm: norm, tokens: nameTokens_(norm) };
  }).filter(function(d) { return !!d.id && d.norm !== ''; });
}

// Report name -> dogId. Tiers: exact -> token membership ("enzo" or "miles"
// -> "Enzo and Miles") -> one-edit fuzzy ("rollo" -> "Rolo"). At every tier
// ALL candidates are collected first; a 2+ tie returns null with NO
// fall-through, so an ambiguous report fails toward "missed" (the
// attention-drawing direction) instead of guessing a dog.
function matchReportName_(reportNorm, index) {
  if (!reportNorm) return null;
  var reportTokens = nameTokens_(reportNorm);
  if (reportTokens.length === 0) return null;

  var hits = index.filter(function(d) { return d.norm === reportNorm; });
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) return null;

  hits = index.filter(function(d) {
    return reportTokens.some(function(t) { return d.tokens.indexOf(t) !== -1; });
  });
  if (hits.length === 1) return hits[0].id;
  if (hits.length > 1) return null;

  hits = index.filter(function(d) {
    return reportTokens.some(function(rt) {
      return d.tokens.some(function(dt) { return oneEditApart_(rt, dt); });
    });
  });
  if (hits.length === 1) return hits[0].id;
  return null;
}

// Raw JotForm submissions -> [{name, date}]. Answers are keyed by qid
// STRINGS: '1' = dog name (free text), '2' = date. The date answer is
// usually {day, month, year, datetime: 'YYYY-MM-DD 00:00:00'}; prefer
// datetime, fall back to the parts, tolerate a bare string.
function extractReportPairs_(rawSubmissions) {
  var pairs = [];
  var skipped = 0;
  (rawSubmissions || []).forEach(function(sub) {
    if (!sub || sub.status === 'DELETED') return;
    var answers = sub.answers || {};
    var nameAns = answers['1'] && answers['1'].answer;
    var name = (nameAns === null || nameAns === undefined) ? '' : String(nameAns).trim();
    if (!name) { skipped++; return; }

    var dateAns = answers['2'] && answers['2'].answer;
    var date = '';
    if (dateAns && typeof dateAns === 'object') {
      if (dateAns.datetime) {
        date = String(dateAns.datetime).slice(0, 10);
      } else if (dateAns.year && dateAns.month && dateAns.day) {
        date = String(dateAns.year) + '-' +
               ('0' + String(dateAns.month)).slice(-2) + '-' +
               ('0' + String(dateAns.day)).slice(-2);
      }
    } else if (dateAns) {
      date = String(dateAns).slice(0, 10);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; return; }

    pairs.push({ name: name, date: date });
  });
  return { pairs: pairs, skipped: skipped };
}

// Pairs + dog index -> { dates: {dogId: [sorted unique dates]}, unmatched, dropped }.
// Future-dated and out-of-window dates are dropped (a typo'd future date must
// not linger; the fetch window bounds payload size).
function assembleReportDates_(pairs, index, todayStr, windowStartStr) {
  var byDog = {};
  var unmatched = {};
  var dropped = 0;
  (pairs || []).forEach(function(p) {
    if (p.date > todayStr || p.date < windowStartStr) { dropped++; return; }
    var dogId = matchReportName_(normalizeName_(p.name), index);
    if (!dogId) { unmatched[p.name] = true; return; }
    if (!byDog[dogId]) byDog[dogId] = {};
    byDog[dogId][p.date] = true;
  });
  var dates = {};
  Object.keys(byDog).forEach(function(id) {
    dates[id] = Object.keys(byDog[id]).sort();
  });
  return { dates: dates, unmatched: Object.keys(unmatched), dropped: dropped };
}

// 'YYYY-MM-DD' + delta days -> 'YYYY-MM-DD' (numeric-component Date round
// trip, same style as ymdToMs_; '' for malformed input).
function ymdAddDays_(ymd, delta) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  if (!m) return '';
  var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10) + delta);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// -- GAS-touching side --

function ymdToday_() {
  var d = new Date(); // script TZ (Europe/London)
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// All logging on the reports path goes through this: the apiKey rides in the
// fetch URL and GAS exception messages echo URLs, so redact before logging.
function reportsSafeLog_(msg) {
  Logger.log(String(msg).replace(/apiKey=[^&\s]+/g, 'apiKey=***'));
}

// One JotForm fetch + parse + match. Returns the reports object or null on
// any failure (caller handles fallback). Never throws.
function refreshReports_(activeDogs) {
  var key;
  try {
    key = PropertiesService.getScriptProperties().getProperty(REPORTS_API_KEY_PROP);
  } catch (eProp) {
    reportsSafeLog_('reports: property read failed: ' + eProp);
    return null;
  }
  if (!key) {
    reportsSafeLog_('reports: ' + REPORTS_API_KEY_PROP + ' not set (owner: editor > Project Settings > Script Properties)');
    return null;
  }

  var todayStr = ymdToday_();
  var windowStartStr = ymdAddDays_(todayStr, -REPORTS_WINDOW_DAYS);
  // A report's created_at is always >= its training date, so a created_at
  // window of 21 days captures every report whose DATE is within 21 days.
  var filter = JSON.stringify({ 'created_at:gt': windowStartStr + ' 00:00:00', 'status:ne': 'DELETED' });
  var url = REPORTS_BASE_URL + '/form/' + REPORTS_FORM_ID + '/submissions' +
            '?apiKey=' + encodeURIComponent(key) +
            '&limit=1000&orderby=created_at' +
            '&filter=' + encodeURIComponent(filter);

  var response;
  try {
    response = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
  } catch (eFetch) {
    reportsSafeLog_('reports: fetch threw: ' + eFetch);
    return null;
  }

  var code = response.getResponseCode();
  if (code !== 200) {
    reportsSafeLog_('reports: HTTP ' + code + ': ' + String(response.getContentText() || '').slice(0, 200));
    return null;
  }

  var parsed;
  try {
    parsed = JSON.parse(response.getContentText());
  } catch (eParse) {
    reportsSafeLog_('reports: response JSON parse failed');
    return null;
  }
  if (!parsed || parsed.responseCode !== 200 || !Array.isArray(parsed.content)) {
    reportsSafeLog_('reports: unexpected body (responseCode=' + (parsed && parsed.responseCode) + ')');
    return null;
  }
  if (parsed.content.length >= 1000) {
    // Overflow drops the NEWEST rows (ascending order) - the dangerous
    // direction (false misseds). ~10 reports/day = 5x headroom today.
    reportsSafeLog_('reports: WINDOW OVERFLOW - 1000 rows returned; newest reports may be missing');
  }

  var extracted = extractReportPairs_(parsed.content);
  var assembled = assembleReportDates_(extracted.pairs, buildDogIndex_(activeDogs), todayStr, windowStartStr);
  reportsSafeLog_('reports: refresh ok - ' + parsed.content.length + ' rows, ' +
    extracted.pairs.length + ' usable, ' + extracted.skipped + ' skipped, ' +
    assembled.dropped + ' out-of-window, dogs matched: ' + Object.keys(assembled.dates).length +
    (assembled.unmatched.length ? ', unmatched: ' + assembled.unmatched.join(', ') : ''));

  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    windowDays: REPORTS_WINDOW_DAYS,
    dates: assembled.dates
  };
}

// Persist the last successful refresh so a JotForm outage serves recent data
// (marked stale) instead of nothing. Written only when the dates actually
// changed - fetchedAt alone must not cause 288 property writes a day.
function updateReportsLKG_(obj) {
  try {
    var props = PropertiesService.getScriptProperties();
    var prev = props.getProperty(REPORTS_LKG_PROP);
    if (prev) {
      try {
        if (JSON.stringify(JSON.parse(prev).dates) === JSON.stringify(obj.dates)) return;
      } catch (eCmp) { /* unparseable previous value: overwrite it */ }
    }
    props.setProperty(REPORTS_LKG_PROP, JSON.stringify(obj));
  } catch (e) {
    reportsSafeLog_('reports: LKG write failed: ' + e);
  }
}

// The per-poll entry point. Cache-hit path = exactly ONE CacheService read.
// Never throws. Deliberately NOT under the script lock: holding it through a
// UrlFetch would block every planner write; a cache-expiry stampede just
// costs a few duplicate JotForm fetches per 5 minutes.
function getReportsForGetAll_(activeDogs) {
  try {
    var cache = CacheService.getScriptCache();
    var cached = null;
    try { cached = cache.get(REPORTS_CACHE_KEY); } catch (eGet) { /* treat as miss */ }
    if (cached) {
      try { return JSON.parse(cached); } catch (eParse) { /* corrupt: treat as miss */ }
    }

    var fresh = refreshReports_(activeDogs);
    if (fresh) {
      try { cache.put(REPORTS_CACHE_KEY, JSON.stringify(fresh), REPORTS_CACHE_TTL_S); } catch (ePut) {}
      updateReportsLKG_(fresh);
      return fresh;
    }

    // Refresh failed: serve last-known-good marked stale, else ok:false.
    // Either way cache it briefly so the outage doesn't fetch per-poll.
    var served = { ok: false };
    try {
      var lkg = PropertiesService.getScriptProperties().getProperty(REPORTS_LKG_PROP);
      if (lkg) {
        var parsedLkg = JSON.parse(lkg);
        if (parsedLkg && parsedLkg.ok === true) {
          parsedLkg.stale = true;
          served = parsedLkg;
        }
      }
    } catch (eLkg) {
      reportsSafeLog_('reports: LKG read failed: ' + eLkg);
    }
    try { cache.put(REPORTS_CACHE_KEY, JSON.stringify(served), REPORTS_FAIL_TTL_S); } catch (ePut2) {}
    return served;
  } catch (eAny) {
    reportsSafeLog_('reports: getReportsForGetAll_ threw: ' + eAny);
    return { ok: false };
  }
}

// Manual dismissals, grouped by dogId, window-filtered. Read fresh on every
// getAll (small tab) so a TV-remote delete lands within one 30s poll rather
// than a 5-minute cache cycle.
function getDismissedDates_() {
  var sheet = getSheet(DISMISS_SHEET);
  if (!sheet) return {};
  var todayStr = ymdToday_();
  var windowStartStr = ymdAddDays_(todayStr, -REPORTS_WINDOW_DAYS);
  var out = {};
  sheetToObjects(sheet).forEach(function(r) {
    if (!r.dogId || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) return;
    if (r.date < windowStartStr || r.date > todayStr) return;
    if (!out[r.dogId]) out[r.dogId] = [];
    if (out[r.dogId].indexOf(r.date) === -1) out[r.dogId].push(r.date);
  });
  Object.keys(out).forEach(function(id) { out[id].sort(); });
  return out;
}

// doPost action 'dismissReportDate' {dogId, date}: the TV remote's manual
// override. Idempotent append (fire-and-forget clients may re-send). The tab
// is the audit trail; deleting its row un-dismisses.
function handleDismissReport_(data) {
  var dogId = data && data.dogId;
  var date = data ? String(data.date || '') : '';
  if (!dogId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'dismissReportDate requires dogId and date (YYYY-MM-DD)' };
  }
  var todayStr = ymdToday_();
  if (date > todayStr || date < ymdAddDays_(todayStr, -REPORTS_WINDOW_DAYS)) {
    return { error: 'dismissReportDate: date outside the tracked window' };
  }
  var dogsSheet = getSheet('Dogs');
  if (!dogsSheet || findRowIndex(dogsSheet, 0, dogId) < 0) {
    return { error: 'dismissReportDate: unknown dogId' };
  }
  var sheet = getOrCreateSheet(DISMISS_SHEET, ['dogId', 'date', 'dismissedAt']);
  if (findRowIndex2(sheet, 0, dogId, 1, date) < 0) {
    sheet.appendRow([dogId, date, new Date().toISOString()]);
  }
  return { success: true, dogId: dogId, date: date };
}

// Owner-run only (editor > select function > Run): verifies the JotForm
// fetch end-to-end and - critically - triggers the one-time OAuth grant for
// the script.external_request scope that UrlFetchApp adds. Run it once,
// approve the prompt, BEFORE redeploying prod. Not routed via doGet/doPost.
function testReportsRefresh() {
  var dogsSheet = getSheet('Dogs');
  var dogs = dogsSheet ? sheetToObjects(dogsSheet) : [];
  var active = dogs.filter(function(d) { return d.archived !== 'true'; })
                   .map(function(d) { return { id: d.id, name: d.name }; });
  var result = refreshReports_(active);
  reportsSafeLog_('testReportsRefresh: ' + (result ? JSON.stringify(result.dates) : 'FAILED - see log lines above'));
}
