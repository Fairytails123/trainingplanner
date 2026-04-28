/* ============================================
   settings.js — Admin settings panel (iOS style)
   ============================================ */

window.FT = window.FT || {};

window.FT.Settings = (function () {
  'use strict';

  function render(container) {
    var timeSlots = FT.Storage.getTimeSlots();
    var equipment = FT.Storage.getEquipment();
    var sheetsUrl = FT.Storage.getSheetsUrl();

    var html = '';

    // Sync section
    html += '<div class="settings-section">';
    html += '<div class="settings-section__title">Sync</div>';
    html += '<div class="settings-section__body">';
    html += '<div class="settings-link-row" id="sync-now-row">' +
      '<div>' +
        '<div class="settings-link-row__label">Sync with Google Sheets</div>' +
        '<div class="settings-link-row__sub">Push & pull all dogs and slot assignments</div>' +
      '</div>' +
      '<span class="settings-link-row__chev" id="sync-status">›</span>' +
    '</div>';
    html += '<div class="settings-row" style="padding:12px 12px;">' +
      '<input type="text" class="form-input" id="sheets-url" value="' + escapeAttr(sheetsUrl || '') + '" placeholder="Sheets API URL" style="flex:1;">' +
      '<button class="btn btn-secondary btn-sm" id="save-url-btn">Save</button>' +
    '</div>';
    html += '</div></div>';

    // Time Slots
    html += '<div class="settings-section">';
    html += '<div class="settings-section__title">Time Slots</div>';
    html += '<div class="settings-section__body" id="settings-slots">';
    timeSlots.forEach(function (slot, i) {
      html += '<div class="settings-row" data-slot-index="' + i + '">' +
        '<input type="text" class="form-input" style="flex:2;" value="' + escapeAttr(slot.label) + '" data-field="label" placeholder="08:00 – 09:00">' +
        '<input type="text" class="form-input" style="flex:1;" value="' + escapeAttr(slot.shortLabel) + '" data-field="shortLabel" placeholder="08–09">' +
        '<select class="form-input" style="flex:0 0 64px;" data-field="period">' +
          '<option value="am"' + (slot.period === 'am' ? ' selected' : '') + '>AM</option>' +
          '<option value="pm"' + (slot.period === 'pm' ? ' selected' : '') + '>PM</option>' +
        '</select>' +
        '<button class="settings-row__delete" data-delete-slot="' + i + '" aria-label="Delete">×</button>' +
      '</div>';
    });
    html += '</div>';
    html += '<div class="settings-actions">' +
      '<button class="btn btn-secondary btn-sm" id="add-slot-btn">+ Add slot</button>' +
      '<button class="btn btn-primary btn-sm" id="save-slots-btn">Save slots</button>' +
    '</div>';
    html += '</div>';

    // Equipment
    html += '<div class="settings-section">';
    html += '<div class="settings-section__title">Equipment</div>';
    html += '<div class="settings-section__body" id="settings-equipment">';
    equipment.forEach(function (eq, i) {
      html += '<div class="settings-row" data-equip-index="' + i + '">' +
        '<input type="text" class="form-input" style="flex:2;" value="' + escapeAttr(eq.label) + '" data-field="label" placeholder="Muzzle">' +
        '<input type="color" class="settings-row__colour" value="' + eq.colour + '" data-field="colour" title="Background">' +
        '<input type="color" class="settings-row__colour" value="' + eq.textColour + '" data-field="textColour" title="Text">' +
        '<button class="settings-row__delete" data-delete-equip="' + i + '" aria-label="Delete">×</button>' +
      '</div>';
    });
    html += '</div>';
    html += '<div class="settings-actions">' +
      '<button class="btn btn-secondary btn-sm" id="add-equip-btn">+ Add item</button>' +
      '<button class="btn btn-primary btn-sm" id="save-equip-btn">Save equipment</button>' +
    '</div>';
    html += '</div>';

    // Data
    html += '<div class="settings-section">';
    html += '<div class="settings-section__title">Data</div>';
    html += '<div class="settings-section__body">';
    html += '<div class="settings-link-row" id="export-json-row">' +
      '<div><div class="settings-link-row__label">Export all data (JSON)</div>' +
      '<div class="settings-link-row__sub">Download backup of dogs, slots, settings</div></div>' +
      '<span class="settings-link-row__chev">›</span>' +
    '</div>';
    html += '<div class="settings-link-row" id="import-json-row">' +
      '<div><div class="settings-link-row__label">Import data from JSON</div>' +
      '<div class="settings-link-row__sub">Restore from a backup file</div></div>' +
      '<span class="settings-link-row__chev">›</span>' +
    '</div>';
    html += '</div></div>';

    container.innerHTML = html;
    wireUpEvents(container);
  }

  function wireUpEvents(container) {
    // Sync
    var syncRow = container.querySelector('#sync-now-row');
    if (syncRow) {
      syncRow.addEventListener('click', function () {
        var statusEl = container.querySelector('#sync-status');
        if (statusEl) statusEl.textContent = 'Syncing…';
        FT.Storage.pushAllToSheets(function () {
          FT.Storage.syncFromSheets(function (ok) {
            if (statusEl) statusEl.textContent = ok ? '✓' : '!';
            showToast(ok ? 'Synced with Google Sheets' : 'Sync failed');
            setTimeout(function () { if (statusEl) statusEl.textContent = '›'; }, 1500);
          });
        });
      });
    }

    var saveUrlBtn = container.querySelector('#save-url-btn');
    if (saveUrlBtn) {
      saveUrlBtn.addEventListener('click', function () {
        var url = container.querySelector('#sheets-url').value.trim();
        FT.Storage.setSheetsUrl(url);
        showToast('Sheets URL saved');
      });
    }

    // Slot delete
    container.querySelectorAll('[data-delete-slot]').forEach(function (btn) {
      btn.addEventListener('click', function () { this.closest('.settings-row').remove(); });
    });
    var addSlotBtn = container.querySelector('#add-slot-btn');
    if (addSlotBtn) {
      addSlotBtn.addEventListener('click', function () {
        var slotsEl = container.querySelector('#settings-slots');
        var newId = 'slot_' + Date.now();
        var row = document.createElement('div');
        row.className = 'settings-row';
        row.dataset.slotIndex = slotsEl.querySelectorAll('.settings-row').length;
        row.dataset.newSlotId = newId;
        row.innerHTML =
          '<input type="text" class="form-input" style="flex:2;" data-field="label" placeholder="12:00 – 13:00">' +
          '<input type="text" class="form-input" style="flex:1;" data-field="shortLabel" placeholder="12–13">' +
          '<select class="form-input" style="flex:0 0 64px;" data-field="period"><option value="am">AM</option><option value="pm">PM</option></select>' +
          '<button class="settings-row__delete">×</button>';
        row.querySelector('.settings-row__delete').addEventListener('click', function () { row.remove(); });
        slotsEl.appendChild(row);
      });
    }
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

    // Equipment
    container.querySelectorAll('[data-delete-equip]').forEach(function (btn) {
      btn.addEventListener('click', function () { this.closest('.settings-row').remove(); });
    });
    var addEquipBtn = container.querySelector('#add-equip-btn');
    if (addEquipBtn) {
      addEquipBtn.addEventListener('click', function () {
        var equipEl = container.querySelector('#settings-equipment');
        var newId = 'equip_' + Date.now();
        var row = document.createElement('div');
        row.className = 'settings-row';
        row.dataset.equipIndex = equipEl.querySelectorAll('.settings-row').length;
        row.dataset.newEquipId = newId;
        row.innerHTML =
          '<input type="text" class="form-input" style="flex:2;" data-field="label" placeholder="Whistle">' +
          '<input type="color" class="settings-row__colour" value="#E0E0E0" data-field="colour">' +
          '<input type="color" class="settings-row__colour" value="#333333" data-field="textColour">' +
          '<button class="settings-row__delete">×</button>';
        row.querySelector('.settings-row__delete').addEventListener('click', function () { row.remove(); });
        equipEl.appendChild(row);
      });
    }
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

    // Export JSON
    var exportRow = container.querySelector('#export-json-row');
    if (exportRow) {
      exportRow.addEventListener('click', function () {
        var data = FT.Storage.exportAll();
        var blob = new Blob([data], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ft-training-planner-' + new Date().toISOString().slice(0,10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }

    // Import JSON
    var importRow = container.querySelector('#import-json-row');
    if (importRow) {
      importRow.addEventListener('click', function () {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', function () {
          var file = input.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            if (FT.Storage.importAll(reader.result)) {
              showToast('Imported successfully');
              setTimeout(function () { window.location.reload(); }, 700);
            } else {
              showToast('Import failed');
            }
          };
          reader.readAsText(file);
        });
        input.click();
      });
    }
  }

  function showToast(message) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 300);
    }, 1800);
  }

  function escapeAttr(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  return { render: render };
})();
