// ==========================================
// Mostaql Job Notifier - Popup Script
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize
  loadSettings();
  loadStats();
  loadTrackedProjects();
  loadProposalTemplate();
  loadPrompts();
  setupTabs();
  setupEventListeners();
});

// ==========================================
// Tabs Navigation
// ==========================================
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      // Update buttons
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === tabId) {
          content.classList.add('active');
        }
      });
    });
  });
}

// ==========================================
// Load Settings
// ==========================================
function loadSettings() {
  chrome.storage.local.get(['settings'], (data) => {
    const settings = data.settings || {};

    // Notification settings
    document.getElementById('development').checked = settings.development !== false;
    document.getElementById('ai').checked = settings.ai !== false;
    document.getElementById('all').checked = settings.all === true;
    document.getElementById('sound').checked = settings.sound !== false;
    document.getElementById('interval').value = settings.interval || 1;
    document.getElementById('aiChatUrl').value = settings.aiChatUrl || 'https://chatgpt.com/';
    document.getElementById('telegramToken').value = settings.telegramToken || '';
    document.getElementById('telegramChatId').value = settings.telegramChatId || '';
    
    // Quiet Hours
    const qEnabled = settings.quietHoursEnabled === true;
    document.getElementById('quietHoursEnabled').checked = qEnabled;
    document.getElementById('quietHoursStart').value = settings.quietHoursStart || '00:00';
    document.getElementById('quietHoursEnd').value = settings.quietHoursEnd || '07:00';
    if (qEnabled) document.getElementById('quietHoursFields').classList.remove('hidden');
    
    // Advanced filters
    document.getElementById('keywordsInclude').value = settings.keywordsInclude || '';
    document.getElementById('keywordsExclude').value = settings.keywordsExclude || '';
    document.getElementById('minBudget').value = settings.minBudget || '';
    document.getElementById('minHiringRate').value = settings.minHiringRate || '';
    document.getElementById('maxDuration').value = settings.maxDuration || '';
    document.getElementById('minClientAge').value = settings.minClientAge || '';
  });
}

// ==========================================
// Load Stats
// ==========================================
function loadStats() {
  chrome.storage.local.get(['stats', 'seenJobs'], (data) => {
    const stats = data.stats || {};
    const seenJobs = data.seenJobs || [];

    // Last check time
    if (stats.lastCheck) {
      const lastCheck = new Date(stats.lastCheck);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastCheck) / 60000);

      let timeText;
      if (diffMinutes < 1) {
        timeText = 'الآن';
      } else if (diffMinutes < 60) {
        timeText = `منذ ${diffMinutes} دقيقة`;
      } else {
        timeText = lastCheck.toLocaleTimeString('ar-SA');
      }

      document.getElementById('lastCheck').textContent = timeText;
    } else {
      document.getElementById('lastCheck').textContent = 'لم يتم الفحص بعد';
    }

    // Today count
    document.getElementById('todayCount').textContent = stats.todayCount || 0;

    // Total seen
    document.getElementById('totalSeen').textContent = seenJobs.length;
  });
}

// ==========================================
// Tracked Projects
// ==========================================
function loadTrackedProjects() {
  const container = document.getElementById('trackedProjectsList');
  if (!container) return;

  chrome.storage.local.get(['trackedProjects'], (data) => {
    const tracked = data.trackedProjects || {};
    const ids = Object.keys(tracked);

    if (ids.length === 0) {
      container.innerHTML = '<p class="empty-msg">لا توجد مشاريع مراقبة حالياً</p>';
      return;
    }

    container.innerHTML = '';
    ids.forEach(id => {
      const project = tracked[id];
      const item = document.createElement('div');
      item.className = 'tracked-item';
      const statusClass = getStatusClass(project.status);
      item.innerHTML = `
        <div class="tracked-info">
          <div class="tracked-title" title="${project.title}">${project.title}</div>
          <div class="tracked-meta">
            <span class="status-tag ${statusClass}">${project.status}</span>
            <span class="comm-tag">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 4px;">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg> 
              ${project.communications}
            </span>
          </div>
        </div>
        <div class="tracked-actions">
          <button class="btn-icon untrack-btn" data-id="${id}" title="إلغاء المراقبة">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <a href="${project.url}" target="_blank" class="btn-icon link-btn" title="فتح المشروع">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </div>
      `;
      container.appendChild(item);
    });

    // Setup untrack buttons
    container.querySelectorAll('.untrack-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        untrackProject(id);
      });
    });
  });
}

