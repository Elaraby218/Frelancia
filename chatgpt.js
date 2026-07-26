// ==========================================
// Mostaql Job Notifier - ChatGPT Automation
// Inject ONLY when URL contains ?mostaql_ai=<id>
// Normal visits never inject (and clear leftover drafts we created)
// ==========================================

console.log('Mostaql Job Notifier: ChatGPT script injected (delivery v4)');

const injectedDeliveryIds = new Set();
let injectInProgress = false;

function getUrlDeliveryId() {
    try {
        return new URL(location.href).searchParams.get('mostaql_ai');
    } catch (e) {
        return null;
    }
}

function stripDeliveryParamFromUrl() {
    try {
        const url = new URL(location.href);
        if (!url.searchParams.has('mostaql_ai')) return;
        url.searchParams.delete('mostaql_ai');
        const next = url.pathname + (url.search ? url.search : '') + url.hash;
        history.replaceState(null, '', next);
    } catch (e) { /* ignore */ }
}

function findChatInput() {
    const selectors = [
        '#prompt-textarea',
        'textarea[name="prompt-textarea"]',
        'textarea[data-id="root"]',
        'form textarea',
        'main textarea',
        'textarea'
    ];

    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) return el;
    }

    const editables = document.querySelectorAll('div[contenteditable="true"]');
    for (const el of editables) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20) return el;
    }
    return null;
}

function getInputText(el) {
    if (!el) return '';
    if (typeof el.value === 'string') return el.value;
    return (el.innerText || el.textContent || '').trim();
}

function writePromptToInput(inputField, prompt) {
    inputField.focus();

    const isEditable = inputField.isContentEditable ||
        inputField.getAttribute('contenteditable') === 'true';

    if (isEditable) {
        inputField.innerHTML = '';
        try {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, prompt);
        } catch (e) {
            inputField.textContent = prompt;
        }
    } else {
        const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
        const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(inputField, prompt);
        } else {
            inputField.value = prompt;
        }
    }

    inputField.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: prompt
    }));
    inputField.dispatchEvent(new Event('change', { bubbles: true }));
}

function clearChatInput(inputField) {
    if (!inputField) return;
    inputField.focus();

    const isEditable = inputField.isContentEditable ||
        inputField.getAttribute('contenteditable') === 'true';

    if (isEditable) {
        inputField.innerHTML = '';
        try {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
        } catch (e) { /* ignore */ }
        inputField.innerHTML = '<p><br></p>';
    } else {
        const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
        const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(inputField, '');
        } else {
            inputField.value = '';
        }
    }

    inputField.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    inputField.dispatchEvent(new Event('change', { bubbles: true }));
}

function waitForChatInput(maxAttempts = 40, intervalMs = 500) {
    return new Promise((resolve) => {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            const input = findChatInput();
            if (input) {
                clearInterval(timer);
                resolve(input);
            } else if (attempts >= maxAttempts) {
                clearInterval(timer);
                resolve(null);
            }
        }, intervalMs);
    });
}

