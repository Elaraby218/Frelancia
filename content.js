// ==========================================
// Mostaql Project Tracker - Content Script
// ==========================================

function isContextValid() {
    return !!chrome.runtime && !!chrome.runtime.id;
}

function injectTrackButton() {
    // Look for the action buttons in the header
    const actionContainer = document.querySelector('.header_action-wide-container');
    if (!actionContainer) return;

    // --- Container for Extension Buttons ---
    let buttonContainer = document.getElementById('mostaql-ext-btn-container');
    if (!buttonContainer) {
        buttonContainer = document.createElement('div');
        buttonContainer.id = 'mostaql-ext-btn-container';
        // Note: Styles are now handled by #mostaql-ext-btn-container in content.css

        // Find the main "Apply" button or similar primary action. 
        // Also look for '.btn-info' because "Edit Deal" (طلب تعديل الصفقة) uses btn-info.
        let primaryBtn = actionContainer.querySelector('a.btn-primary, button.btn-primary, .btn-primary, a.btn-info, button.btn-info, .btn-info');

        // FIX: If the button is part of a btn-group (Split Button), target the group wrapper 
        // to avoid inserting our buttons INSIDE the native button group.
        if (primaryBtn && primaryBtn.parentElement && primaryBtn.parentElement.classList.contains('btn-group')) {
            primaryBtn = primaryBtn.parentElement;
        }

        if (primaryBtn) {
            // Re-insert BEFORE (The "Opposite")
            primaryBtn.insertAdjacentElement('beforebegin', buttonContainer);

            // Ensure the parent container flexes correctly
            if (primaryBtn.parentElement) {
                const parent = primaryBtn.parentElement;

                // Minimal inline override to ensure flex behavior
                parent.style.display = 'flex';
                parent.style.alignItems = 'center';

                // Reset primary button constraints (now applied to the group if it was a group)
                primaryBtn.style.float = 'none';
                primaryBtn.style.marginLeft = '0px';
                primaryBtn.style.marginRight = '0px';
            }
        } else {
            // Fallback
            actionContainer.appendChild(buttonContainer);
            if (actionContainer) {
                actionContainer.style.display = 'flex';
                actionContainer.style.alignItems = 'center';
            }
        }
    }

    // START CHECKPOINT: Clear any old/legacy elements (like the separate select box) 
    // to ensure only the new Split Button and Track Button exist.
    // We only do this if we haven't already injected the correct group (to avoid clearing on every potential re-run if logic changes).
    if (buttonContainer && !document.getElementById('chatgpt-group')) {
        buttonContainer.innerHTML = '';
    }

    // --- Track Button ---
    if (!document.getElementById('track-project-btn')) {
        const trackBtn = document.createElement('button');
        trackBtn.id = 'track-project-btn';
        trackBtn.className = 'btn btn-success'; // Base Mostaql class + our overrides
        trackBtn.innerHTML = '<i class="fa fa-fw fa-eye"></i> مراقبة المشروع';
        // Order handled by DOM position now usually, or CSS

        // Check if already tracked
        const projectId = getProjectId();
        if (isContextValid()) {
            chrome.storage.local.get(['trackedProjects'], (data) => {
                if (chrome.runtime.lastError) return;
                const tracked = data.trackedProjects || {};
                if (tracked[projectId]) {
                    setButtonTracked(trackBtn);
                }
            });
        }

        trackBtn.addEventListener('click', () => {
            handleTrackClick(trackBtn);
        });

        buttonContainer.appendChild(trackBtn);
    }

    // --- ChatGPT Split Button ---
    if (!document.getElementById('chatgpt-group')) {
        const chatGptGroupId = 'chatgpt-group';

        // Create Button Group Wrapper
        const group = document.createElement('div');
        group.id = chatGptGroupId;
        group.className = 'btn-group dropdown mostaql-custom-dropdown';
        // Default Bootstrap behavior


        // 1. Main Action Button (Anchor to match Mostaql's "Apply" button structure)
        const mainBtn = document.createElement('a');
        mainBtn.id = 'chatgpt-main-btn';
        mainBtn.className = 'btn btn-primary';
        mainBtn.href = 'javascript:void(0);';
        mainBtn.innerHTML = '<i class="fa fa-fw fa-comments-o"></i> <span class="action-text">استشارة AI</span>';
        mainBtn.title = 'استخدام القالب الافتراضي أو المحدد';

        // Store selected prompt info in dataset
        mainBtn.dataset.promptId = 'default_proposal';

        mainBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Visual feedback
            mainBtn.style.opacity = '0.8';
            setTimeout(() => mainBtn.style.opacity = '1', 200);

            handleChatGptClick(mainBtn.dataset.promptId);
        });

        // 2. Dropdown Toggle Button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'chatgpt-dropdown-toggle';
        toggleBtn.className = 'btn btn-primary dropdown-toggle';
        toggleBtn.innerHTML = '<i class="fa fa-caret-down"></i>';
        toggleBtn.setAttribute('data-toggle', 'dropdown');

        // Custom Toggle Logic
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            group.classList.toggle('open');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!group.contains(e.target)) {
                group.classList.remove('open');
            }
        });

        // 3. Dropdown Menu List
        const menuList = document.createElement('ul');
        menuList.className = 'dropdown-menu dropdown-left dropdown-menu-left'; // Exact matches
        menuList.setAttribute('role', 'menu');

        // Function to render menu items
        const renderMenu = () => {
            loadPrompts((prompts) => {
                menuList.innerHTML = '';

                prompts.forEach((p, index) => {
                    const li = document.createElement('li');
                    if (mainBtn.dataset.promptId === p.id) {
                        li.className = 'active'; // Mark current as active
                    }

                    const a = document.createElement('a');
                    a.href = 'javascript:void(0);';
                    a.textContent = p.title;
                    a.onclick = (e) => {
                        e.preventDefault();
                        mainBtn.dataset.promptId = p.id; // Update current selection
                        mainBtn.title = `استخدام القالب: ${p.title}`;

                        group.classList.remove('open');
                        renderMenu(); // Re-render to update active class
                    };

                    li.appendChild(a);
                    menuList.appendChild(li);
                });

                // Separator
                const divLi = document.createElement('li');
                divLi.className = 'divider';
                menuList.appendChild(divLi);

                // Add New Prompt
                const addLi = document.createElement('li');
                const addLink = document.createElement('a');
                addLink.href = 'javascript:void(0);';
                addLink.innerHTML = '<i class="fa fa-plus"></i> إضافة قالب جديد';
                addLink.onclick = (e) => {
                    e.preventDefault();
                    group.classList.remove('open');
                    createPromptModal(renderMenu);
                };
                addLi.appendChild(addLink);
                menuList.appendChild(addLi);
            });
        };

        // Initial Render
        renderMenu();

        group.appendChild(mainBtn);
        group.appendChild(toggleBtn);
        group.appendChild(menuList);

        buttonContainer.appendChild(group);
    }
}

