// ==========================================
// Frelancia Pro - Dashboard Interactivity
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    loadConnectionStatus();
    setupEventListeners();
});

// --- Connection Status ---
function loadConnectionStatus() {
    chrome.storage.local.get(['signalRConnected', 'signalRFallbackActive', 'settings'], (data) => {
        const statusEl = document.getElementById('stat-connection');
        const iconEl = document.getElementById('connection-status-icon');
        if (!statusEl || !iconEl) return;

        const mode = (data.settings || {}).notificationMode || 'auto';

        if (mode === 'polling') {
            statusEl.textContent = 'استعلام دوري';
            iconEl.className = 'stat-icon blue';
            iconEl.innerHTML = '<i class="fas fa-sync-alt"></i>';
        } else if (data.signalRConnected) {
            statusEl.textContent = 'اتصال مباشر';
            iconEl.className = 'stat-icon green';
            iconEl.innerHTML = '<i class="fas fa-wifi"></i>';
        } else if (data.signalRFallbackActive) {
            statusEl.textContent = 'وضع الاستعلام';
            iconEl.className = 'stat-icon orange';
            iconEl.innerHTML = '<i class="fas fa-sync-alt"></i>';
        } else {
            statusEl.textContent = 'غير متصل';
            iconEl.className = 'stat-icon purple';
            iconEl.innerHTML = '<i class="fas fa-plug"></i>';
        }
    });
}

// --- Tab Management ---
function setupTabSwitching() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContainers = document.querySelectorAll('.tab-container');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.dataset.tab;
            if (!tabId) return;

            // Update Active Nav
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Update Active Tab
            tabContainers.forEach(container => {
                container.classList.add('hidden');
                if (container.id === `${tabId}-tab`) {
                    container.classList.remove('hidden');
                }
            });
        });
    });
}

// --- Data Loading ---
function loadData() {
    chrome.storage.local.get(['settings', 'stats', 'prompts', 'proposalTemplate', 'seenJobs', 'recentJobs'], (data) => {
        // High Level Stats
        if (data.stats) {
            const todayCount = parseInt(data.stats.todayCount);
            document.getElementById('stat-today').textContent = isNaN(todayCount) ? 0 : todayCount;
            
            const lastTime = data.stats.lastCheck ? new Date(data.stats.lastCheck).toLocaleTimeString('ar-EG') : '-';
            document.getElementById('stat-last-time').textContent = lastTime;
        }
        
        if (data.seenJobs) {
            const totalSeen = Array.isArray(data.seenJobs) ? data.seenJobs.length : 0;
            document.getElementById('stat-total').textContent = totalSeen;
        }
        
        // Render Project List using full objects
        renderRecentProjects(data.recentJobs || []);

        // Settings / Filters
        const s = data.settings || {};
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = val;
                else el.value = val || '';
            }
        };

        setVal('keywordsInclude', s.keywordsInclude);
        setVal('keywordsExclude', s.keywordsExclude);
        setVal('minBudget', s.minBudget);
        setVal('minHiringRate', s.minHiringRate);
        setVal('maxDuration', s.maxDuration);
        setVal('cat-development', s.development !== false);
        setVal('cat-ai', s.ai !== false);
        setVal('cat-all', s.all !== false);
        setVal('aiChatUrl', s.aiChatUrl || 'https://chatgpt.com/');
        setVal('quietHoursEnabled', s.quietHoursEnabled === true);
        setVal('quietHoursStart', s.quietHoursStart);
        setVal('quietHoursEnd', s.quietHoursEnd);
        setVal('checkInterval', s.interval || 1);
        setVal('systemToggle', s.systemEnabled !== false);
        setVal('notificationMode', s.notificationMode || 'auto');

        // Proposals
        document.getElementById('proposalTemplate').value = data.proposalTemplate || '';

        // Prompts
        renderPrompts(data.prompts || []);
    });
}

