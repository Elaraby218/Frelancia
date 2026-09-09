const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const checkerPath = path.join(__dirname, '..', 'bg', 'job-checker.js');
const checkerSource = fs.readFileSync(checkerPath, 'utf8')
  + '\n;globalThis.__jobChecker = { checkForNewJobs };';

const store = {};
let sourceResponses = {};
let notificationCalls = [];
let notificationFailure = null;
let freshnessCheck = () => true;
let fetchCalls = [];

global.chrome = {
  storage: {
    local: {
      async get() {
        return structuredClone(store);
      },
      async set(changes) {
        Object.assign(store, structuredClone(changes));
      }
    }
  }
};
global.MOSTAQL_URLS = {
  development: 'development',
  ai: 'ai',
  all: 'all'
};
global.fetchJobs = async (url, useAuthenticatedSession) => {
  fetchCalls.push({ url, useAuthenticatedSession });
  const response = sourceResponses[url];
  if (response instanceof Error) throw response;
  return structuredClone(response || []);
};
global.fetchProjectDetails = async () => null;
global.applyFilters = () => true;
global.isQuietHour = () => false;
global.isRecentlyPublishedJob = (...args) => freshnessCheck(...args);
global.showNotification = async (jobs) => {
  notificationCalls.push(structuredClone(jobs));
  if (notificationFailure) throw notificationFailure;
  return 'notification-id';
};
global.playSound = async () => {};

vm.runInThisContext(checkerSource, { filename: checkerPath });

function reset(overrides = {}) {
  for (const key of Object.keys(store)) delete store[key];
  const defaults = {
    settings: {
      development: true,
      ai: true,
      all: true,
      sound: false,
      systemEnabled: true
    },
    seenJobs: [],
    recentJobs: [],
    stats: {
      todayCount: 0,
      todayDate: new Date().toDateString(),
      lastCheck: new Date(Date.now() - 60 * 1000).toISOString()
    },
    notificationsEnabled: true,
  };
  Object.assign(store, defaults, overrides);
  store.settings = { ...defaults.settings, ...(overrides.settings || {}) };
  notificationCalls = [];
  notificationFailure = null;
  freshnessCheck = () => true;
  sourceResponses = {};
  fetchCalls = [];
}

async function testDeduplicatesSourcesAndNotifies() {
  reset({ settings: { all: false } });
  sourceResponses = {
    development: [{ id: 101, title: 'First', url: 'https://mostaql.com/project/101-first' }],
    ai: [
      { id: '101', title: 'First', url: 'https://mostaql.com/project/101-first' },
      { id: 102, title: 'Second', url: 'https://mostaql.com/project/102-second' }
    ]
  };

  const result = await global.__jobChecker.checkForNewJobs();

  assert.equal(result.success, true);
  assert.equal(result.newJobs, 2);
  assert.equal(notificationCalls.length, 1);
  assert.deepEqual(notificationCalls[0].map(job => job.id), ['101', '102']);
  assert.deepEqual(store.seenJobs, ['101', '102']);
}

async function testAllSourceReplacesOverlappingCategoryRequests() {
  reset({ settings: { authenticatedPolling: true } });
  sourceResponses = {
    all: [{ id: 150, title: 'One request', url: 'https://mostaql.com/project/150-one-request' }]
  };

  const result = await global.__jobChecker.checkForNewJobs();

  assert.equal(result.success, true);
  assert.deepEqual(fetchCalls, [{ url: 'all', useAuthenticatedSession: true }]);
}

async function testReportsTotalFetchFailure() {
  reset({
    stats: { todayCount: 0, todayDate: new Date().toDateString() }
  });
  sourceResponses = {
    development: new Error('HTTP 403'),
    ai: new Error('HTTP 403'),
    all: new Error('HTTP 403')
  };

  const result = await global.__jobChecker.checkForNewJobs();

  assert.equal(result.success, false);
  assert.match(result.error, /HTTP 403/);
  assert.equal(notificationCalls.length, 0);
  assert.deepEqual(store.seenJobs, []);
  assert.equal(store.stats.lastCheck, undefined);
  assert.ok(store.stats.lastAttempt);
  assert.ok(store.stats.nextCheckAllowedAt);
  assert.ok(store.mostaqlBackoffUntil > Date.now());

  const retryResult = await global.__jobChecker.checkForNewJobs();
  assert.equal(retryResult.skipped, true);
  assert.equal(retryResult.reason, 'mostaql-backoff');
  assert.equal(fetchCalls.length, 1);
}

async function testRetriesAfterNotificationFailure() {
  reset();
  sourceResponses = {
    all: [{ id: 201, title: 'Retry me', url: 'https://mostaql.com/project/201-retry' }]
  };
  notificationFailure = new Error('Notifications are blocked');

  const result = await global.__jobChecker.checkForNewJobs();

  assert.equal(result.success, false);
  assert.match(result.error, /Notifications are blocked/);
  assert.deepEqual(store.seenJobs, []);
  assert.equal(store.stats.todayCount, 0);
}

async function testInitialCheckCreatesBaselineWithoutBacklog() {
  reset({
    stats: { todayCount: 0, todayDate: new Date().toDateString() }
  });
  sourceResponses = {
    all: [{ id: 301, title: 'Existing', url: 'https://mostaql.com/project/301-existing' }]
  };

  const result = await global.__jobChecker.checkForNewJobs();

  assert.equal(result.success, true);
  assert.equal(result.newJobs, 0);
  assert.equal(result.ignoredOldJobs, 1);
  assert.equal(notificationCalls.length, 0);
  assert.deepEqual(store.seenJobs, ['301']);
}

async function testOldProjectsAreIgnored() {
  reset();
  freshnessCheck = job => job.id === '402';
  sourceResponses = {
    all: [
      { id: 401, title: 'Old', url: 'https://mostaql.com/project/401-old' },
      { id: 402, title: 'New', url: 'https://mostaql.com/project/402-new' }
    ]
  };

  const result = await global.__jobChecker.checkForNewJobs();

  assert.equal(result.newJobs, 1);
  assert.equal(result.ignoredOldJobs, 1);
  assert.deepEqual(notificationCalls[0].map(job => job.id), ['402']);
  assert.deepEqual(store.seenJobs, ['401', '402']);
}

(async () => {
  await testDeduplicatesSourcesAndNotifies();
  await testAllSourceReplacesOverlappingCategoryRequests();
  await testReportsTotalFetchFailure();
  await testRetriesAfterNotificationFailure();
  await testInitialCheckCreatesBaselineWithoutBacklog();
  await testOldProjectsAreIgnored();
  console.log('notification-flow tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
