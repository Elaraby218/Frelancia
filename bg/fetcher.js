// ==========================================
// bg/fetcher.js — HTTP fetching for job listings and project details
// Depends on: offscreen.js (parseJobsOffscreen, setupOffscreenDocument)
// ==========================================

function cleanTitle(text) {
  if (!text) return 'مشروع جديد';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchJobs(url) {
  try {
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
    console.log(`Fetching: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
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

    if (html.includes('Cloudflare') || html.includes('challenge-platform')) {
      console.error('Cloudflare challenge detected. Please open Mostaql.com in a tab first.');
      return [];
    }

    const jobs = await parseJobsOffscreen(html);
    console.log(`Parsed ${jobs.length} jobs via Offscreen`);
    return jobs;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return [];
  }
}

async function fetchProjectDetails(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) return null;

    const html = await response.text();
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
