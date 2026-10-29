document.addEventListener('DOMContentLoaded', () => {
    loadItems();
    loadScenes();
    setupEventListeners();
});

const form = document.getElementById('itemForm');
const cancelBtn = document.getElementById('cancelBtn');
const itemsContainer = document.getElementById('itemsContainer');
const groupDataList = document.getElementById('groupList');

// Scene Elements
const newSceneNameInput = document.getElementById('newSceneName');
const saveSceneBtn = document.getElementById('saveSceneBtn');
const sceneListContainer = document.getElementById('sceneList');

// Dragging State
let dragSrcEl = null;

function setupEventListeners() {
    form.addEventListener('submit', handleFormSubmit);
    cancelBtn.addEventListener('click', resetForm);
    
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importData);

    saveSceneBtn.addEventListener('click', saveScene);
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('editId').value;
    const title = document.getElementById('title').value.trim();
    const group = document.getElementById('group').value.trim() || '未分组';
    const content = document.getElementById('content').value;

    if (!title || !content) return;

    const newItem = {
        id: id || Date.now().toString(),
        title,
        group,
        content,
        createdAt: id ? undefined : Date.now() 
    };

    saveItem(newItem);
}

function saveItem(item) {
    chrome.storage.local.get(['items'], (result) => {
        let items = result.items || [];
        
        const existingIndex = items.findIndex(i => i.id === item.id);
        
        if (existingIndex > -1) {
            items[existingIndex] = { ...items[existingIndex], ...item };
        } else {
            items.push(item);
        }

        chrome.storage.local.set({ items }, () => {
            resetForm();
            loadItems();
            showStatus('保存成功');
        });
    });
}

function loadItems() {
    chrome.storage.local.get(['items'], (result) => {
        const items = result.items || [];
        renderList(items);
        updateGroupList(items);
    });
}

// ------ RENDERING & DRAG DROP ------

function renderList(items) {
    itemsContainer.innerHTML = '';
    
    if (items.length === 0) {
        itemsContainer.innerHTML = '<div class="empty-state">暂无数据，请在上方添加。</div>';
        return;
    }
    
    // Group items. We need to preserve the relative order of groups based on the first appearance of the group?
    // Or just let user have groups sorted?
    // PRD says "Drag sort".
    
    const groups = {};
    const groupOrder = []; 

    items.forEach(item => {
        const g = item.group || '未分组';
        if (!groups[g]) {
            groups[g] = [];
            groupOrder.push(g);
        }
        groups[g].push(item);
    });

    // Now render each group
    groupOrder.sort(); 

    groupOrder.forEach(groupName => {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';
        groupHeader.textContent = groupName;
        itemsContainer.appendChild(groupHeader);

        const groupItems = groups[groupName];
        groupItems.forEach(item => {
            const el = createItemElement(item);
            itemsContainer.appendChild(el);
        });
    });
}

function createItemElement(item) {
    const div = document.createElement('div');
    div.className = 'item-card';
    div.draggable = true; // Make it draggable
    div.dataset.id = item.id;
    div.dataset.group = item.group; 

    div.innerHTML = `
        <div class="item-info">
            <div class="item-title">${escapeHtml(item.title)}</div>
            <div class="item-preview">${escapeHtml(item.content)}</div>
        </div>
        <div class="item-actions">
            <button class="edit-btn secondary-btn" data-id="${item.id}">编辑</button>
            <button class="delete-btn" data-id="${item.id}">删除</button>
        </div>
    `;

    div.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent drag
        editItem(item)
    });
    div.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent drag
        deleteItem(item.id)
    });

    // Drag Events
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragenter', handleDragEnter);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('dragleave', handleDragLeave);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);

    return div;
}

// ------ DRAG & DROP HANDLERS ------

function handleDragStart(e) {
    this.classList.add('dragging');
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault(); // Necessary. Allows us to drop.
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('over');
}

function handleDragLeave(e) {
    this.classList.remove('over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation(); 
    }

    if (dragSrcEl !== this) {
        itemsContainer.insertBefore(dragSrcEl, this);
        updateOrderAndGroupsFromDOM();
    }
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    
    let items = itemsContainer.querySelectorAll('.item-card');
    items.forEach(function (item) {
        item.classList.remove('over');
    });
}

function updateOrderAndGroupsFromDOM() {
    chrome.storage.local.get(['items'], (result) => {
        const originalItems = result.items || [];
        const itemMap = new Map(originalItems.map(i => [i.id, i]));
        
        const finalItems = [];
        let currentScanGroup = '默认分组';
        
        Array.from(itemsContainer.children).forEach(child => {
            if (child.classList.contains('group-header')) {
                currentScanGroup = child.textContent;
            } else if (child.classList.contains('item-card')) {
                const id = child.dataset.id;
                const itemData = itemMap.get(id);
                if (itemData) {
                    itemData.group = currentScanGroup;
                    finalItems.push(itemData);
                }
            }
        });

        chrome.storage.local.set({ items: finalItems }, () => {
            loadItems(); 
            showStatus('顺序已更新');
        });
    });
}


