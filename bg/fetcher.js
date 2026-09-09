// ==========================================
// bg/fetcher.js — Privacy-first HTTP fetching for Mostaql
// Depends on: offscreen.js (parseJobsOffscreen, parseTrackedDataOffscreen)
// ==========================================

const MOSTAQL_ORIGIN = 'https://mostaql.com';
const MOSTAQL_NETWORK_BACKOFF_MS = 2 * 60 * 1000;
const MOSTAQL_SERVER_BACKOFF_MS = 5 * 60 * 1000;
const MOSTAQL_ACCESS_BACKOFF_MS = 10 * 60 * 1000;
const MOSTAQL_MAX_BACKOFF_MS = 60 * 60 * 1000;

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

function normalizeMostaqlUrl(value, options = {}) {
  const { projectOnly = false } = options;
  let parsed;

  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error('Invalid Mostaql URL.');
  }

  if (parsed.origin !== MOSTAQL_ORIGIN || parsed.username || parsed.password) {
    throw new Error('Blocked a request outside https://mostaql.com.');
  }

  if (projectOnly && !/^\/project\/\d+(?:[-/]|$)/.test(parsed.pathname)) {
    throw new Error('Blocked an invalid Mostaql project URL.');
  }

  return parsed.toString();
}

function createMostaqlRequestError(message, details = {}) {
  const error = new Error(message);
  if (details.status) error.status = details.status;
  if (details.backoffMs) error.backoffMs = details.backoffMs;
  return error;
}

function retryAfterMilliseconds(response) {
  const value = response.headers?.get?.('Retry-After');
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MOSTAQL_MAX_BACKOFF_MS, Math.max(60 * 1000, seconds * 1000));
  }

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return null;
  return Math.min(
    MOSTAQL_MAX_BACKOFF_MS,
    Math.max(60 * 1000, retryAt - Date.now())
  );
}

function responseBackoffMilliseconds(response) {
  if (response.status === 429) {
    return retryAfterMilliseconds(response) || MOSTAQL_ACCESS_BACKOFF_MS;
  }
  if (response.status === 403) return MOSTAQL_ACCESS_BACKOFF_MS;
  if (response.status >= 500) return MOSTAQL_SERVER_BACKOFF_MS;
  return null;
}

function validateFinalMostaqlResponseUrl(response) {
  if (response.url) normalizeMostaqlUrl(response.url);
}

function mostaqlRequestOptions(useAuthenticatedSession) {
  return {
    method: 'GET',
    cache: 'no-store',
    // Anonymous is the safe default. Users must explicitly opt in before the
    // browser sends their existing Mostaql session with background requests.
    credentials: useAuthenticatedSession === true ? 'include' : 'omit',
    referrerPolicy: 'no-referrer',
    // Reject redirects so an authenticated request can never follow a server
    // redirect to another origin and send that origin's cookies.
    redirect: 'error',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ar,en;q=0.9'
    }
  };
}

async function fetchJobs(url, useAuthenticatedSession = false) {
  const fetchUrl = normalizeMostaqlUrl(url);

  try {
    console.log(`Fetching Mostaql listing: ${fetchUrl}`);
    const response = await fetch(fetchUrl, mostaqlRequestOptions(useAuthenticatedSession));
    validateFinalMostaqlResponseUrl(response);

    if (!response.ok) {
      throw createMostaqlRequestError(
        `Mostaql returned HTTP ${response.status}`,
        { status: response.status, backoffMs: responseBackoffMilliseconds(response) }
      );
    }

    const html = await response.text();
    console.log(`Received HTML length: ${html.length}`);

    if (
      html.includes('challenge-platform')
      || /<title>\s*(?:403 Forbidden|Just a moment)/i.test(html)
      || /cf-(?:challenge|error)/i.test(html)
    ) {
      throw createMostaqlRequestError(
        'Mostaql access challenge detected; automatic checks will pause before retrying.',
        { status: 403, backoffMs: MOSTAQL_ACCESS_BACKOFF_MS }
      );
    }

    const jobs = await parseJobsOffscreen(html);
    console.log(`Parsed ${jobs.length} jobs via Offscreen`);

    if (jobs.length === 0 && /\/project\/\d+/i.test(html)) {
      throw createMostaqlRequestError(
        'Mostaql projects were found, but the page format could not be parsed.',
        { backoffMs: MOSTAQL_SERVER_BACKOFF_MS }
      );
    }

    return jobs;
  } catch (error) {
    if (!error.backoffMs) error.backoffMs = MOSTAQL_NETWORK_BACKOFF_MS;
    console.error('Error fetching jobs:', error);
    throw error;
  }
}

async function fetchProjectDetails(url, useAuthenticatedSession = false) {
  try {
    const projectUrl = normalizeMostaqlUrl(url, { projectOnly: true });
    const response = await fetch(projectUrl, mostaqlRequestOptions(useAuthenticatedSession));
    validateFinalMostaqlResponseUrl(response);

    if (!response.ok) {
      throw createMostaqlRequestError(
        `Mostaql project details returned HTTP ${response.status}`,
        { status: response.status, backoffMs: responseBackoffMilliseconds(response) }
      );
    }

    const html = await response.text();
    return await parseTrackedDataOffscreen(html);
  } catch (error) {
    console.error('Error fetching project details:', error);
    return null;
  }
}
