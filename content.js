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
        trackBtn.title = 'مراقبة المشروع';
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
                    li.className = 'prompt-li'; // Add class for styling
                    if (mainBtn.dataset.promptId === p.id) {
                        li.classList.add('active');
                    }

                    // Flex container for the list item
                    const itemContainer = document.createElement('div');
                    itemContainer.style.display = 'flex';
                    itemContainer.style.alignItems = 'center';
                    itemContainer.style.justifyContent = 'space-between';
                    itemContainer.style.width = '100%';

                    // 1. Select Action (Title)
                    const a = document.createElement('a');
                    a.href = 'javascript:void(0);';
                    a.textContent = p.title;
                    a.style.flex = '1'; // Take remaining space
                    a.style.padding = '5px 10px';
                    a.style.color = 'inherit';
                    a.style.textDecoration = 'none';
                    a.onclick = (e) => {
                        e.preventDefault();
                        // Update state
                        mainBtn.dataset.promptId = p.id;
                        mainBtn.title = `استخدام القالب: ${p.title}`;

                        // Execute immediately
                        handleChatGptClick(p.id);

                        group.classList.remove('open');
                        renderMenu();
                    };

                    // 2. Edit Action (Icon)
                    const editBtn = document.createElement('span');
                    editBtn.innerHTML = '<i class="fa fa-pencil"></i>';
                    editBtn.style.cursor = 'pointer';
                    editBtn.style.padding = '5px 10px';
                    editBtn.style.color = '#777';
                    editBtn.title = 'تعديل القالب';
                    editBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent selecting the prompt
                        group.classList.remove('open');
                        createPromptModal(renderMenu, p);
                    };
                    editBtn.onmouseover = () => editBtn.style.color = '#2386c8';
                    editBtn.onmouseout = () => editBtn.style.color = '#777';

                    itemContainer.appendChild(a);
                    itemContainer.appendChild(editBtn); // Add edit button

                    li.appendChild(itemContainer);
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
                    createPromptModal((newId) => {
                        // Auto-select the newly created prompt
                        if (newId) {
                            mainBtn.dataset.promptId = newId;
                            // Update info
                            loadPrompts((prompts) => {
                                const p = prompts.find(x => x.id === newId);
                                if (p) {
                                    mainBtn.title = `استخدام القالب: ${p.title}`;
                                }
                                renderMenu();
                            });
                        } else {
                            renderMenu();
                        }
                    }, null);
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

function handleTrackClick(btn) {
    const projectId = getProjectId();
    if (!projectId) return;

    chrome.storage.local.get(['trackedProjects'], (data) => {
        let tracked = data.trackedProjects || {};
        if (tracked[projectId]) {
            // Remove from tracking
            delete tracked[projectId];
            setButtonUntracked(btn);
        } else {
            // Add to tracking
            tracked[projectId] = extractProjectData();
            tracked[projectId].id = projectId;
            setButtonTracked(btn);
        }
        chrome.storage.local.set({ trackedProjects: tracked });
    });
}

function setButtonTracked(btn) {
    btn.innerHTML = '<i class="fa fa-fw fa-check-circle"></i> مُراقبة';
    btn.className = 'btn btn-warning'; // Change color to indicate active state
    btn.title = 'إلغاء المراقبة';
}

