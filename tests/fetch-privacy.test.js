const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fetcherPath = path.join(__dirname, '..', 'bg', 'fetcher.js');
const fetcherSource = fs.readFileSync(fetcherPath, 'utf8') + `
  ;globalThis.__fetcher = {
    fetchJobs,
    fetchProjectDetails,
    normalizeMostaqlUrl
  };
`;

const calls = [];
let nextResponse;
const quietConsole = { log() {}, warn() {}, error() {} };
const context = {
  URL,
  Date,
  console: quietConsole,
  fetch: async (url, options) => {
    calls.push({ url, options });
    return nextResponse;
  },
  parseJobsOffscreen: async () => [],
  parseTrackedDataOffscreen: async () => ({ status: 'open' })
};

vm.createContext(context);
vm.runInContext(fetcherSource, context, { filename: fetcherPath });

function response(status = 200, extra = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: extra.url || 'https://mostaql.com/projects?sort=latest',
    headers: {
      get(name) {
        return name.toLowerCase() === 'retry-after' ? (extra.retryAfter || null) : null;
      }
    },
    async text() {
      return extra.html || '<html></html>';
    }
  };
}

async function testAnonymousByDefaultAndExplicitAuthentication() {
  calls.length = 0;
  nextResponse = response();
  await context.__fetcher.fetchJobs('https://mostaql.com/projects?sort=latest');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.redirect, 'error');

  nextResponse = response();
  await context.__fetcher.fetchJobs('https://mostaql.com/projects?sort=latest', true);
  assert.equal(calls[1].options.credentials, 'include');
}

async function testStrictMostaqlUrlAllowlist() {
  const before = calls.length;
  await assert.rejects(
    context.__fetcher.fetchJobs('https://example.com/projects'),
    /outside https:\/\/mostaql\.com/
  );
  const invalidProject = await context.__fetcher.fetchProjectDetails('https://mostaql.com/projects');
  assert.equal(invalidProject, null);
  assert.equal(calls.length, before);
}

async function testRateLimitRequestsBackoff() {
  nextResponse = response(429, { retryAfter: '180' });

  await assert.rejects(
    context.__fetcher.fetchJobs('https://mostaql.com/projects?sort=latest'),
    error => error.status === 429 && error.backoffMs === 180000
  );
}

async function testProjectDetailsAreAnonymousByDefault() {
  calls.length = 0;
  nextResponse = response(200, { url: 'https://mostaql.com/project/123-safe' });
  const details = await context.__fetcher.fetchProjectDetails(
    'https://mostaql.com/project/123-safe'
  );

  assert.deepEqual(details, { status: 'open' });
  assert.equal(calls[0].options.credentials, 'omit');
}

(async () => {
  await testAnonymousByDefaultAndExplicitAuthentication();
  await testStrictMostaqlUrlAllowlist();
  await testRateLimitRequestsBackoff();
  await testProjectDetailsAreAnonymousByDefault();
  console.log('fetch privacy tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
