// Load libraries
let SIGNALR_AVAILABLE = false;
try {
  importScripts('utils.js', 'signalr.min.js', 'signalr-client.js');
  SIGNALR_AVAILABLE = true;
  console.log('✅ Libraries loaded successfully');
} catch (e) {
  console.warn('⚠️ Some libraries failed to load:', e);
}

/* global FrelanciaUtils, signalR, signalRClient */

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

    // Only seed prompts if strictly missing or empty array (optional, maybe user deleted all?)
    // Let's safe-guard: if undefined, seed.
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

  // Create alarm for checking jobs (still used for tracked projects and fallback)
  chrome.alarms.create('checkJobs', { periodInMinutes: 1 });

  // Note: SignalR will be initialized by initOnStartup() below
});

// Listen for alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkJobs') {
    const data = await chrome.storage.local.get(['settings']);
    const notificationMode = (data.settings || {}).notificationMode || 'auto';

    // Always check tracked projects regardless of mode
    checkTrackedProjects();

    if (notificationMode === 'polling') {
      // User chose polling only — skip SignalR entirely
      console.log('📡 Notification mode: polling — checking for new jobs');
      checkForNewJobs();

    } else if (notificationMode === 'signalr') {
      // User chose SignalR only — reconnect if needed, never poll
      await initializeSignalR();

    } else {
      // Auto mode: try SignalR, fall back to polling if disconnected
      await initializeSignalR();

      const isSignalRActive = SIGNALR_AVAILABLE
        && typeof signalRClient !== 'undefined'
        && signalRClient.isConnected;

      if (!isSignalRActive) {
        console.log('⚠️ SignalR not connected, using polling fallback for new jobs');
        checkForNewJobs();
      }
    }
  }

  // Handle SignalR reconnection alarm (created by signalr-client.js)
  if (alarm.name === 'signalRReconnect') {
    console.log('SignalR: Reconnect alarm fired, attempting to reconnect...');
    if (SIGNALR_AVAILABLE && typeof signalRClient !== 'undefined') {
      signalRClient.connect();
    }
  }
});

// Initialize SignalR on service worker startup (respects user mode)
(async function initOnStartup() {
  console.log('Service worker started');
  const data = await chrome.storage.local.get(['settings']);
  const mode = (data.settings || {}).notificationMode || 'auto';

  if (mode === 'polling') {
    console.log('📡 Notification mode: polling — skipping SignalR init');
    return;
  }
  await initializeSignalR();
})();

// Initialize SignalR connection
async function initializeSignalR() {
  try {
    if (!SIGNALR_AVAILABLE) {
      console.log('⚠️ SignalR not available. Using polling mode.');
      return;
    }

    if (typeof signalRClient === 'undefined') {
      console.warn('SignalR client not available. Make sure signalr-client.js is loaded.');
      return;
    }

    // Skip if already connected
    if (signalRClient.isConnected) {
      return;
    }

    console.log('Initializing SignalR connection...');

    // Register fallback callback: when max reconnect attempts fail
    signalRClient.onFallbackActivated(() => {
      console.warn('🔄 SignalR fallback activated — polling will handle new jobs.');
    });

    // Register reconnection callback: when SignalR comes back online
    signalRClient.onReconnected(() => {
      console.log('✅ SignalR reconnected — polling fallback deactivated.');
    });

    await signalRClient.connect();
    console.log('SignalR connection established');
  } catch (error) {
    console.error('Error initializing SignalR:', error);
  }
}