// --- Render Functions ---
function renderRecentProjects(jobs) {
    const list = document.getElementById('recentProjectsList');
    if (!list) return;

    if (jobs.length === 0) {
        list.innerHTML = '<p class="help-text" style="text-align: center; padding: 40px;">لا يوجد مشاريع مرصودة حالياً.</p>';
        return;
    }

    // Strictly show the last 10 posted projects
    const recent = jobs.slice(0, 10);
    list.innerHTML = recent.map(job => {
        const budget = job.budget || 'غير محدد';
        const hiringRate = job.hiringRate || 'غير محدد';
        const communications = job.communications || '0';
        const status = job.status || 'مفتوح';
        const duration = job.duration || '';
        
        let statusClass = 'status-open';
        if (status.includes('تنفيذ') || status.includes('عمل')) statusClass = 'status-processing';
        if (status.includes('مغلق') || status.includes('مكتمل')) statusClass = 'status-closed';

        return `
            <div class="project-item">
                <div class="project-header">
                    <a href="${job.url}" target="_blank" class="project-title">${job.title || 'بدون عنوان'}</a>
                    <span class="status-badge ${statusClass}">${status}</span>
                </div>
                
                <div class="project-footer">
                    <div class="project-stats">
                        <div class="stat-inline">
                            <i class="fas fa-user-check"></i>
                            <span>التوظيف: ${hiringRate}</span>
                        </div>
                        <div class="stat-inline">
                            <i class="fas fa-comments"></i>
                            <span>التواصلات: ${communications}</span>
                        </div>
                    </div>
                    <a href="${job.url}" target="_blank" class="btn-view-project btn-apply-autofill" 
                       data-id="${job.id}" 
                       data-budget="${budget}" 
                       data-duration="${duration}">
                        <span>قدّم الآن</span>
                        <i class="fas fa-chevron-left" style="margin-right: 8px; font-size: 10px;"></i>
                    </a>
                </div>
            </div>
        `;
    }).join('');

    // Setup listener for autofill-enabled buttons
    setupAutofillListeners();
}

function setupAutofillListeners() {
    const list = document.getElementById('recentProjectsList');
    if (!list) return;

    // Remove existing to avoid duplicates if re-rendered
    list.onclick = (e) => {
        const btn = e.target.closest('.btn-apply-autofill');
        if (!btn) return;

        e.preventDefault();
        const projectId = btn.dataset.id;
        const budgetText = btn.dataset.budget;
        const durationText = btn.dataset.duration;
        const url = btn.href;

        chrome.storage.local.get(['proposalTemplate'], (data) => {
            const amount = parseMinBudgetValue(budgetText);
            const duration = parseDurationDays(durationText);
            
            const autofillData = {
                projectId,
                amount,
                duration,
                proposal: data.proposalTemplate || '',
                timestamp: Date.now()
            };

            chrome.storage.local.set({ 'mostaql_pending_autofill': autofillData }, () => {
                const urlWithFlag = url + (url.includes('?') ? '&' : '?') + 'mostaql_autofill=true';
                window.open(urlWithFlag, '_blank');
            });
        });
    };
}

function parseMinBudgetValue(budgetText) {
    if (!budgetText || budgetText === 'غير محدد') return 0;
    const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
    if (!matches) return 0;
    const values = matches.map(m => parseFloat(m));
    return Math.min(...values);
}

function parseDurationDays(durationText) {
    if (!durationText) return 0;
    const match = durationText.match(/\d+/);
    if (match) return parseInt(match[0]);
    if (durationText.includes("يوم واحد")) return 1;
    return 0;
}

function renderPrompts(prompts) {
    const list = document.getElementById('promptsList');
    if (!list) return;

    if (prompts.length === 0) {
        list.innerHTML = '<p class="help-text" style="grid-column: 1/-1; text-align: center; padding: 40px;">لا يوجد أوامر مضافة حالياً.</p>';
        return;
    }

    list.innerHTML = prompts.map((p, i) => `
        <div class="prompt-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <h4 style="font-weight: 800; font-size: 16px; color: var(--text-title);">${p.title}</h4>
                <div style="display: flex; gap: 8px;">
                    <button onclick="editPrompt(${i})" class="btn-icon" style="background: none; border: none; color: var(--text-muted); cursor: pointer;"><i class="fas fa-edit"></i></button>
                    <button onclick="deletePrompt(${i})" class="btn-icon" style="background: none; border: none; color: var(--danger); cursor: pointer;"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <p style="font-size: 13px; color: var(--text-body); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${p.content}</p>
        </div>
    `).join('');
}

