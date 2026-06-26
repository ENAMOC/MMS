// ==================== FIREBASE CONFIG ====================
const firebaseConfig = {
    apiKey: "AIzaSyAbEQB9kQUAqS0eAlNGUx4Al_CsrhZ-Y58",
    authDomain: "mmsdata-44117.firebaseapp.com",
    databaseURL: "https://mmsdata-44117-default-rtdb.firebaseio.com",
    projectId: "mmsdata-44117",
    storageBucket: "mmsdata-44117.firebasestorage.app",
    messagingSenderId: "525548358076",
    appId: "1:525548358076:web:55375641f966d7966083b9",
    measurementId: "G-85BC57T8R5"
};


let database;
try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log("✅ Firebase ready");
} catch(e) { console.warn(e); }

// ==================== STRICT CREDENTIALS LOGIN ====================
const userLoginOverlay = document.getElementById('userLoginOverlay');
const dashboardContainer = document.getElementById('dashboardMainContainer');
const userLoginUsername = document.getElementById('userLoginUsername');
const userLoginPassword = document.getElementById('userLoginPassword');
const userLoginBtn = document.getElementById('userLoginSubmitBtn');
const userLoginError = document.getElementById('userLoginErrorMsg');
const userWelcomeBadge = document.getElementById('userWelcomeBadge');
let currentLoggedInUser = null;

async function validateUserCredentials(username, password) {
    if (!database) throw new Error("Firebase not connected");
    const adminRef = database.ref('adminUsers');
    const snapshot = await adminRef.orderByChild('username').equalTo(username).once('value');
    if (!snapshot.exists()) throw new Error("Invalid username or password");
    let validUser = null;
    snapshot.forEach(child => {
        const user = child.val();
        if (user.username === username && user.password === password) validUser = { id: child.key, ...user };
    });
    if (!validUser) throw new Error("Invalid username or password");
    return validUser;
}

function storeUserSession(user) {
    const session = { loggedIn: true, username: user.username, fullName: user.fullName || user.username, email: user.email || '', role: user.role || 'user', expiry: Date.now() + (8 * 60 * 60 * 1000) };
    localStorage.setItem('csv_user_session', JSON.stringify(session));
}

function checkExistingUserSession() {
    const saved = localStorage.getItem('csv_user_session');
    if (saved) {
        try {
            const session = JSON.parse(saved);
            if (session.loggedIn && session.expiry > Date.now()) return session;
            else localStorage.removeItem('csv_user_session');
        } catch(e) { localStorage.removeItem('csv_user_session'); }
    }
    return null;
}

function clearUserSession() { localStorage.removeItem('csv_user_session'); currentLoggedInUser = null; userWelcomeBadge.style.display = 'none'; }

async function performUserLogin(username, password) { const user = await validateUserCredentials(username, password); storeUserSession(user); return user; }

function showDashboardAfterLogin(user) {
    currentLoggedInUser = user;
    userLoginOverlay.style.display = 'none';
    dashboardContainer.style.display = 'block';
    const displayName = user.fullName || user.username;
    userWelcomeBadge.innerHTML = `👋 Welcome, ${escapeHtml(displayName)} | <button id="userLogoutBtn" style="background:none; border:none; color:white; cursor:pointer; margin-left:8px;">🚪 Logout</button>`;
    userWelcomeBadge.style.display = 'inline-flex';
    const logoutBtn = document.getElementById('userLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => { clearUserSession(); location.reload(); });
    initializeDashboard();
}

async function handleUserLogin() {
    const username = userLoginUsername.value.trim();
    const password = userLoginPassword.value;
    if (!username || !password) { userLoginError.style.display = 'block'; userLoginError.textContent = "Please enter username and password"; return; }
    userLoginBtn.disabled = true; userLoginBtn.textContent = "Verifying..."; userLoginError.style.display = 'none';
    try { const user = await performUserLogin(username, password); showDashboardAfterLogin(user); } 
    catch (err) { userLoginError.style.display = 'block'; userLoginError.textContent = err.message; userLoginBtn.disabled = false; userLoginBtn.textContent = "🔐 Sign In"; }
}

// ==================== DASHBOARD CODE ====================
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

let isAdminLoggedIn = false;
let currentAdminUser = null;
let currentMetadata = null;

function formatTimestamp(timestamp) {
    if (!timestamp) return '—';
    try { const date = new Date(timestamp); return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }); } 
    catch(e) { return String(timestamp); }
}

