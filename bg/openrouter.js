// ==========================================
// bg/openrouter.js - OpenRouter API integration
// Depends on: chrome.storage
// ==========================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_DEFAULT_MODEL = 'openrouter/hunter-alpha';

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

async function getOpenRouterSettings() {
  const data = await chrome.storage.local.get(['settings']);
  const settings = data.settings || {};
  const apiKey = (settings.openRouterApiKey || '').trim();
  const model = (settings.openRouterModel || OPENROUTER_DEFAULT_MODEL).trim();

  if (!apiKey) {
    throw new Error('OpenRouter API key is missing. Add it from the dashboard settings.');
  }

  return { apiKey, model };
}

/**
 * Non-streaming request (kept as fallback).
 */
async function generateOpenRouterProposal(payload) {
  const messages = normalizeOpenRouterMessages(payload);
  if (messages.length === 0) {
    throw new Error('Prompt is required');
  }

  const { apiKey, model } = await getOpenRouterSettings();

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
    console.error('OpenRouter error response:', JSON.stringify(result, null, 2));
    const err = result && result.error;
    const errorMessage = err
      ? `${err.message || 'Unknown error'}${err.code ? ' (' + err.code + ')' : ''}${err.metadata ? ' — ' + JSON.stringify(err.metadata) : ''}`
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

/**
 * Streaming request — calls onChunk(accumulatedText) as tokens arrive.
 * Returns the final result object on completion.
 */
async function generateOpenRouterProposalStream(payload, onChunk) {
  const messages = normalizeOpenRouterMessages(payload);
  if (messages.length === 0) {
    throw new Error('Prompt is required');
  }

  const { apiKey, model } = await getOpenRouterSettings();

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
      stream: true
    })
  });

  if (!response.ok) {
    let errorMessage = `OpenRouter request failed with status ${response.status}`;
    try {
      const errorBody = await response.json();
      console.error('OpenRouter stream error response:', JSON.stringify(errorBody, null, 2));
      const err = errorBody && errorBody.error;
      if (err) {
        errorMessage = `${err.message || 'Unknown error'}${err.code ? ' (' + err.code + ')' : ''}${err.metadata ? ' — ' + JSON.stringify(err.metadata) : ''}`;
      }
    } catch (_) { /* ignore parse errors */ }
    throw new Error(errorMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let responseModel = model;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last potentially incomplete line in the buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') continue;

      try {
        const chunk = JSON.parse(jsonStr);
        if (chunk.model) responseModel = chunk.model;

        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        if (delta && delta.content) {
          accumulated += delta.content;
          if (onChunk) onChunk(accumulated);
        }
      } catch (_) {
        // Skip malformed SSE lines
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
      try {
        const chunk = JSON.parse(trimmed.slice(6));
        if (chunk.model) responseModel = chunk.model;
        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        if (delta && delta.content) {
          accumulated += delta.content;
          if (onChunk) onChunk(accumulated);
        }
      } catch (_) { /* ignore */ }
    }
  }

  if (!accumulated.trim()) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return {
    text: accumulated.trim(),
    model: responseModel,
    usage: null,
    provider: 'openrouter'
  };
}