function getStatusClass(status) {
  if (status.includes('مفتوح')) return 'open';
  if (status.includes('التنفيذ')) return 'underway';
  if (status.includes('مغلق')) return 'closed';
  if (status.includes('ملغي')) return 'cancelled';
  if (status.includes('مكتمل')) return 'completed';
  return '';
}

function untrackProject(id) {
  chrome.storage.local.get(['trackedProjects'], (data) => {
    const tracked = data.trackedProjects || {};
    if (tracked[id]) {
      delete tracked[id];
      chrome.storage.local.set({ trackedProjects: tracked }, () => {
        loadTrackedProjects();
      });
    }
  });
}

// ==========================================
// Proposal Template
// ==========================================
function loadProposalTemplate() {
  chrome.storage.local.get(['proposalTemplate'], (data) => {
    const template = data.proposalTemplate || '';
    const textarea = document.getElementById('proposalTemplate');
    if (textarea) textarea.value = template;
  });
}

function saveProposalTemplate() {
  const template = document.getElementById('proposalTemplate').value.trim();
  chrome.storage.local.set({ proposalTemplate: template }, () => {
    const msg = document.getElementById('proposalSaved');
    if (msg) {
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 3000);
    }
  });
}

// ==========================================
// Event Listeners
// ==========================================
function setupEventListeners() {
  // Notification toggles - auto save
  ['development', 'ai', 'all', 'sound', 'quietHoursEnabled'].forEach(id => {
    document.getElementById(id).addEventListener('change', (e) => {
      if (id === 'quietHoursEnabled') {
        document.getElementById('quietHoursFields').classList.toggle('hidden', !e.target.checked);
      }
      saveNotificationSettings();
    });
  });

  // Advanced filters - auto save on input
  ['keywordsInclude', 'keywordsExclude', 'minBudget', 'minHiringRate', 'maxDuration', 'minClientAge', 'telegramToken', 'telegramChatId', 'quietHoursStart', 'quietHoursEnd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveNotificationSettings);
  });

  // Interval change
  document.getElementById('interval').addEventListener('change', (e) => {
    saveNotificationSettings();
    chrome.runtime.sendMessage({
      action: 'updateAlarm',
      interval: parseInt(e.target.value)
    });
  });

  // Check now button
  document.getElementById('checkNowBtn').addEventListener('click', checkNow);

  // Clear history button
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);

  // Test notification button
  document.getElementById('testNotificationBtn').addEventListener('click', testNotification);

  // Test sound button
  document.getElementById('testSoundBtn').addEventListener('click', testSound);

  // Debug button
  document.getElementById('debugBtn').addEventListener('click', debugConnection);

  // Proposal template save
  const saveProposalBtn = document.getElementById('saveProposalBtn');
  if (saveProposalBtn) {
    saveProposalBtn.addEventListener('click', saveProposalTemplate);
  }

  // Prompts Management
  document.getElementById('addPromptBtn').addEventListener('click', () => openPromptForm());
  document.getElementById('savePromptBtn').addEventListener('click', savePrompt);
  document.getElementById('cancelPromptBtn').addEventListener('click', closePromptForm);
  document.getElementById('exportPromptsBtn').addEventListener('click', exportPrompts);

  const importBtn = document.getElementById('importPromptsBtn');
  const importInput = document.getElementById('importPromptsInput');

  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', importPrompts);
  }

  // Save Settings Button
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      saveNotificationSettings();
      const msg = document.getElementById('settingsSaved');
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 3000);
    });
  }
}

