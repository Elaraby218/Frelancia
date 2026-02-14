// ==========================================
// Mostaql Job Notifier - Background Service Worker
// ==========================================

// URLs to monitor
const MOSTAQL_URLS = {
  development: 'https://mostaql.com/projects?category=development&sort=latest',
  ai: 'https://mostaql.com/projects?category=ai-machine-learning&sort=latest',
  all: 'https://mostaql.com/projects?sort=latest'
};

const DEFAULT_PROMPTS = [
  {
    id: 'default_proposal',
    title: 'كتابة عرض مشروع',
    content: `أريد مساعدتك في كتابة عرض لهذا المشروع على منصة مستقل.
    
عنوان المشروع: {title}
القسم: {category}

تفاصيل المشروع:
الميزانية: {budget}
مدة التنفيذ: {duration}
تاريخ النشر: {publish_date}
الوسوم: {tags}

معلومات صاحب العمل:
الاسم: {client_name} ({client_type})

وصف المشروع:
{description}
    
يرجى كتابة عرض احترافي ومقنع يوضح خبرتي في هذا المجال ويشرح كيف يمكنني تنفيذ المطلوب بدقة، مع مراعاة تفاصيل المشروع ومتطلبات العميل.`
  }
];

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');

  chrome.storage.local.get(['settings', 'seenJobs', 'stats', 'trackedProjects', 'prompts'], (data) => {
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

    if (!data.stats) {
      changes.stats = {
        lastCheck: null,
        todayCount: 0,
        todayDate: new Date().toDateString()
      };
    }

    if (!data.trackedProjects) changes.trackedProjects = {};

    // Only seed prompts if strictly missing or empty array (optional, maybe user deleted all?)
    // Let's safe-guard: if undefined, seed.
    if (!data.prompts) {
      changes.prompts = DEFAULT_PROMPTS;
    }

    if (Object.keys(changes).length > 0) {
      chrome.storage.local.set(changes);
    }
  });

  // Create alarm for checking jobs
  chrome.alarms.create('checkJobs', { periodInMinutes: 1 });
});

// Listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkJobs') {
    checkForNewJobs();
    checkTrackedProjects();
  }
});

// Check for new jobs
async function checkForNewJobs() {
  try {
    const data = await chrome.storage.local.get(['settings', 'seenJobs', 'stats']);
    const settings = data.settings || {};
    let seenJobs = data.seenJobs || [];
    let stats = data.stats || { lastCheck: null, todayCount: 0, todayDate: new Date().toDateString() };

    // Reset today count if new day
    if (stats.todayDate !== new Date().toDateString()) {
      stats.todayCount = 0;
      stats.todayDate = new Date().toDateString();
    }

    let allNewJobs = [];

    // Check each enabled category
    for (const [category, url] of Object.entries(MOSTAQL_URLS)) {
      if (settings[category]) {
        console.log(`Checking category: ${category}`);
        const jobs = await fetchJobs(url);
        console.log(`Found ${jobs.length} total jobs in ${category}`);

        const newJobs = jobs.filter(job => {
          // 1. Check if already seen
          if (seenJobs.includes(job.id)) return false;

          // 2. Apply Filters
          return applyFilters(job, settings);
        });
        console.log(`Found ${newJobs.length} NEW jobs in ${category}`);

        allNewJobs = allNewJobs.concat(newJobs);

        // Add new job IDs to seen list
        newJobs.forEach(job => {
          if (!seenJobs.includes(job.id)) {
            seenJobs.push(job.id);
          }
        });
      }
    }

    // Keep only last 500 job IDs to prevent storage overflow
    if (seenJobs.length > 500) {
      seenJobs = seenJobs.slice(-500);
    }

    // Update stats
    stats.lastCheck = new Date().toISOString();
    stats.todayCount += allNewJobs.length;

    // Save to storage
    await chrome.storage.local.set({ seenJobs, stats });

    // Show notification if new jobs found
    if (allNewJobs.length > 0) {
      // 3. Quiet Hours Check
      if (settings.quietHoursEnabled && isQuietHour(settings)) {
        console.log('Quiet Hours active, suppressing notifications/sounds');
        // We still store them as seen, but don't alert.
        // Option: Send to Telegram anyway? Usually Quiet implies SILENCE everywhere.
        return { success: true, newJobs: 0, suppressed: allNewJobs.length };
      }

      // Deeper filtering and details extraction for jobs that passed basic list filters
      const qualityJobs = [];
      for (const job of allNewJobs) {
        console.log(`Deep checking job ${job.id} for details...`);
        const projectDetails = await fetchProjectDetails(job.url);
        
        if (projectDetails) {
          // Enrich job object with details
          job.description = projectDetails.description;
          job.hiringRate = projectDetails.hiringRate;
          job.status = projectDetails.status;
          job.communications = projectDetails.communications;
          job.duration = projectDetails.duration;
          job.registrationDate = projectDetails.registrationDate;
          
          // If budget was missing from list page, update it from project page
          if (!job.budget && projectDetails.budget) {
            job.budget = projectDetails.budget;
          }

          // 2nd Pass: Re-check filters with full data (Description, Hiring Rate, Budget etc. now definitely available)
          if (!applyFilters(job, settings)) {
            console.log(`Filtering out job ${job.id} after deep check`);
            continue;
          }
        }

        qualityJobs.push(job);
      }

      if (qualityJobs.length > 0) {
        showNotification(qualityJobs);

        if (settings.sound) {
          playSound();
        }

        // Send to Telegram if configured
        if (settings.telegramToken && settings.telegramChatId) {
          sendTelegramNotification(qualityJobs, settings);
        }
      }
    }

    console.log(`✓ Check completed at ${new Date().toLocaleTimeString()}, found ${allNewJobs.length} new jobs`);

    return { success: true, newJobs: allNewJobs.length, totalChecked: seenJobs.length };

  } catch (error) {
    console.error('Error checking jobs:', error);
    return { success: false, error: error.message };
  }
}