function sanitizeFirebaseKey(key) { return String(key).replace(/[\.#\$\/\[\]]/g, '_'); }
function sanitizeRowObject(row) { const clean = {}; for (let [k,v] of Object.entries(row)) clean[sanitizeFirebaseKey(k)] = v; return clean; }
function updateLastUpdatedDisplay(metadata) { if (metadata && metadata.timestamp) lastUpdatedTimeSpan.innerHTML = `${formatTimestamp(metadata.timestamp)} <span style="font-size:10px; opacity:0.7;">(${metadata.fileName || 'CSV'})</span>`; else lastUpdatedTimeSpan.textContent = '—'; }
function escapeHtml(str) { if(!str) return ''; return String(str).replace(/[&<>]/g, function(m){ if(m === '&') return '&amp;'; if(m === '<') return '&lt;'; if(m === '>') return '&gt;'; return m;}); }
function showStatus(msg, type) { if(statusDiv){ statusDiv.innerHTML = msg; statusDiv.className = `status ${type}`; setTimeout(() => { if(statusDiv.innerHTML === msg) statusDiv.innerHTML = ''; }, 4000); } }

let activeSpinner = null;
function showGlobalSpinner(message = 'Loading data...') { if (activeSpinner) hideGlobalSpinner(); const overlay = document.createElement('div'); overlay.className = 'global-spinner-overlay'; overlay.innerHTML = `<div class="spinner-card"><div class="spinner"></div><div class="spinner-text">${escapeHtml(message)}</div></div>`; document.body.appendChild(overlay); activeSpinner = overlay; }
function hideGlobalSpinner() { if (activeSpinner) { activeSpinner.remove(); activeSpinner = null; } }
function withSpinner(promise, message = 'Processing...') { showGlobalSpinner(message); return promise.finally(() => hideGlobalSpinner()); }

function checkExistingAdminSession() {
    const savedSession = localStorage.getItem('csv_admin_session');
    if (savedSession) {
        try {
            const session = JSON.parse(savedSession);
            if (session.loggedIn && session.expiry > Date.now()) {
                isAdminLoggedIn = true; currentAdminUser = session.username;
                adminSection.classList.add('visible');
                adminBadge.innerHTML = `<span class="admin-logged-badge">✅ Admin: ${escapeHtml(session.username)} | <button id="logoutBtn" style="background:none; border:none; color:white; cursor:pointer; margin-left:6px;">🚪 Logout</button></span>`;
                const logoutBtn = document.getElementById('logoutBtn');
                if (logoutBtn) logoutBtn.addEventListener('click', logoutAdmin);
                showStatus(`Welcome back, ${session.username}!`, "success");
            } else { localStorage.removeItem('csv_admin_session'); }
        } catch(e) { localStorage.removeItem('csv_admin_session'); }
    }
}

function logoutAdmin() { localStorage.removeItem('csv_admin_session'); isAdminLoggedIn = false; currentAdminUser = null; adminSection.classList.remove('visible'); adminBadge.innerHTML = ''; showStatus("Logged out successfully", "info"); }

async function validateAdminWithDB(username, password) {
    if (!database) throw new Error("Firebase not connected");
    const snapshot = await database.ref('adminUsers').orderByChild('username').equalTo(username).once('value');
    if (!snapshot.exists()) throw new Error("Admin account not found.");
    let matchedUser = null;
    snapshot.forEach(child => { const user = child.val(); if (user.username === username) matchedUser = { id: child.key, ...user }; });
    if (!matchedUser) throw new Error("Invalid credentials");
    if (matchedUser.password !== password) throw new Error("Incorrect password");
    return matchedUser;
}

function showAdminModal() {
    const modal = document.createElement('div'); modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal-content"><h3>🔐 Admin Login</h3><input type="text" id="adminUsername" placeholder="Username"><input type="password" id="adminPassword" placeholder="Password"><div id="modalError" class="error-msg"></div><div class="modal-buttons"><button id="modalLoginBtn">Login</button><button id="modalCancelBtn">Cancel</button></div></div>`;
    document.body.appendChild(modal);
    const usernameInput = modal.querySelector('#adminUsername'), passwordInput = modal.querySelector('#adminPassword'), loginBtnModal = modal.querySelector('#modalLoginBtn'), cancelBtn = modal.querySelector('#modalCancelBtn'), errorDiv = modal.querySelector('#modalError');
    const tryLogin = async () => {
        const user = usernameInput.value.trim(), pass = passwordInput.value;
        if (!user || !pass) { errorDiv.textContent = "Please enter credentials"; return; }
        loginBtnModal.disabled = true; loginBtnModal.textContent = "Verifying...";
        try {
            const adminUser = await validateAdminWithDB(user, pass);
            isAdminLoggedIn = true; currentAdminUser = adminUser.username;
            localStorage.setItem('csv_admin_session', JSON.stringify({ loggedIn: true, username: adminUser.username, expiry: Date.now() + (60 * 60 * 1000) }));
            adminSection.classList.add('visible');
            adminBadge.innerHTML = `<span class="admin-logged-badge">✅ Admin: ${escapeHtml(adminUser.username)} | <button id="logoutBtn" style="background:none; border:none; color:white; cursor:pointer;">🚪 Logout</button></span>`;
            const logoutBtn = document.getElementById('logoutBtn'); if (logoutBtn) logoutBtn.addEventListener('click', logoutAdmin);
            showStatus(`Admin access granted. Welcome ${adminUser.username}!`, "success");
            modal.remove();
            if (rawDataset.length === 0 && database) loadLatestData();
        } catch (err) { errorDiv.textContent = err.message; }
        finally { loginBtnModal.disabled = false; loginBtnModal.textContent = "Login"; }
    };
    loginBtnModal.addEventListener('click', tryLogin); cancelBtn.addEventListener('click', () => modal.remove());
    usernameInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') tryLogin(); });
    passwordInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') tryLogin(); });
}
adminLoginBtn.addEventListener('click', showAdminModal);

const STORAGE_KEYS = { FILTER_TEXTS: 'csv_persist_filter_texts', FILTER_SELECTED: 'csv_persist_filter_selected', SORT_COL: 'csv_persist_sort_col', SORT_DIR: 'csv_persist_sort_dir', COLUMN_VISIBILITY: 'csv_persist_column_visibility' };

let rawDataset = [], currentHeaders = [], filteredSortedData = [], currentPage = 1, rowsPerPage = 100;
let columnSearchTexts = {}, columnSelectedValues = {}, sortConfig = { column: null, direction: 'asc' }, columnVisibility = {};

function isHintMatch(cellValue, searchRaw) {
    if (!searchRaw || searchRaw.trim() === "") return true;
    const cellStr = String(cellValue).toLowerCase().trim(), searchTerm = searchRaw.toLowerCase().trim();
    if (cellStr.includes(searchTerm)) return true;
    if (searchTerm.endsWith('s') && searchTerm.length > 3) { const singular = searchTerm.slice(0, -1); if (singular.length >= 3 && cellStr.includes(singular)) return true; }
    return false;
}

function applyFiltersAndSort() {
    if (!rawDataset.length) { filteredSortedData = []; if(filteredCountSpan) filteredCountSpan.textContent = "0"; return []; }
    let result = [...rawDataset];
    for (let col of currentHeaders) {
        const searchText = columnSearchTexts[col] || "", selectedSet = columnSelectedValues[col];
        if (searchText === "" && (!selectedSet || selectedSet.size === 0)) continue;
        result = result.filter(row => {
            let cellVal = row[col] !== undefined && row[col] !== null ? String(row[col]) : "";
            if (searchText !== "" && !isHintMatch(cellVal, searchText)) return false;
            if (selectedSet && selectedSet.size > 0) return selectedSet.has(cellVal);
            return true;
        });
    }
    if (sortConfig.column && currentHeaders.includes(sortConfig.column)) {
        const col = sortConfig.column, dir = sortConfig.direction;
        result.sort((a,b) => {
            let valA = a[col] !== undefined ? String(a[col]) : "", valB = b[col] !== undefined ? String(b[col]) : "";
            let numA = parseFloat(valA), numB = parseFloat(valB);
            let isNumA = !isNaN(numA) && isFinite(valA) && valA.trim() !== "", isNumB = !isNaN(numB) && isFinite(valB) && valB.trim() !== "";
            if (isNumA && isNumB) return dir === 'asc' ? numA - numB : numB - numA;
            let comp = valA.localeCompare(valB);
            return dir === 'asc' ? comp : -comp;
        });
    }
    filteredSortedData = result;
    if(filteredCountSpan) filteredCountSpan.textContent = filteredSortedData.length.toLocaleString();
    return filteredSortedData;
}

function renderTable() { 
    if (!filteredSortedData.length) { tableBody.innerHTML = `<tr><td colspan="100" class="empty-placeholder">📭 No matching records. Adjust column filters.</td></tr>`; document.getElementById('pagination').style.display = 'none'; return; }
    const start = (currentPage - 1) * rowsPerPage, end = Math.min(start + rowsPerPage, filteredSortedData.length), pageRows = filteredSortedData.slice(start, end);
    const visibleHeaders = currentHeaders.filter(col => columnVisibility[col] !== false);
    if (visibleHeaders.length === 0) { tableBody.innerHTML = `<tr><td class="empty-placeholder">⚠️ All columns hidden. Use column manager.</td></tr>`; return; }
    let theadHtml = '<tr>';
    for (let h of visibleHeaders) { let sortIndicator = sortConfig.column === h ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ' ↕️'; theadHtml += `<th data-sort-col="${escapeHtml(h)}"><span class="th-sort">${escapeHtml(h)}<span class="sort-arrow">${sortIndicator}</span></span></th>`; }
    theadHtml += '</tr>'; tableHeader.innerHTML = theadHtml;
    document.querySelectorAll('#tableHeader th').forEach(th => { th.addEventListener('click', () => { const col = th.getAttribute('data-sort-col'); if (sortConfig.column === col) sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc'; else { sortConfig.column = col; sortConfig.direction = 'asc'; } persistAndRefreshUI(); }); });
    let tbodyHtml = '';
    for (let row of pageRows) { tbodyHtml += '<tr>'; for (let h of visibleHeaders) { let val = row[h] !== undefined && row[h] !== null ? String(row[h]) : ''; tbodyHtml += `<td title="${escapeHtml(val)}">${escapeHtml(val.length > 80 ? val.slice(0,77)+'...' : val)}</td>`; } tbodyHtml += '</tr>'; }
    tableBody.innerHTML = tbodyHtml;
    const totalPages = Math.ceil(filteredSortedData.length / rowsPerPage), paginationDiv = document.getElementById('pagination');
    if (totalPages <= 1) paginationDiv.style.display = 'none';
    else { paginationDiv.style.display = 'flex'; document.getElementById('pageInfo').innerHTML = `Page ${currentPage} of ${totalPages}`; document.getElementById('prevPage').disabled = (currentPage === 1); document.getElementById('nextPage').disabled = (currentPage === totalPages); }
}

function saveAllPreferences() {
    try { localStorage.setItem(STORAGE_KEYS.FILTER_TEXTS, JSON.stringify(columnSearchTexts));
    const selSer = {}; for(let col in columnSelectedValues) if(columnSelectedValues[col]?.size) selSer[col]=Array.from(columnSelectedValues[col]);
    localStorage.setItem(STORAGE_KEYS.FILTER_SELECTED, JSON.stringify(selSer));
    localStorage.setItem(STORAGE_KEYS.SORT_COL, sortConfig.column||''); localStorage.setItem(STORAGE_KEYS.SORT_DIR, sortConfig.direction);
    localStorage.setItem(STORAGE_KEYS.COLUMN_VISIBILITY, JSON.stringify(columnVisibility)); } catch(e){} }

function loadPreferencesIntoState() {
    try { const texts=localStorage.getItem(STORAGE_KEYS.FILTER_TEXTS); if(texts){ const p=JSON.parse(texts); for(let h of currentHeaders) if(p[h]) columnSearchTexts[h]=p[h]; }
    const sel=localStorage.getItem(STORAGE_KEYS.FILTER_SELECTED); if(sel){ const p=JSON.parse(sel); for(let h of currentHeaders) if(p[h]&&Array.isArray(p[h])) columnSelectedValues[h]=new Set(p[h]); }
    const sc=localStorage.getItem(STORAGE_KEYS.SORT_COL), sd=localStorage.getItem(STORAGE_KEYS.SORT_DIR);
    if(sc && currentHeaders.includes(sc)) sortConfig={column:sc,direction:(sd==='asc'||sd==='desc')?sd:'asc'}; else sortConfig={column:null,direction:'asc'};
    const vis=localStorage.getItem(STORAGE_KEYS.COLUMN_VISIBILITY); if(vis){ const p=JSON.parse(vis); for(let h of currentHeaders) columnVisibility[h]=p[h]!==undefined?p[h]:true; } else currentHeaders.forEach(h=>columnVisibility[h]=true);
    } catch(e){}
}

function persistAndRefreshUI() { applyFiltersAndSort(); currentPage = 1; renderTable(); saveAllPreferences(); updateFilterChipsDisplay(); updateFilterContainerHighlight(); if(currentHeaders.length) renderColumnManager(); }

function rebuildFilterCards() {
    if(!currentHeaders.length) return;
    dynamicFilterCards.innerHTML = '';
    for(let col of currentHeaders){
        const currentText = columnSearchTexts[col] || '';
        const uniqueSet = new Set();
        for(let row of rawDataset){ let v = row[col] !== undefined && row[col] !== null ? String(row[col]) : "(blank)"; uniqueSet.add(v); }
        const selectedCount = columnSelectedValues[col]?.size || 0;
        const card = document.createElement('div'); card.className = 'filter-card';
        card.innerHTML = `<label title="${escapeHtml(col)}">${escapeHtml(col.length>20?col.slice(0,18)+'..':col)}</label><input type="text" class="filter-text-input" data-col="${escapeHtml(col)}" value="${escapeHtml(currentText)}"><div class="filter-stats"><span>📋 ${uniqueSet.size} unique</span><span class="multi-select-trigger" data-col="${escapeHtml(col)}" style="cursor:pointer;color:#2c6e9e;font-weight:500;">🎯 ${selectedCount>0?`${selectedCount} selected`:'Select values'}</span></div>`;
        dynamicFilterCards.appendChild(card);
    }
    attachFilterEvents();
}

function attachFilterEvents() {
    document.querySelectorAll('.filter-text-input').forEach(inp => { inp.removeEventListener('input', handleFilterInput); inp.addEventListener('input', handleFilterInput); });
    document.querySelectorAll('.multi-select-trigger').forEach(tr => { tr.removeEventListener('click', handleMultiSelect); tr.addEventListener('click', handleMultiSelect); });
}

function handleFilterInput(e) { const col = e.target.getAttribute('data-col'); columnSearchTexts[col] = e.target.value; persistAndRefreshUI(); }

let activeDropdown = null;
function handleMultiSelect(e) {
    const col = e.target.getAttribute('data-col');
    const uniqueMap = new Map(); for(let row of rawDataset){ let val = row[col] !== undefined && row[col] !== null ? String(row[col]) : "(blank)"; uniqueMap.set(val,true); }
    const sorted = Array.from(uniqueMap.keys()).sort();
    const curSet = columnSelectedValues[col] || new Set();
    
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'mobile-filter-modal-overlay';
        const modalCard = document.createElement('div');
        modalCard.className = 'mobile-filter-modal-card';
        modalCard.innerHTML = `
            <div class="mobile-filter-header">Filter: ${escapeHtml(col)}</div>
            <div class="mobile-filter-search"><input type="text" id="mobileFilterSearch" placeholder="Search values..."></div>
            <div class="mobile-filter-list" id="mobileFilterList"></div>
            <div class="mobile-filter-buttons"><button id="mobileFilterOkBtn" style="background:#2c6e9e;">Apply</button><button id="mobileFilterClearBtn" style="background:#6c7a89;">Clear</button></div>
        `;
        modalOverlay.appendChild(modalCard);
        document.body.appendChild(modalOverlay);
        
        const listContainer = modalCard.querySelector('#mobileFilterList');
        const searchInput = modalCard.querySelector('#mobileFilterSearch');
        let currentChecked = new Set(curSet);
        
        function renderList(filter = '') {
            const filtered = sorted.filter(v => filter === '' || v.toLowerCase().includes(filter.toLowerCase()));
            listContainer.innerHTML = '';
            filtered.forEach(val => {
                const isChecked = currentChecked.has(val);
                const itemDiv = document.createElement('div');
                itemDiv.className = 'mobile-filter-item';
                itemDiv.innerHTML = `<input type="checkbox" value="${escapeHtml(val)}" ${isChecked ? 'checked' : ''}> <span>${escapeHtml(val.length > 60 ? val.slice(0,57)+'...' : val)}</span>`;
                listContainer.appendChild(itemDiv);
            });
        }
        renderList();
        searchInput.addEventListener('input', (e) => renderList(e.target.value));
        
        const okBtn = modalCard.querySelector('#mobileFilterOkBtn');
        const clearBtn = modalCard.querySelector('#mobileFilterClearBtn');
        okBtn.addEventListener('click', () => {
            const newSet = new Set();
            listContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => newSet.add(cb.value));
            if (newSet.size) columnSelectedValues[col] = newSet;
            else delete columnSelectedValues[col];
            persistAndRefreshUI();
            rebuildFilterCards();
            modalOverlay.remove();
            activeDropdown = null;
        });
        clearBtn.addEventListener('click', () => {
            delete columnSelectedValues[col];
            persistAndRefreshUI();
            rebuildFilterCards();
            modalOverlay.remove();
            activeDropdown = null;
        });
        modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });
        activeDropdown = modalOverlay;
    } else {
        const dropdown = document.createElement('div');
        dropdown.style.cssText = 'position:fixed;background:white;border:1px solid #ccc;border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,0.2);min-width:240px;z-index:1000;padding:12px;';
        dropdown.innerHTML = `<div style="font-weight:600;margin-bottom:8px;">Filter ${escapeHtml(col)}</div><input type="text" id="dropdownSearch" placeholder="Search values..." style="width:100%;padding:8px;border-radius:30px;border:1px solid #ccc;margin-bottom:8px;"><div id="dropdownList" style="max-height:200px;overflow-y:auto;border-top:1px solid #eee;margin-top:6px;"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;"><button id="dropdownOk" style="padding:4px 14px;">OK</button><button id="dropdownClear" style="padding:4px 14px;background:#6c7a89;">Clear</button></div>`;
        document.body.appendChild(dropdown);
        const rect = e.target.getBoundingClientRect();
        let left = rect.left + window.scrollX - 60, top = rect.bottom + window.scrollY + 4;
        const dropdownRect = dropdown.getBoundingClientRect();
        if (left + dropdownRect.width > window.innerWidth) left = window.innerWidth - dropdownRect.width - 10;
        if (top + dropdownRect.height > window.innerHeight) top = window.innerHeight - dropdownRect.height - 10;
        if (left < 10) left = 10;
        dropdown.style.left = `${left}px`; dropdown.style.top = `${top}px`;
        const listDiv = dropdown.querySelector('#dropdownList'), searchInputDesktop = dropdown.querySelector('#dropdownSearch');
        function renderList(filter = '') {
            const filtered = sorted.filter(v => filter === '' || v.toLowerCase().includes(filter.toLowerCase()));
            listDiv.innerHTML = '';
            filtered.forEach(val => {
                const isChecked = curSet.has(val);
                const itemDiv = document.createElement('div');
                itemDiv.style.display = 'flex'; itemDiv.style.alignItems = 'center'; itemDiv.style.gap = '8px'; itemDiv.style.padding = '5px 0';
                itemDiv.innerHTML = `<input type="checkbox" value="${escapeHtml(val)}" ${isChecked ? 'checked' : ''}> <span style="font-size:12px;">${escapeHtml(val.length > 50 ? val.slice(0,47)+'...' : val)}</span>`;
                listDiv.appendChild(itemDiv);
            });
        }
        renderList();
        searchInputDesktop.addEventListener('input', (e) => renderList(e.target.value));
        dropdown.querySelector('#dropdownOk').addEventListener('click', () => {
            const newSet = new Set();
            dropdown.querySelectorAll('#dropdownList input:checked').forEach(cb => newSet.add(cb.value));
            if (newSet.size) columnSelectedValues[col] = newSet;
            else delete columnSelectedValues[col];
            persistAndRefreshUI(); rebuildFilterCards(); dropdown.remove(); activeDropdown = null;
        });
        dropdown.querySelector('#dropdownClear').addEventListener('click', () => {
            delete columnSelectedValues[col]; persistAndRefreshUI(); rebuildFilterCards(); dropdown.remove(); activeDropdown = null;
        });
        activeDropdown = dropdown;
    }
}

function updateFilterChipsDisplay() {
    let active = []; for(let col of currentHeaders){ const txt = columnSearchTexts[col]||"", sel = columnSelectedValues[col]; if(txt || (sel&&sel.size)){ let desc=[]; if(txt) desc.push(`hint:"${txt}"`); if(sel&&sel.size) desc.push(`${sel.size} values`); active.push({col,label:desc.join(' + ')}); } }
    if(active.length===0) activeFilterChips.innerHTML = '<span style="font-size:12px;">✨ No active filters</span>';
    else{ let html = '<span style="font-size:12px;">🔍 Active filters:</span>'; active.forEach(f=>{ html += `<div class="filter-chip">${escapeHtml(f.col)}: ${escapeHtml(f.label)} <button class="clear-chip" data-col="${escapeHtml(f.col)}">✖</button></div>`; }); activeFilterChips.innerHTML = html; document.querySelectorAll('.clear-chip').forEach(btn=>{ btn.addEventListener('click',()=>{ const col=btn.getAttribute('data-col'); delete columnSearchTexts[col]; delete columnSelectedValues[col]; persistAndRefreshUI(); rebuildFilterCards(); }); }); }
    updateFilterContainerHighlight();
}

function updateFilterContainerHighlight() {
    if(mainFilterContainer){ let anyActive = Object.keys(columnSearchTexts).some(k=>columnSearchTexts[k]?.trim()) || Object.keys(columnSelectedValues).some(k=>columnSelectedValues[k]?.size); if(anyActive) mainFilterContainer.classList.add('has-active-filters'); else mainFilterContainer.classList.remove('has-active-filters'); }
    document.querySelectorAll('.filter-card').forEach(card=>{ const labelElem=card.querySelector('label'); if(labelElem){ let colTitle = labelElem.innerText; let matchedCol = currentHeaders.find(h=>h===colTitle || colTitle.includes(h)) || colTitle; if(matchedCol && (columnSearchTexts[matchedCol]?.trim() || columnSelectedValues[matchedCol]?.size)) card.classList.add('has-column-filter'); else card.classList.remove('has-column-filter'); } });
}

function renderColumnManager() {
    if(!currentHeaders.length) return; columnToggleGroup.innerHTML = '';
    currentHeaders.forEach(col => { const isVisible = columnVisibility[col] !== false; const btn = document.createElement('button'); btn.className = `column-toggle-btn ${isVisible ? 'active-col' : 'hidden-col'}`; btn.textContent = col.length > 20 ? col.slice(0, 18) + '..' : col; btn.addEventListener('click', () => { columnVisibility[col] = !isVisible; renderColumnManager(); persistAndRefreshUI(); }); columnToggleGroup.appendChild(btn); });
}

function resetColumnVisibility() { currentHeaders.forEach(col => columnVisibility[col] = true); renderColumnManager(); persistAndRefreshUI(); showStatus("All columns visible", "success"); }

async function loadLatestData() {
    if (!database) { showStatus("Firebase not ready", "error"); return; }
    await withSpinner((async () => {
        if(loadBtn) loadBtn.disabled = true;
        const snapshot = await database.ref('csvUploads').once('value');
        if (!snapshot.exists()) { tableBody.innerHTML = `<tr><td colspan="100" class="empty-placeholder">📭 No data. Upload a CSV (Admin only).</td></tr>`; rawDataset = []; filteredSortedData = []; totalRowsElem.innerText = '0'; filteredCountSpan.innerText = '0'; excelContainer.style.display = 'none'; filterPanelArea.style.display = 'none'; columnManagerArea.style.display = 'none'; updateLastUpdatedDisplay(null); return; }
        let latestUpload = null;
        snapshot.forEach(child => { const val = child.val(); if (val.metadata && val.metadata.completed) { if (!latestUpload || val.metadata.timestamp > latestUpload.metadata.timestamp) latestUpload = { id: child.key, metadata: val.metadata, batches: val.batches || {} }; } });
        if (!latestUpload) throw new Error("No completed dataset");
        const allRows = []; const batches = latestUpload.batches;
        for (let key of Object.keys(batches)) if (batches[key] && batches[key].data) allRows.push(...batches[key].data);
        rawDataset = allRows; currentMetadata = latestUpload.metadata; currentHeaders = latestUpload.metadata.headers || (rawDataset.length ? Object.keys(rawDataset[0]) : []);
        totalRowsElem.innerText = rawDataset.length.toLocaleString(); updateLastUpdatedDisplay(currentMetadata);
        loadPreferencesIntoState(); applyFiltersAndSort(); currentPage = 1;
        excelContainer.style.display = 'block'; filterPanelArea.style.display = 'block'; columnManagerArea.style.display = 'block';
        rebuildFilterCards(); renderColumnManager(); renderTable(); updateFilterChipsDisplay();
        showStatus(`✅ Loaded ${rawDataset.length.toLocaleString()} rows`, "success");
    })(), "Loading dataset...").catch(err => { console.error(err); showStatus("Load error: "+err.message, "error"); }).finally(() => { if(loadBtn) loadBtn.disabled = false; });
}

async function replaceWithNewData(data, originalHeaders, fileName, onProgress) { 
    await database.ref('csvUploads').remove();
    const uploadId = 'current_dataset_' + Date.now(), uploadRef = database.ref('csvUploads/' + uploadId), batchSize = 1000, totalBatches = Math.ceil(data.length / batchSize);
    const safeHeaders = originalHeaders.map(h => sanitizeFirebaseKey(h));
    await uploadRef.child('metadata').set({ timestamp: new Date().toISOString(), headers: safeHeaders, originalHeaders: originalHeaders, totalRows: data.length, fileName, batchSize, totalBatches, completed: false });
    for (let i = 0; i < totalBatches; i++) {
        const batchRaw = data.slice(i * batchSize, Math.min((i+1)*batchSize, data.length));
        const sanitizedBatch = batchRaw.map(row => sanitizeRowObject(row));
        await uploadRef.child('batches').child(`batch_${i}`).set({ index: i, data: sanitizedBatch });
        if(onProgress) onProgress({ completedBatches: i+1, totalBatches, percentage: ((i+1)*batchSize/data.length)*100 });
        await new Promise(r => setTimeout(r, 30));
    }
    await uploadRef.child('metadata').update({ completed: true });
}

async function parseFileToObjects(file) {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv')) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const text = ev.target.result, lines = text.split(/\r?\n/), headers = lines[0].split(',').map(h => h.trim()), data = [];
                for(let i = 1; i < lines.length; i++) { if(!lines[i].trim()) continue; const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || []; const obj = {}; headers.forEach((h, idx) => obj[h] = values[idx] ? values[idx].replace(/^"|"$/g,'') : ""); data.push(obj); }
                resolve({ headers, data });
            }; reader.onerror = () => reject("Failed to read CSV"); reader.readAsText(file, "UTF-8");
        });
    } else { const ab = await file.arrayBuffer(); const workbook = XLSX.read(ab); const sheet = workbook.Sheets[workbook.SheetNames[0]]; const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" }); const headers = Object.keys(jsonData[0] || {}); const data = jsonData.map(row => { const obj = {}; headers.forEach(h => obj[h] = row[h] !== undefined ? String(row[h]) : ""); return obj; }); return { headers, data }; }
}