// ==========================================
// Notification Settings
// ==========================================
function saveNotificationSettings() {
  const settings = {
    development: document.getElementById('development').checked,
    ai: document.getElementById('ai').checked,
    all: document.getElementById('all').checked,
    sound: document.getElementById('sound').checked,
    interval: parseInt(document.getElementById('interval').value),
    aiChatUrl: document.getElementById('aiChatUrl').value.trim(),
    keywordsInclude: document.getElementById('keywordsInclude').value.trim(),
    keywordsExclude: document.getElementById('keywordsExclude').value.trim(),
    minBudget: parseInt(document.getElementById('minBudget').value) || 0,
    minHiringRate: parseInt(document.getElementById('minHiringRate').value) || 0,
    maxDuration: parseInt(document.getElementById('maxDuration').value) || 0,
    minClientAge: parseInt(document.getElementById('minClientAge').value) || 0,
    telegramToken: document.getElementById('telegramToken').value.trim(),
    telegramChatId: document.getElementById('telegramChatId').value.trim(),
    quietHoursEnabled: document.getElementById('quietHoursEnabled').checked,
    quietHoursStart: document.getElementById('quietHoursStart').value,
    quietHoursEnd: document.getElementById('quietHoursEnd').value
  };

  chrome.storage.local.set({ settings });
}

// ==========================================
// Check Now
// ==========================================
function checkNow() {
  const btn = document.getElementById('checkNowBtn');
  const resultDiv = document.getElementById('checkResult');

  if (!btn) return;

  btn.disabled = true;
  btn.textContent = 'جاري الفحص...';
  resultDiv.classList.add('hidden');
  resultDiv.classList.remove('success', 'error', 'info');

  chrome.runtime.sendMessage({ action: 'checkNow' }, (response) => {
    // Always reset button
    btn.disabled = false;
    btn.textContent = 'فحص الآن';

    if (chrome.runtime.lastError) {
      resultDiv.classList.remove('hidden');
      resultDiv.classList.add('error');
      resultDiv.textContent = 'خطأ في الاتصال بالملحق. حاول مرة أخرى.';
      console.error('Runtime Error:', chrome.runtime.lastError);
      return;
    }

    resultDiv.classList.remove('hidden');

    if (response && response.success) {
      if (response.newJobs > 0) {
        resultDiv.classList.add('success');
        resultDiv.textContent = `تم العثور على ${response.newJobs} مشاريع جديدة!`;
      } else {
        resultDiv.classList.add('info');
        resultDiv.textContent = 'تم الفحص: لا توجد مشاريع جديدة حالياً';
      }
    } else {
      resultDiv.classList.add('error');
      resultDiv.textContent = `خطأ: ${response?.error || 'استجابة غير صالحة'}`;
    }

    loadStats();

    // Hide message after 5 seconds
    setTimeout(() => {
      if (resultDiv) resultDiv.classList.add('hidden');
    }, 5000);
  });
}

// ==========================================
// Clear History
// ==========================================
function clearHistory() {
  if (confirm('هل أنت متأكد من مسح سجل المشاريع؟\nسيتم اعتبار جميع المشاريع الحالية كجديدة.')) {
    chrome.runtime.sendMessage({ action: 'clearHistory' }, (response) => {
      if (response && response.success) {
        loadStats();
        alert('تم مسح السجل بنجاح');
      }
    });
  }
}

// ==========================================
// Test Notification
// ==========================================
function testNotification() {
  const statusDiv = document.getElementById('testStatus');

  chrome.runtime.sendMessage({ action: 'testNotification' }, (response) => {
    statusDiv.classList.remove('hidden', 'success', 'error');

    if (response && response.success) {
      statusDiv.classList.add('success');
      statusDiv.textContent = 'تم إرسال الإشعار التجريبي';
    } else {
      statusDiv.classList.add('error');
      statusDiv.textContent = 'فشل إرسال الإشعار';
    }

    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  });
}