// --- Event Listeners ---
function setupEventListeners() {
    setupTabSwitching();

    // Save All Button
    const saveBtn = document.getElementById('saveAllBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAllSettings);
    }

    // Modal Controls
    const addBtn = document.getElementById('addPromptBtn');
    if (addBtn) addBtn.addEventListener('click', () => openPromptModal());

    const closeBtn = document.getElementById('closeModalBtn');
    if (closeBtn) closeBtn.addEventListener('click', () => document.getElementById('promptModal').classList.add('hidden'));

    const confirmSaveBtn = document.getElementById('confirmSavePrompt');
    if (confirmSaveBtn) confirmSaveBtn.addEventListener('click', savePromptFromModal);

    // Diagnostic Tests
    const testNotifyBtn = document.getElementById('testNotificationBtn');
    if (testNotifyBtn) {
        testNotifyBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'testNotification' });
        });
    }

    const testSoundBtn = document.getElementById('testSoundBtn');
    if (testSoundBtn) {
        testSoundBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'testSound' });
        });
    }

    // Auto-save Status Toggle
    const systemToggle = document.getElementById('systemToggle');
    if (systemToggle) {
        systemToggle.addEventListener('change', () => {
            chrome.storage.local.get(['settings'], (data) => {
                const s = data.settings || {};
                s.systemEnabled = systemToggle.checked;
                chrome.storage.local.set({ settings: s }, () => {
                    showSaveStatus();
                });
            });
        });
    }
}

// --- Save Logic ---
function saveAllSettings() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? (el.type === 'checkbox' ? el.checked : el.value) : null;
    };

    const settings = {
        keywordsInclude: getVal('keywordsInclude'),
        keywordsExclude: getVal('keywordsExclude'),
        minBudget: parseInt(getVal('minBudget')) || 0,
        minHiringRate: parseInt(getVal('minHiringRate')) || 0,
        maxDuration: parseInt(getVal('maxDuration')) || 0,
        development: getVal('cat-development'),
        ai: getVal('cat-ai'),
        all: getVal('cat-all'),
        aiChatUrl: getVal('aiChatUrl'),
        quietHoursEnabled: getVal('quietHoursEnabled'),
        quietHoursStart: getVal('quietHoursStart'),
        quietHoursEnd: getVal('quietHoursEnd'),
        interval: parseInt(getVal('checkInterval')) || 1,
        systemEnabled: getVal('systemToggle'),
        notificationMode: getVal('notificationMode') || 'auto'
    };

    const proposalTemplate = document.getElementById('proposalTemplate').value;

    chrome.storage.local.set({ settings, proposalTemplate }, () => {
        showSaveStatus();
        // Update alarm in background
        chrome.runtime.sendMessage({ action: 'updateAlarm', interval: settings.interval });
    });
}

function showSaveStatus() {
    const status = document.getElementById('saveStatus');
    status.style.opacity = '1';
    setTimeout(() => {
        status.style.opacity = '0';
    }, 3000);
}

// --- Prompt CRUD ---
window.editPrompt = function(index) {
    chrome.storage.local.get(['prompts'], (data) => {
        const prompts = data.prompts || [];
        const p = prompts[index];
        if (p) openPromptModal(p, index);
    });
};

window.deletePrompt = function(index) {
    if (!confirm('هل أنت متأكد من حذف هذا الأمر؟')) return;
    chrome.storage.local.get(['prompts'], (data) => {
        const prompts = data.prompts || [];
        prompts.splice(index, 1);
        chrome.storage.local.set({ prompts }, () => {
            renderPrompts(prompts);
            showSaveStatus();
        });
    });
};

function openPromptModal(prompt = null, index = -1) {
    const modal = document.getElementById('promptModal');
    const title = document.getElementById('promptTitle');
    const content = document.getElementById('promptContent');
    const idField = document.getElementById('promptId');

    if (prompt) {
        document.getElementById('modalTitle').textContent = 'تعديل الأمر';
        title.value = prompt.title;
        content.value = prompt.content;
        idField.value = index;
    } else {
        document.getElementById('modalTitle').textContent = 'إضافة أمر جديد';
        title.value = '';
        content.value = '';
        idField.value = -1;
    }

    modal.classList.remove('hidden');
}

function savePromptFromModal() {
    const title = document.getElementById('promptTitle').value.trim();
    const content = document.getElementById('promptContent').value.trim();
    const index = parseInt(document.getElementById('promptId').value);

    if (!title || !content) {
        alert('يرجى ملء جميع الحقول');
        return;
    }

    chrome.storage.local.get(['prompts'], (data) => {
        const prompts = data.prompts || [];
        if (index >= 0) {
            prompts[index] = { ...prompts[index], title, content };
        } else {
            prompts.push({
                id: crypto.randomUUID(),
                title,
                content,
                createdAt: new Date().toISOString()
            });
        }

        chrome.storage.local.set({ prompts }, () => {
            document.getElementById('promptModal').classList.add('hidden');
            renderPrompts(prompts);
            showSaveStatus();
        });
    });
}
