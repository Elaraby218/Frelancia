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
        minBudget:        parseInt(getVal('minBudget'))      || 0,
        minHiringRate:    parseInt(getVal('minHiringRate'))  || 0,
        maxDuration:      parseInt(getVal('maxDuration'))    || 0,
        development:      getVal('cat-development'),
        ai:               getVal('cat-ai'),
        all:              getVal('cat-all'),
        aiChatUrl:        getVal('aiChatUrl'),
        quietHoursEnabled: getVal('quietHoursEnabled'),
        quietHoursStart:  getVal('quietHoursStart'),
        quietHoursEnd:    getVal('quietHoursEnd'),
        interval:         parseInt(getVal('checkInterval'))  || 1,
        systemEnabled:    getVal('systemToggle'),
        notificationMode: getVal('notificationMode') || 'auto',
        signalrServerUrl: getVal('signalrServerUrl') || ''
    };

    const proposalTemplate = document.getElementById('proposalTemplate').value;

    chrome.storage.local.set({ settings, proposalTemplate }, () => {
        showSaveStatus();
        chrome.runtime.sendMessage({ action: 'updateAlarm', interval: settings.interval });
        if (settings.notificationMode !== 'polling') {
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
