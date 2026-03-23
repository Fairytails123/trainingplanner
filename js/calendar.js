/* ============================================
   calendar.js — Date calculation logic
   ============================================ */

window.FT = window.FT || {};

window.FT.Calendar = (function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /**
   * Get the Monday of the week containing the given date.
   * Week starts on Monday (ISO standard).
   */
  function getMonday(date) {
    var d = new Date(date);
    var day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Get array of 5 Date objects (Mon–Fri) from a given Monday.
   */
  function getWeekDates(monday) {
    var dates = [];
    for (var i = 0; i < 5; i++) {
      var d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(d);
    }
    return dates;
  }

  /**
   * Format a date in the specified format.
   * Formats:
   *   'YYYY-MM-DD' → '2026-03-23'
   *   'DD Mon'     → '23 Mar'
   *   'Day DD Mon' → 'Mon 23 Mar'
   */
  function formatDate(date, format) {
    var d = new Date(date);
    var dd = String(d.getDate()).padStart(2, '0');
    var mon = MONTHS[d.getMonth()];
    var dayName = DAYS[d.getDay()];

    switch (format) {
      case 'YYYY-MM-DD':
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        return d.getFullYear() + '-' + mm + '-' + dd;

      case 'DD Mon':
        return dd + ' ' + mon;

      case 'Day DD Mon':
        return dayName + ' ' + dd + ' ' + mon;

      default:
        return d.toLocaleDateString('en-GB');
    }
  }

  /**
   * Check if a date is today.
   */
  function isToday(date) {
    return new Date(date).toDateString() === new Date().toDateString();
  }

  /**
   * Check if a date is in the past (before today).
   */
  function isPast(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  }

  /**
   * Navigate to the next/previous week.
   * direction: +1 for next week, -1 for previous week.
   */
  function navigateWeek(currentMonday, direction) {
    var d = new Date(currentMonday);
    d.setDate(d.getDate() + (7 * direction));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Check if a Monday represents the current week.
   */
  function isCurrentWeek(monday) {
    var thisMonday = getMonday(new Date());
    return monday.toDateString() === thisMonday.toDateString();
  }

  /**
   * Get the Monday of the current week.
   */
  function getCurrentMonday() {
    return getMonday(new Date());
  }

  /**
   * Format a week range label: "16 Mar – 20 Mar 2026"
   */
  function formatWeekRange(monday) {
    var friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    var monStr = formatDate(monday, 'DD Mon');
    var friStr = formatDate(friday, 'DD Mon');
    return monStr + ' – ' + friStr + ' ' + friday.getFullYear();
  }

  return {
    getMonday: getMonday,
    getWeekDates: getWeekDates,
    formatDate: formatDate,
    isToday: isToday,
    isPast: isPast,
    navigateWeek: navigateWeek,
    isCurrentWeek: isCurrentWeek,
    getCurrentMonday: getCurrentMonday,
    formatWeekRange: formatWeekRange,
    MONTHS: MONTHS,
    DAYS: DAYS
  };
})();
