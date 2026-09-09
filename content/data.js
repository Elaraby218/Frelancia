// ==========================================
// content/data.js — DOM scraping & project data extraction
// Depends on: utils.js (getProjectId)
// ==========================================

function extractProjectData() {
    const statusLabel = document.querySelector('.label-prj-open, .label-prj-closed, .label-prj-completed, .label-prj-cancelled, .label-prj-underway, .label-prj-processing');
    const status = statusLabel ? statusLabel.textContent.trim().replace(/\s+/g, ' ') : 'غير معروف';

    let communications = '0';
    let duration = 'غير محدد';
    let budget = 'غير محدد';
    let publishDate = 'غير معروف';
    let hiringRate = 'غير معروف';
    let clientJoined = 'غير معروف';
    let openProjects = '0';
    let underwayProjects = '0';

    const metaRows = document.querySelectorAll('.meta-row, .table-meta tr, .card .table tr, li.meta-item');
    metaRows.forEach(row => {
        const label = row.querySelector('.meta-label, td:first-child, .meta-item-label')?.textContent.trim().replace(/\s+/g, ' ') || row.innerText.split(/[:\n]/)[0]?.trim().replace(/\s+/g, ' ');
        const value = row.querySelector('.meta-value, td:last-child, .meta-item-value')?.textContent.trim().replace(/\s+/g, ' ') || row.innerText.split(/[:\n]/).pop()?.trim().replace(/\s+/g, ' ');

        if (label && value) {
            if (label.includes('التواصلات') || label.includes('Communications')) {
                communications = value;
            } else if (label.includes('مدة التنفيذ') || label.includes('Duration')) {
                duration = value;
            } else if (label.includes('الميزانية') || label.includes('Budget')) {
                budget = value;
            } else if (label.includes('تاريخ النشر') || label.includes('Published')) {
                publishDate = value;
            } else if (label.includes('معدل التوظيف') || label.includes('Hiring')) {
                hiringRate = value;
            } else if (label.includes('تاريخ التسجيل') || label.includes('Joined')) {
                clientJoined = value;
            } else if (label.includes('المشاريع المفتوحة')) {
                openProjects = value;
            } else if (label.includes('مشاريع قيد التنفيذ')) {
                underwayProjects = value;
            }
        }
    });

    const budgetEl = document.querySelector('[data-type="project-budget_range"], #project-meta-panel .meta-value[data-type="project-budget_range"]');
    if (budgetEl) budget = budgetEl.textContent.trim().replace(/\s+/g, ' ');

    const timeEl = document.querySelector('time[itemprop="datePublished"], #project-meta-panel time');
    if (timeEl) publishDate = timeEl.textContent.trim().replace(/\s+/g, ' ');

    const sideTags = document.querySelectorAll('#project-meta-panel .tag');
    let tagsStr = '';
    if (sideTags.length > 0) {
        tagsStr = Array.from(sideTags).map(t => t.innerText.trim()).join(', ');
    }

    const clientNameEl = document.querySelector('.profile__name bdi');
    const clientName = clientNameEl ? clientNameEl.textContent.trim().replace(/\s+/g, ' ') : 'غير معروف';

    const projectId = getProjectId();

    const categoryEl = document.querySelector('.breadcrumb-item[data-index="2"]');
    const category = categoryEl ? categoryEl.textContent.trim() : 'غير معروف';

    openProjects = '0';
    underwayProjects = '0';
    clientJoined = 'غير معروف';
    hiringRate = 'غير معروف';
    let clientType = 'صاحب عمل';

    const clientCard = document.querySelector('.profile_card');
    if (clientCard) {
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

        const typeEl = clientCard.querySelector('.meta_items li');
        if (typeEl) clientType = typeEl.textContent.trim();
    }

    const tags = Array.from(document.querySelectorAll('.skills .tag, .tags .tag, .project-tags .tag'))
        .map(tag => tag.textContent.trim())
        .join(', ');

    const titleEl = document.querySelector('.heada__title span[data-type="page-header-title"]') ||
                    document.querySelector('.page-title h1') ||
                    document.querySelector('.project-title');
    const title = titleEl?.textContent.trim() || document.title || 'مشروع غير معنون';

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
        tags: tags || tagsStr || '',
        category: category || 'عام',
        hiringRate: hiringRate || 'غير متوفر',
        openProjects: openProjects || '0',
        underwayProjects: underwayProjects || '0',
        clientJoined: clientJoined || 'غير معروف',
        clientType: clientType || 'صاحب عمل',
        attachments: Array.from(document.querySelectorAll('#projectDetailsTab #project-files-panel .attachment a[href]'))
            .map(a => ({
                url: a.href,
                name: a.getAttribute('title') || a.innerText.trim()
            }))
    };
}

