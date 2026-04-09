// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
    apiKey: "AIzaSyBgQ-NRH_UFKwEt0PybJ3y2zKGvRSqvLoU",
    authDomain: "portfolio-70f03.firebaseapp.com",
    databaseURL: "https://portfolio-70f03-default-rtdb.firebaseio.com",
    projectId: "portfolio-70f03",
    storageBucket: "portfolio-70f03.firebasestorage.app",
    messagingSenderId: "815368927704",
    appId: "1:815368927704:web:119b288294c5b26d2e1aad"
};

let database;
try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log("✅ Firebase ready");
} catch(e) { console.warn(e); }

// DOM elements
const csvFileInput = document.getElementById('csvFile');
const uploadBtn = document.getElementById('uploadBtn');
const loadBtn = document.getElementById('loadBtn');
const deleteBtn = document.getElementById('deleteBtn');
const statusDiv = document.getElementById('status');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const batchInfo = document.getElementById('batchInfo');
const totalRowsElem = document.getElementById('totalRows');
const uploadSpeedElem = document.getElementById('uploadSpeed');
const batchProgressElem = document.getElementById('batchProgress');
const filteredCountSpan = document.getElementById('filteredCount');
const excelContainer = document.getElementById('excelTableContainer');
const filterPanelArea = document.getElementById('filterPanelArea');
const columnManagerArea = document.getElementById('columnManagerArea');
const dynamicFilterCards = document.getElementById('dynamicFilterCards');
const activeFilterChips = document.getElementById('activeFilterChips');
const tableHeader = document.getElementById('tableHeader');
const tableBody = document.getElementById('tableBody');
const mainFilterContainer = document.getElementById('mainFilterContainer');
const columnToggleGroup = document.getElementById('columnToggleGroup');
const resetColumnVisibilityBtn = document.getElementById('resetColumnVisibilityBtn');
const adminSection = document.getElementById('adminSection');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminBadge = document.getElementById('adminBadge');
const lastUpdatedTimeSpan = document.getElementById('lastUpdatedTime');

// Admin state - checking from Firebase
let isAdminLoggedIn = false;
let currentAdminUser = null;
let currentMetadata = null;

// Data state variables
let rawDataset = [];
let currentHeaders = [];
let filteredSortedData = [];
let currentPage = 1;
const rowsPerPage = 100;
let columnSearchTexts = {};
let columnSelectedValues = {};
let sortConfig = { column: null, direction: 'asc' };
let columnVisibility = {};
let activeDropdown = null;

const STORAGE_KEYS = {
    FILTER_TEXTS: 'csv_persist_filter_texts',
    FILTER_SELECTED: 'csv_persist_filter_selected',
    SORT_COL: 'csv_persist_sort_col',
    SORT_DIR: 'csv_persist_sort_dir',
    COLUMN_VISIBILITY: 'csv_persist_column_visibility'
};

// Helper: Format timestamp nicely
function formatTimestamp(timestamp) {
    if (!timestamp) return '—';
    try {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: true 
        });
    } catch(e) {
        return String(timestamp);
    }
}

function updateLastUpdatedDisplay(metadata) {
    if (metadata && metadata.timestamp) {
        lastUpdatedTimeSpan.innerHTML = `${formatTimestamp(metadata.timestamp)} <span style="font-size:10px; opacity:0.7;">(${metadata.fileName || 'CSV'})</span>`;
        lastUpdatedTimeSpan.title = `Full timestamp: ${metadata.timestamp}`;
    } else if (metadata && metadata.uploadDate) {
        lastUpdatedTimeSpan.textContent = formatTimestamp(metadata.uploadDate);
    } else {
        lastUpdatedTimeSpan.textContent = '—';
    }
}

function showStatus(msg, type) { 
    if (!statusDiv) return;
    statusDiv.innerHTML = msg; 
    statusDiv.className = `status ${type}`; 
    setTimeout(() => { if(statusDiv.innerHTML === msg) { statusDiv.innerHTML = ''; statusDiv.className = 'status'; } }, 4000);
}

function escapeHtml(str) { 
    if(!str) return ''; 
    return String(str).replace(/[&<>]/g, function(m){ 
        if(m === '&') return '&amp;'; 
        if(m === '<') return '&lt;'; 
        if(m === '>') return '&gt;'; 
        return m;
    }); 
}

