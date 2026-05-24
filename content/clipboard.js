// ==========================================
// content/clipboard.js — Injects main-world paste hook script tag
// ==========================================

function injectClipboardPaste() {
    const chatInput = document.querySelector('.editor__input');
    const fileInput = document.querySelector('.chat-form__multimedia input[type="file"]');

    if (!chatInput || !fileInput) return;

    // Check if already injected
    if (chatInput.dataset.clipboardPasteHooked === 'true') return;
    chatInput.dataset.clipboardPasteHooked = 'true';

    console.log('[DEBUG] Mostaql Notifier: Injecting clipboard script tag from web_accessible_resources');

    // Create a script tag pointing to the web-accessible resource
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/clipboard-main.js');
    
    // Inject and immediately remove once loaded to keep DOM clean
    script.onload = function() {
        script.remove();
    };

    (document.head || document.documentElement).appendChild(script);
}
