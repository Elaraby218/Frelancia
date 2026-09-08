// ==========================================
// bg/message-handler.js — Chrome runtime message dispatcher
// Depends on: constants.js, filters.js, notifications.js, job-checker.js, audio.js
// ==========================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'checkNow') {
    checkForNewJobs()
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('CheckNow Handler Error:', error);
        sendResponse({ success: false, error: 'Internal Error: ' + error.message });
      });
    return true;
  }

  if (message.action === 'testNotification') {
    const testJobs = [{
      id: 'test-' + Date.now(),
      title: 'هذا إشعار تجريبي - مشروع تطوير موقع إلكتروني',
      budget: '500 $',
      url: 'https://mostaql.com/project/1-notification-test'
    }];
    showNotification(testJobs)
      .then((notificationId) => sendResponse({ success: true, notificationId }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'testSound') {
    playSound()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'updateAlarm') {
    const interval = normalizeCheckInterval(message.interval);
    chrome.alarms.create('checkJobs', {
      delayInMinutes: 0.5,
      periodInMinutes: interval
    }).then(() => {
      console.log(`Alarm 'checkJobs' updated to ${interval} minutes.`);
      sendResponse({ success: true, interval });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'reconnectSignalR') {
    reconnectSignalR()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.action === 'disconnectSignalR') {
    if (typeof signalRClient !== 'undefined') {
      signalRClient.disconnect()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: e.message }));
    } else {
      sendResponse({ success: true });
    }
    return true;
  }

  if (message.action === 'clearHistory') {
    chrome.storage.local.set({
      seenJobs: [],
      recentJobs: [],
      stats: {
        lastCheck: null,
        lastAttempt: null,
        lastError: null,
        todayCount: 0,
        todayDate: new Date().toDateString()
      },
      mostaqlBackoffUntil: null
    })
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'debugFetch') {
    fetchJobs(MOSTAQL_URLS.all)
      .then(jobs => sendResponse({ success: true, jobs: jobs.length }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.action === 'getDefaultPrompts') {
    sendResponse({ success: true, prompts: DEFAULT_PROMPTS });
    return false;
  }

  if (message.action === 'openAiChatWithPrompt') {
    openAiChatWithPrompt(message.prompt)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error('openAiChatWithPrompt error:', error);
        sendResponse({ success: false, error: error.message || String(error) });
      });
    return true;
  }

  if (message.action === 'claimAiPrompt') {
    claimAiPromptDelivery(message.expectedId)
      .then((delivery) => sendResponse({ success: true, delivery }))
      .catch((error) => {
        console.error('claimAiPrompt error:', error);
        sendResponse({ success: false, delivery: null, error: error.message || String(error) });
      });
    return true;
  }

  if (message.action === 'discardAiPrompt') {
    discardAiPromptDelivery()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
    return true;
  }

  if (message.action === 'markAiComposerForClear') {
    markComposerForClear(message.preview)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message || String(error) }));
    return true;
  }

  if (message.action === 'consumeComposerClearFlag') {
    consumeComposerClearFlag()
      .then((flag) => sendResponse({ success: true, flag }))
      .catch((error) => sendResponse({ success: false, flag: null, error: error.message || String(error) }));
    return true;
  }

  if (message.action === 'download_media') {
    const { url, filename, content } = message;

    if (content) {
      const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
      chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      });
      return true;
    } else if (url) {
      chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      });
      return true;
    }
  }

  if (message.action === 'download_zip') {
    const { filename, files } = message;

    if (typeof JSZip !== 'undefined') {
      const zip = new JSZip();

      const fetchPromises = files.map(async (f) => {
        if (f.content) {
          zip.file(f.name, f.content);
        } else if (f.url) {
          try {
            const resp = await fetch(f.url);
            if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
            const buffer = await resp.arrayBuffer();
            zip.file(f.name, buffer);
          } catch (e) {
            console.error(`Failed to fetch ${f.url} for zip:`, e);
            zip.file(`${f.name}.error.txt`, `Failed to download: ${e.message}`);
          }
        }
      });

      Promise.all(fetchPromises).then(() => {
        zip.generateAsync({ type: "base64" }).then((base64) => {
          const dataUrl = 'data:application/zip;base64,' + base64;
          chrome.downloads.download({ url: dataUrl, filename, saveAs: true }, (downloadId) => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ success: true, downloadId });
            }
          });
        }).catch(err => {
          console.error("ZIP Generation error:", err);
          sendResponse({ success: false, error: err.message });
        });
      });
      return true;
    } else {
      console.error("JSZip not loaded");
      sendResponse({ success: false, error: "JSZip not loaded" });
      return false;
    }
  }
});
