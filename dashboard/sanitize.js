// Shared output encoding for values loaded from Mostaql, GitHub, and backups.
function escapeDashboardHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeDashboardUrl(value, fallback = '#') {
    try {
        const url = new URL(String(value || ''));
        return (url.protocol === 'https:' || url.protocol === 'http:')
            ? url.href
            : fallback;
    } catch (_) {
        return fallback;
    }
}


function normalizeDashboardDigits(value) {
    const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
    const easternArabicIndic = '۰۱۲۳۴۵۶۷۸۹';
    return String(value ?? '')
        .replace(/[٠-٩]/g, digit => arabicIndic.indexOf(digit))
        .replace(/[۰-۹]/g, digit => easternArabicIndic.indexOf(digit));
}