// Filter logic
function applyFilters(job, settings) {
  // Budget Filter
  if (settings.minBudget > 0 && job.budget) {
    const budgetValue = parseBudgetValue(job.budget);
    if (budgetValue > 0 && budgetValue < settings.minBudget) {
      console.log(`Filtering out job ${job.id} due to low budget: ${job.budget} -> ${budgetValue} < ${settings.minBudget}`);
      return false;
    }
  }

  // Hiring Rate Filter
  if (settings.minHiringRate > 0 && job.hiringRate) {
    const hiringRateValue = parseHiringRate(job.hiringRate);
    if (hiringRateValue < settings.minHiringRate) {
      console.log(`Filtering out job ${job.id} due to low hiring rate: ${job.hiringRate} -> ${hiringRateValue}% < ${settings.minHiringRate}%`);
      return false;
    }
  }

  // Keyword Filter (Include)
  if (settings.keywordsInclude && settings.keywordsInclude.trim() !== '') {
    const includes = settings.keywordsInclude.toLowerCase().split(',').map(k => k.trim());
    const jobContent = (job.title + ' ' + (job.description || '')).toLowerCase();
    const matchesMatch = includes.some(k => jobContent.includes(k));
    if (!matchesMatch) {
      console.log(`Filtering out job ${job.id} because it doesn't match include keywords`);
      return false;
    }
  }

  // Keyword Filter (Exclude)
  if (settings.keywordsExclude && settings.keywordsExclude.trim() !== '') {
    const excludes = settings.keywordsExclude.toLowerCase().split(',').map(k => k.trim());
    const jobContent = (job.title + ' ' + (job.description || '')).toLowerCase();
    const matchesExclude = excludes.some(k => jobContent.includes(k));
    if (matchesExclude) {
      console.log(`Filtering out job ${job.id} because it matches exclude keywords`);
      return false;
    }
  }

  // Duration Filter
  if (settings.maxDuration > 0 && job.duration) {
    const days = parseDurationDays(job.duration);
    if (days > 0 && days > settings.maxDuration) {
      console.log(`Filtering out job ${job.id} due to long duration: ${job.duration} -> ${days} days > ${settings.maxDuration}`);
      return false;
    }
  }

  // Client Age Filter
  if (settings.minClientAge > 0 && job.registrationDate) {
    const ageDays = calculateClientAgeDays(job.registrationDate);
    if (ageDays >= 0 && ageDays < settings.minClientAge) {
      console.log(`Filtering out job ${job.id} due to young account: ${job.registrationDate} -> ${ageDays} days < ${settings.minClientAge}`);
      return false;
    }
  }

  return true;
}