// ==========================================
// Test Sound
// ==========================================
function testSound() {
  const statusDiv = document.getElementById('testStatus');

  chrome.runtime.sendMessage({ action: 'testSound' }, (response) => {
    statusDiv.classList.remove('hidden', 'success', 'error');

    if (response && response.success) {
      statusDiv.classList.add('success');
      statusDiv.textContent = 'تم تشغيل الصوت';
    } else {
      statusDiv.classList.add('error');
      statusDiv.textContent = 'فشل تشغيل الصوت';
    }

    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
  });
}


// ==========================================
// Debug Connection
// ==========================================
function debugConnection() {
  const btn = document.getElementById('debugBtn');
  const resultDiv = document.getElementById('debugResult');

  btn.disabled = true;
  btn.textContent = 'جاري الفحص...';
  resultDiv.classList.remove('hidden');
  resultDiv.textContent = 'جاري الاتصال بمستقل...';

  chrome.runtime.sendMessage({ action: 'debugFetch' }, (response) => {
    btn.disabled = false;
    btn.textContent = 'فحص الاتصال بمستقل';

    if (response && response.success) {
      resultDiv.textContent = `الاتصال ناجح!\nحجم الصفحة: ${response.length} حرف\n\nافتح Console (F12) لرؤية التفاصيل`;
    } else {
      resultDiv.textContent = `فشل الاتصال: ${response?.error || 'خطأ غير معروف'}`;
    }
  });
}

// ==========================================
// Prompt Management
// ==========================================


// Replaced by background service


function loadPrompts() {
  const container = document.getElementById('promptsList');
  if (!container) return;

  chrome.storage.local.get(['prompts'], (data) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading prompts:', chrome.runtime.lastError);
      return;
    }
    let prompts = data.prompts || [];

    // If empty, fetch from background (Source of Truth)
    if (prompts.length === 0) {
      chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error fetching default prompts:', chrome.runtime.lastError);
          return;
        }
        prompts = (response && response.prompts) ? response.prompts : [];
        // Save to local storage for next time
        chrome.storage.local.set({ prompts }, () => {
          renderPrompts(prompts);
        });
      });
      return;
    }

    renderPrompts(prompts);

  });
}

function renderPrompts(prompts) {
  const container = document.getElementById('promptsList');

  if (prompts.length === 0) { // Should not happen with defaults
    container.innerHTML = '<p class="empty-msg">لا توجد أوامر محفوظة</p>';
    return;
  }

  container.innerHTML = '';
  prompts.forEach((prompt, index) => {
    const item = document.createElement('div');
    item.className = 'prompt-item';
    item.innerHTML = `
        <div class="prompt-header">
          <span class="prompt-title">${prompt.title}</span>
        </div>
        <div class="prompt-preview">${prompt.content}</div>
        <div class="prompt-actions">
          <button class="btn-sm btn-edit" data-index="${index}">تعديل</button>
          <button class="btn-sm btn-delete" data-index="${index}">حذف</button>
        </div>
      `;
    container.appendChild(item);
  });

  // Event listeners for edit/delete buttons
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.storage.local.get(['prompts'], (d) => {
        let currentPrompts = d.prompts || [];
        if (currentPrompts.length === 0) {
          chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
            currentPrompts = (response && response.prompts) ? response.prompts : [];
            const p = currentPrompts[btn.dataset.index];
            if (p) openPromptForm(p, btn.dataset.index);
          });
          return;
        }

        const p = currentPrompts[btn.dataset.index];
        if (p) openPromptForm(p, btn.dataset.index);
      });
    });
  });

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deletePrompt(btn.dataset.index));
  });
}