function getProjectDescription() {
    let description = '';

    const container = document.querySelector('#projectDetailsTab') || document.querySelector('#project-brief');
    if (!container) return '';

    const mainText = container.querySelector('.carda__content, .text-wrapper-div:not(.field-label)');
    if (mainText) {
        description += mainText.innerText.trim() + '\n\n';
    }

    const detailRows = container.querySelectorAll('.pdn--ts, .row > div');
    detailRows.forEach(row => {
        const label = row.querySelector('.field-label')?.textContent.trim();
        const value = row.querySelector('.text-wrapper-div:not(.field-label)')?.textContent.trim();

        if (label && value && label !== value) {
            description += `${label}: ${value}\n`;
        }
    });

    if (!description.trim()) {
        description = container.innerText.trim();
    }

    return description.trim();
}

function getBudgetFromPage() {
    const budgetEl = document.querySelector('[data-type="project-budget_range"]');
    if (!budgetEl) return 0;

    const text = budgetEl.textContent.trim();
    if (!text) return 0;

    const matches = normalizeFrelanciaDigits(text).replace(/[,٬]/g, '').match(/\d+(\.\d+)?/g);
    if (!matches || matches.length === 0) return 0;

    const values = matches.map(m => parseFloat(m));
    return Math.min(...values);
}

async function fetchDeepProjectData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const res = {};

        const tags = Array.from(doc.querySelectorAll('.tag, .skills__item bdi'));
        if (tags.length > 0) {
            res.tags = Array.from(new Set(tags.map(t => t.innerText.trim()))).join(', ');
        }

        const getMetaValue = (label) => {
            const rows = doc.querySelectorAll('.meta-row');
            for (const row of rows) {
                if (row.querySelector('.meta-label')?.innerText.includes(label)) {
                    return row.querySelector('.meta-value')?.innerText.trim().replace(/\s+/g, ' ');
                }
            }
            const trs = doc.querySelectorAll('tr');
            for (const tr of trs) {
                if (tr.innerText.includes(label)) {
                    return tr.querySelector('td:last-child')?.innerText.trim().replace(/\s+/g, ' ');
                }
            }
            return null;
        };

        res.title = doc.querySelector('.heada__title span[data-type="page-header-title"]')?.innerText.trim() ||
                    doc.querySelector('.page-title h1')?.innerText.trim() ||
                    doc.title.split('-')[0].trim();

        res.category = doc.querySelector('.breadcrumb li:nth-last-child(2) a')?.innerText.trim() ||
                       doc.querySelector('.project-header__meta a')?.innerText.trim();

        res.status = getMetaValue('حالة المشروع') || doc.querySelector('.project-header .label')?.innerText.trim().replace(/\s+/g, ' ');
        res.budget = getMetaValue('الميزانية');
        res.duration = getMetaValue('مدة التنفيذ');
        res.publishDate = getMetaValue('تاريخ النشر') || doc.querySelector('time[itemprop="datePublished"]')?.innerText.trim().replace(/\s+/g, ' ');
        const publishTimeEl = doc.querySelector('time[itemprop="datePublished"]');
        res.publishDatetime = publishTimeEl ? publishTimeEl.getAttribute('datetime') : null;

        const clientCard = doc.querySelector('.profile_card');
        if (clientCard) {
            const getClientVal = (label) => {
                const trs = clientCard.querySelectorAll('tr');
                for (const tr of trs) {
                    if (tr.innerText.includes(label)) {
                        return tr.querySelector('td:last-child')?.innerText.trim().replace(/\s+/g, ' ');
                    }
                }
                return null;
            };
            res.clientName = clientCard.querySelector('.profile__name')?.innerText.trim() ||
                             clientCard.querySelector('h3, h4')?.innerText.trim();
            res.hiringRate = getClientVal('معدل التوظيف');
            res.clientJoined = getClientVal('تاريخ التسجيل');
            res.openProjects = getClientVal('المشاريع المفتوحة');
            res.underwayProjects = getClientVal('مشاريع قيد التنفيذ');
            res.ongoingCommunications = getClientVal('التواصلات الجارية');
            const specEl = clientCard.querySelector('.meta_items li');
            if (specEl) res.clientTitle = specEl.innerText.trim();
        }

        const container = doc.querySelector('#projectDetailsTab') || doc.querySelector('#project-brief');
        let fullDesc = "";
        if (container) {
            const mainText = container.querySelector('.carda__content, .text-wrapper-div:not(.field-label)');
            if (mainText) fullDesc += mainText.innerText.trim() + '\n\n';
            const detailRows = container.querySelectorAll('.pdn--ts, .row > div');
            detailRows.forEach(row => {
                const label = row.querySelector('.field-label')?.textContent.trim();
                const value = row.querySelector('.text-wrapper-div:not(.field-label)')?.textContent.trim();
                if (label && value && label !== value) fullDesc += `${label}: ${value}\n`;
            });
            if (!fullDesc.trim()) fullDesc = container.innerText.trim();
        }
        res.description = fullDesc.trim() || "تعذر العثور على وصف تفصيلي.";

        res.attachments = Array.from(doc.querySelectorAll('#projectDetailsTab #project-files-panel .attachment a[href]'))
            .map(a => ({
                url: a.href,
                name: a.getAttribute('title') || a.innerText.trim()
            }));

        res.bids = [];
        const bidElements = doc.querySelectorAll('#project-bids .bid');

        const formatDiff = (start, end) => {
            if (!start || !end) return null;
            const d1 = new Date(start.replace(' ', 'T'));
            const d2 = new Date(end.replace(' ', 'T'));
            const diffMs = d2 - d1;
            if (diffMs < 0) return "مباشرة";
            const diffMins = Math.floor(diffMs / 60000);
            if (diffMins < 60) return `بعد ${diffMins} دقيقة`;
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `بعد ${diffHours} ساعة`;
            const diffDays = Math.floor(diffHours / 24);
            return `بعد ${diffDays} يوم`;
        };

        bidElements.forEach(bid => {
            const bidderNameEl = bid.querySelector('.profile__name bdi');
            const bidderLinkEl = bid.querySelector('.profile__name a');
            const bidderTitleEl = bid.querySelector('.bid__meta .title');
            const bidTimeEl = bid.querySelector('.bid__meta .time time');
            const bidContentEl = bid.querySelector('.bid__details .text-wrapper-div');
            const bidTime = bidTimeEl ? bidTimeEl.getAttribute('datetime') : null;
            res.bids.push({
                name: bidderNameEl ? bidderNameEl.innerText.trim() : "مجهول",
                link: bidderLinkEl ? bidderLinkEl.href : "#",
                title: bidderTitleEl ? bidderTitleEl.innerText.trim() : "",
                timeRaw: bidTime,
                timeText: bidTimeEl ? bidTimeEl.innerText.trim() : "",
                timeOffset: formatDiff(res.publishDatetime, bidTime),
                content: bidContentEl ? bidContentEl.innerText.trim() : ""
            });
        });

        return res;
    } catch (err) {
        console.error("Deep fetch failed:", err);
        return null;
    }
}

