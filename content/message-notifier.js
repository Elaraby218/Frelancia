// ==========================================
// content/message-notifier.js — Real-time message & notification sound
// ==========================================

let lastMessageCount = 0;
let lastTitleMatch = null;

function checkUnreadMessages() {
    chrome.storage.local.get(['settings'], (data) => {
        const settings = data.settings || {};
        // If user disabled it in dashboard, do nothing
        if (settings.messageSoundEnabled === false) return;

        // 1. Check title for unread count e.g. "(1) مستقل"
        const titleMatch = document.title.match(/^\((\d+)\)/);
        if (titleMatch) {
            const titleCount = parseInt(titleMatch[1], 10);
            if (lastTitleMatch !== null && titleCount > lastTitleMatch) {
                chrome.runtime.sendMessage({ action: 'playMessageSound' });
            }
            lastTitleMatch = titleCount;
        } else {
            lastTitleMatch = 0;
        }

        // 2. Fallback / Additional check: Check the conversations link badge
        const messageLinks = document.querySelectorAll('a[href*="mostaql.com/conversations"], a[href^="/conversations"]');
        for (const link of messageLinks) {
            const text = link.innerText.trim();
            const match = text.match(/(\d+)/);
            if (match) {
                const count = parseInt(match[1], 10);
                // If count increased, and it wasn't just 0 going to a number on initial load (unless we want sound on load)
                if (lastMessageCount !== 0 && count > lastMessageCount) {
                    chrome.runtime.sendMessage({ action: 'playMessageSound' });
                } else if (lastMessageCount === 0 && count > 0 && !window.hasPlayedInitialSound) {
                    // Optional: play sound on first load if there are unread messages
                    // window.hasPlayedInitialSound = true; 
                    // chrome.runtime.sendMessage({ action: 'playMessageSound' });
                }
                lastMessageCount = count;
                return; 
            }
        }
        // No badge found
        if (messageLinks.length > 0) {
            lastMessageCount = 0;
        }
    });
}

function startMessageNotifier() {
    // Check every 3 seconds for DOM changes in badge or title
    setInterval(checkUnreadMessages, 3000);
    checkUnreadMessages();
}
