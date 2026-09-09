// ==========================================
// bg/job-checker.js — Main job polling loop
// Depends on: constants.js, filters.js, fetcher.js, notifications.js, audio.js
// ==========================================

let activeJobCheck = null;

function checkForNewJobs() {
  if (activeJobCheck) {
    console.log('A Mostaql check is already running; reusing it.');
    return activeJobCheck;
  }

  activeJobCheck = runJobCheck().finally(() => {
    activeJobCheck = null;
  });
  return activeJobCheck;
}

function filtersNeedProjectDetails(settings) {
  return Boolean(
    settings.minHiringRate > 0
    || settings.maxDuration > 0
    || settings.minClientAge > 0
    || settings.keywordsInclude?.trim()
    || settings.keywordsExclude?.trim()
  );
}

async function enrichJob(job, useAuthenticatedSession = false) {
  try {
    const details = await fetchProjectDetails(job.url, useAuthenticatedSession);
    return details ? { ...job, ...details, id: String(job.id) } : job;
  } catch (error) {
    console.warn(`Could not enrich project ${job.id}; using listing data.`, error);
    return job;
  }
}

function getEnabledMostaqlSources(settings) {
  // The unfiltered latest-projects page already contains the category results.
  // Prefer one request when it is enabled to avoid duplicate, bursty polling.
  if (settings.all !== false && MOSTAQL_URLS.all) {
    return [['all', MOSTAQL_URLS.all]];
  }

  return Object.entries(MOSTAQL_URLS)
    .filter(([category]) => category !== 'all' && settings[category] !== false);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function runJobCheck() {
  try {
    const data = await chrome.storage.local.get([
      'settings',
      'seenJobs',
      'stats',
      'recentJobs',
      'notificationsEnabled',
      'mostaqlBackoffUntil'
    ]);
    const settings = data.settings || {};

    if (settings.systemEnabled === false) {
      return { success: true, skipped: true, reason: 'system-paused' };
    }

    const backoffUntil = Number(data.mostaqlBackoffUntil) || 0;
    if (backoffUntil > Date.now()) {
      console.warn(`Mostaql polling is paused until ${new Date(backoffUntil).toISOString()}.`);
      return {
        success: false,
        skipped: true,
        reason: 'mostaql-backoff',
        retryAt: new Date(backoffUntil).toISOString()
      };
    }

    const seenJobIds = new Set((data.seenJobs || []).map(String));
    let recentJobs = data.recentJobs || [];
    const stats = data.stats || {};
    const today = new Date().toDateString();

    if (typeof stats.todayCount !== 'number') stats.todayCount = 0;
    if (stats.todayDate !== today) {
      stats.todayCount = 0;
      stats.todayDate = today;
    }

    const enabledSources = getEnabledMostaqlSources(settings);
    const discoveredJobs = new Map();
    const sourceErrors = [];
    const requestedBackoffs = [];
    let successfulSources = 0;

    for (const [category, url] of enabledSources) {
      try {
        console.log(`Checking category: ${category}`);
        const jobs = await fetchJobs(url, settings.authenticatedPolling === true);
        successfulSources++;
        console.log(`Found ${jobs.length} total jobs in ${category}`);

        for (const job of jobs) {
          if (job.id === undefined || job.id === null) continue;
          const normalizedJob = { ...job, id: String(job.id) };
          if (!seenJobIds.has(normalizedJob.id) && !discoveredJobs.has(normalizedJob.id)) {
            discoveredJobs.set(normalizedJob.id, normalizedJob);
          }
        }
      } catch (error) {
        const message = `${category}: ${error.message || String(error)}`;
        sourceErrors.push(message);
        if (Number.isFinite(error.backoffMs) && error.backoffMs > 0) {
          requestedBackoffs.push(error.backoffMs);
        }
        console.error(`Mostaql source failed (${message})`);
      }
    }

    const attemptTime = new Date().toISOString();
    stats.lastAttempt = attemptTime;

    if (enabledSources.length > 0 && successfulSources === 0) {
      stats.lastError = sourceErrors.join(' | ') || 'All Mostaql sources failed.';
      const delay = requestedBackoffs.length > 0
        ? Math.max(...requestedBackoffs)
        : 2 * 60 * 1000;
      const nextBackoffUntil = Date.now() + delay;
      stats.nextCheckAllowedAt = new Date(nextBackoffUntil).toISOString();
      await chrome.storage.local.set({ stats, mostaqlBackoffUntil: nextBackoffUntil });
      return {
        success: false,
        error: stats.lastError,
        newJobs: 0,
        retryAt: stats.nextCheckAllowedAt
      };
    }

    stats.nextCheckAllowedAt = null;

    const unseenJobs = Array.from(discoveredJobs.values());
    const establishingBaseline = !stats.lastCheck && seenJobIds.size === 0;
    let newJobs = establishingBaseline
      ? []
      : unseenJobs.filter(job => isRecentlyPublishedJob(job, settings, stats.lastCheck));
    const ignoredOldJobs = unseenJobs.length - newJobs.length;

    console.log(`Found ${unseenJobs.length} unique unseen project(s); ${newJobs.length} are newly published.`);
    if (establishingBaseline) {
      console.log('Initial Mostaql baseline created without notifying the existing backlog.');
    } else if (ignoredOldJobs > 0) {
      console.log(`Ignored ${ignoredOldJobs} old or undated project(s).`);
    }

    if (newJobs.length > 0 && filtersNeedProjectDetails(settings)) {
      // Bounded concurrency avoids spending minutes fetching project details
      // serially on a first run with many unseen projects.
      newJobs = await mapWithConcurrency(
        newJobs,
        4,
        job => enrichJob(job, settings.authenticatedPolling === true)
      );
    }

    const qualityJobs = newJobs.filter(job => applyFilters(job, settings));
    const quietHoursActive = settings.quietHoursEnabled && isQuietHour(settings);
    const notificationsEnabled = data.notificationsEnabled !== false;
    let notificationError = null;

    if (qualityJobs.length > 0 && !quietHoursActive && notificationsEnabled) {
      try {
        // Do not mark matching projects as delivered until Chrome confirms
        // that it created the notification.
        await showNotification(qualityJobs);
        if (settings.sound) await playSound();
      } catch (error) {
        notificationError = error;
        console.error('Chrome failed to create the job notification:', error);
      }
    } else if (quietHoursActive && qualityJobs.length > 0) {
      console.log('Quiet Hours active, suppressing notifications and sounds.');
    } else if (!notificationsEnabled && qualityJobs.length > 0) {
      console.log('Notifications are toggled off. Skipping alerts for new jobs.');
    }

    const retryIds = new Set(
      notificationError ? qualityJobs.map(job => String(job.id)) : []
    );
    for (const job of unseenJobs) {
      if (!retryIds.has(String(job.id))) seenJobIds.add(String(job.id));
    }

    for (const job of qualityJobs) {
      const existingIndex = recentJobs.findIndex(item => String(item.id) === String(job.id));
      if (existingIndex === -1) recentJobs.unshift(job);
      else recentJobs[existingIndex] = { ...recentJobs[existingIndex], ...job };
    }

    recentJobs.sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));
    recentJobs = recentJobs.slice(0, 50);

    const seenJobs = Array.from(seenJobIds).slice(-500);
    stats.lastCheck = attemptTime;
    stats.lastError = notificationError
      ? `Notification failed: ${notificationError.message || String(notificationError)}`
      : (sourceErrors.length > 0 ? sourceErrors.join(' | ') : null);
    stats.todayCount += qualityJobs.length - retryIds.size;

    await chrome.storage.local.set({
      seenJobs,
      stats,
      recentJobs,
      mostaqlBackoffUntil: null
    });

    if (notificationError) {
      return { success: false, error: stats.lastError, newJobs: qualityJobs.length };
    }

    console.log(`Check completed; ${qualityJobs.length} matching new project(s).`);
    return {
      success: true,
      newJobs: qualityJobs.length,
      totalChecked: seenJobs.length,
      ignoredOldJobs,
      warnings: sourceErrors
    };
  } catch (error) {
    console.error('Error checking jobs:', error);
    return { success: false, error: error.message || String(error) };
  }
}
