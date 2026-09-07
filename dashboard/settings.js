// ==========================================
// dashboard/settings.js — Settings read/write & save status toast
// ==========================================

function saveAllSettings() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? (el.type === 'checkbox' ? el.checked : el.value) : null;
    };

    const settings = {
        keywordsInclude:  getVal('keywordsInclude'),
        keywordsExclude:  getVal('keywordsExclude'),
        minBudget:        Math.max(0, parseInt(getVal('minBudget')) || 0),
        minHiringRate:    Math.min(100, Math.max(0, parseInt(getVal('minHiringRate')) || 0)),
        maxDuration:      Math.max(0, parseInt(getVal('maxDuration')) || 0),
        development:      getVal('cat-development'),
        ai:               getVal('cat-ai'),
        all:              getVal('cat-all'),
        aiChatUrl:        getVal('aiChatUrl'),
        quietHoursEnabled: getVal('quietHoursEnabled'),
        quietHoursStart:  getVal('quietHoursStart'),
        quietHoursEnd:    getVal('quietHoursEnd'),
        interval:         Math.min(1440, Math.max(0.5, parseFloat(getVal('checkInterval')) || 1)),
        systemEnabled:    getVal('systemToggle'),
        notificationMode: getVal('notificationMode') || 'auto',
        signalrServerUrl: getVal('signalrServerUrl') || ''
    };

    const proposalTemplate = document.getElementById('proposalTemplate').value;

    chrome.storage.local.set({ settings, proposalTemplate }, () => {
        showSaveStatus();
        chrome.runtime.sendMessage({ action: 'updateAlarm', interval: settings.interval });
        if (settings.notificationMode === 'polling') {
            chrome.runtime.sendMessage({ action: 'disconnectSignalR' });
        } else {
            chrome.runtime.sendMessage({ action: 'reconnectSignalR' });
        }
    });
}

function showSaveStatus() {
    const status = document.getElementById('saveStatus');
    if (!status) return;
    status.style.opacity = '1';
    setTimeout(() => { status.style.opacity = '0'; }, 3000);
}

function applySettingsToForm(s) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = val;
        else el.value = val || '';
    };

    setVal('keywordsInclude',   s.keywordsInclude);
    setVal('keywordsExclude',   s.keywordsExclude);
    setVal('minBudget',         s.minBudget);
    setVal('minHiringRate',     s.minHiringRate);
    setVal('maxDuration',       s.maxDuration);
    setVal('cat-development',   s.development !== false);
    setVal('cat-ai',            s.ai !== false);
    setVal('cat-all',           s.all !== false);
    setVal('aiChatUrl',         s.aiChatUrl || 'https://chatgpt.com/');
    setVal('quietHoursEnabled', s.quietHoursEnabled === true);
    setVal('quietHoursStart',   s.quietHoursStart);
    setVal('quietHoursEnd',     s.quietHoursEnd);
    setVal('checkInterval',     s.interval || 1);
    setVal('systemToggle',      s.systemEnabled !== false);
    setVal('notificationMode',  s.notificationMode || 'auto');
    setVal('signalrServerUrl',  s.signalrServerUrl || '');
}

function exportBackup() {
    chrome.storage.local.get(null, (data) => {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `frelancia_backup_${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data && typeof data === 'object') {
                chrome.storage.local.set(data, () => {
                    alert('تم استيراد الإعدادات بنجاح. سيتم إعادة تحميل الصفحة.');
                    window.location.reload();
                });
            } else {
                alert('ملف النسخة الاحتياطية غير صالح.');
            }
        } catch (error) {
            console.error('Error parsing backup:', error);
            alert('حدث خطأ أثناء استيراد الملف.');
        }
    };
    reader.readAsText(file);
    // Reset input to allow re-importing the same file if needed
    event.target.value = '';
}
