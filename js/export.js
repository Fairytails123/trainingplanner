/* ============================================
   export.js — PDF export / print week
   ============================================ */

window.FT = window.FT || {};

window.FT.Export = (function () {
  'use strict';

  /**
   * Export current week as PDF.
   */
  function exportWeekPDF() {
    if (typeof window.jspdf === 'undefined') {
      alert('PDF library is still loading. Please try again in a moment.');
      return;
    }

    var jsPDF = window.jspdf.jsPDF;
    var monday = FT.Planner.getMonday() || FT.Calendar.getCurrentMonday();
    var dates = FT.Calendar.getWeekDates(monday);
    var dogs = FT.Storage.getActiveDogs();
    var timeSlots = FT.Storage.getTimeSlots();
    var weekSlots = FT.Storage.getSlotsForWeek(dates);

    // Create PDF - landscape A4
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Fairy Tails K9 Centre — Training Schedule', 14, 15);

    // Subtitle
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Week of ' + FT.Calendar.formatWeekRange(monday), 14, 22);

    // Date generated
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Generated: ' + new Date().toLocaleString('en-GB'), 14, 27);
    doc.setTextColor(0);

    // Build table data
    var headers = ['Dog', 'Equipment'];
    dates.forEach(function (date) {
      headers.push(FT.Calendar.formatDate(date, 'Day DD Mon'));
    });

    var rows = [];
    dogs.forEach(function (dog) {
      var row = [];
      // Dog name + breed
      row.push(dog.name + (dog.breed ? '\n(' + dog.breed + ')' : ''));

      // Equipment
      var equipment = FT.Storage.getEquipment();
      var eqLabels = (dog.equipment || []).map(function (eqId) {
        var eq = equipment.find(function (e) { return e.id === eqId; });
        return eq ? eq.label : '';
      }).filter(Boolean).join(', ');
      row.push(eqLabels || '—');

      // Days
      dates.forEach(function (date) {
        var dateStr = FT.Calendar.formatDate(date, 'YYYY-MM-DD');
        var assignment = weekSlots[dateStr] && weekSlots[dateStr][dog.id];
        if (assignment && assignment.slotId) {
          var slot = timeSlots.find(function (s) { return s.id === assignment.slotId; });
          var label = slot ? slot.label : assignment.slotId;

          // Check for conflicts
          var conflicts = FT.Slots.getConflicts(dateStr, assignment.slotId, dog.id);
          if (conflicts.length > 0) {
            label += ' ⚠';
          }
          row.push(label);
        } else {
          row.push('—');
        }
      });

      rows.push(row);
    });

    if (rows.length === 0) {
      rows.push(['No dogs in planner', '', '', '', '', '', '']);
    }

    // Draw table using autoTable
    doc.autoTable({
      head: [headers],
      body: rows,
      startY: 32,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3,
        lineWidth: 0.1,
        lineColor: [200, 200, 200]
      },
      headStyles: {
        fillColor: [255, 111, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8
      },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: 35 }
      },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index >= 2) {
          var cellText = data.cell.text.join('');
          if (cellText && cellText !== '—') {
            // Colour AM/PM cells
            if (cellText.match(/^0[89]:|^1[012]:/)) {
              data.cell.styles.fillColor = [234, 243, 222]; // AM green
            } else if (cellText.match(/^1[3-7]:/)) {
              data.cell.styles.fillColor = [230, 241, 251]; // PM blue
            }
            // Conflict indicator
            if (cellText.indexOf('⚠') >= 0) {
              data.cell.styles.textColor = [244, 67, 54];
            }
          }
        }
      }
    });

    // Save
    var filename = 'ft-schedule-' + FT.Calendar.formatDate(monday, 'YYYY-MM-DD') + '.pdf';
    doc.save(filename);
  }

  return {
    exportWeekPDF: exportWeekPDF
  };
})();
