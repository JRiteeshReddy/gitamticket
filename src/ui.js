import confetti from 'canvas-confetti';
import { store, DEFAULT_SHEET_URL } from './store.js';
import { auth, sheet2AuthUrl } from './auth.js';
import { playSuccessSound, playAlreadyEnteredSound, playInvalidSound, isAudioMuted, toggleAudioMute } from './sound.js';
import { initScanner, stopScanner, toggleTorch, switchCamera, resetScanCooldown } from './scanner.js';

let activeTab = 'scanner'; // 'scanner' | 'manual' | 'log'
let manualSearchQuery = '';
let logSearchQuery = '';

export function renderApp(rootEl) {
  if (!auth.isAuthenticated()) {
    renderLoginScreen(rootEl);
    return;
  }

  const currentUser = auth.getCurrentUser();

  rootEl.innerHTML = `
    <div class="app-container">
      <!-- HEADER -->
      <header class="app-header">
        <div class="brand">
          <div class="brand-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1"></rect>
              <path d="M3 14h7v7H3z"></path>
            </svg>
          </div>
          <div>
            <h1 class="brand-title">Gitam Ticket Scanner</h1>
            <div class="brand-sub" id="sheetSyncBadge">
              <span class="pulse-dot"></span> <span id="syncStatusText">Connecting...</span>
            </div>
          </div>
        </div>

        <div class="header-actions">
          <button id="audioToggleBtn" class="icon-btn" title="Toggle Sound">
            <svg id="audioIcon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </button>
          <button id="syncRefreshBtn" class="icon-btn" title="Sync Google Sheet">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6"></path>
              <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16"></path>
            </svg>
          </button>
          <button id="logoutBtn" class="icon-btn logout-icon-btn" title="Logout (${escapeHtml(currentUser.username)})">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </header>

      <!-- STATS BAR -->
      <section class="stats-bar" id="statsBar">
        <div class="stat-card">
          <span class="stat-label">Total Tickets</span>
          <span class="stat-value" id="statTotal">0</span>
        </div>
        <div class="stat-card stat-success">
          <span class="stat-label">Checked In</span>
          <span class="stat-value" id="statCheckedIn">0</span>
        </div>
        <div class="stat-card stat-pending">
          <span class="stat-label">Remaining</span>
          <span class="stat-value" id="statRemaining">0</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Progress</span>
          <span class="stat-value" id="statPercentage">0%</span>
        </div>
      </section>

      <!-- PROGRESS BAR -->
      <div class="progress-container">
        <div class="progress-bar-fill" id="progressBarFill" style="width: 0%"></div>
      </div>

      <!-- NAVIGATION TABS -->
      <nav class="nav-tabs">
        <button class="tab-btn active" data-tab="scanner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Scanner
        </button>
        <button class="tab-btn" data-tab="manual">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Manual Search
        </button>
        <button class="tab-btn" data-tab="log">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          History Log
        </button>
      </nav>

      <!-- MAIN CONTENT VIEW -->
      <main class="main-content">
        <!-- SCANNER VIEW -->
        <div id="scannerTab" class="tab-content active">
          <div class="camera-card">
            <div class="camera-header">
              <span class="camera-status">
                <span class="pulse-green"></span> Live Camera
              </span>
              <div class="camera-controls">
                <button id="torchBtn" class="cam-control-btn" title="Toggle Torch">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </button>
                <button id="flipCamBtn" class="cam-control-btn" title="Switch Camera">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0-4.4-3.6-8-8-8s-8 3.6-8 8h-3l4 4 4-4h-3c0-3.3 2.7-6 6-6s6 2.7 6 6h-2l4 4 4-4h-3z"/><path d="M4 14c0 4.4 3.6 8 8 8s8-3.6 8-8h3l-4-4-4 4h3c0 3.3-2.7 6-6 6s-6-2.7-6-6h2l-4-4-4 4h3z"/></svg>
                </button>
              </div>
            </div>

            <!-- HTML5 QRCODE CONTAINER -->
            <div class="camera-viewport-wrapper">
              <div id="reader"></div>
              <div class="scanner-laser-line"></div>
              <div class="scanner-frame-overlay">
                <div class="corner top-left"></div>
                <div class="corner top-right"></div>
                <div class="corner bottom-left"></div>
                <div class="corner bottom-right"></div>
              </div>
            </div>

            <div class="camera-footer">
              <p class="camera-hint">Position ticket QR code within the frame</p>
            </div>
          </div>
        </div>

        <!-- MANUAL SEARCH TAB -->
        <div id="manualTab" class="tab-content">
          <div class="search-box-card">
            <div class="search-input-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="manualSearchInput" placeholder="Search by Regd No (e.g. 2025737065), Name, Email..." autocomplete="off">
              <button id="clearSearchBtn" class="clear-btn hidden">&times;</button>
            </div>
          </div>

          <div id="manualSearchResults" class="student-list-container">
            <!-- Dynamically populated -->
          </div>
        </div>

        <!-- HISTORY LOG TAB -->
        <div id="logTab" class="tab-content">
          <div class="log-actions-bar">
            <input type="text" id="logSearchInput" placeholder="Filter checked-in log..." class="log-search-input">
            <div class="btn-group">
              <button id="clearSessionBtn" class="action-btn danger-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Reset Session
              </button>
            </div>
          </div>

          <div id="historyLogList" class="log-list">
            <!-- Dynamically populated -->
          </div>
        </div>
      </main>

      <!-- TOP-LEVEL SCAN RESULT OVERLAY MODAL -->
      <div id="scanResultModal" class="result-modal hidden">
        <div class="result-card" id="resultCard">
          <button class="modal-close-btn" id="closeResultBtn">&times;</button>
          <div id="resultCardContent"></div>
        </div>
      </div>
    </div>
  `;

  attachEventListeners(rootEl);
  updateStats();
  updateAudioIcon();

  // Load Google Sheet CSV on startup
  store.loadSheetData();

  // Subscribe to store updates
  store.subscribe(() => {
    updateStats();
    updateSyncBadge();
    if (activeTab === 'manual') renderManualSearch();
    if (activeTab === 'log') renderHistoryLog();
  });
}

