// ==========================================
// dashboard/contributors.js — GitHub contributors fetching & rendering
// ==========================================

const REPOSITORY_CONTRIBUTOR = {
    login: 'MohamedMostafa21',
    avatar_url: 'https://github.com/MohamedMostafa21.png?size=108',
    html_url: 'https://github.com/MohamedMostafa21',
    contributions: 1
};

function includeRepositoryContributor(contributors) {
    const alreadyIncluded = contributors.some(
        user => user.login?.toLowerCase() === REPOSITORY_CONTRIBUTOR.login.toLowerCase()
    );
    return alreadyIncluded ? contributors : [...contributors, REPOSITORY_CONTRIBUTOR];
}

function renderContributors(listEl, contributors) {
    listEl.innerHTML = '';

    if (contributors.length === 0) {
        listEl.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">لا يوجد مساهمون حالياً.</p>';
        return;
    }

    contributors.forEach(user => {
        const card = document.createElement('div');
        card.className = 'about-card';
        card.innerHTML = `
            <div class="profile-header">
                <img src="${user.avatar_url}" alt="${user.login}" class="profile-avatar" style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover;">
                <div class="profile-info">
                    <h3>${user.login}</h3>
                    <p style="font-size: 12px; color: var(--text-muted);">${user.contributions} مساهمة</p>
                </div>
            </div>
            <div class="profile-social">
                <a href="${user.html_url}" target="_blank" rel="noopener noreferrer" class="social-btn github">
                    <i class="fab fa-github"></i>
                    GitHub
                </a>
            </div>
        `;
        listEl.appendChild(card);
    });
}

async function loadContributors() {
    const listEl = document.getElementById('contributors-list');
    if (!listEl) return;

    try {
        const response = await fetch('https://api.github.com/repos/MohamedMostafa21/Frelancia/contributors');
        if (!response.ok) throw new Error('Failed to fetch contributors');

        const githubContributors = await response.json();
        renderContributors(listEl, includeRepositoryContributor(githubContributors));
    } catch (err) {
        console.error('Error fetching contributors:', err);
        listEl.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 20px;">
                <p style="color: var(--danger);">عذراً، تعذر تحميل قائمة المساهمين حالياً.</p>
                <button class="btn-primary btn-retry-contributors" style="margin-top: 10px; padding: 8px 16px; font-size: 12px;">إعادة المحاولة</button>
            </div>
        `;
        setupContributorsListeners();
    }
}

function setupContributorsListeners() {
    const list = document.getElementById('contributors-list');
    if (!list || list.dataset.listenerSet) return;
    list.addEventListener('click', (e) => {
        if (e.target.closest('.btn-retry-contributors')) loadContributors();
    });
    list.dataset.listenerSet = "true";
}
