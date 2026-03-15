// ==========================================
// bg/job-checker.js — Main job polling loop
// Depends on: constants.js, filters.js, fetcher.js, notifications.js, audio.js
// ==========================================

async function checkForNewJobs() {
  try {
    const data = await chrome.storage.local.get(['settings', 'seenJobs', 'stats', 'recentJobs', 'notificationsEnabled']);
    const settings = data.settings || {};
    let seenJobs = data.seenJobs || [];
    let recentJobs = data.recentJobs || [];
    let stats = data.stats || {};

    if (typeof stats.todayCount !== 'number') stats.todayCount = 0;
    if (!stats.todayDate) stats.todayDate = new Date().toDateString();
    if (!stats.lastCheck) stats.lastCheck = null;

    if (stats.todayDate !== new Date().toDateString()) {
      stats.todayCount = 0;
      stats.todayDate = new Date().toDateString();
    }

    let allNewJobs = [];

    for (const [category, url] of Object.entries(MOSTAQL_URLS)) {
      if (settings[category] !== false) {
        console.log(`Checking category: ${category}`);
        const jobs = await fetchJobs(url);
        console.log(`Found ${jobs.length} total jobs in ${category}`);

        jobs.forEach(job => {
          if (applyFilters(job, settings)) {
            const existingIdx = recentJobs.findIndex(rj => rj.id === job.id);
            if (existingIdx !== -1) {
              recentJobs[existingIdx] = { ...recentJobs[existingIdx], ...job };
            } else {
              recentJobs.unshift(job);
            }
          }
        });

        const newJobs = jobs.filter(job => {
          if (seenJobs.includes(job.id)) return false;
          return applyFilters(job, settings);
        });
        console.log(`Found ${newJobs.length} NEW jobs in ${category}`);

        allNewJobs = allNewJobs.concat(newJobs);
        newJobs.forEach(job => {
          if (!seenJobs.includes(job.id)) seenJobs.push(job.id);
        });
      }
    }

    // Phase 1: Immediate commit
    stats.lastCheck = new Date().toISOString();
    stats.todayCount += allNewJobs.length;

    if (seenJobs.length > 500) seenJobs = seenJobs.slice(-500);

    recentJobs.sort((a, b) => {
      const idA = parseInt(a.id) || 0;
      const idB = parseInt(b.id) || 0;
      return idB - idA;
    });
    recentJobs = recentJobs.slice(0, 50);

    await chrome.storage.local.set({ seenJobs, stats, recentJobs });
    console.log(`Phase 1 Commit: Saved ${allNewJobs.length} new jobs to dashboard.`);

    // Phase 2: Enrich top 10
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

    if (allNewJobs.length === 0) {
      console.log(`✓ Check completed at ${new Date().toLocaleTimeString()}, found 0 new jobs`);
      return { success: true, newJobs: 0, totalChecked: seenJobs.length };
    }

    if (settings.quietHoursEnabled && isQuietHour(settings)) {
      console.log('Quiet Hours active, suppressing notifications/sounds');
      return { success: true, newJobs: 0, suppressed: allNewJobs.length };
    }

    // Phase 3: Deep filter
    const qualityJobs = [];
    for (const job of allNewJobs) {
      console.log(`Deep checking job ${job.id} for details...`);
      try {
        const projectDetails = await fetchProjectDetails(job.url);
        if (projectDetails) {
          job.description = projectDetails.description;
          job.hiringRate = projectDetails.hiringRate;
          job.status = projectDetails.status;
          job.communications = projectDetails.communications;
          job.duration = projectDetails.duration;
          job.registrationDate = projectDetails.registrationDate;

          if ((!job.budget || job.budget === 'غير محدد') && projectDetails.budget) {
            job.budget = projectDetails.budget;
          }

          if (!applyFilters(job, settings)) {
            console.log(`Filtering out job ${job.id} after deep check`);
            continue;
          }
        }
      } catch (e) {
        console.error(`Error deep checking job ${job.id}:`, e);
      }

      qualityJobs.push(job);

      const rjIdx = recentJobs.findIndex(rj => rj.id === job.id);
      if (rjIdx !== -1) {
        recentJobs[rjIdx] = { ...recentJobs[rjIdx], ...job };
        chrome.storage.local.set({ recentJobs });
      }
    }

    if (qualityJobs.length > 0) {
      const isEnabled = data.notificationsEnabled !== false;
      if (isEnabled) {
        showNotification(qualityJobs);
        if (settings.sound) playSound();
      } else {
        console.log('Notifications are toggled off. Skipping alert for new jobs.');
      }
    }

    console.log(`✓ Check completed at ${new Date().toLocaleTimeString()}, found ${allNewJobs.length} new jobs`);
    return { success: true, newJobs: allNewJobs.length, totalChecked: seenJobs.length };
  } catch (error) {
    console.error('Error checking jobs:', error);
    return { success: false, error: error.message };
  }
}
