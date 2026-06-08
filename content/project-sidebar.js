// ==========================================
// content/project-sidebar.js — Sidebar button injection
// Depends on: utils.js, data.js, prompts.js, autofill.js
// ==========================================

function injectTrackButton() {
    const metaCardBody = document.querySelector('#project-meta-panel');
    if (!metaCardBody) return;

    let buttonContainer = document.getElementById('mostaql-ext-btn-container');

    if (buttonContainer && buttonContainer.parentElement !== metaCardBody) {
        buttonContainer.remove();
        buttonContainer = null;
    }

    if (!buttonContainer) {
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
        const group = document.createElement('div');
        group.id = 'chatgpt-group';
        group.className = 'btn-group dropdown mostaql-custom-dropdown';

        const mainBtn = document.createElement('a');
        mainBtn.id = 'chatgpt-main-btn';
        mainBtn.className = 'btn btn-primary';
        mainBtn.href = 'javascript:void(0);';
        mainBtn.innerHTML = '<i class="fa fa-fw fa-magic"></i> <span class="action-text">ذكاء</span>';
        mainBtn.title = 'استشارة الذكاء الاصطناعي';
        mainBtn.dataset.promptId = 'default_proposal';

        mainBtn.addEventListener('click', (e) => {
            e.preventDefault();
            mainBtn.style.opacity = '0.8';
            setTimeout(() => mainBtn.style.opacity = '1', 200);
            handleChatGptClick(mainBtn.dataset.promptId);
        });

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'chatgpt-dropdown-toggle';
        toggleBtn.className = 'btn btn-primary dropdown-toggle';
        toggleBtn.innerHTML = '<i class="fa fa-caret-down"></i>';
        toggleBtn.setAttribute('data-toggle', 'dropdown');

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            group.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!group.contains(e.target)) {
                group.classList.remove('open');
            }
        });

        const menuList = document.createElement('ul');
        menuList.className = 'dropdown-menu dropdown-left dropdown-menu-left';
        menuList.setAttribute('role', 'menu');

        const renderMenu = () => {
            loadPrompts((prompts) => {
                menuList.innerHTML = '';

                prompts.forEach((p) => {
                    const li = document.createElement('li');
                    li.className = 'prompt-li';
                    if (mainBtn.dataset.promptId === p.id) {
                        li.classList.add('active');
                    }

                    const itemContainer = document.createElement('div');
                    itemContainer.style.display = 'flex';
                    itemContainer.style.alignItems = 'center';
                    itemContainer.style.justifyContent = 'space-between';
                    itemContainer.style.width = '100%';

                    const a = document.createElement('a');
                    a.href = 'javascript:void(0);';
                    a.textContent = p.title;
                    a.style.flex = '1';
                    a.style.padding = '5px 10px';
                    a.style.color = 'inherit';
                    a.style.textDecoration = 'none';
                    a.onclick = (e) => {
                        e.preventDefault();
                        handleChatGptClick(p.id);
                        group.classList.remove('open');
                        renderMenu();
                    };

                    const editBtn = document.createElement('span');
                    editBtn.innerHTML = '<i class="fa fa-pencil"></i>';
                    editBtn.style.cursor = 'pointer';
                    editBtn.style.padding = '5px 10px';
                    editBtn.style.color = '#777';
                    editBtn.title = 'تعديل القالب';
                    editBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        group.classList.remove('open');
                        createPromptModal(renderMenu, p);
                    };
                    editBtn.onmouseover = () => editBtn.style.color = '#2386c8';
                    editBtn.onmouseout = () => editBtn.style.color = '#777';

                    itemContainer.appendChild(a);
                    itemContainer.appendChild(editBtn);

                    li.appendChild(itemContainer);
                    menuList.appendChild(li);
                });

                const divLi = document.createElement('li');
                divLi.className = 'divider';
                menuList.appendChild(divLi);

                const addLi = document.createElement('li');
                const addLink = document.createElement('a');
                addLink.href = 'javascript:void(0);';
                addLink.innerHTML = '<i class="fa fa-plus"></i> إضافة قالب جديد';
                addLink.onclick = (e) => {
                    e.preventDefault();
                    group.classList.remove('open');
                    createPromptModal((newId) => {
                        if (newId) {
                            mainBtn.dataset.promptId = newId;
                            loadPrompts((prompts) => {
                                const p = prompts.find(x => x.id === newId);
                                if (p) mainBtn.title = `استخدام القالب: ${p.title}`;
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
            delete tracked[projectId];
            setButtonUntracked(btn);
        } else {
            tracked[projectId] = extractProjectData();
            tracked[projectId].id = projectId;
            setButtonTracked(btn);
        }
        chrome.storage.local.set({ trackedProjects: tracked });
    });
}

function setButtonTracked(btn) {
    btn.innerHTML = '<i class="fa fa-fw fa-check-circle"></i> <span class="action-text">مُراقبة</span>';
    btn.className = 'btn btn-warning';
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

    const projectData = extractProjectData();
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

    chrome.storage.local.get(['settings'], (result) => {
        const settings = result.settings || {};

        loadPrompts((prompts) => {
            let templateContent = '';
            const selectedPrompt = prompts.find(p => p.id === promptId);
            console.log('Prompts loaded:', prompts.length);
            console.log('Selected prompt found:', !!selectedPrompt);

            if (selectedPrompt) {
                templateContent = selectedPrompt.content;
                processTemplate(templateContent);
            } else if (promptId === 'default_proposal') {
                if (settings.geminiPromptTemplate && settings.geminiPromptTemplate.trim() !== '') {
                    processTemplate(settings.geminiPromptTemplate);
                } else {
                    console.warn('Default prompt not modified/found locally, fetching original default.');
                    chrome.runtime.sendMessage({ action: 'getDefaultPrompts' }, (response) => {
                        const defaults = (response && response.prompts) ? response.prompts : [];
                        const def = defaults.find(d => d.id === 'default_proposal');
                        if (def) {
                            processTemplate(def.content);
                        } else {
                            alert('خطأ: تعذر تحميل القالب الافتراضي.');
                        }
                    });
                }
                return;
            } else {
                console.error('Prompt ID not found:', promptId);
                alert('خطأ: لم يتم العثور على القالب المحدد (ID: ' + promptId + '). تحقق من قائمة الأوامر.');
                return;
            }

        function processTemplate(content) {
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

            chrome.storage.local.get(['settings'], (result) => {
                const settings = result.settings || {};
                const aiEngine = settings.aiEngine || 'chatgpt';

                if (aiEngine === 'gemini') {
                    const mainBtn = document.getElementById('chatgpt-main-btn');
                    let originalBtnHtml = '';
                    if (mainBtn) {
                        originalBtnHtml = mainBtn.innerHTML;
                        mainBtn.style.pointerEvents = 'none';
                        mainBtn.style.opacity = '0.7';
                        mainBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> جاري التوليد...';
                    }

                    let finalPrompt = prompt;
                    if (settings.geminiCustomInstructions && settings.geminiCustomInstructions.trim() !== '') {
                        finalPrompt += '\n\nمعلومات وتوجيهات إضافية من المستقل (يرجى دمجها والتزامها في صياغة العرض):\n' + settings.geminiCustomInstructions.trim();
                    }

                    chrome.runtime.sendMessage({ action: 'generateProposalWithGemini', prompt: finalPrompt }, (response) => {
                        if (mainBtn) {
                            mainBtn.style.pointerEvents = 'auto';
                            mainBtn.style.opacity = '1';
                            mainBtn.innerHTML = originalBtnHtml;
                        }

                        if (chrome.runtime.lastError) {
                            console.error('Runtime error:', chrome.runtime.lastError);
                            alert('حدث خطأ في الاتصال بالإضافة: ' + chrome.runtime.lastError.message);
                            return;
                        }

                        if (response && response.success) {
                            const generatedText = response.proposal;
                            const proposalTextarea = document.querySelector('#bid__details') ||
                                document.querySelector('#description') ||
                                document.querySelector('textarea[name="details"]') ||
                                document.querySelector('textarea[name="description"]') ||
                                document.querySelector('#proposal-description');

                            if (proposalTextarea) {
                                proposalTextarea.focus();
                                proposalTextarea.value = generatedText;
                                proposalTextarea.classList.add('mostaql-autofilled');

                                const triggerEvents = (el) => {
                                    el.dispatchEvent(new Event('focus', { bubbles: true }));
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                                    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                                    el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));
                                    setTimeout(() => {
                                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                                    }, 50);
                                };
                                triggerEvents(proposalTextarea);

                                const form = document.querySelector('#add-proposal-form') || proposalTextarea.closest('form') || proposalTextarea.parentElement;
                                if (form) {
                                    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }

                                const toast = document.createElement('div');
                                toast.className = 'mostaql-autofill-toast';
                                toast.innerHTML = '<i class="fa fa-robot"></i> <span>تم توليد عرض الذكاء الاصطناعي بنجاح وكتابته!</span>';
                                document.body.appendChild(toast);

                                setTimeout(() => toast.classList.add('show'), 100);
                                setTimeout(() => {
                                    toast.classList.remove('show');
                                    setTimeout(() => toast.remove(), 500);
                                }, 5000);
                            } else {
                                alert('تم توليد العرض بنجاح ولكن لم يتم العثور على حقل النص في الصفحة لكتابته. العرض هو:\n\n' + generatedText);
                            }
                        } else {
                            const err = (response && response.error) ? response.error : 'فشل غير معروف أثناء توليد العرض';
                            alert('حدث خطأ أثناء الاتصال بـ Gemini:\n' + err);
                        }
                    });
                } else {
                    chrome.storage.local.set({ 'pendingChatGptPrompt': prompt }, () => {
                        const url = settings.aiChatUrl || 'https://chatgpt.com/';
                        window.open(url, 'mostaql_ai_chat');
                    });
                }
            });
        }
    });
    });
}