// ---------- CHECK EXISTING SESSION ----------
function checkExistingAdminSession() {
    const savedSession = localStorage.getItem('csv_admin_session');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            if (session.loggedIn && session.expiry > Date.now()) {
                isAdminLoggedIn = true;
                currentAdminUser = session.username;
                adminSection.classList.add('visible');
                adminBadge.innerHTML = `<span class="admin-logged-badge">✅ Admin: ${escapeHtml(session.username)} | <button id="logoutBtn" style="background:none; border:none; color:white; cursor:pointer; margin-left:6px;">🚪 Logout</button></span>`;
                const logoutBtn = document.getElementById('logoutBtn');
                if (logoutBtn) logoutBtn.addEventListener('click', logoutAdmin);
                showStatus(`Welcome back, ${session.username}!`, "success");
                if (rawDataset.length === 0 && database) loadLatestData();
            } else {
                localStorage.removeItem('csv_admin_session');
            }
        } catch(e) { localStorage.removeItem('csv_admin_session'); }
    }
}

function logoutAdmin() {
    localStorage.removeItem('csv_admin_session');
    isAdminLoggedIn = false;
    currentAdminUser = null;
    adminSection.classList.remove('visible');
    adminBadge.innerHTML = '';
    showStatus("Logged out successfully", "info");
}

// ---------- ADMIN LOGIN WITH FIREBASE AUTH (from adminUsers) ----------
async function validateAdminWithDB(username, password) {
    if (!database) throw new Error("Firebase not connected");
    const adminRef = database.ref('adminUsers');
    const snapshot = await adminRef.orderByChild('username').equalTo(username).once('value');
    if (!snapshot.exists()) {
        throw new Error("Admin account not found. Please contact administrator.");
    }
    let matchedUser = null;
    snapshot.forEach(child => {
        const user = child.val();
        if (user.username === username) {
            matchedUser = { id: child.key, ...user };
        }
    });
    if (!matchedUser) throw new Error("Invalid credentials");
    if (matchedUser.password !== password) {
        throw new Error("Incorrect password");
    }
    return matchedUser;
}

function showAdminModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>🔐 Admin Login</h3>
            <input type="text" id="adminUsername" placeholder="Username" autocomplete="off">
            <input type="password" id="adminPassword" placeholder="Password">
            <div id="modalError" class="error-msg"></div>
            <div class="modal-buttons">
                <button id="modalLoginBtn">Login</button>
                <button id="modalCancelBtn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const usernameInput = modal.querySelector('#adminUsername');
    const passwordInput = modal.querySelector('#adminPassword');
    const loginBtn = modal.querySelector('#modalLoginBtn');
    const cancelBtn = modal.querySelector('#modalCancelBtn');
    const errorDiv = modal.querySelector('#modalError');
    
    const tryLogin = async () => {
        const user = usernameInput.value.trim();
        const pass = passwordInput.value;
        if (!user || !pass) {
            errorDiv.textContent = "Please enter username and password";
            return;
        }
        loginBtn.disabled = true;
        loginBtn.textContent = "Verifying...";
        try {
            const adminUser = await validateAdminWithDB(user, pass);
            isAdminLoggedIn = true;
            currentAdminUser = adminUser.username;
            const session = {
                loggedIn: true,
                username: adminUser.username,
                expiry: Date.now() + (60 * 60 * 1000)
            };
            localStorage.setItem('csv_admin_session', JSON.stringify(session));
            adminSection.classList.add('visible');
            adminBadge.innerHTML = `<span class="admin-logged-badge">✅ Admin: ${escapeHtml(adminUser.username)} | <button id="logoutBtn" style="background:none; border:none; color:white; cursor:pointer; margin-left:6px;">🚪 Logout</button></span>`;
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) logoutBtn.addEventListener('click', logoutAdmin);
            showStatus(`Admin access granted. Welcome ${adminUser.username}!`, "success");
            modal.remove();
            if (rawDataset.length === 0 && database) loadLatestData();
        } catch (err) {
            errorDiv.textContent = err.message;
            console.error(err);
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = "Login";
        }
    };
    
    loginBtn.addEventListener('click', tryLogin);
    cancelBtn.addEventListener('click', () => modal.remove());
    usernameInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') tryLogin(); });
    passwordInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') tryLogin(); });
}

