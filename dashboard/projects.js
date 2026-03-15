// ==========================================
// dashboard/projects.js — Tracked projects rendering & autofill
// ==========================================

function renderTrackedProjects(jobs) {
    const list = document.getElementById('recentProjectsList');
    if (!list) return;

    if (jobs.length === 0) {
        list.innerHTML = '<p class="help-text" style="text-align: center; padding: 40px;">لا توجد مشاريع مراقبة. افتح أي مشروع على مستقل واضغط <strong>مراقبة</strong> لإضافته هنا.</p>';
        return;
    }

    list.innerHTML = jobs.slice(0, 7).map(job => {
        const budget   = job.budget   || 'غير محدد';
        const duration = job.duration || '';
        const poster   = job.clientName || '';
        const timeAgo  = job.publishDate || '';
        const bidsText = job.communications ? job.communications + ' تواصل' : '';
        const status   = job.status || 'مفتوح';

        let statusClass = 'mj-status-open';
        if (status.includes('تنفيذ') || status.includes('جارٍ')) statusClass = 'mj-status-processing';
        if (status.includes('مغلق') || status.includes('مكتمل') || status.includes('ملغى')) statusClass = 'mj-status-closed';

        return `
            <div class="mj-project-item">
                <h5 class="mj-project-title">
                    <a href="${job.url}" target="_blank">${job.title || 'بدون عنوان'}</a>
                    <span class="mj-status-badge ${statusClass}">${status}</span>
                </h5>
                <ul class="mj-project-meta">
                    ${poster   ? `<li><i class="fas fa-user"></i> ${poster}</li>` : ''}
                    ${timeAgo  ? `<li><i class="fas fa-clock"></i> ${timeAgo}</li>` : ''}
                    ${bidsText ? `<li><i class="fas fa-handshake"></i> ${bidsText}</li>` : ''}
                    ${budget !== 'غير محدد' ? `<li><i class="fas fa-dollar-sign"></i> ${budget}</li>` : ''}
                </ul>
                <div class="mj-project-actions">
                    <a href="${job.url}" target="_blank" class="btn-view-project btn-apply-autofill"
                       data-id="${job.id}"
                       data-budget="${budget}"
                       data-duration="${duration}">
                        <i class="fas fa-paper-plane"></i> قدّم الآن
                    </a>
                </div>
            </div>
        `;
    }).join('');

    setupAutofillListeners();
}

function setupAutofillListeners() {
    const list = document.getElementById('recentProjectsList');
    if (!list || list.dataset.listenerSet) return;

    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-apply-autofill');
        if (!btn) return;

        e.preventDefault();
        const projectId  = btn.dataset.id;
        const budgetText = btn.dataset.budget;
        const durationText = btn.dataset.duration;
        const url = btn.href;

        chrome.storage.local.get(['proposalTemplate'], (data) => {
            const autofillData = {
                projectId,
                amount:   parseMinBudgetValue(budgetText),
                duration: parseDurationDays(durationText),
                proposal: data.proposalTemplate || '',
                timestamp: Date.now()
            };
            chrome.storage.local.set({ 'mostaql_pending_autofill': autofillData }, () => {
                const urlWithFlag = url + (url.includes('?') ? '&' : '?') + 'mostaql_autofill=true';
                window.open(urlWithFlag, '_blank');
            });
        });
    });
    list.dataset.listenerSet = "true";
}

function parseMinBudgetValue(budgetText) {
    if (!budgetText || budgetText === 'غير محدد') return 0;
    const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
    if (!matches) return 0;
    return Math.min(...matches.map(m => parseFloat(m)));
}

function parseDurationDays(durationText) {
    if (!durationText) return 0;
    const match = durationText.match(/\d+/);
    if (match) return parseInt(match[0]);
    if (durationText.includes("يوم واحد")) return 1;
    return 0;
}
