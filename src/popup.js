document.addEventListener('DOMContentLoaded', () => {
    loadItems();
    
    document.getElementById('openOptions').addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    });

    // 独立窗口功能
    const detachBtn = document.getElementById('detachWin');
    if (detachBtn) {
        // 如果当前已经是独立窗口类型，则隐藏该按钮，避免重复弹出
        if (chrome.extension.getViews({ type: 'popup' }).length === 0) { 
             // 简单的判断：如果不是默认的 popup 视图（例如是在 window 中打开的），隐藏按钮
             // 但 getViews 判定有时候比较模糊，我们可以通过查找 URL 参数或者窗口类型判断
        }
        
        detachBtn.addEventListener('click', () => {
            // 获取当前浏览器窗口的尺寸信息，使悬浮窗高度与浏览器一致，并吸附在右侧
            chrome.windows.getCurrent((win) => {
                const width = 360;
                const height = win.height || 600;
                const top = win.top || 0;
                // 计算位置：尝试对齐到当前浏览器窗口的右侧
                // 如果获取不到 left/width，就默认操作系统行为
                let left = (win.left !== undefined && win.width !== undefined) 
                    ? (win.left + win.width - width - 50) 
                    : undefined; 

                chrome.windows.create({
                    url: 'popup.html?mode=detached',
                    type: 'popup',
                    width: width,
                    height: height,
                    top: top,
                    left: left,
                    focused: true
                });
            });
        });
    }

    // 检查是否已经在独立窗口中，如果是，隐藏弹出按钮
    if (window.location.search.includes('mode=detached')) {
        if (detachBtn) detachBtn.style.display = 'none';
        document.body.classList.add('detached-mode');
    }

    document.getElementById('searchInput').addEventListener('input', (e) => {
        filterItems(e.target.value);
    });
});

let cachedItems = [];

function loadItems() {
    chrome.storage.local.get(['items'], (result) => {
        cachedItems = result.items || [];
        renderList(cachedItems);
    });
}

function renderList(items, expandAll = false) {
    const listContainer = document.getElementById('contentList');
    listContainer.innerHTML = '';

    if (!items || items.length === 0) {
        listContainer.innerHTML = '<div class="empty-msg">没有数据<br>请点击右上角设置添加</div>';
        return;
    }

    // Group items, preserving order of first appearance
    const groups = {};
    const groupOrder = [];

    items.forEach(item => {
        const groupName = item.group || '其他';
        if (!groups[groupName]) {
            groups[groupName] = [];
            groupOrder.push(groupName);
        }
        groups[groupName].push(item);
    });

    groupOrder.forEach(groupName => {
        // Group Header
        const header = document.createElement('div');
        header.className = 'group-title';
        // 默认折叠，除非要求展开
        if (!expandAll) header.classList.add('collapsed');

        header.innerHTML = `<span>${escapeHtml(groupName)}</span><span class="arrow">▼</span>`;
        
        // Group Container
        const groupContainer = document.createElement('div');
        groupContainer.className = 'group-items';
        if (!expandAll) groupContainer.classList.add('collapsed');

        // Toggle Logic
        header.addEventListener('click', () => {
            header.classList.toggle('collapsed');
            groupContainer.classList.toggle('collapsed');
        });

        listContainer.appendChild(header);
        listContainer.appendChild(groupContainer);

        // Group Items
        groups[groupName].forEach(item => {
            const el = document.createElement('div');
            el.className = 'list-item';
            el.title = item.content; // Tooltip shows full content
            el.innerHTML = `
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-preview">${escapeHtml(item.content)}</div>
            `;
            
            el.addEventListener('click', () => copyToClipboard(item.content));
            groupContainer.appendChild(el);
        });
    });
}


function filterItems(query) {
    const q = query.toLowerCase();
    const filtered = cachedItems.filter(item => 
        item.title.toLowerCase().includes(q) || 
        item.content.toLowerCase().includes(q) ||
        (item.group && item.group.toLowerCase().includes(q))
    );
    // 如果有搜索词，则展开结果；否则保持默认折叠
    const shouldExpand = q.length > 0;
    renderList(filtered, shouldExpand);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast();
    }).catch(err => {
        console.error('Copy failed', err);
    });
}

function showToast() {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 1500);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