/**
 * Render VIP Login Screen
 */
function renderLoginScreen(rootEl) {
  stopScanner();

  rootEl.innerHTML = `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 class="login-title">GITAM VIP SCANNER</h2>
          <p class="login-subtitle">Gatekeeper Authentication System</p>
        </div>

        <form id="loginForm" class="login-form">
          <div class="form-group">
            <label for="loginUser">Username / Regd ID</label>
            <div class="login-input-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <input type="text" id="loginUser" placeholder="Enter username or Regd No" required autocomplete="username">
            </div>
          </div>

          <div class="form-group">
            <label for="loginPass">Password (SHA-256 Encrypted)</label>
            <div class="login-input-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input type="password" id="loginPass" placeholder="Enter password" required autocomplete="current-password">
            </div>
          </div>

          <div id="loginError" class="login-error hidden"></div>

          <button type="submit" id="loginSubmitBtn" class="login-submit-btn">
            AUTHENTICATE & LOG IN
          </button>
        </form>

        <!-- SHEET 2 AUTH SOURCE ACCORDION -->
        <details class="sheet2-details">
          <summary class="sheet2-summary">
            🔒 Sheet 2 Auth Configuration
          </summary>
          <div class="sheet2-body">
            <label for="sheet2UrlInput">Sheet 2 Auth CSV Published URL</label>
            <input type="text" id="sheet2UrlInput" class="form-control" placeholder="https://docs.google.com/.../pub?gid=SHEET2_GID&output=csv" value="${sheet2AuthUrl}">
            <button id="saveSheet2Btn" class="action-btn secondary-btn sheet2-save-btn">Save Sheet 2 URL</button>
            <p class="sheet2-hint">Passwords are stored in Sheet 2 as SHA-256 hashes for max security.</p>
          </div>
        </details>
      </div>
    </div>
  `;

  // Attach Login listeners
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');

  // Pre-load Sheet 2 if configured
  if (sheet2AuthUrl) {
    auth.loadAuthSheet(sheet2AuthUrl);
  }

  document.getElementById('saveSheet2Btn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const input = document.getElementById('sheet2UrlInput');
    if (input && input.value.trim()) {
      const res = await auth.loadAuthSheet(input.value.trim());
      if (res.success) {
        alert(`Sheet 2 loaded successfully! Found ${res.count} auth accounts.`);
      } else {
        alert(`Could not load Sheet 2: ${res.error || 'Check URL/GID'}`);
      }
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userVal = document.getElementById('loginUser').value;
    const passVal = document.getElementById('loginPass').value;

    const res = await auth.login(userVal, passVal);
    if (res.success) {
      renderApp(rootEl);
    } else {
      if (loginError) {
        loginError.textContent = res.error || 'Invalid credentials';
        loginError.classList.remove('hidden');
      }
    }
  });
}