function handleChatGptClick(promptId) {
    const projectData = extractProjectData(); // Gets title and url
    const description = getProjectDescription();

    if (!description) {
        alert('لم يتم العثور على وصف المشروع.');
        return;
    }

    loadPrompts((prompts) => {
        let templateContent = '';
        const selectedPrompt = prompts.find(p => p.id === promptId);

        if (selectedPrompt) {
            templateContent = selectedPrompt.content;
        } else {
            // Fallback
            const defaults = getDefaultPrompts();
            templateContent = defaults[0].content;
        }

        // Replace variables
        let prompt = templateContent
            .replace(/{title}/g, projectData.title)
            .replace(/{url}/g, projectData.url)
            .replace(/{description}/g, description);

        // Save prompt to storage for the ChatGPT content script to pick up
        chrome.storage.local.set({ 'pendingChatGptPrompt': prompt }, () => {
            // Open ChatGPT in a new tab
            window.open('https://chatgpt.com/', '_blank');
        });
    });
}

function getProjectId() {
    const match = window.location.pathname.match(/\/project\/(\d+)/);
    return match ? match[1] : null;
}

function extractProjectData() {
    // Extract Status
    const statusLabel = document.querySelector('.label-prj-open, .label-prj-closed, .label-prj-completed, .label-prj-cancelled, .label-prj-underway, .label-prj-processing');
    const status = statusLabel ? statusLabel.textContent.trim() : 'غير معروف';

    // Extract Ongoing Communications (التواصلات الجارية)
    // Looking for the table row that contains "التواصلات الجارية"
    let communications = '0';
    const metaRows = document.querySelectorAll('.meta-row, .table-meta tr');
    metaRows.forEach(row => {
        if (row && row.textContent.includes('التواصلات الجارية')) {
            const val = row.querySelector('.meta-value, td:last-child');
            if (val) {
                communications = val.textContent.trim();
            }
        }
    });

    const title = document.querySelector('.heada__title span[data-type="page-header-title"]')?.textContent.trim() || document.title;

    return {
        status,
        communications,
        title,
        url: window.location.href,
        lastChecked: new Date().toISOString()
    };
}

