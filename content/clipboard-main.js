// ==========================================
// content/clipboard-main.js — Handles pasting clipboard images directly into chat
// Loaded as a web accessible resource inside the page's MAIN world to bypass CSP and isolated worlds.
// ==========================================

(function() {
    function initMainWorldClipboard() {
        const chatInput = document.querySelector('.editor__input');
        if (!chatInput) return;

        // Ensure no duplicate event listeners in the main world
        if (chatInput.dataset.clipboardPasteHookedMain === 'true') return;
        chatInput.dataset.clipboardPasteHookedMain = 'true';

        chatInput.addEventListener('paste', function(event) {
            console.log('[DEBUG] Mostaql Notifier: Paste event detected inside chatInput!');

            // Dynamically query fileInput on each paste to prevent stale/detached references
            const fileInput = document.querySelector('.chat-form__multimedia input[type="file"]');
            if (!fileInput) {
                console.log('[DEBUG] Mostaql Notifier: Upload file input not found in the DOM!');
                return;
            }

            const items = (event.clipboardData || event.originalEvent?.clipboardData)?.items;
            if (!items) {
                console.log('[DEBUG] Mostaql Notifier: No clipboard items found.');
                return;
            }

            console.log('[DEBUG] Mostaql Notifier: Clipboard items count:', items.length);

            let imagePasted = false;
            for (let i = 0; i < items.length; i++) {
                console.log(`[DEBUG] Mostaql Notifier: Item ${i} type:`, items[i].type);
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    if (!blob) {
                        console.log(`[DEBUG] Mostaql Notifier: Item ${i} could not be extracted as File/Blob.`);
                        continue;
                    }
                    let extension = "png";
                    if (blob.type) {
                        const parts = blob.type.split('/');
                        if (parts.length > 1) {
                            extension = parts[1].split('+')[0];
                        }
                    }
                    const filename = `pasted_image_${Date.now()}_${Math.floor(Math.random() * 100000)}.${extension}`;
                    console.log(`[DEBUG] Mostaql Notifier: Generating unique filename for upload:`, filename);

                    const file = new File([blob], filename, { type: blob.type });
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);

                    console.log(`[DEBUG] Mostaql Notifier: Resetting fileInput value...`);
                    fileInput.value = '';

                    console.log(`[DEBUG] Mostaql Notifier: Created File and DataTransfer object with unique name.`);
                    fileInput.files = dataTransfer.files;

                    console.log(`[DEBUG] Mostaql Notifier: Dispatching 'change' event to fileInput...`);
                    const changeEvent = new Event('change', { bubbles: true });
                    fileInput.dispatchEvent(changeEvent);

                    imagePasted = true;
                    console.log(`[DEBUG] Mostaql Notifier: Auto-upload triggered successfully!`);
                }
            }

            if (imagePasted) {
                console.log(`[DEBUG] Mostaql Notifier: Preventing default paste action.`);
                event.preventDefault();
            } else {
                console.log(`[DEBUG] Mostaql Notifier: No image item was pasted, letting default paste event run.`);
            }
        });
        console.log('[DEBUG] Mostaql Notifier: Main world clipboard paste hook installed successfully');
    }

    // Set up a MutationObserver to watch for dynamic DOM shifts or chat switches
    const observer = new MutationObserver(() => {
        initMainWorldClipboard();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // Also run immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMainWorldClipboard);
    } else {
        initMainWorldClipboard();
    }
})();