if(uploadBtn) uploadBtn.addEventListener('click', async () => {
    if(!isAdminLoggedIn) { showStatus("Admin access required", "error"); return; }
    const file = csvFileInput.files[0]; if(!file) return showStatus("Select CSV or Excel file", "error");
    uploadBtn.disabled=true; progressContainer.style.display='block';
    try { const { headers, data } = await parseFileToObjects(file); if (!data.length) throw new Error("No data rows found"); await withSpinner(replaceWithNewData(data, headers, file.name, (prog) => { progressFill.style.width = `${prog.percentage}%`; progressFill.textContent = `${Math.floor(prog.percentage)}%`; }), "Uploading..."); showStatus(`Upload complete! ${data.length.toLocaleString()} rows`, "success"); await loadLatestData(); } 
    catch(err) { showStatus("Upload error: "+err.message, "error"); } 
    finally { uploadBtn.disabled=false; progressContainer.style.display='none'; progressFill.style.width='0%'; csvFileInput.value = ''; }
});

if(deleteBtn) deleteBtn.addEventListener('click', async () => {
    if(!isAdminLoggedIn) { showStatus("Admin access required", "error"); return; }
    if(!confirm("Delete ALL data?")) return;
    await withSpinner(database.ref('csvUploads').remove(), "Deleting...");
    rawDataset=[]; filteredSortedData=[]; currentHeaders=[]; currentMetadata=null; totalRowsElem.innerText='0'; filteredCountSpan.innerText='0';
    excelContainer.style.display='none'; filterPanelArea.style.display='none'; columnManagerArea.style.display='none'; updateLastUpdatedDisplay(null);
    showStatus("All data removed","success");
    localStorage.removeItem(STORAGE_KEYS.FILTER_TEXTS); localStorage.removeItem(STORAGE_KEYS.FILTER_SELECTED); localStorage.removeItem(STORAGE_KEYS.SORT_COL); localStorage.removeItem(STORAGE_KEYS.SORT_DIR); localStorage.removeItem(STORAGE_KEYS.COLUMN_VISIBILITY);
});

