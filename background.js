// ==========================================
// Mostaql Job Notifier - Background Service Worker
// ==========================================

// URLs to monitor
const MOSTAQL_URLS = {
  development: 'https://mostaql.com/projects?category=development&sort=latest',
  ai: 'https://mostaql.com/projects?category=ai-machine-learning&sort=latest',
  all: 'https://mostaql.com/projects?sort=latest'
};

// Initialize extension on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  
  // Set default settings
  chrome.storage.local.set({
    settings: {
      development: true,
      ai: true,
      all: false,
      sound: true,
      interval: 1
    },
    seenJobs: [],
    stats: {
      lastCheck: null,
      todayCount: 0,
      todayDate: new Date().toDateString()
    },
    trackedProjects: {}
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
        
        const newJobs = jobs.filter(job => !seenJobs.includes(job.id));
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
      showNotification(allNewJobs);
      
      if (settings.sound) {
        playSound();
      }
    }
    
    console.log(`✓ Check completed at ${new Date().toLocaleTimeString()}, found ${allNewJobs.length} new jobs`);
    
    return { success: true, newJobs: allNewJobs.length, totalChecked: seenJobs.length };
    
  } catch (error) {
    console.error('Error checking jobs:', error);
    return { success: false, error: error.message };
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
                    changeMsg += `الحالة: ${project.status} ➔ ${currentData.status}\n`;
                }

                if (currentData.communications !== project.communications) {
                    changed = true;
                    changeMsg += `التواصلات: ${project.communications} ➔ ${currentData.communications}`;
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
    ? '🎉 مشروع جديد على مستقل!' 
    : `🎉 ${jobs.length} مشاريع جديدة على مستقل!`;
  
  const message = jobs.length === 1
    ? `${job.title}${job.budget ? '\n' + job.budget : ''}`
    : `${job.title}\nو ${jobs.length - 1} مشاريع أخرى`;
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 2,
    requireInteraction: true
  }, (notificationId) => {
    // Store job URL for click handler
    chrome.storage.local.set({ [`notification_${notificationId}`]: job.url });
  });
}

function showTrackedNotification(project, changeMsg) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: `👀 تحديث في مشروع: ${project.title}`,
        message: changeMsg,
        priority: 2,
        requireInteraction: true
    }, (notificationId) => {
        chrome.storage.local.set({ [`notification_${notificationId}`]: project.url });
    });
}

// Handle notification click
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.storage.local.get([`notification_${notificationId}`], (data) => {
    const url = data[`notification_${notificationId}`];
    if (url) {
      chrome.tabs.create({ url: url });
      chrome.storage.local.remove([`notification_${notificationId}`]);
    }
  });
});

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
});

