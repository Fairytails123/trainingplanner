/* ============================================
   storage.js — Data persistence layer
   localStorage + Google Sheets sync
   ============================================ */

window.FT = window.FT || {};

window.FT.Storage = (function () {
  'use strict';

  var DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzBzTZKpAHKidIsa653UWCo-TbUOgxCTbqyE69obmV2rij_0cJsnSsciOcZci564RrR/exec';

  var KEYS = {
    dogs: 'ft_dogs',
    configSlots: 'ft_config_timeslots',
    configEquipment: 'ft_config_equipment',
    sheetsUrl: 'ft_sheets_api_url'
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
   * Pull all data from Sheets and merge into localStorage.
   * Returns a Promise that resolves when done.
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

        // Merge dogs
        if (data.dogs && data.dogs.length > 0) {
          write(KEYS.dogs, data.dogs);
        }

        // Merge slot assignments by date
        if (data.slotsByDate) {
          Object.keys(data.slotsByDate).forEach(function (dateStr) {
            var existing = read(slotKey(dateStr)) || {};
            var fromSheets = data.slotsByDate[dateStr];
            // Sheets data wins (it's the shared source of truth)
            var merged = Object.assign({}, existing, fromSheets);
            write(slotKey(dateStr), merged);
          });
        }

        // Merge config
        if (data.timeSlots && data.timeSlots.length > 0) {
          write(KEYS.configSlots, data.timeSlots);
        }
        if (data.equipment && data.equipment.length > 0) {
          write(KEYS.configEquipment, data.equipment);
        }

        console.log('Synced from Sheets');
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

  function deleteDog(id) {
    var dogs = getDogs().filter(function (d) { return d.id !== id; });
    write(KEYS.dogs, dogs);
  }

  function getActiveDogs() {
    return getDogs()
      .filter(function (d) { return !d.archived; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
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
        data[key] = read(key);
      }
    }
    return JSON.stringify(data, null, 2);
  }

  function importAll(jsonStr) {
    try {
      var data = JSON.parse(jsonStr);
      Object.keys(data).forEach(function (key) {
        if (key.startsWith('ft_')) {
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
    deleteDog: deleteDog,
    getActiveDogs: getActiveDogs,
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
    testSheetsConnection: testSheetsConnection
  };
})();
