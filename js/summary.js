/* ============================================
   summary.js — Today/Schedule view (iOS style)
   ============================================ */

window.FT = window.FT || {};

window.FT.Summary = (function () {
  'use strict';

  var selectedDayIndex = null;

  function render(container) {
    var monday = FT.Planner.getMonday() || FT.Calendar.getCurrentMonday();
    var dates = FT.Calendar.getWeekDates(monday);
    var timeSlots = FT.Storage.getTimeSlots();
    var dogs = FT.Storage.getActiveDogs();

    if (selectedDayIndex === null) {
      selectedDayIndex = 0;
      dates.forEach(function (date, i) {
        if (FT.Calendar.isToday(date)) selectedDayIndex = i;
      });
    }
    if (selectedDayIndex >= dates.length) selectedDayIndex = 0;

    var selectedDate = dates[selectedDayIndex];
    var dateStr = FT.Calendar.formatDate(selectedDate, 'YYYY-MM-DD');
    var assignments = FT.Storage.getSlots(dateStr);

    // Day stats + kit-prep groups for the selected day (active dogs on
    // slots that still exist — stale ids render nowhere, so they must not count)
    var dogById = {};
    dogs.forEach(function (d) { dogById[d.id] = d; });
    var slotById = {};
    timeSlots.forEach(function (s) { slotById[s.id] = s; });
    var equipment = FT.Storage.getEquipment();
    var assignedDayDogs = [];
    var slotCounts = {};
    Object.keys(assignments).forEach(function (dogId) {
      var a = assignments[dogId];
      if (!a.slotId || !dogById[dogId] || !slotById[a.slotId]) return;
      assignedDayDogs.push(dogById[dogId]);
      slotCounts[a.slotId] = (slotCounts[a.slotId] || 0) + 1;
    });
    var dayConflicts = 0;
    Object.keys(slotCounts).forEach(function (sid) {
      if (slotCounts[sid] > 1) dayConflicts += slotCounts[sid];
    });
    var prepGroups = {};
    assignedDayDogs.forEach(function (dog) {
      (dog.equipment || []).forEach(function (eqId) {
        (prepGroups[eqId] = prepGroups[eqId] || []).push(dog.name);
      });
    });
    // rows and the tile must agree: both use only kit ids still in the config
    var prepEq = equipment.filter(function (eq) { return prepGroups[eq.id]; });

    var html = '';

    // Day strip
    html += '<div class="summary-day-tabs">';
    dates.forEach(function (date, i) {
      var isToday = FT.Calendar.isToday(date);
      var dayName = FT.Calendar.DAYS[date.getDay()];
      var dayNum = String(date.getDate()).padStart(2, '0');
      html += '<button class="summary-day-tab' +
        (i === selectedDayIndex ? ' active' : '') +
        (isToday ? ' is-today' : '') +
        '" data-day-index="' + i + '">' +
        '<span class="day-name">' + dayName + '</span>' +
        '<span class="day-num">' + dayNum + '</span>' +
      '</button>';
    });
    html += '</div>';

    // Print/Export action row
    html += '<div class="week-stepper" style="margin-top:0;">' +
      '<div style="font-size:13px; color: var(--text-3); font-weight:500;">' +
        FT.Calendar.formatDate(selectedDate, 'Day DD Mon') +
      '</div>' +
      '<button class="btn btn-secondary btn-sm" id="export-pdf-btn">Export week PDF</button>' +
    '</div>';

    if (dogs.length > 0) {
      // Day snapshot bar
      var offCount = dogs.length - assignedDayDogs.length;
      html += '<div class="snapshot" role="group" aria-label="Day overview">' +
        '<div class="snapshot__tile"><span class="snapshot__num">' + dogs.length + '</span><span class="snapshot__lbl">Dogs</span></div>' +
        '<div class="snapshot__tile snapshot__tile--ok"><span class="snapshot__num">' + assignedDayDogs.length + '</span><span class="snapshot__lbl">Training</span></div>' +
        '<div class="snapshot__tile' + (offCount > 0 ? ' snapshot__tile--warn' : '') + '"><span class="snapshot__num">' + offCount + '</span><span class="snapshot__lbl">Off</span></div>' +
        '<div class="snapshot__tile' + (dayConflicts > 0 ? ' snapshot__tile--conflict' : '') + '"><span class="snapshot__num">' + dayConflicts + '</span><span class="snapshot__lbl">Conflicts</span></div>' +
        '<div class="snapshot__tile snapshot__tile--brand"><span class="snapshot__num">' + prepEq.length + '</span><span class="snapshot__lbl">Kit items</span></div>' +
      '</div>';

      // Kit to prepare — grouped by equipment for the selected day
      html += '<div class="prep-card"><div class="prep-card__title">Kit to prepare</div>';
      if (prepEq.length === 0) {
        html += '<div class="prep-card__none">' +
          (assignedDayDogs.length === 0 ? 'No dogs scheduled this day.' : 'No kit needed for the scheduled dogs.') +
          '</div>';
      } else {
        prepEq.forEach(function (eq) {
          html += '<div class="prep-row">' + FT.Equipment.renderTags([eq.id]) +
            '<span class="prep-row__dogs">' + escapeHtml(prepGroups[eq.id].join(', ')) + '</span></div>';
        });
      }
      html += '</div>';
    }

    if (dogs.length === 0) {
      html += '<div class="empty-state">' +
        '<div class="empty-state__icon">🐾</div>' +
        '<div class="empty-state__title">No dogs in the planner</div>' +
        '<div class="empty-state__text">Add dogs in the Planner tab to see the schedule here.</div>' +
      '</div>';
    } else {
      timeSlots.forEach(function (slot) {
        var assignedDogs = [];
        Object.keys(assignments).forEach(function (dogId) {
          if (assignments[dogId].slotId === slot.id) {
            var dog = dogById[dogId]; // active dogs only — archived are not in the map
            if (dog) assignedDogs.push(dog);
          }
        });

        var hasConflict = assignedDogs.length > 1;

        html += '<div class="summary-slot-group">';
        html += '<div class="summary-slot-heading ' + slot.period +
          (hasConflict ? ' conflict' : '') + '">' +
          '<span>' + escapeHtml(slot.label) + '</span>' +
          '<span class="slot-count">' + assignedDogs.length + ' dog' + (assignedDogs.length !== 1 ? 's' : '') + '</span>' +
          (hasConflict ? '<span class="conflict-tag">Conflict</span>' : '') +
        '</div>';

        if (assignedDogs.length === 0) {
          html += '<div class="summary-empty">Free — no dogs scheduled</div>';
        } else {
          assignedDogs.forEach(function (dog) {
            html += '<div class="summary-dog-item">' +
              '<span class="summary-dog-item__name">' + escapeHtml(dog.name) + '</span>' +
              (dog.breed ? '<span class="summary-dog-item__breed">' + escapeHtml(dog.breed) + '</span>' : '') +
              (dog.weekNumber != null ? '<span class="summary-dog-item__week">Wk ' + dog.weekNumber + '</span>' : '') +
              '<span class="summary-dog-item__equipment">' + FT.Equipment.renderTags(dog.equipment) + '</span>' +
            '</div>';
          });
        }

        html += '</div>';
      });
    }

    container.innerHTML = html;

    container.querySelectorAll('.summary-day-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        selectedDayIndex = parseInt(this.dataset.dayIndex);
        render(container);
      });
    });

    var exportBtn = container.querySelector('#export-pdf-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        if (FT.Export && FT.Export.exportWeekPDF) FT.Export.exportWeekPDF();
      });
    }
  }

  function resetSelection() { selectedDayIndex = null; }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  return { render: render, resetSelection: resetSelection };
})();
