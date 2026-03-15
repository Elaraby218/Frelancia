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
    box.className = 'mostaql-ext-sidebar-container';
    box.innerHTML = '';
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

    _loadBidStats();
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
        const inner = `
            <div class="projects-progress">
                <div class="clearfix">
                    <div class="pull-right">${count} ${label}</div>
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
                    return `
                        <a href="${bid.url || '#'}" ${bid.url ? 'target="_blank"' : ''} class="progress__bar docs-creator">
                            <div class="projects-progress" title="تاريخ التقديم: ${appliedAtStr}">
                                <div class="clearfix">
                                    <div class="pull-right" style="max-width: 65%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${bid.title || 'عرض'}</div>
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

    const target = document.querySelector('#project-states');
    if (!target) return;

    const existing = document.getElementById('mostaql-bid-stats');
    if (existing) existing.remove();
    const existingSlotsRow = document.getElementById('mostaql-bid-slots-row');
    if (existingSlotsRow) existingSlotsRow.remove();

    const firstNativeRow = target.querySelector('.row');
    if (firstNativeRow) {
        firstNativeRow.insertAdjacentHTML('beforebegin', `
            <div class="row" id="mostaql-bid-stats" style="margin-bottom:20px; display: flex; align-items: flex-start;">
                ${overallColumn}${last30Column}${todayColumn}
            </div>`);
        if (countdownsHtml) {
            firstNativeRow.insertAdjacentHTML('afterend', `<div id="mostaql-bid-slots-row">${countdownsHtml}</div>`);
        }
    } else {
        const box = document.getElementById('mostaql-msg-tools');
        if (box) {
            box.insertAdjacentHTML('afterend', `
                <div class="row" id="mostaql-bid-stats" style="display: flex; align-items: flex-start;">
                    ${overallColumn}${last30Column}${todayColumn}
                </div>
                ${countdownsHtml ? `<div id="mostaql-bid-slots-row">${countdownsHtml}</div>` : ''}`);
        }
    }

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
    const anchorPanel = document.querySelector('#dashboard__latest-published-panel');
    if (!anchorPanel) return;

    if (document.getElementById('frelancia-monitored-panel')) return;
    if (!isContextValid()) return;

    const panel = document.createElement('div');
    panel.id = 'frelancia-monitored-panel';
    panel.className = 'panel panel-default mrg--bm';
    panel.innerHTML = `
        <div class="heada">
            <h2 class="heada__title pull-right vcenter">
                <a href="javascript:void(0)" class="dsp--b clr-gray-dark" style="cursor:default;">
                    <i class="fa fa-fw fa-eye" style="color:#2386c8;"></i>
                    المشاريع المراقبة
                    <span style="font-size:12px; font-weight:400; color:#999; margin-right:8px;">آخر 7 مشاريع</span>
                </a>
            </h2>
            <div class="pull-left">
                <button id="frelancia-refresh-monitored" class="btn btn-xs btn-default" style="margin-top:12px;">
                    <i class="fa fa-refresh"></i>
                </button>
            </div>
        </div>
        <div class="carda__body collapse in panel-listing">
            <div class="row panel-list" id="frelancia-monitored-list">
                <div style="padding:20px; text-align:center; color:#999;"><i class="fa fa-spinner fa-spin"></i></div>
            </div>
        </div>`;

    anchorPanel.insertAdjacentElement('afterend', panel);

    chrome.storage.local.get(['trackedProjects'], (data) => {
        if (chrome.runtime.lastError) return;
        const listEl = document.getElementById('frelancia-monitored-list');
        if (!listEl) return;

        const tracked = data.trackedProjects || {};
        const jobs = Object.values(tracked)
            .sort((a, b) => (b.lastChecked || '').localeCompare(a.lastChecked || ''))
            .slice(0, 7);

        if (jobs.length === 0) {
            listEl.innerHTML = `<div class="list-group-item mrg--an" style="padding:20px; text-align:center; color:#888;">لا توجد مشاريع مراقبة. افتح أي مشروع واضغط <strong>مراقبة</strong> لإضافته.</div>`;
            return;
        }

        listEl.innerHTML = jobs.map(job => {
            const poster = job.clientName ? `<span class="text-muted"><i class="fa fa-fw fa-user"></i> ${job.clientName}</span>` : '';
            const timeAgo = job.publishDate ? `<span class="text-muted"><i class="fa fa-fw fa-clock-o"></i> ${job.publishDate}</span>` : '';
            const bids = job.communications ? `<span class="text-muted"><i class="fa fa-fw fa-handshake-o"></i> ${job.communications} تواصل</span>` : '';
            const budget = (job.budget && job.budget !== 'غير محدد') ? `<span class="text-muted"><i class="fa fa-fw fa-money"></i> ${job.budget}</span>` : '';
            const status = job.status || 'مفتوح';
            let statusCls = 'label-prj-open';
            if (status.includes('تنفيذ') || status.includes('جارٍ')) statusCls = 'label-prj-processing';
            if (status.includes('مغلق') || status.includes('مكتمل') || status.includes('ملغى')) statusCls = 'label-prj-closed';
            const metaItems = [poster, timeAgo, bids, budget].filter(Boolean).map(m => `<li>${m}</li>`).join('');
            return `
            <div class="list-group-item brd--b mrg--an">
                <h5 class="listing__title project__title mrg--bt-reset">
                    <a href="${job.url}" target="_blank">${job.title || 'بدون عنوان'}</a>
                    <span class="label ${statusCls}" style="font-size:10px; margin-right:6px;">${status}</span>
                </h5>
                ${metaItems ? `<ul class="project__meta list-meta text-zeta clr-gray-dark">${metaItems}</ul>` : ''}
            </div>`;
        }).join('');
    });

    panel.querySelector('#frelancia-refresh-monitored').addEventListener('click', () => {
        panel.remove();
        injectMonitoredProjects();
    });
}
