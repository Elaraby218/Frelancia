// ==========================================
// bg/audio.js — Sound playback via offscreen document
// Depends on: offscreen.js (setupOffscreenDocument)
// ==========================================

async function playSound(sound = 'default') {
  await triggerOffscreenAction('playSound', sound);
}

async function playTrackedSound(sound = 'default') {
  await triggerOffscreenAction('playTrackedSound', sound);
}

async function playPreview(sound = 'default') {
  await triggerOffscreenAction('playPreview', sound);
}

async function triggerOffscreenAction(action, sound = null) {
  try {
    await setupOffscreenDocument();
    await new Promise(r => setTimeout(r, 200));

    chrome.runtime.sendMessage({ action: action, sound: sound }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`Error sending ${action} (${sound}):`, chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.error(`Error in triggerOffscreenAction (${action}):`, error);
  }
}
