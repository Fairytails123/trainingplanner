/* ============================================
   storage.js — Data persistence layer
   localStorage + Google Sheets sync
   ============================================ */

window.FT = window.FT || {};

// Shared HTML/attribute escaper — storage.js loads first, so every module can use it
window.FT.Util = window.FT.Util || {};
window.FT.Util.escapeHtml = function (str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

window.FT.Storage = (function () {
  'use strict';

  var DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzBzTZKpAHKidIsa653UWCo-TbUOgxCTbqyE69obmV2rij_0cJsnSsciOcZci564RrR/exec';

  var KEYS = {
    dogs: 'ft_dogs',
    configSlots: 'ft_config_timeslots',
    configEquipment: 'ft_config_equipment',
    sheetsUrl: 'ft_sheets_api_url',
    deleted: 'ft_deleted_dogs'
  };

  function slotKey(dateStr) {
    return 'ft_slots_' + dateStr;
  }

  // ---- localStorage helpers ----

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Storage read error for ' + key, e);
      return null;
    }
  }

  function write(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Storage write error for ' + key, e);
    }
  }

  function generateId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  // ---- Deletion tombstones ----
  //
  // A permanently-deleted dog is removed from localStorage, but the Sheet is what
  // every sync trusts. Without a record of the deletion, syncFromSheets re-adds the
  // dog as a "Sheet-only" entry (and a full push from a stale device rewrites it).
  // So we keep a persistent set of deleted ids here and consult it on EVERY sync
  // path — pull-merge, local-only push, and slot merge — so nothing resurrects a
  // deleted dog. Ids are also mirrored to the Sheet's Deletions tab, so other
  // devices learn the deletion on their next pull.

  function getDeletedIds() {
    var arr = read(KEYS.deleted);
    return Array.isArray(arr) ? arr : [];
  }

  function deletedSet() {
    var set = {};
    getDeletedIds().forEach(function (id) { set[id] = true; });
    return set;
  }

  function addDeletedId(id) {
    if (!id) return;
    var ids = getDeletedIds();
    if (ids.indexOf(id) === -1) {
      ids.push(id);
      write(KEYS.deleted, ids);
    }
  }

  // ---- Google Sheets sync ----

  function getSheetsUrl() {
    return localStorage.getItem(KEYS.sheetsUrl) || DEFAULT_SHEETS_URL;
  }

  function setSheetsUrl(url) {
    localStorage.setItem(KEYS.sheetsUrl, url || '');
  }

  /**
   * Fire-and-forget POST to Sheets API. Does not block the UI.
   * Uses no-cors mode because Apps Script redirects POST requests.
   */
  function syncToSheets(action, data) {
    var url = getSheetsUrl();
    if (!url) return;

    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: action, data: data })
    }).then(function () {
      console.log('Sheets sync sent (' + action + ')');
    }).catch(function (err) {
      console.warn('Sheets sync failed (' + action + '):', err.message);
    });
  }

  /**
   * Sheet cells come back as strings (Apps Script does String(val) on every cell),
   * so weekNumber needs to be parsed back to a Number before it lands in localStorage —
   * otherwise the auto-increment's `+=` does string concatenation.
   */
  function normalizeDogFromSheet(dog) {
    if (dog.weekNumber === '' || dog.weekNumber == null) {
      dog.weekNumber = null;
    } else {
      var n = parseInt(dog.weekNumber, 10);
      dog.weekNumber = isNaN(n) ? null : n;
    }
    repairWeekNumber(dog);
    return dog;
  }

  /**
   * One-time repair for values corrupted by the pre-fix concatenation bug.
   *
   * Before commit d053912, autoIncrementWeekNumbers did `dog.weekNumber += weeksElapsed`
   * with weekNumber arriving from the sheet as a string. `"11" + 1` produced "111",
   * `"3" + 1` produced "31", etc. The fix prevents new corruption but leaves the
   * already-broken values in localStorage and the Google Sheet.
   *
   * weeksElapsed is always single-digit in practice (autoIncrement runs every Monday),
   * so the corruption always appended exactly one digit. Any weekNumber >= 100 is
   * implausible for a real training dog and is unambiguously a corrupted value —
   * stripping the trailing digit recovers the original (111 → 11, 222 → 22).
   *
   * Values 10–99 are left alone: they could be real (a dog at week 31 is plausible)
   * and there's no safe way to disambiguate without user input. Edit those manually
   * via the planner UI if needed.
   *
   * Returns true if the dog was repaired (caller should mark changed and sync).
   */
  function repairWeekNumber(dog) {
    var n = parseInt(dog.weekNumber, 10);
    if (isNaN(n) || n < 100) return false;
    var fixed = Math.floor(n / 10);
    console.warn(
      '[FT.Storage] Repaired corrupted weekNumber for "' + (dog.name || dog.id) + '": ' +
      n + ' → ' + fixed +
      ' (pre-d053912 concatenation bug; values 10–99 left alone, edit manually if wrong)'
    );
    dog.weekNumber = fixed;
    dog.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Merge two dog lists by ID. Local-only dogs are preserved and pushed to Sheet.
   * For duplicates, the one with the newer updatedAt wins.
   */
  function mergeDogLists(localDogs, sheetDogs) {
    // Never let a permanently-deleted dog survive a merge. Filtering both inputs
    // means a tombstoned dog can't come back as a Sheet-only re-add, nor linger
    // locally, nor get pushed back via the local-only path below.
    var deleted = deletedSet();
    localDogs = localDogs.filter(function (d) { return !deleted[d.id]; });
    sheetDogs = sheetDogs.filter(function (d) { return !deleted[d.id]; });

    sheetDogs.forEach(normalizeDogFromSheet);

    var sheetMap = {};
    sheetDogs.forEach(function (d) { sheetMap[d.id] = d; });

    var localMap = {};
    localDogs.forEach(function (d) { localMap[d.id] = d; });

    var merged = [];
    var localOnly = [];

    // All local dogs: keep them, check if Sheet has a newer version
    localDogs.forEach(function (local) {
      var sheet = sheetMap[local.id];
      if (sheet) {
        // Both exist: keep the one with newer updatedAt (or createdAt as fallback)
        var localTime = local.updatedAt || local.createdAt || '';
        var sheetTime = sheet.updatedAt || sheet.createdAt || '';
        if (sheetTime > localTime) {
          merged.push(sheet);
        } else {
          merged.push(local);
        }
      } else {
        // Local only: keep and flag for push to Sheet
        merged.push(local);
        localOnly.push(local);
      }
    });

    // Sheet-only dogs: add to local
    sheetDogs.forEach(function (sheet) {
      if (!localMap[sheet.id]) {
        merged.push(sheet);
      }
    });

    return { all: merged, localOnly: localOnly };
  }

  /**
   * Merge slot assignments for a single date. Same logic: local-only slots get pushed.
   */
  function mergeSlotAssignments(localSlots, sheetSlots) {
    var deleted = deletedSet();
    var merged = {};
    // Drop any assignment belonging to a deleted dog from the local side too.
    Object.keys(localSlots).forEach(function (dogId) {
      if (!deleted[dogId]) merged[dogId] = localSlots[dogId];
    });
    var localOnly = [];

    // Sheet slots override local (or add new) — but never for a deleted dog
    Object.keys(sheetSlots).forEach(function (dogId) {
      if (deleted[dogId]) return;
      var sheet = sheetSlots[dogId];
      var local = localSlots[dogId];
      if (local) {
        var localTime = local.updatedAt || local.createdAt || '';
        var sheetTime = sheet.updatedAt || sheet.createdAt || '';
        if (sheetTime > localTime) {
          merged[dogId] = sheet;
        }
      } else {
        merged[dogId] = sheet;
      }
    });

    // Find local-only assignments to push (never for a deleted dog)
    Object.keys(localSlots).forEach(function (dogId) {
      if (deleted[dogId]) return;
      if (!sheetSlots[dogId]) {
        localOnly.push(localSlots[dogId]);
      }
    });

    return { all: merged, localOnly: localOnly };
  }

  /**
   * Pull all data from Sheets and two-way merge with localStorage.
   * Local-only dogs and assignments are automatically pushed to the Sheet.
   */
  function syncFromSheets(onComplete) {
    var url = getSheetsUrl();
    if (!url) {
      if (onComplete) onComplete(false);
      return;
    }

    fetch(url + '?action=getAll')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) {
          console.warn('Sheets getAll failed:', data.error);
          if (onComplete) onComplete(false);
          return;
        }

        // Learn about deletions made on other devices, then make sure every
        // tombstoned dog is actually gone from the Sheet. A delete is a
        // fire-and-forget no-cors POST, so a pull can race ahead of it (or it can
        // be dropped); re-sending the delete for any id still present makes
        // deletion self-healing and converges the Sheet (and the TV display).
        var sheetDogs = data.dogs || [];
        (data.deletedIds || []).forEach(addDeletedId);
        var sheetIds = {};
        sheetDogs.forEach(function (d) { sheetIds[d.id] = true; });
        getDeletedIds().forEach(function (id) {
          if (sheetIds[id]) syncToSheets('deleteDog', { id: id });
        });

        // Two-way merge dogs (mergeDogLists drops anything tombstoned)
        var localDogs = getDogs();
        var dogMerge = mergeDogLists(localDogs, sheetDogs);
        write(KEYS.dogs, dogMerge.all);

        // Push local-only dogs to Sheet
        if (dogMerge.localOnly.length > 0) {
          console.log('Pushing ' + dogMerge.localOnly.length + ' local-only dogs to Sheet');
          dogMerge.localOnly.forEach(function (dog) {
            syncToSheets('saveDog', dog);
          });
        }

        // Two-way merge slot assignments by date
        if (data.slotsByDate) {
          // Merge dates that exist in Sheet
          Object.keys(data.slotsByDate).forEach(function (dateStr) {
            var localSlots = read(slotKey(dateStr)) || {};
            var sheetSlots = data.slotsByDate[dateStr];
            var slotMerge = mergeSlotAssignments(localSlots, sheetSlots);
            write(slotKey(dateStr), slotMerge.all);

            // Push local-only assignments
            slotMerge.localOnly.forEach(function (assignment) {
              syncToSheets('setSlot', assignment);
            });
          });
        }

        // Also push any local date slots that aren't in the Sheet at all
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key && key.startsWith('ft_slots_')) {
            var dateStr = key.replace('ft_slots_', '');
            if (!data.slotsByDate || !data.slotsByDate[dateStr]) {
              // This entire date's assignments are local-only
              var localOnlySlots = read(key) || {};
              var deletedDogs = deletedSet();
              Object.keys(localOnlySlots).forEach(function (dogId) {
                if (deletedDogs[dogId]) return; // don't recreate a deleted dog's slots
                syncToSheets('setSlot', localOnlySlots[dogId]);
              });
            }
          }
        }

        // Merge config (Sheet wins for config since it's shared)
        if (data.timeSlots && data.timeSlots.length > 0) {
          write(KEYS.configSlots, data.timeSlots);
        }
        if (data.equipment && data.equipment.length > 0) {
          write(KEYS.configEquipment, data.equipment);
        }

        console.log('Two-way sync complete (' + dogMerge.all.length + ' dogs)');
        if (onComplete) onComplete(true);
      })
      .catch(function (err) {
        console.warn('Sheets sync pull failed:', err.message);
        if (onComplete) onComplete(false);
      });
  }

  /**
   * Push ALL current localStorage data to Sheets (full sync).
   */
  function pushAllToSheets(onComplete) {
    var url = getSheetsUrl();
    if (!url) {
      if (onComplete) onComplete(false);
      return;
    }

    // Gather all slot assignments from localStorage
    var assignments = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.startsWith('ft_slots_')) {
        var dateStr = key.replace('ft_slots_', '');
        var daySlots = read(key) || {};
        Object.keys(daySlots).forEach(function (dogId) {
          assignments.push(daySlots[dogId]);
        });
      }
    }

    var payload = {
      action: 'syncAll',
      data: {
        dogs: getDogs(),
        assignments: assignments,
        timeSlots: getTimeSlots(),
        equipment: getEquipment()
      }
    };

    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    })
      .then(function () {
        // no-cors returns opaque response, assume success if no error
        console.log('Full push sent to Sheets');
        if (onComplete) onComplete(true);
      })
      .catch(function (err) {
        console.warn('Sheets full push failed:', err.message);
        if (onComplete) onComplete(false);
      });
  }

  /**
   * Test connection to the Sheets API.
   */
  function testSheetsConnection(url, onResult) {
    fetch(url + '?action=ping')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        onResult(data.success === true, data.message || 'Connected');
      })
      .catch(function (err) {
        onResult(false, err.message);
      });
  }

  // ---- Default configs ----

  var DEFAULT_TIMESLOTS = [
    { id: 'am_early', label: '08:00 – 09:00', shortLabel: '08–09', period: 'am' },
    { id: 'am_mid',   label: '09:00 – 10:00', shortLabel: '09–10', period: 'am' },
    { id: 'am_late',  label: '10:00 – 11:00', shortLabel: '10–11', period: 'am' },
    { id: 'midday',   label: '11:00 – 12:00', shortLabel: '11–12', period: 'am' },
    { id: 'pm_early', label: '13:00 – 14:00', shortLabel: '13–14', period: 'pm' },
    { id: 'pm_mid',   label: '14:00 – 15:00', shortLabel: '14–15', period: 'pm' },
    { id: 'pm_late',  label: '15:00 – 16:00', shortLabel: '15–16', period: 'pm' },
    { id: 'pm_end',   label: '16:00 – 17:00', shortLabel: '16–17', period: 'pm' }
  ];

  var DEFAULT_EQUIPMENT = [
    { id: 'muzzle',      label: 'Muzzle',      colour: '#EEEDFE', textColour: '#3C3489' },
    { id: 'head_collar', label: 'Head collar',  colour: '#E1F5EE', textColour: '#085041' },
    { id: 'backpack',    label: 'Backpack',     colour: '#EEEDFE', textColour: '#3C3489' },
    { id: 'harness',     label: 'Harness',      colour: '#E1F5EE', textColour: '#085041' },
    { id: 'long_line',   label: 'Long line',    colour: '#FAEEDA', textColour: '#633806' },
    { id: 'short_lead',  label: 'Short lead',   colour: '#FAEEDA', textColour: '#633806' },
    { id: 'treat_pouch', label: 'Treat pouch',  colour: '#FAECE7', textColour: '#712B13' },
    { id: 'clicker',     label: 'Clicker',      colour: '#FAECE7', textColour: '#712B13' },
    { id: 'crate',       label: 'Crate',        colour: '#F1EFE8', textColour: '#444441' }
  ];

  // ---- Week number auto-increment ----

  function getCurrentMondayStr() {
    var today = new Date();
    var day = today.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    var mm = String(monday.getMonth() + 1).padStart(2, '0');
    var dd = String(monday.getDate()).padStart(2, '0');
    return monday.getFullYear() + '-' + mm + '-' + dd;
  }

  function autoIncrementWeekNumbers() {
    var dogs = read(KEYS.dogs) || [];
    var currentMonday = getCurrentMondayStr();
    var changed = false;
    var touched = {}; // dog ids that need pushing to Sheets

    dogs.forEach(function (dog) {
      // Repair any pre-d053912 corrupted values BEFORE we increment, so
      // we don't accidentally compound the corruption on a Monday boundary.
      if (repairWeekNumber(dog)) {
        changed = true;
        touched[dog.id] = true;
      }

      if (dog.weekNumber == null) return;
      if (!dog.weekNumberSetDate) {
        dog.weekNumberSetDate = currentMonday;
        changed = true;
        touched[dog.id] = true;
        return;
      }
      if (dog.weekNumberSetDate < currentMonday) {
        var setDate = new Date(dog.weekNumberSetDate + 'T00:00:00');
        var curDate = new Date(currentMonday + 'T00:00:00');
        var weeksElapsed = Math.round((curDate - setDate) / (7 * 24 * 60 * 60 * 1000));
        // Coerce weekNumber to integer before adding — sheet round-trips can stringify it,
        // and `string += number` does concatenation (e.g. "11" + 1 → "111").
        dog.weekNumber = (parseInt(dog.weekNumber, 10) || 0) + weeksElapsed;
        dog.weekNumberSetDate = currentMonday;
        dog.updatedAt = new Date().toISOString();
        changed = true;
        touched[dog.id] = true;
      }
    });

    if (changed) {
      write(KEYS.dogs, dogs);
      // Only sync the dogs we actually touched — avoid spamming Sheets with no-ops.
      dogs.forEach(function (dog) {
        if (touched[dog.id] && dog.weekNumber != null) {
          syncToSheets('saveDog', dog);
        }
      });
    }
  }

  // ---- Dogs ----

  function getDogs() {
    return read(KEYS.dogs) || [];
  }

  function getDog(id) {
    return getDogs().find(function (d) { return d.id === id; }) || null;
  }

  function saveDog(dog) {
    var dogs = getDogs();
    var now = new Date().toISOString();

    if (dog.id) {
      var idx = dogs.findIndex(function (d) { return d.id === dog.id; });
      if (idx >= 0) {
        dogs[idx] = Object.assign({}, dogs[idx], dog, { updatedAt: now });
      } else {
        dog.createdAt = now;
        dogs.push(dog);
      }
    } else {
      dog.id = generateId('dog');
      dog.createdAt = now;
      dog.archived = false;
      dog.equipment = dog.equipment || [];
      dogs.push(dog);
    }

    write(KEYS.dogs, dogs);
    syncToSheets('saveDog', dog);
    return dog;
  }

  function archiveDog(id) {
    var dogs = getDogs();
    var idx = dogs.findIndex(function (d) { return d.id === id; });
    if (idx >= 0) {
      dogs[idx].archived = true;
      dogs[idx].updatedAt = new Date().toISOString();
      write(KEYS.dogs, dogs);
      syncToSheets('archiveDog', { id: id });
    }
  }

  // Bring an archived dog back into the active list.
  function restoreDog(id) {
    var dogs = getDogs();
    var idx = dogs.findIndex(function (d) { return d.id === id; });
    if (idx >= 0) {
      dogs[idx].archived = false;
      dogs[idx].updatedAt = new Date().toISOString();
      write(KEYS.dogs, dogs);
      syncToSheets('saveDog', dogs[idx]);
    }
  }

  // Permanently delete a dog. The tombstone is recorded FIRST so that even if
  // anything below races a concurrent sync, no pull/push can resurrect it. The
  // server-side deleteDog removes the Sheet row (so the TV display drops it) and
  // records its own tombstone for other devices.
  function deleteDog(id) {
    if (!id) return;
    addDeletedId(id);

    write(KEYS.dogs, getDogs().filter(function (d) { return d.id !== id; }));

    // Drop the dog's local slot assignments across every date.
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.startsWith('ft_slots_')) {
        var slots = read(key) || {};
        if (slots[id]) {
          delete slots[id];
          write(key, slots);
        }
      }
    }

    syncToSheets('deleteDog', { id: id });
  }

  function getActiveDogs() {
    return getDogs()
      .filter(function (d) { return !d.archived; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function getArchivedDogs() {
    return getDogs()
      .filter(function (d) { return d.archived; })
      .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
  }

  // ---- Slot assignments ----

  function getSlots(dateStr) {
    return read(slotKey(dateStr)) || {};
  }

  function setSlot(dateStr, dogId, slotId) {
    var slots = getSlots(dateStr);
    var now = new Date().toISOString();

    if (slotId) {
      slots[dogId] = {
        dogId: dogId,
        slotId: slotId,
        date: dateStr,
        createdAt: slots[dogId] ? slots[dogId].createdAt : now,
        updatedAt: now
      };
    } else {
      delete slots[dogId];
    }

    write(slotKey(dateStr), slots);
    syncToSheets('setSlot', { dogId: dogId, date: dateStr, slotId: slotId || '', createdAt: slots[dogId] ? slots[dogId].createdAt : now, updatedAt: now });
  }

  function removeSlot(dateStr, dogId) {
    var slots = getSlots(dateStr);
    delete slots[dogId];
    write(slotKey(dateStr), slots);
    syncToSheets('removeSlot', { dogId: dogId, date: dateStr });
  }

  function getSlotsForWeek(dates) {
    var result = {};
    dates.forEach(function (date) {
      var dateStr = FT.Calendar.formatDate(date, 'YYYY-MM-DD');
      result[dateStr] = getSlots(dateStr);
    });
    return result;
  }

  // ---- Config: Time Slots ----

  function getTimeSlots() {
    var stored = read(KEYS.configSlots);
    if (!stored || stored.length === 0) {
      write(KEYS.configSlots, DEFAULT_TIMESLOTS);
      return DEFAULT_TIMESLOTS.slice();
    }
    return stored;
  }

  function saveTimeSlots(slots) {
    write(KEYS.configSlots, slots);
    syncToSheets('saveTimeSlots', slots);
  }

  // ---- Config: Equipment ----

  function getEquipment() {
    var stored = read(KEYS.configEquipment);
    if (!stored || stored.length === 0) {
      write(KEYS.configEquipment, DEFAULT_EQUIPMENT);
      return DEFAULT_EQUIPMENT.slice();
    }
    return stored;
  }

  function saveEquipment(items) {
    write(KEYS.configEquipment, items);
    syncToSheets('saveEquipment', items);
  }

  // ---- Export / Import ----

  function exportAll() {
    var data = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key.startsWith('ft_')) {
        // sheetsUrl is stored as a raw string, not JSON — read() would mangle it to null
        data[key] = key === KEYS.sheetsUrl ? localStorage.getItem(key) : read(key);
      }
    }
    return JSON.stringify(data, null, 2);
  }

  function importAll(jsonStr) {
    try {
      var data = JSON.parse(jsonStr);
      Object.keys(data).forEach(function (key) {
        if (!key.startsWith('ft_')) return;
        if (key === KEYS.sheetsUrl) {
          // raw string key; skip nulls from backups made before this was special-cased
          if (typeof data[key] === 'string') localStorage.setItem(key, data[key]);
        } else {
          write(key, data[key]);
        }
      });
      return true;
    } catch (e) {
      console.error('Import error', e);
      return false;
    }
  }

  // ---- Public API ----

  return {
    getDogs: getDogs,
    getDog: getDog,
    saveDog: saveDog,
    archiveDog: archiveDog,
    restoreDog: restoreDog,
    deleteDog: deleteDog,
    getActiveDogs: getActiveDogs,
    getArchivedDogs: getArchivedDogs,
    getSlots: getSlots,
    setSlot: setSlot,
    removeSlot: removeSlot,
    getSlotsForWeek: getSlotsForWeek,
    getTimeSlots: getTimeSlots,
    saveTimeSlots: saveTimeSlots,
    getEquipment: getEquipment,
    saveEquipment: saveEquipment,
    exportAll: exportAll,
    importAll: importAll,
    getSheetsUrl: getSheetsUrl,
    setSheetsUrl: setSheetsUrl,
    syncFromSheets: syncFromSheets,
    pushAllToSheets: pushAllToSheets,
    testSheetsConnection: testSheetsConnection,
    autoIncrementWeekNumbers: autoIncrementWeekNumbers
  };
})();
