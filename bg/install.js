// ==========================================
// bg/install.js — Extension install handler
// Depends on: constants.js (DEFAULT_PROMPTS)
// ==========================================

function normalizeCheckInterval(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0.5 ? parsed : 1;
}

async function ensureCheckJobsAlarm() {
  const data = await chrome.storage.local.get(['settings']);
  const interval = normalizeCheckInterval(data.settings?.interval);
  const existing = await chrome.alarms.get('checkJobs');

  if (!existing || existing.periodInMinutes !== interval) {
    await chrome.alarms.create('checkJobs', {
      delayInMinutes: 0.5,
      periodInMinutes: interval
    });
    console.log(`Alarm 'checkJobs' ensured at ${interval} minute(s).`);
  }
}

async function initializeExtensionStorage() {
  console.log('Extension installed');

  const data = await chrome.storage.local.get([
    'settings',
    'seenJobs',
    'stats',
    'trackedProjects',
    'prompts',
    'recentJobs',
    'proposalTemplate'
  ]);
  const changes = {};

  if (!data.settings) {
    changes.settings = {
      development: true,
      ai: true,
      all: true,
      sound: true,
      interval: 1,
      systemEnabled: true,
      notificationMode: 'auto'
    };
  }

  if (!data.seenJobs) changes.seenJobs = [];
  if (!data.recentJobs) changes.recentJobs = [];

  if (!data.stats) {
    changes.stats = {
      lastCheck: null,
      lastAttempt: null,
      lastError: null,
      todayCount: 0,
      todayDate: new Date().toDateString()
    };
  }

  if (!data.trackedProjects) changes.trackedProjects = {};
  if (!data.prompts) changes.prompts = DEFAULT_PROMPTS;

  if (!data.proposalTemplate) {
    changes.proposalTemplate = `اطلعت على مشروعك وفهمت متطلباته جيدا، واذا انني قادر على تقديم العمل بطريقة منظمة وواضحة. احرص على الدقة لضمان ان تكون النتيجة مرضية تماما لك.

متحمس لبدء التعاون معك، واذاك بتنفيذ العمل بشكل سلس ومرتب. في انتظار تواصلك لترتيب التفاصيل والانطلاق مباشرة.`;
  }

  if (Object.keys(changes).length > 0) {
    await chrome.storage.local.set(changes);
  }

  await ensureCheckJobsAlarm();

  // Clear legacy ChatGPT prompt keys from older builds
  if (typeof clearLegacyChatGptPromptStorage === 'function') {
    clearLegacyChatGptPromptStorage();
  } else {
    chrome.storage.local.remove(['pendingChatGptPrompt', 'pendingChatGptPromptMeta']);
  }
  if (typeof clearSessionDelivery === 'function') {
    clearSessionDelivery();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initializeExtensionStorage().catch((error) => {
    console.error('Extension initialization failed:', error);
  });
});

// Alarms can disappear between browser sessions, so restore the heartbeat on
// every profile startup instead of relying only on the installation event.
chrome.runtime.onStartup.addListener(() => {
  ensureCheckJobsAlarm().catch((error) => {
    console.error('Failed to restore the jobs alarm:', error);
  });
});
