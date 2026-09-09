const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'content', 'utils.js');
const source = fs.readFileSync(sourcePath, 'utf8')
    + '\n;globalThis.__contentSanitize = { escapeFrelanciaHtml, safeMostaqlUrl, normalizeFrelanciaDigits };';

global.location = { pathname: '/' };
global.window = { location: { pathname: '/' } };
vm.runInThisContext(source, { filename: sourcePath });

const { escapeFrelanciaHtml, safeMostaqlUrl } = global.__contentSanitize;
assert.equal(escapeFrelanciaHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.equal(safeMostaqlUrl('/project/123-test'), 'https://mostaql.com/project/123-test');
assert.equal(safeMostaqlUrl('javascript:alert(1)'), '#');
assert.equal(safeMostaqlUrl('https://example.com/project/1'), '#');
assert.equal(global.__contentSanitize.normalizeFrelanciaDigits('٩٨۷۶'), '9876');

console.log('content-sanitize tests passed');
