// ==========================================
// bg/message-handler.js — Chrome runtime message dispatcher
// Depends on: constants.js, filters.js, notifications.js, job-checker.js, audio.js
// ==========================================

const BG_CHAT_SESSION_KEY = 'openRouterChatSession';

/**
 * Read-modify-write the chat session in storage.
 * The mutator function receives the session object and can modify it in place.
 */
async function updateChatSession(mutator) {
  const data = await chrome.storage.local.get([BG_CHAT_SESSION_KEY]);
  const session = data[BG_CHAT_SESSION_KEY] || {};
  mutator(session);
  session.updatedAt = Date.now();
  await chrome.storage.local.set({ [BG_CHAT_SESSION_KEY]: session });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === 'setDisplayMode') {
    const mode = message.mode === 'sidebar' ? 'sidebar' : 'popup';
    const tabId = message.tabId || null;

    applyDisplayMode(mode)
      .then(async () => {
        if (mode === 'sidebar' && tabId) {
          // Open the side panel immediately on the requesting tab
          try {
            await chrome.sidePanel.open({ tabId });
          } catch (e) {
            console.warn('Could not auto-open side panel:', e.message);
          }
        }
        sendResponse({ success: true, mode });
      })
      .catch((e) => sendResponse({ success: false, error: e.message }));
    return true;
  }

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
      url: 'https://mostaql.com/projects'
    }];
    showNotification(testJobs);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'testSound') {
    playSound();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'updateAlarm') {
    const interval = parseInt(message.interval) || 1;
    chrome.alarms.clear('checkJobs');
    chrome.alarms.create('checkJobs', { periodInMinutes: interval });
    console.log(`Alarm 'checkJobs' updated to ${interval} minutes.`);
    sendResponse({ success: true, interval: interval });
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
      stats: {
        lastCheck: null,
        todayCount: 0,
        todayDate: new Date().toDateString()
      }
    }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'debugFetch') {
    fetch(MOSTAQL_URLS.all)
      .then(r => r.text())
      .then(html => {
        console.log('HTML Preview (first 2000 chars):');
        console.log(html.substring(0, 2000));
        sendResponse({ success: true, length: html.length });
      })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (message.action === 'getDefaultPrompts') {
    sendResponse({ success: true, prompts: DEFAULT_PROMPTS });
    return false;
  }

  if (message.action === 'generateOpenRouterProposal') {
    const STREAM_FLUSH_MS = 300;
    let lastFlush = 0;
    let flushTimer = null;
    let flushInFlight = Promise.resolve();
    let finalized = false;

    const flushChunk = (text) => {
      if (finalized) return;
      lastFlush = Date.now();
      flushInFlight = flushInFlight.then(async () => {
        if (finalized) return;
        try {
          await updateChatSession((session) => {
            if (!session.messages) session.messages = [];
            const pendingIdx = session.messages.findIndex((m) => m.pending);
            if (pendingIdx !== -1) {
              session.messages[pendingIdx] = { role: 'assistant', content: text, pending: true };
            }
          });
        } catch (e) {
          console.error('Failed to flush OpenRouter chunk to storage:', e);
        }
      });
    };

    const onChunk = (accumulated) => {
      if (finalized) return;
      const now = Date.now();
      if (now - lastFlush >= STREAM_FLUSH_MS) {
        flushChunk(accumulated);
      } else if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flushChunk(accumulated);
        }, STREAM_FLUSH_MS - (now - lastFlush));
      }
    };

    const finalize = async (result) => {
      finalized = true;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      await flushInFlight;
      await updateChatSession((session) => {
        session.messages = (session.messages || []).filter((m) => !m.pending);
        session.messages.push({ role: 'assistant', content: result.text });
        session.model = result.model || session.model;
      });
      sendResponse({ success: true, ...result });
    };

    const fail = async (error) => {
      finalized = true;
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      await flushInFlight;
      console.error('OpenRouter generation error:', error);
      const errorMsg = error.message || 'OpenRouter request failed';
      await updateChatSession((session) => {
        session.messages = (session.messages || []).filter((m) => !m.pending);
        session.messages.push({
          role: 'assistant',
          content: '\u062a\u0639\u0630\u0631 \u062a\u0648\u0644\u064a\u062f \u0627\u0644\u0631\u062f: ' + errorMsg +
            '\n\n\u062c\u0631\u0628 \u062a\u063a\u064a\u064a\u0631 \u0627\u0644\u0645\u0648\u062f\u064a\u0644 \u0645\u0646 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u0630\u0643\u0627\u0621 \u0641\u064a \u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645 (Dashboard).'
        });
      });
      sendResponse({ success: false, error: errorMsg });
    };

    // Try streaming first, fall back to non-streaming if the provider rejects it
    generateOpenRouterProposalStream(message, onChunk)
      .then(finalize)
      .catch(async (streamError) => {
        console.warn('Streaming failed, falling back to non-streaming:', streamError.message);
        try {
          const result = await generateOpenRouterProposal(message);
          await finalize(result);
        } catch (fallbackError) {
          await fail(fallbackError);
        }
      });
    return true;
  }

  if (message.action === 'openAiPopup') {
    chrome.storage.local.set({ popupActiveTab: 'ai-chat' }, async () => {
      try {
        if (chrome.action && chrome.action.openPopup) {
          await chrome.action.openPopup();
          sendResponse({ success: true });
          return;
        }

        sendResponse({ success: false, error: 'Popup API unavailable' });
      } catch (error) {
        console.error('Open popup error:', error);
        sendResponse({ success: false, error: error.message || 'Failed to open popup' });
      }
    });
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
