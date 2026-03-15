// ==========================================
// dashboard/tabs.js — Sidebar tab switching
// ==========================================

function setupTabSwitching() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContainers = document.querySelectorAll('.tab-container');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.dataset.tab;
            if (!tabId) return;

            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            tabContainers.forEach(container => {
                container.classList.add('hidden');
                if (container.id === `${tabId}-tab`) {
                    container.classList.remove('hidden');
                }
            });
        });
    });
}
