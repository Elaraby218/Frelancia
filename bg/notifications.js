// ==========================================
// bg/notifications.js — Chrome notification handling
// Depends on: filters.js (parseDurationDays)
// ==========================================

function showNotification(jobs) {
  const job = jobs[0];
  const title = jobs.length === 1
    ? 'مشروع جديد على مستقل'
    : `${jobs.length} مشاريع جديدة على مستقل`;

  let message = '';
  if (jobs.length === 1) {
    const budget = job.budget ? `[ ${job.budget} ]` : '';
    const desc = job.description ? `\n\n${job.description.substring(0, 150)}${job.description.length > 150 ? '...' : ''}` : '';
    message = `${job.title} ${budget}${desc}`;
  } else {
    message = `${job.title}\nو ${jobs.length - 1} مشاريع أخرى`;
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 2,
    requireInteraction: true,
    buttons: [
      { title: 'قدّم الآن' },
      { title: 'فتح المشروع' }
    ]
  }, (notificationId) => {
    chrome.storage.local.set({ [`notification_${notificationId}`]: job });
  });
}

function showTrackedNotification(project, changeMsg) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `تحديث في مشروع: ${project.title}`,
    message: changeMsg,
    priority: 2,
    requireInteraction: true
  }, (notificationId) => {
    chrome.storage.local.set({ [`notification_${notificationId}`]: project.url });
  });
}

function parseMinBudgetValue(budgetText) {
  if (!budgetText) return 0;
  const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!matches) return 0;
  return Math.min(...matches.map(m => parseFloat(m)));
}

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.storage.local.get([`notification_${notificationId}`], (data) => {
    const job = data[`notification_${notificationId}`];
    if (job) {
      chrome.tabs.create({ url: job.url });
      chrome.storage.local.remove([`notification_${notificationId}`]);
    }
  });
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  chrome.storage.local.get([`notification_${notificationId}`], (data) => {
    const job = data[`notification_${notificationId}`];
    if (!job) return;

    if (buttonIndex === 0) {
      console.log(`Apply Now clicked for job ${job.id}`);
      chrome.storage.local.get(['proposalTemplate'], (settingsData) => {
        const minBudget = parseMinBudgetValue(job.budget);
        const durationDays = parseDurationDays(job.duration || "");

        const autofillData = {
          projectId: job.id,
          amount: minBudget,
          duration: durationDays,
          proposal: settingsData.proposalTemplate || '',
          timestamp: Date.now()
        };

        chrome.storage.local.set({ 'mostaql_pending_autofill': autofillData }, () => {
          const urlWithFlag = job.url + (job.url.includes('?') ? '&' : '?') + 'mostaql_autofill=true';
          chrome.tabs.create({ url: urlWithFlag });
        });
      });
    } else {
      chrome.tabs.create({ url: job.url });
    }

    chrome.storage.local.remove([`notification_${notificationId}`]);
  });
});
