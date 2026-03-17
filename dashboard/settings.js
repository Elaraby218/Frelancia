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
        aiProvider:       getVal('aiProvider') || 'chatgpt',
        aiChatUrl:        getVal('aiChatUrl'),
        openRouterApiKey: getVal('openRouterApiKey'),
        openRouterModel:  getVal('openRouterModel') || 'openrouter/hunter-alpha',
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
    setVal('aiProvider',        s.aiProvider || 'chatgpt');
    setVal('aiChatUrl',         s.aiChatUrl || 'https://chatgpt.com/');
    setVal('openRouterApiKey',  s.openRouterApiKey || '');
    setVal('openRouterModel',   s.openRouterModel || 'openrouter/hunter-alpha');
    setVal('openRouterModelPreset', '');
    setVal('quietHoursEnabled', s.quietHoursEnabled === true);
    setVal('quietHoursStart',   s.quietHoursStart);
    setVal('quietHoursEnd',     s.quietHoursEnd);
    setVal('checkInterval',     s.interval || 1);
    setVal('systemToggle',      s.systemEnabled !== false);
    setVal('notificationMode',  s.notificationMode || 'auto');
    setVal('signalrServerUrl',  s.signalrServerUrl || '');

    syncAiProviderFields();
    syncOpenRouterModelPreset();
}

function syncAiProviderFields() {
    const provider = document.getElementById('aiProvider')?.value || 'chatgpt';
    const chatgptGroup = document.getElementById('chatgptSettingsGroup');
    const openRouterGroup = document.getElementById('openRouterSettingsGroup');

    if (chatgptGroup) {
        chatgptGroup.classList.toggle('hidden', provider !== 'chatgpt');
    }

    if (openRouterGroup) {
        openRouterGroup.classList.toggle('hidden', provider !== 'openrouter');
    }
}

function toggleOpenRouterApiKeyVisibility() {
    const input = document.getElementById('openRouterApiKey');
    const button = document.getElementById('toggleOpenRouterApiKey');
    if (!input || !button) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    button.innerHTML = isPassword
        ? '<i class="fas fa-eye-slash"></i><span>إخفاء</span>'
        : '<i class="fas fa-eye"></i><span>إظهار</span>';
}

function syncOpenRouterModelPreset() {
    const preset = document.getElementById('openRouterModelPreset');
    const input = document.getElementById('openRouterModel');
    if (!preset || !input) return;

    const matchingOption = Array.from(preset.options).find((option) => option.value && option.value === input.value);
    preset.value = matchingOption ? matchingOption.value : '';
}

function applyOpenRouterModelPreset() {
    const preset = document.getElementById('openRouterModelPreset');
    const input = document.getElementById('openRouterModel');
    if (!preset || !input || !preset.value) return;

    input.value = preset.value;
}
