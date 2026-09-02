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
global.fetchJobs = async (url) => {
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
  Object.assign(store, {
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
    ...overrides
  });
  notificationCalls = [];
  notificationFailure = null;
  freshnessCheck = () => true;
  sourceResponses = {};
}

async function testDeduplicatesSourcesAndNotifies() {
  reset();
  sourceResponses = {
    development: [{ id: 101, title: 'First', url: 'https://mostaql.com/project/101-first' }],
    ai: [{ id: '101', title: 'First', url: 'https://mostaql.com/project/101-first' }],
    all: [{ id: 102, title: 'Second', url: 'https://mostaql.com/project/102-second' }]
  };

  const result = await global.__jobChecker.checkForNewJobs();

  assert.equal(result.success, true);
  assert.equal(result.newJobs, 2);
  assert.equal(notificationCalls.length, 1);
  assert.deepEqual(notificationCalls[0].map(job => job.id), ['101', '102']);
  assert.deepEqual(store.seenJobs, ['101', '102']);
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
}

async function testRetriesAfterNotificationFailure() {
  reset();
  sourceResponses = {
    development: [{ id: 201, title: 'Retry me', url: 'https://mostaql.com/project/201-retry' }],
    ai: [],
    all: []
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
    development: [{ id: 301, title: 'Existing', url: 'https://mostaql.com/project/301-existing' }],
    ai: [],
    all: []
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
    development: [
      { id: 401, title: 'Old', url: 'https://mostaql.com/project/401-old' },
      { id: 402, title: 'New', url: 'https://mostaql.com/project/402-new' }
    ],
    ai: [],
    all: []
  };

  const result = await global.__jobChecker.checkForNewJobs();

  assert.equal(result.newJobs, 1);
  assert.equal(result.ignoredOldJobs, 1);
  assert.deepEqual(notificationCalls[0].map(job => job.id), ['402']);
  assert.deepEqual(store.seenJobs, ['401', '402']);
}

(async () => {
  await testDeduplicatesSourcesAndNotifies();
  await testReportsTotalFetchFailure();
  await testRetriesAfterNotificationFailure();
  await testInitialCheckCreatesBaselineWithoutBacklog();
  await testOldProjectsAreIgnored();
  console.log('notification-flow tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
