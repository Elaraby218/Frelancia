// ==========================================
// bg/ai-chat.js — One-shot ChatGPT prompt delivery
//
// Rules:
// 1) Prompt is stored only in chrome.storage.session
// 2) ChatGPT may inject ONLY when the tab URL has ?mostaql_ai=<id>
// 3) Normal ChatGPT opens (no query param) never inject, and discard leftovers
// ==========================================

const AI_PROMPT_SESSION_KEY = 'aiPromptDelivery';
const CLEAR_COMPOSER_KEY = 'mostaqlClearComposer';
const LEGACY_LOCAL_KEYS = ['pendingChatGptPrompt', 'pendingChatGptPromptMeta', 'consumedChatGptPromptIds'];
const AI_PROMPT_MAX_AGE_MS = 2 * 60 * 1000;

async function clearLegacyChatGptPromptStorage() {
  try {
    await chrome.storage.local.remove(LEGACY_LOCAL_KEYS);
  } catch (e) {
    console.warn('Failed clearing legacy ChatGPT prompt keys', e);
  }
}

async function clearSessionDelivery() {
  try {
    await chrome.storage.session.remove([AI_PROMPT_SESSION_KEY]);
  } catch (e) { /* ignore */ }
}

function createDelivery(prompt) {
  const id = (crypto.randomUUID && crypto.randomUUID()) ||
    (`ai_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  return { id, text: prompt, at: Date.now() };
}

function buildAiChatUrl(baseUrl, deliveryId) {
  const url = new URL(baseUrl || 'https://chatgpt.com/');
  url.searchParams.set('mostaql_ai', deliveryId);
  return url.toString();
}

async function getAiChatBaseUrl() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {};
  return settings.aiChatUrl || 'https://chatgpt.com/';
}

async function findAiChatTab() {
  const tabs = await chrome.tabs.query({
    url: ['https://chatgpt.com/*', 'https://chat.openai.com/*']
  });
  return tabs && tabs.length ? tabs[0] : null;
}

/**
 * Claim prompt only when the content script presents the matching URL token.
 * Always removes the session entry (one-shot).
 */
async function claimAiPromptDelivery(expectedId) {
  const data = await chrome.storage.session.get([AI_PROMPT_SESSION_KEY]);
  const delivery = data[AI_PROMPT_SESSION_KEY];

  // Always consume — prevents reopen from seeing leftovers
  await chrome.storage.session.remove([AI_PROMPT_SESSION_KEY]);

  if (!delivery || !delivery.text) {
    return null;
  }

  if (expectedId && delivery.id !== expectedId) {
    console.log('AI chat: URL token mismatch, discard', expectedId, delivery.id);
    return null;
  }

  if (delivery.at && (Date.now() - delivery.at > AI_PROMPT_MAX_AGE_MS)) {
    console.log('AI chat: discarded stale prompt delivery');
    return null;
  }

  console.log('AI chat: prompt claimed', delivery.id);
  return delivery;
}

/** Normal ChatGPT visit: drop any orphaned delivery without injecting */
async function discardAiPromptDelivery() {
  await clearSessionDelivery();
  return { success: true };
}

async function markComposerForClear(preview) {
  await chrome.storage.session.set({
    [CLEAR_COMPOSER_KEY]: {
      preview: (preview || '').slice(0, 120),
      at: Date.now()
    }
  });
}

async function consumeComposerClearFlag() {
  const data = await chrome.storage.session.get([CLEAR_COMPOSER_KEY]);
  const flag = data[CLEAR_COMPOSER_KEY];
  if (!flag) return null;
  await chrome.storage.session.remove([CLEAR_COMPOSER_KEY]);
  return flag;
}

/**
 * ذكاء click: store one-shot delivery and navigate ChatGPT with ?mostaql_ai=id
 */
async function openAiChatWithPrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Missing prompt');
  }

  await clearLegacyChatGptPromptStorage();
  await clearSessionDelivery();

  const delivery = createDelivery(prompt);
  await chrome.storage.session.set({ [AI_PROMPT_SESSION_KEY]: delivery });
  console.log('AI chat: stored one-shot delivery', delivery.id);

  const targetUrl = buildAiChatUrl(await getAiChatBaseUrl(), delivery.id);
  const existing = await findAiChatTab();

  let tab;
  if (existing) {
    // Force navigation so content script runs with the token (no stale draft tab state)
    tab = await chrome.tabs.update(existing.id, { url: targetUrl, active: true });
    if (existing.windowId != null) {
      try {
        await chrome.windows.update(existing.windowId, { focused: true });
      } catch (e) { /* ignore */ }
    }
  } else {
    tab = await chrome.tabs.create({ url: targetUrl, active: true });
  }

  return { success: true, tabId: tab && tab.id, deliveryId: delivery.id };
}

clearLegacyChatGptPromptStorage();
