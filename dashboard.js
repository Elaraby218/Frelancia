// ==========================================
// Frelancia - Enhanced Dashboard Script
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const navItems = document.querySelectorAll('.nav-item');
    const tabContainers = document.querySelectorAll('.tab-container');
    const tabTitleText = document.getElementById('tab-title');

    // Stats Elements
    const statToday = document.getElementById('stat-today');
    const statTracked = document.getElementById('stat-tracked');
    const statTotal = document.getElementById('stat-total');
    const lastCheckSpan = document.getElementById('last-check');

    // Filter Inputs
    const catDev = document.getElementById('category-development');
    const catAi = document.getElementById('category-ai');
    const catAll = document.getElementById('category-all');
    const kwInclude = document.getElementById('keywords-include');
    const kwExclude = document.getElementById('keywords-exclude');
    const minBudget = document.getElementById('min-budget');
    const maxDuration = document.getElementById('max-duration');
    const minHiringRate = document.getElementById('min-hiring-rate');
    const minClientAge = document.getElementById('min-client-age');

    // Notification / Advanced Inputs
    const soundToggle = document.getElementById('sound-toggle');
    const tgToken = document.getElementById('telegram-token');
    const tgChatId = document.getElementById('telegram-chatid');
    const checkInterval = document.getElementById('check-interval');
    const aiChatUrl = document.getElementById('ai-chat-url');
    const qhToggle = document.getElementById('quiet-hours-toggle');
    const qhStart = document.getElementById('quiet-hours-start');
    const qhEnd = document.getElementById('quiet-hours-end');
    const qhFields = document.getElementById('quiet-hours-fields');

    // Proposal
    const proposalTextarea = document.getElementById('proposal-template');

    // Lists
    const trackedList = document.getElementById('tracked-list');
    const promptsList = document.getElementById('prompts-list');

    // Modals
    const promptModal = document.getElementById('prompt-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalPromptTitle = document.getElementById('modal-prompt-title');
    const modalPromptContent = document.getElementById('modal-prompt-content');
    const saveModalPromptBtn = document.getElementById('save-modal-prompt-btn');

    let currentEditingPromptId = null;

    // --- Tab Management ---
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            tabContainers.forEach(c => c.classList.add('hidden'));
            document.getElementById(`${tab}-tab`).classList.remove('hidden');
            
            tabTitleText.textContent = item.querySelector('span').textContent;
        });
    });

    // --- Data Management ---

    function loadAllData() {
        chrome.storage.local.get(['settings', 'stats', 'trackedProjects', 'prompts', 'proposalTemplate', 'seenJobs'], (data) => {
            // Stats
            if (data.stats) {
                statToday.textContent = data.stats.todayCount || 0;
                lastCheckSpan.textContent = data.stats.lastCheck 
                    ? `آخر فحص: ${new Date(data.stats.lastCheck).toLocaleTimeString('ar-EG')}`
                    : 'آخر فحص: لم يتم الفحص بعد';
            }
            if (data.seenJobs) {
                statTotal.textContent = data.seenJobs.length;
            }

            // Tracked Projects
            renderTrackedProjects(data.trackedProjects || {});

            // Prompts
            renderPrompts(data.prompts || []);

            // Proposal Template
            proposalTextarea.value = data.proposalTemplate || '';

            // Settings Mapping
            const s = data.settings || {};
            
            // Filters
            catDev.checked = s.development !== false;
            catAi.checked = s.ai !== false;
            catAll.checked = s.all === true;
            kwInclude.value = s.keywordsInclude || '';
            kwExclude.value = s.keywordsExclude || '';
            minBudget.value = s.minBudget || '';
            maxDuration.value = s.maxDuration || '';
            minHiringRate.value = s.minHiringRate || '';
            minClientAge.value = s.minClientAge || '';

            // Notification / Telegram
            soundToggle.checked = s.sound !== false;
            tgToken.value = s.telegramToken || '';
            tgChatId.value = s.telegramChatId || '';

            // Advanced
            checkInterval.value = s.interval || 1;
            aiChatUrl.value = s.aiChatUrl || 'https://chatgpt.com/';
            qhToggle.checked = s.quietHoursEnabled === true;
            qhStart.value = s.quietHoursStart || '00:00';
            qhEnd.value = s.quietHoursEnd || '07:00';
            
            qhFields.classList.toggle('hidden', !qhToggle.checked);
        });
    }

    // --- Render Functions ---

    function renderTrackedProjects(tracked) {
        const projects = Object.values(tracked);
        if (projects.length === 0) {
            trackedList.innerHTML = '<p class="empty-state">لا يوجد مشاريع مراقبة حالياً</p>';
            statTracked.textContent = 0;
            return;
        }

        statTracked.textContent = projects.length;
        trackedList.innerHTML = '';

        projects.forEach(p => {
            const div = document.createElement('div');
            div.className = 'project-item';
            div.style.padding = '18px 24px';
            div.style.borderBottom = '1px solid #f0f0f0';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            div.innerHTML = `
                <div>
                    <h4 style="margin-bottom: 6px; font-weight: 700;"><a href="${p.url}" target="_blank" style="text-decoration: none; color: #2386c8;">${p.title}</a></h4>
                    <span style="font-size: 13px; color: #999;">آخر تحديث ورصد: ${new Date(p.lastSeen).toLocaleString('ar-EG')}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <a href="${p.url}" target="_blank" class="btn-icon" title="فتح المشروع"><i class="fa fa-external-link"></i></a>
                    <button class="btn-icon delete" data-id="${p.id}" title="إلغاء المراقبة">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            `;

            div.querySelector('.delete').onclick = () => stopTracking(p.id);
            trackedList.appendChild(div);
        });
    }

    function renderPrompts(prompts) {
        promptsList.innerHTML = '';
        if (prompts.length === 0) {
            promptsList.innerHTML = '<p class="empty-state">لا يوجد أوامر مضافة حالياً</p>';
            return;
        }

        prompts.forEach(p => {
            const card = document.createElement('div');
            card.className = 'prompt-card';
            card.innerHTML = `
                <div>
                    <h4>${p.title}</h4>
                    <p class="prompt-preview">${p.content}</p>
                </div>
                <div class="prompt-actions">
                    <button class="btn-icon edit" title="تعديل"><i class="fa fa-edit"></i></button>
                    <button class="btn-icon delete" title="حذف"><i class="fa fa-trash"></i></button>
                </div>
            `;

            card.querySelector('.edit').onclick = () => openPromptModal(p);
            card.querySelector('.delete').onclick = () => deletePrompt(p.id);
            promptsList.appendChild(card);
        });
    }

    // --- Action Handlers ---

    function stopTracking(id) {
        if (!confirm('هل متأكد من إلغاء مراقبة هذا المشروع؟')) return;
        chrome.storage.local.get(['trackedProjects'], (data) => {
            const tracked = data.trackedProjects || {};
            delete tracked[id];
            chrome.storage.local.set({ trackedProjects: tracked }, loadAllData);
        });
    }

    function deletePrompt(id) {
        if (!confirm('هل أنت متأكد من حذف هذا الأمر؟')) return;
        chrome.storage.local.get(['prompts'], (data) => {
            const prompts = data.prompts || [];
            const filtered = prompts.filter(p => p.id !== id);
            chrome.storage.local.set({ prompts: filtered }, loadAllData);
        });
    }

    function openPromptModal(prompt = null) {
        if (prompt) {
            currentEditingPromptId = prompt.id;
            modalTitle.textContent = 'تعديل الأمر';
            modalPromptTitle.value = prompt.title;
            modalPromptContent.value = prompt.content;
        } else {
            currentEditingPromptId = null;
            modalTitle.textContent = 'إضافة أمر جديد';
            modalPromptTitle.value = '';
            modalPromptContent.value = '';
        }
        promptModal.classList.remove('hidden');
    }

    // --- Save Logic ---

    function getFormSettings() {
        return {
            development: catDev.checked,
            ai: catAi.checked,
            all: catAll.checked,
            keywordsInclude: kwInclude.value.trim(),
            keywordsExclude: kwExclude.value.trim(),
            minBudget: parseInt(minBudget.value) || 0,
            maxDuration: parseInt(maxDuration.value) || 0,
            minHiringRate: parseInt(minHiringRate.value) || 0,
            minClientAge: parseInt(minClientAge.value) || 0,
            sound: soundToggle.checked,
            telegramToken: tgToken.value.trim(),
            telegramChatId: tgChatId.value.trim(),
            interval: parseInt(checkInterval.value) || 1,
            aiChatUrl: aiChatUrl.value.trim() || 'https://chatgpt.com/',
            quietHoursEnabled: qhToggle.checked,
            quietHoursStart: qhStart.value,
            quietHoursEnd: qhEnd.value
        };
    }

    async function saveSettings(btnId, statusId) {
        const settings = getFormSettings();
        const btn = document.getElementById(btnId);
        const status = document.getElementById(statusId);

        chrome.storage.local.set({ settings }, () => {
            // Notify background to update alarm
            chrome.runtime.sendMessage({ action: 'updateAlarm', interval: settings.interval });
            
            // Feedback
            if (status) {
                status.classList.remove('hidden');
                setTimeout(() => status.classList.add('hidden'), 3000);
            }
            if (btn) flashButton(btn);
        });
    }

    function flashButton(btn) {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa fa-check"></i> تم الحفظ';
        btn.classList.add('success-flash');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('success-flash');
        }, 2000);
    }

    // --- Event Listeners ---

    // Save Filters
    document.getElementById('save-filters-btn').onclick = () => saveSettings('save-filters-btn', 'filters-status');

    // Save Proposal
    document.getElementById('save-proposal-btn').onclick = () => {
        chrome.storage.local.set({ proposalTemplate: proposalTextarea.value }, () => {
            flashButton(document.getElementById('save-proposal-btn'));
        });
    };

    // Auto-save on some fields for better UX
    [soundToggle, qhToggle, catDev, catAi, catAll].forEach(el => {
        el.onchange = () => {
           if (el === qhToggle) qhFields.classList.toggle('hidden', !qhToggle.checked);
           saveSettings(null, null);
        };
    });

    // Modal Saving
    saveModalPromptBtn.onclick = () => {
        const title = modalPromptTitle.value.trim();
        const content = modalPromptContent.value.trim();
        if (!title || !content) return alert('يرجى كتابة العنوان والنص');

        chrome.storage.local.get(['prompts'], (data) => {
            let prompts = data.prompts || [];
            if (currentEditingPromptId) {
                prompts = prompts.map(p => p.id === currentEditingPromptId ? { ...p, title, content } : p);
            } else {
                prompts.push({ id: 'p_' + Date.now(), title, content });
            }
            chrome.storage.local.set({ prompts }, () => {
                promptModal.classList.add('hidden');
                loadAllData();
            });
        });
    };

    // Tests
    document.getElementById('test-notif-btn').onclick = () => chrome.runtime.sendMessage({ action: 'testNotification' });
    document.getElementById('test-sound-btn').onclick = () => chrome.runtime.sendMessage({ action: 'testSound' });
    document.getElementById('test-telegram-btn').onclick = () => {
        const settings = getFormSettings();
        chrome.storage.local.set({ settings }, () => {
            chrome.runtime.sendMessage({ action: 'testTelegram' });
        });
    };

    // Actions
    document.getElementById('add-prompt-btn').onclick = () => openPromptModal();
    document.querySelectorAll('.close-modal').forEach(btn => btn.onclick = () => promptModal.classList.add('hidden'));

    document.getElementById('check-now-btn').onclick = () => {
        const icon = document.querySelector('#check-now-btn i');
        icon.classList.add('fa-spin');
        chrome.runtime.sendMessage({ action: 'checkNow' }, () => {
            setTimeout(() => {
                icon.classList.remove('fa-spin');
                loadAllData();
            }, 1000);
        });
    };

    document.getElementById('clear-history-btn').onclick = () => {
        if (confirm('تنبيه: سيتم مسح كافة سجلات المشاريع. هل أنت متأكد؟')) {
            chrome.runtime.sendMessage({ action: 'clearHistory' }, loadAllData);
        }
    };

    document.getElementById('reset-settings-btn').onclick = () => {
        if (confirm('هل تريد فعلاً إعادة كافة الإعدادات إلى وضعها الافتراضي؟')) {
            chrome.storage.local.clear(() => window.location.reload());
        }
    };

    // Listen for storage changes from other tabs (Popup or Mostaql)
    chrome.storage.onChanged.addListener(() => loadAllData());

    // Initial load
    loadAllData();
});
