/* ============================================
   summary.js — Summary view (schedule by time slot)
   ============================================ */

window.FT = window.FT || {};

window.FT.Summary = (function () {
  'use strict';

  var selectedDayIndex = null; // auto-select today or Monday

  function render(container) {
    var monday = FT.Planner.getMonday() || FT.Calendar.getCurrentMonday();
    var dates = FT.Calendar.getWeekDates(monday);
    var timeSlots = FT.Storage.getTimeSlots();
    var dogs = FT.Storage.getActiveDogs();

    // Auto-select today if in this week, otherwise Monday
    if (selectedDayIndex === null) {
      selectedDayIndex = 0;
      dates.forEach(function (date, i) {
        if (FT.Calendar.isToday(date)) selectedDayIndex = i;
      });
    }

    // Clamp index
    if (selectedDayIndex >= dates.length) selectedDayIndex = 0;

    var selectedDate = dates[selectedDayIndex];
    var dateStr = FT.Calendar.formatDate(selectedDate, 'YYYY-MM-DD');
    var assignments = FT.Storage.getSlots(dateStr);

    var html = '';

    // Week range label
    html += '<div class="week-nav" style="margin-bottom:12px;">' +
      '<span class="week-nav__label">' + FT.Calendar.formatWeekRange(monday) + '</span>' +
    '</div>';

    // Day tabs
    html += '<div class="summary-day-tabs">';
    dates.forEach(function (date, i) {
      var isToday = FT.Calendar.isToday(date);
      html += '<button class="summary-day-tab' +
        (i === selectedDayIndex ? ' active' : '') +
        (isToday ? ' is-today' : '') +
        '" data-day-index="' + i + '">' +
        FT.Calendar.formatDate(date, 'Day DD Mon') +
        (isToday ? ' ★' : '') +
      '</button>';
    });
    html += '</div>';

    // Slot groups
    if (dogs.length === 0) {
      html += '<div class="empty-state">' +
        '<div class="empty-state__icon">&#128054;</div>' +
        '<div class="empty-state__title">No dogs in the planner</div>' +
        '<div class="empty-state__text">Add dogs in the Planner view to see the schedule here.</div>' +
      '</div>';
    } else {
      timeSlots.forEach(function (slot) {
        // Find dogs assigned to this slot on this date
        var assignedDogs = [];
        Object.keys(assignments).forEach(function (dogId) {
          if (assignments[dogId].slotId === slot.id) {
            var dog = FT.Storage.getDog(dogId);
            if (dog && !dog.archived) {
              assignedDogs.push(dog);
            }
          }
        });

        var hasConflict = assignedDogs.length > 1;

        html += '<div class="summary-slot-group">';
        html += '<div class="summary-slot-heading ' + slot.period +
          (hasConflict ? ' conflict' : '') + '">' +
          '<span>' + slot.label + '</span>' +
          '<span style="margin-left:auto;font-size:0.8rem;opacity:0.7;">' +
          assignedDogs.length + ' dog' + (assignedDogs.length !== 1 ? 's' : '') + '</span>' +
          (hasConflict ? '<span class="conflict-badge">Conflict</span>' : '') +
        '</div>';

        if (assignedDogs.length === 0) {
          html += '<div class="summary-empty">No dogs scheduled</div>';
        } else {
          assignedDogs.forEach(function (dog) {
            html += '<div class="summary-dog-item">' +
              '<span class="summary-dog-item__name">' + dog.name + '</span>' +
              (dog.breed ? '<span class="summary-dog-item__breed">(' + dog.breed + ')</span>' : '') +
              '<span>' + FT.Equipment.renderTags(dog.equipment) + '</span>' +
            '</div>';
          });
        }

        html += '</div>';
      });
    }

    container.innerHTML = html;

    // Wire up day tab clicks
    container.querySelectorAll('.summary-day-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        selectedDayIndex = parseInt(this.dataset.dayIndex);
        render(container);
      });
    });
  }

  function resetSelection() {
    selectedDayIndex = null;
  }

  return {
    render: render,
    resetSelection: resetSelection
  };
})();