// ---------- FILTER AND SORT FUNCTIONS ----------
function saveAllPreferences() {
    if (!currentHeaders.length) return;
    try {
        localStorage.setItem(STORAGE_KEYS.FILTER_TEXTS, JSON.stringify(columnSearchTexts));
        const selectedSerialized = {};
        for (let col in columnSelectedValues) {
            if (columnSelectedValues[col] && columnSelectedValues[col].size) {
                selectedSerialized[col] = Array.from(columnSelectedValues[col]);
            }
        }
        localStorage.setItem(STORAGE_KEYS.FILTER_SELECTED, JSON.stringify(selectedSerialized));
        localStorage.setItem(STORAGE_KEYS.SORT_COL, sortConfig.column || '');
        localStorage.setItem(STORAGE_KEYS.SORT_DIR, sortConfig.direction);
        localStorage.setItem(STORAGE_KEYS.COLUMN_VISIBILITY, JSON.stringify(columnVisibility));
    } catch(e) { console.warn("Save prefs error", e); }
}

function loadPreferencesIntoState() {
    try {
        const savedTexts = localStorage.getItem(STORAGE_KEYS.FILTER_TEXTS);
        if (savedTexts) {
            const parsed = JSON.parse(savedTexts);
            const validTexts = {};
            for (let h of currentHeaders) if (parsed[h]) validTexts[h] = parsed[h];
            columnSearchTexts = validTexts;
        }
        const savedSelected = localStorage.getItem(STORAGE_KEYS.FILTER_SELECTED);
        if (savedSelected) {
            const parsedSel = JSON.parse(savedSelected);
            const validSelected = {};
            for (let h of currentHeaders) {
                if (parsedSel[h] && Array.isArray(parsedSel[h])) {
                    validSelected[h] = new Set(parsedSel[h]);
                }
            }
            columnSelectedValues = validSelected;
        }
        const savedSortCol = localStorage.getItem(STORAGE_KEYS.SORT_COL);
        const savedSortDir = localStorage.getItem(STORAGE_KEYS.SORT_DIR);
        if (savedSortCol && currentHeaders.includes(savedSortCol)) {
            sortConfig.column = savedSortCol;
            sortConfig.direction = (savedSortDir === 'asc' || savedSortDir === 'desc') ? savedSortDir : 'asc';
        } else {
            sortConfig = { column: null, direction: 'asc' };
        }
        const savedVis = localStorage.getItem(STORAGE_KEYS.COLUMN_VISIBILITY);
        if (savedVis) {
            const parsedVis = JSON.parse(savedVis);
            const validVis = {};
            for (let h of currentHeaders) {
                validVis[h] = parsedVis[h] !== undefined ? parsedVis[h] : true;
            }
            columnVisibility = validVis;
        } else {
            currentHeaders.forEach(h => { columnVisibility[h] = true; });
        }
    } catch(e) { console.warn("Load prefs error", e); }
}

function isHintMatch(cellValue, searchRaw) {
    if (!searchRaw || searchRaw.trim() === "") return true;
    const cellStr = String(cellValue).toLowerCase().trim();
    const searchTerm = searchRaw.toLowerCase().trim();
    if (cellStr.includes(searchTerm)) return true;
    if (searchTerm.endsWith('s') && searchTerm.length > 3) {
        const singular = searchTerm.slice(0, -1);
        if (singular.length >= 3 && cellStr.includes(singular)) return true;
    }
    if (!searchTerm.endsWith('s') && searchTerm.length > 2) {
        if (cellStr.includes(searchTerm + 's')) return true;
    }
    const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 'able'];
    for (let suffix of suffixes) {
        if (searchTerm.endsWith(suffix)) {
            const base = searchTerm.slice(0, -suffix.length);
            if (base.length >= 3 && cellStr.includes(base)) return true;
        }
        if (cellStr.includes(searchTerm + suffix)) return true;
    }
    const words = cellStr.split(/\s+/);
    for (let w of words) {
        if (w.startsWith(searchTerm) && searchTerm.length >= 3) return true;
        if (searchTerm.startsWith(w) && w.length >= 3 && searchTerm.includes(w)) return true;
    }
    return false;
}

function highlightTextWithHint(cellText, searchTerm) {
    if (!searchTerm || !cellText) return escapeHtml(String(cellText));
    const str = String(cellText);
    const lowerStr = str.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    let matchStart = lowerStr.indexOf(lowerSearch);
    if (matchStart === -1 && searchTerm.length > 2) {
        if (lowerSearch.endsWith('s')) {
            const singular = lowerSearch.slice(0, -1);
            matchStart = lowerStr.indexOf(singular);
        } else if (!lowerSearch.endsWith('s')) {
            matchStart = lowerStr.indexOf(lowerSearch + 's');
        }
    }
    if (matchStart !== -1) {
        const matchEnd = matchStart + (matchStart + lowerSearch.length <= lowerStr.length ? lowerSearch.length : 3);
        const before = escapeHtml(str.substring(0, matchStart));
        const matchPart = escapeHtml(str.substring(matchStart, matchEnd));
        const after = escapeHtml(str.substring(matchEnd));
        return `${before}<span class="highlight-match">${matchPart}</span>${after}`;
    }
    return escapeHtml(str);
}