function updateAudioIcon() {
  const audioIcon = document.getElementById('audioIcon');
  if (!audioIcon) return;
  const muted = isAudioMuted();

  if (muted) {
    audioIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    `;
    audioIcon.style.opacity = '0.5';
  } else {
    audioIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
    audioIcon.style.opacity = '1';
  }
}

function updateSyncBadge() {
  const syncBadge = document.getElementById('syncStatusText');
  if (!syncBadge) return;

  const state = store.syncState;
  if (state.loading) {
    syncBadge.textContent = 'Syncing Sheet...';
    syncBadge.className = 'status-syncing';
  } else if (state.error) {
    syncBadge.textContent = `Sync Error (Using Cache: ${state.totalCount})`;
    syncBadge.className = 'status-error';
  } else {
    syncBadge.textContent = `Synced (${state.totalCount} Students)`;
    syncBadge.className = 'status-synced';
  }
}

function updateStats() {
  const stats = store.getStats();

  const elTotal = document.getElementById('statTotal');
  const elCheckedIn = document.getElementById('statCheckedIn');
  const elRemaining = document.getElementById('statRemaining');
  const elPercentage = document.getElementById('statPercentage');
  const elProgressFill = document.getElementById('progressBarFill');

  if (elTotal) elTotal.textContent = stats.total;
  if (elCheckedIn) elCheckedIn.textContent = stats.checkedIn;
  if (elRemaining) elRemaining.textContent = stats.remaining;
  if (elPercentage) elPercentage.textContent = `${stats.percentage}%`;
  if (elProgressFill) elProgressFill.style.width = `${stats.percentage}%`;
}

function attachEventListeners(rootEl) {
  // Logout Button
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (confirm('Logout from Ticket Scanner session?')) {
      auth.logout();
      renderApp(rootEl);
    }
  });

  // Tab Switching
  const tabBtns = rootEl.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab === activeTab) return;

      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const targetEl = document.getElementById(`${targetTab}Tab`);
      if (targetEl) targetEl.classList.add('active');

      activeTab = targetTab;

      if (activeTab === 'scanner') {
        startCameraScanner();
      } else {
        stopScanner();
      }

      if (activeTab === 'manual') renderManualSearch();
      if (activeTab === 'log') renderHistoryLog();
    });
  });

  // Audio Toggle
  document.getElementById('audioToggleBtn')?.addEventListener('click', () => {
    toggleAudioMute();
    updateAudioIcon();
  });

  // Refresh Sync Button
  document.getElementById('syncRefreshBtn')?.addEventListener('click', () => {
    store.loadSheetData();
  });

  // Torch & Flip Camera Controls
  document.getElementById('torchBtn')?.addEventListener('click', async () => {
    const isLit = await toggleTorch();
    const btn = document.getElementById('torchBtn');
    if (btn) btn.classList.toggle('active', isLit);
  });

  document.getElementById('flipCamBtn')?.addEventListener('click', async () => {
    await switchCamera('reader', handleScanResult, handleScanError);
  });

  // Close Result Modal
  document.getElementById('closeResultBtn')?.addEventListener('click', () => {
    hideResultModal();
  });

  // Manual Search Input
  const manualInput = document.getElementById('manualSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  manualInput?.addEventListener('input', (e) => {
    manualSearchQuery = e.target.value;
    clearSearchBtn?.classList.toggle('hidden', !manualSearchQuery);
    renderManualSearch();
  });

  clearSearchBtn?.addEventListener('click', () => {
    manualSearchQuery = '';
    if (manualInput) manualInput.value = '';
    clearSearchBtn.classList.add('hidden');
    renderManualSearch();
  });

  // Log Search Input
  document.getElementById('logSearchInput')?.addEventListener('input', (e) => {
    logSearchQuery = e.target.value;
    renderHistoryLog();
  });

  // Reset Session
  document.getElementById('clearSessionBtn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all check-in attendance data for this session?')) {
      store.clearAllCheckIns();
    }
  });

  // Start scanner initially if on scanner tab
  startCameraScanner();
}

async function startCameraScanner() {
  const result = await initScanner('reader', handleScanResult, handleScanError);
  if (!result.success) {
    const readerEl = document.getElementById('reader');
    if (readerEl) {
      readerEl.innerHTML = `
        <div class="camera-error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><path d="M1 1l22 22"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/><circle cx="12" cy="13" r="4"/></svg>
          <p>Camera access denied or unavailable</p>
          <button id="retryCamBtn" class="action-btn secondary-btn">Retry Camera</button>
        </div>
      `;
      document.getElementById('retryCamBtn')?.addEventListener('click', () => startCameraScanner());
    }
  }
}

/**
 * Handle QR Code Scan Event
 */
function handleScanResult(scannedText) {
  const result = store.processScan(scannedText, 'QR Camera Scan');
  displayScanResultModal(result);
}

function handleScanError(err) {
  // Silent frame decode error
}

/**
 * Display Visual Feedback Modal / Alert Banner for Scan Results
 */
function displayScanResultModal(result) {
  const resultModal = document.getElementById('scanResultModal');
  const resultCard = document.getElementById('resultCard');
  const resultCardContent = document.getElementById('resultCardContent');

  if (!resultModal || !resultCard || !resultCardContent) return;

  resultModal.classList.remove('hidden');

  // Trigger Phone Vibration if supported
  if ('vibrate' in navigator) {
    if (result.type === 'SUCCESS') navigator.vibrate(120);
    if (result.type === 'ALREADY_ENTERED') navigator.vibrate([200, 100, 200]);
    if (result.type === 'NOT_FOUND') navigator.vibrate([300]);
  }

  // 1. SUCCESS: ENTRY GRANTED
  if (result.type === 'SUCCESS') {
    playSuccessSound();
    
    // Confetti animation!
    confetti({
      particleCount: 65,
      spread: 70,
      origin: { y: 0.6 }
    });

    resultCard.className = 'result-card card-success';
    resultCardContent.innerHTML = `
      <div class="result-header success-header">
        <div class="result-badge-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h2 class="result-title">ENTRY GRANTED</h2>
        <p class="result-subtitle">First-time Ticket Scan</p>
      </div>

      <div class="student-details-card">
        <div class="detail-row name-row">
          <span class="student-name-big">${escapeHtml(result.student.name)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Regd No:</span>
          <span class="detail-value highlight-green">${escapeHtml(result.student.regdNo)}</span>
        </div>
        ${result.student.campusInfo ? `
        <div class="detail-row">
          <span class="detail-label">Dept / Course:</span>
          <span class="detail-value">${escapeHtml(result.student.campusInfo)}</span>
        </div>` : ''}
        ${result.student.email ? `
        <div class="detail-row">
          <span class="detail-label">Email:</span>
          <span class="detail-value">${escapeHtml(result.student.email)}</span>
        </div>` : ''}
        ${result.student.mobile ? `
        <div class="detail-row">
          <span class="detail-label">Mobile:</span>
          <span class="detail-value">${escapeHtml(result.student.mobile)}</span>
        </div>` : ''}
        <div class="detail-row">
          <span class="detail-label">Scanned At:</span>
          <span class="detail-value">${result.formattedTime}</span>
        </div>
      </div>

      <button class="next-scan-btn success-btn-bg" id="modalNextBtn">
        Scan Next Ticket
      </button>
    `;
  }
  
  // 2. ALREADY ENTERED: DUPLICATE WARNING
  else if (result.type === 'ALREADY_ENTERED') {
    playAlreadyEnteredSound();

    resultCard.className = 'result-card card-danger';
    const prevTime = result.previousEntry ? (result.previousEntry.scannedAt || result.previousEntry.timestamp) : 'Earlier';

    resultCardContent.innerHTML = `
      <div class="result-header danger-header">
        <div class="result-badge-icon pulse-red">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h2 class="result-title danger-text">ALREADY ENTERED</h2>
        <div class="already-scanned-banner">
          ⚠️ Ticket previously scanned at <strong>${prevTime}</strong>
        </div>
      </div>

      <div class="student-details-card danger-border">
        <div class="detail-row name-row">
          <span class="student-name-big">${escapeHtml(result.student ? result.student.name : 'Registered Student')}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Regd No:</span>
          <span class="detail-value highlight-red">${escapeHtml(result.regdNo)}</span>
        </div>
        ${result.student && result.student.campusInfo ? `
        <div class="detail-row">
          <span class="detail-label">Dept / Course:</span>
          <span class="detail-value">${escapeHtml(result.student.campusInfo)}</span>
        </div>` : ''}
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="detail-value danger-text">DUPLICATE ENTRY BLOCKED</span>
        </div>
      </div>

      <button class="next-scan-btn danger-btn-bg" id="modalNextBtn">
        Dismiss & Scan Next
      </button>
    `;
  }

  // 3. NOT FOUND / INVALID
  else {
    playInvalidSound();

    resultCard.className = 'result-card card-warning';
    resultCardContent.innerHTML = `
      <div class="result-header warning-header">
        <div class="result-badge-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h2 class="result-title warning-text">NOT FOUND</h2>
        <p class="result-subtitle">Regd No not in Google Sheet database</p>
      </div>

      <div class="student-details-card">
        <div class="detail-row">
          <span class="detail-label">Scanned QR Code:</span>
          <span class="detail-value code-block">${escapeHtml(result.scannedText)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Extracted Regd No:</span>
          <span class="detail-value highlight-amber">${escapeHtml(result.regdNo)}</span>
        </div>
      </div>

      <button class="next-scan-btn warning-btn-bg" id="modalNextBtn">
        Dismiss & Continue
      </button>
    `;
  }

  document.getElementById('modalNextBtn')?.addEventListener('click', () => {
    hideResultModal();
  });
}

function hideResultModal() {
  const resultModal = document.getElementById('scanResultModal');
  if (resultModal) resultModal.classList.add('hidden');
  resetScanCooldown();
}

/**
 * Render Manual Search Tab
 */
function renderManualSearch() {
  const container = document.getElementById('manualSearchResults');
  if (!container) return;

  const query = manualSearchQuery.trim().toLowerCase();
  let students = store.students;

  if (query) {
    students = students.filter(s => 
      s.regdNo.toLowerCase().includes(query) ||
      s.name.toLowerCase().includes(query) ||
      s.email.toLowerCase().includes(query) ||
      s.mobile.includes(query)
    );
  }

  if (students.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${query ? 'No student found matching query.' : 'Search for a student using Regd No, Name, or Mobile.'}</p>
      </div>
    `;
    return;
  }

  // Display top 50 matches to keep DOM fast
  const displayList = students.slice(0, 50);

  container.innerHTML = displayList.map(s => {
    const isChecked = store.isCheckedIn(s.regdNo);
    const details = isChecked ? store.getCheckInDetails(s.regdNo) : null;

    return `
      <div class="student-list-item ${isChecked ? 'item-checked' : ''}">
        <div class="item-info">
          <div class="item-name">${escapeHtml(s.name)}</div>
          <div class="item-meta">
            <span class="meta-regd">Regd: ${escapeHtml(s.regdNo)}</span>
            ${s.campusInfo ? `<span class="meta-dept">${escapeHtml(s.campusInfo)}</span>` : ''}
          </div>
          ${isChecked ? `<div class="checked-badge">✓ Entered at ${details?.scannedAt || details?.timestamp || ''}</div>` : ''}
        </div>
        <div class="item-action">
          ${isChecked ? `
            <button class="action-btn checkin-btn-duplicate" data-regd="${s.regdNo}" title="Already checked in">Checked In</button>
            <button class="action-btn undo-btn" data-regd="${s.regdNo}">Undo</button>
          ` : `
            <button class="action-btn checkin-btn" data-regd="${s.regdNo}">Check In</button>
          `}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.checkin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const regd = btn.getAttribute('data-regd');
      if (regd) {
        const res = store.manualCheckIn(regd);
        displayScanResultModal(res);
      }
    });
  });

  container.querySelectorAll('.checkin-btn-duplicate').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const regd = btn.getAttribute('data-regd');
      if (regd) {
        const res = store.manualCheckIn(regd);
        displayScanResultModal(res);
      }
    });
  });

  container.querySelectorAll('.undo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const regd = btn.getAttribute('data-regd');
      if (regd) {
        store.undoCheckIn(regd);
        renderManualSearch();
      }
    });
  });
}

/**
 * Render History Log Tab
 */
function renderHistoryLog() {
  const container = document.getElementById('historyLogList');
  if (!container) return;

  const entries = Array.from(store.checkedInMap.values()).reverse();
  const query = logSearchQuery.trim().toLowerCase();

  let filtered = entries;
  if (query) {
    filtered = entries.filter(e => {
      const s = e.student || {};
      return (
        (e.regdNo && e.regdNo.toLowerCase().includes(query)) ||
        (s.name && s.name.toLowerCase().includes(query)) ||
        (s.email && s.email.toLowerCase().includes(query))
      );
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${query ? 'No checked-in tickets match your filter.' : 'No tickets checked in yet. Start scanning!'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(entry => {
    const s = entry.student || {};
    return `
      <div class="log-item">
        <div class="log-time">${entry.scannedAt || 'Just now'}</div>
        <div class="log-student">
          <div class="log-name">${escapeHtml(s.name || 'Unknown Student')}</div>
          <div class="log-sub">Regd: ${escapeHtml(entry.regdNo)} • ${escapeHtml(s.campusInfo || 'N/A')}</div>
        </div>
        <div class="log-method">${entry.method || 'QR Scan'}</div>
        <button class="log-undo-btn" data-regd="${entry.regdNo}" title="Undo Entry">&times;</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.log-undo-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const regd = btn.getAttribute('data-regd');
      if (regd) {
        store.undoCheckIn(regd);
        renderHistoryLog();
      }
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
