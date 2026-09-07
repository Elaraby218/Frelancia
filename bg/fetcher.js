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
      // Reuse the user's Mostaql/Cloudflare session. Without these cookies a
      // background request can receive a 403 while Mostaql works in a tab.
      credentials: 'include',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`Mostaql returned HTTP ${response.status}`);
    }

    const html = await response.text();
    console.log(`Received HTML length: ${html.length}`);

    if (
      html.includes('challenge-platform')
      || /<title>\s*(?:403 Forbidden|Just a moment)/i.test(html)
      || /cf-(?:challenge|error)/i.test(html)
    ) {
      throw new Error('Mostaql access challenge detected. Open Mostaql in a tab and sign in, then retry.');
    }

    const jobs = await parseJobsOffscreen(html);
    console.log(`Parsed ${jobs.length} jobs via Offscreen`);

    if (jobs.length === 0 && /\/project\/\d+/i.test(html)) {
      throw new Error('Mostaql projects were found, but the page format could not be parsed.');
    }

    return jobs;
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
}

async function fetchProjectDetails(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`Mostaql project details returned HTTP ${response.status}`);
    }

    const html = await response.text();
    return await parseTrackedDataOffscreen(html);
  } catch (error) {
    console.error('Error fetching project details:', error);
    return null;
  }
}