function getProjectDescription() {
    // Select the project description text area
    const descriptionElement = document.querySelector('#project-brief .text-wrapper-div, #projectDetailsTab .text-wrapper-div');
    if (descriptionElement) {
        return descriptionElement.innerText.trim();
    }
    return '';
}

// --- Prompt Management ---

function getDefaultPrompts() {
    return [
        {
            id: 'default_proposal',
            title: 'كتابة عرض مشروع',
            content: `أريد مساعدتك في كتابة عرض لهذا المشروع على منصة مستقل.
    
عنوان المشروع: {title}
    
تفاصيل المشروع:
{description}
    
رابط المشروع: {url}
    
يرجى كتابة عرض احترافي ومقنع يوضح خبرتي في هذا المجال ويشرح كيف يمكنني تنفيذ المطلوب بدقة.`
        }
    ];
}

function loadPrompts(callback) {
    chrome.storage.local.get(['customPrompts'], (data) => {
        const custom = data.customPrompts || [];
        const defaults = getDefaultPrompts();
        callback([...defaults, ...custom]);
    });
}

function savePrompt(title, content, callback) {
    chrome.storage.local.get(['customPrompts'], (data) => {
        const custom = data.customPrompts || [];
        custom.push({
            id: 'custom_' + Date.now(),
            title: title,
            content: content
        });
        chrome.storage.local.set({ customPrompts: custom }, callback);
    });
}

function createPromptModal(onSave) {
    if (document.getElementById('mostaql-prompt-modal')) return;

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'mostaql-prompt-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'mostaql-modal-content';

    // Title Input
    const groupTitle = document.createElement('div');
    groupTitle.className = 'mostaql-form-group';

    const titleLabel = document.createElement('label');
    titleLabel.className = 'mostaql-form-label';
    titleLabel.textContent = 'عنوان القالب:';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'mostaql-form-input';

    groupTitle.appendChild(titleLabel);
    groupTitle.appendChild(titleInput);

    // Content Input
    const groupContent = document.createElement('div');
    groupContent.className = 'mostaql-form-group';

    const contentLabel = document.createElement('label');
    contentLabel.className = 'mostaql-form-label';
    contentLabel.textContent = 'محتوى القالب:';

    const contentHelp = document.createElement('div');
    contentHelp.className = 'mostaql-form-help';
    contentHelp.textContent = 'المتغيرات المتاحة: {title}, {description}, {url}';

    const contentInput = document.createElement('textarea');
    contentInput.className = 'mostaql-form-textarea';
    contentInput.rows = '6';

    groupContent.appendChild(contentLabel);
    groupContent.appendChild(contentInput);
    groupContent.appendChild(contentHelp);

    // Buttons
    const btnContainer = document.createElement('div');
    btnContainer.className = 'mostaql-modal-actions';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'حفظ القالب';
    saveBtn.className = 'btn-modal-primary';
    saveBtn.onclick = () => {
        const t = titleInput.value.trim();
        const c = contentInput.value.trim();
        if (t && c) {
            saveBtn.textContent = 'جاري الحفظ...';
            saveBtn.disabled = true;
            savePrompt(t, c, () => {
                document.body.removeChild(modalOverlay);
                onSave();
            });
        } else {
            alert('يرجى ملء جميع الحقول');
        }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'إلغاء';
    cancelBtn.className = 'btn-modal-secondary';
    cancelBtn.onclick = () => {
        document.body.removeChild(modalOverlay);
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);

    modalContent.appendChild(groupTitle);
    modalContent.appendChild(groupContent);
    modalContent.appendChild(btnContainer);

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
}


// Initial injection
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectTrackButton);
} else {
    injectTrackButton();
}