function isAnyFilterActive() {
    for (let col of currentHeaders) {
        const hasText = columnSearchTexts[col] && columnSearchTexts[col].trim() !== "";
        const hasSet = columnSelectedValues[col] && columnSelectedValues[col].size > 0;
        if (hasText || hasSet) return true;
    }
    return false;
}

function isColumnFilterActive(col) {
    const hasText = columnSearchTexts[col] && columnSearchTexts[col].trim() !== "";
    const hasSet = columnSelectedValues[col] && columnSelectedValues[col].size > 0;
    return hasText || hasSet;
}

function updateFilterContainerHighlight() {
    if (mainFilterContainer) {
        if (isAnyFilterActive()) mainFilterContainer.classList.add('has-active-filters');
        else mainFilterContainer.classList.remove('has-active-filters');
    }
    document.querySelectorAll('.filter-card').forEach(card => {
        const labelElem = card.querySelector('label');
        if (labelElem) {
            let colTitle = labelElem.getAttribute('title') || labelElem.innerText;
            let matchedCol = currentHeaders.find(h => h === colTitle || colTitle.includes(h) || h.includes(colTitle.replace('..',''))) || colTitle;
            if (matchedCol && isColumnFilterActive(matchedCol)) card.classList.add('has-column-filter');
            else card.classList.remove('has-column-filter');
        }
    });
}

function applyFiltersAndSort() {
    if (!rawDataset.length) {
        filteredSortedData = [];
        if(filteredCountSpan) filteredCountSpan.textContent = "0";
        return [];
    }
    let result = [...rawDataset];
    for (let col of currentHeaders) {
        const searchText = columnSearchTexts[col] || "";
        const selectedSet = columnSelectedValues[col];
        if (searchText === "" && (!selectedSet || selectedSet.size === 0)) continue;
        result = result.filter(row => {
            let cellVal = row[col] !== undefined && row[col] !== null ? String(row[col]) : "";
            if (searchText !== "" && !isHintMatch(cellVal, searchText)) return false;
            if (selectedSet && selectedSet.size > 0) return selectedSet.has(cellVal);
            return true;
        });
    }
    if (sortConfig.column && currentHeaders.includes(sortConfig.column)) {
        const col = sortConfig.column;
        const dir = sortConfig.direction;
        result.sort((a,b) => {
            let valA = a[col] !== undefined ? String(a[col]) : "";
            let valB = b[col] !== undefined ? String(b[col]) : "";
            let numA = parseFloat(valA), numB = parseFloat(valB);
            let isNumA = !isNaN(numA) && isFinite(valA) && valA.trim() !== "";
            let isNumB = !isNaN(numB) && isFinite(valB) && valB.trim() !== "";
            if (isNumA && isNumB) return dir === 'asc' ? numA - numB : numB - numA;
            let comp = valA.localeCompare(valB);
            return dir === 'asc' ? comp : -comp;
        });
    }
    filteredSortedData = result;
    if(filteredCountSpan) filteredCountSpan.textContent = filteredSortedData.length.toLocaleString();
    return filteredSortedData;
}

function persistAndRefreshUI() {
    saveAllPreferences();
    applyFiltersAndSort();
    currentPage = 1;
    renderTable();
    updateFilterChipsDisplay();
    updateFilterContainerHighlight();
    if (currentHeaders.length) renderColumnManager();
}

function renderColumnManager() {
    if (!currentHeaders.length) return;
    columnToggleGroup.innerHTML = '';
    currentHeaders.forEach(col => {
        const isVisible = columnVisibility[col] !== false;
        const btn = document.createElement('button');
        btn.className = `column-toggle-btn ${isVisible ? 'active-col' : 'hidden-col'}`;
        btn.textContent = col.length > 20 ? col.slice(0, 18) + '..' : col;
        btn.title = `Toggle ${col}`;
        btn.addEventListener('click', () => {
            columnVisibility[col] = !isVisible;
            renderColumnManager();
            persistAndRefreshUI();
        });
        columnToggleGroup.appendChild(btn);
    });
}

function resetColumnVisibility() {
    currentHeaders.forEach(col => { columnVisibility[col] = true; });
    renderColumnManager();
    persistAndRefreshUI();
    showStatus("All columns visible", "success");
}

