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

async function triggerOffscreenAction(action) {
  try {
    const response = await sendOffscreenMessage({ action });
    if (!response?.success) {
      throw new Error(response?.error || `Offscreen action "${action}" failed.`);
    }
  } catch (error) {
    console.error(`Error in triggerOffscreenAction (${action}):`, error);
  }
}