// ------ STANDARD CRUD ------

function editItem(item) {
    document.getElementById('editId').value = item.id;
    document.getElementById('title').value = item.title;
    document.getElementById('group').value = item.group;
    document.getElementById('content').value = item.content;
    
    document.querySelector('button[type="submit"]').textContent = '更新条目';
    cancelBtn.style.display = 'inline-block';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteItem(id) {
    if (!confirm('确定要删除这个条目吗？')) return;

    chrome.storage.local.get(['items'], (result) => {
        let items = result.items || [];
        items = items.filter(i => i.id !== id);
        
        chrome.storage.local.set({ items }, () => {
            loadItems();
            showStatus('已删除');
        });
    });
}

function resetForm() {
    form.reset();
    document.getElementById('editId').value = '';
    document.querySelector('button[type="submit"]').textContent = '保存条目';
    cancelBtn.style.display = 'none';
}

function updateGroupList(items) {
    const groups = new Set(items.map(i => i.group).filter(Boolean));
    groupDataList.innerHTML = '';
    groups.forEach(g => {
        const option = document.createElement('option');
        option.value = g;
        groupDataList.appendChild(option);
    });
}

// ------ SCENE MANAGEMENT ------

function loadScenes() {
    chrome.storage.local.get(['scenes'], (result) => {
        const scenes = result.scenes || {};
        renderScenes(scenes);
    });
}

function saveScene() {
    const name = newSceneNameInput.value.trim();
    if (!name) {
        alert('请输入场景名称');
        return;
    }

    chrome.storage.local.get(['items', 'scenes'], (result) => {
        const items = result.items || [];
        const scenes = result.scenes || {};
        
        if (items.length === 0) {
            alert('当前列表为空，无法保存为场景');
            return;
        }

        if (scenes[name] && !confirm(`场景 "${name}" 已存在，要覆盖吗？`)) {
            return;
        }

        scenes[name] = items;
        
        chrome.storage.local.set({ scenes }, () => {
            newSceneNameInput.value = '';
            loadScenes();
            alert('场景保存成功');
        });
    });
}

function renderScenes(scenes) {
    sceneListContainer.innerHTML = '';
    
    const names = Object.keys(scenes);
    if (names.length === 0) {
        sceneListContainer.innerHTML = '<div class="hint">暂无已存场景</div>';
        return;
    }

    names.forEach(name => {
        const div = document.createElement('div');
        div.className = 'scene-item';
        div.innerHTML = `
            <span>${escapeHtml(name)} (${scenes[name].length} 条目)</span>
            <div class="scene-actions">
                <button class="restore-btn" data-name="${escapeHtml(name)}">加载/还原</button>
                <button class="delete-btn" data-name="${escapeHtml(name)}">删除</button>
            </div>
        `;
        
        div.querySelector('.restore-btn').addEventListener('click', () => loadScene(name));
        div.querySelector('.delete-btn').addEventListener('click', () => deleteScene(name));
        
        sceneListContainer.appendChild(div);
    });
}

function loadScene(name) {
    if (!confirm(`确定要加载场景 "${name}" 吗？\\n当前未保存的列表将被覆盖！`)) return;

    chrome.storage.local.get(['scenes'], (result) => {
        const scenes = result.scenes || {};
        const items = scenes[name];
        
        if (items) {
            chrome.storage.local.set({ items }, () => {
                loadItems();
                showStatus(`已加载场景: ${name}`);
            });
        }
    });
}

function deleteScene(name) {
    if (!confirm(`确定要删除场景 "${name}" 吗？`)) return;

    chrome.storage.local.get(['scenes'], (result) => {
        const scenes = result.scenes || {};
        delete scenes[name];
        
        chrome.storage.local.set({ scenes }, () => {
            loadScenes();
        });
    });
}


// ------ UTILS ------

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showStatus(msg) {
    console.log(msg);
}

function exportData() {
    chrome.storage.local.get(['items', 'scenes'], (result) => {
        const blob = new Blob([JSON.stringify(result, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'form-helper-backup.json';
        a.click();
    });
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            // Handle legacy format (array only) vs new format (object with items/scenes)
            let items = [];
            let scenes = {};
            
            if (Array.isArray(data)) {
                items = data;
            } else {
                items = data.items || [];
                scenes = data.scenes || {};
            }

            chrome.storage.local.set({ items, scenes }, () => {
                alert('导入成功！');
                loadItems();
                loadScenes();
            });
        } catch (err) {
            alert('文件解析失败');
        }
    };
    reader.readAsText(file);
}
