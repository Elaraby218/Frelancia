// ==========================================
// dashboard-bids/data.js — Stats computation & date parsing
// Depends on: constants.js (THIRTY_DAYS_MS, ONE_DAY_MS)
// ==========================================

/**
 * Parses a datetime string into a Date object.
 * Handles "YYYY-MM-DD HH:mm:ss" and ISO formats.
 * @param {*} value
 * @returns {Date|null}
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
 * Normalizes raw Arabic status text into a consistent label key.
 * @param {string} rawStatus
 * @returns {string}
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

/**
 * Filters bids to the last 30 days and computes statistics.
 * @param {Array<Object>} allBids
 * @returns {Object} - { total30d, todayCount, nextAvailable, byStatus, bids }
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