function renderTable() {
    if (!filteredSortedData.length) {
        tableBody.innerHTML = `<tr><td colspan="100" class="empty-placeholder">📭 No matching records. Adjust column filters.</td></tr>`;
        document.getElementById('pagination').style.display = 'none';
        return;
    }
    const start = (currentPage - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, filteredSortedData.length);
    const pageRows = filteredSortedData.slice(start, end);
    const visibleHeaders = currentHeaders.filter(col => columnVisibility[col] !== false);
    if (visibleHeaders.length === 0) {
        tableBody.innerHTML = `<tr><td class="empty-placeholder">⚠️ All columns hidden. Use column manager.</td></tr>`;
        tableHeader.innerHTML = '<tr><th>No Columns Visible</th></tr>';
        document.getElementById('pagination').style.display = 'none';
        return;
    }
    let highlightTerm = "";
    for (let col of currentHeaders) if (columnSearchTexts[col] && columnSearchTexts[col].trim()) { highlightTerm = columnSearchTexts[col]; break; }
    
    let theadHtml = '<tr>';
    for (let h of visibleHeaders) {
        let sortIndicator = '';
        if (sortConfig.column === h) sortIndicator = sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
        else sortIndicator = ' ↕️';
        theadHtml += `<th data-sort-col="${escapeHtml(h)}"><span class="th-sort">${escapeHtml(h)}<span class="sort-arrow">${sortIndicator}</span></span></th>`;
    }
    theadHtml += '</tr>';
    tableHeader.innerHTML = theadHtml;
    
    document.querySelectorAll('#tableHeader th').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort-col');
            if (sortConfig.column === col) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
            else { sortConfig.column = col; sortConfig.direction = 'asc'; }
            persistAndRefreshUI();
        });
    });
    
    let tbodyHtml = '';
    for (let row of pageRows) {
        tbodyHtml += '<tr>';
        for (let h of visibleHeaders) {
            let val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
            let displayVal = val.length > 80 ? val.substring(0, 77) + '...' : val;
            if (highlightTerm) displayVal = highlightTextWithHint(val, highlightTerm);
            else displayVal = escapeHtml(displayVal);
            tbodyHtml += `<td title="${escapeHtml(val)}">${displayVal}</td>`;
        }
        tbodyHtml += '</tr>';
    }
    tableBody.innerHTML = tbodyHtml;
    
    const totalPages = Math.ceil(filteredSortedData.length / rowsPerPage);
    const paginationDiv = document.getElementById('pagination');
    if (totalPages <= 1) paginationDiv.style.display = 'none';
    else {
        paginationDiv.style.display = 'flex';
        document.getElementById('pageInfo').innerHTML = `Page ${currentPage} of ${totalPages}`;
        document.getElementById('prevPage').disabled = (currentPage === 1);
        document.getElementById('nextPage').disabled = (currentPage === totalPages);
    }
}

function rebuildFilterCards() {
    if (!currentHeaders.length) return;
    dynamicFilterCards.innerHTML = '';
    for (let col of currentHeaders) {
        const currentText = columnSearchTexts[col] || '';
        const uniqueValsSet = new Set();
        for (let row of rawDataset) {
            let v = row[col] !== undefined && row[col] !== null ? String(row[col]) : "(blank)";
            uniqueValsSet.add(v);
        }
        const uniqueVals = Array.from(uniqueValsSet).sort();
        const selectedCount = columnSelectedValues[col] ? columnSelectedValues[col].size : 0;
        const card = document.createElement('div');
        card.className = 'filter-card';
        card.innerHTML = `
            <label title="${escapeHtml(col)}">${escapeHtml(col.length > 20 ? col.slice(0,18)+'..' : col)}</label>
            <input type="text" class="filter-text-input" data-col="${escapeHtml(col)}" value="${escapeHtml(currentText)}">
            <div class="filter-stats">
                <span>📋 ${uniqueVals.length} unique</span>
                <span class="multi-select-trigger" data-col="${escapeHtml(col)}" style="cursor:pointer; color:#2c6e9e; font-weight:500;">🎯 ${selectedCount > 0 ? `${selectedCount} selected` : 'Select values'}</span>
            </div>
        `;
        dynamicFilterCards.appendChild(card);
    }
    attachFilterEvents();
    updateFilterChipsDisplay();
    updateFilterContainerHighlight();
}

