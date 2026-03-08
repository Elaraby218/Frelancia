// ==========================================
// Frelancia Pro - 30-Day Bid Tracker Module
// ==========================================

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ITEMS_PER_PAGE = 25;

let bidTrackerInterval = null;
let bidTrackerLoaded = false;

// --- Initialization ---

/**
 * Initializes the bid tracker when the tab becomes visible.
 * Called lazily on first tab click.
 */
function initBidTracker() {
    if (bidTrackerLoaded) return;
    bidTrackerLoaded = true;
    loadBidTrackerData();
}

/**
 * Reloads the bid tracker data (used by refresh button).
 */
function refreshBidTracker() {
    bidTrackerLoaded = false;
    clearBidTrackerTimers();
    showBidLoadingState();
    initBidTracker();
}

// --- API Layer ---

/**
 * Fetches a single page of bids from Mostaql API.
 * @param {number} pageNumber - The page to fetch
 * @returns {Promise<Object>} - JSON response with collection and count
 */
async function fetchBidTrackerPage(pageNumber) {
    const url = `https://mostaql.com/dashboard/bids?page=${pageNumber}&sort=latest`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
    });

    if (!response.ok) {
        throw new Error(`Bid page ${pageNumber} request failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Extracts structured data from a rendered bid HTML row.
 * @param {string} renderedHtml - The HTML string for a bid row
 * @returns {Object|null} - Parsed bid object or null
 */
function extractBidTrackerRow(renderedHtml) {
    if (typeof renderedHtml !== 'string') return null;

    const template = document.createElement('template');
    template.innerHTML = renderedHtml.trim();
    const row = template.content.querySelector('tr.bid-row');
    if (!row) return null;

    const titleLink = row.querySelector('h2 a');
    const statusEl = row.querySelector('.label-prj-pending, .label');
    const timeEl = row.querySelector('time[datetime]');
    const priceEl = row.querySelector('.project__meta li .fa-money')
        ?.closest('li')?.querySelector('span');
    const rawUrl = titleLink?.getAttribute('href') || '';
    const url = rawUrl.split('-')[0];

    return {
        title: titleLink?.textContent?.trim() || null,
        url,
        status: statusEl?.textContent?.trim() || null,
        publishedDatetime: timeEl?.getAttribute('datetime') || null,
        price: priceEl?.textContent?.trim() || null,
    };
}

/**
 * Processes raw API page data into an array of bid objects.
 * @param {Object} pageData - Raw API response
 * @returns {Array<Object>} - Array of parsed bids
 */
function processBidTrackerPage(pageData) {
    const bids = [];
    if (!pageData.collection || !Array.isArray(pageData.collection)) return bids;

    pageData.collection.forEach((bidObject) => {
        const htmlString = bidObject.rendered || bidObject;
        const item = extractBidTrackerRow(htmlString);
        if (item) {
            item.apiBidId = bidObject.id || null;
            bids.push(item);
        }
    });

    return bids;
}

// --- Data Processing ---

/**
 * Parses a datetime string into a Date object.
 * Handles "YYYY-MM-DD HH:mm:ss" and ISO formats.
 * @param {*} value - The datetime value to parse
 * @returns {Date|null} - Parsed Date or null
 */
function parseBidDatetime(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value !== 'string') return null;

    const str = value.trim();
    if (!str) return null;

    const match = str.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (match) {
        const date = new Date(Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4] ?? 0),
            Number(match[5] ?? 0),
            Number(match[6] ?? 0)
        ));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const fallback = new Date(str);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Filters bids to the last 30 days and computes statistics.
 * @param {Array<Object>} allBids - All fetched bids
 * @returns {Object} - Stats and filtered bid list
 */
function computeBidTrackerStats(allBids) {
    const now = new Date();
    const bidsInRange = [];
    const bidsToday = [];
    const byStatus = {};

    for (const bid of allBids) {
        const published = parseBidDatetime(bid.publishedDatetime);
        if (!published) continue;

        const ageMs = now.getTime() - published.getTime();
        if (ageMs < 0) continue;

        if (ageMs <= THIRTY_DAYS_MS) {
            const msLeft = THIRTY_DAYS_MS - ageMs;
            const normalizedStatus = normalizeStatusLabel(bid.status);
            byStatus[normalizedStatus] = (byStatus[normalizedStatus] || 0) + 1;

            bidsInRange.push({
                title: bid.title,
                url: bid.url,
                status: bid.status,
                price: bid.price,
                published,
                ageMs,
                msLeft,
            });
        }

        if (ageMs <= ONE_DAY_MS) {
            bidsToday.push(bid);
        }
    }

    bidsInRange.sort((a, b) => b.ageMs - a.ageMs);
    const nextAvailable = bidsInRange.length > 0 ? bidsInRange[0] : null;

    return {
        total30d: bidsInRange.length,
        todayCount: bidsToday.length,
        nextAvailable,
        byStatus,
        bids: bidsInRange,
    };
}

/**
 * Normalizes raw Arabic status text into a consistent label key.
 * @param {string} rawStatus - Raw status from the API
 * @returns {string} - Normalized status label
 */
function normalizeStatusLabel(rawStatus) {
    if (!rawStatus) return 'بانتظار الموافقة';
    const s = rawStatus.trim();
    if (s.includes('مكتمل')) return 'مكتمل';
    if (s.includes('مستبعد')) return 'مستبعد';
    if (s.includes('مُغلق') || s.includes('مغلق')) return 'مُغلق';
    if (s.includes('انتظار')) return 'بانتظار الموافقة';
    return s;
}

// --- Main Data Loader ---

/**
 * Fetches all bids from the API and renders the tracker.
 */
async function loadBidTrackerData() {
    try {
        const [homepageStats, allBids] = await Promise.all([
            fetchMostaqlHomepageStats(),
            fetchAllBidPages(),
        ]);

        const stats = computeBidTrackerStats(allBids);
        renderBidTrackerSummary(stats, homepageStats);
        renderBidStatusCards(stats.byStatus, stats.total30d);
        renderBidTimeline(stats.bids);
        startBidTrackerCountdowns();
    } catch (error) {
        console.error('Bid tracker load failed:', error);
        showBidErrorState(error.message);
    }
}

/**
 * Fetches all bid pages from the API.
 * @returns {Promise<Array<Object>>} - All parsed bid objects
 */
async function fetchAllBidPages() {
    const allBids = [];
    const firstPage = await fetchBidTrackerPage(1);
    const firstBids = processBidTrackerPage(firstPage);
    allBids.push(...firstBids);

    const totalPages = Math.ceil(firstPage.count / ITEMS_PER_PAGE);

    for (let page = 2; page <= totalPages; page++) {
        try {
            const pageData = await fetchBidTrackerPage(page);
            const pageBids = processBidTrackerPage(pageData);
            allBids.push(...pageBids);
        } catch (pageError) {
            console.warn(`Bid tracker: Page ${page} failed:`, pageError.message);
        }
    }

    return allBids;
}

/**
 * Scrapes the Mostaql homepage to get real available bids, plan usage, and additional bids.
 * @returns {Promise<Object>} - { available, planUsed, planTotal, additional }
 */
async function fetchMostaqlHomepageStats() {
    const defaults = { available: '-', planUsed: '-', planTotal: '-', additional: '-' };

    try {
        const response = await fetch('https://mostaql.com/', {
            credentials: 'include',
            headers: { 'Accept': 'text/html' },
        });
        if (!response.ok) return defaults;

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        return parseHomepageBidStats(doc, defaults);
    } catch (error) {
        console.warn('Homepage stats fetch failed:', error.message);
        return defaults;
    }
}

/**
 * Parses bid stats from the Mostaql homepage DOM.
 * @param {Document} doc - Parsed homepage document
 * @param {Object} defaults - Default values on parse failure
 * @returns {Object} - Parsed stats
 */
function parseHomepageBidStats(doc, defaults) {
    const result = { ...defaults };

    // Available bids: the <span class="text-alpha"> inside the "عروض متاحة" section
    const availableLink = doc.querySelector('a[href*="dashboard/bids"] .text-alpha');
    if (availableLink) {
        result.available = parseInt(availableLink.textContent.trim(), 10) || 0;
    }

    // Plan and additional: find progress bars
    const progressBars = doc.querySelectorAll('.progress__bar');
    progressBars.forEach(bar => {
        const labelEl = bar.querySelector('.pull-right');
        if (!labelEl) return;
        const label = labelEl.textContent.trim();

        if (label.includes('عروض من الخطة')) {
            const valueEl = bar.querySelector('.pull-left span, .pull-left');
            if (valueEl) {
                const parts = valueEl.textContent.trim().split('/');
                if (parts.length === 2) {
                    result.planTotal = parseInt(parts[0].trim(), 10) || 0;
                    result.planUsed = parseInt(parts[1].trim(), 10) || 0;
                }
            }
        }

        if (label.includes('عروض') && label.includes('إضافية')) {
            const valueEl = bar.querySelector('.pull-left');
            if (valueEl) {
                result.additional = parseInt(valueEl.textContent.trim(), 10) || 0;
            }
        }
    });

    return result;
}

// --- Rendering ---

/**
 * Renders the summary stats cards at the top.
 * @param {Object} stats - Computed tracker stats
 */
function renderBidTrackerSummary(stats, homepageStats) {
    const totalEl = document.getElementById('bids-total-30d');
    const availableEl = document.getElementById('bids-available-slots');
    const planEl = document.getElementById('bids-plan-usage');
    const additionalEl = document.getElementById('bids-additional');
    const nextEl = document.getElementById('bids-next-available');
    const todayEl = document.getElementById('bids-today-count');

    if (totalEl) totalEl.textContent = stats.total30d;
    if (todayEl) todayEl.textContent = stats.todayCount;

    // Real data from Mostaql homepage
    if (availableEl) availableEl.textContent = homepageStats.available;
    if (additionalEl) additionalEl.textContent = homepageStats.additional;
    if (planEl) {
        const used = homepageStats.planUsed;
        const total = homepageStats.planTotal;
        planEl.textContent = (used !== '-' && total !== '-')
            ? `${used} / ${total}`
            : '-';
    }

    if (nextEl && stats.nextAvailable) {
        const hoursLeft = Math.floor(stats.nextAvailable.msLeft / (1000 * 60 * 60));
        const daysLeft = Math.floor(hoursLeft / 24);
        const remainingHours = hoursLeft % 24;

        if (daysLeft > 0) {
            nextEl.textContent = `${daysLeft} يوم ${remainingHours} ساعة`;
        } else {
            nextEl.textContent = `${remainingHours} ساعة`;
        }
    } else if (nextEl) {
        nextEl.textContent = 'متاح الآن!';
    }
}

/** Status display configuration: icon, color, and Arabic label. */
const BID_STATUS_CONFIG = {
    'بانتظار الموافقة': { icon: 'fa-clock',        color: '#f59e0b', bg: '#fef3c7', label: 'بانتظار الموافقة' },
    'مكتمل':           { icon: 'fa-check-circle',  color: '#10b981', bg: '#d1fae5', label: 'مكتملة' },
    'مستبعد':          { icon: 'fa-times-circle',   color: '#ef4444', bg: '#fee2e2', label: 'مستبعدة' },
    'مُغلق':           { icon: 'fa-ban',            color: '#6b7280', bg: '#f3f4f6', label: 'مُغلقة' },
};

/**
 * Renders status breakdown cards into the status grid container.
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
                    <span class="bid-status-label">${config.label}</span>
                </div>
                <span class="bid-status-pct" style="color: ${config.color};">${pct}%</span>
            </div>
        `;
    }).join('');
}

