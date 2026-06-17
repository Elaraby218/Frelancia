// ==========================================
// dashboard/events.js — All event listener wiring
// Depends on: tabs.js, settings.js, prompts.js, contributors.js
//             + initBidTracker / refreshBidTracker from dashboard-bids/init.js
// ==========================================

function setupEventListeners() {
    setupTabSwitching();

    // Contributors tab — load once on first click
    const contributorsTabBtn = document.querySelector('.nav-item[data-tab="contributors"]');
    if (contributorsTabBtn) {
        contributorsTabBtn.addEventListener('click', loadContributors, { once: true });
    }

    // Bids tracker tab — lazy-load once on first click
    const bidsTrackerTabBtn = document.querySelector('.nav-item[data-tab="bids-tracker"]');
    if (bidsTrackerTabBtn) {
        bidsTrackerTabBtn.addEventListener('click', initBidTracker, { once: true });
    }

    // Bids tracker refresh button
    const refreshBidsBtn = document.getElementById('refreshBidsBtn');
    if (refreshBidsBtn) {
        refreshBidsBtn.addEventListener('click', refreshBidTracker);
    }

    // Save all settings button
    const saveBtn = document.getElementById('saveAllBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAllSettings);
    }

    const aiProvider = document.getElementById('aiProvider');
    if (aiProvider) {
        aiProvider.addEventListener('change', syncAiProviderFields);
    }

    const toggleApiKeyBtn = document.getElementById('toggleOpenRouterApiKey');
    if (toggleApiKeyBtn) {
        toggleApiKeyBtn.addEventListener('click', toggleOpenRouterApiKeyVisibility);
    }

    const openRouterModelPreset = document.getElementById('openRouterModelPreset');
    if (openRouterModelPreset) {
        openRouterModelPreset.addEventListener('change', applyOpenRouterModelPreset);
    }

    const openRouterModel = document.getElementById('openRouterModel');
    if (openRouterModel) {
        openRouterModel.addEventListener('input', syncOpenRouterModelPreset);
    }

    // Prompt modal — open
    const addPromptBtn = document.getElementById('addPromptBtn');
    if (addPromptBtn) addPromptBtn.addEventListener('click', () => openPromptModal());

    // Prompt modal — close
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            document.getElementById('promptModal').classList.add('hidden');
        });
    }

    // Prompt modal — confirm save
    const confirmSaveBtn = document.getElementById('confirmSavePrompt');
    if (confirmSaveBtn) confirmSaveBtn.addEventListener('click', savePromptFromModal);

    // Diagnostic: test notification
    const testNotifyBtn = document.getElementById('testNotificationBtn');
    if (testNotifyBtn) {
        testNotifyBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'testNotification' });
        });
    }

    // Diagnostic: test sound
    const testSoundBtn = document.getElementById('testSoundBtn');
    if (testSoundBtn) {
        testSoundBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'testSound' });
        });
    }

    // Display mode switcher (popup / sidebar) — applies instantly on click
    document.querySelectorAll('.mode-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const newMode = btn.dataset.mode;
            const currentActive = document.querySelector('.mode-option.active');
            if (currentActive && currentActive.dataset.mode === newMode) return; // already active

            // Update UI
            document.querySelectorAll('.mode-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Save immediately to storage
            chrome.storage.local.get(['settings'], (data) => {
                const s = data.settings || {};
                s.displayMode = newMode;
                chrome.storage.local.set({ settings: s }, () => {
                    showSaveStatus();

                    // Get the current active tab to open sidebar on it
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        const tabId = tabs[0]?.id || null;
                        chrome.runtime.sendMessage({
                            action: 'setDisplayMode',
                            mode: newMode,
                            tabId: tabId
                        });
                    });
                });
            });
        });
    });

    // System toggle — auto-save immediately on change
    const systemToggle = document.getElementById('systemToggle');
    if (systemToggle) {
        systemToggle.addEventListener('change', () => {
            chrome.storage.local.get(['settings'], (data) => {
                const s = data.settings || {};
                s.systemEnabled = systemToggle.checked;
                chrome.storage.local.set({ settings: s }, showSaveStatus);
            });
        });
    }

    // Backup Export/Import
    const exportBackupBtn = document.getElementById('exportBackupBtn');
    if (exportBackupBtn) {
        exportBackupBtn.addEventListener('click', exportBackup);
    }
    
    const importBackupBtn = document.getElementById('importBackupBtn');
    if (importBackupBtn) {
        importBackupBtn.addEventListener('click', () => {
            const input = document.getElementById('importBackupInput');
            if (input) input.click();
        });
    }

    const importBackupInput = document.getElementById('importBackupInput');
    if (importBackupInput) {
        importBackupInput.addEventListener('change', importBackup);
    }
}
