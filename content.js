// ==========================================
// Mostaql Project Tracker - Content Script
// ==========================================

function isContextValid() {
    try {
        // Accessing chrome.runtime.id will throw "Extension context invalidated"
        // if the background connection is dead.
        return typeof chrome !== 'undefined' &&
            !!chrome.runtime &&
            !!chrome.runtime.id &&
            !!chrome.storage;
    } catch (e) {
        return false;
    }
}

function checkForAutofill() {
    console.log('Mostaql Ext: Checking for pending autofill...');
    handleAutofillSequence();
}

let lastPath = '';
let observerStarted = false;

function getPageType() {
    const path = location.pathname;
    if (/\/project[s]?\/\d+/.test(path)) return 'project';
    if (/\/messages/.test(path)) return 'messages';
    if (/\/profile/.test(path)) return 'profile';
    if (path === '/' || path === "") return 'home';
    return 'other';
}


function handleAutofillSequence() {
    if (!isContextValid()) return;

    chrome.storage.local.get(['mostaql_pending_autofill'], (data) => {
        const autofill = data.mostaql_pending_autofill;
        if (!autofill) return;

        // Verify it's for the current project
        const currentProjectId = getProjectId();
        if (autofill.projectId !== currentProjectId) {
            console.log('Autofill project ID mismatch, skipping.');
            return;
        }

        // Check if data is fresh (last 5 minutes)
        if (Date.now() - autofill.timestamp > 5 * 60 * 1000) {
            console.log('Autofill data expired, skipping.');
            chrome.storage.local.remove(['mostaql_pending_autofill']);
            return;
        }

        console.log('Found pending autofill data:', autofill);

        // Wait for form elements
        let attempts = 0;
        const maxAttempts = 20; // 10 seconds total

        const interval = setInterval(() => {
            // Flexible selectors for Amount - Prioritize name attribute
            const amountInput = document.querySelector('input[name="cost"]') ||
                document.querySelector('input[name="amount"]') ||
                document.querySelector('#bid__cost') ||
                document.querySelector('#amount');

            // Flexible selectors for Duration - Prioritize name attribute
            const durationInput = document.querySelector('input[name="period"]') ||
                document.querySelector('input[name="duration"]') ||
                document.querySelector('#bid__period') ||
                document.querySelector('#duration');

            if (amountInput && durationInput) {
                clearInterval(interval);
                // Ensure inputs are visible/interactive
                amountInput.focus();
                durationInput.focus();
                fillForm(amountInput, durationInput, autofill);
            } else {
                attempts++;
                if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    console.log('Mostaql Ext: Bid form elements not found after 10 seconds.');
                }
            }
        }, 500);
    });
}

function fillForm(amountInput, durationInput, data) {
    console.log(`Filling form: Amount=${data.amount}, Duration=${data.duration}`);

    // Improved event trigger sequence
    const triggerEvents = (el) => {
        el.dispatchEvent(new Event('focus', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // Key events might be needed for some validation logic
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));

        // Some frameworks require 'blur' to commit state or trigger calculations (like earnings)
        setTimeout(() => {
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        }, 50);
    };

    // Fill values
    let amountToFill = data.amount;

    // Fallback: If amount is missing/0, try to parse from the page directly
    if (!amountToFill || amountToFill === 0) {
        amountToFill = getBudgetFromPage();
        if (amountToFill > 0) {
            console.log('Mostaql Ext: Autofill budget fallback used:', amountToFill);
        }
    }

    if (amountToFill > 0) {
        amountInput.focus();
        amountInput.value = amountToFill;
        amountInput.classList.add('mostaql-autofilled');
        triggerEvents(amountInput);
    }

    setTimeout(() => {
        if (data.duration > 0) {
            durationInput.focus();
            durationInput.value = data.duration;
            durationInput.classList.add('mostaql-autofilled');
            triggerEvents(durationInput);
        }

        // Fill Proposal content
        if (data.proposal) {
            const proposalTextarea = document.querySelector('#bid__details') ||
                document.querySelector('#description') ||
                document.querySelector('textarea[name="details"]') ||
                document.querySelector('textarea[name="description"]') ||
                document.querySelector('#proposal-description');
            if (proposalTextarea) {
                proposalTextarea.focus();
                proposalTextarea.value = data.proposal;
                proposalTextarea.classList.add('mostaql-autofilled');
                triggerEvents(proposalTextarea);
            }
        }
    }, 100);

    // Scroll to the form
    const form = document.querySelector('#add-proposal-form') || amountInput.closest('form') || amountInput.parentElement;
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Show Toast Notification
        const toast = document.createElement('div');
        toast.className = 'mostaql-autofill-toast';
        toast.innerHTML = '<i class="fa fa-magic"></i> <span>تم تعبئة تفاصيل العرض تلقائياً!</span>';
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 5000);
    }

    // Cleanup: Remove used autofill data
    chrome.storage.local.remove(['mostaql_pending_autofill']);
}

