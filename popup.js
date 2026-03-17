// ==========================================
// popup.js — Popup entry point
// Depends on: shared/markdown.js, shared/chat-utils.js (loaded via <script> tags)
// ==========================================

let popupChatState = {
  project: null,
  messages: [],
  model: '',
  loading: false,
  sessionProjectId: '',
  contextSummary: ''
};

// ==========================================
// Initialisation
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  loadStats();
  setupOverviewListeners();
  setupChatListeners();
  setupTabSwitching();
  await loadPopupChatState();
  setInterval(loadStats, 30000);
});

// ==========================================
// Tab Switching
// ==========================================

function setupTabSwitching() {
  document.querySelectorAll('.popup-tab').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });

  chrome.storage.local.get(['popupActiveTab'], (data) => {
    activateTab(data.popupActiveTab || 'overview');
  });
}

function activateTab(tabId) {
  document.querySelectorAll('.popup-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });

  document.querySelectorAll('.popup-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${tabId}-tab`);
  });

  chrome.storage.local.set({ popupActiveTab: tabId });
}

// ==========================================
// Overview Tab — Stats & Actions
// ==========================================

function loadStats() {
  chrome.storage.local.get(['stats', 'seenJobs'], (data) => {
    const stats = data.stats || {};
    const seenJobs = data.seenJobs || [];

    if (stats.lastCheck) {
      const diffMinutes = Math.floor((Date.now() - new Date(stats.lastCheck)) / 60000);
      let timeText;
      if (diffMinutes < 1)        timeText = 'الآن';
      else if (diffMinutes < 60)  timeText = `منذ ${diffMinutes} دقيقة`;
      else if (diffMinutes < 1440) timeText = `منذ ${Math.floor(diffMinutes / 60)} ساعة`;
      else                        timeText = new Date(stats.lastCheck).toLocaleDateString('ar-SA');
      document.getElementById('lastCheck').textContent = `آخر فحص: ${timeText}`;
    } else {
      document.getElementById('lastCheck').textContent = 'لم يتم الفحص بعد';
    }

    document.getElementById('todayCount').textContent = stats.todayCount || 0;
    document.getElementById('totalSeen').textContent = seenJobs.length;
  });
}

function setupOverviewListeners() {
  const dashboardBtn = document.getElementById('open-dashboard-btn');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'dashboard.html' });
    });
  }

  const checkBtn = document.getElementById('checkNowBtn');
  if (checkBtn) {
    checkBtn.addEventListener('click', () => {
      const originalContent = checkBtn.innerHTML;
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<span>جاري الفحص...</span>';

      chrome.runtime.sendMessage({ action: 'checkNow' }, () => {
        checkBtn.disabled = false;
        checkBtn.innerHTML = originalContent;
        loadStats();
      });
    });
  }

  const connBtn = document.getElementById('checkConnectionBtn');
  const connReport = document.getElementById('connectionReport');
  if (connBtn) {
    connBtn.addEventListener('click', () => {
      const originalContent = connBtn.innerHTML;
      connBtn.disabled = true;
      connBtn.textContent = 'جاري التشخيص...';
      connReport.classList.add('hidden');

      chrome.runtime.sendMessage({ action: 'debugFetch' }, (response) => {
        connBtn.disabled = false;
        connBtn.innerHTML = originalContent;
        connReport.classList.remove('hidden');

        if (response && response.success) {
          connReport.className = 'connection-report success';
          connReport.textContent = `✓ الاتصال ناجح. تم جلب ${response.length} بايت من موقع مستقل.`;
        } else {
          connReport.className = 'connection-report error';
          connReport.textContent = `✗ فشل الاتصال: ${response?.error || 'خطأ غير معروف'}. حاول فتح Mostaql.com أولاً.`;
        }
      });
    });
  }

  const toggleBtn = document.getElementById('toggleNotificationsBtn');
  if (toggleBtn) {
    chrome.storage.local.get(['notificationsEnabled'], (data) => {
      updateToggleUI(toggleBtn, data.notificationsEnabled !== false);
    });

    toggleBtn.addEventListener('click', () => {
      chrome.storage.local.get(['notificationsEnabled'], (data) => {
        const newState = !(data.notificationsEnabled !== false);
        chrome.storage.local.set({ notificationsEnabled: newState }, () => {
          updateToggleUI(toggleBtn, newState);
        });
      });
    });
  }
}

