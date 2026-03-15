// ==========================================
// content/init.js — Extension entry point & page router
// Depends on: all other content/* modules
// ==========================================

function runInjectors() {
    if (!isContextValid()) return;

    const page = getPageType();
    console.log("[DEBUG] page:", page);

    if (page === 'project') {
        injectTrackButton();
        injectProjectExporter();
        checkForAutofill();
    }

    if (page === 'message') {
        injectMessageExporter();
    }

    if (page === 'home') {
        injectDashboardStats();
        injectMonitoredProjects();
    }

    if (page === 'profile') {
        injectProfileTools();
    }
}

function startObserverOnce() {
    if (observerStarted) return;
    observerStarted = true;

    setInterval(() => {
        if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            runInjectors();
        }
    }, 500);

    const obs = new MutationObserver(() => {
        runInjectors();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
}

function initExtension() {
    lastPath = location.pathname;
    runInjectors();
    startObserverOnce();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExtension);
} else {
    initExtension();
}