/**
 * Computes countdown color based on percentage elapsed.
 * @param {number} percentage - 0 to 100 (how much of 30 days has passed)
 * @returns {string} - CSS color value
 */
function getBidCountdownColor(percentage) {
    if (percentage >= 90) return '#22c55e';
    if (percentage >= 70) return '#84cc16';
    if (percentage >= 50) return '#eab308';
    if (percentage >= 30) return '#f97316';
    return '#ef4444';
}

/**
 * Formats remaining milliseconds as "Xd Yh Zm".
 * @param {number} msLeft - Milliseconds remaining
 * @returns {string} - Formatted countdown string
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
 * Renders the bid timeline list.
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
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        });
        const appliedTime = bid.published.toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC',
        });

        const statusClass = getStatusCssClass(bid.status);
        const displayStatus = bid.status || 'بانتظار';

        return `
            <div class="bid-timeline-item" data-index="${index}">
                <div class="bid-timeline-marker" style="background: ${color};"></div>
                <div class="bid-timeline-content">
                    <div class="bid-timeline-header">
                        <a href="${bid.url || '#'}" target="_blank" class="bid-timeline-title">
                            ${bid.title || 'عرض بدون عنوان'}
                        </a>
                        <span class="bid-timeline-status ${statusClass}">${displayStatus}</span>
                    </div>
                    <div class="bid-timeline-meta">
                        <span><i class="fas fa-calendar-alt"></i> ${appliedDate}</span>
                        <span><i class="fas fa-clock"></i> ${appliedTime}</span>
                        ${bid.price ? `<span><i class="fas fa-dollar-sign"></i> ${bid.price}</span>` : ''}
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

/**
 * Returns a CSS class for a given bid status.
 * @param {string} status - Arabic status text
 * @returns {string} - CSS class name
 */
