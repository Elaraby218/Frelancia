// ==========================================
// Frelancia Pro — Productivity Mode
// ==========================================

(function () {
    'use strict';

    const CIRCUMFERENCE = 534; // 2 * PI * 85
    const STORAGE_KEY = 'productivitySessions';
    const BREAK_DURATION = 5; // minutes
    const DAILY_GOAL_MINUTES = 6 * 60; // 6 hours

    const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const DAY_SHORT = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

    // ==========================================
    // State
    // ==========================================
    let timerState = 'idle'; // idle | focus | paused | break
    let focusDuration = 25; // minutes
    let remainingSeconds = 25 * 60;
    let totalSeconds = 25 * 60;
    let intervalId = null;
    let sessionStartTime = null;
    let pausedAt = null;

    // --- DOM References ---
    // (Using FrelanciaUtils.$)

    // ==========================================
    // Timer Logic
    // ==========================================
    function startFocus() {
        if (timerState === 'paused') {
            // Resume
            timerState = 'focus';
            sessionStartTime = new Date(Date.now() - (totalSeconds - remainingSeconds) * 1000);
            tick();
            intervalId = setInterval(tick, 1000);
            updateControls();
            return;
        }

        // Fresh start
        const customInput = FrelanciaUtils.$('customMinutes');
        const durSelector = FrelanciaUtils.$('durationSelector');
        const activeBtn = durSelector.querySelector('.dur-btn.active');
        const mins = parseInt(activeBtn?.dataset.minutes || '25');

        if (mins === 0 && customInput) {
            const custom = parseInt(customInput.value);
            if (!custom || custom < 1 || custom > 120) return;
            focusDuration = custom;
        } else {
            focusDuration = mins || 25;
        }

        totalSeconds = focusDuration * 60;
        remainingSeconds = totalSeconds;
        sessionStartTime = new Date();
        timerState = 'focus';

        updateTimerDisplay();
        updateRing();
        updateControls();
        setTimerLabel('جلسة تركيز', false);

        const ringFill = FrelanciaUtils.$('timerRingFill');
        if (ringFill) ringFill.classList.remove('break-mode');

        intervalId = setInterval(tick, 1000);
    }

    function pauseTimer() {
        if (timerState === 'focus') {
            timerState = 'paused';
            pausedAt = new Date();
            clearInterval(intervalId);
            intervalId = null;
            setTimerLabel('متوقف مؤقتاً', false);
            updateControls();
        }
    }

    function stopTimer() {
        // If we were in a focus session, save partial session
        if ((timerState === 'focus' || timerState === 'paused') && sessionStartTime) {
            const elapsed = totalSeconds - remainingSeconds;
            if (elapsed >= 60) { // Only save if ≥1 minute
                saveSession(sessionStartTime, new Date(), Math.floor(elapsed / 60));
            }
        }

        resetTimer();
    }

    function resetTimer() {
        clearInterval(intervalId);
        intervalId = null;
        timerState = 'idle';
        remainingSeconds = focusDuration * 60;
        totalSeconds = focusDuration * 60;
        sessionStartTime = null;
        pausedAt = null;

        updateTimerDisplay();
        FrelanciaUtils.$('timerRingFill').style.strokeDashoffset = '0';
        FrelanciaUtils.$('timerRingFill').classList.remove('break-mode');
        setTimerLabel('جاهز للبدء', false);
        updateControls();
        refreshStats();
    }

    function tick() {
        if (remainingSeconds <= 0) {
            clearInterval(intervalId);
            intervalId = null;

            if (timerState === 'focus') {
                // Focus session complete
                saveSession(sessionStartTime, new Date(), focusDuration);
                sendNotification('انتهت جلسة التركيز! 🎉', 'أحسنت! خذ استراحة قصيرة ثم عد للعمل.');
                checkMilestone();
                startBreak();
            } else if (timerState === 'break') {
                // Break complete
                sendNotification('انتهت الاستراحة ☕', 'هل أنت مستعد لجلسة تركيز جديدة؟');
                resetTimer();
            }
            return;
        }

        remainingSeconds--;
        updateTimerDisplay();
        updateRing();
    }

    function startBreak() {
        timerState = 'break';
        totalSeconds = BREAK_DURATION * 60;
        remainingSeconds = totalSeconds;
        sessionStartTime = null;

        const ringFill = FrelanciaUtils.$('timerRingFill');
        if (ringFill) ringFill.classList.add('break-mode');

        setTimerLabel('وقت الاستراحة', true);
        updateTimerDisplay();
        updateRing();
        updateControls();

        intervalId = setInterval(tick, 1000);
    }

    // ==========================================
    // Timer Display Updates
    // ==========================================
    function updateTimerDisplay() {
        const mins = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        const el = FrelanciaUtils.$('timerTime');
        if (el) el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function updateRing() {
        const progress = 1 - (remainingSeconds / totalSeconds);
        const offset = CIRCUMFERENCE * (1 - progress);
        const ringFill = FrelanciaUtils.$('timerRingFill');
        if (ringFill) ringFill.style.strokeDashoffset = offset;
    }

    function setTimerLabel(text, isBreak) {
        const el = FrelanciaUtils.$('timerLabel');
        if (!el) return;
        el.textContent = text;
        el.className = 'timer-label' + (isBreak ? ' break-label' : '');
    }

    function updateControls() {
        const startBtn = FrelanciaUtils.$('timerStartBtn');
        const pauseBtn = FrelanciaUtils.$('timerPauseBtn');
        const stopBtn = FrelanciaUtils.$('timerStopBtn');
        const durSelector = FrelanciaUtils.$('durationSelector');
        const customInput = FrelanciaUtils.$('customDurInput');

        if (!startBtn || !pauseBtn || !stopBtn) return;

        switch (timerState) {
            case 'idle':
                startBtn.classList.remove('hidden');
                startBtn.innerHTML = '<i class="fas fa-play"></i> ابدأ';
                startBtn.className = 'timer-btn start';
                pauseBtn.classList.add('hidden');
                stopBtn.classList.add('hidden');
                if (durSelector) durSelector.style.pointerEvents = '';
                if (durSelector) durSelector.style.opacity = '';
                break;

            case 'focus':
                startBtn.classList.add('hidden');
                pauseBtn.classList.remove('hidden');
                pauseBtn.innerHTML = '<i class="fas fa-pause"></i> إيقاف';
                pauseBtn.className = 'timer-btn pause';
                stopBtn.classList.remove('hidden');
                if (durSelector) durSelector.style.pointerEvents = 'none';
                if (durSelector) durSelector.style.opacity = '0.5';
                break;

            case 'paused':
                startBtn.classList.remove('hidden');
                startBtn.innerHTML = '<i class="fas fa-play"></i> استئناف';
                startBtn.className = 'timer-btn resume';
                pauseBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
                break;

            case 'break':
                startBtn.classList.add('hidden');
                pauseBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
                stopBtn.innerHTML = '<i class="fas fa-forward"></i> تخطي';
                if (durSelector) durSelector.style.pointerEvents = 'none';
                if (durSelector) durSelector.style.opacity = '0.5';
                break;
        }
    }

    // ==========================================
    // Session Storage
    // ==========================================
    function saveSession(start, end, durationMins) {
        const session = {
            id: 's_' + Date.now(),
            start: start.toISOString(),
            end: end.toISOString(),
            duration: durationMins,
            date: new Date().toISOString().split('T')[0]
        };

        FrelanciaUtils.getStorage([STORAGE_KEY]).then((data) => {
            const sessions = data[STORAGE_KEY] || [];
            sessions.push(session);

            // Keep last 200 sessions max
            if (sessions.length > 200) sessions.splice(0, sessions.length - 200);

            FrelanciaUtils.setStorage({ [STORAGE_KEY]: sessions }).then(() => {
                refreshStats();
            });
        });
    }

    function getSessions(callback) {
        FrelanciaUtils.getStorage([STORAGE_KEY]).then((data) => {
            callback(data[STORAGE_KEY] || []);
        });
    }

    // ==========================================
    // Today's Stats
    // ==========================================
    function refreshStats() {
        getSessions((sessions) => {
            const today = new Date().toISOString().split('T')[0];
            const todaySessions = sessions.filter(s => s.date === today);

            const totalMinutes = todaySessions.reduce((sum, s) => sum + s.duration, 0);
            const sessionCount = todaySessions.length;
            const avgFocus = sessionCount > 0 ? Math.round(totalMinutes / sessionCount) : 0;

            // Format work time
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            const workTimeText = hours > 0 ? `${hours} س ${mins} د` : `${mins} د`;

            // Productivity % relative to daily goal
            const productivityPct = Math.min(100, Math.round((totalMinutes / DAILY_GOAL_MINUTES) * 100));

            // Update DOM
            const elWorkTime = FrelanciaUtils.$('statWorkTime');
            const elCount = FrelanciaUtils.$('statSessionCount');
            const elAvg = FrelanciaUtils.$('statAvgFocus');
            const elProd = FrelanciaUtils.$('statProductivity');
            const elProgressPct = FrelanciaUtils.$('prodProgressPct');
            const elProgressBar = FrelanciaUtils.$('prodProgressBar');

            if (elWorkTime) elWorkTime.textContent = workTimeText;
            if (elCount) elCount.textContent = sessionCount;
            if (elAvg) elAvg.textContent = `${avgFocus} د`;
            if (elProd) elProd.textContent = `${productivityPct}%`;
            if (elProgressPct) elProgressPct.textContent = `${productivityPct}%`;
            if (elProgressBar) elProgressBar.style.width = `${productivityPct}%`;

            // Render session history
            renderSessionHistory(todaySessions);

            // Render weekly
            renderWeeklyInsights(sessions);
        });
    }

    // ==========================================
    // Session History
    // ==========================================
    function renderSessionHistory(sessions) {
        const list = FrelanciaUtils.$('sessionHistoryList');
        if (!list) return;

        if (sessions.length === 0) {
            list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-hourglass-start"></i>
          <p>لا توجد جلسات بعد. ابدأ أول جلسة تركيز!</p>
        </div>`;
            return;
        }

        // Show last 10, most recent first
        const recent = sessions.slice(-10).reverse();

        list.innerHTML = recent.map(s => {
            const startTime = new Date(s.start);
            const endTime = new Date(s.end);
            const startStr = FrelanciaUtils.formatTime(startTime);
            const endStr = FrelanciaUtils.formatTime(endTime);

            return `
        <div class="session-list-item">
          <div class="session-dot"></div>
          <span class="session-time-range">${startStr} – ${endStr}</span>
          <span class="session-duration-badge">${s.duration} د</span>
        </div>`;
        }).join('');
    }



    // ==========================================
    // Weekly Insights
    // ==========================================
    function renderWeeklyInsights(allSessions) {
        const chart = FrelanciaUtils.$('weeklyChart');
        if (!chart) return;

        // Get last 7 days
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push({
                dateStr: d.toISOString().split('T')[0],
                dayName: DAY_SHORT[d.getDay()],
                minutes: 0,
                sessions: 0
            });
        }

        // Aggregate
        allSessions.forEach(s => {
            const day = days.find(d => d.dateStr === s.date);
            if (day) {
                day.minutes += s.duration;
                day.sessions++;
            }
        });

        const maxMinutes = Math.max(...days.map(d => d.minutes), 1);

        // Render bars
        chart.innerHTML = days.map(day => {
            const heightPct = Math.max(3, (day.minutes / maxMinutes) * 100);
            const hours = (day.minutes / 60).toFixed(1);
            const isEmpty = day.minutes === 0;

            return `
        <div class="weekly-bar-col">
          <span class="weekly-bar-value">${isEmpty ? '—' : hours + ' س'}</span>
          <div class="weekly-bar ${isEmpty ? 'empty' : ''}" style="height: ${heightPct}%;"></div>
          <span class="weekly-bar-label">${day.dayName}</span>
        </div>`;
        }).join('');

        // Summary
        const totalMins = days.reduce((s, d) => s + d.minutes, 0);
        const totalSess = days.reduce((s, d) => s + d.sessions, 0);
        const avgDaily = Math.round(totalMins / 7);

        const totalHrs = (totalMins / 60).toFixed(1);
        const avgDailyStr = avgDaily > 60 ? `${Math.floor(avgDaily / 60)} س ${avgDaily % 60} د` : `${avgDaily} د`;

        const elTotalHrs = FrelanciaUtils.$('weeklyTotalHours');
        const elTotalSess = FrelanciaUtils.$('weeklyTotalSessions');
        const elAvgDaily = FrelanciaUtils.$('weeklyAvgDaily');

        if (elTotalHrs) elTotalHrs.textContent = `${totalHrs} ساعة`;
        if (elTotalSess) elTotalSess.textContent = totalSess;
        if (elAvgDaily) elAvgDaily.textContent = avgDailyStr;
    }

    // ==========================================
    // Notifications
    // ==========================================
    function sendNotification(title, body) {
        try {
            if (chrome.notifications) {
                chrome.notifications.create('prod_' + Date.now(), {
                    type: 'basic',
                    iconUrl: 'icons/icon128.png',
                    title: title,
                    message: body
                });
            }
        } catch (e) {
            // Dashboard page can't use chrome.notifications directly
            // Fall back to sending a message to the background script
            try {
                chrome.runtime.sendMessage({
                    type: 'SHOW_PRODUCTIVITY_NOTIFICATION',
                    title: title,
                    body: body
                });
            } catch (e2) {
                console.log('Notification:', title, body);
            }
        }

        // Also try to play sound
        try {
            chrome.runtime.sendMessage({ type: 'PLAY_NOTIFICATION_SOUND' });
        } catch (e) { /* ignore */ }
    }

    function checkMilestone() {
        getSessions((sessions) => {
            const today = new Date().toISOString().split('T')[0];
            const todayCount = sessions.filter(s => s.date === today).length;

            const milestones = [4, 8, 12];
            if (milestones.includes(todayCount)) {
                setTimeout(() => {
                    sendNotification(
                        `أحسنت! 🏆`,
                        `أكملت ${todayCount} جلسات تركيز اليوم. استمر!`
                    );
                }, 3000);
            }
        });
    }

    // ==========================================
    // Duration Selector
    // ==========================================
    function setupDurationSelector() {
        const selector = FrelanciaUtils.$('durationSelector');
        const customInput = FrelanciaUtils.$('customDurInput');
        if (!selector) return;

        selector.addEventListener('click', (e) => {
            const btn = e.target.closest('.dur-btn');
            if (!btn || timerState !== 'idle') return;

            selector.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const mins = parseInt(btn.dataset.minutes);

            if (mins === 0) {
                // Custom
                FrelanciaUtils.toggleHidden(customInput, false);
                return;
            }

            FrelanciaUtils.toggleHidden(customInput, true);
            focusDuration = mins;
            totalSeconds = mins * 60;
            remainingSeconds = totalSeconds;
            updateTimerDisplay();
            FrelanciaUtils.$('timerRingFill').style.strokeDashoffset = '0';
        });

        // Custom input change
        const customMins = FrelanciaUtils.$('customMinutes');
        if (customMins) {
            customMins.addEventListener('input', () => {
                const val = parseInt(customMins.value);
                if (val && val >= 1 && val <= 120) {
                    focusDuration = val;
                    totalSeconds = val * 60;
                    remainingSeconds = totalSeconds;
                    updateTimerDisplay();
                    FrelanciaUtils.$('timerRingFill').style.strokeDashoffset = '0';
                }
            });
        }
    }

    // ==========================================
    // Initialize
    // ==========================================
    function init() {
        // Timer controls
        const startBtn = FrelanciaUtils.$('timerStartBtn');
        const pauseBtn = FrelanciaUtils.$('timerPauseBtn');
        const stopBtn = FrelanciaUtils.$('timerStopBtn');

        if (startBtn) startBtn.addEventListener('click', startFocus);
        if (pauseBtn) pauseBtn.addEventListener('click', pauseTimer);
        if (stopBtn) stopBtn.addEventListener('click', stopTimer);

        setupDurationSelector();
        updateTimerDisplay();
        updateControls();
        refreshStats();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