document.getElementById('applyAllFiltersBtn')?.addEventListener('click', () => persistAndRefreshUI());
document.getElementById('resetAllFiltersBtn')?.addEventListener('click', () => { columnSearchTexts = {}; columnSelectedValues = {}; sortConfig = { column: null, direction: 'asc' }; persistAndRefreshUI(); rebuildFilterCards(); showStatus("All filters reset", "info"); });
resetColumnVisibilityBtn?.addEventListener('click', () => resetColumnVisibility());
if(loadBtn) loadBtn.addEventListener('click', loadLatestData);
document.getElementById('prevPage')?.addEventListener('click', () => { if(currentPage>1){ currentPage--; renderTable(); } });
document.getElementById('nextPage')?.addEventListener('click', () => { const total=Math.ceil(filteredSortedData.length/rowsPerPage); if(currentPage<total){ currentPage++; renderTable(); } });

function initializeDashboard() { 
    checkExistingAdminSession(); 
    if(database) loadLatestData();
    else showStatus("Firebase issue","error"); 
}

(function initOnLoad() {
    const existingSession = checkExistingUserSession();
    if (existingSession && database) {
        userLoginOverlay.style.display = 'none';
        dashboardContainer.style.display = 'block';
        currentLoggedInUser = existingSession;
        const displayName = existingSession.fullName || existingSession.username;
        userWelcomeBadge.innerHTML = `👋 Welcome, ${escapeHtml(displayName)} | <button id="userLogoutBtn" style="background:none; border:none; color:white; cursor:pointer; margin-left:8px;">🚪 Logout</button>`;
        userWelcomeBadge.style.display = 'inline-flex';
        const logoutBtn = document.getElementById('userLogoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => { clearUserSession(); location.reload(); });
        initializeDashboard();
    } else {
        userLoginOverlay.style.display = 'flex';
        dashboardContainer.style.display = 'none';
    }
    userLoginBtn.addEventListener('click', handleUserLogin);
    userLoginUsername.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleUserLogin(); });
    userLoginPassword.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleUserLogin(); });
})();