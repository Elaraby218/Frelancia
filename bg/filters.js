// ==========================================
// bg/filters.js — Job filtering helpers (pure functions)
// ==========================================

function applyFilters(job, settings) {
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
    const includes = settings.keywordsInclude.toLowerCase().split(',').map(k => k.trim());
    const jobContent = (job.title + ' ' + (job.description || '')).toLowerCase();
    if (!includes.some(k => jobContent.includes(k))) {
      console.log(`Filtering out job ${job.id} because it doesn't match include keywords`);
      return false;
    }
  }

  if (settings.keywordsExclude && settings.keywordsExclude.trim() !== '') {
    const excludes = settings.keywordsExclude.toLowerCase().split(',').map(k => k.trim());
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
  const match = rateText.replace(/,/g, '').match(/\d+(\.\d+)?/);
  if (match) return parseFloat(match[0]);
  return 0;
}

function parseDurationDays(durationText) {
  const match = durationText.match(/\d+/);
  if (match) return parseInt(match[0]);
  if (durationText.includes("يوم واحد")) return 1;
  return 0;
}

function calculateClientAgeDays(dateText) {
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
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function parseBudgetValue(budgetText) {
  if (!budgetText) return 0;
  const matches = budgetText.replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!matches) return 0;
  return Math.max(...matches.map(m => parseFloat(m)));
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
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}
