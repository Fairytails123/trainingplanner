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
            var dog = FT.Storage.getDog(dogId);
            if (dog && !dog.archived) assignedDogs.push(dog);
          }
        });

        var hasConflict = assignedDogs.length > 1;

        html += '<div class="summary-slot-group">';
        html += '<div class="summary-slot-heading ' + slot.period +
          (hasConflict ? ' conflict' : '') + '">' +
          '<span>' + slot.label + '</span>' +
          '<span class="slot-count">' + assignedDogs.length + ' dog' + (assignedDogs.length !== 1 ? 's' : '') + '</span>' +
          (hasConflict ? '<span class="conflict-tag">Conflict</span>' : '') +
        '</div>';

        if (assignedDogs.length === 0) {
          html += '<div class="summary-empty">No dogs scheduled</div>';
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