function getStatusCssClass(status) {
    if (!status) return 'bid-status-pending';
    if (status.includes('مكتمل')) return 'bid-status-completed';
    if (status.includes('مستبعد') || status.includes('مُغلق')) return 'bid-status-rejected';
    if (status.includes('انتظار')) return 'bid-status-pending';
    return 'bid-status-pending';
}

// --- Countdown Timers ---

/**
 * Starts the live countdown interval for all bid items.
 */
function startBidTrackerCountdowns() {
    clearBidTrackerTimers();

    const updateAllTimers = () => {
        document.querySelectorAll('.bid-tracker-countdown').forEach(el => {
            let msLeft = parseInt(el.getAttribute('data-ms-left'), 10);
            if (isNaN(msLeft) || msLeft <= 0) {
                el.textContent = 'متاح الآن!';
                el.style.color = '#22c55e';
                return;
            }

            msLeft -= 1000;
            el.setAttribute('data-ms-left', msLeft);
            el.textContent = formatBidCountdown(msLeft);

            const pct = Math.min(100, ((THIRTY_DAYS_MS - msLeft) / THIRTY_DAYS_MS) * 100);
            el.style.color = getBidCountdownColor(pct);
        });

        // Update progress bars in sync
        document.querySelectorAll('.bid-tracker-bar').forEach(bar => {
            let msLeft = parseInt(bar.getAttribute('data-ms-left'), 10);
            if (isNaN(msLeft) || msLeft <= 0) {
                bar.style.width = '100%';
                bar.style.background = '#22c55e';
                return;
            }

            msLeft -= 1000;
            bar.setAttribute('data-ms-left', msLeft);

            const pct = Math.min(100, ((THIRTY_DAYS_MS - msLeft) / THIRTY_DAYS_MS) * 100);
            bar.style.width = `${pct}%`;
            bar.style.background = getBidCountdownColor(pct);
        });
    };

    updateAllTimers();
    bidTrackerInterval = setInterval(updateAllTimers, 1000);
}

