// ==========================================
// content/home.js — Homepage injectors (bid stats + monitored panel)
// Depends on: utils.js (isContextValid)
// Note: bid-fetching logic is intentionally separate from dashboard-bids.js
//       because this runs as a content script in the page DOM context.
// ==========================================

function injectDashboardStats() {
    const target = document.querySelector('#project-states');
    if (!target) return;

    if (document.getElementById('mostaql-msg-tools')) return;

    const box = document.createElement('div');
    box.id = 'mostaql-msg-tools';
    box.innerHTML = `
        <div class="panel panel-default" style="margin:0 0 10px 0;">
            <div class="heada">
                <h2 class="heada__title pull-right vcenter" style="font-size:13px;">
                    <i class="fa fa-fw fa-plug" style="color:#2386c8;"></i>
                    أدوات فرلانسيا
                </h2>
                <div class="clearfix"></div>
            </div>
            <div style="padding:10px 15px 12px; display:flex; gap:8px;">
                <button id="frelancia-show-analytics-btn" class="btn btn-sm btn-primary" style="flex:1;">
                    <i class="fa fa-bar-chart"></i> التحليلات
                </button>
                <button id="frelancia-show-monitored-btn" class="btn btn-sm btn-default" style="flex:1;">
                    <i class="fa fa-eye"></i> المراقَبة
                </button>
            </div>
        </div>`;
    target.prepend(box);

    [
        'https://mostaql.com/dashboard/bids?status=processing',
        'https://mostaql.com/dashboard/bids?status=lost',
    ].forEach(href => {
        document.querySelectorAll(`a[href="${href}"]`).forEach(el => {
            el.removeAttribute('href');
            el.style.cursor = 'default';
            el.style.pointerEvents = 'none';
        });
    });

    ['.label-prj-completed', '.label-prj-lost'].forEach(cls => {
        document.querySelectorAll(cls).forEach(bar => {
            const wrapper = bar.closest('.progress__bar');
            if (wrapper) wrapper.remove();
        });
    });

    _injectAnalyticsModal();
    _injectMonitoredModal();

    document.getElementById('frelancia-show-analytics-btn').addEventListener('click', _openAnalyticsModal);
    document.getElementById('frelancia-show-monitored-btn').addEventListener('click', _openMonitoredModal);
}

