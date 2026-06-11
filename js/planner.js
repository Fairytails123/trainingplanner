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
  var activeFilter = 'all';   // all | unassigned | conflicts | am | pm | kit
  var searchQuery = '';

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
      '<div class="bottom-sheet__title">' + escapeHtml(options.title || '') + '</div>' +
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
      if (window.gsap) {
        // GSAP owns the slide-in (CSS transition suppressed by .gsap-anim);
        // without GSAP the plain class toggle below animates via CSS
        bottomSheetEl.classList.add('gsap-anim');
        bottomSheetEl.classList.add('open');
        var centred = window.matchMedia('(min-width: 600px)').matches;
        window.gsap.fromTo(bottomSheetEl,
          { y: window.innerHeight, xPercent: centred ? -50 : 0 },
          { y: 0, xPercent: centred ? -50 : 0, duration: 0.5, ease: 'power4.out' });
      } else {
        bottomSheetEl.classList.add('open');
      }
    });
  }

  function closeBottomSheet() {
    if (bottomSheetCallbacks.onClose) {
      bottomSheetCallbacks.onClose();
      bottomSheetCallbacks = {};
    }
    var sheet = bottomSheetEl;
    var backdrop = backdropEl;
    bottomSheetEl = null;
    backdropEl = null;
    if (!sheet) {
      if (backdrop) backdrop.remove();
      return;
    }
    if (window.gsap) {
      if (backdrop) backdrop.classList.remove('visible');
      window.gsap.killTweensOf(sheet); // a close mid-open must not fight the open tween
      window.gsap.to(sheet, {
        y: window.innerHeight, duration: 0.32, ease: 'power3.in',
        onComplete: function () { sheet.remove(); if (backdrop) backdrop.remove(); }
      });
    } else {
      sheet.remove();
      if (backdrop) backdrop.remove();
    }
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

    // every close path must also drop the document-level Escape listener,
    // or one orphaned handler accumulates per modal open on touch devices
    function closeModal() {
      document.removeEventListener('keydown', escHandler);
      backdrop.remove();
    }
    var escHandler = function (e) {
      if (e.key === 'Escape') closeModal();
    };

    backdrop.appendChild(modal);
    modal.addEventListener('click', function (e) { e.stopPropagation(); });
    backdrop.addEventListener('click', closeModal);
    modal.querySelector('.modal__close').addEventListener('click', closeModal);
    document.addEventListener('keydown', escHandler);

    modalRoot.appendChild(backdrop);

    if (options.onMount) {
      options.onMount(modal, closeModal);
    }

    return { close: closeModal };
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

  // ---- Quick notes sheet (same dog.notes field as the Edit Dog modal) ----
  function openNotesSheet(dogId, onSave) {
    var dog = FT.Storage.getDog(dogId);
    if (!dog) return;
    openBottomSheet({
      title: 'Notes — ' + dog.name,
      content: '<div class="notes-sheet">' +
        '<textarea class="form-input" id="notes-sheet-input" placeholder="Handling, behaviour, reminders…">' + escapeHtml(dog.notes || '') + '</textarea>' +
        '<button class="btn btn-primary btn--full" id="notes-sheet-save">Save notes</button>' +
        '</div>'
    });
    var saveBtn = document.getElementById('notes-sheet-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        // re-read the dog so only notes change — a sync may have updated other fields
        var fresh = FT.Storage.getDog(dogId) || dog;
        fresh.notes = document.getElementById('notes-sheet-input').value.trim();
        FT.Storage.saveDog(fresh);
        closeBottomSheet();
        if (FT.Settings && FT.Settings.toast) FT.Settings.toast('Notes saved');
        if (onSave) onSave();
      });
    }
  }

  // ---- Week info / snapshot / filter logic (pure; exercised by smoke tests) ----
  function buildSlotMap(timeSlots) {
    var map = {};
    timeSlots.forEach(function (s) { map[s.id] = s; });
    return map;
  }

  function getDogWeekInfo(dog, dates, weekSlots, slotMap, activeIds) {
    var info = { assignedDays: 0, am: false, pm: false, conflict: false,
                 todayInWeek: false, todaySlot: null, todayConflict: false };
    dates.forEach(function (date) {
      var dateStr = FT.Calendar.formatDate(date, 'YYYY-MM-DD');
      var isToday = FT.Calendar.isToday(date);
      if (isToday) info.todayInWeek = true;
      var day = weekSlots[dateStr] || {};
      var a = day[dog.id];
      if (!a || !a.slotId) return;
      info.assignedDays++;
      var slot = slotMap[a.slotId];
      if (slot && slot.period === 'am') info.am = true;
      if (slot && slot.period === 'pm') info.pm = true;
      var conflicted = Object.keys(day).some(function (otherId) {
        return otherId !== dog.id && activeIds[otherId] && day[otherId].slotId === a.slotId;
      });
      if (conflicted) info.conflict = true;
      if (isToday) {
        info.todaySlot = slot || null;
        info.todayConflict = conflicted;
      }
    });
    return info;
  }

  function computeSnapshot(dogs, infoById, conflictCount) {
    var snap = { total: dogs.length, today: 0, unassigned: 0,
                 conflicts: conflictCount, kit: 0, todayInWeek: false };
    var kitIds = {};
    dogs.forEach(function (dog) {
      var info = infoById[dog.id];
      if (!info) return;
      if (info.todayInWeek) snap.todayInWeek = true;
      if (info.todaySlot) snap.today++;
      if (info.assignedDays === 0) snap.unassigned++;
      var training = info.todayInWeek ? !!info.todaySlot : info.assignedDays > 0;
      if (training) {
        (dog.equipment || []).forEach(function (id) { kitIds[id] = true; });
      }
    });
    snap.kit = Object.keys(kitIds).length;
    return snap;
  }

  function dogMatchesFilter(dog, info, filter) {
    switch (filter) {
      case 'unassigned': return info.assignedDays === 0;
      case 'conflicts': return info.conflict;
      case 'am': return info.am;
      case 'pm': return info.pm;
      case 'kit': return (dog.equipment || []).length > 0;
      default: return true;
    }
  }

  function dogMatchesSearch(dog, query) {
    if (!query) return true;
    var q = query.toLowerCase();
    return [dog.name, dog.breed, dog.ownerName].some(function (v) {
      return String(v || '').toLowerCase().indexOf(q) >= 0;
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

    // One pass over the week per dog: feeds the snapshot bar, the filter
    // chips, the card status badges and the header conflict dots
    var slotMap = buildSlotMap(FT.Storage.getTimeSlots());
    var activeIds = {};
    dogs.forEach(function (d) { activeIds[d.id] = true; });
    var infoById = {};
    dogs.forEach(function (d) { infoById[d.id] = getDogWeekInfo(d, dates, weekSlots, slotMap, activeIds); });
    var snap = computeSnapshot(dogs, infoById, conflictCount);

    var html = '';

    // Today snapshot bar
    html += '<div class="snapshot" role="group" aria-label="Week overview">' +
      '<div class="snapshot__tile"><span class="snapshot__num">' + snap.total + '</span><span class="snapshot__lbl">Dogs</span></div>' +
      (snap.todayInWeek
        ? '<div class="snapshot__tile snapshot__tile--ok"><span class="snapshot__num">' + snap.today + '</span><span class="snapshot__lbl">Today</span></div>'
        : '') +
      '<button class="snapshot__tile' + (snap.unassigned > 0 ? ' snapshot__tile--warn' : '') + '" data-snap-filter="unassigned"><span class="snapshot__num">' + snap.unassigned + '</span><span class="snapshot__lbl">Unassigned</span></button>' +
      '<button class="snapshot__tile' + (snap.conflicts > 0 ? ' snapshot__tile--conflict' : '') + '" data-snap-filter="conflicts"><span class="snapshot__num">' + snap.conflicts + '</span><span class="snapshot__lbl">Conflicts</span></button>' +
      '<div class="snapshot__tile snapshot__tile--brand"><span class="snapshot__num">' + snap.kit + '</span><span class="snapshot__lbl">Kit ' + (snap.todayInWeek ? 'today' : 'this week') + '</span></div>' +
    '</div>';

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
        conflictCount + ' booking conflict' + (conflictCount > 1 ? 's' : '') + ' this week — open a dog marked with a red dot to resolve.' +
      '</div>';
    }

    if (dogs.length === 0) {
      html += renderEmptyState();
    } else {
      // Search + filter chips
      var chips = [
        { id: 'all', label: 'All' },
        { id: 'unassigned', label: 'Unassigned' },
        { id: 'conflicts', label: 'Conflicts' },
        { id: 'am', label: 'AM' },
        { id: 'pm', label: 'PM' },
        { id: 'kit', label: 'Kit needed' }
      ];
      html += '<div class="toolbar">' +
        '<div class="search-field' + (searchQuery ? ' has-value' : '') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input type="search" id="dog-search" placeholder="Search dogs, breeds or owners" value="' + escapeAttr(searchQuery) + '" autocomplete="off">' +
          '<button class="search-clear" id="search-clear" aria-label="Clear search">×</button>' +
        '</div>' +
        '<div class="filter-chips">' + chips.map(function (c) {
          return '<button class="chip' + (activeFilter === c.id ? ' active' : '') + '" data-filter="' + c.id + '">' + c.label + '</button>';
        }).join('') + '</div>' +
      '</div>';
      html += '<div class="list-meta" id="list-meta" style="display:none;"><span id="list-meta-count"></span><button class="chip-clear" id="clear-filters">Clear</button></div>';

      html += '<div class="dog-cards">' + renderCards(dogs, dates, weekSlots, infoById) + '</div>';
      html += '<div class="no-match" id="no-match" style="display:none;">No dogs match — clear the search or filters.</div>';
    }

    // Floating action button
    html += '<button class="fab" id="fab-add-dog" aria-label="Add dog">+</button>';

    container.innerHTML = html;
    wireUpEvents(container, dates, dogs, infoById);
  }

  function renderEmptyState() {
    return '<div class="empty-state">' +
      '<div class="empty-state__icon">🐶</div>' +
      '<div class="empty-state__title">No dogs yet</div>' +
      '<div class="empty-state__text">Add your first dog to start planning training slots.</div>' +
      '<button class="btn btn-primary" id="empty-add-dog">+ Add Dog</button>' +
    '</div>';
  }

  function renderCards(dogs, dates, weekSlots, infoById) {
    var html = '';

    dogs.forEach(function (dog, dogIdx) {
      var isExpanded = expandedCards[dog.id];
      if (isExpanded === undefined) isExpanded = false;

      var info = infoById[dog.id] || { assignedDays: 0 };

      html += '<div class="dog-card' + (isExpanded ? ' expanded' : '') + '" data-dog-id="' + dog.id + '">';

      var wkNum = dog.weekNumber != null ? dog.weekNumber : '';
      html += '<div class="dog-card__header">' +
        '<span class="dog-card__chevron">›</span>' +
        '<span class="dog-card__name">' +
          (info.conflict ? '<span class="dog-card__conflict-dot" title="Booking conflict this week"></span>' : '') +
          '<span class="dog-card__name-text">' + escapeHtml(dog.name) + '</span>' +
          (dog.breed ? '<span class="dog-card__breed">· ' + escapeHtml(dog.breed) + '</span>' : '') +
        '</span>' +
        (wkNum !== '' ? '<span class="dog-card__week-badge" data-week-dog="' + dog.id + '" title="Training week (tap to edit)">Wk ' + wkNum + '</span>' : '<span></span>') +
        '<button class="dog-card__menu" data-edit-dog="' + dog.id + '" aria-label="Edit dog">✎</button>' +
      '</div>';

      // Glance row — status, kit and notes without expanding the card
      var badge;
      if (info.todayInWeek) {
        if (info.todayConflict) badge = '<span class="status-badge status-badge--conflict">Conflict today</span>';
        else if (info.todaySlot) badge = '<span class="status-badge status-badge--ok">' + escapeHtml(info.todaySlot.shortLabel) + ' today</span>';
        else badge = '<span class="status-badge status-badge--none">No slot today</span>';
      } else {
        badge = info.assignedDays > 0
          ? '<span class="status-badge status-badge--info">' + info.assignedDays + ' day' + (info.assignedDays !== 1 ? 's' : '') + ' booked</span>'
          : '<span class="status-badge status-badge--none">No slots</span>';
      }
      var eqIds = dog.equipment || [];
      var glanceKit = eqIds.length
        ? FT.Equipment.renderTags(eqIds.slice(0, 3)) + (eqIds.length > 3 ? '<span class="glance-extra">+' + (eqIds.length - 3) + '</span>' : '')
        : '';
      var noteBtn = dog.notes
        ? '<button class="glance-note-btn" data-notes-dog="' + dog.id + '">✎ Notes</button>'
        : '<button class="glance-note-btn glance-note-btn--empty" data-notes-dog="' + dog.id + '">+ Note</button>';
      html += '<div class="dog-card__glance">' + badge + glanceKit + noteBtn + '</div>';

      html += '<div class="dog-card__body">';

      html += '<div class="dog-card__equipment">' +
        '<span class="dog-card__equipment-label">Kit</span>' +
        FT.Equipment.renderTags(dog.equipment) +
        '<button class="equipment-change-btn" data-equip-dog="' + dog.id + '">Change</button>' +
      '</div>';

      if (dog.notes) {
        html += '<div class="dog-card__notes" data-notes-dog="' + dog.id + '">' +
          '<span class="note-ico">📝</span><span>' + escapeHtml(dog.notes) + '</span>' +
        '</div>';
      }

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

  function toggleCard(card) {
    var dogId = card.dataset.dogId;
    var body = card.querySelector('.dog-card__body');
    var wasExpanded = card.classList.contains('expanded');
    expandedCards[dogId] = !wasExpanded;
    if (window.gsap && body) {
      window.gsap.killTweensOf(body); // rapid re-taps must not stack competing tweens
      if (wasExpanded) {
        window.gsap.to(body, {
          height: 0, opacity: 0, duration: 0.28, ease: 'power2.inOut',
          onComplete: function () {
            card.classList.remove('expanded');
            window.gsap.set(body, { clearProps: 'all' });
          }
        });
      } else {
        card.classList.add('expanded');
        window.gsap.set(body, { clearProps: 'all' }); // drop any residue from a killed collapse tween
        window.gsap.from(body, { height: 0, opacity: 0, duration: 0.32, ease: 'power2.out', clearProps: 'all' });
      }
    } else {
      card.classList.toggle('expanded');
    }
  }

  function wireUpEvents(container, dates, dogs, infoById) {
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

    ['#fab-add-dog', '#empty-add-dog'].forEach(function (sel) {
      var addBtn = container.querySelector(sel);
      if (addBtn) {
        addBtn.addEventListener('click', function () {
          openDogModal(null, function () { render(container); });
        });
      }
    });

    container.querySelectorAll('.dog-card__header, .dog-card__glance').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-edit-dog]') || e.target.closest('[data-week-dog]') || e.target.closest('[data-notes-dog]')) return;
        toggleCard(this.closest('.dog-card'));
      });
    });

    container.querySelectorAll('[data-notes-dog]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var dogId = this.dataset.notesDog;
        openNotesSheet(dogId, function () { render(container); });
      });
    });

    // ---- Filtering + search (no full re-render: cards are shown/hidden in place,
    // so the search field keeps focus while typing) ----
    var dogById = {};
    dogs.forEach(function (d) { dogById[d.id] = d; });

    function applyListFilter() {
      var visible = 0;
      container.querySelectorAll('.dog-card').forEach(function (card) {
        var dog = dogById[card.dataset.dogId];
        var info = infoById[card.dataset.dogId] || { assignedDays: 0 };
        var show = !!dog && dogMatchesFilter(dog, info, activeFilter) && dogMatchesSearch(dog, searchQuery);
        card.classList.toggle('filtered-out', !show);
        if (show) visible++;
      });
      var filtered = activeFilter !== 'all' || searchQuery !== '';
      var meta = container.querySelector('#list-meta');
      if (meta) {
        meta.style.display = filtered ? 'flex' : 'none';
        var countEl = container.querySelector('#list-meta-count');
        if (countEl) countEl.textContent = 'Showing ' + visible + ' of ' + dogs.length + ' dogs';
      }
      var noMatch = container.querySelector('#no-match');
      if (noMatch) noMatch.style.display = (filtered && visible === 0 && dogs.length > 0) ? 'block' : 'none';
    }

    function setFilter(filter) {
      activeFilter = (filter === activeFilter && filter !== 'all') ? 'all' : filter;
      container.querySelectorAll('.chip[data-filter]').forEach(function (chip) {
        chip.classList.toggle('active', chip.dataset.filter === activeFilter);
      });
      applyListFilter();
    }

    container.querySelectorAll('.chip[data-filter]').forEach(function (chip) {
      chip.addEventListener('click', function () { setFilter(this.dataset.filter); });
    });
    container.querySelectorAll('[data-snap-filter]').forEach(function (tile) {
      tile.addEventListener('click', function () { setFilter(this.dataset.snapFilter); });
    });

    var searchInput = container.querySelector('#dog-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = this.value.trim();
        this.closest('.search-field').classList.toggle('has-value', searchQuery !== '');
        applyListFilter();
      });
    }
    var clearSearchBtn = container.querySelector('#search-clear');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', function () {
        searchQuery = '';
        if (searchInput) {
          searchInput.value = '';
          searchInput.closest('.search-field').classList.remove('has-value');
        }
        applyListFilter();
      });
    }
    var clearFiltersBtn = container.querySelector('#clear-filters');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', function () {
        searchQuery = '';
        if (searchInput) {
          searchInput.value = '';
          searchInput.closest('.search-field').classList.remove('has-value');
        }
        setFilter('all');
      });
    }
    applyListFilter();

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

    // Swipe navigation — wire once: render() re-runs wireUpEvents on every
    // interaction, and innerHTML replacement does not remove container-level
    // listeners, so re-adding here would stack one handler pair per render
    if (!container.ftSwipeWired) {
      container.ftSwipeWired = true;
      var startX = 0, startY = 0;
      container.addEventListener('touchstart', function (e) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }, { passive: true });

      container.addEventListener('touchend', function (e) {
        // the container also hosts Schedule/Settings — only swipe on the planner
        if (!container.querySelector('.segmented')) return;
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
    openNotesSheet: openNotesSheet,
    loadFromHash: loadFromHash,
    updateHash: updateHash,
    // pure logic exposed for the node smoke tests only — not a UI contract
    _test: {
      buildSlotMap: buildSlotMap,
      getDogWeekInfo: getDogWeekInfo,
      computeSnapshot: computeSnapshot,
      dogMatchesFilter: dogMatchesFilter,
      dogMatchesSearch: dogMatchesSearch
    }
  };
})();
