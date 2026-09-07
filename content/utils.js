// ==========================================
// content/utils.js — Runtime helpers & shared state
// ==========================================

let lastPath = '';
let observerStarted = false;

function isContextValid() {
    try {
        return typeof chrome !== 'undefined' &&
            !!chrome.runtime &&
            !!chrome.runtime.id &&
            !!chrome.storage;
    } catch (e) {
        return false;
    }
}

function getPageType() {
    const path = location.pathname;
    if (/\/project[s]?\/\d+/.test(path)) return 'project';
    if (/\/message\//.test(path)) return 'message';
    if (/\/messages/.test(path)) return 'messages';
    if (/\/profile/.test(path)) return 'profile';
    if (path === '/' || path === "") return 'home';
    return 'other';
}

function getProjectId() {
    const match = window.location.pathname.match(/\/project\/(\d+)/);
    return match ? match[1] : '';
}

function escapeFrelanciaHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeMostaqlUrl(value, fallback = '#') {
    try {
        const url = new URL(String(value || ''), 'https://mostaql.com');
        const isMostaql = url.protocol === 'https:'
            && (url.hostname === 'mostaql.com' || url.hostname.endsWith('.mostaql.com'));
        return isMostaql ? url.href : fallback;
    } catch (_) {
        return fallback;
    }
}

function normalizeFrelanciaDigits(value) {
    const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
    const easternArabicIndic = '۰۱۲۳۴۵۶۷۸۹';
    return String(value ?? '')
        .replace(/[٠-٩]/g, digit => arabicIndic.indexOf(digit))
        .replace(/[۰-۹]/g, digit => easternArabicIndic.indexOf(digit));
}
