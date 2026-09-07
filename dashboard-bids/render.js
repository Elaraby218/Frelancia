// ==========================================
// dashboard-bids/render.js — UI rendering (summary, status cards, timeline)
// Depends on: constants.js (THIRTY_DAYS_MS), data.js (indirectly via stats shape)
// ==========================================

/** Status display configuration: icon, color, and Arabic label. */
const BID_STATUS_CONFIG = {
    'بانتظار الموافقة': { icon: 'fa-clock',        color: '#f59e0b', bg: '#fef3c7', label: 'بانتظار الموافقة' },
    'مكتمل':           { icon: 'fa-check-circle',  color: '#10b981', bg: '#d1fae5', label: 'مكتملة' },
    'مستبعد':          { icon: 'fa-times-circle',   color: '#ef4444', bg: '#fee2e2', label: 'مستبعدة' },
    'مُغلق':           { icon: 'fa-ban',            color: '#6b7280', bg: '#f3f4f6', label: 'مُغلقة' },
};

/**
 * Returns a color for a countdown bar based on elapsed percentage.
 * @param {number} percentage - 0–100
 * @returns {string} CSS color
 */
function getBidCountdownColor(percentage) {
    if (percentage >= 90) return '#22c55e';
    if (percentage >= 70) return '#84cc16';
    if (percentage >= 50) return '#eab308';
    if (percentage >= 30) return '#f97316';
    return '#ef4444';
}

/**
 * Formats remaining milliseconds as a readable countdown string.
 * @param {number} msLeft
 * @returns {string}
 */
