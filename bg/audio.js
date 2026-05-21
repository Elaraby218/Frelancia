// ==========================================
// bg/audio.js — Sound playback via offscreen document
// Depends on: offscreen.js (setupOffscreenDocument)
// ==========================================

async function playSound() {
  await triggerOffscreenAction('playSound');
}

async function playTrackedSound() {
  await triggerOffscreenAction('playTrackedSound');
}

async function playMessageSound() {
  await triggerOffscreenAction('playMessageSound');
}

async function triggerOffscreenAction(action) {
  try {
    await setupOffscreenDocument();
    await new Promise(r => setTimeout(r, 200));

    chrome.runtime.sendMessage({ action: action }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`Error sending ${action}:`, chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error(`Error in triggerOffscreenAction (${action}):`, error);
  }
}
