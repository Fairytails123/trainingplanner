/**
 * ============================================
 * Fairy Tails K9 — Training Planner
 * Google Apps Script (paste into your Google Sheet)
 * ============================================
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet named "FT Training Planner Data"
 * 2. Create 4 tabs with these EXACT names and headers in row 1:
 *
 *    Tab: Dogs
 *    Headers: id | name | breed | ownerName | equipment | notes | archived | createdAt | updatedAt
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
 * 3. Go to Extensions → Apps Script
 * 4. Delete any default code and paste this entire file
 * 5. Click Deploy → New deployment
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

// ---- Helpers ----

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
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
      obj[headers[j]] = (val === '' || val === null || val === undefined) ? '' : String(val);
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

// ---- GET handlers ----

function handleGetAll() {
  var dogsSheet = getSheet('Dogs');
  var assignSheet = getSheet('Assignments');
  var slotsSheet = getSheet('Config_Slots');
  var equipSheet = getSheet('Config_Equipment');

  var dogs = dogsSheet ? sheetToObjects(dogsSheet) : [];
  var assignments = assignSheet ? sheetToObjects(assignSheet) : [];
  var timeSlots = slotsSheet ? sheetToObjects(slotsSheet) : [];
  var equipment = equipSheet ? sheetToObjects(equipSheet) : [];

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

  return {
    success: true,
    dogs: dogs,
    slotsByDate: slotsByDate,
    timeSlots: timeSlots,
    equipment: equipment
  };
}

// ---- POST handlers ----

function handleSaveDog(dog) {
  var sheet = getSheet('Dogs');
  var headers = getHeaders(sheet);
  var equipStr = Array.isArray(dog.equipment) ? dog.equipment.join(',') : (dog.equipment || '');
  var now = new Date().toISOString();

  var rowData = headers.map(function(h) {
    if (h === 'equipment') return equipStr;
    if (h === 'archived') return String(dog.archived || false);
    if (h === 'updatedAt') return now;
    return dog[h] || '';
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
  if (data.dogs) {
    var dogsSheet = getSheet('Dogs');
    if (dogsSheet.getLastRow() > 1) {
      dogsSheet.getRange(2, 1, dogsSheet.getLastRow() - 1, dogsSheet.getLastColumn()).clearContent();
    }
    var dogHeaders = getHeaders(dogsSheet);
    data.dogs.forEach(function(dog) {
      var equipStr = Array.isArray(dog.equipment) ? dog.equipment.join(',') : (dog.equipment || '');
      var row = dogHeaders.map(function(h) {
        if (h === 'equipment') return equipStr;
        if (h === 'archived') return String(dog.archived || false);
        return dog[h] || '';
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