function attachFilterEvents() {
    document.querySelectorAll('.filter-text-input').forEach(inp => {
        inp.removeEventListener('input', handleFilterInput);
        inp.addEventListener('input', handleFilterInput);
    });
    document.querySelectorAll('.multi-select-trigger').forEach(trigger => {
        trigger.removeEventListener('click', handleMultiSelect);
        trigger.addEventListener('click', handleMultiSelect);
    });
}

function handleFilterInput(e) {
    const col = e.target.getAttribute('data-col');
    columnSearchTexts[col] = e.target.value;
    persistAndRefreshUI();
}

function handleMultiSelect(e) {
    const col = e.target.getAttribute('data-col');
    showMultiSelectDropdown(col, e.target);
}

function showMultiSelectDropdown(columnName, anchorElement) {
    if (activeDropdown) activeDropdown.remove();
    const uniqueMap = new Map();
    for (let row of rawDataset) {
        let val = row[columnName] !== undefined && row[columnName] !== null ? String(row[columnName]) : "(blank)";
        uniqueMap.set(val, true);
    }
    const sortedValues = Array.from(uniqueMap.keys()).sort();
    const currentSelectedSet = columnSelectedValues[columnName] || new Set();
    const dropdown = document.createElement('div');
    dropdown.style.cssText = 'position:fixed; background:white; border:1px solid #ccc; border-radius:16px; box-shadow:0 6px 20px rgba(0,0,0,0.2); min-width:240px; z-index:1000; padding:12px;';
    dropdown.innerHTML = `
        <div style="font-weight:600; margin-bottom:8px;">Filter ${escapeHtml(columnName)}</div>
        <input type="text" id="dropdownSearch" placeholder="Search values..." style="width:100%; padding:8px; border-radius:30px; border:1px solid #ccc; margin-bottom:8px;">
        <div id="dropdownList" style="max-height:200px; overflow-y:auto; border-top:1px solid #eee; margin-top:6px;"></div>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
            <button id="dropdownOk" style="padding:4px 14px;">OK</button>
            <button id="dropdownClear" style="padding:4px 14px; background:#6c7a89;">Clear</button>
        </div>
    `;
    document.body.appendChild(dropdown);
    const rect = anchorElement.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
    dropdown.style.left = `${rect.left + window.scrollX - 60}px`;
    const listDiv = dropdown.querySelector('#dropdownList');
    const searchInput = dropdown.querySelector('#dropdownSearch');
    function renderList(filter = '') {
        let filtered = sortedValues.filter(v => filter === '' || v.toLowerCase().includes(filter.toLowerCase()));
        listDiv.innerHTML = '';
        filtered.forEach(val => {
            const isChecked = currentSelectedSet.has(val);
            const itemDiv = document.createElement('div');
            itemDiv.style.display = 'flex'; itemDiv.style.alignItems = 'center'; itemDiv.style.gap = '8px'; itemDiv.style.padding = '5px 0';
            itemDiv.innerHTML = `<input type="checkbox" value="${escapeHtml(val)}" ${isChecked ? 'checked' : ''}> <span style="font-size:12px;">${escapeHtml(val.length > 50 ? val.slice(0,47)+'...' : val)}</span>`;
            listDiv.appendChild(itemDiv);
        });
    }
    renderList();
    searchInput.addEventListener('input', (e) => renderList(e.target.value));
    dropdown.querySelector('#dropdownOk').addEventListener('click', () => {
        const checkboxes = dropdown.querySelectorAll('#dropdownList input[type="checkbox"]');
        const newSet = new Set();
        checkboxes.forEach(cb => { if(cb.checked) newSet.add(cb.value); });
        if (newSet.size > 0) columnSelectedValues[columnName] = newSet;
        else delete columnSelectedValues[columnName];
        persistAndRefreshUI();
        rebuildFilterCards();
        dropdown.remove();
        activeDropdown = null;
    });
    dropdown.querySelector('#dropdownClear').addEventListener('click', () => {
        delete columnSelectedValues[columnName];
        persistAndRefreshUI();
        rebuildFilterCards();
        dropdown.remove();
        activeDropdown = null;
    });
    activeDropdown = dropdown;
}

