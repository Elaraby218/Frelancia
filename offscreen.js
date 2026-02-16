// ==========================================
// Offscreen Document - Audio Player
// ==========================================

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'playSound') {
    playNotificationSound();
    sendResponse({ success: true });
  } else if (message.action === 'parseJobs') {
    const jobs = parseMostaqlHTML(message.html);
    sendResponse({ success: true, jobs: jobs });
  } else if (message.action === 'parseTrackedData' || message.action === 'parseProjectDetails') {
    const data = parseProjectDetails(message.html);
    sendResponse({ success: true, data: data });
  } else if (message.action === 'playTrackedSound') {
    playTrackedSound();
    sendResponse({ success: true });
  }
});

function parseMostaqlHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const jobs = [];
    const seenIds = new Set();
    
    // Strategy 1: Table Rows (Classic View)
    // tr.project-row or just tr with a project link
    const rows = doc.querySelectorAll('tr');
    
    rows.forEach(row => {
        const link = row.querySelector('a[href*="/project/"]');
        if (link) {
            const href = link.getAttribute('href');
            // Extract ID from URL
            const idMatch = href.match(/\/project\/(\d+)/);
            if (idMatch) {
                const id = idMatch[1];
                if (!seenIds.has(id)) {
                    const title = link.textContent.trim();
                    const budgetEl = row.querySelector('td:nth-child(4), [class*="budget"]');
                    const budget = budgetEl ? budgetEl.textContent.trim() : 'غير محدد';
                    
                    const timeEl = row.querySelector('td:nth-child(5n), .timeSince, [class*="date"]');
                    const time = timeEl ? timeEl.textContent.trim() : '';

                    seenIds.add(id);
                    jobs.push({
                        id: id,
                        title: title,
                        budget: budget,
                        time: time,
                        url: href.startsWith('http') ? href : 'https://mostaql.com' + href
                    });
                }
            }
        }
    });
    
    // Strategy 2: Cards (Grid View)
    const cards = doc.querySelectorAll('.card, .project-card, div[class*="project"]');
    cards.forEach(card => {
        const link = card.querySelector('a[href*="/project/"]');
        if (link) {
            const href = link.getAttribute('href');
            const idMatch = href.match(/\/project\/(\d+)/);
            if (idMatch) {
                const id = idMatch[1];
                if (!seenIds.has(id)) {
                    seenIds.add(id);
                    const timeEl = card.querySelector('.timeSince, [class*="date"]');
                    jobs.push({
                        id: id,
                        title: link.textContent.trim(),
                        budget: 'غير محدد',
                        time: timeEl ? timeEl.textContent.trim() : '',
                        url: href.startsWith('http') ? href : 'https://mostaql.com' + href
                    });
                }
            }
        }
    });

    // Strategy 3: Fallback - All Links
    // If we missed everything, just grab anything that looks like a project link
    if (jobs.length === 0) {
        const allLinks = doc.querySelectorAll('a[href*="/project/"]');
        allLinks.forEach(link => {
            const href = link.getAttribute('href');
            const idMatch = href.match(/\/project\/(\d+)/);
            if (idMatch) {
                const id = idMatch[1];
                // Ensure text is long enough to be a title, not an icon or "Details"
                const text = link.innerText.trim();
                if (!seenIds.has(id) && text.length > 5) {
                    seenIds.add(id);
                    jobs.push({
                        id: id,
                        title: text,
                        budget: '',
                        url: href.startsWith('http') ? href : 'https://mostaql.com' + href
                    });
                }
            }
        });
    }

    return jobs;
}

function parseProjectDetails(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract Status
    const statusLabel = doc.querySelector('.label-prj-open, .label-prj-closed, .label-prj-completed, .label-prj-cancelled, .label-prj-underway, .label-prj-processing');
    const status = statusLabel ? statusLabel.textContent.trim() : 'غير معروف';

    // Extract Description
    const descriptionEl = doc.querySelector('.project-post__body');
    const description = descriptionEl ? descriptionEl.textContent.trim() : '';

    // Extract Metadata
    let communications = '0';
    let hiringRate = '';
    let duration = 'غير محددة';
    let budget = '';
    let registrationDate = '';
    
    const metaRows = doc.querySelectorAll('.meta-row, .table-meta tr');
    metaRows.forEach(row => {
        const text = row.textContent;
        const val = row.querySelector('.meta-value, td:last-child');
        if (!val) return;

        if (text.includes('التواصلات الجارية')) {
            communications = val.textContent.trim();
        } else if (text.includes('معدل التوظيف')) {
            hiringRate = val.textContent.trim();
        } else if (text.includes('مدة التنفيذ')) {
            duration = val.textContent.trim();
        } else if (text.includes('الميزانية')) {
            budget = val.textContent.trim();
        } else if (text.includes('تاريخ التسجيل')) {
            registrationDate = val.textContent.trim();
        }
    });

    return { status, communications, hiringRate, description, duration, budget, registrationDate };
}

function playNotificationSound() {
  const audio = document.getElementById('notificationSound');
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(error => console.error('Error playing notification sound:', error));
  } else {
    // Fallback to beep if audio element is missing
    playBeep();
  }
}

// Create a notification sound using Web Audio API (as fallback)
function playBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Basic notification: two beeps (low then high)
    playTone(audioContext, 800, 0, 0.15);
    playTone(audioContext, 1000, 0.2, 0.15);
    
  } catch (error) {
    console.error('Error playing beep:', error);
  }
}

function playTrackedSound() {
  const audio = document.getElementById('notificationSound');
  if (audio) {
    // Use the same sound for tracked projects for now as it's the only available MP3
    audio.currentTime = 0;
    audio.play().catch(error => console.error('Error playing tracked sound:', error));
  } else {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Tracked update: 三 sequence of beeps (high-high-low) or distinct pattern
      playTone(audioContext, 1200, 0, 0.1);
      playTone(audioContext, 1200, 0.15, 0.1);
      playTone(audioContext, 1500, 0.3, 0.2);
      
    } catch (error) {
      console.error('Error playing tracked sound:', error);
    }
  }
}

function playTone(audioContext, frequency, startTime, duration) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  
  const now = audioContext.currentTime;
  gainNode.gain.setValueAtTime(0.3, now + startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + startTime + duration);
  
  oscillator.start(now + startTime);
  oscillator.stop(now + startTime + duration);
}