/**
 * Clears the countdown interval.
 */
function clearBidTrackerTimers() {
    if (bidTrackerInterval) {
        clearInterval(bidTrackerInterval);
        bidTrackerInterval = null;
    }
}

// --- UI State Helpers ---

/**
 * Shows a loading spinner inside the timeline.
 */
function showBidLoadingState() {
    const container = document.getElementById('bidsTimelineList');
    if (!container) return;

    container.innerHTML = `
        <div class="bids-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>جاري تحميل بيانات العروض...</p>
        </div>
    `;

    resetBidSummaryCards();

    const statusGrid = document.getElementById('bidsStatusGrid');
    if (statusGrid) statusGrid.innerHTML = '';
}

/**
 * Shows an error message inside the timeline.
 * @param {string} message - Error details
 */
function showBidErrorState(message) {
    const container = document.getElementById('bidsTimelineList');
    if (!container) return;

    container.innerHTML = `
        <div class="bids-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>تعذر تحميل بيانات العروض</p>
            <span>${message}</span>
            <button class="btn-secondary" onclick="refreshBidTracker()" style="margin-top: 16px;">
                <i class="fas fa-redo"></i> إعادة المحاولة
            </button>
        </div>
    `;
}

/**
 * Resets the summary stat cards to a loading state.
 */
function resetBidSummaryCards() {
    ['bids-total-30d', 'bids-available-slots', 'bids-plan-usage',
     'bids-additional', 'bids-next-available', 'bids-today-count']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
}
