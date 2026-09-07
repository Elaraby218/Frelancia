const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'dashboard', 'sanitize.js');
const source = fs.readFileSync(sourcePath, 'utf8')
    + '\n;globalThis.__sanitize = { escapeDashboardHtml, safeDashboardUrl, normalizeDashboardDigits };';

vm.runInThisContext(source, { filename: sourcePath });

const { escapeDashboardHtml, safeDashboardUrl } = global.__sanitize;

assert.equal(
    escapeDashboardHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
);
assert.equal(safeDashboardUrl('javascript:alert(1)'), '#');
assert.equal(safeDashboardUrl('not a url'), '#');
assert.equal(safeDashboardUrl('https://mostaql.com/project/123-test'), 'https://mostaql.com/project/123-test');
assert.equal(global.__sanitize.normalizeDashboardDigits('١٢۳۴'), '1234');

console.log('dashboard-sanitize tests passed');
