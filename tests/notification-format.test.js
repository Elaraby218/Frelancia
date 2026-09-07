const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const notificationsPath = path.join(__dirname, '..', 'bg', 'notifications.js');
const notificationsSource = fs.readFileSync(notificationsPath, 'utf8')
  + '\n;globalThis.__notifications = { formatNotificationBudget, showNotification };';

let createdOptions;

global.chrome = {
  runtime: { lastError: null },
  notifications: {
    create(options, callback) {
      createdOptions = options;
      callback('test-notification');
    },
    onClicked: { addListener() {} },
    onButtonClicked: { addListener() {} },
    onClosed: { addListener() {} }
  },
  storage: {
    local: {
      async set() {},
      get() {},
      remove() {}
    }
  },
  tabs: { create() {} }
};
global.parseDurationDays = () => 0;

vm.runInThisContext(notificationsSource, { filename: notificationsPath });

async function testUnknownBudgetIsOmitted() {
  await global.__notifications.showNotification([{
    id: '1',
    title: 'مشروع جديد',
    budget: 'غير محدد',
    url: 'https://mostaql.com/project/1-test'
  }]);

  assert.equal(createdOptions.message, 'مشروع جديد');
  assert.equal(createdOptions.message.includes('غير محدد'), false);
}

async function testRealBudgetIsIncluded() {
  await global.__notifications.showNotification([{
    id: '2',
    title: 'مشروع آخر',
    budget: '250 - 500 دولار',
    url: 'https://mostaql.com/project/2-test'
  }]);

  assert.equal(createdOptions.message, 'مشروع آخر [ 250 - 500 دولار ]');
}

(async () => {
  assert.equal(global.__notifications.formatNotificationBudget(' غير معروفة '), '');
  assert.equal(global.__notifications.formatNotificationBudget('N/A'), '');
  await testUnknownBudgetIsOmitted();
  await testRealBudgetIsIncluded();
  console.log('notification-format tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