function setButtonUntracked(btn) {
    btn.innerHTML = '<i class="fa fa-fw fa-eye"></i> مراقبة المشروع';
    btn.className = 'btn btn-success';
    btn.title = 'مراقبة هذا المشروع';
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
            .replace(/{description}/g, description)
            .replace(/{tags}/g, projectData.tags)
            .replace(/{client_name}/g, projectData.clientName)
            .replace(/{budget}/g, projectData.budget)
            .replace(/{duration}/g, projectData.duration)
            .replace(/{publish_date}/g, projectData.publishDate)
            .replace(/{project_status}/g, projectData.status)
            .replace(/{project_id}/g, projectData.id)
            .replace(/{category}/g, projectData.category)
            .replace(/{hiring_rate}/g, projectData.hiringRate)
            .replace(/{open_projects}/g, projectData.openProjects)
            .replace(/{underway_projects}/g, projectData.underwayProjects)
            .replace(/{client_joined}/g, projectData.clientJoined)
            .replace(/{client_type}/g, projectData.clientType);

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

    // Extract Meta Data (Communications, Duration, Budget, Publish Date)
    let communications = '0';
    let duration = 'غير محدد';
    let budget = 'غير محدد';
    let publishDate = 'غير معروف';

    const metaRows = document.querySelectorAll('.meta-row, .table-meta tr');
    metaRows.forEach(row => {
        const label = row.querySelector('.meta-label, td:first-child')?.textContent.trim();
        const value = row.querySelector('.meta-value, td:last-child')?.textContent.trim();

        if (label && value) {
            if (label.includes('التواصلات الجارية')) {
                communications = value;
            } else if (label.includes('مدة التنفيذ')) {
                duration = value;
            } else if (label.includes('الميزانية')) {
                budget = value;
            } else if (label.includes('تاريخ النشر')) {
                publishDate = value;
            }
        }
    });

    // Fallback/Specific selectors
    const budgetEl = document.querySelector('[data-type="project-budget_range"]');
    if (budgetEl) budget = budgetEl.textContent.trim();

    const timeEl = document.querySelector('time[itemprop="datePublished"]');
    if (timeEl) publishDate = timeEl.textContent.trim();

    // Client Name
    const clientNameEl = document.querySelector('.profile__name bdi');
    const clientName = clientNameEl ? clientNameEl.textContent.trim() : 'غير معروف';

    // Project ID
    const projectId = getProjectId();

    // Category
    const categoryEl = document.querySelector('.breadcrumb-item[data-index="2"]');
    const category = categoryEl ? categoryEl.textContent.trim() : 'غير معروف';

    // Client Metrics & Info
    let openProjects = '0';
    let underwayProjects = '0';
    let clientJoined = 'غير معروف';
    let hiringRate = 'غير معروف';
    let clientType = 'صاحب عمل';

    const clientCard = document.querySelector('.profile_card');
    if (clientCard) {
        // Table info
        const clientRows = clientCard.querySelectorAll('.table-meta tr');
        clientRows.forEach(row => {
            const label = row.querySelector('td:first-child')?.textContent.trim();
            const value = row.querySelector('td:last-child')?.textContent.trim();
            if (label && value) {
                if (label.includes('معدل التوظيف')) hiringRate = value;
                else if (label.includes('المشاريع المفتوحة')) openProjects = value;
                else if (label.includes('مشاريع قيد التنفيذ')) underwayProjects = value;
                else if (label.includes('تاريخ التسجيل')) clientJoined = value;
            }
        });

        // Client Type (from meta items list)
        const typeEl = clientCard.querySelector('.meta_items li');
        if (typeEl) clientType = typeEl.textContent.trim();
    }

    // Tags
    const tags = Array.from(document.querySelectorAll('.skills .tag'))
        .map(tag => tag.textContent.trim())
        .join(', ');

    const title = document.querySelector('.heada__title span[data-type="page-header-title"]')?.textContent.trim() || document.title;

    return {
        id: projectId,
        status,
        communications,
        title,
        url: window.location.href,
        lastChecked: new Date().toISOString(),
        duration,
        budget,
        publishDate,
        clientName,
        tags,
        category,
        hiringRate,
        openProjects,
        underwayProjects,
        clientJoined,
        clientType
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
    
الميزانية: {budget}
مدة التنفيذ: {duration}
تاريخ النشر: {publish_date}
صاحب العمل: {client_name}
الوسوم: {tags}
حالة المشروع: {project_status}

تفاصيل المشروع:
{description}
    
رابط المشروع: {url}
    
يرجى كتابة عرض احترافي ومقنع يوضح خبرتي في هذا المجال ويشرح كيف يمكنني تنفيذ المطلوب بدقة.`
        }
    ];
}

function loadPrompts(callback) {
    chrome.storage.local.get(['prompts'], (data) => {
        const storedPrompts = data.prompts || [];
        const defaultPrompts = getDefaultPrompts();

        // Merge strategy: Start with defaults, override/add with stored
        let merged = [...defaultPrompts];

        storedPrompts.forEach(p => {
            const index = merged.findIndex(m => m.id === p.id);
            if (index !== -1) {
                merged[index] = p; // Override
            } else {
                merged.push(p); // Add new
            }
        });

        callback(merged);
    });
}

function savePrompt(promptData, callback) {
    chrome.storage.local.get(['prompts'], (data) => {
        let prompts = data.prompts || [];
        let savedId = promptData.id;

        if (savedId) {
            // Edit existing
            const index = prompts.findIndex(p => p.id === savedId);
            if (index !== -1) {
                prompts[index] = { ...prompts[index], ...promptData };
            } else {
                prompts.push(promptData);
            }
        } else {
            // New Prompt
            savedId = crypto.randomUUID();
            const newPrompt = {
                id: savedId,
                title: promptData.title,
                content: promptData.content,
                createdAt: new Date().toISOString()
            };
            prompts.push(newPrompt);
        }

        chrome.storage.local.set({ prompts }, () => {
            if (callback) callback(savedId);
        });
    });
}

function createPromptModal(onSave, existingPrompt = null) {
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
    if (existingPrompt) titleInput.value = existingPrompt.title;

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
    contentHelp.textContent = 'المتغيرات المتاحة: {title}, {description}, {url}, {tags}, {client_name}, {client_type}, {budget}, {duration}, {publish_date}, {project_id}, {project_status}, {category}, {hiring_rate}, {open_projects}, {underway_projects}, {client_joined}';

    const contentInput = document.createElement('textarea');
    contentInput.className = 'mostaql-form-textarea';
    contentInput.rows = '6';
    if (existingPrompt) contentInput.value = existingPrompt.content;

    groupContent.appendChild(contentLabel);
    groupContent.appendChild(contentInput);
    groupContent.appendChild(contentHelp);

    // Buttons
    const btnContainer = document.createElement('div');
    btnContainer.className = 'mostaql-modal-actions';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = existingPrompt ? 'حفظ التعديلات' : 'حفظ القالب';
    saveBtn.className = 'btn-modal-primary';
    saveBtn.onclick = () => {
        const t = titleInput.value.trim();
        const c = contentInput.value.trim();
        if (t && c) {
            saveBtn.textContent = 'جاري الحفظ...';
            saveBtn.disabled = true;

            const promptData = {
                title: t,
                content: c
            };
            if (existingPrompt) promptData.id = existingPrompt.id;

            savePrompt(promptData, (savedId) => {
                document.body.removeChild(modalOverlay);
                if (onSave) onSave(savedId);
            });
        }
        else {
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