function updateToggleUI(button, isEnabled) {
  if (isEnabled) {
    button.className = 'btn secondary';
    button.innerHTML = '<i class="fas fa-bell"></i><span>الإشعارات: مفعلة</span>';
  } else {
    button.className = 'btn toggle-off';
    button.innerHTML = '<i class="fas fa-bell-slash"></i><span>الإشعارات: متوقفة</span>';
  }
}

// ==========================================
// AI Chat Tab — State Management
// ==========================================

function setupChatListeners() {
  document.getElementById('sendChatBtn')?.addEventListener('click', sendChatMessage);
  document.getElementById('newChatBtn')?.addEventListener('click', clearChat);
  document.getElementById('copyLastReplyBtn')?.addEventListener('click', () => {
    const msg = getLastAssistantMessage();
    if (msg) copyToClipboard(msg.content);
  });
  document.getElementById('applyLastReplyBtn')?.addEventListener('click', () => {
    const msg = getLastAssistantMessage();
    if (msg) applyProposalToProject(msg.content);
  });

  document.getElementById('chatComposer')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes[CHAT_PENDING_KEY]?.newValue) {
      await loadPopupChatState();
      activateTab('ai-chat');
    }

    if (changes.popupActiveTab?.newValue === 'ai-chat') {
      activateTab('ai-chat');
    }

    // Background updated the chat session (e.g. API response arrived)
    if (changes[CHAT_STORAGE_KEY]?.newValue) {
      await reloadChatFromStorage();
    }
  });
}

function setChatStatus(text) {
  document.getElementById('chatStatus').textContent = text;
}

function resetChatForProject(project, initialPrompt) {
  popupChatState.project = project || null;
  popupChatState.sessionProjectId = project?.id || '';
  popupChatState.contextSummary = buildProjectContextSummary(project);
  const prompt = String(initialPrompt || '').trim();
  popupChatState.messages = prompt ? [{ role: 'user', content: prompt }] : [];
}

function getLastAssistantMessage() {
  const replies = popupChatState.messages.filter((m) => m.role === 'assistant' && !m.pending && m.content);
  return replies.length ? replies[replies.length - 1] : null;
}

// ==========================================
// AI Chat Tab — Persistence
// ==========================================

async function persistPopupChatState() {
  await chrome.storage.local.set({
    [CHAT_STORAGE_KEY]: {
      project: popupChatState.project,
      messages: popupChatState.messages,
      model: popupChatState.model,
      sessionProjectId: popupChatState.sessionProjectId,
      contextSummary: popupChatState.contextSummary,
      updatedAt: Date.now()
    }
  });
}

async function loadPopupChatState() {
  const data = await chrome.storage.local.get(['settings', CHAT_STORAGE_KEY, CHAT_PENDING_KEY]);
  const settings = data.settings || {};
  const saved = data[CHAT_STORAGE_KEY] || null;
  const pending = data[CHAT_PENDING_KEY] || null;

  popupChatState.model = settings.openRouterModel || saved?.model || 'openai/gpt-4o-mini';
  document.getElementById('chatModel').textContent = popupChatState.model;

  if (pending) {
    const initialPrompt = String(pending.initialPrompt || '').trim();
    resetChatForProject(pending.project || null, initialPrompt);

    await chrome.storage.local.remove([CHAT_PENDING_KEY]);
    document.getElementById('chatComposer').value = '';
    renderProjectInfo();
    renderChatMessages();

    await persistPopupChatState();
    if (popupChatState.messages.length > 0) {
      await requestAssistantReply();
    } else {
      setChatStatus('تعذر تحميل prompt المشروع');
    }
    return;
  }

  popupChatState.project = saved?.project || null;
  popupChatState.messages = Array.isArray(saved?.messages) ? saved.messages : [];
  popupChatState.sessionProjectId = saved?.sessionProjectId || saved?.project?.id || '';
  popupChatState.contextSummary = saved?.contextSummary || buildProjectContextSummary(saved?.project || null);
  popupChatState.loading = popupChatState.messages.some((m) => m.pending);

  if (popupChatState.loading) {
    setChatStatus('جاري التوليد...');
  }

  renderProjectInfo();
  renderChatMessages();
}

