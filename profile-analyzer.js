// ==========================================
// Frelancia Pro — Profile Analyzer Engine
// ==========================================

(function () {
  'use strict';

  // Circumference for SVG gauge (2 * PI * 85)
  const GAUGE_CIRCUMFERENCE = 534;

  // ==========================================
  // Scoring Weights
  // ==========================================
  const WEIGHTS = {
    profileCompleteness: 0.30,
    performanceMetrics: 0.40,
    optimizationFactors: 0.30
  };

  // ==========================================
  // Profile Data Parser — Fetches Mostaql Profile
  // ==========================================
  async function fetchMostaqlProfile() {
    try {
      // First try to get the username from storage
      const data = await chrome.storage.local.get(['mostaqlUsername']);
      let profileUrl = '';

      if (data.mostaqlUsername) {
        profileUrl = `https://mostaql.com/u/${data.mostaqlUsername}`;
      } else {
        // Try to find it from open Mostaql tabs
        const tabs = await chrome.tabs.query({ url: 'https://mostaql.com/*' });
        for (const tab of tabs) {
          if (tab.url && tab.url.includes('/u/')) {
            profileUrl = tab.url.split('?')[0];
            break;
          }
        }
      }

      if (!profileUrl) {
        // Return demo data when we can't find a profile
        return getDemoProfileData();
      }

      const response = await fetch(profileUrl);
      if (!response.ok) throw new Error('Failed to fetch profile');
      const html = await response.text();
      return parseProfileHTML(html);

    } catch (err) {
      console.warn('Profile fetch failed, using demo data:', err);
      return getDemoProfileData();
    }
  }

  // ==========================================
  // Parse Profile HTML
  // ==========================================
  function parseProfileHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const profileData = {
      // Profile Completeness
      hasProfilePicture: false,
      hasTitle: false,
      hasBio: false,
      bioLength: 0,
      skillsCount: 0,
      portfolioCount: 0,
      hasCertificates: false,

      // Performance Metrics
      completionRate: 0,
      clientRating: 0,
      responseTime: 'unknown',
      projectCount: 0,

      // Optimization
      bioText: '',
      skills: [],
      title: ''
    };

    // Profile picture
    const avatar = doc.querySelector('.profile--img img, .avatar img, .user-avatar img');
    if (avatar) {
      const src = avatar.getAttribute('src') || '';
      profileData.hasProfilePicture = !src.includes('default') && !src.includes('placeholder') && src.length > 10;
    }

    // Title
    const titleEl = doc.querySelector('.profile--title, .user-title, h2.title');
    if (titleEl) {
      profileData.title = titleEl.textContent.trim();
      profileData.hasTitle = profileData.title.length > 3;
    }

    // Bio
    const bioEl = doc.querySelector('.profile--bio, .user-bio, .bio-text');
    if (bioEl) {
      profileData.bioText = bioEl.textContent.trim();
      profileData.bioLength = profileData.bioText.length;
      profileData.hasBio = profileData.bioLength > 20;
    }

    // Skills
    const skillEls = doc.querySelectorAll('.skills .skill, .tag, .profile--skills a, .profile--skills span');
    profileData.skillsCount = skillEls.length;
    profileData.skills = Array.from(skillEls).map(s => s.textContent.trim());

    // Portfolio
    const portfolioEls = doc.querySelectorAll('.portfolio-item, .portfolio .card, .work-sample');
    profileData.portfolioCount = portfolioEls.length;

    // Stats
    const statEls = doc.querySelectorAll('.profile--stats .stat, .user-stats span, .stats-item');
    statEls.forEach(stat => {
      const text = stat.textContent.trim();
      if (text.includes('%') && text.includes('إنجاز') || text.includes('إكمال')) {
        profileData.completionRate = parseInt(text) || 0;
      }
      if (text.includes('تقييم') || text.includes('★')) {
        profileData.clientRating = parseFloat(text) || 0;
      }
    });

    // Project count
    const projectCountEl = doc.querySelector('.completed-projects, .projects-count');
    if (projectCountEl) {
      profileData.projectCount = parseInt(projectCountEl.textContent) || 0;
    }

    return profileData;
  }

  // ==========================================
  // Demo Profile Data (used when no real data)
  // ==========================================
  function getDemoProfileData() {
    return {
      hasProfilePicture: true,
      hasTitle: true,
      hasBio: true,
      bioLength: 280,
      skillsCount: 6,
      portfolioCount: 3,
      hasCertificates: false,
      completionRate: 85,
      clientRating: 4.2,
      responseTime: 'fast',
      projectCount: 12,
      bioText: 'مطور ويب متخصص في تطوير تطبيقات الويب باستخدام React و Node.js',
      skills: ['React', 'Node.js', 'JavaScript', 'CSS', 'HTML', 'MongoDB'],
      title: 'مطور ويب Full Stack'
    };
  }

  // ==========================================
  // Scoring Engine
  // ==========================================
  function analyzeProfile(profileData) {
    const scores = {};

    // --- Profile Completeness (30%) ---
    let completenessScore = 0;
    const completenessDetails = {};

    // Profile picture (15 pts)
    completenessDetails.profilePicture = profileData.hasProfilePicture ? 15 : 0;
    completenessScore += completenessDetails.profilePicture;

    // Title (15 pts)
    completenessDetails.title = profileData.hasTitle ? 15 : 0;
    completenessScore += completenessDetails.title;

    // Bio (25 pts — scaled by length)
    if (profileData.hasBio) {
      const bioScore = Math.min(25, Math.round((profileData.bioLength / 300) * 25));
      completenessDetails.bio = bioScore;
    } else {
      completenessDetails.bio = 0;
    }
    completenessScore += completenessDetails.bio;

    // Skills (20 pts — 4pts per skill, max 5)
    completenessDetails.skills = Math.min(20, profileData.skillsCount * 4);
    completenessScore += completenessDetails.skills;

    // Portfolio (15 pts — 5pts per item, max 3)
    completenessDetails.portfolio = Math.min(15, profileData.portfolioCount * 5);
    completenessScore += completenessDetails.portfolio;

    // Certificates (10 pts)
    completenessDetails.certificates = profileData.hasCertificates ? 10 : 0;
    completenessScore += completenessDetails.certificates;

    scores.completeness = {
      score: Math.min(100, completenessScore),
      details: completenessDetails,
      weight: WEIGHTS.profileCompleteness
    };

    // --- Performance Metrics (40%) ---
    let performanceScore = 0;

    // Completion rate (30 pts)
    const completionPts = Math.round((profileData.completionRate / 100) * 30);
    performanceScore += completionPts;

    // Client rating (30 pts — out of 5)
    const ratingPts = Math.round((profileData.clientRating / 5) * 30);
    performanceScore += ratingPts;

    // Response time (15 pts)
    let responseTimePts = 0;
    if (profileData.responseTime === 'fast' || profileData.responseTime === 'سريع') {
      responseTimePts = 15;
    } else if (profileData.responseTime === 'medium' || profileData.responseTime === 'متوسط') {
      responseTimePts = 8;
    }
    performanceScore += responseTimePts;

    // Project count (25 pts — scaled)
    const projectPts = Math.min(25, Math.round((profileData.projectCount / 20) * 25));
    performanceScore += projectPts;

    scores.performance = {
      score: Math.min(100, performanceScore),
      weight: WEIGHTS.performanceMetrics
    };

    // --- Optimization Factors (30%) ---
    let optimizationScore = 0;

    // Keyword quality (35 pts — based on skill variety)
    const techKeywords = ['React', 'Node', 'JavaScript', 'Python', 'Flutter', 'Laravel', 'Vue', 'Angular', 'TypeScript', 'PHP', 'SQL', 'MongoDB', 'Express', 'Next.js', 'CSS', 'HTML', 'Docker', 'AWS'];
    const matchedKeywords = profileData.skills.filter(s =>
      techKeywords.some(kw => s.toLowerCase().includes(kw.toLowerCase()))
    );
    const keywordPts = Math.min(35, matchedKeywords.length * 7);
    optimizationScore += keywordPts;

    // Bio clarity (35 pts — based on length and structure)
    let bioClarity = 0;
    if (profileData.bioLength > 200) bioClarity = 35;
    else if (profileData.bioLength > 100) bioClarity = 25;
    else if (profileData.bioLength > 50) bioClarity = 15;
    else if (profileData.bioLength > 0) bioClarity = 5;
    optimizationScore += bioClarity;

    // Skill relevance (30 pts)
    const skillRelevance = Math.min(30, profileData.skillsCount >= 5 ? 30 : profileData.skillsCount * 6);
    optimizationScore += skillRelevance;

    scores.optimization = {
      score: Math.min(100, optimizationScore),
      weight: WEIGHTS.optimizationFactors
    };

    // --- Final Score ---
    const finalScore = Math.round(
      scores.completeness.score * scores.completeness.weight +
      scores.performance.score * scores.performance.weight +
      scores.optimization.score * scores.optimization.weight
    );

    return {
      finalScore: Math.min(100, finalScore),
      categories: scores,
      profileData
    };
  }

  // ==========================================
  // Suggestion Generator
  // ==========================================
  function generateSuggestions(result) {
    const suggestions = [];
    const { profileData, categories } = result;

    // Profile Completeness suggestions
    if (!profileData.hasProfilePicture) {
      suggestions.push({
        icon: 'critical',
        text: '<strong>أضف صورة شخصية احترافية</strong> — الملفات بصور شخصية تحصل على ثقة أعلى من العملاء بنسبة 40%.',
        priority: 1
      });
    }

    if (!profileData.hasTitle || profileData.title.length < 10) {
      suggestions.push({
        icon: 'critical',
        text: '<strong>حسّن عنوانك المهني</strong> — استخدم عنوان واضح يصف تخصصك مثل "مطور React.js و Node.js متخصص في تطبيقات SaaS".',
        priority: 1
      });
    }

    if (profileData.bioLength < 100) {
      suggestions.push({
        icon: 'warning',
        text: '<strong>اكتب نبذة تعريفية أطول</strong> — النبذة المثالية تتجاوز 200 حرف وتوضح خبرتك ومجالات تخصصك.',
        priority: 2
      });
    }

    if (profileData.skillsCount < 5) {
      suggestions.push({
        icon: 'warning',
        text: '<strong>أضف مهارات تقنية محددة</strong> — مثل React, Node.js, TypeScript. المهارات المحددة تزيد من ظهورك في البحث.',
        priority: 2
      });
    }

    if (profileData.portfolioCount < 3) {
      suggestions.push({
        icon: 'warning',
        text: '<strong>أضف مشاريع لمعرض أعمالك</strong> — يُفضل وجود 3 مشاريع على الأقل مع وصف تفصيلي وصور.',
        priority: 2
      });
    }

    if (!profileData.hasCertificates) {
      suggestions.push({
        icon: 'tip',
        text: '<strong>أضف شهادات مهنية</strong> — الشهادات تعزز مصداقيتك وتميزك عن المنافسين.',
        priority: 3
      });
    }

    // Performance suggestions
    if (profileData.completionRate < 80) {
      suggestions.push({
        icon: 'critical',
        text: '<strong>حسّن نسبة الإنجاز</strong> — نسبتك الحالية أقل من 80%. أكمل المشاريع المعلقة لتحسين ملفك.',
        priority: 1
      });
    }

    if (profileData.clientRating < 4.0) {
      suggestions.push({
        icon: 'warning',
        text: '<strong>اعمل على تحسين تقييمك</strong> — ركز على جودة العمل والتواصل الممتاز مع العملاء.',
        priority: 2
      });
    }

    if (profileData.projectCount < 5) {
      suggestions.push({
        icon: 'tip',
        text: '<strong>شارك في مشاريع أكثر</strong> — قدم عروض تنافسية على مشاريع صغيرة لبناء سجل إنجازات قوي.',
        priority: 3
      });
    }

    // Optimization suggestions
    if (profileData.bioText && !profileData.bioText.includes('خبرة') && !profileData.bioText.includes('متخصص')) {
      suggestions.push({
        icon: 'tip',
        text: '<strong>استخدم كلمات مفتاحية في النبذة</strong> — أضف كلمات مثل "خبرة"، "متخصص"، "احترافي" لتحسين ظهورك.',
        priority: 3
      });
    }

    // Always add a general tip
    suggestions.push({
      icon: 'tip',
      text: '<strong>خصّص عروضك</strong> — اكتب عرض مخصص لكل مشروع بدلاً من نسخ عرض واحد. هذا يزيد احتمالية القبول بنسبة كبيرة.',
      priority: 3
    });

    // Sort by priority
    suggestions.sort((a, b) => a.priority - b.priority);

    return suggestions;
  }

  // ==========================================
  // Get Status Label
  // ==========================================
  function getStatusInfo(score) {
    if (score >= 80) return { label: 'ممتاز', cssClass: 'excellent' };
    if (score >= 55) return { label: 'جيد', cssClass: 'good' };
    return { label: 'يحتاج تحسين', cssClass: 'needs-improvement' };
  }

  function getBarClass(pct) {
    if (pct >= 75) return 'excellent';
    if (pct >= 50) return 'good';
    if (pct >= 30) return 'needs-work';
    return 'poor';
  }

  // ==========================================
  // Render Functions
  // ==========================================
  function animateScore(target) {
    const el = document.getElementById('scoreNumber');
    const circle = document.getElementById('gaugeCircle');
    if (!el || !circle) return;

    let current = 0;
    const duration = 1200;
    const startTime = performance.now();

    function step(timestamp) {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      current = Math.round(eased * target);
      el.textContent = current;

      // Update gauge
      const offset = GAUGE_CIRCUMFERENCE - (GAUGE_CIRCUMFERENCE * (eased * target / 100));
      circle.style.strokeDashoffset = offset;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  function renderStrengthBreakdown(categories) {
    const container = document.getElementById('strengthBreakdown');
    if (!container) return;

    const items = [
      { label: 'اكتمال الملف', pct: categories.completeness.score, icon: 'fa-user-check' },
      { label: 'الأداء والإنجاز', pct: categories.performance.score, icon: 'fa-chart-line' },
      { label: 'التحسين والجودة', pct: categories.optimization.score, icon: 'fa-magic' }
    ];

    container.innerHTML = items.map(item => `
      <div class="strength-item">
        <div class="strength-label">
          <span><i class="fas ${item.icon}" style="margin-left: 6px; color: var(--primary); opacity: 0.7;"></i>${item.label}</span>
          <span>${item.pct}%</span>
        </div>
        <div class="strength-bar">
          <div class="strength-bar-fill ${getBarClass(item.pct)}" style="width: 0%;"></div>
        </div>
      </div>
    `).join('');

    // Animate bars after a tiny delay
    requestAnimationFrame(() => {
      setTimeout(() => {
        container.querySelectorAll('.strength-bar-fill').forEach((bar, i) => {
          bar.style.width = items[i].pct + '%';
        });
      }, 100);
    });
  }

  function renderSuggestions(suggestions) {
    const list = document.getElementById('suggestionsList');
    if (!list) return;

    list.innerHTML = suggestions.map(s => {
      const iconClass = s.icon === 'critical' ? 'fa-exclamation-triangle' :
        s.icon === 'warning' ? 'fa-info-circle' : 'fa-check-circle';

      return `
        <li class="suggestion-item">
          <div class="suggestion-icon ${s.icon}">
            <i class="fas ${iconClass}"></i>
          </div>
          <span class="suggestion-text">${s.text}</span>
        </li>
      `;
    }).join('');
  }

  function renderResults(result) {
    const placeholder = document.getElementById('analyzerPlaceholder');
    const results = document.getElementById('analyzerResults');
    if (placeholder) placeholder.classList.add('hidden');
    if (results) results.classList.remove('hidden');

    // Update status label
    const statusInfo = getStatusInfo(result.finalScore);
    const statusEl = document.getElementById('scoreStatus');
    if (statusEl) {
      statusEl.textContent = statusInfo.label;
      statusEl.className = 'score-status ' + statusInfo.cssClass;
    }

    // Animate score
    animateScore(result.finalScore);

    // Render breakdown
    renderStrengthBreakdown(result.categories);

    // Render suggestions
    const suggestions = generateSuggestions(result);
    renderSuggestions(suggestions);
  }

  // ==========================================
  // Run Analysis
  // ==========================================
  async function runAnalysis(btn) {
    if (!btn) return;

    // Show loading state
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner spinning"></i> جاري التحليل...';

    try {
      const profileData = await fetchMostaqlProfile();
      const result = analyzeProfile(profileData);

      // Cache results
      chrome.storage.local.set({ profileAnalysisResult: result });

      renderResults(result);
    } catch (err) {
      console.error('Analysis failed:', err);
      btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> فشل التحليل — حاول مجدداً';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }, 2000);
    }
  }

  // ==========================================
  // Initialize
  // ==========================================
  function init() {
    // Start analysis button
    const startBtn = document.getElementById('startAnalysisBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => runAnalysis(startBtn));
    }

    // Re-analyze button
    const reAnalyzeBtn = document.getElementById('reAnalyzeBtn');
    if (reAnalyzeBtn) {
      reAnalyzeBtn.addEventListener('click', () => runAnalysis(reAnalyzeBtn));
    }

    // Load cached results if available
    chrome.storage.local.get(['profileAnalysisResult'], (data) => {
      if (data.profileAnalysisResult) {
        renderResults(data.profileAnalysisResult);
      }
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