function injectTrackButton() {
    // Target: Bottom of Project Card section (بطاقة المشروع) in the sidebar
    const metaCardBody = document.querySelector('#project-meta-panel');
    if (!metaCardBody) return;

    // --- Container for Extension Buttons ---
    let buttonContainer = document.getElementById('mostaql-ext-btn-container');

    // Ensure it's in the right place
    if (buttonContainer && buttonContainer.parentElement !== metaCardBody) {
        buttonContainer.remove();
        buttonContainer = null;
    }

    if (!buttonContainer) {
        // Add a separator before the buttons if it doesn't exist
        if (!metaCardBody.querySelector('.mostaql-ext-separator')) {
            const hr = document.createElement('hr');
            hr.className = 'separator mostaql-ext-separator';
            metaCardBody.appendChild(hr);
        }

        buttonContainer = document.createElement('div');
        buttonContainer.id = 'mostaql-ext-btn-container';
        buttonContainer.className = 'mostaql-ext-sidebar-container';
        metaCardBody.appendChild(buttonContainer);
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
        trackBtn.className = 'btn btn-success';
        trackBtn.innerHTML = '<i class="fa fa-fw fa-eye"></i> <span class="action-text">مراقبة</span>';
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

    // --- Fast Apply (Quick) Button ---
    if (!document.getElementById('header-quick-bid-btn')) {
        const quickBtn = document.createElement('button');
        quickBtn.id = 'header-quick-bid-btn';
        quickBtn.className = 'btn btn-success';
        quickBtn.innerHTML = '<i class="fa fa-fw fa-bolt"></i> <span class="action-text">سريع</span>';
        quickBtn.title = 'تعبئة العرض الافتراضي والميزانية الدنيا';

        quickBtn.addEventListener('click', () => {
            handleQuickBidClick();
        });

        buttonContainer.appendChild(quickBtn);
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
        mainBtn.innerHTML = '<i class="fa fa-fw fa-magic"></i> <span class="action-text">ذكاء</span>';
        mainBtn.title = 'استشارة الذكاء الاصطناعي';

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

                        // Execute immediately without changing main button 
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
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
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
    btn.innerHTML = '<i class="fa fa-fw fa-check-circle"></i> <span class="action-text">مُراقبة</span>';
    btn.className = 'btn btn-warning'; // Change color to indicate active state
    btn.title = 'إلغاء المراقبة';
}

function setButtonUntracked(btn) {
    btn.innerHTML = '<i class="fa fa-fw fa-eye"></i> <span class="action-text">مراقبة</span>';
    btn.className = 'btn btn-success';
    btn.title = 'مراقبة هذا المشروع';
}

function handleChatGptClick(promptId) {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
    console.log('handleChatGptClick called with ID:', promptId);

    const projectData = extractProjectData(); // Gets title and url
    // ...
    const description = getProjectDescription();

    console.log('--- Mostaql Ext Data Debug ---');
    console.log('Title:', projectData.title);
    console.log('URL:', projectData.url);
    console.log('Description:', description);
    console.log('Tags:', projectData.tags);
    console.log('Client Name:', projectData.clientName);
    console.log('Budget:', projectData.budget);
    console.log('Duration:', projectData.duration);
    console.log('Publish Date:', projectData.publishDate);
    console.log('Status:', projectData.status);
    console.log('Project ID:', projectData.id);
    console.log('Category:', projectData.category);
    console.log('Hiring Rate:', projectData.hiringRate);
    console.log('Open Projects:', projectData.openProjects);
    console.log('Underway Projects:', projectData.underwayProjects);
    console.log('Client Joined:', projectData.clientJoined);
    console.log('Client Type:', projectData.clientType);
    console.log('Communications:', projectData.communications);
    console.log('------------------------------');

    if (!description) {
        alert('لم يتم العثور على وصف المشروع.');
        return;
    }

    loadPrompts((prompts) => {
        let templateContent = '';
        const selectedPrompt = prompts.find(p => p.id === promptId);
        console.log('Prompts loaded:', prompts.length);
        console.log('Selected prompt found:', !!selectedPrompt);

        if (selectedPrompt) {
            templateContent = selectedPrompt.content;
            processTemplate(templateContent);
        } else if (promptId === 'default_proposal') {
            console.warn('Default prompt not modified/found locally, fetching original default.');
            chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
                const defaults = (response && response.prompts) ? response.prompts : [];
                // Find "default_proposal" in defaults
                const def = defaults.find(d => d.id === 'default_proposal');
                if (def) {
                    processTemplate(def.content);
                } else {
                    alert('خطأ: تعذر تحميل القالب الافتراضي.');
                }
            });
            return;
        } else {
            console.error('Prompt ID not found:', promptId);
            alert('خطأ: لم يتم العثور على القالب المحدد (ID: ' + promptId + '). تحقق من قائمة الأوامر.');
            return;
        }

        function processTemplate(content) {

            // Replace variables
            let prompt = content
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
                // Open ChatGPT (or custom URL)
                chrome.storage.local.get(['settings'], (result) => {
                    const settings = result.settings || {};
                    const url = settings.aiChatUrl || 'https://chatgpt.com/';
                    window.open(url, 'mostaql_ai_chat');
                });
            });
        } // End processTemplate

    }); // End loadPrompts callback
}