function _injectAnalyticsModal() {
    if (document.getElementById('frelancia-analytics-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'frelancia-analytics-modal';
    modal.style.cssText = `
        display: none; position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; z-index: 99999;
        background: rgba(0,0,0,0.55); overflow-y: auto;
    `;
    modal.innerHTML = `
        <div style="background:#fff; max-width:980px; margin:40px auto; border-radius:8px;
                    padding:28px; position:relative; direction:rtl; box-shadow:0 8px 40px rgba(0,0,0,0.18);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:14px;">
                <h3 style="margin:0; font-size:18px; font-weight:600;">
                    <i class="fa fa-bar-chart" style="color:#2386c8; margin-left:8px;"></i>
                    تحليلات العروض
                </h3>
                <button id="frelancia-analytics-close"
                        style="background:none; border:none; font-size:24px; cursor:pointer; color:#888; line-height:1; padding:0 4px;">
                    &times;
                </button>
            </div>
            <div id="frelancia-analytics-modal-body">
                <div style="text-align:center; padding:50px; color:#999;">
                    <i class="fa fa-spinner fa-spin fa-2x"></i>
                    <p style="margin-top:14px; font-size:15px;">جاري تحميل التحليلات...</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('frelancia-analytics-close').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

function _openAnalyticsModal() {
    const modal = document.getElementById('frelancia-analytics-modal');
    if (!modal) return;
    modal.style.display = 'block';

    if (!window._frelanciaStatsLoaded) {
        window._frelanciaStatsLoaded = true;
        _loadBidStats();
    }
}

function _injectMonitoredModal() {
    if (document.getElementById('frelancia-monitored-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'frelancia-monitored-modal';
    modal.style.cssText = `
        display: none; position: fixed; top: 0; left: 0;
        width: 100%; height: 100%; z-index: 99999;
        background: rgba(0,0,0,0.55); overflow-y: auto;
    `;
    modal.innerHTML = `
        <div style="background:#fff; max-width:780px; margin:40px auto; border-radius:8px;
                    padding:28px; position:relative; direction:rtl; box-shadow:0 8px 40px rgba(0,0,0,0.18);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:14px;">
                <h3 style="margin:0; font-size:18px; font-weight:600;">
                    <i class="fa fa-fw fa-eye" style="color:#2386c8; margin-left:8px;"></i>
                    المشاريع المراقبة
                </h3>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button id="frelancia-monitored-refresh"
                            class="btn btn-xs btn-default">
                        <i class="fa fa-refresh"></i> تحديث
                    </button>
                    <button id="frelancia-monitored-close"
                            style="background:none; border:none; font-size:24px; cursor:pointer; color:#888; line-height:1; padding:0 4px;">
                        &times;
                    </button>
                </div>
            </div>
            <div id="frelancia-monitored-modal-body">
                <div style="text-align:center; padding:50px; color:#999;">
                    <i class="fa fa-spinner fa-spin fa-2x"></i>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('frelancia-monitored-close').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    document.getElementById('frelancia-monitored-refresh').addEventListener('click', () => {
        _loadMonitoredData();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

function _openMonitoredModal() {
    const modal = document.getElementById('frelancia-monitored-modal');
    if (!modal) return;
    modal.style.display = 'block';
    _loadMonitoredData();
}

function _loadMonitoredData() {
    const listEl = document.getElementById('frelancia-monitored-modal-body');
    if (!listEl) return;

    listEl.innerHTML = `<div style="text-align:center; padding:40px; color:#999;"><i class="fa fa-spinner fa-spin fa-2x"></i></div>`;

    chrome.storage.local.get(['trackedProjects'], (data) => {
        if (chrome.runtime.lastError) return;

        const tracked = data.trackedProjects || {};
        const jobs = Object.values(tracked)
            .sort((a, b) => (b.lastChecked || '').localeCompare(a.lastChecked || ''));

        if (jobs.length === 0) {
            listEl.innerHTML = `
                <div class="list-group-item" style="padding:30px; text-align:center; color:#888; border:none;">
                    لا توجد مشاريع مراقبة. افتح أي مشروع واضغط <strong>مراقبة</strong> لإضافته.
                </div>`;
            return;
        }

        listEl.innerHTML = `<div class="panel-listing">` + jobs.map(job => {
            const poster   = job.clientName   ? `<li><span class="text-muted"><i class="fa fa-fw fa-user"></i> ${escapeFrelanciaHtml(job.clientName)}</span></li>` : '';
            const timeAgo  = job.publishDate  ? `<li><span class="text-muted"><i class="fa fa-fw fa-clock-o"></i> ${escapeFrelanciaHtml(job.publishDate)}</span></li>` : '';
            const bids     = job.communications ? `<li><span class="text-muted"><i class="fa fa-fw fa-handshake-o"></i> ${escapeFrelanciaHtml(job.communications)} تواصل</span></li>` : '';
            const budget   = (job.budget && job.budget !== 'غير محدد') ? `<li><span class="text-muted"><i class="fa fa-fw fa-money"></i> ${escapeFrelanciaHtml(job.budget)}</span></li>` : '';
            const status   = job.status || 'مفتوح';
            let statusCls  = 'label-prj-open';
            if (status.includes('تنفيذ') || status.includes('جارٍ')) statusCls = 'label-prj-processing';
            if (status.includes('مغلق') || status.includes('مكتمل') || status.includes('ملغى')) statusCls = 'label-prj-closed';
            const meta = [poster, timeAgo, bids, budget].filter(Boolean).join('');
            const safeUrl = escapeFrelanciaHtml(safeMostaqlUrl(job.url));
            const safeTitle = escapeFrelanciaHtml(job.title || 'بدون عنوان');
            const safeStatus = escapeFrelanciaHtml(status);
            return `
                <div class="list-group-item brd--b mrg--an">
                    <h5 class="listing__title project__title mrg--bt-reset">
                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a>
                        <span class="label ${statusCls}" style="font-size:10px; margin-right:6px;">${safeStatus}</span>
                    </h5>
                    ${meta ? `<ul class="project__meta list-meta text-zeta clr-gray-dark">${meta}</ul>` : ''}
                </div>`;
        }).join('') + `</div>`;
    });
}

function _extractBidRow(renderedHtml) {
    if (typeof renderedHtml !== 'string') {
        console.error('_extractBidRow expects a string, received:', typeof renderedHtml);
        return null;
    }
    const tpl = document.createElement("template");
    tpl.innerHTML = renderedHtml.trim();
    const row = tpl.content.querySelector("tr.bid-row");
    if (!row) return null;

    const titleLink = row.querySelector("h2 a");
    const statusEl = row.querySelector(".label-prj-pending, .label");
    const timeEl = row.querySelector("time[datetime]");
    const priceEl = row.querySelector(".project__meta li .fa-money")?.closest("li")?.querySelector("span");
    const url = (titleLink?.getAttribute("href") || null).split("-")[0];

    let publishedText = null;
    if (timeEl) {
        const li = timeEl.closest("li");
        publishedText = li ? li.textContent.replace(/\s+/g, " ").trim() : null;
    }

    return {
        title: titleLink?.textContent?.trim() || null,
        url,
        status: statusEl?.textContent?.trim() || null,
        publishedDatetime: timeEl?.getAttribute("datetime") || null,
        price: priceEl?.textContent?.trim() || null
    };
}

function _generateStatusStats(items, opts = {}) {
    const now = opts.now instanceof Date ? opts.now : new Date();
    const days30Ms = 30 * 24 * 60 * 60 * 1000;
    const day1Ms = 1 * 24 * 60 * 60 * 1000;

    const safeArray = Array.isArray(items) ? items : [];
    const normalizeStatus = (s) => (typeof s === "string" && s.trim() ? s.trim() : "UNKNOWN");

    const parsePublished = (v) => {
        if (!v) return null;
        if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
        if (typeof v !== "string") return null;
        const str = v.trim();
        if (!str) return null;
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
        if (m) {
            const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)));
            return Number.isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(str);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    const makeEmptyBucket = () => ({ total: 0, byStatus: {}, invalidDateCount: 0 });
    const overall = makeEmptyBucket();
    const last30Days = makeEmptyBucket();
    const last1Day = makeEmptyBucket();
    const recent24hBids = [];

    const addToBucket = (bucket, status) => {
        bucket.total += 1;
        bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
    };

    for (const item of safeArray) {
        const status = normalizeStatus(item?.status);
        addToBucket(overall, status);
        const published = parsePublished(item?.publishedDatetime);
        if (!published) {
            last30Days.invalidDateCount += 1;
            last1Day.invalidDateCount += 1;
            continue;
        }
        const ageMs = now.getTime() - published.getTime();
        if (ageMs < 0) continue;
        if (ageMs <= days30Ms) addToBucket(last30Days, status);
        if (ageMs <= day1Ms) {
            addToBucket(last1Day, status);
            recent24hBids.push({ title: item.title, url: item.url, ageMs, published });
        }
    }

    const uniqueStatuses = Array.from(new Set(Object.keys(overall.byStatus))).sort((a, b) => a.localeCompare(b, "ar"));

    return {
        meta: { now: now.toISOString(), totalItems: safeArray.length, uniqueStatuses },
        status: overall,
        last30Days: last30Days,
        last1Day: last1Day,
        recent24hBids: recent24hBids
    };
}

async function _fetchBidPage(pageNumber) {
    const url = `https://mostaql.com/dashboard/bids?page=${pageNumber}&sort=latest`;
    const response = await fetch(url, {
        method: "GET",
        headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" },
        credentials: "include",
    });
    if (!response.ok) throw new Error(`Page ${pageNumber} request failed`);
    return await response.json();
}

function _processBidsFromPage(data) {
    const bids = [];
    if (data.collection && Array.isArray(data.collection)) {
        data.collection.forEach((bidObject) => {
            const htmlString = bidObject.rendered || bidObject;
            const item = _extractBidRow(htmlString);
            if (item) {
                item.apiBidId = bidObject.id || null;
                bids.push(item);
            }
        });
    }
    return bids;
}

async function _fetchAllBids() {
    const itemsPerPage = 25;
    const allBids = [];

    const firstData = await _fetchBidPage(1);
    console.log("all bids count:", firstData.count);

    const totalPages = Math.ceil(firstData.count / itemsPerPage);
    console.log("total pages:", totalPages);

    allBids.push(..._processBidsFromPage(firstData));

    for (let page = 2; page <= totalPages; page++) {
        console.log(`Fetching page ${page}...`);
        try {
            const data = await _fetchBidPage(page);
            allBids.push(..._processBidsFromPage(data));
        } catch (err) {
            console.warn(`Page ${page} failed:`, err.message);
        }
    }

    return _generateStatusStats(allBids);
}

function _renderBidStats(stats) {
    const BIDS_URL = 'https://mostaql.com/dashboard/bids';

    const STATUS_CONFIG = {
        'مكتمل': { label: 'مكتملة', cssClass: 'label-prj-completed', href: `${BIDS_URL}?status=completed` },
        'مستبعد': { label: 'مستبعدة', cssClass: 'label-prj-lost', href: BIDS_URL },
        'مُغلق': { label: 'مُغلق', cssClass: 'label-prj-closed', href: BIDS_URL },
        'بانتظار الموافقة': { label: 'بانتظار الموافقة', cssClass: 'label-prj-open', href: `${BIDS_URL}?status=pending` },
    };

    const pct = (part, whole) => whole > 0 ? Math.round((part / whole) * 100) : 0;

    const makeBar = ({ label, count, pct: p, cssClass = '', href = BIDS_URL, isLink = true }) => {
        const safeLabel = escapeFrelanciaHtml(label);
        const inner = `
            <div class="projects-progress">
                <div class="clearfix">
                    <div class="pull-right">${count} ${safeLabel}</div>
                    <div class="pull-left">${p}%</div>
                </div>
                <div class="progress progress--slim">
                    <div class="progress-bar ${cssClass}" role="progressbar"
                         aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"
                         style="width:${p}%">
                        <span class="sr-only">${p}%</span>
                    </div>
                </div>
            </div>`;
        return isLink
            ? `<a href="${href}" class="progress__bar docs-creator">${inner}</a>`
            : `<span class="progress__bar">${inner}</span>`;
    };

    const buildBars = (keys, byStatus, total) =>
        keys.map(key => {
            const cfg = STATUS_CONFIG[key] || { label: key, cssClass: '', href: BIDS_URL };
            const count = byStatus[key] || 0;
            return makeBar({ label: cfg.label, count, pct: pct(count, total), cssClass: cfg.cssClass, href: cfg.href });
        });

    const renderColumn = ({ icon, title, summaryBar, bars, emptyMsg }) => `
        <div class="col-sm-4 progress__bars">
            <p class="text-muted mostaql-stats-header">
                <i class="fa ${icon}"></i> ${title}
            </p>
            ${summaryBar}
            ${bars.length > 0 ? bars.join('') : `<span class="text-muted mostaql-stats-empty">${emptyMsg || ''}</span>`}
        </div>`;

    const { status: overall, last30Days, last1Day, recent24hBids } = stats;

    const overallColumn = renderColumn({
        icon: 'fa-list-ul', title: 'إجمالي العروض',
        summaryBar: makeBar({ label: 'إجمالي العروض', count: overall.total, pct: 100, href: BIDS_URL }),
        bars: buildBars(['مكتمل', 'مستبعد', 'مُغلق'], overall.byStatus, overall.total),
    });

    const last30Column = renderColumn({
        icon: 'fa-calendar', title: 'آخر 30 يوم',
        summaryBar: makeBar({ label: 'آخر 30 يوم (إجمالي)', count: last30Days.total, pct: pct(last30Days.total, overall.total), cssClass: 'label-prj-open', href: BIDS_URL }),
        bars: buildBars(['بانتظار الموافقة', 'مستبعد', 'مُغلق'], last30Days.byStatus, last30Days.total),
    });

    const todayKeys = Object.keys(last1Day.byStatus);
    const todayColumn = renderColumn({
        icon: 'fa-clock-o', title: 'اليوم',
        summaryBar: makeBar({ label: 'اليوم (إجمالي)', count: last1Day.total, pct: pct(last1Day.total, overall.total), cssClass: 'label-prj-processing', href: BIDS_URL }),
        bars: buildBars(todayKeys, last1Day.byStatus, last1Day.total),
        emptyMsg: 'لا توجد عروض اليوم',
    });

    let countdownsHtml = '';
    if (recent24hBids && recent24hBids.length > 0) {
        countdownsHtml = `<div class="row" style="margin-top:20px;">`;
        const sortedBids = recent24hBids.sort((a, b) => b.ageMs - a.ageMs);
        const numCols = 3;
        const buckets = Array.from({ length: numCols }, () => []);
        sortedBids.forEach((bid, index) => { buckets[index % numCols].push(bid); });

        for (let i = 0; i < numCols; i++) {
            const chunk = buckets[i];
            countdownsHtml += `<div class="col-sm-4 progress__bars">`;
            countdownsHtml += i === 0
                ? `<p class="text-muted mostaql-stats-header"><i class="fa fa-refresh"></i> حالة العروض اليومية</p>`
                : `<p class="mostaql-stats-header" style="visibility:hidden;">-</p>`;

            if (chunk.length > 0) {
                countdownsHtml += chunk.map(bid => {
                    const totalMs = 24 * 60 * 60 * 1000;
                    const msLeft = totalMs - bid.ageMs;
                    if (msLeft <= 0) return '';
                    const p = Math.max(0, Math.min(100, Math.round(((totalMs - msLeft) / totalMs) * 100)));
                    const appliedAtStr = bid.published.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                    let color = '#dc3545';
                    if (p >= 85) color = '#28a745';
                    else if (p >= 50) color = '#ffc107';
                    else if (p >= 25) color = '#17a2b8';
                    const safeUrl = escapeFrelanciaHtml(safeMostaqlUrl(bid.url));
                    const safeTitle = escapeFrelanciaHtml(bid.title || 'عرض');
                    return `
                        <a href="${safeUrl}" ${bid.url ? 'target="_blank" rel="noopener noreferrer"' : ''} class="progress__bar docs-creator">
                            <div class="projects-progress" title="تاريخ التقديم: ${appliedAtStr}">
                                <div class="clearfix">
                                    <div class="pull-right" style="max-width: 65%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeTitle}</div>
                                    <div class="pull-left frelancia-countdown" data-ms-left="${msLeft}" style="color:${color}; font-family:monospace; font-weight:bold; letter-spacing:0.5px; direction:ltr;">--:--:--</div>
                                </div>
                                <div class="progress progress--slim">
                                    <div class="progress-bar frelancia-progress-bar" role="progressbar" style="width:${p}%; background-color:${color};"></div>
                                </div>
                            </div>
                        </a>`;
                }).join('');
            }
            countdownsHtml += `</div>`;
        }
        countdownsHtml += `</div>`;
    }

    const modalBody = document.getElementById('frelancia-analytics-modal-body');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="row" style="margin-bottom:20px; display:flex; align-items:flex-start;">
            ${overallColumn}${last30Column}${todayColumn}
        </div>
        ${countdownsHtml ? `<div>${countdownsHtml}</div>` : ''}
    `;

    _startSlotCountdowns();
}

function _startSlotCountdowns() {
    if (window.frelanciaCountdownsInterval) {
        clearInterval(window.frelanciaCountdownsInterval);
    }

    const updateTimers = () => {
        const totalMs = 24 * 60 * 60 * 1000;
        document.querySelectorAll('.frelancia-countdown').forEach(el => {
            let msLeft = parseInt(el.getAttribute('data-ms-left'), 10);
            if (isNaN(msLeft) || msLeft <= 0) {
                el.textContent = 'متاح الآن!';
                el.style.color = '#28a745';
                const container = el.closest('.projects-progress');
                if (container) {
                    const bar = container.querySelector('.progress-bar');
                    if (bar) { bar.style.width = '100%'; bar.style.backgroundColor = '#28a745'; }
                }
                return;
            }
            msLeft -= 1000;
            el.setAttribute('data-ms-left', msLeft);
            const hours = Math.floor(msLeft / (1000 * 60 * 60));
            const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((msLeft % (1000 * 60)) / 1000);
            el.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            const p = Math.max(0, Math.min(100, ((totalMs - msLeft) / totalMs) * 100));
            let color = '#dc3545';
            if (p >= 85) color = '#28a745';
            else if (p >= 50) color = '#ffc107';
            else if (p >= 25) color = '#17a2b8';
            el.style.color = color;
            const container = el.closest('.projects-progress');
            if (container) {
                const bar = container.querySelector('.progress-bar');
                if (bar) { bar.style.width = `${p}%`; bar.style.backgroundColor = color; }
            }
        });
    };

    updateTimers();
    window.frelanciaCountdownsInterval = setInterval(updateTimers, 1000);
}

async function _loadBidStats() {
    try {
        const stats = await _fetchAllBids();
        console.log("Final stats:", stats);
        _renderBidStats(stats);
    } catch (err) {
        console.error("Error fetching bids:", err);
    }
}

function injectMonitoredProjects() {
    _injectMonitoredModal();
}