function updateFilterChipsDisplay() {
    let activeFilters = [];
    for (let col of currentHeaders) {
        let text = columnSearchTexts[col] || "";
        let selectedSet = columnSelectedValues[col];
        if (text !== "" || (selectedSet && selectedSet.size > 0)) {
            let desc = [];
            if (text) desc.push(`hint:"${text}"`);
            if (selectedSet && selectedSet.size) desc.push(`${selectedSet.size} values`);
            activeFilters.push({col, label: desc.join(' + ')});
        }
    }
    if (activeFilters.length === 0) {
        activeFilterChips.innerHTML = '<span style="font-size:12px;">✨ No active filters</span>';
    } else {
        let html = '<span style="font-size:12px;">🔍 Active filters:</span>';
        activeFilters.forEach(f => {
            html += `<div class="filter-chip">${escapeHtml(f.col)}: ${escapeHtml(f.label)} <button class="clear-chip" data-col="${escapeHtml(f.col)}">✖</button></div>`;
        });
        activeFilterChips.innerHTML = html;
        document.querySelectorAll('.clear-chip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const col = btn.getAttribute('data-col');
                delete columnSearchTexts[col];
                delete columnSelectedValues[col];
                persistAndRefreshUI();
                rebuildFilterCards();
            });
        });
    }
    updateFilterContainerHighlight();
}

function resetAllFilters() {
    columnSearchTexts = {};
    columnSelectedValues = {};
    sortConfig = { column: null, direction: 'asc' };
    persistAndRefreshUI();
    rebuildFilterCards();
    showStatus("All filters and sort reset", "info");
}

// ---------- FIREBASE DATA OPERATIONS ----------
async function loadLatestData() {
    if (!database) { showStatus("Firebase not ready", "error"); return; }
    try {
        if(loadBtn) loadBtn.disabled = true;
        const uploadsRef = database.ref('csvUploads');
        const snapshot = await uploadsRef.once('value');
        if (!snapshot.exists()) {
            tableBody.innerHTML = `<tr><td colspan="100">📭 No data. Upload a CSV (Admin only).</td></tr>`;
            rawDataset = []; filteredSortedData = []; totalRowsElem.innerText = '0'; filteredCountSpan.innerText = '0';
            excelContainer.style.display = 'none'; filterPanelArea.style.display = 'none'; columnManagerArea.style.display = 'none';
            updateLastUpdatedDisplay(null);
            return;
        }
        let latestUpload = null;
        snapshot.forEach(child => {
            const val = child.val();
            if (val.metadata && val.metadata.completed) {
                if (!latestUpload || val.metadata.timestamp > latestUpload.metadata.timestamp) latestUpload = { id: child.key, metadata: val.metadata, batches: val.batches || {} };
            }
        });
        if (!latestUpload) throw new Error("No completed dataset");
        const allRows = [];
        const batches = latestUpload.batches;
        for (let key of Object.keys(batches)) if (batches[key] && batches[key].data) allRows.push(...batches[key].data);
        rawDataset = allRows;
        currentMetadata = latestUpload.metadata;
        currentHeaders = latestUpload.metadata.headers || (rawDataset.length ? Object.keys(rawDataset[0]) : []);
        totalRowsElem.innerText = rawDataset.length.toLocaleString();
        
        updateLastUpdatedDisplay(currentMetadata);
        
        loadPreferencesIntoState();
        applyFiltersAndSort();
        currentPage = 1;
        excelContainer.style.display = 'block';
        filterPanelArea.style.display = 'block';
        columnManagerArea.style.display = 'block';
        rebuildFilterCards();
        renderColumnManager();
        renderTable();
        updateFilterChipsDisplay();
        updateFilterContainerHighlight();
        showStatus(`✅ Loaded ${rawDataset.length.toLocaleString()} rows — last updated: ${formatTimestamp(currentMetadata.timestamp)}`, "success");
    } catch (err) { console.error(err); showStatus("Load error: "+err.message, "error"); } finally { if(loadBtn) loadBtn.disabled = false; }
}

async function replaceWithNewData(data, headers, fileName, onProgress) { 
    await database.ref('csvUploads').remove();
    const uploadId = 'current_dataset_' + Date.now();
    const uploadRef = database.ref('csvUploads/' + uploadId);
    const batchSize = 1200;
    const totalBatches = Math.ceil(data.length / batchSize);
    await uploadRef.child('metadata').set({ timestamp: new Date().toISOString(), headers, totalRows: data.length, fileName, batchSize, totalBatches, completed: false });
    let completedBatches = 0;
    const startTime = Date.now();
    for (let i = 0; i < totalBatches; i++) {
        const batchData = data.slice(i * batchSize, Math.min((i+1)*batchSize, data.length));
        await uploadRef.child('batches').child(`batch_${i}`).set({ index: i, data: batchData });
        completedBatches++;
        const elapsed = (Date.now() - startTime)/1000;
        const rowsPerSec = Math.floor((i+1)*batchSize / elapsed);
        if(onProgress) onProgress({ completedBatches, totalBatches, rowsUploaded: (i+1)*batchSize, totalRows: data.length, rowsPerSecond: rowsPerSec, percentage: ((i+1)*batchSize/data.length)*100 });
        await new Promise(r => setTimeout(r, 50));
    }
    await uploadRef.child('metadata').update({ completed: true });
    return { uploadId, totalRows: data.length };
}