async function extractProjectDetailsFull() {
    try {
        let data = extractProjectData();
        let description = "";

        const projectLinkSelectors = [
            "body > div.wrapper.hsoub-container > div > div.page-body > div > div.page-title > div:nth-child(2) > div > div > div > div > a",
            "a[href*='/project/']",
            ".page-title a[href*='/project/']"
        ];

        let projectLinkEl = null;
        for (const sel of projectLinkSelectors) {
            projectLinkEl = document.querySelector(sel);
            if (projectLinkEl && projectLinkEl.href && projectLinkEl.href.includes('/project/')) break;
        }

        if (projectLinkEl && projectLinkEl.href) {
            const externalData = await fetchDeepProjectData(projectLinkEl.href);
            if (externalData) {
                description = externalData.description;
                data = { ...data, ...externalData };
            }
        }

        if (!description) {
            description = getProjectDescription();
        }

        const allTags = new Set();
        if (data.tags) {
            data.tags.split(',').forEach(t => {
                const cleaned = t.trim();
                if (cleaned && cleaned !== 'null') allTags.add(cleaned);
            });
        }
        data.tagsList = Array.from(allTags);
        data.description = description || "تعذر العثور على وصف تفصيلي.";

        if (!data.bids) {
            data.bids = [];
            const bidElements = document.querySelectorAll('#project-bids .bid');
            if (bidElements.length > 0) {
                bidElements.forEach(bid => {
                    const bidderNameEl = bid.querySelector('.profile__name bdi');
                    const bidderLinkEl = bid.querySelector('.profile__name a');
                    const bidderTitleEl = bid.querySelector('.bid__meta .title');
                    const bidTimeEl = bid.querySelector('.bid__meta .time time');
                    const bidContentEl = bid.querySelector('.bid__details .text-wrapper-div');
                    const bidTime = bidTimeEl ? bidTimeEl.getAttribute('datetime') : null;
                    data.bids.push({
                        name: bidderNameEl ? bidderNameEl.innerText.trim() : "مجهول",
                        link: bidderLinkEl ? bidderLinkEl.href : "#",
                        title: bidderTitleEl ? bidderTitleEl.innerText.trim() : "",
                        timeRaw: bidTime,
                        timeText: bidTimeEl ? bidTimeEl.innerText.trim() : "",
                        timeOffset: null,
                        content: bidContentEl ? bidContentEl.innerText.trim() : ""
                    });
                });
            }
        }

        let output = `تفاصيل المشروع:\n`;
        output += `العنوان: ${data.title}\n`;
        output += `الرابط: ${data.url}\n`;
        output += `الحالة: ${data.status}\n`;
        output += `الميزانية: ${data.budget}\n`;
        output += `مدة التنفيذ: ${data.duration}\n`;
        if (data.category && data.category !== 'غير معروف' && data.category !== 'Unknown') {
            output += `القسم: ${data.category}\n`;
        }
        output += `الوسوم: ${data.tagsList.join(', ')}\n\n`;
        output += `معلومات صاحب العمل:\n`;
        output += `الاسم: ${data.clientName}\n`;
        if (data.clientTitle) output += `الدور/التخصص: ${data.clientTitle}\n`;
        output += `معدل التوظيف: ${data.hiringRate || "غير معروف"}\n`;
        output += `تاريخ التسجيل: ${data.clientJoined || "غير معروف"}\n`;
        output += `المشاريع المفتوحة: ${data.openProjects || "0"}\n`;
        output += `مشاريع قيد التنفيذ: ${data.underwayProjects || "0"}\n`;
        output += `التواصلات الجارية: ${data.ongoingCommunications || "0"}\n\n`;
        output += `وصف المشروع:\n${data.description}\n\n`;

        return { text: output, data: data };
    } catch (e) {
        console.error("Error extracting project details:", e);
        return null;
    }
}

