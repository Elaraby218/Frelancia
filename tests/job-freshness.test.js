const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filtersPath = path.join(__dirname, '..', 'bg', 'filters.js');
const filtersSource = fs.readFileSync(filtersPath, 'utf8') + `
  ;globalThis.__freshness = {
    normalizeArabicDigits,
    parseMostaqlPublishedAt,
    isRecentlyPublishedJob
  };
`;
vm.runInThisContext(filtersSource, { filename: filtersPath });

const { normalizeArabicDigits, parseMostaqlPublishedAt, isRecentlyPublishedJob } = global.__freshness;
const now = new Date(2026, 8, 2, 15, 0, 0).getTime();
const lastCheck = new Date(now - 60 * 1000).toISOString();

assert.equal(normalizeArabicDigits('١٢٣۴۵'), '12345');
assert.equal(
  parseMostaqlPublishedAt({ postedAt: '2026-09-02 14:59:00' }, now),
  new Date(2026, 8, 2, 14, 59, 0).getTime()
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

console.log('job-freshness tests passed');
