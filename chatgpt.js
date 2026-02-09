// ==========================================
// Mostaql Project Tracker - ChatGPT Automation
// ==========================================

console.log('Mostaql Job Notifier: ChatGPT script injected');

function simulateTyping(element, text) {
    if (!element) return;

    // 1. Focus the element
    element.focus();

    // 2. Set value (for inputs/textareas) or innerText/innerHTML (for contenteditable)
    // ChatGPT usually uses a contenteditable div or a textarea.
    // Modern react apps might require dispatching input events.

    // Try setting value first if it's an input/textarea
    // ChatGPT often uses a p element inside a contenteditable div

    // Check if it's contenteditable
    if (element.isContentEditable) {
        // Clear existing content (usually just a <p><br></p>)
        element.innerHTML = '';

        // Split text by newlines and create paragraphs
        const lines = text.split('\n');

        // This is a simplified approach; ChatGPT's editor is complex.
        // A safer way for React inputs is to set the value property on the prototype
        // But for contenteditable, we can try document.execCommand (deprecated but works) or simple text node insertion.

        // Let's try inserting text directly
        document.execCommand('insertText', false, text);
    } else {
        // Fallback for standard textareas
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        nativeTextAreaValueSetter.call(element, text);

        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function findChatInput() {
    // Selectors for ChatGPT's input box (subject to change)
    const selectors = [
        '#prompt-textarea',
        '[contenteditable="true"]',
        'textarea[data-id="root"]',
        'textarea'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) return el;
    }
    return null;
}

function findSendButton() {
    // Selectors for ChatGPT's send button
    const selectors = [
        '[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button.mb-1.mr-1' // Sometimes used
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && !el.disabled) return el;
    }
    return null;
}

function injectPrompt() {
    chrome.storage.local.get(['pendingChatGptPrompt'], (data) => {
        const prompt = data.pendingChatGptPrompt;

        if (!prompt) return; // No pending prompt

        console.log('Mostaql Job Notifier: Found pending prompt, attempting to inject...');

        // Try to find the input box. It might take a moment to load.
        // We'll retry a few times.
        let attempts = 0;
        const maxAttempts = 20; // 10 seconds (500ms interval)

        const interval = setInterval(() => {
            attempts++;
            const inputField = findChatInput();

            if (inputField) {
                clearInterval(interval);

                // Focusing
                inputField.focus();

                // Small delay to ensure focus
                setTimeout(() => {
                    // Simulate typing/pasting
                    // For modern ChatGPT, directly setting innerHTML/innerText on the contenteditable div often works best with input events.

                    // Forcefully setting text
                    inputField.innerHTML = `<p>${prompt.replace(/\n/g, '<br>')}</p>`;

                    // Dispatch input event to trigger React state updates
                    inputField.dispatchEvent(new Event('input', { bubbles: true }));

                    // Alternative: Clipboard API (requires permission, maybe flaky)
                    // document.execCommand('insertText', false, prompt);

                    console.log('Mostaql Job Notifier: Prompt injected');

                    // Clear the prompt from storage so it doesn't run again on reload
                    chrome.storage.local.remove(['pendingChatGptPrompt']);

                    // Try to click send after a delay
                    // MODIFICATION: Auto-send disabled as per user request.
                    /*
                    setTimeout(() => {
                        const sendButton = findSendButton();
                        if (sendButton) {
                            sendButton.click();
                            console.log('Mostaql Job Notifier: Send button clicked');
                        } else {
                            console.warn('Mostaql Job Notifier: Send button not found');
                        }
                    }, 1000); 
                    */

                }, 500);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.error('Mostaql Job Notifier: Could not find ChatGPT input field after multiple attempts.');
            }
        }, 500);
    });
}

// Run injection logic
// We wait a bit for the page to be fully interactive
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPrompt);
} else {
    // If loaded, wait a split second just in case
    setTimeout(injectPrompt, 1000);
}
