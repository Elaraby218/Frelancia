// ==========================================
// bg/tracker.js — Tracked project change monitoring
// Depends on: offscreen.js, notifications.js (showTrackedNotification), audio.js (playTrackedSound)
// ==========================================

async function checkTrackedProjects() {
  const data = await chrome.storage.local.get(['trackedProjects', 'settings', 'notificationsEnabled']);
  const trackedProjects = data.trackedProjects || {};
  const settings = data.settings || {};

  const projectIds = Object.keys(trackedProjects);
  if (projectIds.length === 0) return;

  console.log(`Checking ${projectIds.length} tracked projects...`);

  for (const id of projectIds) {
    const project = trackedProjects[id];
    try {
      const response = await fetch(project.url, {
        cache: 'no-store',
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.9',
          'Accept-Language': 'ar,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
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
          const isEnabled = data.notificationsEnabled !== false;

          if (isEnabled) {
            showTrackedNotification(project, changeMsg);
            if (settings.sound) {
              playTrackedSound();
            }
          } else {
            console.log('Notifications are toggled off. Skipping alert for tracked project update.');
          }

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
