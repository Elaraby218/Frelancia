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

  if (message.action === 'generateProposalWithGemini') {
    const prompt = message.prompt;
    chrome.storage.local.get(['settings'], (data) => {
      const settings = data.settings || {};
      const apiKey = settings.geminiApiKey || (typeof LOCAL_GEMINI_KEY !== 'undefined' ? LOCAL_GEMINI_KEY : '');
      const model = settings.geminiModel || 'gemini-2.5-flash';

      if (!apiKey) {
        sendResponse({ success: false, error: 'مفتاح API الخاص بـ Gemini غير مهيأ. يرجى تهيئته في الإعدادات المتقدمة.' });
        return;
      }

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errJson => {
            const errMsg = errJson.error?.message || response.statusText || 'خطأ غير معروف';
            throw new Error(errMsg);
          }).catch(e => {
            throw new Error(e.message || `HTTP error! Status: ${response.status}`);
          });
        }
        return response.json();
      })
      .then(result => {
        const candidate = result.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        if (text) {
          sendResponse({ success: true, proposal: text });
        } else {
          let errorMsg = 'استجابة فارغة أو غير متوقعة من Gemini API';
          if (candidate && candidate.finishReason && candidate.finishReason !== 'STOP') {
            if (candidate.finishReason === 'SAFETY') {
              errorMsg = 'تم حظر توليد العرض بواسطة فلاتر الأمان لـ Gemini. قد يحتوي وصف المشروع على كلمات حساسة.';
            } else if (candidate.finishReason === 'RECITATION') {
              errorMsg = 'تم حظر توليد العرض بسبب تكرار نصوص محمية بحقوق النشر.';
            } else {
              errorMsg = `فشل توليد العرض. سبب التوقف: ${candidate.finishReason}`;
            }
          } else if (result.promptFeedback?.blockReason) {
            errorMsg = `تم حظر الطلب بالكامل بواسطة فلاتر Gemini: ${result.promptFeedback.blockReason}`;
          }
          sendResponse({ success: false, error: errorMsg });
        }
      })
      .catch(error => {
        console.error('Gemini API Error:', error);
        sendResponse({ success: false, error: error.message });
      });
    });
    return true; // Keep message channel open for async response
  }
});