function parseLargeCSV(csvText) { 
    return new Promise((resolve, reject) => {
        const lines = csvText.split(/\r?\n/);
        if(lines.length<2) reject("empty");
        const headers = lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
        const data = [];
        for(let i=1;i<lines.length;i++) {
            if(!lines[i].trim()) continue;
            let row = [], cur='', inQuotes=false;
            for(let ch of lines[i]) {
                if(ch==='"') inQuotes=!inQuotes;
                else if(ch===',' && !inQuotes) { row.push(cur.trim()); cur=''; }
                else cur+=ch;
            }
            row.push(cur.trim());
            row = row.map(v=>v.replace(/^"|"$/g,''));
            let obj={}; headers.forEach((h,idx)=> obj[h]=row[idx]||'');
            data.push(obj);
        }
        resolve({ headers, data });
    });
}

// ---------- EVENT LISTENERS ----------
adminLoginBtn.addEventListener('click', showAdminModal);

if(uploadBtn) uploadBtn.addEventListener('click', async () => {
    if(!isAdminLoggedIn) { showStatus("Admin access required", "error"); return; }
    const file = csvFileInput.files[0];
    if(!file) return showStatus("Select CSV","error");
    uploadBtn.disabled=true; progressContainer.style.display='block';
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const { headers, data } = await parseLargeCSV(ev.target.result);
            await replaceWithNewData(data, headers, file.name, (prog) => {
                progressFill.style.width = `${prog.percentage}%`;
                progressFill.textContent = `${Math.floor(prog.percentage)}%`;
                batchInfo.innerText = `Batch ${prog.completedBatches}/${prog.totalBatches} | ${prog.rowsUploaded.toLocaleString()} rows | ${prog.rowsPerSecond.toLocaleString()} rows/sec`;
                batchProgressElem.innerText = prog.completedBatches;
                uploadSpeedElem.innerText = prog.rowsPerSecond;
            });
            showStatus("Upload complete! Data replaced.","success");
            await loadLatestData();
        } catch(err) { showStatus("Upload error: "+err.message,"error"); } finally { uploadBtn.disabled=false; progressContainer.style.display='none'; progressFill.style.width='0%'; }
    };
    reader.readAsText(file,"UTF-8");
});

if(deleteBtn) deleteBtn.addEventListener('click', async () => {
    if(!isAdminLoggedIn) { showStatus("Admin access required", "error"); return; }
    if(!confirm("Delete ALL data?")) return;
    await database.ref('csvUploads').remove();
    rawDataset=[]; filteredSortedData=[]; currentHeaders=[]; currentMetadata=null;
    totalRowsElem.innerText='0'; filteredCountSpan.innerText='0';
    excelContainer.style.display='none'; filterPanelArea.style.display='none'; columnManagerArea.style.display='none';
    updateLastUpdatedDisplay(null);
    showStatus("All data removed","success");
    localStorage.removeItem(STORAGE_KEYS.FILTER_TEXTS); localStorage.removeItem(STORAGE_KEYS.FILTER_SELECTED); localStorage.removeItem(STORAGE_KEYS.SORT_COL); localStorage.removeItem(STORAGE_KEYS.SORT_DIR); localStorage.removeItem(STORAGE_KEYS.COLUMN_VISIBILITY);
});

document.getElementById('applyAllFiltersBtn')?.addEventListener('click', () => persistAndRefreshUI());
document.getElementById('resetAllFiltersBtn')?.addEventListener('click', () => resetAllFilters());
resetColumnVisibilityBtn?.addEventListener('click', () => resetColumnVisibility());
if(loadBtn) loadBtn.addEventListener('click', loadLatestData);
document.getElementById('prevPage')?.addEventListener('click', () => { if(currentPage>1){ currentPage--; renderTable(); } });
document.getElementById('nextPage')?.addEventListener('click', () => { const total=Math.ceil(filteredSortedData.length/rowsPerPage); if(currentPage<total){ currentPage++; renderTable(); } });

// Initialize on page load
window.addEventListener('load', () => { 
    checkExistingAdminSession();
    if(database) loadLatestData(); 
    else showStatus("Firebase issue","error");
});