// ==========================================
// bg/install.js — Extension install handler
// Depends on: constants.js (DEFAULT_PROMPTS)
// ==========================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');

  chrome.storage.local.get(['settings', 'seenJobs', 'stats', 'trackedProjects', 'prompts', 'recentJobs', 'proposalTemplate'], (data) => {
    const changes = {};

    if (!data.settings) {
      changes.settings = {
        development: true,
        ai: true,
        all: true,
        sound: true,
        interval: 1
      };
    }

    if (!data.seenJobs) changes.seenJobs = [];
    if (!data.recentJobs) changes.recentJobs = [];

    if (!data.stats) {
      changes.stats = {
        lastCheck: null,
        todayCount: 0,
        todayDate: new Date().toDateString()
      };
    }

    if (!data.trackedProjects) changes.trackedProjects = {};

    if (!data.prompts) {
      changes.prompts = DEFAULT_PROMPTS;
    }

    if (!data.proposalTemplate) {
      changes.proposalTemplate = `اطلعت على مشروعك وفهمت متطلباته جيدا، واذا انني قادر على تقديم العمل بطريقة منظمة وواضحة. احرص على الدقة لضمان ان تكون النتيجة مرضية تماما لك.

متحمس لبدء التعاون معك، واذاك بتنفيذ العمل بشكل سلس ومرتب. في انتظار تواصلك لترتيب التفاصيل والانطلاق مباشرة.`;
    }

    if (Object.keys(changes).length > 0) {
      chrome.storage.local.set(changes);
    }
  });

  chrome.alarms.create('checkJobs', { periodInMinutes: 1 });
});
