// ==========================================
// dashboard-bids/timers.js — Live countdown interval logic
// Depends on: constants.js (THIRTY_DAYS_MS, bidTrackerInterval), render.js (getBidCountdownColor, formatBidCountdown)
// ==========================================

/**
 * Starts the live countdown interval for all bid timeline items.
 */
function startBidTrackerCountdowns() {
    clearBidTrackerTimers();

    const updateAllTimers = () => {
        document.querySelectorAll('.bid-tracker-countdown').forEach(el => {
            let msLeft = parseInt(el.getAttribute('data-ms-left'), 10);
            if (isNaN(msLeft) || msLeft <= 0) {
                el.textContent = 'متاح الآن!';
                el.style.color = '#22c55e';
                return;
            }
            msLeft -= 1000;
            el.setAttribute('data-ms-left', msLeft);
            el.textContent = formatBidCountdown(msLeft);
            const pct = Math.min(100, ((THIRTY_DAYS_MS - msLeft) / THIRTY_DAYS_MS) * 100);
            el.style.color = getBidCountdownColor(pct);
        });

        document.querySelectorAll('.bid-tracker-bar').forEach(bar => {
            let msLeft = parseInt(bar.getAttribute('data-ms-left'), 10);
            if (isNaN(msLeft) || msLeft <= 0) {
                bar.style.width = '100%';
                bar.style.background = '#22c55e';
                return;
            }
            msLeft -= 1000;
            bar.setAttribute('data-ms-left', msLeft);
            const pct = Math.min(100, ((THIRTY_DAYS_MS - msLeft) / THIRTY_DAYS_MS) * 100);
            bar.style.width = `${pct}%`;
            bar.style.background = getBidCountdownColor(pct);
        });
    };

    updateAllTimers();
    bidTrackerInterval = setInterval(updateAllTimers, 1000);
}

/**
 * Clears the active countdown interval.
 */
function clearBidTrackerTimers() {
    if (bidTrackerInterval) {
        clearInterval(bidTrackerInterval);
        bidTrackerInterval = null;
    }
}