function handleQuickBidClick() {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
    console.log('Mostaql Ext: Fast Apply (Quick) clicked.');

    const projectId = getProjectId();
    if (!projectId) return;

    // Get default data
    chrome.storage.local.get(['proposalTemplate'], (data) => {
        const proposal = data.proposalTemplate || `اطلعت على مشروعك وفهمت متطلباته جيدا، واذا انني قادر على تقديم العمل بطريقة منظمة وواضحة. احرص على الدقة لضمان ان تكون النتيجة مرضية تماما لك.

متحمس لبدء التعاون معك، واذاك بتنفيذ العمل بشكل سلس ومرتب. في انتظار تواصلك لترتيب التفاصيل والانطلاق مباشرة.`;

        const minBudget = getBudgetFromPage();
        const projectData = extractProjectData();

        // Duration: Extract number if possible
        let durationDays = 0;
        if (projectData.duration) {
            const match = projectData.duration.match(/\d+/);
            if (match) durationDays = parseInt(match[0]);
            else if (projectData.duration.includes("يوم واحد")) durationDays = 1;
        }

        const autofillData = {
            projectId: projectId,
            amount: minBudget,
            duration: durationDays,
            proposal: proposal,
            timestamp: Date.now()
        };

        // Reuse the handleAutofillSequence logic
        chrome.storage.local.set({ 'mostaql_pending_autofill': autofillData }, () => {
            handleAutofillSequence();
        });
    });
}

function getProjectId() {
    const match = window.location.pathname.match(/\/project\/(\d+)/);
    return match ? match[1] : '';
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

    const title = document.querySelector('.heada__title span[data-type="page-header-title"]')?.textContent.trim() || document.title || 'مشروع غير معنون';

    return {
        id: projectId || '',
        status: status || 'غير معروف',
        communications: communications || '0',
        title: title,
        url: window.location.href,
        lastChecked: new Date().toISOString(),
        duration: duration || 'غير محدد',
        budget: budget || 'غير محدد',
        publishDate: publishDate || 'غير معروف',
        clientName: clientName || 'غير معروف',
        tags: tags || '',
        category: category || 'عام',
        hiringRate: hiringRate || 'غير متوفر',
        openProjects: openProjects || '0',
        underwayProjects: underwayProjects || '0',
        clientJoined: clientJoined || 'غير معروف',
        clientType: clientType || 'صاحب عمل'
    };
}

function getProjectDescription() {
    let description = '';

    // 1. Main brief/description paragraph
    const briefElement = document.querySelector('#project-brief .text-wrapper-div, #projectDetailsTab > .pdn--am > .text-wrapper-div');
    if (briefElement) {
        description += briefElement.innerText.trim() + '\n\n';
    }

    // 2. Extract structured fields (Channels, Required delivery, etc.)
    const detailRows = document.querySelectorAll('#projectDetailsTab .row > div');
    detailRows.forEach(row => {
        const label = row.querySelector('.field-label')?.textContent.trim();
        const value = row.querySelector('.text-wrapper-div:not(.field-label)')?.textContent.trim();

        if (label && value) {
            description += `${label}: ${value}\n`;
        }
    });

    // 3. Fallback: If nothing found yet, just grab all content in the project body
    if (!description.trim()) {
        const fallbackElement = document.getElementById('projectDetailsTab');
        if (fallbackElement) {
            description = fallbackElement.innerText.trim();
        }
    }

    return description.trim();
}

function getBudgetFromPage() {
    const budgetEl = document.querySelector('[data-type="project-budget_range"]');
    if (!budgetEl) return 0;

    // e.g. "$25.00 - $50.00"
    const text = budgetEl.textContent.trim();
    if (!text) return 0;

    // Extract logical numbers (handling commas)
    const matches = text.replace(/,/g, '').match(/\d+(\.\d+)?/g);
    if (!matches || matches.length === 0) return 0;

    // Parse floats
    const values = matches.map(m => parseFloat(m));

    // Return Minimum
    return Math.min(...values);
}

// --- Prompt Management ---