async function reloadChatFromStorage() {
  const data = await chrome.storage.local.get(['settings', CHAT_STORAGE_KEY]);
  const settings = data.settings || {};
  const saved = data[CHAT_STORAGE_KEY] || null;

  popupChatState.model = settings.openRouterModel || saved?.model || popupChatState.model;
  document.getElementById('chatModel').textContent = popupChatState.model;

  const prevMessages = popupChatState.messages;
  const newMessages = Array.isArray(saved?.messages) ? saved.messages : [];

  popupChatState.project = saved?.project || popupChatState.project;
  popupChatState.messages = newMessages;
  popupChatState.sessionProjectId = saved?.sessionProjectId || popupChatState.sessionProjectId;
  popupChatState.contextSummary = saved?.contextSummary || popupChatState.contextSummary;

  const wasLoading = popupChatState.loading;
  popupChatState.loading = newMessages.some((m) => m.pending);

  setChatStatus(popupChatState.loading ? 'جاري التوليد...' : 'جاهز');

  // Detect streaming update: same message count, last message is pending
  // with content changing — use lightweight bubble update instead of full rebuild
  const isStreamingUpdate =
    popupChatState.loading &&
    newMessages.length === prevMessages.length &&
    newMessages.length > 0 &&
    newMessages[newMessages.length - 1].pending &&
    newMessages[newMessages.length - 1].content;

  if (isStreamingUpdate) {
    updateStreamingBubble();
  } else {
    renderProjectInfo();
    renderChatMessages();
  }
}

// ==========================================
// AI Chat Tab — Rendering
// ==========================================

function renderProjectInfo() {
  const project = popupChatState.project;
  if (!project) {
    document.getElementById('chatProjectTitle').textContent = 'بانتظار مشروع...';
    document.getElementById('chatProjectMeta').textContent = 'اضغط زر الذكاء من صفحة المشروع لبدء المحادثة هنا.';
    return;
  }

  document.getElementById('chatProjectTitle').textContent = project.title || 'مشروع مستقل';
  document.getElementById('chatProjectMeta').textContent =
    [project.clientName, project.budget, project.duration].filter(Boolean).join(' - ');
}

function renderChatMessages() {
  const container = document.getElementById('chatMessages');
  const messages = popupChatState.messages || [];

  if (messages.length === 0) {
    container.innerHTML = '<div class="chat-empty">نفس الـ prompt الجاهز سيظهر هنا عند الضغط على زر الذكاء من صفحة المشروع.</div>';
    return;
  }

  container.innerHTML = messages.map((msg, i) => {
    let body;
    if (msg.pending && !msg.content) {
      body = '<div class="typing"><span></span><span></span><span></span></div>';
    } else if (msg.pending && msg.content) {
      body = renderMarkdown(msg.content) + '<div class="typing"><span></span><span></span><span></span></div>';
    } else if (msg.role === 'assistant') {
      body = renderMarkdown(msg.content);
    } else {
      body = `<p>${escapeHtml(msg.content)}</p>`;
    }

    const actions = (msg.role === 'assistant' && !msg.pending)
      ? '<div class="chat-actions"><button class="mini-btn" data-action="copy">نسخ</button><button class="mini-btn" data-action="apply">تعبئة</button></div>'
      : '';

    return `<article class="chat-message ${escapeHtml(msg.role)}" data-index="${i}">` +
      `<div class="chat-bubble">` +
        `<div class="chat-role">${msg.role === 'user' ? 'You' : 'AI'}</div>` +
        `<div class="chat-body">${body}</div>${actions}` +
      `</div></article>`;
  }).join('');

  container.querySelectorAll('.mini-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.closest('.chat-message').dataset.index);
      const msg = popupChatState.messages[idx];
      if (!msg) return;
      if (btn.dataset.action === 'copy') copyToClipboard(msg.content, btn);
      if (btn.dataset.action === 'apply') applyProposalToProject(msg.content);
    });
  });

  container.scrollTop = container.scrollHeight;
}