function parseHiringRate(rateText) {
  if (!rateText) return 0;
  if (rateText.includes('بعد')) return 0; // "لم يحسب بعد"
  
  // Extract number, including potential decimals (e.g., 46.67%)
  const match = rateText.replace(/,/g, '').match(/\d+(\.\d+)?/);
  if (match) {
    return parseFloat(match[0]);
  }
  return 0;
}

function parseDurationDays(durationText) {
  // Typical formats: "5 أيام", "يوم واحد", "10 أيام"
  const match = durationText.match(/\d+/);
  if (match) return parseInt(match[0]);
  if (durationText.includes("يوم واحد")) return 1;
  return 0;
}

function calculateClientAgeDays(dateText) {
  // Format: "14 فبراير 2026"
  const arabicMonths = {
    'يناير': 0, 'فبراير': 1, 'مارس': 2, 'أبريل': 3, 'مايو': 4, 'يونيو': 5,
    'يوليو': 6, 'أغسطس': 7, 'سبتمبر': 8, 'أكتوبر': 9, 'نوفمبر': 10, 'ديسمبر': 11
  };
  
  const parts = dateText.split(' ');
  if (parts.length < 3) return -1;
  
  const day = parseInt(parts[0]);
  const monthName = parts[1];
  const year = parseInt(parts[2]);
  const month = arabicMonths[monthName];
  
  if (isNaN(day) || month === undefined || isNaN(year)) return -1;
  
  const regDate = new Date(year, month, day);
  const now = new Date();
  const diffTime = Math.abs(now - regDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  
  return diffDays;
}

function parseBudgetValue(budgetText) {
  if (!budgetText) return 0;
  // Mostaql budgets are usually like "$500.00 - $1000.00", "$25.00 - $50.00", or "$1,000 - $2,500"
  // We extract all numbers (including decimals) and take the HIGHEST to see if it meets the user's minimum
  const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!matches) return 0;
  
  // Return the maximum value found in the range
  const values = matches.map(m => parseFloat(m));
  return Math.max(...values);
}

