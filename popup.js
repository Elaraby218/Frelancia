// ==========================================
// Frelancia | منبه مستقل - Minimal Popup Script
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize minimal UI
  loadStats();
  setupEventListeners();
  
  // Refresh stats every 30 seconds while popup is open
  setInterval(loadStats, 30000);
});

// ==========================================
// Load Stats
// ==========================================
function loadStats() {
  chrome.storage.local.get(['stats', 'seenJobs'], (data) => {
    const stats = data.stats || {};
    const seenJobs = data.seenJobs || [];

    // Last check time formatting
    if (stats.lastCheck) {
      const lastCheck = new Date(stats.lastCheck);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastCheck) / 60000);

      let timeText;
      if (diffMinutes < 1) {
        timeText = 'الآن';
      } else if (diffMinutes < 60) {
        timeText = `منذ ${diffMinutes} دقيقة`;
      } else if (diffMinutes < 1440) {
        timeText = `منذ ${Math.floor(diffMinutes / 60)} ساعة`;
      } else {
        timeText = lastCheck.toLocaleDateString('ar-SA');
      }

      document.getElementById('lastCheck').textContent = `آخر فحص: ${timeText}`;
    } else {
      document.getElementById('lastCheck').textContent = 'لم يتم الفحص بعد';
    }

    // Update counts
    document.getElementById('todayCount').textContent = stats.todayCount || 0;
    document.getElementById('totalSeen').textContent = seenJobs.length;
  });
}

// ==========================================
// Event Listeners
// ==========================================
function setupEventListeners() {
  // Open Dashboard
  const dashboardBtn = document.getElementById('open-dashboard-btn');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'dashboard.html' });
    });
  }

  // Check Now
  const checkBtn = document.getElementById('checkNowBtn');
  if (checkBtn) {
    checkBtn.addEventListener('click', () => {
      const originalContent = checkBtn.innerHTML;
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<span>جاري الفحص...</span>';
      
      chrome.runtime.sendMessage({ action: 'checkNow' }, (response) => {
        checkBtn.disabled = false;
        checkBtn.innerHTML = originalContent;
        loadStats();
      });
    });
  }

  // Check Connection (Diagnostics)
  const connBtn = document.getElementById('checkConnectionBtn');
  const connReport = document.getElementById('connectionReport');
  if (connBtn) {
    connBtn.addEventListener('click', () => {
      const originalContent = connBtn.innerHTML;
      connBtn.disabled = true;
      connBtn.textContent = 'جاري التشخيص...';
      connReport.classList.add('hidden');

      chrome.runtime.sendMessage({ action: 'debugFetch' }, (response) => {
        connBtn.disabled = false;
        connBtn.innerHTML = originalContent;
        connReport.classList.remove('hidden');

        if (response && response.success) {
          connReport.className = 'connection-report success';
          connReport.textContent = `✓ الاتصال ناجح. تم جلب ${response.length} بايت من موقع مستقل.`;
        } else {
          connReport.className = 'connection-report error';
          connReport.textContent = `✗ فشل الاتصال: ${response?.error || 'خطأ غير معروف'}. حاول فتح Mostaql.com أولاً.`;
        }
      });
    });
  }
}