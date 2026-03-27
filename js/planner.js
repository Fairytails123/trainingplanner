/* ============================================
   planner.js — Core planner grid rendering
   ============================================ */

window.FT = window.FT || {};

window.FT.Planner = (function () {
  'use strict';

  var currentMonday = null;
  var expandedCards = {};
  var bottomSheetEl = null;
  var backdropEl = null;
  var bottomSheetCallbacks = {};
  var isDesktop = window.matchMedia('(min-width: 768px)').matches;

  // Track desktop dropdown
  var activeDropdown = null;

  window.matchMedia('(min-width: 768px)').addEventListener('change', function (e) {
    isDesktop = e.matches;
    closeBottomSheet();
    closeDropdown();
    render(document.getElementById('app-content'));
  });

  function init(monday) {
    currentMonday = monday || FT.Calendar.getCurrentMonday();
  }

  function getMonday() {
    return currentMonday;
  }

  function setMonday(monday) {
    currentMonday = monday;
  }

  // ---- Bottom Sheet ----

  function openBottomSheet(options) {
    if (isDesktop && options.anchorEl) {
      openDropdown(options);
      return;
    }

    closeBottomSheet();

    backdropEl = document.createElement('div');
    backdropEl.className = 'bottom-sheet-backdrop';
    backdropEl.addEventListener('click', function () {
      closeBottomSheet();
    });

    bottomSheetEl = document.createElement('div');
    bottomSheetEl.className = 'bottom-sheet';
    bottomSheetEl.innerHTML =
      '<div class="bottom-sheet__handle"></div>' +
      '<div class="bottom-sheet__title">' + (options.title || '') + '</div>' +
      '<div class="bottom-sheet__content">' + (options.content || '') + '</div>';

    bottomSheetCallbacks = {
      onItemClick: options.onItemClick,
      onClose: options.onClose
    };

    // Wire up item clicks
    var content = bottomSheetEl.querySelector('.bottom-sheet__content');
    content.addEventListener('click', function (e) {
      var item = e.target.closest('.bottom-sheet__item');
      if (item && options.onItemClick) {
        options.onItemClick(item, function (newContent) {
          content.innerHTML = newContent;
        });
      }
    });

    document.getElementById('modal-root').appendChild(backdropEl);
    document.getElementById('modal-root').appendChild(bottomSheetEl);

    // Trigger animation
    requestAnimationFrame(function () {
      backdropEl.classList.add('visible');
      bottomSheetEl.classList.add('open');
    });
  }

  function closeBottomSheet() {
    if (bottomSheetCallbacks.onClose) {
      bottomSheetCallbacks.onClose();
      bottomSheetCallbacks = {};
    }

    if (backdropEl) {
      backdropEl.remove();
      backdropEl = null;
    }
    if (bottomSheetEl) {
      bottomSheetEl.remove();
      bottomSheetEl = null;
    }
  }

  // ---- Desktop Dropdown ----

  function openDropdown(options) {
    closeDropdown();

    var rect = options.anchorEl.getBoundingClientRect();

    activeDropdown = document.createElement('div');
    activeDropdown.className = 'slot-dropdown';
    activeDropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    activeDropdown.style.left = Math.max(8, rect.left + window.scrollX) + 'px';
    activeDropdown.innerHTML = options.content;

    activeDropdown.addEventListener('click', function (e) {
      var item = e.target.closest('.bottom-sheet__item, .slot-dropdown__item');
      if (item && options.onItemClick) {
        options.onItemClick(item, function (newContent) {
          activeDropdown.innerHTML = newContent;
        });
      }
    });

    // Store close callback
    activeDropdown._onClose = options.onClose;

    document.body.appendChild(activeDropdown);

    // Close on outside click
    setTimeout(function () {
      document.addEventListener('click', handleDropdownOutsideClick);
    }, 0);
  }

  function handleDropdownOutsideClick(e) {
    if (activeDropdown && !activeDropdown.contains(e.target)) {
      closeDropdown();
    }
  }

  function closeDropdown() {
    document.removeEventListener('click', handleDropdownOutsideClick);
    if (activeDropdown) {
      if (activeDropdown._onClose) activeDropdown._onClose();
      activeDropdown.remove();
      activeDropdown = null;
    }
  }

  // ---- Modal ----

  function openModal(options) {
    var modalRoot = document.getElementById('modal-root');
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML =
      '<div class="modal__header">' +
        '<h2 class="modal__title">' + (options.title || '') + '</h2>' +
        '<button class="modal__close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="modal__body">' + (options.body || '') + '</div>' +
      '<div class="modal__footer">' + (options.footer || '') + '</div>';

    backdrop.appendChild(modal);

    // Prevent closing on modal click
    modal.addEventListener('click', function (e) { e.stopPropagation(); });

    // Close on backdrop click
    backdrop.addEventListener('click', function () {
      backdrop.remove();
    });

    // Close button
    modal.querySelector('.modal__close').addEventListener('click', function () {
      backdrop.remove();
    });

    // Escape key
    var escHandler = function (e) {
      if (e.key === 'Escape') {
        backdrop.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    modalRoot.appendChild(backdrop);

    if (options.onMount) {
      options.onMount(modal, function () { backdrop.remove(); });
    }

    return { close: function () { backdrop.remove(); } };
  }

  // ---- Add/Edit Dog Modal ----

  function openDogModal(dog, onSave) {
    var isEdit = !!dog;
    var editDog = dog ? Object.assign({}, dog) : { name: '', breed: '', ownerName: '', equipment: [], notes: '' };
    var selectedEquipment = (editDog.equipment || []).slice();

    var body =
      '<div class="form-group">' +
        '<label class="form-label">Dog name <span class="required">*</span></label>' +
        '<input type="text" class="form-input" id="dog-name" value="' + (editDog.name || '') + '" placeholder="e.g. Bella" required>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Breed</label>' +
        '<input type="text" class="form-input" id="dog-breed" value="' + (editDog.breed || '') + '" placeholder="e.g. Stafford Bull Terrier">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Owner name</label>' +
        '<input type="text" class="form-input" id="dog-owner" value="' + (editDog.ownerName || '') + '" placeholder="e.g. Sarah Jones">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Equipment defaults</label>' +
        '<div id="dog-equipment-picker">' + FT.Equipment.renderPickerChips(selectedEquipment) + '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Notes</label>' +
        '<textarea class="form-input" id="dog-notes" placeholder="Any additional notes...">' + (editDog.notes || '') + '</textarea>' +
      '</div>';

    var footer =
      (isEdit ? '<button class="btn btn-danger btn-sm" id="dog-archive">Archive</button>' : '') +
      '<button class="btn btn-secondary" id="dog-cancel">Cancel</button>' +
      '<button class="btn btn-primary" id="dog-save">' + (isEdit ? 'Save' : 'Add Dog') + '</button>';

    openModal({
      title: isEdit ? 'Edit Dog' : 'Add Dog',
      body: body,
      footer: footer,
      onMount: function (modal, close) {
        // Equipment picker
        var pickerEl = modal.querySelector('#dog-equipment-picker');
        pickerEl.addEventListener('click', function (e) {
          var chip = e.target.closest('.equipment-picker__item');
          if (!chip) return;
          var eqId = chip.dataset.equipmentId;
          var idx = selectedEquipment.indexOf(eqId);
          if (idx >= 0) {
            selectedEquipment.splice(idx, 1);
          } else {
            selectedEquipment.push(eqId);
          }
          pickerEl.innerHTML = FT.Equipment.renderPickerChips(selectedEquipment);
        });

        // Cancel
        modal.querySelector('#dog-cancel').addEventListener('click', close);

        // Archive
        var archiveBtn = modal.querySelector('#dog-archive');
        if (archiveBtn) {
          archiveBtn.addEventListener('click', function () {
            if (confirm('Archive ' + editDog.name + '? The dog will be hidden from the planner.')) {
              FT.Storage.archiveDog(editDog.id);
              close();
              if (onSave) onSave();
            }
          });
        }

        // Save
        modal.querySelector('#dog-save').addEventListener('click', function () {
          var name = modal.querySelector('#dog-name').value.trim();
          if (!name) {
            modal.querySelector('#dog-name').focus();
            modal.querySelector('#dog-name').style.borderColor = 'var(--conflict-red)';
            return;
          }

          editDog.name = name;
          editDog.breed = modal.querySelector('#dog-breed').value.trim();
          editDog.ownerName = modal.querySelector('#dog-owner').value.trim();
          editDog.equipment = selectedEquipment;
          editDog.notes = modal.querySelector('#dog-notes').value.trim();

          FT.Storage.saveDog(editDog);
          close();
          if (onSave) onSave();
        });

        // Auto focus name field
        setTimeout(function () {
          modal.querySelector('#dog-name').focus();
        }, 100);
      }
    });
  }

  // ---- Render ----

  function render(container) {
    if (!currentMonday) init();
    var dates = FT.Calendar.getWeekDates(currentMonday);
    var dogs = FT.Storage.getActiveDogs();
    var weekSlots = FT.Storage.getSlotsForWeek(dates);
    var conflictCount = FT.Slots.countConflicts(dates);

    // Week 1 / Week 2 tabs
    var thisMonday = FT.Calendar.getCurrentMonday();
    var nextMonday = FT.Calendar.navigateWeek(thisMonday, 1);
    var isWeek1 = currentMonday.toDateString() === thisMonday.toDateString();
    var isWeek2 = currentMonday.toDateString() === nextMonday.toDateString();

    var html = '';

    // Week tabs
    html += '<div class="week-tabs">' +
      '<button class="week-tab' + (isWeek1 ? ' active' : '') + '" data-week="1">Week 1: ' +
      FT.Calendar.formatDate(thisMonday, 'DD Mon') + ' – ' +
      FT.Calendar.formatDate(FT.Calendar.getWeekDates(thisMonday)[4], 'DD Mon') + '</button>' +
      '<button class="week-tab' + (isWeek2 ? ' active' : '') + '" data-week="2">Week 2: ' +
      FT.Calendar.formatDate(nextMonday, 'DD Mon') + ' – ' +
      FT.Calendar.formatDate(FT.Calendar.getWeekDates(nextMonday)[4], 'DD Mon') + '</button>' +
      '</div>';

    // Week navigation
    html += '<div class="week-nav">' +
      '<div class="week-nav__arrows">' +
        '<button class="btn-icon" data-nav="-1" aria-label="Previous week">&#9664;</button>' +
        '<span class="week-nav__label">' + FT.Calendar.formatWeekRange(currentMonday) + '</span>' +
        '<button class="btn-icon" data-nav="1" aria-label="Next week">&#9654;</button>' +
        (conflictCount > 0 ? '<span class="conflict-badge">' + conflictCount + ' conflict' + (conflictCount > 1 ? 's' : '') + '</span>' : '') +
      '</div>' +
      '<div class="week-nav__actions">' +
        '<button class="btn btn-secondary btn-sm" id="sync-btn" title="Sync with Google Sheets">&#8635; Sync</button>' +
        '<button class="btn btn-primary btn-sm" id="add-dog-btn">+ Add Dog</button>' +
      '</div>' +
    '</div>';

    if (dogs.length === 0) {
      html += renderEmptyState();
    } else {
      // Mobile cards
      html += '<div class="dog-cards">' + renderCards(dogs, dates, weekSlots) + '</div>';
      // Desktop table
      html += '<div class="planner-table-wrap">' + renderTable(dogs, dates, weekSlots) + '</div>';
    }

    container.innerHTML = html;
    wireUpEvents(container, dates, dogs);
  }

  function renderEmptyState() {
    return '<div class="empty-state">' +
      '<div class="empty-state__icon">&#128054;</div>' +
      '<div class="empty-state__title">No dogs yet</div>' +
      '<div class="empty-state__text">Add your first dog to start planning training slots.</div>' +
      '<button class="btn btn-primary" id="empty-add-dog">+ Add Dog</button>' +
    '</div>';
  }

  // ---- Mobile Cards ----

  function renderCards(dogs, dates, weekSlots) {
    var html = '';

    dogs.forEach(function (dog) {
      var isExpanded = expandedCards[dog.id] !== false; // default expanded for first 3
      if (expandedCards[dog.id] === undefined && dogs.indexOf(dog) < 3) {
        isExpanded = true;
      } else if (expandedCards[dog.id] === undefined) {
        isExpanded = false;
      }

      html += '<div class="dog-card' + (isExpanded ? ' expanded' : '') + '" data-dog-id="' + dog.id + '">';

      // Header
      html += '<div class="dog-card__header">' +
        '<span class="dog-card__chevron">&#9658;</span>' +
        '<span class="dog-card__name">' + dog.name +
          (dog.breed ? '<span class="dog-card__breed">— ' + dog.breed + '</span>' : '') +
        '</span>' +
        '<button class="btn-icon dog-card__menu" data-edit-dog="' + dog.id + '" aria-label="Edit dog">&#9998;</button>' +
      '</div>';

      // Body
      html += '<div class="dog-card__body">';

      // Equipment row
      html += '<div class="dog-card__equipment">' +
        '<span class="dog-card__equipment-label">Equipment:</span>' +
        FT.Equipment.renderTags(dog.equipment) +
        '<button class="equipment-change-btn" data-equip-dog="' + dog.id + '">Change</button>' +
      '</div>';

      // Day rows
      dates.forEach(function (date) {
        var dateStr = FT.Calendar.formatDate(date, 'YYYY-MM-DD');
        var dayLabel = FT.Calendar.formatDate(date, 'Day DD Mon');
        var isDateToday = FT.Calendar.isToday(date);
        var isPastDate = FT.Calendar.isPast(date);
        var assignment = weekSlots[dateStr] && weekSlots[dateStr][dog.id];
        var slotId = assignment ? assignment.slotId : null;

        html += '<div class="day-row' +
          (isDateToday ? ' day-row--today' : '') +
          (isPastDate ? ' day-row--past' : '') + '">' +
          '<span class="day-row__label">' + (isDateToday ? '★ ' : '') + dayLabel + '</span>' +
          '<div class="day-row__slot">' +
            FT.Slots.renderPill(slotId, dateStr, dog.id) +
          '</div>' +
        '</div>';
      });

      html += '</div>'; // body
      html += '</div>'; // card
    });

    return html;
  }

  // ---- Desktop Table ----

  function renderTable(dogs, dates, weekSlots) {
    var html = '<table class="planner-table">';

    // Header
    html += '<thead><tr>';
    html += '<th class="col-dog">Dog</th>';
    html += '<th class="col-equipment">Equipment</th>';

    dates.forEach(function (date) {
      var isDateToday = FT.Calendar.isToday(date);
      html += '<th class="' + (isDateToday ? 'col-today' : '') + '">' +
        FT.Calendar.formatDate(date, 'Day DD Mon') + '</th>';
    });

    html += '</tr></thead>';

    // Body
    html += '<tbody>';
    dogs.forEach(function (dog) {
      html += '<tr>';

      // Dog name cell
      html += '<td class="cell-dog">' + dog.name +
        (dog.breed ? '<br><small style="color:var(--text-secondary);font-weight:400;">' + dog.breed + '</small>' : '') +
        '<br><button class="btn-sm btn-secondary" style="margin-top:4px;font-size:0.7rem;" data-edit-dog="' + dog.id + '">Edit</button>' +
      '</td>';

      // Equipment cell
      html += '<td class="cell-equipment">' +
        FT.Equipment.renderTags(dog.equipment) +
        '<br><button class="equipment-change-btn" style="margin-top:4px;" data-equip-dog="' + dog.id + '">Change</button>' +
      '</td>';

      // Day cells
      dates.forEach(function (date) {
        var dateStr = FT.Calendar.formatDate(date, 'YYYY-MM-DD');
        var isDateToday = FT.Calendar.isToday(date);
        var isPastDate = FT.Calendar.isPast(date);
        var assignment = weekSlots[dateStr] && weekSlots[dateStr][dog.id];
        var slotId = assignment ? assignment.slotId : null;

        html += '<td class="' +
          (isDateToday ? 'cell-today' : '') +
          (isPastDate ? ' cell-past' : '') + '">' +
          FT.Slots.renderPill(slotId, dateStr, dog.id) +
        '</td>';
      });

      html += '</tr>';
    });
    html += '</tbody></table>';

    return html;
  }

  // ---- Event Wiring ----

  function wireUpEvents(container, dates, dogs) {
    // Week tab clicks
    container.querySelectorAll('.week-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var week = parseInt(this.dataset.week);
        var thisMonday = FT.Calendar.getCurrentMonday();
        currentMonday = week === 2 ? FT.Calendar.navigateWeek(thisMonday, 1) : thisMonday;
        updateHash();
        render(container);
      });
    });

    // Week navigation arrows
    container.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = parseInt(this.dataset.nav);
        currentMonday = FT.Calendar.navigateWeek(currentMonday, dir);
        updateHash();
        render(container);
      });
    });

    // Add dog button
    var addBtn = container.querySelector('#add-dog-btn') || container.querySelector('#empty-add-dog');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openDogModal(null, function () { render(container); });
      });
    }

    // Sync button
    var syncBtn = container.querySelector('#sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
        FT.Storage.pushAllToSheets(function () {
          FT.Storage.syncFromSheets(function () {
            syncBtn.textContent = '\u21BB Synced!';
            setTimeout(function () {
              render(container);
            }, 800);
          });
        });
      });
    }

    // Card header expand/collapse
    container.querySelectorAll('.dog-card__header').forEach(function (header) {
      header.addEventListener('click', function (e) {
        if (e.target.closest('[data-edit-dog]')) return;
        var card = this.closest('.dog-card');
        var dogId = card.dataset.dogId;
        var wasExpanded = card.classList.contains('expanded');
        expandedCards[dogId] = !wasExpanded;
        card.classList.toggle('expanded');
      });
    });

    // Edit dog buttons
    container.querySelectorAll('[data-edit-dog]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dogId = this.dataset.editDog;
        var dog = FT.Storage.getDog(dogId);
        if (dog) {
          openDogModal(dog, function () { render(container); });
        }
      });
    });

    // Equipment change buttons
    container.querySelectorAll('[data-equip-dog]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dogId = this.dataset.equipDog;
        var dog = FT.Storage.getDog(dogId);
        if (dog) {
          FT.Equipment.openPicker(dog, function () { render(container); });
        }
      });
    });

    // Slot pill / empty slot clicks
    container.querySelectorAll('.slot-pill, .slot-empty').forEach(function (pill) {
      pill.addEventListener('click', function (e) {
        e.stopPropagation();
        var dateStr = this.dataset.date;
        var dogId = this.dataset.dog;
        var assignment = FT.Storage.getSlots(dateStr)[dogId];
        var currentSlotId = assignment ? assignment.slotId : null;

        FT.Slots.openPicker(dateStr, dogId, currentSlotId, function () {
          render(container);
        });
      });
    });

    // Touch swipe for week navigation
    var startX = 0;
    var startY = 0;
    container.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchend', function (e) {
      var endX = e.changedTouches[0].clientX;
      var endY = e.changedTouches[0].clientY;
      var diffX = endX - startX;
      var diffY = endY - startY;

      // Only trigger on horizontal swipe (not vertical scroll)
      if (Math.abs(diffX) > 80 && Math.abs(diffX) > Math.abs(diffY) * 2) {
        if (diffX < 0) {
          // Swipe left → next week
          currentMonday = FT.Calendar.navigateWeek(currentMonday, 1);
        } else {
          // Swipe right → previous week
          currentMonday = FT.Calendar.navigateWeek(currentMonday, -1);
        }
        updateHash();
        render(container);
      }
    }, { passive: true });
  }

  // ---- URL Hash ----

  function updateHash() {
    var dateStr = FT.Calendar.formatDate(currentMonday, 'YYYY-MM-DD');
    window.location.hash = 'week=' + dateStr;
  }

  function loadFromHash() {
    var hash = window.location.hash;
    if (hash && hash.indexOf('week=') >= 0) {
      var dateStr = hash.split('week=')[1];
      if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        var d = new Date(dateStr + 'T12:00:00');
        if (!isNaN(d.getTime())) {
          currentMonday = FT.Calendar.getMonday(d);
          return;
        }
      }
    }
    currentMonday = FT.Calendar.getCurrentMonday();
  }

  return {
    init: init,
    render: render,
    getMonday: getMonday,
    setMonday: setMonday,
    openBottomSheet: openBottomSheet,
    closeBottomSheet: closeBottomSheet,
    openModal: openModal,
    openDogModal: openDogModal,
    loadFromHash: loadFromHash,
    updateHash: updateHash
  };
})();