function openPromptForm(prompt = null, index = -1) {
  const modal = document.getElementById('promptForm');
  const titleInput = document.getElementById('promptTitle');
  const contentInput = document.getElementById('promptContent');
  const idInput = document.getElementById('promptId');

  if (prompt) {
    titleInput.value = prompt.title;
    contentInput.value = prompt.content;
    idInput.dataset.index = index;
  } else {
    titleInput.value = '';
    contentInput.value = '';
    idInput.dataset.index = -1;
  }

  modal.classList.remove('hidden');
}

function closePromptForm() {
  document.getElementById('promptForm').classList.add('hidden');
}

function savePrompt() {
  const title = document.getElementById('promptTitle').value.trim();
  const content = document.getElementById('promptContent').value.trim();
  const idInput = document.getElementById('promptId');
  const index = parseInt(idInput.dataset.index);

  if (!title || !content) {
    alert('يرجى ملء جميع الحقول');
    return;
  }

  chrome.storage.local.get(['prompts'], (data) => {
    if (chrome.runtime.lastError) {
      alert('خطأ في الوصول إلى التخزين المحلي');
      console.error(chrome.runtime.lastError);
      return;
    }
    let prompts = data.prompts || [];

    // If prompts is empty but we are trying to edit (index >= 0), it implies we might be editing a default prompt
    // that hasn't been saved to local storage yet.
    if (prompts.length === 0 && index >= 0) {
      chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
        const defaults = (response && response.prompts) ? response.prompts : [];
        // Use defaults as the base list
        proceedSave(defaults, index, title, content);
      });
      return;
    }

    proceedSave(prompts, index, title, content);
  });
}

function proceedSave(prompts, index, title, content) {

  // Safety check again
  if (index >= 0 && index < prompts.length) {
    // Edit existing
    prompts[index] = { ...prompts[index], title, content };
  } else {
    // Add new
    prompts.push({
      id: crypto.randomUUID(),
      title,
      content,
      createdAt: new Date().toISOString()
    });
  }

  chrome.storage.local.set({ prompts }, () => {
    closePromptForm();
    loadPrompts();
  });
}

function deletePrompt(index) {
  if (confirm('هل أنت متأكد من حذف هذا الأمر؟')) {
    chrome.storage.local.get(['prompts'], (data) => {
      let prompts = data.prompts || [];

      if (prompts.length === 0) {
        chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
          prompts = (response && response.prompts) ? response.prompts : [];
          if (index >= 0 && index < prompts.length) {
            prompts.splice(index, 1);
            chrome.storage.local.set({ prompts }, loadPrompts);
          }
        });
        return;
      }

      if (index >= 0 && index < prompts.length) {
        prompts.splice(index, 1);
        chrome.storage.local.set({ prompts }, loadPrompts);
      }
    });
  }
}

function exportPrompts() {
  chrome.storage.local.get(['prompts'], (data) => {
    let prompts = data.prompts || [];

    // If empty storage, export defaults from background
    if (prompts.length === 0) {
      chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
        const defaults = (response && response.prompts) ? response.prompts : [];
        downloadPrompts(defaults);
      });
      return;
    }

    downloadPrompts(prompts);
  });
}

function downloadPrompts(prompts) {

  const blob = new Blob([JSON.stringify(prompts, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mostaql-prompts.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importPrompts(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const newPrompts = JSON.parse(e.target.result);
      if (!Array.isArray(newPrompts)) throw new Error('Format Invalid');

      chrome.storage.local.get(['prompts'], (data) => {
        const existingPrompts = data.prompts || [];
        // Merge strategy: Append new prompts
        const updatedPrompts = [...existingPrompts, ...newPrompts];

        chrome.storage.local.set({ prompts: updatedPrompts }, () => {
          loadPrompts();
          alert('تم استيراد الأوامر بنجاح');
        });
      });
    } catch (err) {
      alert('حدث خطأ أثناء قراءة الملف. تأكد من أنه ملف JSON صالح.');
      console.error(err);
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset input
}