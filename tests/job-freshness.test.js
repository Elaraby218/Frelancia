const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filtersPath = path.join(__dirname, '..', 'bg', 'filters.js');
const filtersSource = fs.readFileSync(filtersPath, 'utf8') + `
  ;globalThis.__freshness = {
    applyFilters,
    parseHiringRate,
    parseDurationDays,
    parseBudgetValue,
    normalizeArabicDigits,
    parseMostaqlPublishedAt,
    isRecentlyPublishedJob
  };
`;
vm.runInThisContext(filtersSource, { filename: filtersPath });

const {
  applyFilters,
  parseHiringRate,
  parseDurationDays,
  parseBudgetValue,
  normalizeArabicDigits,
  parseMostaqlPublishedAt,
  isRecentlyPublishedJob
} = global.__freshness;
const now = new Date(2026, 8, 2, 15, 0, 0).getTime();
const lastCheck = new Date(now - 60 * 1000).toISOString();

assert.equal(normalizeArabicDigits('١٢٣۴۵'), '12345');
assert.equal(parseBudgetValue('١٠٠ - ٥٠٠ دولار'), 500);
assert.equal(parseHiringRate('٨٥٪'), 85);
assert.equal(parseDurationDays('مدة التنفيذ: ٧ أيام'), 7);
assert.equal(
  applyFilters({ id: '1', title: 'مشروع JavaScript' }, { keywordsInclude: ', JavaScript, ,' }),
  true
);
assert.equal(
  applyFilters({ id: '2', title: 'مشروع تصميم' }, { keywordsInclude: ', JavaScript, ,' }),
  false
);
assert.equal(
  parseMostaqlPublishedAt({ postedAt: '2026-09-02 14:59:00' }, now),
  Date.UTC(2026, 8, 2, 14, 59, 0)
);
assert.equal(parseMostaqlPublishedAt({ time: 'منذ دقيقتين' }, now), now - 2 * 60 * 1000);
assert.equal(parseMostaqlPublishedAt({ time: 'منذ ٣ دقائق' }, now), now - 3 * 60 * 1000);
assert.equal(parseMostaqlPublishedAt({ time: 'منذ ساعتين' }, now), now - 2 * 60 * 60 * 1000);

assert.equal(
  isRecentlyPublishedJob({ time: 'منذ دقيقتين' }, { interval: 1 }, lastCheck, now),
  true
);
assert.equal(
  isRecentlyPublishedJob({ time: 'منذ 3 ساعات' }, { interval: 1 }, lastCheck, now),
  false
);
assert.equal(
  isRecentlyPublishedJob({ title: 'No timestamp' }, { interval: 1 }, lastCheck, now),
  false
);

const cairoNow = Date.UTC(2026, 8, 7, 20, 41, 0);
assert.equal(
  isRecentlyPublishedJob(
    { postedAt: '2026-09-07 20:40:30', time: 'منذ دقيقة' },
    { interval: 1 },
    new Date(cairoNow - 60 * 1000).toISOString(),
    cairoNow
  ),
  true,
  'timezone-less Mostaql UTC timestamps must remain fresh in Cairo'
);

console.log('job-freshness tests passed');