function loadPrompts(callback) {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
    chrome.storage.local.get(['prompts'], (data) => {
        if (chrome.runtime.lastError) {
            console.error('Error loading prompts:', chrome.runtime.lastError);
            return;
        }
        const storedPrompts = data.prompts || [];

        if (storedPrompts.length > 0) {
            callback(storedPrompts);
        } else {
            // If empty, fetch defaults from background (Source of Truth)
            chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error fetching default prompts:', chrome.runtime.lastError);
                    return;
                }
                const defaults = (response && response.prompts) ? response.prompts : [];

                // Save them to storage so we don't ask again
                chrome.storage.local.set({ prompts: defaults }, () => {
                    callback(defaults);
                });
            });
        }
    });
}

function savePrompt(promptData, callback) {
    if (!isContextValid()) {
        console.warn('Mostaql Ext: Extension context invalidated. Please refresh the page.');
        return;
    }
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






function runInjectors() {
    if (!isContextValid()) return;

    const page = getPageType();
    console.log("[DEBUG] ", page);


    if (page === 'project') {
        injectTrackButton();
        checkForAutofill();
    }

    if (page === 'home') {
        injectDashboardStats();
        injectMonitoredProjects();
    }

    if (page === 'profile') {
        injectProfileTools();
    }
}


function startObserverOnce() {
    if (observerStarted) return;
    observerStarted = true;
    setInterval(() => {
        if (location.pathname !== lastPath) {
            lastPath = location.pathname;
            runInjectors();
        }
    }, 500);
    const obs = new MutationObserver(() => {
        runInjectors();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
}

function injectDashboardStats() {
    // Use a stable target unique to that page
    const target = document.querySelector('#project-states');
    if (!target) return;

    // Prevent duplicate inject
    if (document.getElementById('mostaql-msg-tools')) return;

    const box = document.createElement('div');
    box.id = 'mostaql-msg-tools';
    box.className = 'mostaql-ext-sidebar-container';
    box.innerHTML = '';
    target.prepend(box);

    // Remove status=processing and status=lost filter links from the original page
    [
        'https://mostaql.com/dashboard/bids?status=processing',
        'https://mostaql.com/dashboard/bids?status=lost',
    ].forEach(href => {
        document.querySelectorAll(`a[href="${href}"]`).forEach(el => {
            el.removeAttribute('href');
            el.style.cursor = 'default';
            el.style.pointerEvents = 'none';
        });
    });

    // Remove the completed and lost progress bar items from the original page
    ['.label-prj-completed', '.label-prj-lost'].forEach(cls => {
        document.querySelectorAll(cls).forEach(bar => {
            const wrapper = bar.closest('.progress__bar');
            if (wrapper) wrapper.remove();
        });
    });

    // We no longer extract and hide the original "Available Bids" column, 
    // we want to keep the original Mostaql row visible so the user doesn't lose their plan limits.



    function extractBidRow(renderedHtml) {
        if (typeof renderedHtml !== 'string') {
            console.error('extractBidRow expects a string, received:', typeof renderedHtml);
            return null;
        }
        const tpl = document.createElement("template");
        tpl.innerHTML = renderedHtml.trim();
        const row = tpl.content.querySelector("tr.bid-row");
        if (!row) return null;

        const titleLink = row.querySelector("h2 a");
        const statusEl = row.querySelector(".label-prj-pending, .label"); // fallback
        const timeEl = row.querySelector("time[datetime]");
        const priceEl = row.querySelector(".project__meta li .fa-money")?.closest("li")?.querySelector("span");
        const url = (titleLink?.getAttribute("href") || null).split("-")[0];

        let publishedText = null;
        if (timeEl) {
            const li = timeEl.closest("li");
            publishedText = li ? li.textContent.replace(/\s+/g, " ").trim() : null;
        }

        return {
            title: titleLink?.textContent?.trim() || null,
            url,
            status: statusEl?.textContent?.trim() || null,
            publishedDatetime: timeEl?.getAttribute("datetime") || null,
            price: priceEl?.textContent?.trim() || null
        };
    }

    function generateStatusStats(items, opts = {}) {
        const now = opts.now instanceof Date ? opts.now : new Date();
        const days30Ms = 30 * 24 * 60 * 60 * 1000;
        const day1Ms = 1 * 24 * 60 * 60 * 1000;

        const safeArray = Array.isArray(items) ? items : [];
        const normalizeStatus = (s) => (typeof s === "string" && s.trim() ? s.trim() : "UNKNOWN");

        // Parse "YYYY-MM-DD HH:mm:ss" safely (treat as local time).
        // Also supports ISO strings and Date.
        const parsePublished = (v) => {
            if (!v) return null;
            if (v instanceof Date && !Number.isNaN(v.getTime())) return v;

            if (typeof v !== "string") return null;
            const str = v.trim();
            if (!str) return null;

            // If it's already ISO-like, Date can parse it.
            // But "YYYY-MM-DD HH:mm:ss" is not reliably parsed across browsers -> custom parse.
            const m = str.match(
                /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
            );
            if (m) {
                const year = Number(m[1]);
                const month = Number(m[2]) - 1; // 0-based
                const day = Number(m[3]);
                const hour = Number(m[4] ?? 0);
                const min = Number(m[5] ?? 0);
                const sec = Number(m[6] ?? 0);
                const d = new Date(year, month, day, hour, min, sec);
                return Number.isNaN(d.getTime()) ? null : d;
            }

            const d = new Date(str);
            return Number.isNaN(d.getTime()) ? null : d;
        };

        const makeEmptyBucket = () => ({
            total: 0,
            byStatus: {},
            invalidDateCount: 0, // items we couldn't parse date for (only meaningful for time windows)
        });

        const overall = makeEmptyBucket();
        const last30Days = makeEmptyBucket();
        const last1Day = makeEmptyBucket();
        
        const recent24hBids = []; // Store bids from the last 24h to calculate countdowns

        const addToBucket = (bucket, status) => {
            bucket.total += 1;
            bucket.byStatus[status] = (bucket.byStatus[status] ?? 0) + 1;
        };

        for (const item of safeArray) {
            const status = normalizeStatus(item?.status);

            // overall always counts regardless of date
            addToBucket(overall, status);

            // windowed stats need date
            const published = parsePublished(item?.publishedDatetime);
            if (!published) {
                last30Days.invalidDateCount += 1;
                last1Day.invalidDateCount += 1;
                continue;
            }

            const ageMs = now.getTime() - published.getTime();

            // ignore future dates (clock skew) from windows
            if (ageMs < 0) continue;

            if (ageMs <= days30Ms) addToBucket(last30Days, status);
            if (ageMs <= day1Ms) {
                addToBucket(last1Day, status);
                recent24hBids.push({ title: item.title, url: item.url, ageMs, published });
            }
        }

        const uniqueStatuses = Array.from(
            new Set(Object.keys(overall.byStatus))
        ).sort((a, b) => a.localeCompare(b, "ar"));

        return {
            meta: {
                now: now.toISOString(),
                totalItems: safeArray.length,
                uniqueStatuses,
            },
            status: overall,        // overall counts
            last30Days: last30Days, // within last 30 days
            last1Day: last1Day,     // within last 24 hours
            recent24hBids: recent24hBids // detailed bids for countdowns
        };
    }

    async function fetchBidPage(pageNumber) {
        const url = `https://mostaql.com/dashboard/bids?page=${pageNumber}&sort=latest`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest",
            },
            credentials: "include",
        });

        if (!response.ok) {
            throw new Error(`Page ${pageNumber} request failed`);
        }

        return await response.json();
    }

    function processBidsFromPage(data) {
        const bids = [];

        if (data.collection && Array.isArray(data.collection)) {
            data.collection.forEach((bidObject) => {
                const htmlString = bidObject.rendered || bidObject;
                const item = extractBidRow(htmlString);
                if (item) {
                    item.apiBidId = bidObject.id || null;
                    bids.push(item);
                }
            });
        }

        return bids;
    }

    async function fetchAllBids() {
        const itemsPerPage = 25;
        const allBids = [];

        // Fetch first page to get total count
        const firstData = await fetchBidPage(1);

        console.log("all bids count:", firstData.count);

        const totalPages = Math.ceil(firstData.count / itemsPerPage);
        console.log("total pages:", totalPages);

        // Process first page data
        const firstPageBids = processBidsFromPage(firstData);
        allBids.push(...firstPageBids);

        // Fetch remaining pages
        for (let page = 2; page <= totalPages; page++) {
            console.log(`Fetching page ${page}...`);

            try {
                const data = await fetchBidPage(page);
                const pageBids = processBidsFromPage(data);
                allBids.push(...pageBids);
            } catch (err) {
                console.warn(`Page ${page} failed:`, err.message);
                continue;
            }
        }

        const stats = generateStatusStats(allBids);

        return stats;
    }

    function renderBidStats(stats) {
        const BIDS_URL = 'https://mostaql.com/dashboard/bids';

        // Shared status config lookup
        const STATUS_CONFIG = {
            'مكتمل': { label: 'مكتملة', cssClass: 'label-prj-completed', href: `${BIDS_URL}?status=completed` },
            'مستبعد': { label: 'مستبعدة', cssClass: 'label-prj-lost', href: BIDS_URL },
            'مُغلق': { label: 'مُغلق', cssClass: 'label-prj-closed', href: BIDS_URL },
            'بانتظار الموافقة': { label: 'بانتظار الموافقة', cssClass: 'label-prj-open', href: `${BIDS_URL}?status=pending` },
        };

        const pct = (part, whole) => whole > 0 ? Math.round((part / whole) * 100) : 0;

        // Build a single progress bar row
        const makeBar = ({ label, count, pct: p, cssClass = '', href = BIDS_URL, isLink = true }) => {
            const inner = `
                <div class="projects-progress">
                    <div class="clearfix">
                        <div class="pull-right">${count} ${label}</div>
                        <div class="pull-left">${p}%</div>
                    </div>
                    <div class="progress progress--slim">
                        <div class="progress-bar ${cssClass}" role="progressbar"
                             aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"
                             style="width:${p}%">
                            <span class="sr-only">${p}%</span>
                        </div>
                    </div>
                </div>`;
            return isLink
                ? `<a href="${href}" class="progress__bar docs-creator">${inner}</a>`
                : `<span class="progress__bar">${inner}</span>`;
        };

        // Build bars from a status map against a byStatus object
        const buildBars = (keys, byStatus, total) =>
            keys.map(key => {
                const cfg = STATUS_CONFIG[key] || { label: key, cssClass: '', href: BIDS_URL };
                const count = byStatus[key] || 0;
                return makeBar({ label: cfg.label, count, pct: pct(count, total), cssClass: cfg.cssClass, href: cfg.href });
            });

        // Build a full stats column
        const renderColumn = ({ icon, title, summaryBar, bars, emptyMsg }) => `
            <div class="col-sm-4 progress__bars">
                <p class="text-muted mostaql-stats-header">
                    <i class="fa ${icon}"></i> ${title}
                </p>
                ${summaryBar}
                ${bars.length > 0 ? bars.join('') : `<span class="text-muted mostaql-stats-empty">${emptyMsg || ''}</span>`}
            </div>`;

        const { status: overall, last30Days, last1Day, recent24hBids } = stats;

        // ── Overall ──
        const overallColumn = renderColumn({
            icon: 'fa-list-ul',
            title: 'إجمالي العروض',
            summaryBar: makeBar({ label: 'إجمالي العروض', count: overall.total, pct: 100, href: BIDS_URL }),
            bars: buildBars(['مكتمل', 'مستبعد', 'مُغلق'], overall.byStatus, overall.total),
        });

        // ── Last 30 Days ──
        const last30Column = renderColumn({
            icon: 'fa-calendar',
            title: 'آخر 30 يوم',
            summaryBar: makeBar({ label: 'آخر 30 يوم (إجمالي)', count: last30Days.total, pct: pct(last30Days.total, overall.total), cssClass: 'label-prj-open', href: BIDS_URL }),
            bars: buildBars(['بانتظار الموافقة', 'مستبعد', 'مُغلق'], last30Days.byStatus, last30Days.total),
        });

        // ── Today ──
        const todayKeys = Object.keys(last1Day.byStatus);
        const todayColumn = renderColumn({
            icon: 'fa-clock-o',
            title: 'اليوم',
            summaryBar: makeBar({ label: 'اليوم (إجمالي)', count: last1Day.total, pct: pct(last1Day.total, overall.total), cssClass: 'label-prj-processing', href: BIDS_URL }),
            bars: buildBars(todayKeys, last1Day.byStatus, last1Day.total),
            emptyMsg: 'لا توجد عروض اليوم',
        });

        // ── Build Countdowns Row ──
        let countdownsHtml = '';
        if (recent24hBids && recent24hBids.length > 0) {
            countdownsHtml = `
            <div class="row" style="margin-top:20px;">
            `;
            
            const sortedBids = recent24hBids.sort((a,b) => b.ageMs - a.ageMs);
            // Balance across 3 columns dynamically
            const numCols = 3;
            const chunkSize = Math.max(1, Math.ceil(sortedBids.length / numCols));
            
            for (let i = 0; i < sortedBids.length; i += chunkSize) {
                const chunk = sortedBids.slice(i, i + chunkSize);
                
                countdownsHtml += `<div class="col-sm-4 progress__bars">`;
                
                if (i === 0) {
                    countdownsHtml += `
                    <p class="text-muted mostaql-stats-header">
                        <i class="fa fa-refresh"></i> عروض تسترد قريباً
                    </p>
                    `;
                } else {
                    // Match the header height so columns align perfectly
                    countdownsHtml += `
                    <p class="mostaql-stats-header" style="visibility:hidden;">
                        -
                    </p>
                    `;
                }
                
                countdownsHtml += chunk.map(bid => {
                    // Calculate time left
                    const totalMs = 24 * 60 * 60 * 1000;
                    const msLeft = totalMs - bid.ageMs;
                    if (msLeft <= 0) return '';
                    
                    const pct = Math.max(0, Math.min(100, Math.round(((totalMs - msLeft) / totalMs) * 100)));
                    const appliedAtStr = bid.published.toLocaleTimeString('ar-EG', { hour: '2-digit', minute:'2-digit' });
                    
                    // Colors change as it gets closer to 100%
                    let color = '#dc3545'; // Red for < 25% (just applied)
                    if (pct >= 85) color = '#28a745'; // Green (almost ready)
                    else if (pct >= 50) color = '#ffc107'; // Yellow
                    else if (pct >= 25) color = '#17a2b8'; // Cyan
                    
                    return `
                        <a href="${bid.url || '#'}" ${bid.url ? 'target="_blank"' : ''} class="progress__bar docs-creator">
                            <div class="projects-progress" title="قُدِّم: ${appliedAtStr}">
                                <div class="clearfix">
                                    <div class="pull-right" style="max-width: 65%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                        ${bid.title || 'عرض'}
                                    </div>
                                    <div class="pull-left frelancia-countdown" data-ms-left="${msLeft}" style="color:${color}; font-family:monospace; font-weight:bold; letter-spacing:0.5px; direction:ltr;">
                                        --:--:--
                                    </div>
                                </div>
                                <div class="progress progress--slim">
                                    <div class="progress-bar frelancia-progress-bar" role="progressbar" style="width:${pct}%; background-color:${color};">
                                    </div>
                                </div>
                            </div>
                        </a>
                    `;
                }).join('');
                
                countdownsHtml += `</div>`;
            }
            
            countdownsHtml += `</div>`;
        }

        // ── Render ──
        const existing = document.getElementById('mostaql-bid-stats');
        if (existing) existing.remove();
        
        const existingSlotsRow = document.getElementById('mostaql-bid-slots-row');
        if (existingSlotsRow) existingSlotsRow.remove();

        // Inject the custom stats ABOVE the original row
        // target is #project-states
        const firstNativeRow = target.querySelector('.row');
        if (firstNativeRow) {
            firstNativeRow.insertAdjacentHTML('beforebegin', `
                <div class="row content-middle-sm" id="mostaql-bid-stats" style="margin-bottom:20px;">
                    ${overallColumn}
                    ${last30Column}
                    ${todayColumn}
                </div>
            `);
            
            // And inject countdowns BELOW the original row
            if (countdownsHtml) {
                firstNativeRow.insertAdjacentHTML('afterend', `
                    <div id="mostaql-bid-slots-row">${countdownsHtml}</div>
                `);
            }
        } else {
            // Fallback
            box.insertAdjacentHTML('afterend', `
                <div class="row content-middle-sm" id="mostaql-bid-stats">
                    ${overallColumn}
                    ${last30Column}
                    ${todayColumn}
                </div>
                ${countdownsHtml ? `<div id="mostaql-bid-slots-row">${countdownsHtml}</div>` : ''}
            `);
        }
            
        // Start timers
        startSlotCountdowns();
    }
    
    function startSlotCountdowns() {
        if (window.frelanciaCountdownsInterval) {
            clearInterval(window.frelanciaCountdownsInterval);
        }
        
        const updateTimers = () => {
            const totalMs = 24 * 60 * 60 * 1000;
            document.querySelectorAll('.frelancia-countdown').forEach(el => {
                let msLeft = parseInt(el.getAttribute('data-ms-left'), 10);
                if (isNaN(msLeft) || msLeft <= 0) {
                    el.textContent = 'متاح الآن!';
                    el.style.color = '#28a745';
                    
                    const container = el.closest('.projects-progress');
                    if (container) {
                        const bar = container.querySelector('.progress-bar');
                        if (bar) {
                            bar.style.width = '100%';
                            bar.style.backgroundColor = '#28a745';
                        }
                    }
                    return;
                }
                
                msLeft -= 1000;
                el.setAttribute('data-ms-left', msLeft);
                
                const hours = Math.floor(msLeft / (1000 * 60 * 60));
                const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((msLeft % (1000 * 60)) / 1000);
                
                el.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                
                // Update progress bar
                const pct = Math.max(0, Math.min(100, ((totalMs - msLeft) / totalMs) * 100));
                
                let color = '#dc3545'; // Red for < 25% (just applied)
                if (pct >= 85) color = '#28a745'; // Green (almost ready)
                else if (pct >= 50) color = '#ffc107'; // Yellow
                else if (pct >= 25) color = '#17a2b8'; // Cyan
                
                el.style.color = color;
                
                const container = el.closest('.projects-progress');
                if (container) {
                    const bar = container.querySelector('.progress-bar');
                    if (bar) {
                        bar.style.width = `${pct}%`;
                        bar.style.backgroundColor = color;
                    }
                }
            });
        };
        
        updateTimers(); // Initial call
        window.frelanciaCountdownsInterval = setInterval(updateTimers, 1000);
    }

    async function loadStats() {
        try {
            const stats = await fetchAllBids();
            console.log("Final stats:", stats);
            renderBidStats(stats);
        } catch (err) {
            console.error("Error fetching bids:", err);
        }
    }

    // Auto-load on inject
    loadStats();
}

