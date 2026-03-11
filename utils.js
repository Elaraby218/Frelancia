/**
 * Frelancia Pro — Shared Utilities
 */

const FrelanciaUtils = {
  // --- Date & Time ---
  formatTime: (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  },

  formatArabicTime: (date) => {
    return new Date(date).toLocaleTimeString('ar-EG');
  },

  getIsoDate: (date = new Date()) => {
    return date.toISOString().split('T')[0];
  },

  parseArabicDate: (dateText) => {
    const arabicMonths = {
      'يناير': 0, 'فبراير': 1, 'مارس': 2, 'أبريل': 3, 'مايو': 4, 'يونيو': 5,
      'يوليو': 6, 'أغسطس': 7, 'سبتمبر': 8, 'أكتوبر': 9, 'نوفمبر': 10, 'ديسمبر': 11
    };

    const parts = dateText.split(' ');
    if (parts.length < 3) return null;

    const day = parseInt(parts[0]);
    const monthName = parts[1];
    const year = parseInt(parts[2]);
    const month = arabicMonths[monthName];

    if (isNaN(day) || month === undefined || isNaN(year)) return null;

    return new Date(year, month, day);
  },

  calculateClientAgeDays: (dateText) => {
    const regDate = FrelanciaUtils.parseArabicDate(dateText);
    if (!regDate) return -1;
    const diffTime = Math.abs(new Date() - regDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  // --- Parsing ---
  parseBudgetValue: (budgetText) => {
    if (!budgetText || budgetText === 'غير محدد') return 0;
    const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
    if (!matches) return 0;
    const values = matches.map(m => parseFloat(m));
    return Math.max(...values);
  },

  parseMinBudgetValue: (budgetText) => {
    if (!budgetText || budgetText === 'غير محدد') return 0;
    const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
    if (!matches) return 0;
    const values = matches.map(m => parseFloat(m));
    return Math.min(...values);
  },

  parseDurationDays: (durationText) => {
    if (!durationText) return 0;
    const match = durationText.match(/\d+/);
    if (match) return parseInt(match[0]);
    if (durationText.includes("يوم واحد")) return 1;
    return 0;
  },

  parseHiringRate: (rateText) => {
    if (!rateText || rateText.includes('بعد')) return 0;
    const match = rateText.replace(/,/g, '').match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
  },

  cleanTitle: (text) => {
    if (!text) return 'مشروع جديد';
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  // --- Storage ---
  getStorage: (keys) => {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (data) => resolve(data));
    });
  },

  setStorage: (data) => {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => resolve());
    });
  },

  // --- DOM ---
  $: (id) => document.getElementById(id),

  toggleHidden: (el, isHidden) => {
    if (!el) return;
    if (isHidden) el.classList.add('hidden');
    else el.classList.remove('hidden');
  }
};

// Export if in Node (for testing, if any) or just leave global for extension scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FrelanciaUtils;
}