// Check for new jobs
async function checkForNewJobs() {
  try {
    const data = await chrome.storage.local.get(['settings', 'seenJobs', 'stats', 'recentJobs']);
    const settings = data.settings || {};
    let seenJobs = data.seenJobs || [];
    let recentJobs = data.recentJobs || [];
    let stats = data.stats || {};
    // Ensure stats has default values (migration safety)
    if (typeof stats.todayCount !== 'number') stats.todayCount = 0;
    if (!stats.todayDate) stats.todayDate = new Date().toDateString();
    if (!stats.lastCheck) stats.lastCheck = null;

    // Reset today count if new day
    if (stats.todayDate !== new Date().toDateString()) {
      stats.todayCount = 0;
      stats.todayDate = new Date().toDateString();
    }

    let allNewJobs = [];

    // Check each enabled category
    for (const [category, url] of Object.entries(MOSTAQL_URLS)) {
      // Default to true if setting is missing (undefined/null)
      if (settings[category] !== false) {
        console.log(`Checking category: ${category}`);
        const jobs = await fetchJobs(url);
        console.log(`Found ${jobs.length} total jobs in ${category}`);

        // Update Recent Jobs (Visible in dashboard, regardless if seen or not)
        jobs.forEach(job => {
          if (applyFilters(job, settings)) {
            const existingIdx = recentJobs.findIndex(rj => rj.id === job.id);
            if (existingIdx !== -1) {
              // Update existing entry with potentially newer metadata (budget/time from list)
              recentJobs[existingIdx] = { ...recentJobs[existingIdx], ...job };
            } else {
              // Add as new recent job at the top
              recentJobs.unshift(job);
            }
          }
        });

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

    // --- PHASE 1: Immediate Commit ---
    // Update basic stats and store shallow results so the dashboard updates immediately.
    stats.lastCheck = new Date().toISOString();
    stats.todayCount += allNewJobs.length;

    // Keep only last 500 job IDs to prevent storage overflow
    if (seenJobs.length > 500) {
      seenJobs = seenJobs.slice(-500);
    }

    // Keep only last 50 recent jobs for dashboard, ensuring they are sorted by recency
    recentJobs.sort((a, b) => {
      const idA = parseInt(a.id) || 0;
      const idB = parseInt(b.id) || 0;
      return idB - idA;
    });
    recentJobs = recentJobs.slice(0, 50);

    // Save Basic state immediately so dashboard shows projects right away
    await chrome.storage.local.set({ seenJobs, stats, recentJobs });
    console.log(`Phase 1 Commit: Saved ${allNewJobs.length} new jobs to dashboard.`);

    // --- PHASE 2: Deep Filtering & Notifications ---

    // 2.1 Enrichment: Ensure top 10 projects have full details
    // This helps if they were seen previously but details were never fetched
    const top10 = recentJobs.slice(0, 10);
    for (const job of top10) {
      if (!job.description || !job.hiringRate || job.hiringRate === 'غير محدد') {
        console.log(`Enriching top project ${job.id} for dashboard...`);
        try {
          const projectDetails = await fetchProjectDetails(job.url);
          if (projectDetails) {
            job.description = projectDetails.description;
            job.hiringRate = projectDetails.hiringRate;
            job.status = projectDetails.status;
            job.communications = projectDetails.communications;
            job.duration = projectDetails.duration;
            job.registrationDate = projectDetails.registrationDate;
            if ((!job.budget || job.budget === 'غير محدد') && projectDetails.budget) job.budget = projectDetails.budget;

            // Commit change to storage
            const rjIdx = recentJobs.findIndex(rj => rj.id === job.id);
            if (rjIdx !== -1) {
              recentJobs[rjIdx] = { ...recentJobs[rjIdx], ...job };
              chrome.storage.local.set({ recentJobs });
            }
          }
        } catch (e) {
          console.error(`Error enriching job ${job.id}:`, e);
        }
      }
    }

    // If no new jobs for notification, we are done
    if (allNewJobs.length === 0) {
      console.log(`✓ Check completed at ${new Date().toLocaleTimeString()}, found 0 new jobs`);
      return { success: true, newJobs: 0, totalChecked: seenJobs.length };
    }

    // 3. Quiet Hours Check
    if (settings.quietHoursEnabled && isQuietHour(settings)) {
      console.log('Quiet Hours active, suppressing notifications/sounds');
      return { success: true, newJobs: 0, suppressed: allNewJobs.length };
    }

    // Deeper filtering and details extraction for jobs that passed basic list filters
    const qualityJobs = [];
    for (const job of allNewJobs) {
      console.log(`Deep checking job ${job.id} for details...`);
      try {
        const projectDetails = await fetchProjectDetails(job.url);

        if (projectDetails) {
          // Enrich job object with details
          job.description = projectDetails.description;
          job.hiringRate = projectDetails.hiringRate;
          job.status = projectDetails.status;
          job.communications = projectDetails.communications;
          job.duration = projectDetails.duration;
          job.registrationDate = projectDetails.registrationDate;

          if ((!job.budget || job.budget === 'غير محدد') && projectDetails.budget) {
            job.budget = projectDetails.budget;
          }

          // 2nd Pass: Re-check filters
          if (!applyFilters(job, settings)) {
            console.log(`Filtering out job ${job.id} after deep check`);
            continue;
          }
        }
      } catch (e) {
        console.error(`Error deep checking job ${job.id}:`, e);
      }

      qualityJobs.push(job);

      // Incremental Update: Add enriched details back to recentJobs as we get them
      const rjIdx = recentJobs.findIndex(rj => rj.id === job.id);
      if (rjIdx !== -1) {
        recentJobs[rjIdx] = { ...recentJobs[rjIdx], ...job };
        chrome.storage.local.set({ recentJobs });
      }
    }

    if (qualityJobs.length > 0) {
      showNotification(qualityJobs);

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

// --- Filter Logic ---
function applyFilters(job, settings) {
  // Budget Filter
  if (settings.minBudget > 0 && job.budget) {
    const budgetValue = FrelanciaUtils.parseBudgetValue(job.budget);
    if (budgetValue > 0 && budgetValue < settings.minBudget) return false;
  }

  // Hiring Rate Filter
  if (settings.minHiringRate > 0 && job.hiringRate) {
    const hiringRateValue = FrelanciaUtils.parseHiringRate(job.hiringRate);
    if (hiringRateValue < settings.minHiringRate) return false;
  }

  // Keyword Filters
  const jobContent = (job.title + ' ' + (job.description || '')).toLowerCase();

  if (settings.keywordsInclude?.trim()) {
    const includes = settings.keywordsInclude.toLowerCase().split(',').map(k => k.trim());
    if (!includes.some(k => jobContent.includes(k))) return false;
  }

  if (settings.keywordsExclude?.trim()) {
    const excludes = settings.keywordsExclude.toLowerCase().split(',').map(k => k.trim());
    if (excludes.some(k => jobContent.includes(k))) return false;
  }

  // Duration Filter
  if (settings.maxDuration > 0 && job.duration) {
    const days = FrelanciaUtils.parseDurationDays(job.duration);
    if (days > 0 && days > settings.maxDuration) return false;
  }

  // Client Age Filter
  if (settings.minClientAge > 0 && job.registrationDate) {
    const ageDays = FrelanciaUtils.calculateClientAgeDays(job.registrationDate);
    if (ageDays >= 0 && ageDays < settings.minClientAge) return false;
  }

  return true;
}

// --- Alarms & Background Logic ---
// (Already contains alarm listeners and check functions)


