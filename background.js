// ==========================================
// Background Service Worker - Entry Point
// ==========================================

// Load constants first (declares SIGNALR_AVAILABLE)
importScripts('bg/constants.js');

// Third-party libraries
try {
  importScripts('jszip.min.js');
  console.log('✅ JSZip library loaded successfully');
} catch (e) {
  console.warn('⚠️ JSZip library not found. Compression might fail.', e);
}

try {
  importScripts('signalr.min.js', 'signalr-client.js');
  SIGNALR_AVAILABLE = true;
  console.log('✅ SignalR libraries loaded successfully');
} catch (e) {
  console.warn('⚠️ SignalR libraries not found. Real-time notifications disabled.');
  console.warn('📥 Download signalr.min.js from: https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js');
  console.warn('💡 Extension will work with traditional polling until SignalR is set up.');
}

// Remaining application modules (order matters — each file depends on those above it)
importScripts(
  'bg/filters.js',         // applyFilters, parse* helpers
  'bg/offscreen.js',       // setupOffscreenDocument, parse*Offscreen
  'bg/audio.js',           // playSound, playTrackedSound, triggerOffscreenAction
  'bg/notifications.js',   // showNotification, showTrackedNotification, click handlers
  'bg/fetcher.js',         // fetchJobs, fetchProjectDetails, cleanTitle
  'bg/tracker.js',         // checkTrackedProjects
  'bg/job-checker.js',     // checkForNewJobs
  'bg/openrouter.js',      // generateOpenRouterProposal
  'bg/signalr.js',         // initializeSignalR
  'bg/install.js',         // onInstalled handler
  'bg/alarm-handler.js',   // onAlarm handler
  'bg/message-handler.js'  // onMessage handler
);

// ==========================================
// Display Mode: Popup vs Sidebar
// ==========================================

async function applyDisplayMode(mode) {
  if (mode === 'sidebar') {
    // Disable popup so clicking the icon opens the side panel
    await chrome.action.setPopup({ popup: '' });
    await chrome.sidePanel.setOptions({ path: 'popup.html', enabled: true });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    console.log('Display mode: sidebar');
  } else {
    // Disable side panel entirely, re-enable popup
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    await chrome.sidePanel.setOptions({ enabled: false });
    await chrome.action.setPopup({ popup: 'popup.html' });
    console.log('Display mode: popup');
  }
}

// Service worker startup
(async function initOnStartup() {
  console.log('Service worker started');
  const data = await chrome.storage.local.get(['settings']);
  const settings = data.settings || {};
  const notifMode = settings.notificationMode || 'auto';

  // Apply display mode (sidebar by default)
  const displayMode = settings.displayMode || 'sidebar';
  await applyDisplayMode(displayMode);

  if (notifMode === 'polling') {
    console.log('📡 Notification mode: polling — skipping SignalR init');
    return;
  }
  await initializeSignalR();
})();