function formatBidCountdown(msLeft) {
    if (msLeft <= 0) return 'متاح الآن!';

    const totalSeconds = Math.floor(msLeft / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) {
        return `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
    }
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Returns a CSS class name for a given Arabic bid status.
 * @param {string} status
 * @returns {string}
 */
function getStatusCssClass(status) {
    if (!status) return 'bid-status-pending';
    if (status.includes('مكتمل')) return 'bid-status-completed';
    if (status.includes('مستبعد') || status.includes('مُغلق')) return 'bid-status-rejected';
    if (status.includes('انتظار')) return 'bid-status-pending';
    return 'bid-status-pending';
}

/**
 * Renders the summary stats cards at the top of the bids tracker tab.
 * @param {Object} stats - Computed tracker stats
 * @param {Object} homepageStats - Stats fetched from Mostaql homepage
 */
function renderBidTrackerSummary(stats, homepageStats) {
    const totalEl     = document.getElementById('bids-total-30d');
    const availableEl = document.getElementById('bids-available-slots');
    const planEl      = document.getElementById('bids-plan-usage');
    const additionalEl= document.getElementById('bids-additional');
    const nextEl      = document.getElementById('bids-next-available');
    const todayEl     = document.getElementById('bids-today-count');

    if (totalEl) totalEl.textContent = stats.total30d;
    if (todayEl) todayEl.textContent = stats.todayCount;

    if (availableEl) availableEl.textContent = homepageStats.available;
    if (additionalEl) additionalEl.textContent = homepageStats.additional;
    if (planEl) {
        const used = homepageStats.planUsed;
        const total = homepageStats.planTotal;
        planEl.textContent = (used !== '-' && total !== '-') ? `${used} / ${total}` : '-';
    }

    if (nextEl && stats.nextAvailable) {
        const hoursLeft = Math.floor(stats.nextAvailable.msLeft / (1000 * 60 * 60));
        const daysLeft = Math.floor(hoursLeft / 24);
        const remainingHours = hoursLeft % 24;
        nextEl.textContent = daysLeft > 0
            ? `${daysLeft} يوم ${remainingHours} ساعة`
            : `${remainingHours} ساعة`;
    } else if (nextEl) {
        nextEl.textContent = 'متاح الآن!';
    }
}

/**
 * Renders status breakdown cards into #bidsStatusGrid.
 * @param {Object} byStatus - Map of status label → count
 * @param {number} total - Total bids in the 30-day window
 */
function renderBidStatusCards(byStatus, total) {
    const container = document.getElementById('bidsStatusGrid');
    if (!container) return;

    const statusKeys = Object.keys(byStatus);

    if (statusKeys.length === 0) {
        container.innerHTML = '<p class="help-text" style="text-align:center; padding:20px;">لا توجد بيانات حالات.</p>';
        return;
    }

    container.innerHTML = statusKeys.map(statusKey => {
        const count = byStatus[statusKey];
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const config = BID_STATUS_CONFIG[statusKey] || {
            icon: 'fa-question-circle',
            color: '#6b7280',
            bg: '#f3f4f6',
            label: statusKey,
        };

        return `
            <div class="bid-status-card">
                <div class="bid-status-icon" style="background: ${config.bg}; color: ${config.color};">
                    <i class="fas ${config.icon}"></i>
                </div>
                <div class="bid-status-info">
                    <span class="bid-status-count">${count}</span>
                    <span class="bid-status-label">${escapeDashboardHtml(config.label)}</span>
                </div>
                <span class="bid-status-pct" style="color: ${config.color};">${pct}%</span>
            </div>
        `;
    }).join('');
}

/**
 * Renders the bid timeline list into #bidsTimelineList.
 * @param {Array<Object>} bids - Sorted array of bid objects
 */
function renderBidTimeline(bids) {
    const container = document.getElementById('bidsTimelineList');
    if (!container) return;

    if (bids.length === 0) {
        container.innerHTML = `
            <div class="bids-empty">
                <i class="fas fa-inbox"></i>
                <p>لا توجد عروض في آخر 30 يومًا</p>
                <span>جميع العروض متاحة للاستخدام!</span>
            </div>
        `;
        return;
    }

    container.innerHTML = bids.map((bid, index) => {
        const pct = Math.min(100, Math.round((bid.ageMs / THIRTY_DAYS_MS) * 100));
        const color = getBidCountdownColor(pct);
        const appliedDate = bid.published.toLocaleDateString('ar-EG', {
            day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
        });
        const appliedTime = bid.published.toLocaleTimeString('ar-EG', {
            hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        });
        const statusClass = getStatusCssClass(bid.status);
        const displayStatus = bid.status || 'بانتظار';
        const safeUrl = escapeDashboardHtml(safeDashboardUrl(bid.url));
        const safeTitle = escapeDashboardHtml(bid.title || 'عرض بدون عنوان');
        const safeStatus = escapeDashboardHtml(displayStatus);
        const safePrice = escapeDashboardHtml(bid.price);

        return `
            <div class="bid-timeline-item" data-index="${index}">
                <div class="bid-timeline-marker" style="background: ${color};"></div>
                <div class="bid-timeline-content">
                    <div class="bid-timeline-header">
                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="bid-timeline-title">
                            ${safeTitle}
                        </a>
                        <span class="bid-timeline-status ${statusClass}">${safeStatus}</span>
                    </div>
                    <div class="bid-timeline-meta">
                        <span><i class="fas fa-calendar-alt"></i> ${appliedDate}</span>
                        <span><i class="fas fa-clock"></i> ${appliedTime}</span>
                        ${bid.price ? `<span><i class="fas fa-dollar-sign"></i> ${safePrice}</span>` : ''}
                    </div>
                    <div class="bid-timeline-progress">
                        <div class="bid-progress-bar">
                            <div class="bid-progress-fill bid-tracker-bar"
                                 data-ms-left="${bid.msLeft}"
                                 style="width: ${pct}%; background: ${color};">
                            </div>
                        </div>
                        <span class="bid-countdown bid-tracker-countdown"
                              data-ms-left="${bid.msLeft}"
                              style="color: ${color};">
                            ${formatBidCountdown(bid.msLeft)}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
