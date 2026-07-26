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
  'bg/signalr.js',         // initializeSignalR
  'bg/ai-chat.js',         // one-shot ChatGPT prompt delivery
  'bg/install.js',         // onInstalled handler
  'bg/alarm-handler.js',   // onAlarm handler
  'bg/message-handler.js'  // onMessage handler
);

// Service worker startup
(async function initOnStartup() {
  console.log('Service worker started');
  const data = await chrome.storage.local.get(['settings']);
  const mode = (data.settings || {}).notificationMode || 'auto';

  if (mode === 'polling') {
    console.log('📡 Notification mode: polling — skipping SignalR init');
    return;
  }
  await initializeSignalR();
})();