function extractMyProposalFull(externalProjectData = null) {
    try {
        const myName = document.querySelector('.user-menu__name')?.innerText.trim() ||
                       document.querySelector('#user-menu bdi')?.innerText.trim() ||
                       "غير معروف";

        if (externalProjectData && externalProjectData.bids) {
            const myBid = externalProjectData.bids.find(b => b.name && b.name.includes(myName));
            if (myBid) {
                const data = {
                    freelancer: myBid.name,
                    price: externalProjectData.budget || "-",
                    duration: externalProjectData.duration || "-",
                    content: myBid.content || "نص العرض غير متوفر",
                    attachments: []
                };
                let output = `عرضي الخاص (تم العثور عليه من صفحة المشروع):\nالمتقدم: ${data.freelancer}\nنص العرض:\n${data.content}\n`;
                return { text: output, data: data };
            }
        }

        const bidTab = document.querySelector('#bidTab');
        const targetProposal = bidTab?.querySelector('.bid') ||
                               document.querySelector('.proposal-item') ||
                               document.querySelector('.card-proposal') ||
                               document.querySelector('.bid');

        if (!targetProposal) return null;

        const nameNode = targetProposal.querySelector('.profile__name')?.cloneNode(true);
        if (nameNode) {
            const extra = nameNode.querySelector('.dropdown, .btn, .dropdown-toggle-default-sm');
            if (extra) extra.remove();
        }
        const name = nameNode ? nameNode.innerText.trim() : "غير معروف";

        let price = "";
        let duration = "";

        const metaCols = targetProposal.querySelectorAll('.vertical-meta-column');
        metaCols.forEach(col => {
            const title = col.querySelector('.meta-title')?.innerText.trim();
            const contentEl = col.querySelector('.meta-content')?.cloneNode(true);
            if (contentEl) {
                const hidden = contentEl.querySelectorAll('.hide, style, script, input');
                hidden.forEach(h => h.remove());
            }
            const content = contentEl ? contentEl.innerText.trim().replace(/\s+/g, ' ') : "";
            if (title && content) {
                if (title.includes('المبلغ')) price = content;
                else if (title.includes('التنفيذ')) duration = content;
            }
        });

        const contentEl = targetProposal.querySelector('.bid__details .text-wrapper-div') ||
                          targetProposal.querySelector('.text-wrapper-div');
        let content = contentEl ? contentEl.innerText.trim() : "";
        content = content.replace("... عرض المزيد", "").replace("عرض أقل", "").trim();

        const data = {
            freelancer: name,
            price: price,
            duration: duration,
            content: content || "نص العرض غير متوفر",
            attachments: Array.from(targetProposal.querySelectorAll('#bid-attachments .attachment a[href]'))
                .map(a => ({
                    url: a.href,
                    name: a.getAttribute('title') || a.innerText.trim()
                }))
        };

        let output = `عرضي الخاص:\nالمتقدم: ${name}\nالمبلغ: ${price}\nمدة التنفيذ: ${duration}\n\nنص العرض:\n${data.content}\n`;
        return { text: output, data: data };
    } catch (e) {
        console.error("Error extracting my proposal:", e);
        return null;
    }
}
