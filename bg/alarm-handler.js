// ==========================================
// bg/alarm-handler.js — Chrome alarms listener
// Depends on: signalr.js, job-checker.js, tracker.js, constants.js
// ==========================================

/* global signalRClient */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkJobs') {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};
    const notificationMode = settings.notificationMode || 'auto';

    if (settings.systemEnabled === false) {
      console.log('Notification system is paused; skipping scheduled check.');
      return;
    }

    if (notificationMode === 'polling') {
      console.log('📡 Notification mode: polling — checking for new jobs');
      await Promise.all([checkForNewJobs(), checkTrackedProjects()]);

    } else if (notificationMode === 'signalr') {
      await Promise.all([initializeSignalR(), checkTrackedProjects()]);

    } else {
      // A connected hub does not prove that its remote scraper is producing
      // events. Poll as a safety net; seenJobs de-duplicates both sources.
      console.log('Automatic mode: running the scheduled Mostaql safety poll.');
      await Promise.all([
        initializeSignalR(),
        checkForNewJobs(),
        checkTrackedProjects()
      ]);
    }
  }

  if (alarm.name === 'signalRReconnect') {
    console.log('SignalR: Reconnect alarm fired, attempting to reconnect...');
    const d = await chrome.storage.local.get(['settings']);
    const mode = (d.settings || {}).notificationMode || 'auto';
    if (mode !== 'polling') {
      await initializeSignalR();
    }
  }
});
