/* ============================================
   app.js — App init, routing, tab bar
   ============================================ */

window.FT = window.FT || {};

(function () {
  'use strict';

  var currentView = 'planner';
  var appContent = null;
  var headerEl = null;

  function init() {
    appContent = document.getElementById('app-content');
    headerEl = document.querySelector('.app-header');

    FT.Storage.getTimeSlots();
    FT.Storage.getEquipment();
    FT.Storage.autoIncrementWeekNumbers();
    FT.Planner.loadFromHash();

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { navigateTo(this.dataset.view); });
    });

    // Header sync button
    var syncBtn = document.getElementById('header-sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        if (syncBtn.classList.contains('is-syncing')) return;
        if (currentView === 'settings' && FT.Settings.isDirty()) {
          FT.Settings.toast('Save or discard Settings changes before syncing', true);
          return;
        }
        syncBtn.classList.add('is-syncing');
        syncBtn.setAttribute('aria-busy', 'true');
        FT.Settings.toast('Checking for updates…');
        FT.Storage.syncFromSheets(function (ok) {
          syncBtn.classList.remove('is-syncing');
          syncBtn.removeAttribute('aria-busy');
          FT.Settings.toast(ok ? 'Sync check complete' : 'Not synced — tap to retry', !ok);
          if (ok) navigateTo(currentView);
        });
      });
    }

    window.addEventListener('hashchange', function () {
      if (currentView === 'planner') {
        FT.Planner.loadFromHash();
        FT.Planner.render(appContent);
      }
    });

    // Scroll-aware header
    window.addEventListener('scroll', function () {
      if (window.scrollY > 8) headerEl.classList.add('is-scrolled');
      else headerEl.classList.remove('is-scrolled');
    }, { passive: true });

    navigateTo('planner');

    FT.Storage.syncFromSheets(function (success) {
      if (success && !(currentView === 'settings' && FT.Settings.isDirty())) {
        navigateTo(currentView);
      }
    });
    window.addEventListener('beforeunload', function (e) {
      if (FT.Settings && FT.Settings.isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function navigateTo(viewName) {
    if (currentView === 'settings' && viewName !== 'settings' &&
        FT.Settings && !FT.Settings.canLeave()) return;
    currentView = viewName;

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === viewName);
      if (btn.dataset.view === viewName) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    var headerTitle = document.getElementById('header-title');
    var headerSub = document.getElementById('header-subtitle');
    if (headerTitle) {
      headerTitle.textContent =
        viewName === 'planner' ? 'Planner' :
        viewName === 'summary' ? 'Schedule' :
        'Settings';
    }
    if (headerSub) {
      headerSub.textContent =
        viewName === 'planner' ? 'Fairy Tails K9 — weekly slots' :
        viewName === 'summary' ? 'Daily lineup by time slot' :
        'Slots, equipment & sync';
    }

    switch (viewName) {
      case 'planner': FT.Planner.render(appContent); break;
      case 'summary': FT.Summary.resetSelection(); FT.Summary.render(appContent); break;
      case 'settings': FT.Settings.render(appContent); break;
    }

    window.scrollTo(0, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.FT.App = { navigateTo: navigateTo };
})();