// Inject monitored projects panel into mostaql.com homepage
function injectMonitoredProjects() {
    const anchorPanel = document.querySelector('#dashboard__latest-published-panel');
    if (!anchorPanel) return;

    // Guard must happen synchronously BEFORE any async call
    if (document.getElementById('frelancia-monitored-panel')) return;
    if (!isContextValid()) return;

    // Insert the panel shell immediately so re-entrant calls are blocked
    const panel = document.createElement('div');
    panel.id = 'frelancia-monitored-panel';
    panel.className = 'panel panel-default mrg--bm';
    panel.innerHTML = `
        <div class="heada">
            <h2 class="heada__title pull-right vcenter">
                <a href="javascript:void(0)" class="dsp--b clr-gray-dark" style="cursor:default;">
                    <i class="fa fa-fw fa-eye" style="color:#2386c8;"></i>
                    المشاريع المراقبة
                    <span style="font-size:12px; font-weight:400; color:#999; margin-right:8px;">آخر 7 مشاريع</span>
                </a>
            </h2>
            <div class="pull-left">
                <button id="frelancia-refresh-monitored" class="btn btn-xs btn-default" style="margin-top:12px;">
                    <i class="fa fa-refresh"></i>
                </button>
            </div>
        </div>
        <div class="carda__body collapse in panel-listing">
            <div class="row panel-list" id="frelancia-monitored-list">
                <div style="padding:20px; text-align:center; color:#999;"><i class="fa fa-spinner fa-spin"></i></div>
            </div>
        </div>`;

    anchorPanel.insertAdjacentElement('afterend', panel);

    // Now load data and fill content
    chrome.storage.local.get(['trackedProjects'], (data) => {
        if (chrome.runtime.lastError) return;
        const listEl = document.getElementById('frelancia-monitored-list');
        if (!listEl) return;

        const tracked = data.trackedProjects || {};
        const jobs = Object.values(tracked)
            .sort((a, b) => (b.lastChecked || '').localeCompare(a.lastChecked || ''))
            .slice(0, 7);

        if (jobs.length === 0) {
            listEl.innerHTML = `<div class="list-group-item mrg--an" style="padding:20px; text-align:center; color:#888;">لا توجد مشاريع مراقبة. افتح أي مشروع واضغط <strong>مراقبة</strong> لإضافته.</div>`;
            return;
        }

        listEl.innerHTML = jobs.map(job => {
            const poster  = job.clientName ? `<span class="text-muted"><i class="fa fa-fw fa-user"></i> ${job.clientName}</span>` : '';
            const timeAgo = job.publishDate ? `<span class="text-muted"><i class="fa fa-fw fa-clock-o"></i> ${job.publishDate}</span>` : '';
            const bids    = job.communications ? `<span class="text-muted"><i class="fa fa-fw fa-handshake-o"></i> ${job.communications} تواصل</span>` : '';
            const budget  = (job.budget && job.budget !== 'غير محدد') ? `<span class="text-muted"><i class="fa fa-fw fa-money"></i> ${job.budget}</span>` : '';
            const status  = job.status || 'مفتوح';

            let statusCls = 'label-prj-open';
            if (status.includes('تنفيذ') || status.includes('جارٍ')) statusCls = 'label-prj-processing';
            if (status.includes('مغلق') || status.includes('مكتمل') || status.includes('ملغى')) statusCls = 'label-prj-closed';

            const metaItems = [poster, timeAgo, bids, budget].filter(Boolean).map(m => `<li>${m}</li>`).join('');

            return `
            <div class="list-group-item brd--b mrg--an">
                <h5 class="listing__title project__title mrg--bt-reset">
                    <a href="${job.url}" target="_blank">${job.title || 'بدون عنوان'}</a>
                    <span class="label ${statusCls}" style="font-size:10px; margin-right:6px;">${status}</span>
                </h5>
                ${metaItems ? `<ul class="project__meta list-meta text-zeta clr-gray-dark">${metaItems}</ul>` : ''}
            </div>`;
        }).join('');
    });

    // Refresh button
    panel.querySelector('#frelancia-refresh-monitored').addEventListener('click', () => {
        panel.remove();
        injectMonitoredProjects();
    });
}

// Example: profile page injector
function injectProfileTools() {
    const target = document.querySelector('.profile_card') || document.querySelector('#profile-sidebar');
    if (!target) return;

    if (document.getElementById('mostaql-profile-tools')) return;

    const box = document.createElement('div');
    box.id = 'mostaql-profile-tools';
    box.innerHTML = `<button class="btn btn-success">أداة بروفايل</button>`;
    target.appendChild(box);
}



// Initial injection
function initExtension() {
    lastPath = location.pathname;
    runInjectors();
    startObserverOnce();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExtension);
} else {
    initExtension();
}
