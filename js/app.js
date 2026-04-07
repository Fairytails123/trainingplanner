/* ============================================
   app.js — App initialisation and routing
   ============================================ */

window.FT = window.FT || {};

(function () {
  'use strict';

  var currentView = 'planner';
  var appContent = null;

  function init() {
    appContent = document.getElementById('app-content');

    // Seed default config
    FT.Storage.getTimeSlots();
    FT.Storage.getEquipment();

    // Auto-increment training week numbers if a new week has started
    FT.Storage.autoIncrementWeekNumbers();

    // Load week from URL hash
    FT.Planner.loadFromHash();

    // Wire up nav buttons
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigateTo(this.dataset.view);
      });
    });

    // Hash change listener
    window.addEventListener('hashchange', function () {
      if (currentView === 'planner') {
        FT.Planner.loadFromHash();
        FT.Planner.render(appContent);
      }
    });

    // Render initial view
    navigateTo('planner');

    // Sync from Google Sheets in background (if configured)
    FT.Storage.syncFromSheets(function (success) {
      if (success) {
        // Re-render current view with fresh data
        navigateTo(currentView);
      }
    });
  }

  function navigateTo(viewName) {
    currentView = viewName;

    // Update nav active state
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Render view
    switch (viewName) {
      case 'planner':
        FT.Planner.render(appContent);
        break;
      case 'summary':
        FT.Summary.resetSelection();
        FT.Summary.render(appContent);
        break;
      case 'settings':
        FT.Settings.render(appContent);
        break;
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  // Start the app
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for other modules
  window.FT.App = {
    navigateTo: navigateTo
  };
})();
