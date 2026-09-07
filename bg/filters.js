// ==========================================
// bg/filters.js — Job filtering helpers (pure functions)
// ==========================================

function applyFilters(job, settings) {
  settings = settings || {};

  if (settings.minBudget > 0 && job.budget) {
    const budgetValue = parseBudgetValue(job.budget);
    if (budgetValue > 0 && budgetValue < settings.minBudget) {
      console.log(`Filtering out job ${job.id} due to low budget: ${job.budget} -> ${budgetValue} < ${settings.minBudget}`);
      return false;
    }
  }

  if (settings.minHiringRate > 0 && job.hiringRate) {
    const hiringRateValue = parseHiringRate(job.hiringRate);
    if (hiringRateValue < settings.minHiringRate) {
      console.log(`Filtering out job ${job.id} due to low hiring rate: ${job.hiringRate} -> ${hiringRateValue}% < ${settings.minHiringRate}%`);
      return false;
    }
  }

  if (settings.keywordsInclude && settings.keywordsInclude.trim() !== '') {
    const includes = settings.keywordsInclude.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
    const jobContent = (job.title + ' ' + (job.description || '')).toLowerCase();
    if (includes.length > 0 && !includes.some(k => jobContent.includes(k))) {
      console.log(`Filtering out job ${job.id} because it doesn't match include keywords`);
      return false;
    }
  }

  if (settings.keywordsExclude && settings.keywordsExclude.trim() !== '') {
    const excludes = settings.keywordsExclude.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
    const jobContent = (job.title + ' ' + (job.description || '')).toLowerCase();
    if (excludes.some(k => jobContent.includes(k))) {
      console.log(`Filtering out job ${job.id} because it matches exclude keywords`);
      return false;
    }
  }

  if (settings.maxDuration > 0 && job.duration) {
    const days = parseDurationDays(job.duration);
    if (days > 0 && days > settings.maxDuration) {
      console.log(`Filtering out job ${job.id} due to long duration: ${job.duration} -> ${days} days > ${settings.maxDuration}`);
      return false;
    }
  }

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
  if (rateText.includes('بعد')) return 0;
  const match = normalizeArabicDigits(rateText).replace(/[,٬]/g, '').match(/\d+(\.\d+)?/);
  if (match) return parseFloat(match[0]);
  return 0;
}

function parseDurationDays(durationText) {
  if (!durationText) return 0;
  const match = normalizeArabicDigits(durationText).match(/\d+/);
  if (match) return parseInt(match[0]);
  if (durationText.includes("يوم واحد")) return 1;
  return 0;
}

function calculateClientAgeDays(dateText) {
  const arabicMonths = {
    'يناير': 0, 'فبراير': 1, 'مارس': 2, 'أبريل': 3, 'مايو': 4, 'يونيو': 5,
    'يوليو': 6, 'أغسطس': 7, 'سبتمبر': 8, 'أكتوبر': 9, 'نوفمبر': 10, 'ديسمبر': 11
  };

  const parts = normalizeArabicDigits(dateText).trim().split(/\s+/);
  if (parts.length < 3) return -1;

  const day = parseInt(parts[0]);
  const monthName = parts[1];
  const year = parseInt(parts[2]);
  const month = arabicMonths[monthName];

  if (isNaN(day) || month === undefined || isNaN(year)) return -1;

  const regDate = new Date(year, month, day);
  const now = new Date();
  const diffTime = now - regDate;
  if (diffTime < 0) return -1;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function parseBudgetValue(budgetText) {
  if (!budgetText) return 0;
  const matches = normalizeArabicDigits(budgetText).replace(/[,٬]/g, '').match(/\d+(\.\d+)?/g);
  if (!matches) return 0;
  return Math.max(...matches.map(m => parseFloat(m)));
}

function isQuietHour(settings) {
  if (!settings.quietHoursStart || !settings.quietHoursEnd) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = settings.quietHoursStart.split(':').map(Number);
  const [endH, endM] = settings.quietHoursEnd.split(':').map(Number);

  if (![startH, startM, endH, endM].every(Number.isFinite)) return false;
  if (startH < 0 || startH > 23 || endH < 0 || endH > 23) return false;
  if (startM < 0 || startM > 59 || endM < 0 || endM > 59) return false;

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

function normalizeArabicDigits(value) {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternArabicIndic = '۰۱۲۳۴۵۶۷۸۹';

  return String(value || '')
    .replace(/[٠-٩]/g, digit => arabicIndic.indexOf(digit))
    .replace(/[۰-۹]/g, digit => easternArabicIndic.indexOf(digit));
}

function parseMostaqlPublishedAt(job, nowMs = Date.now()) {
  const absoluteValue = job.postedAt
    || job.publishedAt
    || job.publishedDatetime
    || job.publishDate;

  if (absoluteValue) {
    const normalized = normalizeArabicDigits(absoluteValue).trim();
    const exactMatch = normalized.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/
    );

    if (exactMatch) {
      const [, year, month, day, hour, minute, second = '0'] = exactMatch;
      // Mostaql emits timezone-less datetime attributes in UTC. Parsing these
      // with `new Date(year, ...)` treats them as local time and makes a fresh
      // job look hours old in zones such as Cairo (UTC+3).
      const parsed = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      );
      if (Number.isFinite(parsed)) return parsed;
    }

    const parsed = Date.parse(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }

  const relative = normalizeArabicDigits(job.time || '').replace(/\s+/g, ' ').trim();
  if (!relative) return null;
  if (/الآن|لحظات|ثوان|ثانية/.test(relative)) return nowMs;

  const numberMatch = relative.match(/(\d+)/);
  if (!numberMatch) {
    if (/دقيقت(?:ان|ين)/.test(relative)) return nowMs - 2 * 60 * 1000;
    if (/ساعت(?:ان|ين)/.test(relative)) return nowMs - 2 * 60 * 60 * 1000;
    if (/يومين|يومان/.test(relative)) return nowMs - 2 * 24 * 60 * 60 * 1000;
    if (/دقيقة/.test(relative)) return nowMs - 60 * 1000;
    if (/ساعة/.test(relative)) return nowMs - 60 * 60 * 1000;
    if (/يوم/.test(relative)) return nowMs - 24 * 60 * 60 * 1000;
    return null;
  }

  const amount = Number(numberMatch[1]);
  if (/دقيق|دقائق/.test(relative)) return nowMs - amount * 60 * 1000;
  if (/ساع/.test(relative)) return nowMs - amount * 60 * 60 * 1000;
  if (/يوم|أيام/.test(relative)) return nowMs - amount * 24 * 60 * 60 * 1000;
  return null;
}

function isRecentlyPublishedJob(job, settings, lastSuccessfulCheck, nowMs = Date.now()) {
  const publishedAt = parseMostaqlPublishedAt(job, nowMs);
  if (!Number.isFinite(publishedAt)) return false;

  const interval = Math.max(0.5, Number(settings?.interval) || 1);
  const graceMinutes = Math.min(5, Math.max(2, interval));
  const maximumLookbackMinutes = 10;
  const lastCheckMs = lastSuccessfulCheck ? Date.parse(lastSuccessfulCheck) : NaN;
  const maximumLookback = nowMs - maximumLookbackMinutes * 60 * 1000;
  const cutoff = Number.isFinite(lastCheckMs)
    ? Math.max(lastCheckMs - graceMinutes * 60 * 1000, maximumLookback)
    : maximumLookback;

  // Allow a small amount of clock skew between Mostaql and the local device.
  return publishedAt >= cutoff && publishedAt <= nowMs + 2 * 60 * 1000;
}
