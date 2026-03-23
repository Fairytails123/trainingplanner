/* ============================================
   slots.js — Time slot component + conflict detection
   ============================================ */

window.FT = window.FT || {};

window.FT.Slots = (function () {
  'use strict';

  /**
   * Get conflicts for a given date and slot.
   * Returns array of dog objects that share the same slot on that date.
   */
  function getConflicts(dateStr, slotId, excludeDogId) {
    if (!slotId) return [];
    var assignments = FT.Storage.getSlots(dateStr);
    var conflicts = [];

    Object.keys(assignments).forEach(function (dogId) {
      if (dogId !== excludeDogId && assignments[dogId].slotId === slotId) {
        var dog = FT.Storage.getDog(dogId);
        if (dog && !dog.archived) {
          conflicts.push(dog);
        }
      }
    });

    return conflicts;
  }

  /**
   * Count total conflicts for a set of dates.
   */
  function countConflicts(dates) {
    var count = 0;
    var timeSlots = FT.Storage.getTimeSlots();

    dates.forEach(function (date) {
      var dateStr = FT.Calendar.formatDate(date, 'YYYY-MM-DD');
      var assignments = FT.Storage.getSlots(dateStr);
      var slotCounts = {};

      Object.keys(assignments).forEach(function (dogId) {
        var sid = assignments[dogId].slotId;
        if (sid) {
          slotCounts[sid] = (slotCounts[sid] || 0) + 1;
        }
      });

      Object.keys(slotCounts).forEach(function (sid) {
        if (slotCounts[sid] > 1) {
          count += slotCounts[sid];
        }
      });
    });

    return count;
  }

  /**
   * Render a slot pill HTML for a given assignment.
   */
  function renderPill(slotId, dateStr, dogId) {
    if (!slotId) {
      return '<span class="slot-empty" data-date="' + dateStr +
             '" data-dog="' + dogId + '">— No slot —</span>';
    }

    var timeSlots = FT.Storage.getTimeSlots();
    var slot = timeSlots.find(function (s) { return s.id === slotId; });
    if (!slot) {
      return '<span class="slot-empty" data-date="' + dateStr +
             '" data-dog="' + dogId + '">— No slot —</span>';
    }

    var conflicts = getConflicts(dateStr, slotId, dogId);
    var hasConflict = conflicts.length > 0;
    var conflictTitle = hasConflict
      ? conflicts.map(function (d) { return d.name; }).join(', ') + ' also booked'
      : '';

    return '<span class="slot-pill ' + slot.period +
           (hasConflict ? ' has-conflict' : '') +
           '" data-date="' + dateStr +
           '" data-dog="' + dogId +
           '"' + (hasConflict ? ' title="' + conflictTitle + '"' : '') +
           '>' + slot.shortLabel + '</span>';
  }

  /**
   * Render slot picker items for bottom sheet.
   */
  function renderPickerItems(dateStr, dogId, currentSlotId) {
    var timeSlots = FT.Storage.getTimeSlots();
    var html = '';

    // No slot option
    var noSlotSelected = !currentSlotId;
    html += '<div class="bottom-sheet__item' + (noSlotSelected ? ' selected' : '') +
            '" data-slot-id="">' +
            '<span class="bottom-sheet__item-label">— No slot —</span>' +
            (noSlotSelected ? '<span class="bottom-sheet__item-check">✓</span>' : '') +
            '</div>';

    // Group by period
    var lastPeriod = '';
    timeSlots.forEach(function (slot) {
      if (slot.period !== lastPeriod) {
        lastPeriod = slot.period;
        html += '<div class="bottom-sheet__section-header">' +
                (slot.period === 'am' ? 'Morning' : 'Afternoon') + '</div>';
      }

      var isSelected = currentSlotId === slot.id;
      var conflicts = getConflicts(dateStr, slot.id, dogId);
      var hasConflict = conflicts.length > 0;

      html += '<div class="bottom-sheet__item' + (isSelected ? ' selected' : '') +
              '" data-slot-id="' + slot.id + '">' +
              '<span class="bottom-sheet__item-pill ' + slot.period + '">' +
              slot.shortLabel + '</span>' +
              '<span class="bottom-sheet__item-label">' + slot.label + '</span>';

      if (hasConflict) {
        html += '<span class="bottom-sheet__conflict-warning">' +
                conflicts.map(function (d) { return d.name; }).join(', ') +
                '</span>';
      }

      if (isSelected) {
        html += '<span class="bottom-sheet__item-check">✓</span>';
      }

      html += '</div>';
    });

    return html;
  }

  /**
   * Open slot picker for a specific dog and date.
   */
  function openPicker(dateStr, dogId, currentSlotId, onSelect) {
    var dayLabel = FT.Calendar.formatDate(new Date(dateStr + 'T12:00:00'), 'Day DD Mon');
    var dog = FT.Storage.getDog(dogId);
    var title = (dog ? dog.name : 'Dog') + ' — ' + dayLabel;

    FT.Planner.openBottomSheet({
      title: title,
      content: renderPickerItems(dateStr, dogId, currentSlotId),
      onItemClick: function (el) {
        var slotId = el.dataset.slotId;
        if (slotId !== undefined) {
          FT.Storage.setSlot(dateStr, dogId, slotId || null);
          FT.Planner.closeBottomSheet();
          if (onSelect) onSelect(slotId || null);
        }
      }
    });
  }

  return {
    getConflicts: getConflicts,
    countConflicts: countConflicts,
    renderPill: renderPill,
    renderPickerItems: renderPickerItems,
    openPicker: openPicker
  };
})();
