// ==========================================
// bg/openrouter.js - OpenRouter API integration
// Depends on: chrome.storage
// ==========================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-4o-mini';

function extractOpenRouterMessageContent(message) {
  if (!message) return '';

  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part.text === 'string') return part.text;
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

function normalizeOpenRouterMessages(payload) {
  if (Array.isArray(payload) && payload.length > 0) {
    return payload
      .filter((message) => message && typeof message.role === 'string' && typeof message.content === 'string' && message.content.trim())
      .map((message) => ({
        role: message.role,
        content: message.content.trim()
      }));
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.messages)) {
    return normalizeOpenRouterMessages(payload.messages);
  }

  if (payload && typeof payload === 'object' && typeof payload.prompt === 'string' && payload.prompt.trim()) {
    return [{ role: 'user', content: payload.prompt.trim() }];
  }

  if (typeof payload === 'string' && payload.trim()) {
    return [{ role: 'user', content: payload.trim() }];
  }

  return [];
}

async function generateOpenRouterProposal(payload) {
  const messages = normalizeOpenRouterMessages(payload);
  if (messages.length === 0) {
    throw new Error('Prompt is required');
  }

  const data = await chrome.storage.local.get(['settings']);
  const settings = data.settings || {};
  const apiKey = (settings.openRouterApiKey || '').trim();
  const model = (settings.openRouterModel || OPENROUTER_DEFAULT_MODEL).trim();

  if (!apiKey) {
    throw new Error('OpenRouter API key is missing. Add it from the dashboard settings.');
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/Elaraby218/Frelancia',
      'X-Title': 'Frelancia'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      stream: false
    })
  });

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    if (!response.ok) {
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }
    throw error;
  }

  if (!response.ok) {
    const errorMessage = result && result.error && result.error.message
      ? result.error.message
      : `OpenRouter request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  const choice = result && Array.isArray(result.choices) ? result.choices[0] : null;
  const text = extractOpenRouterMessageContent(choice && choice.message);

  if (!text) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return {
    text,
    model: result.model || model,
    usage: result.usage || null,
    provider: 'openrouter'
  };
}
