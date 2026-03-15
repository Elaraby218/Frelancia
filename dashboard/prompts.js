// ==========================================
// dashboard/prompts.js — Prompts rendering & CRUD
// ==========================================

function renderPrompts(prompts) {
    const list = document.getElementById('promptsList');
    if (!list) return;

    if (prompts.length === 0) {
        list.innerHTML = '<p class="help-text" style="grid-column: 1/-1; text-align: center; padding: 40px;">لا يوجد أوامر مضافة حالياً.</p>';
        return;
    }

    list.innerHTML = prompts.map((p, i) => `
        <div class="prompt-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <h4 style="font-weight: 800; font-size: 16px; color: var(--text-title);">${p.title}</h4>
                <div style="display: flex; gap: 8px;">
                    <button data-index="${i}" class="btn-icon btn-edit-prompt" style="background: none; border: none; color: var(--text-muted); cursor: pointer;"><i class="fas fa-edit"></i></button>
                    <button data-index="${i}" class="btn-icon btn-delete-prompt" style="background: none; border: none; color: var(--danger); cursor: pointer;"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <p style="font-size: 13px; color: var(--text-body); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${p.content}</p>
        </div>
    `).join('');

    setupPromptListeners();
}

function setupPromptListeners() {
    const list = document.getElementById('promptsList');
    if (!list || list.dataset.listenerSet) return;

    list.addEventListener('click', (e) => {
        const editBtn   = e.target.closest('.btn-edit-prompt');
        const deleteBtn = e.target.closest('.btn-delete-prompt');

        if (editBtn)   editPrompt(parseInt(editBtn.dataset.index));
        else if (deleteBtn) deletePrompt(parseInt(deleteBtn.dataset.index));
    });
    list.dataset.listenerSet = "true";
}

function editPrompt(index) {
    chrome.storage.local.get(['prompts'], (data) => {
        const p = (data.prompts || [])[index];
        if (p) openPromptModal(p, index);
    });
}

function deletePrompt(index) {
    if (!confirm('هل أنت متأكد من حذف هذا الأمر؟')) return;
    chrome.storage.local.get(['prompts'], (data) => {
        const prompts = data.prompts || [];
        prompts.splice(index, 1);
        chrome.storage.local.set({ prompts }, () => {
            renderPrompts(prompts);
            showSaveStatus();
        });
    });
}

function openPromptModal(prompt = null, index = -1) {
    const modal   = document.getElementById('promptModal');
    const titleEl = document.getElementById('promptTitle');
    const contentEl = document.getElementById('promptContent');
    const idField = document.getElementById('promptId');

    if (prompt) {
        document.getElementById('modalTitle').textContent = 'تعديل الأمر';
        titleEl.value   = prompt.title;
        contentEl.value = prompt.content;
        idField.value   = index;
    } else {
        document.getElementById('modalTitle').textContent = 'إضافة أمر جديد';
        titleEl.value   = '';
        contentEl.value = '';
        idField.value   = -1;
    }

    modal.classList.remove('hidden');
}

function savePromptFromModal() {
    const title   = document.getElementById('promptTitle').value.trim();
    const content = document.getElementById('promptContent').value.trim();
    const index   = parseInt(document.getElementById('promptId').value);

    if (!title || !content) {
        alert('يرجى ملء جميع الحقول');
        return;
    }

    chrome.storage.local.get(['prompts'], (data) => {
        const prompts = data.prompts || [];
        if (index >= 0) {
            prompts[index] = { ...prompts[index], title, content };
        } else {
            prompts.push({
                id: crypto.randomUUID(),
                title,
                content,
                createdAt: new Date().toISOString()
            });
        }
        chrome.storage.local.set({ prompts }, () => {
            document.getElementById('promptModal').classList.add('hidden');
            renderPrompts(prompts);
            showSaveStatus();
        });
    });
}
