/* ============================================
   settings.js — Admin settings panel
   ============================================ */

window.FT = window.FT || {};

window.FT.Settings = (function () {
  'use strict';

  function render(container) {
    var timeSlots = FT.Storage.getTimeSlots();
    var equipment = FT.Storage.getEquipment();

    var html = '';
    var sheetsUrl = FT.Storage.getSheetsUrl();

    // ---- Google Sheets Sync Section ----
    html += '<div class="settings-section">';
    html += '<div class="settings-section__title">Google Sheets Sync</div>';
    html += '<div class="settings-section__body">';
    html += '<div class="form-group">' +
      '<label class="form-label">Apps Script Web App URL</label>' +
      '<input type="url" class="form-input" id="sheets-url" value="' + (sheetsUrl || '') + '" placeholder="https://script.google.com/macros/s/...">' +
    '</div>';
    html += '<div id="sheets-status" style="font-size:0.85rem;margin-bottom:12px;"></div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-secondary btn-sm" id="test-sheets-btn">Test Connection</button>' +
      '<button class="btn btn-secondary btn-sm" id="sync-pull-btn">Pull from Sheets</button>' +
      '<button class="btn btn-primary btn-sm" id="sync-push-btn">Push All to Sheets</button>' +
    '</div>';
    html += '<p style="margin-top:12px;font-size:0.8rem;color:var(--text-tertiary);">Enter the URL from your deployed Google Apps Script. The display TV and planner will share data through this sheet.</p>';
    html += '</div>';
    html += '</div>';

    // ---- Time Slots Section ----
    html += '<div class="settings-section">';
    html += '<div class="settings-section__title">Time Slots</div>';
    html += '<div class="settings-section__body" id="settings-slots">';

    timeSlots.forEach(function (slot, i) {
      html += '<div class="settings-row" data-slot-index="' + i + '">' +
        '<input type="text" class="form-input" style="flex:2;" value="' + slot.label + '" data-field="label" placeholder="e.g. 08:00 – 09:00">' +
        '<input type="text" class="form-input" style="flex:1;" value="' + slot.shortLabel + '" data-field="shortLabel" placeholder="e.g. 08–09">' +
        '<select class="form-input" style="flex:1;" data-field="period">' +
          '<option value="am"' + (slot.period === 'am' ? ' selected' : '') + '>AM</option>' +
          '<option value="pm"' + (slot.period === 'pm' ? ' selected' : '') + '>PM</option>' +
        '</select>' +
        '<button class="btn-icon settings-row__delete" data-delete-slot="' + i + '" aria-label="Delete slot">&times;</button>' +
      '</div>';
    });

    html += '</div>';
    html += '<div class="settings-actions">' +
      '<button class="btn btn-secondary btn-sm" id="add-slot-btn">+ Add Slot</button>' +
      '<button class="btn btn-primary btn-sm" id="save-slots-btn">Save Slots</button>' +
    '</div>';
    html += '</div>';

    // ---- Equipment Section ----
    html += '<div class="settings-section">';
    html += '<div class="settings-section__title">Equipment</div>';
    html += '<div class="settings-section__body" id="settings-equipment">';

    equipment.forEach(function (eq, i) {
      html += '<div class="settings-row" data-equip-index="' + i + '">' +
        '<input type="text" class="form-input" style="flex:2;" value="' + eq.label + '" data-field="label" placeholder="e.g. Muzzle">' +
        '<input type="color" class="settings-row__colour" value="' + eq.colour + '" data-field="colour" title="Background colour">' +
        '<input type="color" class="settings-row__colour" value="' + eq.textColour + '" data-field="textColour" title="Text colour">' +
        '<button class="btn-icon settings-row__delete" data-delete-equip="' + i + '" aria-label="Delete equipment">&times;</button>' +
      '</div>';
    });

    html += '</div>';
    html += '<div class="settings-actions">' +
      '<button class="btn btn-secondary btn-sm" id="add-equip-btn">+ Add Equipment</button>' +
      '<button class="btn btn-primary btn-sm" id="save-equip-btn">Save Equipment</button>' +
    '</div>';
    html += '</div>';

    // ---- Data Management Section ----
    html += '<div class="settings-section">';
    html += '<div class="settings-section__title">Data Management</div>';
    html += '<div class="settings-section__body">';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button class="btn btn-secondary btn-sm" id="export-data-btn">Export Data (JSON)</button>' +
      '<button class="btn btn-secondary btn-sm" id="import-data-btn">Import Data</button>' +
      '<input type="file" id="import-file" accept=".json" style="display:none;">' +
    '</div>';
    html += '<p style="margin-top:12px;font-size:0.8rem;color:var(--text-tertiary);">Export saves all planner data as a JSON file. Import replaces current data.</p>';
    html += '</div>';
    html += '</div>';

    container.innerHTML = html;
    wireUpEvents(container);
  }

  function wireUpEvents(container) {
    // ---- Sheets sync events ----

    var sheetsUrlInput = container.querySelector('#sheets-url');
    var sheetsStatus = container.querySelector('#sheets-status');

    // Save URL on blur
    if (sheetsUrlInput) {
      sheetsUrlInput.addEventListener('change', function () {
        FT.Storage.setSheetsUrl(this.value.trim());
        sheetsStatus.innerHTML = '<span style="color:var(--text-secondary);">URL saved.</span>';
      });
    }

    // Test connection
    var testBtn = container.querySelector('#test-sheets-btn');
    if (testBtn) {
      testBtn.addEventListener('click', function () {
        var url = sheetsUrlInput.value.trim();
        if (!url) {
          sheetsStatus.innerHTML = '<span style="color:var(--conflict-red);">Please enter a URL first.</span>';
          return;
        }
        FT.Storage.setSheetsUrl(url);
        sheetsStatus.innerHTML = '<span style="color:var(--text-secondary);">Testing...</span>';
        FT.Storage.testSheetsConnection(url, function (success, message) {
          if (success) {
            sheetsStatus.innerHTML = '<span style="color:#27500A;">&#10003; ' + message + '</span>';
          } else {
            sheetsStatus.innerHTML = '<span style="color:var(--conflict-red);">&#10007; Failed: ' + message + '</span>';
          }
        });
      });
    }

    // Pull from Sheets
    var pullBtn = container.querySelector('#sync-pull-btn');
    if (pullBtn) {
      pullBtn.addEventListener('click', function () {
        sheetsStatus.innerHTML = '<span style="color:var(--text-secondary);">Pulling data from Sheets...</span>';
        FT.Storage.syncFromSheets(function (success) {
          if (success) {
            sheetsStatus.innerHTML = '<span style="color:#27500A;">&#10003; Data pulled successfully. Reload to see changes.</span>';
          } else {
            sheetsStatus.innerHTML = '<span style="color:var(--conflict-red);">&#10007; Pull failed. Check URL and try again.</span>';
          }
        });
      });
    }

    // Push all to Sheets
    var pushBtn = container.querySelector('#sync-push-btn');
    if (pushBtn) {
      pushBtn.addEventListener('click', function () {
        if (!confirm('This will overwrite all data in the Google Sheet with your local data. Continue?')) return;
        sheetsStatus.innerHTML = '<span style="color:var(--text-secondary);">Pushing all data to Sheets...</span>';
        FT.Storage.pushAllToSheets(function (success) {
          if (success) {
            sheetsStatus.innerHTML = '<span style="color:#27500A;">&#10003; All data pushed to Sheets.</span>';
          } else {
            sheetsStatus.innerHTML = '<span style="color:var(--conflict-red);">&#10007; Push failed. Check URL and try again.</span>';
          }
        });
      });
    }

    // ---- Slot events ----

    // Delete slot
    container.querySelectorAll('[data-delete-slot]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.dataset.deleteSlot);
        var row = this.closest('.settings-row');
        row.remove();
      });
    });

    // Add slot
    var addSlotBtn = container.querySelector('#add-slot-btn');
    if (addSlotBtn) {
      addSlotBtn.addEventListener('click', function () {
        var slotsEl = container.querySelector('#settings-slots');
        var idx = slotsEl.querySelectorAll('.settings-row').length;
        var newId = 'slot_' + Date.now();
        var row = document.createElement('div');
        row.className = 'settings-row';
        row.dataset.slotIndex = idx;
        row.dataset.newSlotId = newId;
        row.innerHTML =
          '<input type="text" class="form-input" style="flex:2;" value="" data-field="label" placeholder="e.g. 12:00 – 13:00">' +
          '<input type="text" class="form-input" style="flex:1;" value="" data-field="shortLabel" placeholder="e.g. 12–13">' +
          '<select class="form-input" style="flex:1;" data-field="period">' +
            '<option value="am">AM</option><option value="pm">PM</option>' +
          '</select>' +
          '<button class="btn-icon settings-row__delete" aria-label="Delete slot">&times;</button>';
        row.querySelector('.settings-row__delete').addEventListener('click', function () { row.remove(); });
        slotsEl.appendChild(row);
      });
    }

    // Save slots
    var saveSlotsBtn = container.querySelector('#save-slots-btn');
    if (saveSlotsBtn) {
      saveSlotsBtn.addEventListener('click', function () {
        var existingSlots = FT.Storage.getTimeSlots();
        var rows = container.querySelectorAll('#settings-slots .settings-row');
        var newSlots = [];

        rows.forEach(function (row, i) {
          var label = row.querySelector('[data-field="label"]').value.trim();
          var shortLabel = row.querySelector('[data-field="shortLabel"]').value.trim();
          var period = row.querySelector('[data-field="period"]').value;

          if (!label) return;

          var origIdx = parseInt(row.dataset.slotIndex);
          var id = row.dataset.newSlotId || (existingSlots[origIdx] ? existingSlots[origIdx].id : 'slot_' + Date.now() + '_' + i);

          newSlots.push({ id: id, label: label, shortLabel: shortLabel || label, period: period });
        });

        FT.Storage.saveTimeSlots(newSlots);
        showToast('Time slots saved');
      });
    }

    // ---- Equipment events ----

    // Delete equipment
    container.querySelectorAll('[data-delete-equip]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = this.closest('.settings-row');
        row.remove();
      });
    });

    // Add equipment
    var addEquipBtn = container.querySelector('#add-equip-btn');
    if (addEquipBtn) {
      addEquipBtn.addEventListener('click', function () {
        var equipEl = container.querySelector('#settings-equipment');
        var idx = equipEl.querySelectorAll('.settings-row').length;
        var newId = 'equip_' + Date.now();
        var row = document.createElement('div');
        row.className = 'settings-row';
        row.dataset.equipIndex = idx;
        row.dataset.newEquipId = newId;
        row.innerHTML =
          '<input type="text" class="form-input" style="flex:2;" value="" data-field="label" placeholder="e.g. Whistle">' +
          '<input type="color" class="settings-row__colour" value="#E0E0E0" data-field="colour" title="Background colour">' +
          '<input type="color" class="settings-row__colour" value="#333333" data-field="textColour" title="Text colour">' +
          '<button class="btn-icon settings-row__delete" aria-label="Delete equipment">&times;</button>';
        row.querySelector('.settings-row__delete').addEventListener('click', function () { row.remove(); });
        equipEl.appendChild(row);
      });
    }

    // Save equipment
    var saveEquipBtn = container.querySelector('#save-equip-btn');
    if (saveEquipBtn) {
      saveEquipBtn.addEventListener('click', function () {
        var existingEquip = FT.Storage.getEquipment();
        var rows = container.querySelectorAll('#settings-equipment .settings-row');
        var newEquip = [];

        rows.forEach(function (row, i) {
          var label = row.querySelector('[data-field="label"]').value.trim();
          var colour = row.querySelector('[data-field="colour"]').value;
          var textColour = row.querySelector('[data-field="textColour"]').value;

          if (!label) return;

          var origIdx = parseInt(row.dataset.equipIndex);
          var id = row.dataset.newEquipId || (existingEquip[origIdx] ? existingEquip[origIdx].id : 'equip_' + Date.now() + '_' + i);

          newEquip.push({ id: id, label: label, colour: colour, textColour: textColour });
        });

        FT.Storage.saveEquipment(newEquip);
        showToast('Equipment saved');
      });
    }

    // ---- Data Management ----

    var exportBtn = container.querySelector('#export-data-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var data = FT.Storage.exportAll();
        var blob = new Blob([data], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ft-planner-backup-' + FT.Calendar.formatDate(new Date(), 'YYYY-MM-DD') + '.json';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    var importBtn = container.querySelector('#import-data-btn');
    var importFile = container.querySelector('#import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', function () {
        importFile.click();
      });
      importFile.addEventListener('change', function () {
        var file = this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          if (confirm('This will replace all current data. Are you sure?')) {
            if (FT.Storage.importAll(e.target.result)) {
              showToast('Data imported successfully');
              render(container);
            } else {
              showToast('Import failed — invalid file');
            }
          }
        };
        reader.readAsText(file);
      });
    }
  }

  function showToast(message) {
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
      'background:#333;color:#fff;padding:10px 20px;border-radius:20px;font-size:0.85rem;' +
      'z-index:2000;opacity:0;transition:opacity 0.3s;';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.style.opacity = '1'; });
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, 2000);
  }

  return {
    render: render
  };
})();