function isQuietHour(settings) {
  if (!settings.quietHoursStart || !settings.quietHoursEnd) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = settings.quietHoursStart.split(':').map(Number);
  const [endH, endM] = settings.quietHoursEnd.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes < endMinutes) {
    // Range within same day (e.g. 09:00 - 17:00)
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Range wraps around midnight (e.g. 23:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

// Fetch jobs from Mostaql
async function fetchJobs(url) {
  try {
    // Add cache buster
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    console.log(`Fetching: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error(`HTTP Error: ${response.status}`);
      return [];
    }

    const html = await response.text();
    console.log(`Received HTML length: ${html.length}`);

    // Check for Cloudflare
    if (html.includes('Cloudflare') || html.includes('challenge-platform')) {
      console.error('Cloudflare challenge detected. Please open Mostaql.com in a tab first.');
      return [];
    }

    // Use Offscreen Document for DOM Parsing (SAFE & ROBUST)
    const jobs = await parseJobsOffscreen(html);

    console.log(`Parsed ${jobs.length} jobs via Offscreen`);
    return jobs;

  } catch (error) {
    console.error('Error fetching jobs:', error);
    return [];
  }
}

// Fetch project details for deep filtering
async function fetchProjectDetails(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
    // Re-use offscreen parser for project details
    await setupOffscreenDocument();
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'parseProjectDetails', html: html }, (response) => {
        if (response && response.success) {
          resolve(response.data);
        } else {
          resolve(null);
        }
      });
      setTimeout(() => resolve(null), 3000);
    });
  } catch (error) {
    console.error('Error fetching project details:', error);
    return null;
  }
}

// Track specific projects for changes
async function checkTrackedProjects() {
  const data = await chrome.storage.local.get(['trackedProjects', 'settings']);
  const trackedProjects = data.trackedProjects || {};
  const settings = data.settings || {};

  const projectIds = Object.keys(trackedProjects);
  if (projectIds.length === 0) return;

  console.log(`Checking ${projectIds.length} tracked projects...`);

  for (const id of projectIds) {
    const project = trackedProjects[id];
    try {
      const response = await fetch(project.url, { cache: 'no-store' });
      if (!response.ok) continue;

      const html = await response.text();
      const currentData = await parseTrackedDataOffscreen(html);

      if (currentData) {
        let changed = false;
        let changeMsg = '';

        if (currentData.status !== project.status) {
          changed = true;
          changeMsg += `الحالة: ${project.status} -> ${currentData.status}\n`;
        }

        if (currentData.communications !== project.communications) {
          changed = true;
          changeMsg += `التواصلات: ${project.communications} -> ${currentData.communications}`;
        }

        if (changed) {
          console.log(`Update for project ${id}: ${changeMsg}`);
          showTrackedNotification(project, changeMsg);
          if (settings.sound) {
            playTrackedSound();
          }

          // Update stored data
          trackedProjects[id].status = currentData.status;
          trackedProjects[id].communications = currentData.communications;
          trackedProjects[id].lastChecked = new Date().toISOString();
          await chrome.storage.local.set({ trackedProjects });
        }
      }
    } catch (error) {
      console.error(`Error checking tracked project ${id}:`, error);
    }
  }
}

async function parseTrackedDataOffscreen(html) {
  try {
    await setupOffscreenDocument();
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'parseTrackedData', html: html }, (response) => {
        if (response && response.success) {
          resolve(response.data);
        } else {
          resolve(null);
        }
      });
      setTimeout(() => resolve(null), 3000);
    });
  } catch (e) {
    return null;
  }
}

// Send HTML to offscreen document for parsing
async function parseJobsOffscreen(html) {
  try {
    await setupOffscreenDocument();

    // Wait a bit for listener
    await new Promise(r => setTimeout(r, 100));

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'parseJobs', html: html }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Parse Error:', chrome.runtime.lastError);
          resolve([]);
        } else if (response && response.success) {
          resolve(response.jobs);
        } else {
          resolve([]);
        }
      });

      // Timeout safety
      setTimeout(() => resolve([]), 3000);
    });
  } catch (e) {
    console.error('Offscreen Parse Error:', e);
    return [];
  }
}

// Helper: Setup Offscreen (Generic)
async function setupOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK', 'DOM_PARSER'],
      justification: 'Parsing HTML and Playing Audio'
    });
  }
}

// Clean title text
function cleanTitle(text) {
  if (!text) return 'مشروع جديد';

  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ') // Multiple spaces to single
    .trim();
}

// Show notification
function showNotification(jobs) {
  const job = jobs[0];
  const title = jobs.length === 1
    ? 'مشروع جديد على مستقل'
    : `${jobs.length} مشاريع جديدة على مستقل`;

  let message = '';
  if (jobs.length === 1) {
    // Single job: Rich message with description
    const budget = job.budget ? `[ ${job.budget} ]` : '';
    const desc = job.description ? `\n\n${job.description.substring(0, 150)}${job.description.length > 150 ? '...' : ''}` : '';
    message = `${job.title} ${budget}${desc}`;
  } else {
    // Multiple jobs
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
    // Store job data for both click and button handlers
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

// Handle notification body click (default opens project)
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.storage.local.get([`notification_${notificationId}`], (data) => {
    const job = data[`notification_${notificationId}`];
    if (job) {
      chrome.tabs.create({ url: job.url });
      chrome.storage.local.remove([`notification_${notificationId}`]);
    }
  });
});

// Handle notification buttons click
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  chrome.storage.local.get([`notification_${notificationId}`], (data) => {
    const job = data[`notification_${notificationId}`];
    if (!job) return;

    if (buttonIndex === 0) { // "قدّم الآن" (Apply Now)
      console.log(`Apply Now clicked for job ${job.id}`);
      
      // Get all necessary data from storage
      chrome.storage.local.get(['proposalTemplate'], (settingsData) => {
        // Prepare autofill data
        const minBudget = parseMinBudgetValue(job.budget);
        const durationDays = parseDurationDays(job.duration || "");
        
        const autofillData = {
          projectId: job.id,
          amount: minBudget,
          duration: durationDays,
          proposal: settingsData.proposalTemplate || '',
          timestamp: Date.now()
        };

        // Save to storage and open with flag
        chrome.storage.local.set({ 'mostaql_pending_autofill': autofillData }, () => {
          const urlWithFlag = job.url + (job.url.includes('?') ? '&' : '?') + 'mostaql_autofill=true';
          chrome.tabs.create({ url: urlWithFlag });
        });
      });
    } else { // "فتح المشروع" (Open Project)
      chrome.tabs.create({ url: job.url });
    }
    
    chrome.storage.local.remove([`notification_${notificationId}`]);
  });
});

function parseMinBudgetValue(budgetText) {
  if (!budgetText) return 0;
  // Extract all numbers (including decimals)
  const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!matches) return 0;
  
  // Return the MINIMUM value for autofill (user requested lowest offer)
  const values = matches.map(m => parseFloat(m));
  return Math.min(...values);
}

// Play notification sound
async function playSound() {
  try {
    // Check if offscreen document exists
    let existingContexts = [];
    try {
      existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });
    } catch (e) {
      console.log('getContexts not supported, trying to create document');
    }

    if (existingContexts.length === 0) {
      try {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Play notification sound'
        });
      } catch (e) {
        if (!e.message.includes('already exists')) {
          console.error('Error creating offscreen document:', e);
          return;
        }
      }
    }

    // Send message to play sound
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'playSound' });
    }, 100);

  } catch (error) {
    console.error('Error playing sound:', error);
  }
}

async function playTrackedSound() {
  try {
    await setupOffscreenDocument();
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'playTrackedSound' });
    }, 100);
  } catch (error) {
    console.error('Error playing tracked sound:', error);
  }
}

// Send Telegram Message
async function sendTelegramNotification(jobs, settings) {
  const token = settings.telegramToken;
  const chatId = settings.telegramChatId;
  if (!token || !chatId) return;

  const job = jobs[0];
  let message = "";

  if (jobs.length === 1) {
    message = `<b>🔔 مشروع جديد على مستقل</b>\n\n`;
    message += `<b>📌 العنوان:</b> ${job.title}\n`;
    if (job.budget) message += `<b>💰 الميزانية:</b> ${job.budget}\n`;
    if (job.duration) message += `<b>⏱️ المدة:</b> ${job.duration}\n`;
    if (job.hiringRate) message += `<b>✅ معدل التوظيف:</b> ${job.hiringRate}\n`;
    
    if (job.description) {
      const shortDesc = job.description.substring(0, 300) + (job.description.length > 300 ? "..." : "");
      message += `\n<b>📝 الوصف:</b>\n<i>${shortDesc}</i>\n`;
    }
    
    message += `\n🔗 <a href="${job.url}">رابط المشروع</a>`;
  } else {
    message = `<b>🔔 ${jobs.length} مشاريع جديدة على مستقل</b>\n\n`;
    jobs.forEach((j, index) => {
      message += `${index + 1}. <a href="${j.url}">${j.title}</a> [${j.budget || "غير محدد"}]\n`;
    });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
    const result = await response.json();
    if (!result.ok) console.error("Telegram API Error:", result);
    else console.log(`Telegram rich message sent for job ${job.id}`);
  } catch (error) {
    console.error("Error sending Telegram message:", error);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Check now
  if (message.action === 'checkNow') {
    checkForNewJobs()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error('CheckNow Handler Error:', error);
        sendResponse({ success: false, error: 'Internal Error: ' + error.message });
      });
    return true; // Indicates async response
  }

  // Test notification
  if (message.action === 'testNotification') {
    const testJobs = [{
      id: 'test-' + Date.now(),
      title: 'هذا إشعار تجريبي - مشروع تطوير موقع إلكتروني',
      budget: '500 $',
      url: 'https://mostaql.com/projects'
    }];
    showNotification(testJobs);
    sendResponse({ success: true });
    return true;
  }

  // Test sound
  if (message.action === 'testSound') {
    playSound();
    sendResponse({ success: true });
    return true;
  }


  // Update alarm interval
  if (message.action === 'updateAlarm') {
    chrome.alarms.clear('checkJobs');
    chrome.alarms.create('checkJobs', { periodInMinutes: message.interval });
    sendResponse({ success: true });
    return true;
  }

  // Clear history
  if (message.action === 'clearHistory') {
    chrome.storage.local.set({
      seenJobs: [],
      stats: {
        lastCheck: null,
        todayCount: 0,
        todayDate: new Date().toDateString()
      }
    }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Debug: Get HTML
  if (message.action === 'debugFetch') {
    fetch(MOSTAQL_URLS.all)
      .then(r => r.text())
      .then(html => {
        console.log('HTML Preview (first 2000 chars):');
        console.log(html.substring(0, 2000));
        sendResponse({ success: true, length: html.length });
      })
      .catch(e => {
        sendResponse({ success: false, error: e.message });
      });
    return true;
  }

  // Get Default Prompts (for reset/fallback)
  if (message.action === 'getDefaultPrompts') {
    sendResponse({ success: true, prompts: DEFAULT_PROMPTS });
    return false; // Sync response
  }
});

