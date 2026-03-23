/* ============================================
   equipment.js — Equipment multi-select component
   ============================================ */

window.FT = window.FT || {};

window.FT.Equipment = (function () {
  'use strict';

  /**
   * Render equipment tags HTML for a given array of equipment IDs.
   */
  function renderTags(selectedIds) {
    if (!selectedIds || selectedIds.length === 0) {
      return '<span class="equipment-tag" style="background:#F5F5F5;color:#9E9E9E;">None</span>';
    }

    var allEquipment = FT.Storage.getEquipment();
    var html = '';

    selectedIds.forEach(function (id) {
      var eq = allEquipment.find(function (e) { return e.id === id; });
      if (eq) {
        html += '<span class="equipment-tag" style="background:' + eq.colour +
                ';color:' + eq.textColour + ';">' + eq.label + '</span>';
      }
    });

    return html;
  }

  /**
   * Render an equipment picker (checklist) for use in bottom sheets or modals.
   * Returns an HTML string. Caller must wire up click events.
   */
  function renderPickerItems(selectedIds) {
    var allEquipment = FT.Storage.getEquipment();
    var html = '';

    allEquipment.forEach(function (eq) {
      var isSelected = selectedIds.indexOf(eq.id) >= 0;
      html += '<div class="bottom-sheet__item equipment-picker-item' +
              (isSelected ? ' selected' : '') +
              '" data-equipment-id="' + eq.id + '">' +
              '<span class="equipment-picker__item ' +
              (isSelected ? 'equipment-picker__item--selected' : 'equipment-picker__item--unselected') +
              '" style="background:' + (isSelected ? eq.colour : 'transparent') +
              ';color:' + eq.textColour + ';">' + eq.label + '</span>' +
              '<span class="bottom-sheet__item-check">' + (isSelected ? '✓' : '') + '</span>' +
              '</div>';
    });

    return html;
  }

  /**
   * Render equipment picker chips for modal forms.
   */
  function renderPickerChips(selectedIds) {
    var allEquipment = FT.Storage.getEquipment();
    var html = '<div class="equipment-picker">';

    allEquipment.forEach(function (eq) {
      var isSelected = selectedIds.indexOf(eq.id) >= 0;
      html += '<div class="equipment-picker__item ' +
              (isSelected ? 'equipment-picker__item--selected' : 'equipment-picker__item--unselected') +
              '" data-equipment-id="' + eq.id +
              '" style="background:' + (isSelected ? eq.colour : 'transparent') +
              ';color:' + eq.textColour + ';">' + eq.label + '</div>';
    });

    html += '</div>';
    return html;
  }

  /**
   * Open equipment picker bottom sheet for a dog.
   */
  function openPicker(dog, onSave) {
    var selectedIds = (dog.equipment || []).slice();

    FT.Planner.openBottomSheet({
      title: 'Equipment — ' + dog.name,
      content: renderPickerItems(selectedIds),
      onItemClick: function (el, rerender) {
        var id = el.dataset.equipmentId;
        if (!id) return;
        var idx = selectedIds.indexOf(id);
        if (idx >= 0) {
          selectedIds.splice(idx, 1);
        } else {
          selectedIds.push(id);
        }
        rerender(renderPickerItems(selectedIds));
      },
      onClose: function () {
        dog.equipment = selectedIds;
        FT.Storage.saveDog(dog);
        if (onSave) onSave();
      }
    });
  }

  return {
    renderTags: renderTags,
    renderPickerItems: renderPickerItems,
    renderPickerChips: renderPickerChips,
    openPicker: openPicker
  };
})();
