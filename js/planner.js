/* ============================================
   planner.js — Core planner (iOS-style mobile)
   ============================================ */

window.FT = window.FT || {};

window.FT.Planner = (function () {
  'use strict';

  var currentMonday = null;
  var expandedCards = {};
  var bottomSheetEl = null;
  var backdropEl = null;
  var bottomSheetCallbacks = {};

  function init(monday) {
    currentMonday = monday || FT.Calendar.getCurrentMonday();
  }

  function getMonday() { return currentMonday; }
  function setMonday(monday) { currentMonday = monday; }

  // ---- Bottom sheet ----
  function openBottomSheet(options) {
    closeBottomSheet();

    backdropEl = document.createElement('div');
    backdropEl.className = 'bottom-sheet-backdrop';
    backdropEl.addEventListener('click', closeBottomSheet);

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
    if (backdropEl) { backdropEl.remove(); backdropEl = null; }
    if (bottomSheetEl) { bottomSheetEl.remove(); bottomSheetEl = null; }
  }

  // ---- Modal ----
  function openModal(options) {
    var modalRoot = document.getElementById('modal-root');
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    var modal = document.createElement('div');
    modal.className = 'modal';

    var headerHtml = '<div class="modal__header">' +
      '<button class="modal__close modal__cancel" aria-label="Cancel">' + (options.cancelLabel || 'Cancel') + '</button>' +
      '<div class="modal__title">' + (options.title || '') + '</div>' +
      (options.saveLabel ? '<button class="modal__save" aria-label="Save">' + options.saveLabel + '</button>' : '<span></span>') +
      '</div>';

    modal.innerHTML =
      headerHtml +
      '<div class="modal__body">' + (options.body || '') + '</div>' +
      (options.footer ? '<div class="modal__footer">' + options.footer + '</div>' : '');

    backdrop.appendChild(modal);
    modal.addEventListener('click', function (e) { e.stopPropagation(); });
    backdrop.addEventListener('click', function () { backdrop.remove(); });
    modal.querySelector('.modal__close').addEventListener('click', function () { backdrop.remove(); });

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
        '<input type="text" class="form-input" id="dog-name" value="' + escapeAttr(editDog.name || '') + '" placeholder="e.g. Bella" required>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Breed</label>' +
        '<input type="text" class="form-input" id="dog-breed" value="' + escapeAttr(editDog.breed || '') + '" placeholder="e.g. Stafford Bull Terrier">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Owner name</label>' +
        '<input type="text" class="form-input" id="dog-owner" value="' + escapeAttr(editDog.ownerName || '') + '" placeholder="e.g. Sarah Jones">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Training week</label>' +
        '<input type="number" class="form-input" id="dog-week-number" min="0" value="' + (editDog.weekNumber != null ? editDog.weekNumber : '') + '" placeholder="Leave blank if not tracking">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Equipment defaults</label>' +
        '<div id="dog-equipment-picker">' + FT.Equipment.renderPickerChips(selectedEquipment) + '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Notes</label>' +
        '<textarea class="form-input" id="dog-notes" placeholder="Any additional notes...">' + escapeHtml(editDog.notes || '') + '</textarea>' +
      '</div>';

    var footer = isEdit ? '<button class="btn btn-danger" id="dog-archive">Archive dog</button>' : '';

    openModal({
      title: isEdit ? 'Edit Dog' : 'New Dog',
      saveLabel: isEdit ? 'Save' : 'Add',
      body: body,
      footer: footer,
      onMount: function (modal, close) {
        var pickerEl = modal.querySelector('#dog-equipment-picker');
        pickerEl.addEventListener('click', function (e) {
          var chip = e.target.closest('.equipment-picker__item');
          if (!chip) return;
          var eqId = chip.dataset.equipmentId;
          var idx = selectedEquipment.indexOf(eqId);
          if (idx >= 0) selectedEquipment.splice(idx, 1);
          else selectedEquipment.push(eqId);
          pickerEl.innerHTML = FT.Equipment.renderPickerChips(selectedEquipment);
        });

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

        modal.querySelector('.modal__save').addEventListener('click', function () {
          var name = modal.querySelector('#dog-name').value.trim();
          if (!name) {
            modal.querySelector('#dog-name').focus();
            modal.querySelector('#dog-name').style.boxShadow = 'inset 0 0 0 2px var(--red)';
            return;
          }

          editDog.name = name;
          editDog.breed = modal.querySelector('#dog-breed').value.trim();
          editDog.ownerName = modal.querySelector('#dog-owner').value.trim();
          editDog.equipment = selectedEquipment;
          editDog.notes = modal.querySelector('#dog-notes').value.trim();

          var weekVal = modal.querySelector('#dog-week-number').value.trim();
          if (weekVal !== '') {
            editDog.weekNumber = parseInt(weekVal) || 0;
            var today = new Date();
            var day = today.getDay();
            var diff = day === 0 ? -6 : 1 - day;
            var monday = new Date(today);
            monday.setDate(today.getDate() + diff);
            var mm = String(monday.getMonth() + 1).padStart(2, '0');
            var dd = String(monday.getDate()).padStart(2, '0');
            editDog.weekNumberSetDate = monday.getFullYear() + '-' + mm + '-' + dd;
          } else {
            editDog.weekNumber = null;
            editDog.weekNumberSetDate = null;
          }

          FT.Storage.saveDog(editDog);
          close();
          if (onSave) onSave();
        });

        setTimeout(function () { modal.querySelector('#dog-name').focus(); }, 120);
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

    var thisMonday = FT.Calendar.getCurrentMonday();
    var nextMonday = FT.Calendar.navigateWeek(thisMonday, 1);
    var isWeek1 = currentMonday.toDateString() === thisMonday.toDateString();
    var isWeek2 = currentMonday.toDateString() === nextMonday.toDateString();

    var html = '';

    // Segmented week selector
    html += '<div class="segmented">' +
      '<button class="segmented__item' + (isWeek1 ? ' active' : '') + '" data-week="1">' +
        'This week' +
        '<span class="seg-sub">' + FT.Calendar.formatDate(thisMonday, 'DD Mon') + ' – ' + FT.Calendar.formatDate(FT.Calendar.getWeekDates(thisMonday)[4], 'DD Mon') + '</span>' +
      '</button>' +
      '<button class="segmented__item' + (isWeek2 ? ' active' : '') + '" data-week="2">' +
        'Next week' +
        '<span class="seg-sub">' + FT.Calendar.formatDate(nextMonday, 'DD Mon') + ' – ' + FT.Calendar.formatDate(FT.Calendar.getWeekDates(nextMonday)[4], 'DD Mon') + '</span>' +
      '</button>' +
    '</div>';

    // Stepper
    html += '<div class="week-stepper">' +
      '<button class="stepper-btn" data-nav="-1" aria-label="Previous week">‹</button>' +
      '<div class="week-stepper__label">' + FT.Calendar.formatWeekRange(currentMonday) + '</div>' +
      '<button class="stepper-btn" data-nav="1" aria-label="Next week">›</button>' +
    '</div>';

    // Conflict banner
    if (conflictCount > 0) {
      html += '<div class="conflict-banner">' +
        '<span class="dot"></span>' +
        conflictCount + ' booking conflict' + (conflictCount > 1 ? 's' : '') + ' this week — tap a red pill to resolve.' +
      '</div>';
    }

    if (dogs.length === 0) {
      html += renderEmptyState();
    } else {
      html += '<div class="dog-cards">' + renderCards(dogs, dates, weekSlots) + '</div>';
    }

    // Floating action button
    html += '<button class="fab" id="fab-add-dog" aria-label="Add dog">+</button>';

    container.innerHTML = html;
    wireUpEvents(container, dates, dogs);
  }

  function renderEmptyState() {
    return '<div class="empty-state">' +
      '<div class="empty-state__icon">🐶</div>' +
      '<div class="empty-state__title">No dogs yet</div>' +
      '<div class="empty-state__text">Add your first dog to start planning training slots.</div>' +
      '<button class="btn btn-primary" id="empty-add-dog">+ Add Dog</button>' +
    '</div>';
  }

  function renderCards(dogs, dates, weekSlots) {
    var html = '';

    dogs.forEach(function (dog, dogIdx) {
      var isExpanded = expandedCards[dog.id];
      if (isExpanded === undefined) isExpanded = dogIdx < 3;

      html += '<div class="dog-card' + (isExpanded ? ' expanded' : '') + '" data-dog-id="' + dog.id + '">';

      var wkNum = dog.weekNumber != null ? dog.weekNumber : '';
      html += '<div class="dog-card__header">' +
        '<span class="dog-card__chevron">›</span>' +
        '<span class="dog-card__name">' +
          '<span class="dog-card__name-text">' + escapeHtml(dog.name) + '</span>' +
          (dog.breed ? '<span class="dog-card__breed">· ' + escapeHtml(dog.breed) + '</span>' : '') +
        '</span>' +
        (wkNum !== '' ? '<span class="dog-card__week-badge" data-week-dog="' + dog.id + '" title="Training week (tap to edit)">Wk ' + wkNum + '</span>' : '<span></span>') +
        '<button class="dog-card__menu" data-edit-dog="' + dog.id + '" aria-label="Edit dog">✎</button>' +
      '</div>';

      html += '<div class="dog-card__body">';

      html += '<div class="dog-card__equipment">' +
        '<span class="dog-card__equipment-label">Kit</span>' +
        FT.Equipment.renderTags(dog.equipment) +
        '<button class="equipment-change-btn" data-equip-dog="' + dog.id + '">Change</button>' +
      '</div>';

      dates.forEach(function (date) {
        var dateStr = FT.Calendar.formatDate(date, 'YYYY-MM-DD');
        var dayName = FT.Calendar.DAYS[date.getDay()];
        var ddmon = FT.Calendar.formatDate(date, 'DD Mon');
        var isDateToday = FT.Calendar.isToday(date);
        var isPastDate = FT.Calendar.isPast(date);
        var assignment = weekSlots[dateStr] && weekSlots[dateStr][dog.id];
        var slotId = assignment ? assignment.slotId : null;

        html += '<div class="day-row' +
          (isDateToday ? ' day-row--today' : '') +
          (isPastDate ? ' day-row--past' : '') + '">' +
          '<span class="day-row__label">' + dayName +
            '<span class="day-row__date">' + ddmon + '</span>' +
          '</span>' +
          '<div class="day-row__slot">' +
            FT.Slots.renderPill(slotId, dateStr, dog.id) +
          '</div>' +
        '</div>';
      });

      html += '</div></div>';
    });

    return html;
  }

  function wireUpEvents(container, dates, dogs) {
    container.querySelectorAll('.segmented__item').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var week = parseInt(this.dataset.week);
        var thisMonday = FT.Calendar.getCurrentMonday();
        currentMonday = week === 2 ? FT.Calendar.navigateWeek(thisMonday, 1) : thisMonday;
        updateHash();
        render(container);
      });
    });

    container.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = parseInt(this.dataset.nav);
        currentMonday = FT.Calendar.navigateWeek(currentMonday, dir);
        updateHash();
        render(container);
      });
    });

    var addBtn = container.querySelector('#fab-add-dog') || container.querySelector('#empty-add-dog');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        openDogModal(null, function () { render(container); });
      });
    }

    container.querySelectorAll('.dog-card__header').forEach(function (header) {
      header.addEventListener('click', function (e) {
        if (e.target.closest('[data-edit-dog]') || e.target.closest('[data-week-dog]')) return;
        var card = this.closest('.dog-card');
        var dogId = card.dataset.dogId;
        var wasExpanded = card.classList.contains('expanded');
        expandedCards[dogId] = !wasExpanded;
        card.classList.toggle('expanded');
      });
    });

    container.querySelectorAll('[data-edit-dog]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dogId = this.dataset.editDog;
        var dog = FT.Storage.getDog(dogId);
        if (dog) openDogModal(dog, function () { render(container); });
      });
    });

    container.querySelectorAll('[data-week-dog]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var dogId = this.dataset.weekDog;
        var dog = FT.Storage.getDog(dogId);
        if (!dog) return;
        var current = dog.weekNumber != null ? dog.weekNumber : '';
        var newVal = prompt('Training week for ' + dog.name + ':', current);
        if (newVal === null) return;
        newVal = newVal.trim();
        if (newVal === '') {
          dog.weekNumber = null;
          dog.weekNumberSetDate = null;
        } else {
          dog.weekNumber = parseInt(newVal) || 0;
          var today = new Date();
          var day = today.getDay();
          var diff = day === 0 ? -6 : 1 - day;
          var monday = new Date(today);
          monday.setDate(today.getDate() + diff);
          var mm = String(monday.getMonth() + 1).padStart(2, '0');
          var dd = String(monday.getDate()).padStart(2, '0');
          dog.weekNumberSetDate = monday.getFullYear() + '-' + mm + '-' + dd;
        }
        FT.Storage.saveDog(dog);
        render(container);
      });
    });

    container.querySelectorAll('[data-equip-dog]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dogId = this.dataset.equipDog;
        var dog = FT.Storage.getDog(dogId);
        if (dog) FT.Equipment.openPicker(dog, function () { render(container); });
      });
    });

    container.querySelectorAll('.slot-pill, .slot-empty').forEach(function (pill) {
      pill.addEventListener('click', function (e) {
        e.stopPropagation();
        var dateStr = this.dataset.date;
        var dogId = this.dataset.dog;
        var assignment = FT.Storage.getSlots(dateStr)[dogId];
        var currentSlotId = assignment ? assignment.slotId : null;

        FT.Slots.openPicker(dateStr, dogId, currentSlotId, function () { render(container); });
      });
    });

    // Swipe navigation
    var startX = 0, startY = 0;
    container.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    container.addEventListener('touchend', function (e) {
      var endX = e.changedTouches[0].clientX;
      var endY = e.changedTouches[0].clientY;
      var diffX = endX - startX;
      var diffY = endY - startY;
      if (Math.abs(diffX) > 80 && Math.abs(diffX) > Math.abs(diffY) * 2) {
        currentMonday = FT.Calendar.navigateWeek(currentMonday, diffX < 0 ? 1 : -1);
        updateHash();
        render(container);
      }
    }, { passive: true });
  }

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

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(str) { return escapeHtml(str); }

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