function showInjectToast() {
    if (document.getElementById('mostaql-ai-inject-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'mostaql-ai-inject-toast';
    toast.textContent = 'Mostaql: تم لصق الأمر مرة واحدة';
    Object.assign(toast.style, {
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: '2147483647',
        background: '#0b6e4f',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: '8px',
        fontSize: '13px',
        fontFamily: 'Segoe UI, Tahoma, sans-serif',
        boxShadow: '0 4px 16px rgba(0,0,0,.25)'
    });
    (document.body || document.documentElement).appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

async function injectDelivery(delivery) {
    if (!delivery || !delivery.text) return false;
    if (injectedDeliveryIds.has(delivery.id)) return true;
    if (injectInProgress) return false;

    injectInProgress = true;
    injectedDeliveryIds.add(delivery.id);

    try {
        console.log('Mostaql Job Notifier: injecting delivery', delivery.id);
        const inputField = await waitForChatInput();
        if (!inputField) {
            console.error('Mostaql Job Notifier: ChatGPT input not found');
            injectedDeliveryIds.delete(delivery.id);
            return false;
        }

        await new Promise((r) => setTimeout(r, 300));
        writePromptToInput(inputField, delivery.text);

        try {
            await chrome.runtime.sendMessage({
                action: 'markAiComposerForClear',
                preview: delivery.text.slice(0, 120)
            });
        } catch (e) { /* ignore */ }

        showInjectToast();
        console.log('Mostaql Job Notifier: Prompt injected successfully');
        return true;
    } catch (err) {
        console.error('Mostaql Job Notifier: inject failed', err);
        injectedDeliveryIds.delete(delivery.id);
        return false;
    } finally {
        injectInProgress = false;
    }
}

/**
 * Only path that injects: URL has ?mostaql_ai=...
 */
async function handleTokenizedOpen() {
    const token = getUrlDeliveryId();
    if (!token) return false;
    if (!chrome.runtime?.id) return false;

    stripDeliveryParamFromUrl();

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'claimAiPrompt',
            expectedId: token
        });
        const delivery = response && response.delivery;
        if (!delivery) {
            console.log('Mostaql Job Notifier: token present but no matching delivery');
            return false;
        }
        return injectDelivery(delivery);
    } catch (err) {
        console.warn('Mostaql Job Notifier: claim failed', err);
        return false;
    }
}

/**
 * Normal ChatGPT visit: never inject.
 * Discard leftovers + clear composer draft left from a previous ذكاء inject.
 */
async function handleNormalVisit() {
    if (!chrome.runtime?.id) return;

    try {
        await chrome.runtime.sendMessage({ action: 'discardAiPrompt' });
    } catch (e) { /* ignore */ }

    let flag = null;
    try {
        const response = await chrome.runtime.sendMessage({ action: 'consumeComposerClearFlag' });
        flag = response && response.flag;
    } catch (e) { /* ignore */ }

    if (!flag) {
        console.log('Mostaql Job Notifier: normal visit — no inject');
        return;
    }

    console.log('Mostaql Job Notifier: clearing previous ذكاء draft from composer');
    const preview = (flag.preview || '').trim();

    // ChatGPT may restore drafts after hydration — clear a few times
    for (let i = 0; i < 12; i++) {
        const input = findChatInput();
        if (input) {
            const text = getInputText(input);
            if (!text || (preview && text.includes(preview.slice(0, 40))) || i < 3) {
                clearChatInput(input);
            }
        }
        await new Promise((r) => setTimeout(r, 400));
    }
}

// Claim token as early as document_start (before ChatGPT can strip the query param)
const earlyToken = getUrlDeliveryId();
let earlyClaimPromise = null;
if (earlyToken && chrome.runtime?.id) {
    stripDeliveryParamFromUrl();
    earlyClaimPromise = chrome.runtime.sendMessage({
        action: 'claimAiPrompt',
        expectedId: earlyToken
    }).catch((err) => {
        console.warn('Mostaql Job Notifier: early claim failed', err);
        return null;
    });
}

async function start() {
    // Always wipe legacy local keys
    try {
        chrome.storage.local.remove(['pendingChatGptPrompt', 'pendingChatGptPromptMeta']);
    } catch (e) { /* ignore */ }

    if (earlyClaimPromise) {
        try {
            const response = await earlyClaimPromise;
            const delivery = response && response.delivery;
            if (delivery) {
                await injectDelivery(delivery);
                return;
            }
        } catch (e) {
            console.warn(e);
        }
        // Token was present but claim failed — do not fall through to inject anything else
        console.log('Mostaql Job Notifier: tokenized open produced no delivery');
        return;
    }

    if (getUrlDeliveryId()) {
        await handleTokenizedOpen();
        return;
    }

    await handleNormalVisit();
}

// Legacy message kept as no-op safety (injection is URL-token only now)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'aiPromptAvailable') {
        sendResponse({ ok: false, reason: 'token-only' });
        return false;
    }
    return false;
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
