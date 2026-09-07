const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'bg', 'offscreen.js');
const source = fs.readFileSync(sourcePath, 'utf8') + `
  ;globalThis.__offscreen = {
    setupOffscreenDocument,
    sendOffscreenMessage,
    parseJobsOffscreen
  };
`;

let createCalls = 0;
global.chrome = {
  runtime: {
    lastError: null,
    async getContexts() {
      await Promise.resolve();
      return [];
    },
    sendMessage(message, callback) {
      queueMicrotask(() => callback({
        success: true,
        jobs: message.action === 'parseJobs' ? [{ id: '1' }] : undefined
      }));
    }
  },
  offscreen: {
    async createDocument() {
      createCalls++;
      await Promise.resolve();
    }
  }
};

vm.runInThisContext(source, { filename: sourcePath });

(async () => {
  await Promise.all([
    global.__offscreen.setupOffscreenDocument(),
    global.__offscreen.setupOffscreenDocument(),
    global.__offscreen.setupOffscreenDocument()
  ]);
  assert.equal(createCalls, 1, 'concurrent setup must create only one document');

  // Once setup finishes, simulate Chrome reporting the existing document.
  chrome.runtime.getContexts = async () => [{}];
  const jobs = await global.__offscreen.parseJobsOffscreen('<html></html>');
  assert.deepEqual(jobs, [{ id: '1' }]);
  assert.equal(createCalls, 1);

  console.log('offscreen-bridge tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