/**
 * Lightweight update for streaming: only re-renders the last pending message
 * bubble instead of rebuilding the entire message list.
 */
function updateStreamingBubble() {
  const container = document.getElementById('chatMessages');
  const messages = popupChatState.messages || [];
  const lastMsg = messages[messages.length - 1];

  if (!lastMsg || !lastMsg.pending) return;

  const lastArticle = container.querySelector(`[data-index="${messages.length - 1}"]`);
  if (!lastArticle) {
    renderChatMessages();
    return;
  }

  const bodyEl = lastArticle.querySelector('.chat-body');
  if (!bodyEl) return;

  if (lastMsg.content) {
    bodyEl.innerHTML = renderMarkdown(lastMsg.content) +
      '<div class="typing"><span></span><span></span><span></span></div>';
  }

  container.scrollTop = container.scrollHeight;
}

// ==========================================
// AI Chat Tab — Messaging
// ==========================================

async function sendChatMessage() {
  const composer = document.getElementById('chatComposer');
  const text = composer.value.trim();
  if (!text || popupChatState.loading) return;

  popupChatState.messages.push({ role: 'user', content: text });
  composer.value = '';
  renderChatMessages();
  await persistPopupChatState();
  await requestAssistantReply();
}

async function requestAssistantReply() {
  if (popupChatState.loading) return;
  popupChatState.loading = true;
  setChatStatus('جاري التوليد...');

  popupChatState.messages.push({ role: 'assistant', content: '', pending: true });
  renderChatMessages();
  await persistPopupChatState();

  const outbound = prepareMessagesForApi(
    popupChatState.messages,
    popupChatState.contextSummary
  );

  chrome.runtime.sendMessage({
    action: 'generateOpenRouterProposal',
    messages: outbound
  }, () => {
    // Background has already written the result to storage.
    // The storage.onChanged listener will call reloadChatFromStorage().
    // This callback is only needed to suppress chrome.runtime.lastError.
    void chrome.runtime.lastError;
  });
}

async function clearChat() {
  resetChatForProject(popupChatState.project, '');
  document.getElementById('chatComposer').value = '';
  setChatStatus('تم بدء محادثة جديدة');
  renderProjectInfo();
  renderChatMessages();
  await persistPopupChatState();
}

// ==========================================
// AI Chat Tab — Autofill Bridge
// ==========================================

function getRenderedPlainText(text) {
  const temp = document.createElement('div');
  temp.className = 'chat-bubble';
  temp.style.cssText = 'position:fixed;left:-99999px;top:0;width:360px';
  temp.innerHTML = renderMarkdown(text || '');
  document.body.appendChild(temp);

  const plain = (temp.innerText || temp.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  temp.remove();
  return plain;
}

async function applyProposalToProject(proposalText) {
  const projectId = popupChatState.project?.id || popupChatState.sessionProjectId || '';
  const projectUrl = popupChatState.project?.url || '';

  if (!projectId) {
    setChatStatus('لا يوجد مشروع مرتبط');
    return;
  }

  const cleanProposal = getRenderedPlainText(proposalText);
  const payload = buildAutofillPayload(cleanProposal, popupChatState.project || {}, popupChatState.sessionProjectId);
  await chrome.storage.local.set({ mostaql_pending_autofill: payload });
  setChatStatus('تم تجهيز تعبئة العرض');

  const tabs = await chrome.tabs.query({ url: 'https://mostaql.com/*' });
  const target = tabs.find((tab) => tab.url && tab.url.includes(projectId));
  if (target?.id) {
    await chrome.tabs.update(target.id, { active: true });
  } else if (projectUrl) {
    await chrome.tabs.create({ url: projectUrl });
  }
}
