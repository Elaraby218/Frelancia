// ==========================================
// bg/notifications.js — Chrome notification handling
// Depends on: filters.js (parseDurationDays)
// ==========================================

async function createStoredNotification(options, payload) {
  const notificationId = await new Promise((resolve, reject) => {
    chrome.notifications.create(options, (createdId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(createdId);
    });
  });

  await chrome.storage.local.set({ [`notification_${notificationId}`]: payload });
  return notificationId;
}

function formatNotificationBudget(budget) {
  if (typeof budget !== 'string') return '';

  const normalized = budget.replace(/\s+/g, ' ').trim();
  const unavailableValues = new Set([
    '',
    '-',
    '--',
    'غير محدد',
    'غير محددة',
    'غير معروف',
    'غير معروفة',
    'not specified',
    'unknown',
    'n/a'
  ]);

  return unavailableValues.has(normalized.toLocaleLowerCase())
    ? ''
    : `[ ${normalized} ]`;
}

function showNotification(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return Promise.reject(new Error('Cannot create a job notification without jobs.'));
  }

  let safeUrl;
  try {
    safeUrl = normalizeMostaqlUrl(jobs[0]?.url, { projectOnly: true });
  } catch {
    return Promise.reject(new Error('Cannot create a notification with an unsafe project URL.'));
  }

  const job = { ...jobs[0], url: safeUrl };
  const title = jobs.length === 1
    ? 'مشروع جديد على مستقل'
    : `${jobs.length} مشاريع جديدة على مستقل`;

  let message = '';
  if (jobs.length === 1) {
    const budget = formatNotificationBudget(job.budget);
    const desc = job.description ? `\n\n${job.description.substring(0, 150)}${job.description.length > 150 ? '...' : ''}` : '';
    message = `${job.title}${budget ? ` ${budget}` : ''}${desc}`;
  } else {
    message = `${job.title}\nو ${jobs.length - 1} مشاريع أخرى`;
  }

  return createStoredNotification({
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
  }, job);
}

function showTrackedNotification(project, changeMsg) {
  let safeProject;
  try {
    safeProject = {
      ...project,
      url: normalizeMostaqlUrl(project?.url, { projectOnly: true })
    };
  } catch {
    return Promise.reject(new Error('Cannot create a tracked notification with an unsafe project URL.'));
  }

  return createStoredNotification({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `تحديث في مشروع: ${safeProject.title}`,
    message: changeMsg,
    priority: 2,
    requireInteraction: true
  }, safeProject);
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
      try {
        chrome.tabs.create({ url: normalizeMostaqlUrl(job.url, { projectOnly: true }) });
      } catch (error) {
        console.warn('Blocked an unsafe stored notification URL.', error);
      }
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
        let safeProjectUrl;
        try {
          safeProjectUrl = normalizeMostaqlUrl(job.url, { projectOnly: true });
        } catch (error) {
          console.warn('Blocked an unsafe stored notification URL.', error);
          return;
        }

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
          const urlWithFlag = safeProjectUrl + (safeProjectUrl.includes('?') ? '&' : '?') + 'mostaql_autofill=true';
          chrome.tabs.create({ url: urlWithFlag });
        });
      });
    } else {
      try {
        chrome.tabs.create({ url: normalizeMostaqlUrl(job.url, { projectOnly: true }) });
      } catch (error) {
        console.warn('Blocked an unsafe stored notification URL.', error);
      }
    }

    chrome.storage.local.remove([`notification_${notificationId}`]);
  });
});

chrome.notifications.onClosed.addListener((notificationId) => {
  chrome.storage.local.remove([`notification_${notificationId}`]);
});
