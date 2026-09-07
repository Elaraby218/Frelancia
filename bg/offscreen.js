// ==========================================
// bg/offscreen.js — Offscreen document bridge
// ==========================================

let offscreenSetupPromise = null;

async function setupOffscreenDocument() {
  if (offscreenSetupPromise) return offscreenSetupPromise;

  offscreenSetupPromise = (async () => {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existing.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK', 'DOM_PARSER'],
        justification: 'Parse Mostaql HTML and play notification audio'
      });
    }
  })();

  try {
    await offscreenSetupPromise;
  } finally {
    offscreenSetupPromise = null;
  }
}

async function sendOffscreenMessage(message, timeoutMs = 5000) {
  await setupOffscreenDocument();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      handler(value);
    };
    const timeoutId = setTimeout(() => {
      finish(reject, new Error(`Offscreen action "${message.action}" timed out.`));
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        finish(reject, new Error(chrome.runtime.lastError.message));
        return;
      }
      finish(resolve, response);
    });
  });
}

async function parseJobsOffscreen(html) {
  const response = await sendOffscreenMessage({ action: 'parseJobs', html });
  if (!response?.success || !Array.isArray(response.jobs)) {
    throw new Error(response?.error || 'Offscreen parser returned an invalid jobs response.');
  }
  return response.jobs;
}

async function parseTrackedDataOffscreen(html) {
  try {
    const response = await sendOffscreenMessage({ action: 'parseTrackedData', html });
    return response?.success ? response.data : null;
  } catch (e) {
    console.error('Tracked project parsing failed:', e);
    return null;
  }
}
