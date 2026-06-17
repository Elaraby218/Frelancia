// ==========================================
// shared/chat-utils.js — Reusable chat helper functions
// Shared between popup chat and any future chat surfaces
// ==========================================

const CHAT_STORAGE_KEY = 'openRouterChatSession';
const CHAT_PENDING_KEY = 'openRouterPendingChat';

/**
 * Copy text to clipboard and optionally flash a button label.
 */
async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      const original = button.textContent;
      button.textContent = 'تم';
      setTimeout(() => { button.textContent = original; }, 1000);
    }
  } catch (_) {
    // silently fail — caller can handle via status
  }
}

/**
 * Build autofill payload from a proposal and project metadata.
 */
function buildAutofillPayload(proposalText, project, sessionProjectId) {
  const durationMatch = String(project.duration || '').match(/\d+/);
  const budgetMatch = String(project.budget || '').replace(/,/g, '').match(/\d+(\.\d+)?/);

  return {
    projectId: project.id || sessionProjectId || '',
    amount: budgetMatch ? parseFloat(budgetMatch[0]) : 0,
    duration: durationMatch ? parseInt(durationMatch[0], 10) : 0,
    proposal: proposalText,
    timestamp: Date.now()
  };
}

/**
 * Build a project context summary for the AI system prompt.
 */
function buildProjectContextSummary(project) {
  if (!project) return '';

  return [
    'هذه المحادثة مرتبطة بمشروع مستقل محدد. استخدم هذا السياق في كل رد.',
    `عنوان المشروع: ${project.title || 'غير معروف'}`,
    `رابط المشروع: ${project.url || 'غير معروف'}`,
    `الميزانية: ${project.budget || 'غير معروف'}`,
    `مدة التنفيذ: ${project.duration || 'غير معروف'}`,
    `صاحب العمل: ${project.clientName || 'غير معروف'}`,
    `معرف المشروع: ${project.id || 'غير معروف'}`,
    'إذا طُلب منك كتابة عرض، فاكتب عرضاً جاهزاً للإرسال وبالعربية ما لم يطلب المستخدم غير ذلك.'
  ].join('\n');
}

/**
 * Prepare messages for the OpenRouter API:
 * - Filter invalid/pending messages
 * - Strip error messages
 * - Keep last N messages
 * - Prepend project context to first user message
 */
function prepareMessagesForApi(messages, contextSummary, maxMessages) {
  const limit = maxMessages || 8;
  const cleaned = messages
    .filter((m) => m && !m.pending && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: String(m.content || '').trim() }))
    .filter((m) => m.content)
    .filter((m) => !(m.role === 'assistant' && m.content.startsWith('تعذر توليد الرد:')))
    .slice(-limit);

  if (cleaned.length === 0) return cleaned;

  if (contextSummary && cleaned[0].role === 'user') {
    cleaned[0] = {
      role: 'user',
      content: `${contextSummary}\n\nطلب المستخدم:\n${cleaned[0].content}`
    };
  }

  return cleaned;
}
