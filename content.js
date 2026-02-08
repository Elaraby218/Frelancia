// ==========================================
// Mostaql Project Tracker - Content Script
// ==========================================

function isContextValid() {
    return !!chrome.runtime && !!chrome.runtime.id;
}

function injectTrackButton() {
    // Look for the action buttons in the header
    const actionContainer = document.querySelector('.header_action-wide-container');
    if (!actionContainer) return;

    // Check if button already exists
    if (document.getElementById('track-project-btn')) return;

    // Create tracking button
    const trackBtn = document.createElement('button');
    trackBtn.id = 'track-project-btn';
    trackBtn.className = 'btn btn-success mrg--rs';
    trackBtn.innerHTML = '<i class="fa fa-fw fa-eye"></i> مراقبة المشروع';
    trackBtn.style.marginRight = '10px';

    // Check if already tracked
    const projectId = getProjectId();
    if (isContextValid()) {
        chrome.storage.local.get(['trackedProjects'], (data) => {
            if (chrome.runtime.lastError) return;
            const tracked = data.trackedProjects || {};
            if (tracked[projectId]) {
                setButtonTracked(trackBtn);
            }
        });
    }

    trackBtn.addEventListener('click', () => {
        handleTrackClick(trackBtn);
    });

    actionContainer.prepend(trackBtn);
}

function setButtonTracked(btn) {
    btn.innerHTML = '<i class="fa fa-fw fa-eye-slash"></i> إلغاء المراقبة';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-danger');
}

function setButtonUntracked(btn) {
    btn.innerHTML = '<i class="fa fa-fw fa-eye"></i> مراقبة المشروع';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-success');
}

function getProjectId() {
    const match = window.location.pathname.match(/\/project\/(\d+)/);
    return match ? match[1] : null;
}

function extractProjectData() {
    // Extract Status
    const statusLabel = document.querySelector('.label-prj-open, .label-prj-closed, .label-prj-completed, .label-prj-cancelled, .label-prj-underway, .label-prj-processing');
    const status = statusLabel ? statusLabel.textContent.trim() : 'غير معروف';

    // Extract Ongoing Communications (التواصلات الجارية)
    // Looking for the table row that contains "التواصلات الجارية"
    let communications = '0';
    const metaRows = document.querySelectorAll('.meta-row, .table-meta tr');
    metaRows.forEach(row => {
        if (row.textContent.includes('التواصلات الجارية')) {
            const val = row.querySelector('.meta-value, td:last-child');
            if (val) {
                communications = val.textContent.trim();
            }
        }
    });

    const title = document.querySelector('.heada__title span[data-type="page-header-title"]')?.textContent.trim() || document.title;

    return {
        status,
        communications,
        title,
        url: window.location.href,
        lastChecked: new Date().toISOString()
    };
}

function handleTrackClick(btn) {
    if (!isContextValid()) {
        alert('حدث خطأ في الملحق (تم تحديث الإضافة). يرجى تحديث الصفحة للمتابعة.');
        return;
    }

    const projectId = getProjectId();
    if (!projectId) return;

    chrome.storage.local.get(['trackedProjects'], (data) => {
        if (chrome.runtime.lastError) return;
        const tracked = data.trackedProjects || {};
        
        if (tracked[projectId]) {
            // Untrack
            delete tracked[projectId];
            chrome.storage.local.set({ trackedProjects: tracked }, () => {
                if (!chrome.runtime.lastError) {
                    setButtonUntracked(btn);
                }
            });
        } else {
            // Track
            const projectData = extractProjectData();
            tracked[projectId] = projectData;
            chrome.storage.local.set({ trackedProjects: tracked }, () => {
                if (!chrome.runtime.lastError) {
                    setButtonTracked(btn);
                }
            });
        }
    });
}

// Initial injection
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectTrackButton);
} else {
    injectTrackButton();
}
