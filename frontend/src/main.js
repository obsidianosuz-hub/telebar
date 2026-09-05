import './style.css';
import { getLanguage, setLanguage, applyTranslations, dictionaries } from './i18n.js';
import { getToken, setToken, request, initSocket } from './api.js';

// Service Worker Registration for PWA Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered successfully!', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}

// PWA Install Event Handler
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const pwaContainer = document.getElementById('pwa-install-container');
  if (pwaContainer) {
    pwaContainer.style.display = 'flex';
  }
});

window.addEventListener('appinstalled', () => {
  console.log('Telebar was installed successfully!');
  const pwaContainer = document.getElementById('pwa-install-container');
  if (pwaContainer) {
    pwaContainer.style.display = 'none';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const btnInstallPwa = document.getElementById('btn-install-pwa');
  if (btnInstallPwa) {
    btnInstallPwa.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to PWA install: ${outcome}`);
      deferredPrompt = null;
      const pwaContainer = document.getElementById('pwa-install-container');
      if (pwaContainer) {
        pwaContainer.style.display = 'none';
      }
    });
  }

  const btnCopyInstall = document.getElementById('btn-copy-install');
  if (btnCopyInstall) {
    btnCopyInstall.addEventListener('click', () => {
      const command = `irm http://10.61.205.97:5174/install.ps1 | iex`;
      navigator.clipboard.writeText(command)
        .then(() => {
          showToast('Nusxalandi! Windows PowerShell\'ga o\'ng tugma bilan joylab, Enter bosing.', 'success');
        })
        .catch(err => {
          console.error('Nusxalashda xatolik:', err);
          showToast('Nusxalab bo\'lmadi.', 'error');
        });
    });
  }
});

// Application State
let currentUser = null;
let currentCart = [];
let cashierPinInput = '';
let activeShift = null;
let currentSettings = null;
let posProductsList = [];
let branchSalesChart = null;
let financialSummaryChart = null;

// Initialize i18n
document.addEventListener('DOMContentLoaded', () => {
  restoreLocalTheme();
  restoreSidebarOrder();
  setLanguage(getLanguage());
  checkExistingSession();
  setupEventListeners();
  setupSidebarDragAndDrop();

  // Server IP & Mode Settings Toggle & Save
  const toggleBtn = document.getElementById('toggle-server-settings');
  const panel = document.getElementById('server-settings-panel');
  const modeSelect = document.getElementById('system-mode-select');
  const ipGroup = document.getElementById('server-ip-group');
  const ipInput = document.getElementById('server-ip-input');
  const saveBtn = document.getElementById('save-server-ip-btn');
  
  if (toggleBtn && panel && modeSelect && ipGroup && ipInput && saveBtn) {
    const isWebView = window.location.protocol === 'file:';
    const defaultMode = isWebView ? 'offline' : 'online';
    const savedMode = localStorage.getItem('telebar_system_mode') || defaultMode;
    modeSelect.value = savedMode;
    
    if (savedMode === 'online') {
      ipGroup.style.display = 'block';
    } else {
      ipGroup.style.display = 'none';
    }
    
    ipInput.value = localStorage.getItem('telebar_server_ip') || '';
    
    modeSelect.addEventListener('change', () => {
      if (modeSelect.value === 'online') {
        ipGroup.style.display = 'block';
      } else {
        ipGroup.style.display = 'none';
      }
    });
    
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    
    saveBtn.addEventListener('click', () => {
      const mode = modeSelect.value;
      const ip = ipInput.value.trim();
      
      localStorage.setItem('telebar_system_mode', mode);
      if (mode === 'online' && ip) {
        localStorage.setItem('telebar_server_ip', ip);
        showToast("Tizim tarmoq rejimiga o'tkazildi va server manzili saqlandi!", 'success');
      } else {
        localStorage.removeItem('telebar_server_ip');
        showToast("Tizim telefonda mustaqil (offline) ishlash rejimiga o'tkazildi!", 'success');
      }
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  }

  // Sidebar Toggle / Collapse Button
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const mainShell = document.getElementById('main-shell');
  
  if (btnToggleSidebar && mainShell) {
    // Restore collapsed state
    const isCollapsed = localStorage.getItem('telebar_sidebar_collapsed') === 'true';
    if (isCollapsed) {
      mainShell.classList.add('sidebar-collapsed');
    }
    
    btnToggleSidebar.addEventListener('click', () => {
      mainShell.classList.toggle('sidebar-collapsed');
      const nowCollapsed = mainShell.classList.contains('sidebar-collapsed');
      localStorage.setItem('telebar_sidebar_collapsed', nowCollapsed);
    });
  }
});

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'danger' ? 'danger' : ''}`;
  toast.innerHTML = `
    <span style="font-size: 18px;">${type === 'danger' ? '⚠️' : '✨'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Auth Session Auto-login
 */
async function checkExistingSession() {
  // Disable auto-login session restoring for all roles (Admin & Cashier) on page refresh.
  // This forces credentials validation every time the application is loaded.
  setToken(null);
  showAuthScreen();
}

function get6DigitPin() {
  const boxes = document.querySelectorAll('.pin-box');
  let pin = '';
  boxes.forEach(b => pin += (b.value || ''));
  return pin.trim();
}

function clear6DigitPin() {
  const boxes = document.querySelectorAll('.pin-box');
  boxes.forEach(b => b.value = '');
  if (boxes[0]) boxes[0].focus();
}

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('main-shell').style.display = 'none';
  
  const tabEmail = document.getElementById('tab-login-email');
  const tabPin = document.getElementById('tab-login-pin');
  const loginForm = document.getElementById('login-form');
  const quickLoginForm = document.getElementById('quick-login-form');
  const pinPadContainer = document.getElementById('pin-pad-container');

  if (tabEmail && tabPin) {
    tabPin.style.background = 'var(--accent-gradient)';
    tabPin.style.color = '#030712';
    tabEmail.style.background = 'transparent';
    tabEmail.style.color = 'var(--color-text-secondary)';
  }

  if (loginForm) loginForm.style.display = 'none';
  if (quickLoginForm) quickLoginForm.style.display = 'block';
  if (pinPadContainer) pinPadContainer.style.display = 'none';
  clear6DigitPin();
  const firstBox = document.querySelector('.pin-box');
  if (firstBox) {
    setTimeout(() => firstBox.focus(), 150);
  }
}

/**
 * Handle Quick Login via 6-Digit PIN or Password directly
 */
async function handleQuickLoginFormSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const pin_code = get6DigitPin();

  if (!pin_code || pin_code.length < 4) {
    showToast("Iltimos, 6 xonali PIN kodni to'liq kiriting!", "warning");
    return;
  }

  try {
    const res = await request('/auth/quick-login', 'POST', { pin_code });
    setToken(res.token);
    currentUser = res.user;
    loginSuccess(currentUser);
    showToast(res.message || 'Muvaffaqiyatli tizimga kirildi', 'success');
  } catch (error) {
    // Instant Fallback for offline demo mode
    if (pin_code === '555555' || pin_code === '000000' || pin_code === 'admin123') {
      setToken('mock-admin-token');
      currentUser = { id: 'mock-admin-id', name: 'Administrator', email: 'admin@gmail.com', role: 'admin' };
      loginSuccess(currentUser);
      showToast('Administrator sifatida kirildi', 'success');
      return;
    }
    if (pin_code === '999999' || pin_code === 'scanner123') {
      setToken('mock-scanner-token');
      currentUser = { id: 'mock-scanner-id', name: 'Qurilma Skanerlovchi', email: 'scanner@gmail.com', role: 'scanner' };
      loginSuccess(currentUser);
      showToast('Skanerlovchi qurilma sifatida kirildi', 'success');
      return;
    }
    const cashierNames = {
      '123456': 'Yunusobod Kassiri',
      '234567': 'Chilonzor Kassiri',
      '345678': 'Diyorbek Kassir',
      '456789': 'Sardor Kassir'
    };
    if (cashierNames[pin_code]) {
      setToken('mock-token-cashier');
      currentUser = { id: 'mock-cashier-id', name: cashierNames[pin_code], email: 'cashier@gmail.com', role: 'cashier' };
      loginSuccess(currentUser);
      showToast(`${cashierNames[pin_code]} sifatida kirildi`, 'success');
      return;
    }
    showToast(error.message || 'PIN kod noto\'g\'ri', 'danger');
  }
}

/**
 * Handle Login Step 1: Email and Password
 */
async function handleLoginFormSubmit(e) {
  e.preventDefault();
  let email = (document.getElementById('login-email').value || '').trim();
  const password = document.getElementById('login-password').value;

  // Auto-correct accidental typo @gamil.com -> @gmail.com
  if (email.toLowerCase().endsWith('@gamil.com')) {
    email = email.toLowerCase().replace('@gamil.com', '@gmail.com');
    document.getElementById('login-email').value = email;
  }

  try {
    const res = await request('/auth/login', 'POST', { email, password });
    
    if (res.pin_required) {
      // Switch to PIN code pad
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('pin-pad-container').style.display = 'block';
      // Store temp user id
      document.getElementById('pin-pad-container').setAttribute('data-temp-user-id', res.user_id);
      cashierPinInput = '';
      updatePinDots();
    } else {
      // Admin directly logged in
      setToken(res.token);
      currentUser = res.user;
      loginSuccess(currentUser);
    }
  } catch (error) {
    // Offline Demo Fallback
    const cleanEmail = email.toLowerCase().replace('@gamil.com', '@gmail.com');
    if ((cleanEmail === 'admin@gmail.com' || cleanEmail.startsWith('admin')) && (password === 'admin123' || password === 'admin')) {
      setToken('mock-admin-token');
      currentUser = { id: 'mock-admin-id', name: 'Administrator', email: 'admin@gmail.com', role: 'admin' };
      
      // Seed default active transitions log for dashboard
      const trans = JSON.parse(localStorage.getItem('mock_transitions') || '[]');
      if (trans.length === 0) {
        trans.push({
          id: 'trans-1',
          cashier: 'Kassir Demo',
          type: 'day',
          status: 'active',
          duration: 'Davom etmoqda',
          revenue: 0.0,
          time: new Date().toISOString()
        });
        localStorage.setItem('mock_transitions', JSON.stringify(trans));
      }

      loginSuccess(currentUser);
      showToast('Admin offline demo rejimda muvaffaqiyatli kirdi');
      return;
    } else if (email === 'cashier@gmail.com' && password === 'cashier123') {
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('pin-pad-container').style.display = 'block';
      document.getElementById('pin-pad-container').setAttribute('data-temp-user-id', 'mock-cashier-id');
      cashierPinInput = '';
      updatePinDots();
      return;
    }
    showToast(error.message, 'danger');
  }
}

/**
 * Handle Login Step 2: PIN Code entries
 */
function handlePinPadKeyPress(val) {
  if (cashierPinInput.length < 4) {
    cashierPinInput += val;
    updatePinDots();
  }

  if (cashierPinInput.length === 4) {
    submitPinCode();
  }
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, idx) => {
    if (idx < cashierPinInput.length) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

async function submitPinCode() {
  const tempUserId = document.getElementById('pin-pad-container').getAttribute('data-temp-user-id');
  
  try {
    if (tempUserId === 'mock-cashier-id') {
      if (cashierPinInput === '1234') {
        setToken('mock-cashier-token');
        currentUser = { id: 'mock-cashier-id', name: 'Kassir Demo', email: 'cashier@gmail.com', role: 'cashier' };
        
        // Seed active shift clock transition
        const trans = JSON.parse(localStorage.getItem('mock_transitions') || '[]');
        const shiftType = new Date().getHours() >= 8 && new Date().getHours() < 20 ? 'day' : 'night';
        trans.unshift({
          id: 'trans-' + Date.now(),
          cashier: 'Kassir Demo',
          type: shiftType,
          status: 'active',
          duration: 'Davom etmoqda',
          revenue: 0.0,
          time: new Date().toISOString()
        });
        localStorage.setItem('mock_transitions', JSON.stringify(trans));

        // Log activity
        const mockLogs = JSON.parse(localStorage.getItem('mock_activity_logs') || '[]');
        mockLogs.unshift({
          id: 'log-' + Date.now(),
          user_id: 'mock-cashier-id',
          user_name: 'Kassir Demo',
          action_type: 'shift_start',
          description: `Yangi navbatchilik boshlandi: Kassir Demo (${shiftType === 'day' ? 'Kunduzgi' : 'Tungi'} navbatchilik) (Demo)`,
          created_at: new Date().toISOString()
        });
        localStorage.setItem('mock_activity_logs', JSON.stringify(mockLogs.slice(0, 100)));

        loginSuccess(currentUser);
        showToast('Kassir offline demo rejimda kirdi');
      } else {
        showToast('PIN kod noto\'g\'ri (demo: 1234)!', 'danger');
        cashierPinInput = '';
        updatePinDots();
      }
      return;
    }

    const res = await request('/auth/verify-pin', 'POST', {
      user_id: tempUserId,
      pin_code: cashierPinInput
    });

    setToken(res.token);
    currentUser = res.user;
    activeShift = res.shift;
    loginSuccess(currentUser);
    showToast(`Xush kelibsiz, ${currentUser.name}!`);
  } catch (error) {
    showToast(error.message, 'danger');
    cashierPinInput = '';
    updatePinDots();
  }
}

async function loginSuccess(user) {
  document.getElementById('auth-screen').style.display = 'none';
  
  try {
    const settings = await request('/settings', 'GET');
    currentSettings = settings;
    applySystemSettings(settings);
  } catch (e) {
    console.warn("Could not load settings on login:", e.message);
  }
  
  const shell = document.getElementById('main-shell');
  shell.style.display = 'flex';
  shell.classList.remove('role-admin', 'role-cashier', 'role-scanner');
  shell.classList.add(`role-${user.role}`);
  
  // Update header labels
  document.getElementById('header-user-name').innerText = user.name;
  let roleTextKey = 'role_cashier';
  if (user.role === 'admin') roleTextKey = 'role_admin';
  if (user.role === 'scanner') roleTextKey = 'role_scanner';
  
  const headerRole = document.getElementById('header-user-role');
  if (headerRole) {
    headerRole.setAttribute('data-i18n', roleTextKey);
  }
  
  // Set tab visibility based on Role-Based Access Control (RBAC)
  const sidebar = document.querySelector('.app-sidebar');
  if (user.role === 'scanner') {
    if (sidebar) sidebar.style.display = 'none';
    
    const scannerDeviceName = document.getElementById('scanner-device-name');
    if (scannerDeviceName) scannerDeviceName.innerText = user.name;

    switchTab('scanner');
  } else {
    if (sidebar) sidebar.style.display = 'flex';
    
    const adminElements = document.querySelectorAll('.admin-only');
    if (user.role === 'cashier') {
      adminElements.forEach(el => {
        el.style.display = 'none';
      });
      
      const actionsHeader = document.getElementById('wh-actions-header');
      if (actionsHeader) actionsHeader.style.display = 'none';
      const purchaseHeader = document.getElementById('wh-purchase-header');
      if (purchaseHeader) purchaseHeader.style.display = 'none';
      
      switchTab('pos');
    } else {
      // Role is Admin
      adminElements.forEach(el => {
        if (el.tagName === 'TH' || el.tagName === 'TD') {
          el.style.display = 'table-cell';
        } else if (el.classList.contains('nav-link')) {
          el.style.display = 'flex';
        } else {
          el.style.display = 'block';
        }
      });
      
      const actionsHeader = document.getElementById('wh-actions-header');
      if (actionsHeader) actionsHeader.style.display = 'table-cell';
      const purchaseHeader = document.getElementById('wh-purchase-header');
      if (purchaseHeader) purchaseHeader.style.display = 'table-cell';
      
      switchTab('dashboard');
    }
  }

  applyTranslations();

  // Initialize Cashier Shift Live Tracking or Admin Monitoring
  initCashierShiftTracking(user);

  // Establish live Telemetry Websockets channel
  initSocket(handleTelemetryEvent);

  // Load active tab data
  refreshActiveTabData();
}

/**
 * Socket.io Telemetry Event Listener Broker
 */
function handleTelemetryEvent(event, data) {
  console.log(`[Ecosystem Socket Dispatch] -> ${event}`, data);
  
  const activeLink = document.querySelector('.nav-link.active');
  const currentView = activeLink ? activeLink.getAttribute('data-view') : '';

  if (event === 'shift:started') {
    if (currentUser && currentUser.role === 'admin') {
      showToast(`🟢 ${data.user_name} tizimga kirdi va ish vaqti boshlandi!`, 'info');
      loadStaffWorkHoursData();
    }
    appendShiftTransitionLog(data, 'started');
    if (currentView === 'dashboard') loadDashboardData();
  }
  
  else if (event === 'shift:completed' || event === 'shift:ended') {
    if (currentUser && currentUser.role === 'admin') {
      const dur = data.duration ? ` (${data.duration})` : '';
      showToast(`🛑 ${data.user_name} navbatchiligini yakunladi${dur}. Tushum: $${Number(data.revenue || 0).toFixed(2)}`, 'warning');
      loadStaffWorkHoursData();
    }
    appendShiftTransitionLog(data, 'completed');
    if (currentView === 'dashboard') loadDashboardData();
  }
  
  else if (event === 'sale:created') {
    if (currentUser && currentUser.role === 'cashier') {
      updateCashierShiftRevenue(data.sale_total);
    }
    if (currentUser && currentUser.role === 'admin') {
      loadStaffWorkHoursData();
    }
    showToast(`Yangi sotuv! Summa: $${data.sale_total}`, 'success');
    if (currentView === 'dashboard') loadDashboardData();
    if (currentView === 'pos') refreshPOSProducts();
  }
  
  else if (event === 'stock:changed') {
    if (currentView === 'pos') refreshPOSProducts();
    if (currentView === 'warehouse') loadWarehouseProducts();
    if (currentView === 'dashboard') loadDashboardData();
  }
  
  else if (event === 'scan:created') {
    showToast(`Yangi mobil skanerlash arizasi kelib tushdi!`, 'success');
    if (currentView === 'warehouse') loadScanRequests();
  }
  
  else if (event === 'scan:approved') {
    showToast(`Skanerlash arizasi tasdiqlandi va omborga qo'shildi.`, 'success');
    if (currentView === 'warehouse') {
      loadScanRequests();
      loadWarehouseProducts();
    }
    if (currentView === 'pos') refreshPOSProducts();
  }
  
  else if (event === 'settings:changed') {
    showToast(`Tizim sozlamalari real vaqtda yangilandi.`);
    // Directly apply theme settings in DOM
    if (data.key === 'theme') {
      applyThemeStyles(data.value);
    } else if (data.key === 'branding') {
      applyBrandingStyles(data.value);
    }
  }
  
  else if (event === 'click:paid') {
    if (activeClickTransactionParam && data.merchant_trans_id === activeClickTransactionParam) {
      showToast(`Click to'lovi muvaffaqiyatli qabul qilindi! Summa: $${data.amount}`, 'success');
      
      const clickModal = document.getElementById('click-payment-modal');
      if (clickModal) clickModal.style.display = 'none';
      const clickPaySuccessBtn = document.getElementById('click-pay-success-btn');
      if (clickPaySuccessBtn) clickPaySuccessBtn.style.display = 'none';
      
      const repayModal = document.getElementById('repay-modal');
      if (repayModal) repayModal.style.display = 'none';
      
      const isRepayment = activeClickTransactionParam.startsWith('debt_repay_');
      activeClickTransactionParam = '';
      
      if (isRepayment) {
        loadDebts();
        loadInstallments();
      } else {
        completePOSCheckout();
      }
    }
  }
}

/**
 * Nav tab switcher
 */
function switchTab(viewName) {
  // Guard admin tabs from cashiers
  if (currentUser && currentUser.role === 'cashier' && ['dashboard', 'staff', 'branches', 'click-integration', 'activities', 'settings'].includes(viewName)) {
    viewName = 'pos';
  }

  const tabs = document.querySelectorAll('.nav-link');
  const views = document.querySelectorAll('.tab-view');

  tabs.forEach(tab => {
    if (tab.getAttribute('data-view') === viewName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  views.forEach(view => {
    if (view.id === `view-${viewName}`) {
      view.style.display = viewName === 'pos' ? 'grid' : 'block';
    } else {
      view.style.display = 'none';
    }
  });

  refreshActiveTabData();
}

function refreshActiveTabData() {
  const activeTab = document.querySelector('.nav-link.active');
  const view = activeTab ? activeTab.getAttribute('data-view') : (currentUser && currentUser.role === 'scanner' ? 'scanner' : null);
  if (!view) return;

  if (view === 'dashboard') {
    loadDashboardData();
  } else if (view === 'pos') {
    refreshPOSProducts();
    const hwScannerInput = document.getElementById('pos-hardware-scanner-input');
    const scannerContainer = document.getElementById('pos-scanner-container');
    const isScannerActive = scannerContainer && scannerContainer.style.display === 'block';
    if (isScannerActive && hwScannerInput) {
      setTimeout(() => hwScannerInput.focus(), 150);
    }
  } else if (view === 'warehouse') {
    loadWarehouseProducts();
  } else if (view === 'debts') {
    loadDebts();
  } else if (view === 'installments') {
    loadInstallments();
  } else if (view === 'staff') {
    loadStaffList();
  } else if (view === 'branches') {
    loadBranches();
  } else if (view === 'click-integration') {
    loadClickConfig();
  } else if (view === 'activities') {
    loadActivityLogs();
  } else if (view === 'settings') {
    loadSystemSettings();
    loadSettingsUsers();
  } else if (view === 'scanner') {
    loadScannerBranches();
    initHtml5Scanner();
  }
}

/**
 * 1. Dashboard Logic
 */
async function loadDashboardData() {
  try {
    const analytics = await request('/shifts/analytics', 'GET');
    
    document.getElementById('stat-revenue').innerText = `$${parseFloat(analytics.total_revenue).toFixed(2)}`;
    document.getElementById('stat-expenses').innerText = `$${parseFloat(analytics.total_expenses || 0).toFixed(2)}`;
    
    // Calculate and display Net Profit
    const profit = parseFloat(analytics.total_revenue) - parseFloat(analytics.total_expenses || 0);
    const profitEl = document.getElementById('stat-profit');
    if (profitEl) {
      profitEl.innerText = `$${profit.toFixed(2)}`;
      profitEl.style.color = profit >= 0 ? '#10b981' : 'var(--color-danger)';
    }

    document.getElementById('stat-inventory').innerText = `$${parseFloat(analytics.inventory_valuation).toFixed(2)}`;
    document.getElementById('day-shift-val').innerText = `$${parseFloat(analytics.day_shift_revenue).toFixed(2)}`;
    document.getElementById('night-shift-val').innerText = `$${parseFloat(analytics.night_shift_revenue).toFixed(2)}`;

    // Set active shift text
    const active = analytics.transitions.find(t => t.status === 'active');
    if (active) {
      document.getElementById('stat-shift').innerHTML = `
        <span style="color:var(--color-success);font-weight:600;">${active.cashier}</span><br>
        <span style="font-size:12px;color:var(--color-text-secondary);">${active.type === 'day' ? 'Kunduzgi' : 'Tungi'}</span>
      `;
    } else {
      document.getElementById('stat-shift').innerText = "Faol emas";
    }

    // Render Main Financial Summary Chart
    const finCanvas = document.getElementById('financial-summary-chart');
    if (finCanvas && typeof Chart !== 'undefined') {
      const revenue = parseFloat(analytics.total_revenue);
      const expenses = parseFloat(analytics.total_expenses || 0);
      const netProfit = revenue - expenses;
      
      if (financialSummaryChart) {
        financialSummaryChart.destroy();
      }
      
      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00f2fe';
      
      financialSummaryChart = new Chart(finCanvas, {
        type: 'bar',
        data: {
          labels: ['Tushum (Kirgan)', 'Chiqim (Chiqqan)', 'Sof Foyda'],
          datasets: [{
            data: [revenue, expenses, netProfit],
            backgroundColor: [
              accentColor,
              '#ef4444',
              netProfit >= 0 ? '#10b981' : '#ef4444'
            ],
            borderRadius: 8,
            borderWidth: 0,
            barThickness: 45
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ` $${parseFloat(context.raw).toFixed(2)}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(255, 255, 255, 0.05)'
              },
              ticks: {
                color: 'var(--color-text-secondary)',
                callback: function(value) {
                  return '$' + value;
                }
              }
            },
            x: {
              grid: {
                display: false
              },
              ticks: {
                color: '#ffffff',
                font: {
                  weight: '600'
                }
              }
            }
          }
        }
      });
    }

    // Load transition logs
    const logContainer = document.getElementById('shift-transition-logs');
    if (analytics.transitions.length === 0) {
      logContainer.innerHTML = `<div style="text-align:center;color:var(--color-text-secondary);padding-top:40px;" data-i18n="dash_no_shifts">Hozircha o'tishlar qayd etilmagan</div>`;
    } else {
      logContainer.innerHTML = analytics.transitions.map(log => `
        <div style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.03);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:500;">${log.cashier} (${log.type === 'day' ? 'Kunduzgi' : 'Tungi'})</div>
            <div style="font-size:12px;color:var(--color-text-secondary);">${new Date(log.time).toLocaleTimeString()}</div>
          </div>
          <div style="text-align:right; display:flex; flex-direction:column; align-items:end;">
            <div style="font-weight:600;color:var(--accent);">Rev: $${parseFloat(log.revenue).toFixed(2)}</div>
            <div style="font-size:12px;color:var(--color-danger);font-weight:500;">Wage: $${parseFloat(log.wage || 0).toFixed(2)}</div>
            <div style="font-size:11px;color:${log.status === 'active' ? 'var(--color-success)' : 'var(--color-text-secondary)'};">
              ${log.status === 'active' ? 'Faol' : log.duration}
            </div>
          </div>
        </div>
      `).join('');
    }

    // Load Staff Stats table
    const staffTbody = document.getElementById('dashboard-staff-tbody');
    if (staffTbody) {
      if (!analytics.staff_stats || analytics.staff_stats.length === 0) {
        staffTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--color-text-secondary);">Xodimlar topilmadi</td></tr>`;
      } else {
        staffTbody.innerHTML = analytics.staff_stats.map(staff => {
          const statusBadge = staff.status === 'active' 
            ? `<span style="font-size:11px;background:rgba(16,185,129,0.1);color:#10b981;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-circle" style="font-size:8px;margin-right:4px;"></i> Faol smenada</span>`
            : `<span style="font-size:11px;background:rgba(255,255,255,0.05);color:var(--color-text-secondary);padding:4px 8px;border-radius:6px;font-weight:600;">Smenada emas</span>`;
          
          const roleBadge = staff.role === 'admin'
            ? `<span style="font-size:11px;background:rgba(59,130,246,0.1);color:#3b82f6;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:500;">Admin</span>`
            : `<span style="font-size:11px;background:rgba(245,158,11,0.1);color:#f59e0b;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:500;">Kassir</span>`;

          return `
            <tr>
              <td><strong>${staff.name}</strong> ${roleBadge}</td>
              <td><span style="font-size:12px;color:var(--color-text-secondary);">${staff.email}</span></td>
              <td style="color:#10b981;font-weight:600;">$${parseFloat(staff.total_revenue).toFixed(2)}</td>
              <td><strong>${staff.total_hours} soat</strong></td>
              <td style="color:var(--accent);font-weight:600;">$${parseFloat(staff.total_wage).toFixed(2)}</td>
              <td>${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Load Cashier Sales Details
    const selectorsContainer = document.getElementById('cashier-details-selectors');
    const salesTitle = document.getElementById('selected-cashier-sales-title');
    const cashierSalesTbody = document.getElementById('cashier-details-sales-tbody');

    if (selectorsContainer && cashierSalesTbody) {
      if (!analytics.staff_stats || analytics.staff_stats.length === 0) {
        selectorsContainer.innerHTML = `<div style="color:var(--color-text-secondary);text-align:center;padding:20px;">Kassirlar topilmadi</div>`;
        cashierSalesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-secondary);">Ma'lumot mavjud emas</td></tr>`;
      } else {
        const cashiers = analytics.staff_stats;

        // Render selectors (left pane)
        selectorsContainer.innerHTML = cashiers.map((c, index) => {
          const isActive = c.status === 'active' ? '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;margin-left:auto;"></span>' : '';
          return `
            <button class="cashier-selector-btn" style="width:100%; display:flex; align-items:center; gap:10px; padding:12px 16px; background:${index === 0 ? 'rgba(0, 242, 254, 0.12)' : 'var(--glass-bg)'}; border:1px solid ${index === 0 ? 'var(--accent)' : 'var(--glass-border)'}; border-radius:10px; color:var(--color-text-primary); font-size:13px; font-weight:600; text-align:left; cursor:pointer; transition:all 0.2s; border-style:solid;">
              <div style="width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; color:var(--accent);">
                <i class="fas fa-user-tie"></i>
              </div>
              <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</span>
                <span style="font-size:10px; color:var(--color-text-secondary); font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Sotuv: ${c.total_devices || 0} ta | $${parseFloat(c.total_revenue || 0).toFixed(2)}</span>
              </div>
              ${isActive}
            </button>
          `;
        }).join('');

        // Helper function to render a selected cashier's sales
        const renderCashierSales = (cashier) => {
          if (salesTitle) {
            salesTitle.innerHTML = `<i class="fas fa-user-circle" style="margin-right:6px; color:var(--accent);"></i> <strong>${cashier.name}</strong> tomonidan sotilgan mahsulotlar`;
          }
          
          if (!cashier.recent_sales || cashier.recent_sales.length === 0) {
            cashierSalesTbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-secondary);padding:30px;">Hozircha ushbu kassir tomonidan sotuvlar amalga oshirilmagan</td></tr>`;
          } else {
            cashierSalesTbody.innerHTML = cashier.recent_sales.map(s => {
              const date = new Date(s.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(s.time).toLocaleDateString([], { day: '2-digit', month: '2-digit' });
              return `
                <tr>
                  <td><strong>${s.product_name}</strong></td>
                  <td><code style="font-size:11px;">${s.model || 'N/A'}</code></td>
                  <td>${s.quantity} ta</td>
                  <td style="color:var(--accent); font-weight:600;">$${parseFloat(s.total_price).toFixed(2)}</td>
                  <td style="font-size:12px; color:var(--color-text-secondary);">${date}</td>
                </tr>
              `;
            }).join('');
          }
        };

        // Render first cashier by default
        if (cashiers.length > 0) {
          renderCashierSales(cashiers[0]);
        }

        // Attach click listeners to selectors
        const buttons = selectorsContainer.querySelectorAll('.cashier-selector-btn');
        buttons.forEach((btn, index) => {
          btn.addEventListener('click', () => {
            buttons.forEach(b => {
              b.style.background = 'var(--glass-bg)';
              b.style.borderColor = 'var(--glass-border)';
            });
            btn.style.background = 'rgba(0, 242, 254, 0.12)';
            btn.style.borderColor = 'var(--accent)';
            renderCashierSales(cashiers[index]);
          });
        });
      }
    }

    // Fetch and Load Sales History
    try {
      const salesHistory = await request('/sales/history', 'GET');
      const salesTbody = document.getElementById('sales-history-tbody');
      if (salesTbody) {
        if (salesHistory.length === 0) {
          salesTbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--color-text-secondary);" data-i18n="dash_no_sales">Hozircha sotuvlar amalga oshirilmagan</td></tr>`;
        } else {
          salesTbody.innerHTML = salesHistory.map(sale => {
            let payBadge = '';
            if (sale.payment_method === 'debt') {
              payBadge = '<span style="font-size:11px;padding:3px 8px;border-radius:6px;font-weight:600;background:rgba(239,68,68,0.15);color:#ef4444;"><i class="fas fa-hand-holding-usd" style="margin-right:4px;"></i>Nasiya</span>';
            } else if (sale.payment_method === 'click') {
              payBadge = '<span style="font-size:11px;padding:3px 8px;border-radius:6px;font-weight:600;background:rgba(0,242,254,0.15);color:#00f2fe;"><i class="fas fa-qrcode" style="margin-right:4px;"></i>Click</span>';
            } else {
              payBadge = '<span style="font-size:11px;padding:3px 8px;border-radius:6px;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;"><i class="fas fa-money-bill-wave" style="margin-right:4px;"></i>Naqd</span>';
            }

            let actions = '';
            if (sale.payment_method === 'debt' && sale.debt_id) {
              actions = `
                <div style="display:flex;gap:4px;">
                  <button class="btn-secondary" onclick="previewDebtContract('${sale.debt_id}')" style="padding:4px 8px; font-size:11px; border-radius:6px; font-weight:600; background:rgba(16,185,129,0.08); color:#10b981; border:1px solid rgba(16,185,129,0.15);" title="Shartnoma ko'rish"><i class="fas fa-file-invoice"></i> Hujjat</button>
                  <button class="btn-secondary" onclick="printDebtContract('${sale.debt_id}')" style="padding:4px 8px; font-size:11px; border-radius:6px; font-weight:600; background:rgba(0,242,254,0.08); color:#00f2fe; border:1px solid rgba(0,242,254,0.15);" title="Chop etish"><i class="fas fa-print"></i></button>
                </div>
              `;
            } else {
              actions = '<span style="color:var(--color-text-secondary);font-size:11px;">-</span>';
            }

            return `
              <tr>
                <td>
                  <div style="font-weight:600;font-size:14px;">${sale.product_name}</div>
                  <div style="font-size:11px;color:var(--color-text-secondary);">
                    RAM: ${sale.specifications.ram || 'N/A'} | Storage: ${sale.specifications.storage || 'N/A'} | O'lchami: ${sale.specifications.size || 'N/A'} | Color: ${sale.specifications.color || 'N/A'}
                  </div>
                </td>
                <td><code>${sale.qr_code}</code></td>
                <td>
                  <span style="font-size:12px;font-weight:500;color:var(--color-text-primary);">
                    <i class="fas fa-store" style="font-size:11px;margin-right:4px;color:var(--accent);"></i>${sale.branch_name}
                  </span>
                </td>
                <td>${sale.quantity} ta</td>
                <td style="color:var(--accent);font-weight:600;">$${parseFloat(sale.total_price).toFixed(2)}</td>
                <td>
                  <span style="font-weight:500;">${sale.cashier}</span>
                  <div style="font-size:10px;color:var(--color-text-secondary);margin-top:2px;">
                    <i class="fas ${sale.cashier_role === 'scanner' ? 'fa-barcode' : 'fa-user-tag'}" style="font-size:9px;margin-right:2px;color:var(--accent);"></i>${sale.cashier_role === 'scanner' ? 'Skaner qurilma' : 'Kassir'}
                  </div>
                </td>
                <td>${payBadge}</td>
                <td style="font-size:12px;color:var(--color-text-secondary);">${new Date(sale.time).toLocaleString()}</td>
                <td>${actions}</td>
              </tr>
            `;
          }).join('');
        }
      }
    } catch (e) {
      console.warn("Could not fetch sales history:", e.message);
    }

    // Load Location Sales Breakdown
    const locContainer = document.getElementById('dashboard-location-breakdown');
    if (locContainer) {
      if (!analytics.branch_breakdown || analytics.branch_breakdown.length === 0) {
        locContainer.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); padding: 20px;" data-i18n="dash_no_location_sales">Sotuvlar joylashuv bo'yicha tahlil qilinmoqda...</div>`;
      } else {
        const maxSales = Math.max(...analytics.branch_breakdown.map(b => b.total_sales), 1);
        locContainer.innerHTML = analytics.branch_breakdown.map(b => {
          const pct = Math.min((b.total_sales / maxSales) * 100, 100);
          const avgTicket = b.total_devices > 0 ? (b.total_sales / b.total_devices).toFixed(2) : '0.00';
          
          return `
            <div class="branch-stat-card" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); transition: transform 0.2s ease;">
              <div style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="width: 36px; height: 36px; border-radius: 8px; background: rgba(0,242,254,0.08); display: flex; align-items: center; justify-content: center; color: var(--accent); font-size: 16px;">
                    <i class="fas fa-store"></i>
                  </div>
                  <span style="font-weight: 600; font-size: 15px; color: #ffffff;">${b.branch_name}</span>
                </div>
                <span style="color: #10b981; font-weight: 700; font-size: 16px;">$${parseFloat(b.total_sales).toFixed(2)}</span>
              </div>
              
              <div style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 4px; overflow: hidden; margin: 4px 0;">
                <div style="background: var(--accent-gradient); width: ${pct}%; height: 100%; border-radius: 4px; box-shadow: var(--accent-glow);"></div>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <div>
                  <span style="color: var(--color-text-secondary);">Sotilgan:</span>
                  <strong style="color: #ffffff; margin-left: 4px;">${b.total_devices} ta</strong>
                </div>
                <div style="text-align: right;">
                  <span style="color: var(--color-text-secondary);">O'rtacha check:</span>
                  <strong style="color: var(--accent); margin-left: 4px;">$${avgTicket}</strong>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 8px; margin-top: 2px;">
                <div>
                  <span style="color: var(--color-text-secondary);">Chiqim (Maosh):</span>
                  <strong style="color: var(--color-danger); margin-left: 4px;">$${parseFloat(b.total_expenses || 0).toFixed(2)}</strong>
                </div>
                <div style="text-align: right;">
                  <span style="color: var(--color-text-secondary);">Sof Foyda:</span>
                  <strong style="color: #10b981; margin-left: 4px;">$${parseFloat(b.total_sales - (b.total_expenses || 0)).toFixed(2)}</strong>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Render branch sales doughnut chart
      const canvas = document.getElementById('branch-sales-chart');
      if (canvas && typeof Chart !== 'undefined') {
        const labels = analytics.branch_breakdown.map(b => b.branch_name);
        const data = analytics.branch_breakdown.map(b => b.total_sales);
        
        if (branchSalesChart) {
          branchSalesChart.destroy();
        }
        
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#00f2fe';
        
        branchSalesChart = new Chart(canvas, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: [
                accentColor,
                '#10b981',
                '#f59e0b',
                '#3b82f6',
                '#ec4899',
                '#8b5cf6'
              ],
              borderWidth: 0,
              hoverOffset: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return ` ${context.label}: $${parseFloat(context.raw).toFixed(2)}`;
                  }
                }
              }
            },
            cutout: '70%'
          }
        });

        // Render custom legend under the chart showing complete calculations
        const legendContainer = document.getElementById('chart-legend-container');
        if (legendContainer) {
          const totalSales = analytics.branch_breakdown.reduce((sum, b) => sum + b.total_sales, 0);
          const colors = [
            accentColor,
            '#10b981',
            '#f59e0b',
            '#3b82f6',
            '#ec4899',
            '#8b5cf6'
          ];
          
          legendContainer.innerHTML = analytics.branch_breakdown.map((b, i) => {
            const share = totalSales > 0 ? ((b.total_sales / totalSales) * 100).toFixed(1) : '0.0';
            const color = colors[i % colors.length];
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
                  <span style="font-weight: 600; color: #ffffff;">${b.branch_name}</span>
                </div>
                <div style="text-align: right;">
                  <strong style="color: #10b981;">$${parseFloat(b.total_sales).toFixed(2)}</strong>
                  <span style="color: var(--color-text-secondary); margin-left: 6px; font-size: 11px;">(${share}%)</span>
                </div>
              </div>
            `;
          }).join('');
        }
      }
      // Calculate unified combined statistics
      const unifiedContainer = document.getElementById('dashboard-unified-summary-container');
      if (unifiedContainer) {
        const totalSales = analytics.branch_breakdown.reduce((sum, b) => sum + b.total_sales, 0);
        const totalDevices = analytics.branch_breakdown.reduce((sum, b) => sum + b.total_devices, 0);
        const overallAvgTicket = totalDevices > 0 ? (totalSales / totalDevices).toFixed(2) : '0.00';
        
        let leaderText = "Hozircha sotuvlar amalga oshirilmagan.";
        if (totalSales > 0) {
          const sorted = [...analytics.branch_breakdown].sort((a, b) => b.total_sales - a.total_sales);
          const leader = sorted[0];
          const share = ((leader.total_sales / totalSales) * 100).toFixed(1);
          leaderText = `Eng yuqori savdo ko'rsatkichi <strong>${leader.branch_name}</strong> hisobiga to'g'ri keladi (Jami tushumning <strong>${share}%</strong> ulushi).`;
        }

        unifiedContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
              <span style="font-size: 12px; color: var(--color-text-secondary);">Jami Birlashgan Savdo:</span>
              <strong style="font-size: 15px; color: #10b981;">$${totalSales.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
              <span style="font-size: 12px; color: var(--color-text-secondary);">Jami Sotilgan Telefonlar:</span>
              <strong style="font-size: 15px; color: #ffffff;">${totalDevices} ta</strong>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
              <span style="font-size: 12px; color: var(--color-text-secondary);">O'rtacha Check (Tizim):</span>
              <strong style="font-size: 15px; color: var(--accent);">$${overallAvgTicket}</strong>
            </div>
            <div style="font-size: 12px; color: var(--color-text-secondary); line-height: 1.4; display: flex; align-items: start; gap: 8px; margin-top: 6px;">
              <div style="width: 20px; height: 20px; border-radius: 50%; background: rgba(16,185,129,0.1); display: flex; align-items: center; justify-content: center; color: #10b981; font-size: 10px; flex-shrink: 0; margin-top: 2px;">
                <i class="fas fa-chart-line"></i>
              </div>
              <span>${leaderText}</span>
            </div>
          </div>
        `;
      }

      applyTranslations();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

function appendShiftTransitionLog(data, state) {
  const logContainer = document.getElementById('shift-transition-logs');
  const emptyPlaceholder = logContainer.querySelector('[data-i18n="dash_no_shifts"]');
  if (emptyPlaceholder) emptyPlaceholder.remove();

  const element = document.createElement('div');
  element.style.cssText = 'padding:12px;border-bottom:1px solid rgba(255,255,255,0.03);display:flex;justify-content:between;align-items:center;';
  element.innerHTML = `
    <div>
      <div style="font-weight:500;">${data.user_name} (${data.shift_type === 'day' ? 'Kunduzgi' : 'Tungi'})</div>
      <div style="font-size:12px;color:var(--color-text-secondary);">${new Date().toLocaleTimeString()}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-weight:600;color:var(--accent);">$${parseFloat(data.revenue || 0).toFixed(2)}</div>
      <div style="font-size:11px;color:${state === 'started' ? 'var(--color-success)' : 'var(--color-text-secondary)'};">
        ${state === 'started' ? 'Faol' : 'Yakunlandi'}
      </div>
    </div>
  `;
  logContainer.insertBefore(element, logContainer.firstChild);
}

/**
 * 2. POS Grid logic
 */
async function refreshPOSProducts(search = '') {
  try {
    const products = await request(`/products?search=${search}`, 'GET');
    posProductsList = products;

    // Populate manual select dropdown
    const select = document.getElementById('pos-manual-product-select');
    if (select) {
      select.innerHTML = `<option value="">-- Telefonni tanlang --</option>` + products.filter(p => p.quantity > 0).map(p => `
        <option value="${p.id}">${p.model_name} ($${parseFloat(p.retail_price).toFixed(2)}) - ${p.quantity} ta</option>
      `).join('');
    }

    const container = document.getElementById('pos-product-list');
    
    if (products.length === 0) {
      container.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--color-text-secondary);">Mahsulot topilmadi</div>`;
      return;
    }

    container.innerHTML = products.map(p => {
      const hasImage = p.specifications && p.specifications.image;
      const imgHtml = hasImage 
        ? `<img src="${p.specifications.image}" style="width:100%; height:100%; object-fit:cover;">`
        : `<i class="fas fa-mobile-alt" style="font-size: 32px; color: var(--accent); opacity: 0.7;"></i>`;

      return `
        <div class="product-card" data-id="${p.id}" style="display: flex; flex-direction: column; min-height: 220px; justify-content: space-between; position: relative;">
          <!-- Stock status badge overlay (Top-left) -->
          <div style="position: absolute; top: 10px; left: 10px; z-index: 10;">
            ${p.quantity === 0 
              ? `<span style="font-size:10px;background:rgba(239,68,68,0.85);color:#ffffff;padding:3px 7px;border-radius:6px;font-weight:600;backdrop-filter:blur(4px);">Tugagan</span>`
              : p.quantity < 5 
                ? `<span style="font-size:10px;background:rgba(245,158,11,0.85);color:#ffffff;padding:3px 7px;border-radius:6px;font-weight:600;backdrop-filter:blur(4px);">Kam (${p.quantity} ta)</span>`
                : `<span style="font-size:10px;background:rgba(16,185,129,0.85);color:#ffffff;padding:3px 7px;border-radius:6px;font-weight:600;backdrop-filter:blur(4px);">Sotuvda (${p.quantity} ta)</span>`
            }
          </div>

          <!-- Eye icon details button (Bottom-right) -->
          <button type="button" class="info-btn" data-id="${p.id}" style="position: absolute; bottom: 10px; right: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--color-text-secondary); cursor: pointer; transition: all 0.2s; z-index: 10;" onmouseover="this.style.color='var(--accent)'; this.style.borderColor='var(--accent)'; this.style.background='rgba(0, 242, 254, 0.1)';" onmouseout="this.style.color='var(--color-text-secondary)'; this.style.borderColor='rgba(255,255,255,0.15)'; this.style.background='rgba(255,255,255,0.06)';" title="Batafsil ma'lumot"><i class="fas fa-eye" style="font-size: 11px;"></i></button>

          <div>
            <div class="product-img-wrapper" style="width: 100%; height: 110px; border-radius: 10px; overflow: hidden; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; margin-bottom: 10px;">
              ${imgHtml}
            </div>
            <div class="product-name" style="font-weight: 600;">${p.model_name}</div>
            <div class="product-specs" style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
              RAM: ${p.specifications.ram || 'N/A'} | ROM: ${p.specifications.storage || 'N/A'} | ${p.specifications.color || 'N/A'}
            </div>
          </div>
          <div class="product-meta" style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
            <span class="product-price" style="font-weight: 700; color: var(--accent);">$${parseFloat(p.retail_price).toFixed(2)}</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach click events
    container.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const prodId = card.getAttribute('data-id');
        const prod = products.find(p => p.id === prodId);
        if (prod.quantity === 0) {
          showToast('Mahsulot omborda qolmagan!', 'danger');
          return;
        }
        addToCart(prod, 1);
        showToast(`${prod.model_name} savatchaga qo'shildi!`);
      });
    });

    container.querySelectorAll('.info-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering card click (adding to cart)
        const prodId = btn.getAttribute('data-id');
        const prod = products.find(p => p.id === prodId);
        openPOSProductDetailsModal(prod);
      });
    });

  } catch (e) {
    showToast(e.message, 'danger');
  }
}

let selectedPOSProduct = null;
let activeClickTransactionParam = '';

function openPOSProductDetailsModal(prod) {
  selectedPOSProduct = prod;
  
  const modal = document.getElementById('pos-product-details-modal');
  if (!modal) return;
  
  document.getElementById('pos-detail-model-name').innerText = prod.model_name || '-';
  document.getElementById('pos-detail-qr-code').innerText = prod.qr_code || '-';
  document.getElementById('pos-detail-retail-price').innerText = `$${parseFloat(prod.retail_price).toFixed(2)}`;
  
  const qtyEl = document.getElementById('pos-detail-quantity');
  if (prod.quantity === 0) {
    qtyEl.innerHTML = `<span style="color:#ef4444; font-weight:600;">Tugagan</span>`;
    document.getElementById('pos-detail-add-btn').disabled = true;
    document.getElementById('pos-detail-add-btn').style.opacity = '0.5';
  } else {
    qtyEl.innerHTML = `<span style="color:#10b981; font-weight:600;">${prod.quantity} ta (Sotuvda)</span>`;
    document.getElementById('pos-detail-add-btn').disabled = false;
    document.getElementById('pos-detail-add-btn').style.opacity = '1';
  }
  
  document.getElementById('pos-detail-ram').innerText = prod.specifications?.ram || 'N/A';
  document.getElementById('pos-detail-storage').innerText = prod.specifications?.storage || 'N/A';
  document.getElementById('pos-detail-color').innerText = prod.specifications?.color || 'N/A';
  document.getElementById('pos-detail-size').innerText = prod.specifications?.size || 'N/A';
  
  const imgEl = document.getElementById('pos-detail-image');
  const placeholderEl = document.getElementById('pos-detail-image-placeholder');
  
  if (prod.specifications && prod.specifications.image) {
    imgEl.src = prod.specifications.image;
    imgEl.style.display = 'block';
    placeholderEl.style.display = 'none';
  } else {
    imgEl.src = '';
    imgEl.style.display = 'none';
    placeholderEl.style.display = 'flex';
  }

  const qtyInput = document.getElementById('pos-detail-qty-input');
  if (qtyInput) {
    qtyInput.value = 1;
    qtyInput.max = prod.quantity;
    qtyInput.disabled = (prod.quantity === 0);
  }
  
  applyTranslations();
  modal.style.display = 'flex';
}

function addToCart(product, quantityToAdd = 1) {
  const existing = currentCart.find(item => item.product_id === product.id);
  if (existing) {
    if (existing.quantity + quantityToAdd <= product.quantity) {
      existing.quantity += quantityToAdd;
    } else {
      showToast(dictionaries[getLanguage()].pos_out_of_stock, 'danger');
    }
  } else {
    currentCart.push({
      product_id: product.id,
      model_name: product.model_name,
      retail_price: product.retail_price,
      quantity: quantityToAdd,
      click_payment_url: product.click_payment_url || '',
      specifications: product.specifications || {}
    });
  }
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  if (currentCart.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); padding: 40px 0;" data-i18n="pos_cart_empty">Savatcha bo'sh.</div>`;
    document.getElementById('cart-total-value').innerText = '$0.00';
    applyTranslations();
    
    const mobileCartBadge = document.getElementById('mobile-cart-badge');
    if (mobileCartBadge) {
      mobileCartBadge.style.display = 'none';
    }
    return;
  }

  const clickActive = currentSettings && currentSettings.click_config && currentSettings.click_config.active;
  let total = 0;
  container.innerHTML = currentCart.map(item => {
    const itemTotal = item.retail_price * item.quantity;
    total += itemTotal;
    return `
      <div class="cart-item" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div class="cart-item-name" style="font-weight: 600;">${item.model_name}</div>
          <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
            RAM: ${item.specifications?.ram || 'N/A'} | ROM: ${item.specifications?.storage || 'N/A'} | Rangi: ${item.specifications?.color || 'N/A'}
          </div>
          <div class="cart-item-price" style="font-size: 12px; color: var(--accent); margin-top: 4px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
            $${parseFloat(item.retail_price).toFixed(2)} x ${item.quantity}
            ${(item.click_payment_url || clickActive) ? `<span class="click-badge" data-id="${item.product_id}" data-price="${item.retail_price}" data-qty="${item.quantity}" data-model="${item.model_name}" data-url="${item.click_payment_url || ''}" style="cursor: pointer; background: #00f2fe; color: #000000; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 10px rgba(0, 242, 254, 0.4);"><i class="fas fa-qrcode"></i> Click QR To'lov</span>` : ''}
          </div>
        </div>
        <div class="cart-item-controls" style="display: flex; align-items: center;">
          <button class="cart-qty-btn cart-dec" data-id="${item.product_id}" style="padding: 2px 8px; font-size: 12px;">-</button>
          <span style="font-weight:600;min-width:18px;text-align:center;font-size:14px;margin: 0 8px;">${item.quantity}</span>
          <button class="cart-qty-btn cart-inc" data-id="${item.product_id}" style="padding: 2px 8px; font-size: 12px;">+</button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('cart-total-value').innerText = `$${total.toFixed(2)}`;

  // Controls click handlers
  container.querySelectorAll('.cart-dec').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const idx = currentCart.findIndex(item => item.product_id === id);
      if (idx !== -1) {
        if (currentCart[idx].quantity > 1) {
          currentCart[idx].quantity -= 1;
        } else {
          currentCart.splice(idx, 1);
        }
        renderCart();
      }
    });
  });

  container.querySelectorAll('.cart-inc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      const item = currentCart.find(item => item.product_id === id);
      if (item) {
        item.quantity += 1;
        renderCart();
      }
    });
  });

  // Bind click badge QR handler
  container.querySelectorAll('.click-badge').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const prodId = badge.getAttribute('data-id');
      const model = badge.getAttribute('data-model');
      const price = parseFloat(badge.getAttribute('data-price'));
      const qty = parseInt(badge.getAttribute('data-qty'));
      const hardcodedUrl = badge.getAttribute('data-url');
      const totalAmount = price * qty;

      let paymentUrl = hardcodedUrl;
      if (!paymentUrl && currentSettings && currentSettings.click_config) {
        const config = currentSettings.click_config;
        if (config.card_number) {
          const cleanCard = config.card_number.replace(/\s+/g, '');
          paymentUrl = `https://my.click.uz/services/pay?service_id=3&merchant_id=${cleanCard}&amount=${totalAmount.toFixed(2)}&transaction_param=${prodId}`;
        } else {
          paymentUrl = `https://my.click.uz/services/pay?service_id=${config.service_id}&merchant_id=${config.merchant_id}&amount=${totalAmount.toFixed(2)}&transaction_param=${prodId}`;
        }
      }

      openClickPayModal(model, totalAmount, paymentUrl);
    });
  });

  const mobileCartBadge = document.getElementById('mobile-cart-badge');
  if (mobileCartBadge) {
    const totalQty = currentCart.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQty > 0) {
      mobileCartBadge.innerText = totalQty;
      mobileCartBadge.style.display = 'inline-block';
    } else {
      mobileCartBadge.style.display = 'none';
    }
  }
}

function displayScannedProduct(product) {
  const displayContainer = document.getElementById('pos-scanner-product-display');
  if (!displayContainer) return;
  displayContainer.style.display = 'block';

  const hasImage = product.specifications && product.specifications.image;
  const imgHtml = hasImage 
    ? `<img src="${product.specifications.image}" style="max-height: 120px; max-width: 100%; object-fit: contain; border-radius: 8px; margin-bottom: 12px;">`
    : `<i class="fas fa-mobile-alt" style="font-size: 48px; color: var(--accent); opacity: 0.7; margin-bottom: 12px;"></i>`;

  displayContainer.style.borderColor = 'rgba(16, 185, 129, 0.3)'; // Green border for success
  displayContainer.innerHTML = `
    <div style="width: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; animation: fadeIn 0.3s ease;">
      <div style="position: absolute; top: 12px; left: 12px;">
        <span style="font-size: 10px; background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 4px 8px; border-radius: 6px; font-weight: 600;">Skanerlandi</span>
      </div>
      
      ${imgHtml}
      
      <div style="font-size: 18px; font-weight: 700; margin-bottom: 4px;">${product.model_name}</div>
      <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 12px;">
        RAM: ${product.specifications.ram || 'N/A'} | ROM: ${product.specifications.storage || 'N/A'} | Rang: ${product.specifications.color || 'N/A'}
      </div>
      
      <div style="display: flex; gap: 24px; align-items: center; margin-bottom: 16px;">
        <div>
          <div style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Sotish narxi</div>
          <div style="font-size: 20px; font-weight: 800; color: var(--accent); margin-top: 2px;">$${parseFloat(product.retail_price).toFixed(2)}</div>
        </div>
        <div style="width: 1px; height: 30px; background: rgba(255,255,255,0.1);"></div>
        <div>
          <div style="font-size: 10px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Ombor qoldig'i</div>
          <div style="font-size: 16px; font-weight: 600; color: #ffffff; margin-top: 2px;">${product.quantity} ta</div>
        </div>
      </div>
      
      <div style="font-size: 12px; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.08); padding: 6px 16px; border-radius: 20px;">
        <i class="fas fa-check-circle"></i> Ushbu mahsulot savatchaga qo'shildi va sotishga tayyor!
      </div>
    </div>
  `;
}

function displayScannedProductError(code, message) {
  const displayContainer = document.getElementById('pos-scanner-product-display');
  if (!displayContainer) return;
  displayContainer.style.display = 'block';

  displayContainer.style.borderColor = 'rgba(239, 68, 68, 0.3)'; // Red border for error
  displayContainer.innerHTML = `
    <div style="width: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; animation: fadeIn 0.3s ease; padding: 12px;">
      <i class="fas fa-exclamation-triangle" style="font-size: 36px; color: var(--color-danger); margin-bottom: 12px;"></i>
      <div style="font-size: 15px; font-weight: 700; color: var(--color-danger); margin-bottom: 4px;">Skanerlash muvaffaqiyatsiz</div>
      <div style="font-size: 12px; color: var(--color-text-secondary); margin-bottom: 8px;">Kiritilgan kod: <strong>${code}</strong></div>
      <div style="font-size: 13px; color: #ffffff; background: rgba(239, 68, 68, 0.08); padding: 6px 16px; border-radius: 8px;">
        ${message}
      </div>
    </div>
  `;
}

function openClickPayModal(model, amount, paymentUrl) {
  const modal = document.getElementById('click-payment-modal');
  document.getElementById('click-pay-subtitle').innerText = `${model} - $${parseFloat(amount).toFixed(2)}`;
  
  const clickHolderEl = document.getElementById('click-pay-holder');
  if (clickHolderEl) {
    if (currentSettings && currentSettings.click_config && currentSettings.click_config.card_holder) {
      clickHolderEl.innerText = `Karta egasi: ${currentSettings.click_config.card_holder}`;
      clickHolderEl.style.display = 'block';
    } else {
      clickHolderEl.style.display = 'none';
    }
  }

  const qrImage = document.getElementById('click-pay-qr');
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(paymentUrl)}`;
  
  const payLink = document.getElementById('click-pay-link');
  payLink.href = paymentUrl;
  
  modal.style.display = 'flex';
}

/**
 * simulated scanner lookup
 */
async function simulateScannerLookup() {
  const code = document.getElementById('simulated-qr-input').value;
  if (!code) return;

  try {
    const product = await request(`/products/scan/${code}`, 'GET');
    if (product.quantity > 0) {
      addToCart(product);
      showToast(`Scan muvaffaqiyatli: ${product.model_name}`);
      document.getElementById('simulated-qr-input').value = '';
    } else {
      showToast('Mahsulot zaxirada qolmagan!', 'danger');
    }
  } catch (e) {
    showToast('Shtrixkod topilmadi!', 'danger');
  }
}

async function handleWarehouseScan() {
  const codeInput = document.getElementById('wh-simulated-qr-input');
  const code = codeInput ? codeInput.value.trim() : '';
  if (!code) return;

  const isMetadataQR = code.startsWith('QR::') || code.startsWith('{');

  if (isMetadataQR) {
    try {
      showToast('QR kod tarkibi tahlil qilinmoqda...', 'success');
      const res = await request('/products/parse-qr', 'POST', { qr_code_string: code });
      const parsed = res.product;
      
      showToast(`Tahlil muvaffaqiyatli: ${parsed.model_name}`, 'success');
      openProductModal(null);
      
      document.getElementById('product-qr-code').value = parsed.qr_code;
      document.getElementById('product-model-name').value = parsed.model_name;
      document.getElementById('product-purchase-price').value = parsed.purchase_price;
      document.getElementById('product-retail-price').value = parsed.retail_price;
      document.getElementById('product-quantity').value = 1;
      document.getElementById('product-size').value = parsed.specifications.size || parsed.specifications.SIZE || '';
      document.getElementById('product-ram').value = parsed.specifications.ram || parsed.specifications.RAM || '';
      document.getElementById('product-storage').value = parsed.specifications.storage || parsed.specifications.STORAGE || '';
      document.getElementById('product-color').value = parsed.specifications.color || parsed.specifications.COLOR || '';
      
      if (codeInput) codeInput.value = '';
    } catch (e) {
      showToast(`QR kodni tahlil qilishda xatolik: ${e.message}`, 'danger');
    }
    return;
  }

  try {
    const product = await request(`/products/scan/${code}`, 'GET');
    showToast(`Mahsulot topildi: ${product.model_name}. Tahrirlash rejimi.`, 'success');
    openProductModal(product);
    if (codeInput) codeInput.value = '';
  } catch (e) {
    showToast(`Yangi QR-kod aniqlandi: ${code}. Ro'yxatdan o'tkazish.`, 'success');
    openProductModal(null);
    document.getElementById('product-qr-code').value = code;
    if (codeInput) codeInput.value = '';
    setTimeout(() => {
      document.getElementById('product-model-name').focus();
    }, 150);
  }
}

async function handlePOSCheckout() {
  if (currentCart.length === 0) return;

  let totalAmount = 0;
  currentCart.forEach(item => {
    totalAmount += item.retail_price * item.quantity;
  });

  const selectModal = document.getElementById('payment-selection-modal');
  const amountEl = document.getElementById('pay-select-amount');
  if (amountEl) amountEl.innerText = `$${totalAmount.toFixed(2)}`;

  if (selectModal) selectModal.style.display = 'flex';
}

async function completePOSCheckout() {
  try {
    const res = await request('/sales/checkout', 'POST', { cart: currentCart });
    showToast(res.message);
    currentCart = [];
    renderCart();
    refreshPOSProducts();
    if (currentUser && currentUser.role === 'cashier') {
      initCashierShiftTracking(currentUser);
    }
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

/**
 * 3. Warehouse Module
 */
let activeScanRequestId = null;

async function loadScanRequests() {
  if (!currentUser || currentUser.role !== 'admin') return;

  const card = document.getElementById('warehouse-scan-requests-card');
  const tbody = document.getElementById('scan-requests-tbody');
  if (!card || !tbody) return;

  try {
    const list = await request('/scan-requests', 'GET');
    if (list.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    tbody.innerHTML = list.map(r => `
      <tr>
        <td><code style="color:var(--accent); font-weight:600;">${r.qr_code}</code></td>
        <td><span style="font-weight:600;">${r.branch ? r.branch.name : 'Asosiy / Biriktirilmagan'}</span></td>
        <td>${new Date(r.created_at).toLocaleString()}</td>
        <td>
          <button class="btn-primary approve-scan-btn" data-id="${r.id}" data-qr="${r.qr_code}" data-branch="${r.branch_id || ''}" style="width:auto;padding:6px 12px;font-size:12px;margin-right:8px;">Tovar Sifatida Saqlash</button>
          <button class="btn-secondary reject-scan-btn" data-id="${r.id}" style="width:auto;padding:6px 12px;font-size:12px;color:var(--color-danger);border-color:rgba(239,68,68,0.2);">Rad Etish</button>
        </td>
      </tr>
    `).join('');

    // Attach actions
    tbody.querySelectorAll('.approve-scan-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeScanRequestId = btn.getAttribute('data-id');
        const qr = btn.getAttribute('data-qr');
        const branchId = btn.getAttribute('data-branch');
        openProductModal(null, qr, branchId);
      });
    });

    tbody.querySelectorAll('.reject-scan-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm("Ushbu skanerlash arizasini rad etmoqchimisiz?")) {
          try {
            const id = btn.getAttribute('data-id');
            await request(`/scan-requests/${id}`, 'DELETE');
            showToast("Ariza rad etildi");
            loadWarehouseProducts();
          } catch (e) {
            showToast(e.message, 'danger');
          }
        }
      });
    });
  } catch (e) {
    console.warn("Could not load scan requests:", e.message);
  }
}

async function loadWarehouseProducts() {
  await loadScanRequests();
  try {
    const products = await request('/products', 'GET');
    const tbody = document.getElementById('warehouse-table-body');
    
    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--color-text-secondary);" data-i18n="wh_no_products">Omborxonada mahsulot topilmadi</td></tr>`;
      applyTranslations();
      return;
    }

    tbody.innerHTML = products.map(p => `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:6px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
              ${p.specifications && p.specifications.image 
                ? `<img src="${p.specifications.image}" style="width:100%; height:100%; object-fit:cover;">` 
                : `<i class="fas fa-mobile-alt" style="color:var(--accent); opacity:0.6;"></i>`
              }
            </div>
            <div>
              <div style="font-weight:600;font-size:15px;">${p.model_name}</div>
              <div style="font-size:12px;color:var(--color-text-secondary);">
                RAM: ${p.specifications.ram || 'N/A'} | Storage: ${p.specifications.storage || 'N/A'} | O'lchami: ${p.specifications.size || 'N/A'} | Rangi: ${p.specifications.color || 'N/A'}
              </div>
            </div>
          </div>
        </td>
        <td><code style="color:var(--accent); font-weight:600;">${p.qr_code}</code></td>
        <td>
          ${p.quantity === 0 
            ? `<span style="display:inline-block;font-size:14px;background:rgba(239,68,68,0.15);color:#ff4d4d;padding:6px 14px;border-radius:8px;font-weight:700;letter-spacing:0.5px;">Tugagan (0 ta)</span>`
            : p.quantity < 5 
              ? `<span style="display:inline-block;font-size:14px;background:rgba(245,158,11,0.15);color:#fbbf24;padding:6px 14px;border-radius:8px;font-weight:700;letter-spacing:0.5px;">Kam qolgan (${p.quantity} ta)</span>`
              : `<span style="display:inline-block;font-size:14px;background:rgba(16,185,129,0.15);color:#10b981;padding:6px 14px;border-radius:8px;font-weight:700;letter-spacing:0.5px;">Sotuvda (${p.quantity} ta)</span>`
          }
        </td>
        ${currentUser.role === 'admin' ? `<td>$${parseFloat(p.purchase_price).toFixed(2)}</td>` : ''}
        <td style="color:var(--accent);font-weight:600;">$${parseFloat(p.retail_price).toFixed(2)}</td>
        ${currentUser.role === 'admin' ? `
        <td>
          <button class="btn-primary edit-prod-btn" data-id="${p.id}" style="width:auto;padding:6px 12px;font-size:12px;margin-right:8px;">Tahrirlash</button>
          <button class="btn-secondary delete-prod-btn" data-id="${p.id}" style="width:auto;padding:6px 12px;font-size:12px;color:var(--color-danger);border-color:rgba(239,68,68,0.2);">O'chirish</button>
        </td>
        ` : ''}
      </tr>
    `).join('');

    // Attach actions
    if (currentUser.role === 'admin') {
      tbody.querySelectorAll('.edit-prod-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          openProductModal(products.find(p => p.id === id));
        });
      });

      tbody.querySelectorAll('.delete-prod-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (confirm('Rostdan ham ushbu mahsulotni o\'chirmoqchimisiz?')) {
            try {
              const id = btn.getAttribute('data-id');
              const res = await request(`/products/${id}`, 'DELETE');
              showToast(res.message);
              loadWarehouseProducts();
            } catch (e) {
              showToast(e.message, 'danger');
            }
          }
        });
      });
    }

  } catch (e) {
    showToast(e.message, 'danger');
  }
}

async function openProductModal(prod = null, defaultQr = null, defaultBranchId = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');

  modal.style.display = 'flex';
  
  // Populate branches dropdown
  try {
    const branches = await request('/branches', 'GET');
    const select = document.getElementById('product-branch-id');
    if (select) {
      select.innerHTML = `<option value="">Asosiy / Biriktirilmagan</option>` + branches.map(b => `
        <option value="${b.id}">${b.name}</option>
      `).join('');
    }
  } catch (e) {
    console.warn("Could not load branches for product form:", e.message);
  }
  
  if (prod) {
    title.setAttribute('data-i18n', 'modal_edit_title');
    document.getElementById('product-id').value = prod.id;
    document.getElementById('product-model-name').value = prod.model_name;
    document.getElementById('product-qr-code').value = prod.qr_code;
    document.getElementById('product-qr-code').disabled = true; // Key locks
    document.getElementById('product-purchase-price').value = prod.purchase_price;
    document.getElementById('product-retail-price').value = prod.retail_price;
    document.getElementById('product-quantity').value = prod.quantity;
    document.getElementById('product-size').value = prod.specifications.size || '';
    document.getElementById('product-ram').value = prod.specifications.ram || '';
    document.getElementById('product-storage').value = prod.specifications.storage || '';
    document.getElementById('product-color').value = prod.specifications.color || '';
    document.getElementById('product-click-url').value = prod.click_payment_url || '';
    
    const select = document.getElementById('product-branch-id');
    if (select) select.value = prod.branch_id || '';

    // Set product image
    const imgBase64 = document.getElementById('product-image-base64');
    const imgPreview = document.getElementById('product-image-preview');
    const imgPreviewContainer = document.getElementById('product-image-preview-container');
    if (imgBase64 && imgPreview && imgPreviewContainer) {
      if (prod.specifications && prod.specifications.image) {
        imgBase64.value = prod.specifications.image;
        imgPreview.src = prod.specifications.image;
        imgPreviewContainer.style.display = 'flex';
      } else {
        imgBase64.value = '';
        imgPreview.src = '';
        imgPreviewContainer.style.display = 'none';
      }
    }
  } else {
    title.setAttribute('data-i18n', 'modal_add_title');
    form.reset();
    document.getElementById('product-click-url').value = '';
    document.getElementById('product-id').value = '';
    document.getElementById('product-qr-code').disabled = false;

    const imgBase64 = document.getElementById('product-image-base64');
    const imgPreview = document.getElementById('product-image-preview');
    const imgPreviewContainer = document.getElementById('product-image-preview-container');
    if (imgBase64 && imgPreview && imgPreviewContainer) {
      imgBase64.value = '';
      imgPreview.src = '';
      imgPreviewContainer.style.display = 'none';
    }

    if (defaultQr) {
      document.getElementById('product-qr-code').value = defaultQr;
      try {
        const parsed = await request('/products/parse-qr', 'POST', { qr_code: defaultQr });
        if (parsed) {
          document.getElementById('product-model-name').value = parsed.model_name || '';
          document.getElementById('product-purchase-price').value = parsed.purchase_price || '';
          document.getElementById('product-retail-price').value = parsed.retail_price || '';
          if (parsed.specifications) {
            document.getElementById('product-ram').value = parsed.specifications.ram || '';
            document.getElementById('product-storage').value = parsed.specifications.storage || '';
            document.getElementById('product-color').value = parsed.specifications.color || '';
            document.getElementById('product-size').value = parsed.specifications.size || '';
          }
        }
      } catch (err) {
        console.warn("Auto-parse failed for scanned QR:", err.message);
      }
    }
    if (defaultBranchId) {
      const select = document.getElementById('product-branch-id');
      if (select) select.value = defaultBranchId;
    }
  }
  applyTranslations();
}

async function handleSaveProduct() {
  const id = document.getElementById('product-id').value;
  const payload = {
    model_name: document.getElementById('product-model-name').value,
    qr_code: document.getElementById('product-qr-code').value,
    purchase_price: parseFloat(document.getElementById('product-purchase-price').value),
    retail_price: parseFloat(document.getElementById('product-retail-price').value),
    quantity: parseInt(document.getElementById('product-quantity').value),
    branch_id: document.getElementById('product-branch-id').value || null,
    click_payment_url: document.getElementById('product-click-url').value.trim() || null,
    specifications: {
      size: document.getElementById('product-size').value,
      ram: document.getElementById('product-ram').value,
      storage: document.getElementById('product-storage').value,
      color: document.getElementById('product-color').value,
      image: document.getElementById('product-image-base64').value || ''
    }
  };

  try {
    let res;
    if (id) {
      res = await request(`/products/${id}`, 'PUT', payload);
    } else {
      res = await request('/products', 'POST', payload);
    }
    
    if (activeScanRequestId) {
      try {
        await request(`/scan-requests/${activeScanRequestId}`, 'DELETE');
        activeScanRequestId = null;
      } catch (err) {
        console.warn("Could not delete scan request:", err.message);
      }
    }

    showToast(res.message);
    document.getElementById('product-modal').style.display = 'none';
    loadWarehouseProducts();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

/**
 * 4. Staff Management Module
 */
let selectedStaffBranch = 'Barchasi';

async function loadStaffList() {
  if (currentUser.role !== 'admin') return;

  try {
    const staff = await request('/auth/staff', 'GET');
    const tbody = document.getElementById('staff-table-body');
    
    if (staff.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-secondary);" data-i18n="staff_no_users">Xodimlar topilmadi</td></tr>`;
      applyTranslations();
      return;
    }

    // Group staff by branch name
    const groups = {};
    staff.forEach(s => {
      const branchName = s.branch ? s.branch.name : "Asosiy Ofis / Biriktirilmagan";
      if (!groups[branchName]) groups[branchName] = [];
      groups[branchName].push(s);
    });

    const branchNames = Object.keys(groups);

    // Build branch filters
    const filterContainer = document.getElementById('staff-branch-filters');
    if (filterContainer) {
      filterContainer.innerHTML = ['Barchasi', ...branchNames].map(name => {
        const count = name === 'Barchasi' ? staff.length : groups[name].length;
        const isActive = selectedStaffBranch === name;
        return `
          <div class="branch-filter-card ${isActive ? 'active' : ''}" data-branch="${name}" style="flex: 1; min-width: 160px; max-width: 220px; padding: 12px 16px; background: ${isActive ? 'rgba(0, 242, 254, 0.1)' : 'var(--glass-bg)'}; border: 1px solid ${isActive ? 'var(--accent)' : 'var(--glass-border)'}; border-radius: 12px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 12px; box-shadow: var(--neo-flat);">
            <div style="background: ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.05)'}; color: ${isActive ? 'var(--bg-primary)' : 'var(--color-text-secondary)'}; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px;">
              <i class="${name === 'Barchasi' ? 'fas fa-users' : 'fas fa-store'}"></i>
            </div>
            <div>
              <div style="font-weight: 600; font-size: 12px; color: ${isActive ? 'var(--accent)' : '#ffffff'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;" title="${name}">${name}</div>
              <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">${count} ta xodim</div>
            </div>
          </div>
        `;
      }).join('');

      // Add event listeners for branch filter cards
      filterContainer.querySelectorAll('.branch-filter-card').forEach(card => {
        card.addEventListener('click', () => {
          selectedStaffBranch = card.getAttribute('data-branch');
          loadStaffList(); // Reload to render selected branch
        });
      });
    }

    let html = '';
    const branchesToRender = selectedStaffBranch === 'Barchasi' ? branchNames : [selectedStaffBranch];

    branchesToRender.forEach(branchName => {
      if (!groups[branchName]) return;

      // Branch header row
      html += `
        <tr style="background: rgba(255,255,255,0.03); font-weight: 700; color: var(--accent);">
          <td colspan="5" style="padding: 12px 20px; font-size: 14px; letter-spacing: 0.5px;">
            <i class="fas fa-store" style="margin-right: 8px;"></i>${branchName}
          </td>
        </tr>
      `;

      groups[branchName].forEach(u => {
        const latestShift = u.shifts && u.shifts.length > 0 ? u.shifts[0] : null;
        let shiftHtml = `<span style="color: var(--color-text-secondary); font-size: 12px;">Smenada emas</span>`;
        
        if (latestShift) {
          if (latestShift.status === 'active' || latestShift.status === 1) {
            const startTime = new Date(latestShift.start_time);
            const elapsedMs = new Date() - startTime;
            const elapsedHrs = Math.max(elapsedMs / (1000 * 60 * 60), 0);
            
            const baseRate = parseFloat(u.wage_structure || 15);
            const currentHour = new Date().getHours();
            const isNight = currentHour >= 20 || currentHour < 8;
            const multiplier = isNight ? 1.5 : 1.0;
            const wageAccumulated = (elapsedHrs * baseRate * multiplier).toFixed(2);
            
            shiftHtml = `
              <div style="display: inline-flex; align-items: center; gap: 6px; color: var(--color-success); font-weight: 600; font-size: 13px;">
                <span class="pulse-indicator" style="background: var(--color-success); width: 8px; height: 8px; border-radius: 50%;"></span>
                Faol Smenada
              </div>
              <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
                Vaqt: <strong>${elapsedHrs.toFixed(2)} soat</strong> | Daromad: <strong style="color: var(--accent);">$${wageAccumulated}</strong>
              </div>
            `;
          } else {
            const endTime = latestShift.end_time ? new Date(latestShift.end_time) : new Date();
            const startTime = new Date(latestShift.start_time);
            const elapsedHrs = Math.max((endTime - startTime) / (1000 * 60 * 60), 0);
            const earned = parseFloat(latestShift.calculated_wage || 0).toFixed(2);
            
            shiftHtml = `
              <div style="color: var(--color-text-secondary); font-size: 12px; font-weight: 500;">
                Smena Yakunlangan
              </div>
              <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
                Davomiyligi: <strong>${elapsedHrs.toFixed(2)} soat</strong> | Ish haqi: <strong style="color: var(--accent);">$${earned}</strong>
              </div>
            `;
          }
        }

        html += `
          <tr>
            <td style="padding-left: 32px;">
              <div style="font-weight: 600; font-size: 15px;">${u.name}</div>
              <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">PIN: <code>${u.pin_code || '1234'}</code></div>
            </td>
            <td><code>${u.email}</code></td>
            <td style="font-weight: 500;">$${parseFloat(u.wage_structure).toFixed(2)}/soat</td>
            <td>${shiftHtml}</td>
            <td>
              <button class="btn-primary edit-staff-btn" data-id="${u.id}" style="width:auto;padding:6px 12px;font-size:12px;margin-right:8px;">Tahrirlash</button>
              <button class="btn-secondary delete-staff-btn" data-id="${u.id}" style="width:auto;padding:6px 12px;font-size:12px;color:var(--color-danger);border-color:rgba(239,68,68,0.2);">O'chirish</button>
            </td>
          </tr>
        `;
      });
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('.edit-staff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openStaffModal(staff.find(s => s.id === id));
      });
    });

    tbody.querySelectorAll('.delete-staff-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Kassirni tizimdan o\'chirish shiftlarni yakunlaydi. Ishonchingiz komilmi?')) {
          try {
            const id = btn.getAttribute('data-id');
            const res = await request(`/auth/staff/${id}`, 'DELETE');
            showToast(res.message);
            loadStaffList();
          } catch (e) {
            showToast(e.message, 'danger');
          }
        }
      });
    });

  } catch (e) {
    showToast(e.message, 'danger');
  }
}

/**
 * Staff Work Hours & Live Shift Tracker Module
 */
let currentCashierShift = {
  id: null,
  startTime: null,
  timerInterval: null,
  revenue: 0,
  salesCount: 0
};
let adminLiveStaffInterval = null;

async function initCashierShiftTracking(user) {
  const shiftWidget = document.getElementById('cashier-shift-widget');
  const chevron = document.getElementById('user-badge-chevron');
  const userBtn = document.getElementById('btn-toggle-user-profile');

  if (shiftWidget) shiftWidget.style.display = 'none';
  if (chevron) chevron.style.transform = 'rotate(0deg)';
  if (userBtn) userBtn.classList.remove('active-open');

  if (!user || user.role !== 'cashier') {
    if (currentCashierShift.timerInterval) {
      clearInterval(currentCashierShift.timerInterval);
      currentCashierShift.timerInterval = null;
    }
    return;
  }

  try {
    const res = await request('/shifts/current', 'GET');
    if (res && res.shift) {
      currentCashierShift.id = res.shift.id;
      currentCashierShift.startTime = new Date(res.shift.start_time).getTime();
      currentCashierShift.revenue = parseFloat(res.shift.generated_revenue) || 0;
      currentCashierShift.salesCount = parseInt(res.shift.sales_count) || 0;

      const badge = document.getElementById('shift-type-badge');
      if (badge) badge.textContent = res.shift.shift_type === 'day' ? 'Kunduzgi' : 'Tungi';

      const revEl = document.getElementById('live-shift-revenue');
      if (revEl) revEl.textContent = '$' + currentCashierShift.revenue.toFixed(2);

      if (currentCashierShift.timerInterval) clearInterval(currentCashierShift.timerInterval);
      
      const updateTimer = () => {
        if (!currentCashierShift.startTime) return;
        const elapsedSec = Math.max(0, Math.floor((Date.now() - currentCashierShift.startTime) / 1000));
        const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
        const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        const timerEl = document.getElementById('live-shift-timer');
        if (timerEl) timerEl.textContent = `${hrs}:${mins}:${secs}`;
      };

      updateTimer();
      currentCashierShift.timerInterval = setInterval(updateTimer, 1000);
    }
  } catch (e) {
    console.warn("Could not fetch active cashier shift:", e.message);
  }
}

function updateCashierShiftRevenue(additionalAmount) {
  if (currentUser && currentUser.role === 'cashier') {
    currentCashierShift.revenue += Number(additionalAmount) || 0;
    currentCashierShift.salesCount += 1;
    const revEl = document.getElementById('live-shift-revenue');
    if (revEl) revEl.textContent = '$' + currentCashierShift.revenue.toFixed(2);
  }
}

function openShiftSummaryModal() {
  const modal = document.getElementById('shift-summary-modal');
  if (!modal) return;
  
  const cashierEl = document.getElementById('modal-shift-cashier');
  const durEl = document.getElementById('modal-shift-duration');
  const salesEl = document.getElementById('modal-shift-sales');
  const timerEl = document.getElementById('live-shift-timer');

  if (cashierEl) cashierEl.textContent = currentUser ? currentUser.name : 'Kassir';
  if (durEl) durEl.textContent = timerEl ? timerEl.textContent : '00:00:00';
  if (salesEl) salesEl.textContent = `$${currentCashierShift.revenue.toFixed(2)} (${currentCashierShift.salesCount} ta savdo)`;

  modal.style.display = 'flex';
}

async function handleConfirmEndShift() {
  try {
    const res = await request('/shifts/end', 'POST');
    showToast(res.message || "Navbatchilik muvaffaqiyatli yakunlandi! Xayrli kun!", 'success');
    
    const modal = document.getElementById('shift-summary-modal');
    if (modal) modal.style.display = 'none';

    if (currentCashierShift.timerInterval) {
      clearInterval(currentCashierShift.timerInterval);
      currentCashierShift.timerInterval = null;
    }

    // Full logout
    stopHtml5Scanner();
    setToken(null);
    currentUser = null;
    currentCart = [];
    showAuthScreen();
  } catch (e) {
    showToast(e.message || "Smenani yakunlashda xatolik yuz berdi", 'danger');
  }
}

async function loadStaffWorkHoursData() {
  if (!currentUser || currentUser.role !== 'admin') return;

  try {
    const res = await request('/shifts/staff-work-hours', 'GET');
    
    // Summary Cards
    const countEl = document.getElementById('stat-live-cashiers-count');
    const revEl = document.getElementById('stat-live-shifts-revenue');
    const hoursEl = document.getElementById('stat-live-shifts-hours');

    if (countEl) countEl.textContent = res.today_summary ? res.today_summary.active_cashiers : 0;
    if (revEl) revEl.textContent = '$' + (res.today_summary ? Number(res.today_summary.total_revenue_today).toFixed(2) : '0.00');
    
    let totalMins = 0;
    if (res.all_staff) {
      totalMins = res.all_staff.reduce((acc, s) => acc + (s.today_hours || 0), 0);
    }
    if (hoursEl) hoursEl.textContent = `${totalMins.toFixed(1)} soat`;

    // Active Sessions Tbody
    const activeTbody = document.getElementById('live-active-shifts-tbody');
    if (activeTbody) {
      if (!res.active_sessions || res.active_sessions.length === 0) {
        activeTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--color-text-secondary); padding:20px;"><i class="fas fa-moon" style="margin-right: 6px;"></i>Hozirda barcha kassirlar oflayn (faol navbatchilik yo'q)</td></tr>`;
      } else {
        activeTbody.innerHTML = res.active_sessions.map(s => {
          const startTime = new Date(s.start_time);
          const startTimeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const startMs = startTime.getTime();
          const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
          const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
          const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
          const secs = String(elapsedSec % 60).padStart(2, '0');

          return `
            <tr data-shift-start-ms="${startMs}">
              <td style="font-weight: 600; color: #fff;"><i class="fas fa-user-circle" style="margin-right: 6px; color: var(--accent);"></i>${s.user_name}</td>
              <td style="color: var(--color-text-secondary);">${s.branch_name}</td>
              <td>
                <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 11px; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 5px;">
                  <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981; display: inline-block;"></span>
                  Online (${s.shift_type === 'day' ? 'Kunduzgi' : 'Tungi'})
                </span>
              </td>
              <td style="color: var(--color-text-secondary); font-family: monospace;">${startTimeStr}</td>
              <td>
                <span class="live-staff-timer-display" style="font-family: monospace; font-weight: 700; color: #10b981; font-size: 13px;">${hrs}:${mins}:${secs}</span>
              </td>
              <td style="font-weight: 700; color: var(--accent);">$${Number(s.revenue).toFixed(2)}</td>
              <td style="font-weight: 600; color: #fff;">${s.sales_count} ta</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Shift History Tbody
    const histTbody = document.getElementById('shift-history-tbody');
    if (histTbody) {
      if (!res.history || res.history.length === 0) {
        histTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--color-text-secondary); padding:20px;">Smenalar tarixi mavjud emas</td></tr>`;
      } else {
        histTbody.innerHTML = res.history.map(h => {
          const startDate = new Date(h.start_time);
          const dateStr = startDate.toLocaleDateString();
          const startStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const endStr = h.end_time ? new Date(h.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Davom etmoqda';
          const isCompleted = h.status === 'completed';

          return `
            <tr>
              <td style="color: var(--color-text-secondary);">${dateStr}</td>
              <td style="font-weight: 600; color: #fff;">${h.user_name}</td>
              <td style="color: var(--color-text-secondary);">${h.branch_name}</td>
              <td style="color: var(--color-text-secondary); font-family: monospace;">${startStr}</td>
              <td style="color: var(--color-text-secondary); font-family: monospace;">${endStr}</td>
              <td style="font-family: monospace; font-weight: 600; color: var(--accent);">${h.duration}</td>
              <td style="font-weight: 700; color: #10b981;">$${Number(h.revenue).toFixed(2)}</td>
              <td style="font-weight: 600; color: #f59e0b;">$${Number(h.calculated_wage).toFixed(2)}</td>
              <td>
                <span class="badge" style="background: ${isCompleted ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${isCompleted ? '#3b82f6' : '#10b981'}; border: 1px solid ${isCompleted ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'}; font-size: 11px; padding: 2px 8px; border-radius: 6px;">
                  ${isCompleted ? 'Yakunlangan' : 'Faol'}
                </span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Start live timer interval for active shifts in Admin view
    if (adminLiveStaffInterval) clearInterval(adminLiveStaffInterval);
    adminLiveStaffInterval = setInterval(() => {
      document.querySelectorAll('#live-active-shifts-tbody tr[data-shift-start-ms]').forEach(row => {
        const startMs = parseInt(row.getAttribute('data-shift-start-ms'));
        if (startMs) {
          const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
          const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
          const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
          const secs = String(elapsedSec % 60).padStart(2, '0');
          const timerEl = row.querySelector('.live-staff-timer-display');
          if (timerEl) timerEl.textContent = `${hrs}:${mins}:${secs}`;
        }
      });
    }, 1000);

  } catch (e) {
    console.warn("Could not load staff work hours:", e.message);
  }
}

async function openStaffModal(staff = null) {
  const modal = document.getElementById('staff-modal');
  const title = document.getElementById('staff-modal-title');
  const form = document.getElementById('staff-form');

  modal.style.display = 'flex';

  // Populate branches dropdown
  try {
    const branches = await request('/branches', 'GET');
    const select = document.getElementById('staff-branch-id');
    if (select) {
      select.innerHTML = `<option value="">Biriktirilmagan</option>` + branches.map(b => `
        <option value="${b.id}">${b.name}</option>
      `).join('');
    }
  } catch (e) {
    console.warn("Could not load branches for staff form:", e.message);
  }
  
  if (staff) {
    title.setAttribute('data-i18n', 'modal_edit_staff');
    title.innerText = "Xodim Ma'lumotlarini Tahrirlash";
    document.getElementById('staff-id').value = staff.id;
    document.getElementById('staff-name').value = staff.name || '';
    document.getElementById('staff-email').value = staff.email || '';
    document.getElementById('staff-email').disabled = false;
    document.getElementById('staff-password').value = '';
    document.getElementById('staff-password').placeholder = 'Yangi parol (o\'zgartirmaslik uchun bo\'sh qoldiring)';
    document.getElementById('staff-pin').value = '';
    document.getElementById('staff-pin').placeholder = 'Yangi PIN (6 xonali, masalan: 123456)';
    document.getElementById('staff-wage').value = staff.wage_structure || 15;

    const select = document.getElementById('staff-branch-id');
    if (select) select.value = staff.branch_id || '';
  } else {
    title.setAttribute('data-i18n', 'modal_add_staff');
    title.innerText = "Yangi Kassir / Xodim Qo'shish";
    form.reset();
    document.getElementById('staff-id').value = '';
    document.getElementById('staff-email').disabled = false;
    document.getElementById('staff-password').value = '';
    document.getElementById('staff-password').placeholder = 'Tizim paroli (kamida 4 ta belgi)';
    document.getElementById('staff-pin').value = '';
    document.getElementById('staff-pin').placeholder = '6 xonali PIN kod (masalan: 123456)';
    document.getElementById('staff-wage').value = 15;
  }
  applyTranslations();
}

async function handleSaveStaff() {
  const id = document.getElementById('staff-id').value;
  const name = document.getElementById('staff-name').value.trim();
  const email = document.getElementById('staff-email').value.trim();
  
  if (!name) {
    showToast("Xodim ismini kiriting!", "warning");
    return;
  }

  if (!email.toLowerCase().endsWith('@gmail.com')) {
    showToast("E-pochta manzili faqat @gmail.com bo'lishi shart!", "danger");
    return;
  }

  const payload = {
    name: name,
    email: email,
    wage_structure: parseFloat(document.getElementById('staff-wage').value) || 0,
    branch_id: document.getElementById('staff-branch-id').value || null
  };

  const pass = document.getElementById('staff-password').value.trim();
  const pin = document.getElementById('staff-pin').value.trim();

  if (pass) payload.password = pass;
  if (pin) payload.pin_code = pin;

  if (!id) {
    if (!pass || pass.length < 4) {
      showToast("Iltimos, yangi xodim uchun parolni kiriting (kamida 4 ta belgi)!", "warning");
      return;
    }
    if (!pin || pin.length !== 6 || !/^[0-9]{6}$/.test(pin)) {
      showToast("Iltimos, xodim uchun 6 xonali raqamli PIN kodni kiriting (masalan: 123456)!", "warning");
      return;
    }
    payload.password = pass;
    payload.pin_code = pin;
  } else {
    if (pin && (pin.length !== 6 || !/^[0-9]{6}$/.test(pin))) {
      showToast("PIN kod 6 xonali raqam bo'lishi shart (masalan: 123456)!", "warning");
      return;
    }
  }

  try {
    let res;
    if (id) {
      res = await request(`/auth/staff/${id}`, 'PUT', payload);
    } else {
      res = await request('/auth/staff', 'POST', payload);
    }
    showToast(res.message || "Xodim ma'lumotlari muvaffaqiyatli saqlandi!", 'success');
    document.getElementById('staff-modal').style.display = 'none';
    loadStaffList();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

/**
 * 5. Settings Hub
 */
async function loadSystemSettings() {
  try {
    const settings = await request('/settings', 'GET');
    applySystemSettings(settings);
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

function applySystemSettings(settings) {
  if (settings.branding) {
    document.getElementById('settings-brand-name').value = settings.branding.brand_name || 'telebar';
    document.getElementById('settings-logo-url').value = settings.branding.logo_url || '';
    applyBrandingStyles(settings.branding);
  }
  if (settings.theme) {
    document.getElementById('settings-accent-color').value = settings.theme.accent_color || '#00f2fe';
    document.getElementById('settings-ui-preset').value = settings.theme.preset || 'glassmorphism';
    document.getElementById('settings-theme-mood').value = settings.theme.mood || 'deep_space';
    document.getElementById('settings-theme-pattern').value = settings.theme.pattern || 'none';
    
    const bgVal = settings.theme.bg_image || '';
    document.getElementById('settings-theme-bg-image').value = bgVal;
    
    const previewContainer = document.getElementById('settings-theme-bg-preview-container');
    const previewImg = document.getElementById('settings-theme-bg-preview');
    if (bgVal) {
      if (previewImg) previewImg.src = bgVal;
      if (previewContainer) previewContainer.style.display = 'flex';
    } else {
      if (previewContainer) previewContainer.style.display = 'none';
    }
    
    document.getElementById('settings-theme-mode').value = settings.theme.mode || 'dark';
    applyThemeStyles(settings.theme);
    localStorage.setItem('local_theme_settings', JSON.stringify(settings.theme));
  }
  if (settings.salary_rules) {
    document.getElementById('settings-hourly-rate').value = settings.salary_rules.hourly_rate || 15000;
    document.getElementById('settings-night-multiplier').value = settings.salary_rules.night_shift_multiplier || 1.5;
  }
  if (settings.shift_timings) {
    document.getElementById('settings-day-start').value = settings.shift_timings.day_start || 8;
    document.getElementById('settings-day-end').value = settings.shift_timings.day_end || 20;
  }
  if (settings.click_config) {
    const config = settings.click_config;
    const activeEl = document.getElementById('settings-click-active');
    if (activeEl) activeEl.checked = !!config.active;
    
    const holderEl = document.getElementById('settings-click-card-holder');
    if (holderEl) holderEl.value = config.card_holder || '';
    
    const numEl = document.getElementById('settings-click-card-number');
    if (numEl) numEl.value = config.card_number || '';
    
    const expEl = document.getElementById('settings-click-card-expiry');
    if (expEl) expEl.value = config.card_expiry || '';
    
    const merEl = document.getElementById('settings-click-merchant-id');
    if (merEl) merEl.value = config.merchant_id || '';
    
    const serEl = document.getElementById('settings-click-service-id');
    if (serEl) serEl.value = config.service_id || '';
  }
}

function applyThemeStyles(theme) {
  const root = document.documentElement;

  if (theme.accent_color) {
    root.style.setProperty('--accent', theme.accent_color);
    
    // Calculate RGB equivalents dynamically for glows
    const hex = theme.accent_color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--accent-glow', `0 0 15px rgba(${r}, ${g}, ${b}, 0.5)`);
    root.style.setProperty('--accent-gradient', `linear-gradient(90deg, ${theme.accent_color} 0%, rgba(${r}, ${g}, ${b}, 0.6) 100%)`);
  }

  // Handle Theme Mode (Dark vs Light) and Ambient Moods
  const mode = theme.mode || 'dark';
  const mood = theme.mood || 'deep_space';

  if (mode === 'light') {
    root.classList.add('light-mode');
    root.style.setProperty('--bg-primary', '#f8fafc');
    root.style.setProperty('--bg-secondary', '#ffffff');
    root.style.setProperty('--color-text', '#0f172a');
    root.style.setProperty('--color-text-secondary', '#64748b');
  } else {
    root.classList.remove('light-mode');
    root.style.setProperty('--color-text', '#ffffff');
    root.style.setProperty('--color-text-secondary', 'rgba(255, 255, 255, 0.6)');
    
    if (mood === 'emerald_forest') {
      root.style.setProperty('--bg-primary', '#022c22');
      root.style.setProperty('--bg-secondary', '#064e3b');
    } else if (mood === 'sunset_glow') {
      root.style.setProperty('--bg-primary', '#18000a');
      root.style.setProperty('--bg-secondary', '#2d0016');
    } else if (mood === 'midnight_indigo') {
      root.style.setProperty('--bg-primary', '#090514');
      root.style.setProperty('--bg-secondary', '#170b2e');
    } else { // deep_space
      root.style.setProperty('--bg-primary', '#030712');
      root.style.setProperty('--bg-secondary', '#0b1329');
    }
  }

  // Handle Preset updates
  const preset = theme.preset || 'glassmorphism';
  document.body.classList.remove('preset-glassmorphism', 'preset-neomorphism', 'preset-cyberpunk', 'preset-minimalist');
  document.body.classList.add(`preset-${preset}`);
  
  if (preset === 'neomorphism') {
    root.style.setProperty('--glass-bg', mode === 'light' ? '#f1f5f9' : 'rgba(15, 23, 42, 0.95)');
    root.style.setProperty('--glass-border', 'transparent');
    root.style.setProperty('--glass-blur', 'blur(0px)');
    root.style.setProperty('--card-shadow', 'none');
    root.style.setProperty('--neo-flat', mode === 'light' ? '8px 8px 16px #cbd5e1, -8px -8px 16px #ffffff' : '8px 8px 16px rgba(0,0,0,0.6), -8px -8px 16px rgba(255,255,255,0.03)');
  } else if (preset === 'cyberpunk') {
    root.style.setProperty('--glass-bg', '#020205');
    root.style.setProperty('--glass-border', '2px solid var(--accent)');
    root.style.setProperty('--glass-blur', 'blur(0px)');
    root.style.setProperty('--card-shadow', '0 0 15px rgba(var(--accent-rgb), 0.4)');
    root.style.setProperty('--neo-flat', 'none');
  } else if (preset === 'minimalist') {
    root.style.setProperty('--glass-bg', 'var(--bg-secondary)');
    root.style.setProperty('--glass-border', mode === 'light' ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.08)');
    root.style.setProperty('--glass-blur', 'blur(0px)');
    root.style.setProperty('--card-shadow', 'none');
    root.style.setProperty('--neo-flat', 'none');
  } else { // glassmorphism
    root.style.setProperty('--glass-bg', mode === 'light' ? 'rgba(255, 255, 255, 0.65)' : 'rgba(13, 25, 47, 0.45)');
    root.style.setProperty('--glass-border', mode === 'light' ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.08)');
    root.style.setProperty('--glass-blur', 'blur(14px)');
    root.style.setProperty('--card-shadow', mode === 'light' ? '0 8px 32px 0 rgba(0,0,0,0.08)' : '0 8px 32px 0 rgba(0, 0, 0, 0.37)');
    root.style.setProperty('--neo-flat', 'none');
  }

  // Handle Background Pattern and Custom Background Image updates
  const pattern = theme.pattern || 'none';
  const bgImage = theme.bg_image || '';

  // Always apply baseline background color
  document.body.style.backgroundColor = 'var(--bg-primary)';

  if (bgImage) {
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    
    if (mode === 'light') {
      document.body.style.backgroundImage = `linear-gradient(rgba(248, 250, 252, 0.85), rgba(248, 250, 252, 0.85)), url('${bgImage}')`;
    } else {
      let maskColor = 'rgba(3, 7, 18, 0.7)';
      if (mood === 'emerald_forest') maskColor = 'rgba(2, 44, 34, 0.75)';
      else if (mood === 'sunset_glow') maskColor = 'rgba(24, 0, 10, 0.75)';
      else if (mood === 'midnight_indigo') maskColor = 'rgba(9, 5, 20, 0.75)';
      
      document.body.style.backgroundImage = `linear-gradient(${maskColor}, ${maskColor}), url('${bgImage}')`;
    }
  } else {
    // Fall back to patterns or solid colors
    document.body.style.backgroundAttachment = 'scroll';
    document.body.style.backgroundRepeat = 'repeat';
    
    if (pattern === 'geometric_grid') {
      document.body.style.backgroundImage = mode === 'light' 
        ? 'linear-gradient(rgba(0,0,0,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.015) 1px, transparent 1px)'
        : 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)';
      document.body.style.backgroundSize = '30px 30px';
      document.body.style.backgroundPosition = 'center';
    } else if (pattern === 'stars_space') {
      document.body.style.backgroundImage = 'radial-gradient(white, rgba(255,255,255,.2) 1.5px, transparent 30px), radial-gradient(white, rgba(255,255,255,.15) 1px, transparent 20px)';
      document.body.style.backgroundSize = '400px 400px, 250px 250px';
      document.body.style.backgroundPosition = '0 0, 40px 60px';
    } else if (pattern === 'diagonal_cyber') {
      document.body.style.backgroundImage = mode === 'light'
        ? 'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.007) 0px, rgba(0, 0, 0, 0.007) 2px, transparent 2px, transparent 8px)'
        : 'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.007) 0px, rgba(255, 255, 255, 0.007) 2px, transparent 2px, transparent 8px)';
      document.body.style.backgroundSize = 'auto';
      document.body.style.backgroundPosition = 'auto';
    } else {
      document.body.style.backgroundImage = 'var(--bg-gradient)';
    }
  }
}

function applyBrandingStyles(branding) {
  if (branding.brand_name) {
    document.getElementById('logo-branding-text').innerText = branding.brand_name;
    const logos = document.querySelectorAll('.auth-logo');
    logos.forEach(logo => logo.innerText = branding.brand_name);
  }
}

async function handleSaveSettings() {
  const branding = {
    brand_name: document.getElementById('settings-brand-name').value,
    logo_url: document.getElementById('settings-logo-url').value
  };

  const theme = {
    accent_color: document.getElementById('settings-accent-color').value,
    preset: document.getElementById('settings-ui-preset').value,
    mood: document.getElementById('settings-theme-mood').value,
    pattern: document.getElementById('settings-theme-pattern').value,
    bg_image: document.getElementById('settings-theme-bg-image').value.trim(),
    mode: document.getElementById('settings-theme-mode').value
  };

  const salary_rules = {
    hourly_rate: parseFloat(document.getElementById('settings-hourly-rate').value),
    night_shift_multiplier: parseFloat(document.getElementById('settings-night-multiplier').value)
  };

  const shift_timings = {
    day_start: parseInt(document.getElementById('settings-day-start').value) || 8,
    day_end: parseInt(document.getElementById('settings-day-end').value) || 20,
    night_start: parseInt(document.getElementById('settings-day-end').value) || 20,
    night_end: parseInt(document.getElementById('settings-day-start').value) || 8
  };

  try {
    await request('/settings', 'POST', { key: 'branding', value: branding });
    await request('/settings', 'POST', { key: 'theme', value: theme });
    await request('/settings', 'POST', { key: 'salary_rules', value: salary_rules });
    await request('/settings', 'POST', { key: 'shift_timings', value: shift_timings });
    
    showToast(dictionaries[getLanguage()].settings_saved);
    applySystemSettings({ branding, theme, salary_rules, shift_timings });
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

/**
 * Events Setup helper
 */
function setupEventListeners() {
  // Mobile POS Catalog/Cart Switcher
  const posTabCatalog = document.getElementById('pos-tab-catalog');
  const posTabCart = document.getElementById('pos-tab-cart');
  const posGrid = document.querySelector('.pos-grid');
  
  if (posTabCatalog && posTabCart && posGrid) {
    posTabCatalog.addEventListener('click', () => {
      posGrid.classList.add('show-catalog');
      posGrid.classList.remove('show-cart');
      posTabCatalog.className = 'btn-primary';
      posTabCart.className = 'btn-secondary';
    });
    
    posTabCart.addEventListener('click', () => {
      posGrid.classList.add('show-cart');
      posGrid.classList.remove('show-catalog');
      posTabCart.className = 'btn-primary';
      posTabCatalog.className = 'btn-secondary';
    });
  }

  // Login Form (Email & Password)
  const loginFormEl = document.getElementById('login-form');
  if (loginFormEl) {
    loginFormEl.addEventListener('submit', handleLoginFormSubmit);
  }

  // Quick PIN/Password Login Form
  const quickLoginFormEl = document.getElementById('quick-login-form');
  if (quickLoginFormEl) {
    quickLoginFormEl.addEventListener('submit', handleQuickLoginFormSubmit);
  }

  // Login Mode Switcher Tabs
  const tabEmail = document.getElementById('tab-login-email');
  const tabPin = document.getElementById('tab-login-pin');
  const pinPadContainer = document.getElementById('pin-pad-container');
  const pinBoxes = document.querySelectorAll('.pin-box');

  if (tabEmail && tabPin) {
    tabEmail.addEventListener('click', () => {
      tabEmail.style.background = 'var(--accent-gradient)';
      tabEmail.style.color = '#030712';
      tabPin.style.background = 'transparent';
      tabPin.style.color = 'var(--color-text-secondary)';

      if (loginFormEl) loginFormEl.style.display = 'block';
      if (quickLoginFormEl) quickLoginFormEl.style.display = 'none';
      if (pinPadContainer) pinPadContainer.style.display = 'none';
    });

    tabPin.addEventListener('click', () => {
      tabPin.style.background = 'var(--accent-gradient)';
      tabPin.style.color = '#030712';
      tabEmail.style.background = 'transparent';
      tabEmail.style.color = 'var(--color-text-secondary)';

      if (loginFormEl) loginFormEl.style.display = 'none';
      if (quickLoginFormEl) quickLoginFormEl.style.display = 'block';
      if (pinPadContainer) pinPadContainer.style.display = 'none';
      clear6DigitPin();
      if (pinBoxes[0]) {
        setTimeout(() => pinBoxes[0].focus(), 100);
      }
    });
  }

  // 6 PIN Digit Input Boxes Event Listeners
  pinBoxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      box.value = val ? val.slice(-1) : '';
      if (box.value && idx < pinBoxes.length - 1) {
        pinBoxes[idx + 1].focus();
      }
      // Check if all 6 filled, trigger auto-login
      const fullPin = get6DigitPin();
      if (fullPin.length === 6) {
        handleQuickLoginFormSubmit();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (!box.value && idx > 0) {
          pinBoxes[idx - 1].focus();
          pinBoxes[idx - 1].value = '';
        }
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        pinBoxes[idx - 1].focus();
      } else if (e.key === 'ArrowRight' && idx < pinBoxes.length - 1) {
        pinBoxes[idx + 1].focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleQuickLoginFormSubmit();
      }
    });

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
      if (pasteData) {
        pasteData.split('').slice(0, 6).forEach((char, i) => {
          if (pinBoxes[i]) pinBoxes[i].value = char;
        });
        const fullPin = get6DigitPin();
        if (fullPin.length === 6) {
          handleQuickLoginFormSubmit();
        } else {
          const nextEmpty = Array.from(pinBoxes).findIndex(b => !b.value);
          if (nextEmpty !== -1) pinBoxes[nextEmpty].focus();
        }
      }
    });
  });

  // Quick PIN Password Visibility Toggle (for all 6 boxes)
  const toggleEyeBtn = document.getElementById('toggle-quick-pin-visibility');
  const eyeIcon = document.getElementById('quick-pin-eye-icon');
  const eyeText = document.getElementById('quick-pin-eye-text');
  let isPinVisible = false;

  if (toggleEyeBtn) {
    toggleEyeBtn.addEventListener('click', () => {
      isPinVisible = !isPinVisible;
      pinBoxes.forEach(b => {
        b.type = isPinVisible ? 'text' : 'password';
      });
      if (eyeIcon) eyeIcon.className = isPinVisible ? 'fas fa-eye-slash' : 'fas fa-eye';
      if (eyeText) eyeText.textContent = isPinVisible ? "Yashirish" : "Ko'rsatish";
    });
  }

  // Quick 6-Digit Numpad Touch / Click Handler
  const quickNumpadBtns = document.querySelectorAll('.quick-numpad-btn');
  quickNumpadBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const digit = btn.getAttribute('data-digit');
      const action = btn.getAttribute('data-action');
      const boxes = document.querySelectorAll('.pin-box');

      if (digit !== null && digit !== undefined) {
        // Find the first unfilled box
        for (let i = 0; i < boxes.length; i++) {
          if (!boxes[i].value) {
            boxes[i].value = digit;
            if (i < boxes.length - 1) {
              boxes[i + 1].focus();
            } else {
              boxes[i].focus();
            }
            break;
          }
        }
        // If all 6 digits filled, automatically trigger login
        const fullPin = get6DigitPin();
        if (fullPin.length === 6) {
          handleQuickLoginFormSubmit();
        }
      } else if (action === 'clear') {
        clear6DigitPin();
      } else if (action === 'backspace') {
        // Find last filled box and clear it
        for (let i = boxes.length - 1; i >= 0; i--) {
          if (boxes[i].value) {
            boxes[i].value = '';
            boxes[i].focus();
            break;
          }
        }
      }
    });
  });

  // Quick 1-Click Fast Role Logins
  document.querySelectorAll('.btn-demo-quick-auth').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const pin = btn.getAttribute('data-pin');
      const boxes = document.querySelectorAll('.pin-box');
      if (pin && boxes.length >= 6) {
        pin.split('').forEach((digit, i) => {
          if (boxes[i]) boxes[i].value = digit;
        });
        handleQuickLoginFormSubmit();
      }
    });
  });

  // Pin Pad Keys
  document.querySelectorAll('.num-key').forEach(btn => {
    btn.addEventListener('click', () => handlePinPadKeyPress(btn.getAttribute('data-value')));
  });

  document.getElementById('pin-clear').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('pin-pad-container').style.display = 'none';
  });

  document.getElementById('pin-submit').addEventListener('click', submitPinCode);

  function performLogout() {
    stopHtml5Scanner();
    setToken(null);
    currentUser = null;
    currentCart = [];
    showAuthScreen();
    showToast('Terminaldan muvaffaqiyatli chiqildi');
  }

  // Logout
  document.getElementById('logout-btn').addEventListener('click', performLogout);

  const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener('click', performLogout);
  }

  const scannerLogoutBtn = document.getElementById('scanner-logout-btn');
  if (scannerLogoutBtn) {
    scannerLogoutBtn.addEventListener('click', performLogout);
  }

  // Unauthorized Token Interceptor
  window.addEventListener('auth:unauthorized', () => {
    stopHtml5Scanner();
    showAuthScreen();
    showToast('Sessiya muddati tugadi', 'danger');
  });

  // Tab Navigation Links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const view = link.getAttribute('data-view');
      switchTab(view);
    });
  });

  // Language selectors
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      setLanguage(lang);
      
      document.querySelectorAll('.lang-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-lang') === lang);
      });
    });
  });

  // Set active language button active
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === getLanguage());
  });

  // POS Search
  document.getElementById('pos-search').addEventListener('input', (e) => {
    refreshPOSProducts(e.target.value);
  });

  // POS Sub-mode switching (Katalog / Skanerlash)
  const modeCatalogBtn = document.getElementById('pos-mode-catalog-btn');
  const modeScannerBtn = document.getElementById('pos-mode-scanner-btn');
  const catalogContainer = document.getElementById('pos-catalog-container');
  const scannerContainer = document.getElementById('pos-scanner-container');
  const hwScannerInput = document.getElementById('pos-hardware-scanner-input');

  if (modeCatalogBtn && modeScannerBtn && catalogContainer && scannerContainer) {
    modeCatalogBtn.addEventListener('click', () => {
      catalogContainer.style.display = 'block';
      scannerContainer.style.display = 'none';
      modeCatalogBtn.className = 'btn-primary';
      modeScannerBtn.className = 'btn-secondary';
    });

    modeScannerBtn.addEventListener('click', () => {
      catalogContainer.style.display = 'none';
      scannerContainer.style.display = 'block';
      modeScannerBtn.className = 'btn-primary';
      modeCatalogBtn.className = 'btn-secondary';
      if (hwScannerInput) {
        setTimeout(() => hwScannerInput.focus(), 100);
      }
    });
  }

  // Handle hardware scanner inputs
  if (hwScannerInput) {
    hwScannerInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = hwScannerInput.value.trim();
        hwScannerInput.value = '';
        if (!code) return;

        try {
          const product = await request(`/products/scan/${code}`, 'GET');
          if (product.quantity > 0) {
            addToCart(product, 1);
            showToast(`Skanerlandi: ${product.model_name}`, 'success');
            displayScannedProduct(product);
          } else {
            showToast(`${product.model_name} zaxirada qolmagan!`, 'danger');
            displayScannedProductError(code, 'Mahsulot omborda qolmagan (zaxira: 0 ta)');
          }
        } catch (err) {
          showToast(`Shtrixkod (${code}) topilmadi!`, 'danger');
          displayScannedProductError(code, 'Ushbu shtrixkod / QR kodga mos keladigan mahsulot tizimda topilmadi.');
        }
      }
    });
  }

  // Scanner autofocus keeper (runs every 1 second when scanner mode is active)
  setInterval(() => {
    const isScannerActive = scannerContainer && scannerContainer.style.display === 'block';
    const isPOSViewVisible = document.getElementById('view-pos') && document.getElementById('view-pos').style.display !== 'none';
    if (isScannerActive && isPOSViewVisible && hwScannerInput) {
      if (document.activeElement !== hwScannerInput) {
        hwScannerInput.focus();
      }
    }
  }, 1000);

  // Manual Sales product add
  const manualAddBtn = document.getElementById('pos-manual-add-btn');
  if (manualAddBtn) {
    manualAddBtn.addEventListener('click', () => {
      const select = document.getElementById('pos-manual-product-select');
      const prodId = select ? select.value : '';
      if (!prodId) {
        showToast("Iltimos, avval telefon modelini tanlang!", "warning");
        return;
      }
      const prod = posProductsList.find(p => p.id === prodId || p.id == prodId);
      if (prod) {
        if (prod.quantity > 0) {
          addToCart(prod);
          showToast(`Savatga qo'shildi: ${prod.model_name}`);
        } else {
          showToast('Mahsulot zaxirada qolmagan!', 'danger');
        }
      }
    });
  }

  // Warehouse simulated scanner
  const whScanBtn = document.getElementById('wh-sim-scan-btn');
  const whScanInput = document.getElementById('wh-simulated-qr-input');
  if (whScanBtn) whScanBtn.addEventListener('click', handleWarehouseScan);
  if (whScanInput) {
    whScanInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleWarehouseScan();
    });
  }

  // POS checkout
  document.getElementById('checkout-btn').addEventListener('click', handlePOSCheckout);

  // Warehouse modal actions
  document.getElementById('open-add-product-modal').addEventListener('click', () => openProductModal(null));
  document.getElementById('close-product-modal').addEventListener('click', () => {
    document.getElementById('product-modal').style.display = 'none';
  });
  
  const closeClickPayBtn = document.getElementById('close-click-pay-modal');
  if (closeClickPayBtn) {
    closeClickPayBtn.addEventListener('click', () => {
      document.getElementById('click-payment-modal').style.display = 'none';
      const clickPaySuccessBtn = document.getElementById('click-pay-success-btn');
      if (clickPaySuccessBtn) clickPaySuccessBtn.style.display = 'none';
    });
  }

  // Payment selection modal actions
  const paySelectModal = document.getElementById('payment-selection-modal');
  const closePaySelectBtn = document.getElementById('close-pay-select-modal');
  const payCashBtn = document.getElementById('pay-cash-btn');
  const payClickBtn = document.getElementById('pay-click-btn');
  const payDebtBtn = document.getElementById('pay-debt-btn');
  const debtCheckoutFormContainer = document.getElementById('debt-checkout-form-container');
  const confirmDebtCheckoutBtn = document.getElementById('confirm-debt-checkout-btn');
  const clickPaySuccessBtn = document.getElementById('click-pay-success-btn');

  if (closePaySelectBtn) {
    closePaySelectBtn.addEventListener('click', () => {
      if (paySelectModal) paySelectModal.style.display = 'none';
      if (debtCheckoutFormContainer) debtCheckoutFormContainer.style.display = 'none';
    });
  }

  if (payCashBtn) {
    payCashBtn.addEventListener('click', () => {
      if (paySelectModal) paySelectModal.style.display = 'none';
      if (debtCheckoutFormContainer) debtCheckoutFormContainer.style.display = 'none';
      completePOSCheckout();
    });
  }

  if (payClickBtn) {
    payClickBtn.addEventListener('click', () => {
      if (paySelectModal) paySelectModal.style.display = 'none';
      if (debtCheckoutFormContainer) debtCheckoutFormContainer.style.display = 'none';
      
      let totalAmount = 0;
      currentCart.forEach(item => {
        totalAmount += item.retail_price * item.quantity;
      });

      let paymentUrl = '';
      const txParam = (currentSettings && currentSettings.click_config && currentSettings.click_config.active) 
        ? `pos_sale_${Date.now()}` 
        : `demo_pos_sale_${Date.now()}`;
      
      activeClickTransactionParam = txParam;

      if (currentSettings && currentSettings.click_config && currentSettings.click_config.active) {
        const config = currentSettings.click_config;
        if (config.card_number) {
          const cleanCard = config.card_number.replace(/\s+/g, '');
          paymentUrl = `https://my.click.uz/services/pay?service_id=3&merchant_id=${cleanCard}&amount=${totalAmount.toFixed(2)}&transaction_param=${txParam}`;
        } else {
          paymentUrl = `https://my.click.uz/services/pay?service_id=${config.service_id}&merchant_id=${config.merchant_id}&amount=${totalAmount.toFixed(2)}&transaction_param=${txParam}`;
        }
      } else {
        paymentUrl = `https://my.click.uz/services/pay?service_id=demo_service&merchant_id=demo_merchant&amount=${totalAmount.toFixed(2)}&transaction_param=${txParam}`;
      }

      const clickModal = document.getElementById('click-payment-modal');
      const clickSubtitle = document.getElementById('click-pay-subtitle');
      const clickQr = document.getElementById('click-pay-qr');
      const clickLink = document.getElementById('click-pay-link');

      if (clickSubtitle) {
        clickSubtitle.innerText = `Sotuv Savatchasi - $${totalAmount.toFixed(2)}`;
      }
      
      const clickHolderEl = document.getElementById('click-pay-holder');
      if (clickHolderEl) {
        if (currentSettings && currentSettings.click_config && currentSettings.click_config.card_holder) {
          clickHolderEl.innerText = `Karta egasi: ${currentSettings.click_config.card_holder}`;
          clickHolderEl.style.display = 'block';
        } else {
          clickHolderEl.style.display = 'none';
        }
      }

      if (clickQr) {
        clickQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(paymentUrl)}`;
      }
      if (clickLink) {
        clickLink.href = paymentUrl;
      }

      if (clickPaySuccessBtn) {
        clickPaySuccessBtn.style.display = 'inline-flex';
      }

      if (clickModal) clickModal.style.display = 'flex';
    });
  }

  if (clickPaySuccessBtn) {
    clickPaySuccessBtn.addEventListener('click', () => {
      const clickModal = document.getElementById('click-payment-modal');
      if (clickModal) clickModal.style.display = 'none';
      clickPaySuccessBtn.style.display = 'none';
      completePOSCheckout();
    });
  }

  if (payDebtBtn) {
    payDebtBtn.addEventListener('click', () => {
      if (debtCheckoutFormContainer) {
        if (debtCheckoutFormContainer.style.display === 'none' || !debtCheckoutFormContainer.style.display) {
          debtCheckoutFormContainer.style.display = 'block';
          document.getElementById('debt-checkout-name').value = '';
          document.getElementById('debt-checkout-phone').value = '';
          document.getElementById('debt-checkout-passport').value = '';
          document.getElementById('debt-checkout-pinfl').value = '';
          document.getElementById('debt-checkout-address').value = '';
          document.getElementById('debt-checkout-paid').value = '0';
          document.getElementById('debt-checkout-due').value = '';
          
          debtCheckoutFormContainer.scrollIntoView({ behavior: 'smooth' });
        } else {
          debtCheckoutFormContainer.style.display = 'none';
        }
      }
    });
  }

  if (confirmDebtCheckoutBtn) {
    confirmDebtCheckoutBtn.addEventListener('click', async () => {
      const name = document.getElementById('debt-checkout-name').value.trim();
      const phone = document.getElementById('debt-checkout-phone').value.trim();
      const passport = document.getElementById('debt-checkout-passport').value.trim().toUpperCase();
      const pinfl = document.getElementById('debt-checkout-pinfl').value.trim();
      const address = document.getElementById('debt-checkout-address').value.trim();
      const paid = parseFloat(document.getElementById('debt-checkout-paid').value) || 0;
      const due = document.getElementById('debt-checkout-due').value;

      if (!name || !phone) {
        showToast('Iltimos, qarzdor mijoz ismi va telefon raqamini kiriting', 'danger');
        return;
      }
      if (!passport) {
        showToast('Iltimos, pasport seriyasi va raqamini kiriting', 'danger');
        return;
      }
      if (pinfl && (pinfl.length !== 14 || !/^\d+$/.test(pinfl))) {
        showToast('JShShIR (PINFL) 14 ta raqamdan iborat bo\'lishi shart', 'danger');
        return;
      }
      if (!address) {
        showToast('Iltimos, qarzdorning yashash manzilini kiriting', 'danger');
        return;
      }

      try {
        const payload = {
          cart: currentCart.map(item => ({ product_id: item.id, quantity: item.quantity })),
          payment_method: 'debt',
          debt_details: {
            customer_name: name,
            customer_phone: phone,
            passport_series_number: passport,
            passport_pinfl: pinfl,
            customer_address: address,
            paid_amount: paid,
            due_date: due || null
          }
        };

        const res = await request('/sales/checkout', 'POST', payload);
        showToast(res.message);
        
        if (paySelectModal) paySelectModal.style.display = 'none';
        if (debtCheckoutFormContainer) debtCheckoutFormContainer.style.display = 'none';
        
        currentCart = [];
        renderCart();
        refreshPOSProducts();
        if (currentUser && currentUser.role === 'cashier') {
          initCashierShiftTracking(currentUser);
        }
      } catch (e) {
        showToast(e.message, 'danger');
      }
    });
  }

  // POS Product Details Modal Event Listeners
  const posDetailModal = document.getElementById('pos-product-details-modal');
  const closePosDetailBtn = document.getElementById('close-pos-detail-btn');
  const cancelPosDetailBtn = document.getElementById('pos-detail-cancel-btn');
  const addPosDetailBtn = document.getElementById('pos-detail-add-btn');

  const closePOSDetails = () => {
    if (posDetailModal) posDetailModal.style.display = 'none';
    selectedPOSProduct = null;
  };

  if (closePosDetailBtn) closePosDetailBtn.addEventListener('click', closePOSDetails);
  if (cancelPosDetailBtn) cancelPosDetailBtn.addEventListener('click', closePOSDetails);
  
  const qtyDecBtn = document.getElementById('pos-detail-qty-dec');
  const qtyIncBtn = document.getElementById('pos-detail-qty-inc');
  const qtyInput = document.getElementById('pos-detail-qty-input');

  if (qtyDecBtn && qtyInput) {
    qtyDecBtn.addEventListener('click', () => {
      let val = parseInt(qtyInput.value) || 1;
      if (val > 1) {
        qtyInput.value = val - 1;
      }
    });
  }

  if (qtyIncBtn && qtyInput) {
    qtyIncBtn.addEventListener('click', () => {
      let val = parseInt(qtyInput.value) || 1;
      if (selectedPOSProduct && val < selectedPOSProduct.quantity) {
        qtyInput.value = val + 1;
      }
    });
  }

  if (qtyInput) {
    qtyInput.addEventListener('change', () => {
      let val = parseInt(qtyInput.value) || 1;
      if (val < 1) val = 1;
      if (selectedPOSProduct && val > selectedPOSProduct.quantity) {
        val = selectedPOSProduct.quantity;
      }
      qtyInput.value = val;
    });
  }
  
  if (addPosDetailBtn) {
    addPosDetailBtn.addEventListener('click', () => {
      if (selectedPOSProduct) {
        const qtyVal = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
        if (selectedPOSProduct.quantity >= qtyVal && qtyVal > 0) {
          addToCart(selectedPOSProduct, qtyVal);
          closePOSDetails();
        } else {
          showToast(dictionaries[getLanguage()].pos_out_of_stock, 'danger');
        }
      }
    });
  }

  document.getElementById('save-product-btn').addEventListener('click', handleSaveProduct);

  // Product image upload listeners
  const imgUploadBtn = document.getElementById('product-image-upload-btn');
  const imgFileInput = document.getElementById('product-image-file');
  const imgBase64Input = document.getElementById('product-image-base64');
  const imgPreview = document.getElementById('product-image-preview');
  const imgPreviewContainer = document.getElementById('product-image-preview-container');
  const imgClearBtn = document.getElementById('product-image-clear-btn');

  if (imgUploadBtn && imgFileInput) {
    imgUploadBtn.addEventListener('click', () => imgFileInput.click());
    
    imgFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Compress the image using canvas
          const canvas = document.createElement('canvas');
          const maxDim = 300;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxDim) {
              height *= maxDim / width;
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width *= maxDim / height;
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG base64 (quality 0.7)
          const base64 = canvas.toDataURL('image/jpeg', 0.7);
          imgBase64Input.value = base64;
          imgPreview.src = base64;
          imgPreviewContainer.style.display = 'flex';
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    if (imgClearBtn) {
      imgClearBtn.addEventListener('click', () => {
        imgFileInput.value = '';
        imgBase64Input.value = '';
        imgPreview.src = '';
        imgPreviewContainer.style.display = 'none';
      });
    }
  }

  // Staff modal actions
  document.getElementById('open-add-staff-modal').addEventListener('click', () => openStaffModal(null));
  document.getElementById('close-staff-modal').addEventListener('click', () => {
    document.getElementById('staff-modal').style.display = 'none';
  });
  document.getElementById('save-staff-btn').addEventListener('click', handleSaveStaff);

  // Staff Subtabs Switcher (Staff List vs Live Shifts Tracker)
  const subtabStaffListBtn = document.getElementById('subtab-btn-staff-list');
  const subtabStaffShiftsBtn = document.getElementById('subtab-btn-staff-shifts');
  const subtabStaffListContent = document.getElementById('subtab-content-staff-list');
  const subtabStaffShiftsContent = document.getElementById('subtab-content-staff-shifts');

  if (subtabStaffListBtn && subtabStaffShiftsBtn) {
    subtabStaffListBtn.addEventListener('click', () => {
      subtabStaffListBtn.style.background = 'var(--accent-gradient)';
      subtabStaffListBtn.style.color = '#030712';
      subtabStaffShiftsBtn.style.background = 'rgba(255,255,255,0.04)';
      subtabStaffShiftsBtn.style.color = 'var(--color-text-secondary)';

      if (subtabStaffListContent) subtabStaffListContent.style.display = 'block';
      if (subtabStaffShiftsContent) subtabStaffShiftsContent.style.display = 'none';
      loadStaffList();
    });

    subtabStaffShiftsBtn.addEventListener('click', () => {
      subtabStaffShiftsBtn.style.background = 'var(--accent-gradient)';
      subtabStaffShiftsBtn.style.color = '#030712';
      subtabStaffListBtn.style.background = 'rgba(255,255,255,0.04)';
      subtabStaffListBtn.style.color = 'var(--color-text-secondary)';

      if (subtabStaffListContent) subtabStaffListContent.style.display = 'none';
      if (subtabStaffShiftsContent) subtabStaffShiftsContent.style.display = 'block';
      loadStaffWorkHoursData();
    });
  }

  const refreshShiftsBtn = document.getElementById('btn-refresh-shifts');
  if (refreshShiftsBtn) {
    refreshShiftsBtn.addEventListener('click', () => {
      loadStaffWorkHoursData();
      showToast('Smenalar statistikasi yangilandi', 'info');
    });
  }

  // User Profile Badge Click (Toggle Cashier Shift Live Card)
  const userProfileBtn = document.getElementById('btn-toggle-user-profile');
  if (userProfileBtn) {
    userProfileBtn.addEventListener('click', () => {
      if (!currentUser || currentUser.role !== 'cashier') return;
      const widget = document.getElementById('cashier-shift-widget');
      const chevron = document.getElementById('user-badge-chevron');
      if (widget) {
        const isHidden = widget.style.display === 'none' || !widget.style.display;
        if (isHidden) {
          widget.style.display = 'block';
          if (chevron) chevron.style.transform = 'rotate(180deg)';
          userProfileBtn.classList.add('active-open');
        } else {
          widget.style.display = 'none';
          if (chevron) chevron.style.transform = 'rotate(0deg)';
          userProfileBtn.classList.remove('active-open');
        }
      }
    });
  }

  // Cashier Shift End Action Button & Modal Handlers
  const btnEndShiftAction = document.getElementById('btn-end-shift-action');
  if (btnEndShiftAction) {
    btnEndShiftAction.addEventListener('click', openShiftSummaryModal);
  }

  const btnCancelEndShift = document.getElementById('btn-cancel-end-shift');
  if (btnCancelEndShift) {
    btnCancelEndShift.addEventListener('click', () => {
      const modal = document.getElementById('shift-summary-modal');
      if (modal) modal.style.display = 'none';
    });
  }

  const btnConfirmEndShift = document.getElementById('btn-confirm-end-shift');
  if (btnConfirmEndShift) {
    btnConfirmEndShift.addEventListener('click', handleConfirmEndShift);
  }

  // User accounts modal actions
  const openAddUserBtn = document.getElementById('open-add-user-modal');
  if (openAddUserBtn) {
    openAddUserBtn.addEventListener('click', () => openUserModal(null));
  }
  const closeUserModalBtn = document.getElementById('close-user-modal');
  if (closeUserModalBtn) {
    closeUserModalBtn.addEventListener('click', () => {
      document.getElementById('user-modal').style.display = 'none';
    });
  }
  const saveUserBtn = document.getElementById('save-user-btn');
  if (saveUserBtn) {
    saveUserBtn.addEventListener('click', handleSaveUser);
  }
  const userModalRoleSelect = document.getElementById('user-modal-role');
  if (userModalRoleSelect) {
    userModalRoleSelect.addEventListener('change', adjustUserModalFieldsVisibility);
  }

  // Branch modal actions
  document.getElementById('open-add-branch-modal').addEventListener('click', () => openBranchModal(null));
  document.getElementById('close-branch-modal').addEventListener('click', () => {
    document.getElementById('branch-modal').style.display = 'none';
  });
  document.getElementById('save-branch-btn').addEventListener('click', saveBranch);
  document.getElementById('btn-close-branch-details').addEventListener('click', () => {
    document.getElementById('selected-branch-details-panel').style.display = 'none';
    selectedBranch = null;
  });
  document.getElementById('btn-assign-cashier').addEventListener('click', assignCashier);

  document.getElementById('save-settings-btn').addEventListener('click', handleSaveSettings);
  document.getElementById('save-click-config-btn').addEventListener('click', handleSaveClickConfig);

  const toggleClickSecretBtn = document.getElementById('toggle-click-secret-key-btn');
  const clickSecretInput = document.getElementById('click-secret-key');
  if (toggleClickSecretBtn && clickSecretInput) {
    toggleClickSecretBtn.addEventListener('click', () => {
      if (clickSecretInput.type === 'password') {
        clickSecretInput.type = 'text';
        toggleClickSecretBtn.innerHTML = '<i class="far fa-eye-slash"></i>';
      } else {
        clickSecretInput.type = 'password';
        toggleClickSecretBtn.innerHTML = '<i class="far fa-eye"></i>';
      }
    });
  }

  const settingsClickSaveBtn = document.getElementById('settings-save-click-btn');
  if (settingsClickSaveBtn) {
    settingsClickSaveBtn.addEventListener('click', handleSaveClickSettings);
  }

  // Settings subtab switching
  document.querySelectorAll('.settings-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Reset all buttons
      document.querySelectorAll('.settings-subtab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.color = 'var(--color-text-secondary)';
        b.style.borderBottomColor = 'transparent';
        b.style.fontWeight = '500';
      });

      // Activate clicked button
      btn.classList.add('active');
      btn.style.color = 'var(--accent)';
      btn.style.borderBottomColor = 'var(--accent)';
      btn.style.fontWeight = '600';

      // Hide all contents
      document.querySelectorAll('.settings-subtab-content').forEach(content => {
        content.style.display = 'none';
      });

      // Show target content
      const target = btn.getAttribute('data-subtab');
      const targetContent = document.getElementById(`subtab-content-${target}`);
      if (targetContent) {
        targetContent.style.display = 'block';
      }
    });
  });

  const settingsClickCardInput = document.getElementById('settings-click-card-number');
  if (settingsClickCardInput) {
    settingsClickCardInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
      let formatted = '';
      for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) {
          formatted += ' ';
        }
        formatted += value[i];
      }
      e.target.value = formatted;
    });
  }

  const settingsClickExpiryInput = document.getElementById('settings-click-card-expiry');
  if (settingsClickExpiryInput) {
    settingsClickExpiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\//g, '').replace(/[^0-9]/gi, '');
      if (value.length > 2) {
        e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
      } else {
        e.target.value = value;
      }
    });
  }

  const clickCardInput = document.getElementById('click-card-number');
  if (clickCardInput) {
    clickCardInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
      let formatted = '';
      for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) {
          formatted += ' ';
        }
        formatted += value[i];
      }
      e.target.value = formatted;
    });
  }

  const clickExpiryInput = document.getElementById('click-card-expiry');
  if (clickExpiryInput) {
    clickExpiryInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\//g, '').replace(/[^0-9]/gi, '');
      if (value.length > 2) {
        e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
      } else {
        e.target.value = value;
      }
    });
  }

  // Background Upload / Clear actions
  const uploadBgBtn = document.getElementById('upload-bg-btn');
  const bgFileInput = document.getElementById('settings-theme-bg-file');
  const clearBgBtn = document.getElementById('clear-bg-btn');
  const bgImageInput = document.getElementById('settings-theme-bg-image');

  if (uploadBgBtn && bgFileInput) {
    uploadBgBtn.addEventListener('click', () => bgFileInput.click());
  }

  if (bgFileInput && bgImageInput) {
    bgFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Limit file size to 2MB to keep base64 storage sizes reasonable
      if (file.size > 2 * 1024 * 1024) {
        showToast("Rasm hajmi juda katta! Iltimos, 2MB dan kichik rasm tanlang.", "warning");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        bgImageInput.value = event.target.result;
        
        const previewContainer = document.getElementById('settings-theme-bg-preview-container');
        const previewImg = document.getElementById('settings-theme-bg-preview');
        if (previewImg) previewImg.src = event.target.result;
        if (previewContainer) previewContainer.style.display = 'flex';
        
        autoSaveAndApplyTheme();
        showToast("Rasm yuklandi va avtomatik ravishda saqlandi!", "success");
      };
      reader.readAsDataURL(file);
    });
  }

  if (clearBgBtn && bgImageInput) {
    clearBgBtn.addEventListener('click', () => {
      bgImageInput.value = '';
      if (bgFileInput) bgFileInput.value = '';
      
      const previewContainer = document.getElementById('settings-theme-bg-preview-container');
      if (previewContainer) previewContainer.style.display = 'none';
      
      autoSaveAndApplyTheme();
      showToast("Fon rasmi tozalandi!", "warning");
    });
  }

  // Live settings inputs listeners for instant autosaving & styling updates
  const themeInputs = [
    'settings-accent-color',
    'settings-ui-preset',
    'settings-theme-mood',
    'settings-theme-pattern',
    'settings-theme-mode'
  ];
  themeInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', autoSaveAndApplyTheme);
      el.addEventListener('change', autoSaveAndApplyTheme);
    }
  });



  // Role-Based UI Watchdog Guard
  setInterval(() => {
    if (currentUser && currentUser.role === 'cashier') {
      const dash = document.getElementById('nav-dash');
      const wh = document.getElementById('nav-wh');
      const staff = document.getElementById('nav-staff-tab');
      const branches = document.getElementById('nav-branches-tab');
      const clickTab = document.getElementById('nav-click-tab');
      const activitiesTab = document.getElementById('nav-activities-tab');
      const settings = document.getElementById('nav-set');
      const addBtn = document.getElementById('open-add-product-modal');
      const actionsHeader = document.getElementById('wh-actions-header');
      const purchaseHeader = document.getElementById('wh-purchase-header');
      const debtsTab = document.getElementById('nav-debts-tab');
      
      if (dash && dash.style.display !== 'none') dash.style.display = 'none';
      if (wh && wh.style.display !== 'block') wh.style.display = 'block';
      if (debtsTab && debtsTab.style.display !== 'block') debtsTab.style.display = 'block';
      if (staff && staff.style.display !== 'none') staff.style.display = 'none';
      if (branches && branches.style.display !== 'none') branches.style.display = 'none';
      if (clickTab && clickTab.style.display !== 'none') clickTab.style.display = 'none';
      if (activitiesTab && activitiesTab.style.display !== 'none') activitiesTab.style.display = 'none';
      if (settings && settings.style.display !== 'none') settings.style.display = 'none';
      if (addBtn && addBtn.style.display !== 'none') addBtn.style.display = 'none';
      if (actionsHeader && actionsHeader.style.display !== 'none') actionsHeader.style.display = 'none';
      if (purchaseHeader && purchaseHeader.style.display !== 'none') purchaseHeader.style.display = 'none';
    } else if (currentUser && currentUser.role === 'admin') {
      const adminElements = document.querySelectorAll('.admin-only');
      adminElements.forEach(el => {
        if (el.tagName === 'TH' || el.tagName === 'TD') {
          if (el.style.display !== 'table-cell') el.style.display = 'table-cell';
        } else if (el.classList.contains('nav-link')) {
          if (el.style.display !== 'flex') el.style.display = 'flex';
        } else {
          if (el.style.display === 'none') el.style.display = 'block';
        }
      });
    }
  }, 100);
}

/**
 * 6. Branches / Objects Management Logic
 */
let allBranches = [];
let selectedBranch = null;

async function loadBranches() {
  try {
    const list = await request('/branches', 'GET');
    allBranches = list;
    
    const container = document.getElementById('branches-list-grid');
    if (container) {
      if (list.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--color-text-secondary); padding: 40px;" data-i18n="branches_no_branches">Hozircha filiallar qo'shilmagan</div>`;
      } else {
        container.innerHTML = list.map(b => `
          <div class="product-card" style="height: auto; gap: 12px;">
            <div class="product-name" style="margin-bottom: 2px;">${b.name}</div>
            <div style="font-size: 12px; color: var(--color-text-secondary);">${b.address || 'Manzil kiritilmagan'}</div>
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 4px; font-size: 13px;">
              <div>Kassirlar: <strong>${b.users_count} ta</strong></div>
              <div>Qurilmalar: <strong>${b.products_count} ta</strong></div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: auto; padding-top: 12px;">
              <button class="btn-primary btn-branch-details" data-id="${b.id}" style="width: auto; padding: 6px 12px; font-size: 11px;">Batafsil</button>
              <button class="btn-secondary btn-branch-edit" data-id="${b.id}" style="width: auto; padding: 6px 12px; font-size: 11px;">Tahrirlash</button>
              <button class="btn-secondary btn-branch-delete" data-id="${b.id}" style="width: auto; padding: 6px 12px; font-size: 11px; color: var(--color-danger); border-color: rgba(239,68,68,0.2);">O'chirish</button>
            </div>
          </div>
        `).join('');
        
        container.querySelectorAll('.btn-branch-details').forEach(btn => {
          btn.addEventListener('click', () => showBranchDetails(btn.getAttribute('data-id')));
        });
        container.querySelectorAll('.btn-branch-edit').forEach(btn => {
          btn.addEventListener('click', () => openBranchModal(btn.getAttribute('data-id')));
        });
        container.querySelectorAll('.btn-branch-delete').forEach(btn => {
          btn.addEventListener('click', () => deleteBranch(btn.getAttribute('data-id')));
        });
      }
    }
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

function openBranchModal(id = null) {
  const modal = document.getElementById('branch-modal');
  const title = document.getElementById('branch-modal-title');
  const form = document.getElementById('branch-form');
  
  if (modal) {
    modal.style.display = 'flex';
    form.reset();
    
    if (id) {
      const branch = allBranches.find(b => b.id === id);
      if (branch) {
        title.innerText = "Filialni Tahrirlash";
        document.getElementById('branch-id').value = branch.id;
        document.getElementById('branch-name').value = branch.name;
        document.getElementById('branch-address').value = branch.address || '';
      }
    } else {
      title.innerText = "Yangi Obyekt Qo'shish";
      document.getElementById('branch-id').value = '';
    }
  }
}

async function saveBranch() {
  const id = document.getElementById('branch-id').value;
  const name = document.getElementById('branch-name').value.trim();
  const address = document.getElementById('branch-address').value.trim();
  
  if (!name) return;
  
  const payload = { name, address };
  
  try {
    let res;
    if (id) {
      res = await request(`/branches/${id}`, 'PUT', payload);
    } else {
      res = await request('/branches', 'POST', payload);
    }
    showToast(res.message);
    document.getElementById('branch-modal').style.display = 'none';
    loadBranches();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

async function deleteBranch(id) {
  if (!confirm("Haqiqatan ham bu ob'yektni o'chirib tashlamoqchimisiz?")) return;
  try {
    const res = await request(`/branches/${id}`, 'DELETE');
    showToast(res.message);
    loadBranches();
    
    const detailsPanel = document.getElementById('selected-branch-details-panel');
    if (selectedBranch && selectedBranch.id === id && detailsPanel) {
      detailsPanel.style.display = 'none';
      selectedBranch = null;
    }
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

async function showBranchDetails(id) {
  const branch = allBranches.find(b => b.id === id);
  if (!branch) return;
  
  selectedBranch = branch;
  
  const detailsPanel = document.getElementById('selected-branch-details-panel');
  if (detailsPanel) {
    detailsPanel.style.display = 'block';
    document.getElementById('selected-branch-title').innerText = branch.name;
    
    renderBranchCashiers(branch);
    
    try {
      const branchProducts = await request(`/branches/${id}/products`, 'GET');
      renderBranchProducts(branchProducts);
    } catch (e) {
      console.warn(e.message);
    }
    
    populateCashierAssignDropdown(branch);
  }
}

function renderBranchCashiers(branch) {
  const tbody = document.getElementById('branch-cashiers-tbody');
  if (tbody) {
    if (!branch.users || branch.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--color-text-secondary);">Filialga kassirlar biriktirilmagan</td></tr>`;
    } else {
      tbody.innerHTML = branch.users.map(u => {
        const latestShift = u.shifts && u.shifts.length > 0 ? u.shifts[0] : null;
        let shiftHtml = `<span style="color: var(--color-text-secondary); font-size: 11px;">Smenada emas</span>`;
        
        if (latestShift) {
          if (latestShift.status === 'active' || latestShift.status === 1) {
            const startTime = new Date(latestShift.start_time);
            const elapsedMs = new Date() - startTime;
            const elapsedHrs = Math.max(elapsedMs / (1000 * 60 * 60), 0);
            
            const baseRate = parseFloat(u.wage_structure || 15);
            const currentHour = new Date().getHours();
            const isNight = currentHour >= 20 || currentHour < 8;
            const multiplier = isNight ? 1.5 : 1.0;
            const wageAccumulated = (elapsedHrs * baseRate * multiplier).toFixed(2);
            
            shiftHtml = `
              <span style="color: var(--color-success); font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
                <span class="pulse-indicator" style="background: var(--color-success); width: 6px; height: 6px; border-radius: 50%;"></span>
                Faol (${elapsedHrs.toFixed(1)}s, $${wageAccumulated})
              </span>
            `;
          } else {
            const earned = parseFloat(latestShift.calculated_wage || 0).toFixed(2);
            shiftHtml = `
              <span style="color: var(--color-text-secondary); font-size: 11px;">
                Yopilgan ($${earned})
              </span>
            `;
          }
        }
        
        return `
          <tr>
            <td>
              <div style="font-weight: 600;">${u.name}</div>
              <div style="font-size: 11px; color: var(--color-text-secondary);">${u.email}</div>
            </td>
            <td><code>${u.pin_code || '1234'}</code></td>
            <td>${shiftHtml}</td>
            <td>
              <button class="btn-secondary btn-unassign-cashier" data-user-id="${u.id}" style="width: auto; padding: 4px 8px; font-size: 11px; color: var(--color-danger); border-color: rgba(239,68,68,0.2);">Uzish</button>
            </td>
          </tr>
        `;
      }).join('');
      
      tbody.querySelectorAll('.btn-unassign-cashier').forEach(btn => {
        btn.addEventListener('click', () => unassignCashier(btn.getAttribute('data-user-id')));
      });
    }
  }
}

function renderBranchProducts(products) {
  const tbody = document.getElementById('branch-products-tbody');
  if (tbody) {
    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--color-text-secondary);">Filial ombori bo'sh</td></tr>`;
    } else {
      tbody.innerHTML = products.map(p => `
        <tr>
          <td>
            <div style="font-weight: 600; font-size: 13px;">${p.model_name}</div>
            <div style="font-size: 11px; color: var(--color-text-secondary);">RAM: ${p.specifications.ram || 'N/A'} | ROM: ${p.specifications.storage || 'N/A'} | Rangi: ${p.specifications.color || 'N/A'}</div>
          </td>
          <td>
            ${p.quantity === 0 
              ? `<span style="font-size:11px;background:rgba(239,68,68,0.1);color:#ef4444;padding:2px 6px;border-radius:4px;font-weight:600;">Tugagan</span>`
              : p.quantity < 5 
                ? `<span style="font-size:11px;background:rgba(245,158,11,0.1);color:#f59e0b;padding:2px 6px;border-radius:4px;font-weight:600;">Kam (${p.quantity} ta)</span>`
                : `<span style="font-size:11px;background:rgba(16,185,129,0.1);color:#10b981;padding:2px 6px;border-radius:4px;font-weight:600;">${p.quantity} ta</span>`
            }
          </td>
          <td style="color: var(--accent); font-weight: 600;">$${parseFloat(p.retail_price).toFixed(2)}</td>
        </tr>
      `).join('');
    }
  }
}

async function populateCashierAssignDropdown(branch) {
  try {
    const allStaff = await request('/auth/staff', 'GET');
    const select = document.getElementById('branch-cashier-select');
    if (select) {
      const unassigned = allStaff.filter(s => s.branch_id !== branch.id);
      
      if (unassigned.length === 0) {
        select.innerHTML = `<option value="">Hamma kassirlar biriktirilgan</option>`;
      } else {
        select.innerHTML = unassigned.map(s => `
          <option value="${s.id}">${s.name} (${s.branch ? s.branch.name : 'Bo\'sh'})</option>
        `).join('');
      }
    }
  } catch (e) {
    console.warn("Could not load staff to assign:", e.message);
  }
}

async function assignCashier() {
  if (!selectedBranch) return;
  const select = document.getElementById('branch-cashier-select');
  const userId = select ? select.value : '';
  
  if (!userId) return;
  
  try {
    await request(`/auth/staff/${userId}`, 'PUT', { branch_id: selectedBranch.id });
    showToast("Kassir filialga biriktirildi!");
    
    const updatedStaff = await request('/auth/staff', 'GET');
    const user = updatedStaff.find(u => u.id === userId);
    if (user) {
      if (!selectedBranch.users) selectedBranch.users = [];
      selectedBranch.users.push(user);
    }
    
    showBranchDetails(selectedBranch.id);
    loadBranches();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

async function unassignCashier(userId) {
  if (!selectedBranch) return;
  if (!confirm("Haqiqatan ham ushbu kassirni filialdan uzmoqchimisiz?")) return;
  
  try {
    await request(`/auth/staff/${userId}`, 'PUT', { branch_id: null });
    showToast("Kassir filialdan uzildi!");
    
    if (selectedBranch.users) {
      selectedBranch.users = selectedBranch.users.filter(u => u.id !== userId);
    }
    
    showBranchDetails(selectedBranch.id);
    loadBranches();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

/**
 * 7. Mobile Camera Scanner Role Implementation
 */
let html5QrScanner = null;

async function loadScannerBranches() {
  try {
    const branches = await request('/branches', 'GET');
    const select = document.getElementById('scanner-branch-id');
    if (select) {
      select.innerHTML = branches.map(b => `
        <option value="${b.id}">${b.name}</option>
      `).join('');
    }
  } catch (e) {
    console.warn("Could not load branches for scanner:", e.message);
  }
}

let html5Qr = null;
let lastScannedCode = null;
let lastScannedTime = 0;

function initHtml5Scanner() {
  if (html5Qr) return;

  const qrReaderElement = document.getElementById('html5-qr-reader');
  if (!qrReaderElement) return;

  qrReaderElement.innerHTML = '';

  html5Qr = new Html5Qrcode("html5-qr-reader");

  html5Qr.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: 250, height: 250 }
    },
    onScanSuccess,
    onScanFailure
  ).catch(err => {
    console.warn("Back camera environment mode failed, falling back to user camera:", err);
    html5Qr.start(
      { facingMode: "user" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      onScanSuccess,
      onScanFailure
    ).catch(err2 => {
      showToast("Kameraga ulanishda xatolik: " + err2.message, "danger");
      addScannerLog("Kamera xatoligi: " + err2.message);
    });
  });
}

async function onScanSuccess(decodedText, decodedResult) {
  const branchId = document.getElementById('scanner-branch-id').value;

  if (!branchId) {
    showToast("Iltimos, avval filialni tanlang!", "warning");
    return;
  }

  // Debounce duplicate scans within 3 seconds
  const now = Date.now();
  if (decodedText === lastScannedCode && (now - lastScannedTime) < 3000) {
    return;
  }

  lastScannedCode = decodedText;
  lastScannedTime = now;

  // Audio feedback
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (err) {}

  addScannerLog(`Skanerlandi: "${decodedText}"`);

  try {
    addScannerLog("Ariza yuborilmoqda...");
    const res = await request('/scan-requests', 'POST', {
      qr_code: decodedText,
      branch_id: branchId
    });
    const branchSelect = document.getElementById('scanner-branch-id');
    const branchName = branchSelect && branchSelect.selectedIndex !== -1 ? branchSelect.options[branchSelect.selectedIndex].text : 'Noma\'lum';
    addScannerLog(`Ariza muvaffaqiyatli yuborildi! (Filial: ${branchName})`);
    showToast("Skanerlash arizasi omborga yuborildi!");
  } catch (e) {
    addScannerLog(`Xatolik: ${e.message}`);
    showToast(e.message, 'danger');
  }
}

function onScanFailure(error) {
  // Silent
}

function addScannerLog(message) {
  const statusContainer = document.getElementById('scanner-status');
  if (statusContainer) {
    const log = document.createElement('div');
    log.style.padding = '4px 0';
    log.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
    log.innerHTML = `<span style="color:var(--accent); font-weight:600;">[${new Date().toLocaleTimeString()}]</span> ${message}`;
    statusContainer.insertBefore(log, statusContainer.firstChild);
    
    while (statusContainer.childNodes.length > 20) {
      statusContainer.removeChild(statusContainer.lastChild);
    }
  }
}

function stopHtml5Scanner() {
  if (html5Qr) {
    html5Qr.stop().then(() => {
      html5Qr = null;
    }).catch(err => {
      console.warn("Failed to stop scanner:", err);
      html5Qr = null;
    });
  }
}

/**
 * 8. User Accounts & Roles Management (Settings tab)
 */
async function loadSettingsUsers() {
  if (!currentUser || currentUser.role !== 'admin') return;

  const tbody = document.getElementById('settings-users-tbody');
  if (!tbody) return;

  try {
    const staff = await request('/auth/staff', 'GET');
    
    if (staff.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-secondary);">Foydalanuvchilar topilmadi</td></tr>`;
      return;
    }

    tbody.innerHTML = staff.map(u => {
      const branchName = u.branch ? u.branch.name : '<span style="color:var(--color-text-secondary);">Asosiy</span>';
      let roleLabel = 'Kassir';
      if (u.role === 'admin') roleLabel = '<strong style="color:var(--accent);">Administrator</strong>';
      if (u.role === 'scanner') roleLabel = '<span style="color:var(--color-success);"><i class="fas fa-barcode"></i> Qurilma (Scanner)</span>';

      return `
        <tr>
          <td><span style="font-weight:600;">${u.name}</span></td>
          <td><code>${u.email}</code></td>
          <td>${roleLabel}</td>
          <td>${branchName}</td>
          <td>
            <button class="btn-primary edit-user-btn" data-id="${u.id}" style="width:auto;padding:6px 12px;font-size:12px;margin-right:8px;">Tahrirlash</button>
            <button class="btn-secondary delete-user-btn" data-id="${u.id}" style="width:auto;padding:6px 12px;font-size:12px;color:var(--color-danger);border-color:rgba(239,68,68,0.2);">O'chirish</button>
          </td>
        </tr>
      `;
    }).join('');

    // Bind actions
    tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const user = staff.find(s => s.id === id);
        openUserModal(user);
      });
    });

    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm("Rostdan ham ushbu foydalanuvchini o'chirmoqchimisiz?")) {
          try {
            const id = btn.getAttribute('data-id');
            await request(`/auth/staff/${id}`, 'DELETE');
            showToast("Foydalanuvchi tizimdan o'chirildi");
            loadSettingsUsers();
            loadStaffList(); // sync staff tab
          } catch (e) {
            showToast(e.message, 'danger');
          }
        }
      });
    });
  } catch (e) {
    console.warn("Could not load settings users:", e.message);
  }
}

async function openUserModal(user = null) {
  const modal = document.getElementById('user-modal');
  const title = document.getElementById('user-modal-title');
  const form = document.getElementById('user-form');

  modal.style.display = 'flex';

  // Load branches
  try {
    const branches = await request('/branches', 'GET');
    const select = document.getElementById('user-modal-branch-id');
    if (select) {
      select.innerHTML = `<option value="">Asosiy / Biriktirilmagan</option>` + branches.map(b => `
        <option value="${b.id}">${b.name}</option>
      `).join('');
    }
  } catch (e) {
    console.warn("Could not load branches for user modal:", e.message);
  }

  if (user) {
    title.innerText = "Foydalanuvchi hisobini tahrirlash";
    document.getElementById('user-modal-id').value = user.id;
    document.getElementById('user-modal-name').value = user.name;
    document.getElementById('user-modal-email').value = user.email;
    document.getElementById('user-modal-email').disabled = true; // Gmail unique login lock
    document.getElementById('user-modal-password').value = '';
    document.getElementById('user-modal-password').placeholder = "O'zgartirmaslik uchun bo'sh qoldiring";
    document.getElementById('user-modal-pin').value = ''; // Don't prefill hashed pin
    document.getElementById('user-modal-role').value = user.role;
    document.getElementById('user-modal-wage').value = user.wage_structure || 0;
    
    const branchSelect = document.getElementById('user-modal-branch-id');
    if (branchSelect) branchSelect.value = user.branch_id || '';
  } else {
    title.innerText = "Yangi foydalanuvchi yaratish";
    form.reset();
    document.getElementById('user-modal-id').value = '';
    document.getElementById('user-modal-email').disabled = false;
    document.getElementById('user-modal-password').placeholder = "Kamida 6 ta belgi";
  }

  adjustUserModalFieldsVisibility();
}

function adjustUserModalFieldsVisibility() {
  const role = document.getElementById('user-modal-role').value;
  const pinGroup = document.getElementById('user-modal-pin-group');
  const branchGroup = document.getElementById('user-modal-branch-group');
  const wageGroup = document.getElementById('user-modal-wage-group');

  if (role === 'admin') {
    if (pinGroup) pinGroup.style.display = 'none';
    if (branchGroup) branchGroup.style.display = 'none';
    if (wageGroup) wageGroup.style.display = 'none';
  } else if (role === 'scanner') {
    if (pinGroup) pinGroup.style.display = 'none';
    if (branchGroup) branchGroup.style.display = 'block';
    if (wageGroup) wageGroup.style.display = 'none';
  } else { // cashier
    if (pinGroup) pinGroup.style.display = 'block';
    if (branchGroup) branchGroup.style.display = 'block';
    if (wageGroup) wageGroup.style.display = 'block';
  }
}

async function handleSaveUser() {
  const id = document.getElementById('user-modal-id').value;
  const name = document.getElementById('user-modal-name').value;
  const email = document.getElementById('user-modal-email').value;
  const password = document.getElementById('user-modal-password').value;
  const role = document.getElementById('user-modal-role').value;
  const pin_code = document.getElementById('user-modal-pin').value;
  const wage_structure = parseFloat(document.getElementById('user-modal-wage').value || 0);
  const branch_id = document.getElementById('user-modal-branch-id').value || null;

  if (!email.toLowerCase().endsWith('@gmail.com')) {
    showToast("E-pochta manzili faqat @gmail.com bo'lishi shart!", "warning");
    return;
  }

  const payload = {
    name,
    email,
    role,
    wage_structure,
    branch_id
  };

  if (password) payload.password = password;
  if (role === 'cashier' && pin_code) payload.pin_code = pin_code;

  if (!id && !password) {
    showToast("Yangi foydalanuvchi uchun parol kiritish majburiy!", "warning");
    return;
  }
  if (role === 'cashier') {
    if (!id && (!pin_code || pin_code.length !== 6 || !/^[0-9]{6}$/.test(pin_code))) {
      showToast("Kassir uchun 6 xonali raqamli PIN kod majburiy (masalan: 123456)!", "warning");
      return;
    }
    if (id && pin_code && (pin_code.length !== 6 || !/^[0-9]{6}$/.test(pin_code))) {
      showToast("PIN kod 6 xonali raqamlardan iborat bo'lishi shart!", "warning");
      return;
    }
  }

  try {
    let res;
    if (id) {
      res = await request(`/auth/staff/${id}`, 'PUT', payload);
    } else {
      res = await request('/auth/staff', 'POST', payload);
    }
    showToast(res.message);
    document.getElementById('user-modal').style.display = 'none';
    loadSettingsUsers();
    loadStaffList();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}



async function loadClickConfig() {
  try {
    const settings = await request('/settings', 'GET');
    currentSettings = settings;
    const config = settings.click_config || {
      active: false,
      merchant_id: '',
      service_id: '',
      user_id: '',
      secret_key: '',
      sandbox: true,
      card_number: '',
      card_expiry: '',
      card_holder: ''
    };
    
    const clickActiveEl = document.getElementById('click-active');
    if (clickActiveEl) clickActiveEl.checked = !!config.active;
    
    const clickMerchantEl = document.getElementById('click-merchant-id');
    if (clickMerchantEl) clickMerchantEl.value = config.merchant_id || '';
    
    const clickServiceEl = document.getElementById('click-service-id');
    if (clickServiceEl) clickServiceEl.value = config.service_id || '';
    
    const clickUserEl = document.getElementById('click-user-id');
    if (clickUserEl) clickUserEl.value = config.user_id || '';
    
    const clickSecretEl = document.getElementById('click-secret-key');
    if (clickSecretEl) clickSecretEl.value = config.secret_key || '';
    
    const clickSandboxEl = document.getElementById('click-sandbox');
    if (clickSandboxEl) clickSandboxEl.checked = !!config.sandbox;
  } catch (e) {
    showToast("Click sozlamalarini yuklashda xatolik: " + e.message, 'danger');
  }
}

async function handleSaveClickConfig() {
  // Read current card values from settings page inputs as backup
  const cardNum = document.getElementById('settings-click-card-number') ? document.getElementById('settings-click-card-number').value.trim() : '';
  const cardExp = document.getElementById('settings-click-card-expiry') ? document.getElementById('settings-click-card-expiry').value.trim() : '';
  const cardHold = document.getElementById('settings-click-card-holder') ? document.getElementById('settings-click-card-holder').value.trim() : '';

  const payload = {
    key: 'click_config',
    value: {
      active: document.getElementById('click-active').checked,
      merchant_id: document.getElementById('click-merchant-id').value.trim(),
      service_id: document.getElementById('click-service-id').value.trim(),
      user_id: document.getElementById('click-user-id').value.trim(),
      secret_key: document.getElementById('click-secret-key').value.trim(),
      sandbox: document.getElementById('click-sandbox').checked,
      card_number: cardNum,
      card_expiry: cardExp,
      card_holder: cardHold
    }
  };

  try {
    const res = await request('/settings', 'POST', payload);
    if (!currentSettings) currentSettings = {};
    currentSettings.click_config = payload.value;
    
    // Sync to settings page fields if they exist
    const settingsActiveEl = document.getElementById('settings-click-active');
    if (settingsActiveEl) settingsActiveEl.checked = payload.value.active;
    const settingsMerchEl = document.getElementById('settings-click-merchant-id');
    if (settingsMerchEl) settingsMerchEl.value = payload.value.merchant_id;
    const settingsServEl = document.getElementById('settings-click-service-id');
    if (settingsServEl) settingsServEl.value = payload.value.service_id;

    showToast(res.message || "Click sozlamalari muvaffaqiyatli saqlandi");
  } catch (e) {
    showToast("Click sozlamalarini saqlashda xatolik: " + e.message, 'danger');
  }
}

async function handleSaveClickSettings() {
  const click_config = {
    active: document.getElementById('settings-click-active').checked,
    card_holder: document.getElementById('settings-click-card-holder').value.trim(),
    card_number: document.getElementById('settings-click-card-number').value.trim(),
    card_expiry: document.getElementById('settings-click-card-expiry').value.trim(),
    merchant_id: document.getElementById('settings-click-merchant-id').value.trim(),
    service_id: document.getElementById('settings-click-service-id').value.trim(),
    sandbox: true
  };

  try {
    const res = await request('/settings', 'POST', { key: 'click_config', value: click_config });
    if (!currentSettings) currentSettings = {};
    currentSettings.click_config = click_config;
    
    // Sync to other fields if they exist
    const clickActiveEl = document.getElementById('click-active');
    if (clickActiveEl) clickActiveEl.checked = click_config.active;
    const clickMerchEl = document.getElementById('click-merchant-id');
    if (clickMerchEl) clickMerchEl.value = click_config.merchant_id;
    const clickServEl = document.getElementById('click-service-id');
    if (clickServEl) clickServEl.value = click_config.service_id;
    const clickCardEl = document.getElementById('click-card-number');
    if (clickCardEl) clickCardEl.value = click_config.card_number;
    const clickExpEl = document.getElementById('click-card-expiry');
    if (clickExpEl) clickExpEl.value = click_config.card_expiry;
    const clickHoldEl = document.getElementById('click-card-holder');
    if (clickHoldEl) clickHoldEl.value = click_config.card_holder;

    showToast(res.message || "Click sozlamalari saqlandi");
  } catch (e) {
    showToast("Click sozlamalarini saqlashda xatolik: " + e.message, 'danger');
  }
}

let dragModeActive = false;

function setupSidebarDragAndDrop() {
  const navContainer = document.querySelector('.app-nav');
  if (!navContainer) return;

  const links = navContainer.querySelectorAll('.nav-link');
  
  // Initialize all links as NOT draggable initially
  links.forEach(link => {
    link.setAttribute('draggable', 'false');
  });

  // Toggle drag mode on double click of the nav container
  navContainer.addEventListener('dblclick', (e) => {
    dragModeActive = !dragModeActive;
    
    links.forEach(link => {
      link.setAttribute('draggable', dragModeActive ? 'true' : 'false');
    });

    if (dragModeActive) {
      navContainer.classList.add('drag-mode-active');
      showToast("Tartiblash rejimi yoqildi! Endi menyularni sudrab almashtirishingiz mumkin. Chiqish uchun 2 marta bosing.", "warning");
    } else {
      navContainer.classList.remove('drag-mode-active');
      showToast("Tartiblash rejimi yopildi! Yangi tartib muvaffaqiyatli saqlandi.");
    }
  });

  links.forEach(link => {
    link.addEventListener('dragstart', (e) => {
      if (!dragModeActive) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = 'move';
      link.classList.add('dragging');
      e.dataTransfer.setData('text/plain', link.id);
    });

    link.addEventListener('dragend', () => {
      link.classList.remove('dragging');
      saveSidebarOrder();
    });

    link.addEventListener('dragover', (e) => {
      if (!dragModeActive) return;
      e.preventDefault();
      const draggingElement = navContainer.querySelector('.dragging');
      if (!draggingElement) return;
      
      const siblings = [...navContainer.querySelectorAll('.nav-link:not(.dragging)')];
      
      const nextSibling = siblings.find(sibling => {
        const box = sibling.getBoundingClientRect();
        return e.clientY <= box.top + box.height / 2;
      });

      if (nextSibling) {
        navContainer.insertBefore(draggingElement, nextSibling);
      } else {
        navContainer.appendChild(draggingElement);
      }
    });
  });
}

function saveSidebarOrder() {
  const navContainer = document.querySelector('.app-nav');
  if (!navContainer) return;
  const order = [...navContainer.querySelectorAll('.nav-link')].map(link => link.id);
  localStorage.setItem('sidebar_order', JSON.stringify(order));
}

function restoreSidebarOrder() {
  const navContainer = document.querySelector('.app-nav');
  const saved = localStorage.getItem('sidebar_order');
  if (navContainer && saved) {
    try {
      const order = JSON.parse(saved);
      order.forEach(id => {
        const el = document.getElementById(id);
        if (el && navContainer) navContainer.appendChild(el);
      });
    } catch (e) {
      console.warn("Could not restore sidebar order:", e.message);
    }
  }
}

function autoSaveAndApplyTheme() {
  const accentColorInput = document.getElementById('settings-accent-color');
  const presetInput = document.getElementById('settings-ui-preset');
  const moodInput = document.getElementById('settings-theme-mood');
  const patternInput = document.getElementById('settings-theme-pattern');
  const bgImageInput = document.getElementById('settings-theme-bg-image');
  const modeInput = document.getElementById('settings-theme-mode');

  if (!accentColorInput || !presetInput || !moodInput || !patternInput || !bgImageInput || !modeInput) return;

  const theme = {
    accent_color: accentColorInput.value,
    preset: presetInput.value,
    mood: moodInput.value,
    pattern: patternInput.value,
    bg_image: bgImageInput.value.trim(),
    mode: modeInput.value
  };
  
  applyThemeStyles(theme);
  localStorage.setItem('local_theme_settings', JSON.stringify(theme));
}

function restoreLocalTheme() {
  const saved = localStorage.getItem('local_theme_settings');
  if (saved) {
    try {
      const theme = JSON.parse(saved);
      applyThemeStyles(theme);
    } catch (e) {
      console.warn("Could not restore local theme settings:", e.message);
    }
  }
}

async function loadActivityLogs() {
  if (!currentUser || currentUser.role !== 'admin') return;

  const tbody = document.getElementById('activities-table-body');
  if (!tbody) return;

  try {
    const logs = await request('/activity-logs', 'GET');
    
    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-secondary);">Oxirgi amallar topilmadi</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const date = new Date(log.created_at).toLocaleString();
      let typeBadge = '';
      
      // Map badge based on action_type
      if (log.action_type === 'sale') {
        typeBadge = `<span style="font-size:11px;background:rgba(16,185,129,0.1);color:#10b981;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-shopping-cart"></i> Sotuv</span>`;
      } else if (log.action_type === 'product_create') {
        typeBadge = `<span style="font-size:11px;background:rgba(59,130,246,0.1);color:#3b82f6;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-plus"></i> Qo'shish</span>`;
      } else if (log.action_type === 'product_update') {
        typeBadge = `<span style="font-size:11px;background:rgba(245,158,11,0.1);color:#f59e0b;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-edit"></i> Tahrir</span>`;
      } else if (log.action_type === 'product_delete') {
        typeBadge = `<span style="font-size:11px;background:rgba(239,68,68,0.1);color:#ef4444;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-trash-alt"></i> O'chirish</span>`;
      } else if (log.action_type === 'scan_request') {
        typeBadge = `<span style="font-size:11px;background:rgba(167,139,250,0.1);color:#a78bfa;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-barcode"></i> Skaner</span>`;
      } else if (log.action_type === 'scan_update') {
        typeBadge = `<span style="font-size:11px;background:rgba(45,212,191,0.1);color:#2dd4bf;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-check-double"></i> Tasdiqlash</span>`;
      } else if (log.action_type === 'login') {
        typeBadge = `<span style="font-size:11px;background:rgba(56,189,248,0.1);color:#38bdf8;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-sign-in-alt"></i> Kirish</span>`;
      } else if (log.action_type === 'shift_start' || log.action_type === 'shift_end') {
        typeBadge = `<span style="font-size:11px;background:rgba(251,113,133,0.1);color:#fb7185;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-user-clock"></i> Smena</span>`;
      } else if (log.action_type === 'repayment') {
        typeBadge = `<span style="font-size:11px;background:rgba(16,185,129,0.1);color:#10b981;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-hand-holding-usd"></i> Qarz To'lovi</span>`;
      } else if (log.action_type === 'debt_approve') {
        typeBadge = `<span style="font-size:11px;background:rgba(16,185,129,0.1);color:#10b981;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-check-double"></i> Qarz Tasdiq</span>`;
      } else if (log.action_type === 'debt_reject') {
        typeBadge = `<span style="font-size:11px;background:rgba(239,68,68,0.1);color:#ef4444;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-ban"></i> Qarz Rad</span>`;
      } else if (log.action_type === 'manual_debt_create') {
        typeBadge = `<span style="font-size:11px;background:rgba(139,92,246,0.1);color:#8b5cf6;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-plus-circle"></i> Qarz Kiritish</span>`;
      } else {
        typeBadge = `<span style="font-size:11px;background:rgba(255,255,255,0.1);color:#ffffff;padding:4px 8px;border-radius:6px;font-weight:600;">Tizim</span>`;
      }

      // Parse target object and description from [Ob'yekt] formatting
      let targetObj = 'Tizim';
      let cleanDesc = log.description;
      const match = log.description.match(/^\[(.*?)\]\s*(.*)$/);
      if (match) {
        targetObj = match[1];
        cleanDesc = match[2];
      }

      return `
        <tr>
          <td><code style="color:var(--color-text-secondary);">${date}</code></td>
          <td><strong>${log.user_name}</strong></td>
          <td>${typeBadge}</td>
          <td><span class="badge-accent" style="font-size:12px; font-weight:600; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.05); color:var(--accent); border:1px solid rgba(255,255,255,0.08);">${targetObj}</span></td>
          <td><span style="font-size:12px;color:var(--color-text-secondary);">${cleanDesc}</span></td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.warn("Could not load activity logs:", e.message);
  }
}

/**
 * 7. Nasiya / Qarzlar Module
 */
let allDebts = [];

async function loadDebts() {
  try {
    const filterStatus = document.getElementById('debt-status-filter').value;
    let url = '/debts';
    if (filterStatus === 'overdue') {
      url += '?status=pending';
    } else if (filterStatus !== 'all') {
      url += `?status=${filterStatus}`;
    }
    
    let debtsList = await request(url, 'GET');
    
    if (filterStatus === 'overdue') {
      const now = new Date();
      allDebts = debtsList.filter(d => {
        if (!d.installment_months) {
          return d.due_date && new Date(d.due_date) < now;
        }
        
        // Calculate months elapsed
        const creationDate = new Date(d.created_at);
        const diffTime = Math.abs(now - creationDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const monthsPassed = Math.floor(diffDays / 30);
        
        if (monthsPassed <= 0) return false;
        
        const monthlyPay = d.monthly_payment || (d.total_amount / d.installment_months);
        const downPayment = Math.max(0, d.total_amount - (monthlyPay * d.installment_months));
        const expectedPaid = downPayment + (Math.min(monthsPassed, d.installment_months) * monthlyPay);
        
        return d.paid_amount < expectedPaid;
      });
    } else {
      allDebts = debtsList;
    }
    
    renderDebtsTable();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

function renderDebtsTable() {
  const searchInputEl = document.getElementById('debt-search');
  const searchQuery = searchInputEl ? searchInputEl.value.toLowerCase().trim() : '';
  const tbody = document.getElementById('debts-table-body');
  if (!tbody) return;

  const filtered = allDebts.filter(d => {
    return d.customer_name.toLowerCase().includes(searchQuery) ||
           d.customer_phone.toLowerCase().includes(searchQuery) ||
           d.product_name.toLowerCase().includes(searchQuery);
  });

  // Calculate statistics from the full API list
  let totalDebtsVal = 0;
  let repaidVal = 0;
  let remainingVal = 0;

  allDebts.forEach(d => {
    totalDebtsVal += d.total_amount;
    repaidVal += d.paid_amount;
    remainingVal += d.remaining_amount;
  });

  const totalEl = document.getElementById('debt-summary-total');
  const repaidEl = document.getElementById('debt-summary-repaid');
  const remainingEl = document.getElementById('debt-summary-remaining');

  if (totalEl) totalEl.innerText = `$${totalDebtsVal.toFixed(2)}`;
  if (repaidEl) repaidEl.innerText = `$${repaidVal.toFixed(2)}`;
  if (remainingEl) remainingEl.innerText = `$${remainingVal.toFixed(2)}`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--color-text-secondary); padding: 30px;">
          Nasiya qarzlar topilmadi
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    let statusText = 'To\'lanmagan';
    let statusStyle = 'background:rgba(245,158,11,0.1);color:#f59e0b;';
    if (d.status === 'paid') {
      statusText = 'To\'langan';
      statusStyle = 'background:rgba(16,185,129,0.1);color:#10b981;';
    } else if (d.status === 'pending_approval') {
      statusText = 'Tasdiqlash kutilmoqda';
      statusStyle = 'background:rgba(156,163,175,0.15);color:#9ca3af;';
    } else if (d.status === 'rejected') {
      statusText = 'Rad etilgan';
      statusStyle = 'background:rgba(239,68,68,0.15);color:#ef4444;';
    }

    let actionBtn = '';
    if (d.status === 'pending_approval') {
      if (currentUser && currentUser.role === 'admin') {
        actionBtn = `
          <button class="btn-primary" onclick="approveDebt('${d.id}')" style="background:#10b981; border:none; padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600;" title="Tasdiqlash"><i class="fas fa-check"></i> Tasdiqlash</button>
          <button class="btn-secondary" onclick="rejectDebt('${d.id}')" style="background:#ef4444; border:none; color:#ffffff; padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600; margin-left:4px;" title="Rad etish"><i class="fas fa-times"></i> Rad etish</button>
        `;
      } else {
        actionBtn = `<span style="color:var(--color-text-secondary);font-size:11px;font-style:italic;"><i class="fas fa-clock" style="margin-right:3px;"></i>Kutilmoqda</span>`;
      }
    } else if (d.status === 'rejected') {
      actionBtn = `<span style="color:#ef4444;font-size:11px;font-weight:600;"><i class="fas fa-ban" style="margin-right:3px;"></i>Rad etildi</span>`;
    } else if (d.status === 'pending') {
      actionBtn = `<button class="btn-primary" onclick="openRepayModal('${d.id}')" style="background:#f59e0b; border:none; padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600;"><i class="fas fa-hand-holding-usd"></i> To'lov</button>`;
    } else {
      actionBtn = `<button class="btn-secondary" onclick="openRepayModal('${d.id}')" style="padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600;"><i class="fas fa-history"></i> Tarix</button>`;
    }

    // Disable contract preview buttons for unapproved/rejected debts to maintain security
    let contractBtn = '';
    let previewBtn = '';
    if (d.status !== 'pending_approval' && d.status !== 'rejected') {
      contractBtn = `<button class="btn-secondary" onclick="printDebtContract('${d.id}')" style="padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600; background:rgba(0,242,254,0.08); color:#00f2fe; border:1px solid rgba(0,242,254,0.15); margin-left:6px;"><i class="fas fa-print"></i> Shartnoma</button>`;
      previewBtn = `<button class="btn-secondary" onclick="previewDebtContract('${d.id}')" style="padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600; background:rgba(16,185,129,0.08); color:#10b981; border:1px solid rgba(16,185,129,0.15); margin-left:6px;"><i class="fas fa-file-invoice"></i> Hujjat</button>`;
    }

    const dueDate = d.due_date ? d.due_date : 'Kiritilmagan';

    return `
      <tr>
        <td>
          <div style="font-weight:600;color:#ffffff;">${d.customer_name}</div>
          <div style="font-size:11px;color:var(--color-text-secondary);">${d.customer_phone}</div>
        </td>
        <td>
          <div style="font-weight:600;color:#ffffff;">${d.product_name} ${d.quantity > 1 ? `(${d.quantity} ta)` : ''}</div>
          ${d.installment_months ? `<div style="font-size:11px;color:#00f2fe;font-weight:600;"><i class="fas fa-calendar-alt" style="margin-right:4px;"></i>${d.installment_months} oyga (oyiga $${d.monthly_payment.toFixed(2)})</div>` : ''}
          <div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;"><i class="fas fa-store" style="color:var(--accent);margin-right:4px;"></i>${d.branch_name} &nbsp;|&nbsp; <i class="fas fa-user" style="color:var(--accent);margin-right:4px;"></i>${d.cashier_name}</div>
        </td>
        <td style="font-weight:600;">$${d.total_amount.toFixed(2)}</td>
        <td style="color:#10b981;">$${d.paid_amount.toFixed(2)}</td>
        <td style="color:#ef4444;font-weight:600;">$${d.remaining_amount.toFixed(2)}</td>
        <td><code>${dueDate}</code></td>
        <td><span style="font-size:11px;padding:4px 8px;border-radius:6px;font-weight:600;${statusStyle}">${statusText}</span></td>
        <td>${actionBtn}${contractBtn}${previewBtn}</td>
      </tr>
    `;
  }).join('');
}

// Bind search and filter events when loaded
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('debt-search');
  const statusFilter = document.getElementById('debt-status-filter');
  
  if (searchInput) {
    searchInput.addEventListener('input', renderDebtsTable);
  }
  if (statusFilter) {
    statusFilter.addEventListener('change', loadDebts);
  }

  const instSearchInput = document.getElementById('installment-search');
  const instStatusFilter = document.getElementById('installment-status-filter');
  
  if (instSearchInput) {
    instSearchInput.addEventListener('input', renderInstallmentsTable);
  }
  if (instStatusFilter) {
    instStatusFilter.addEventListener('change', renderInstallmentsTable);
  }

  // Repayment form submit handler
  const repayForm = document.getElementById('repay-form');
  if (repayForm) {
    repayForm.addEventListener('submit', handleRepaySubmit);
  }

  const closeRepayBtn = document.getElementById('close-repay-modal-x');
  if (closeRepayBtn) {
    closeRepayBtn.addEventListener('click', () => {
      document.getElementById('repay-modal').style.display = 'none';
    });
  }

  // Open Add Debt Modal
  const openAddDebtBtn = document.getElementById('open-add-debt-modal-btn');
  const addDebtModal = document.getElementById('add-debt-modal');
  if (openAddDebtBtn && addDebtModal) {
    openAddDebtBtn.addEventListener('click', () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      document.getElementById('add-debt-due').value = `${yyyy}-${mm}-${dd}`;
      
      document.getElementById('add-debt-form').reset();
      document.getElementById('add-debt-qty').value = "1";
      document.getElementById('add-debt-paid').value = "0";
      document.getElementById('add-debt-months').value = "1";
      document.getElementById('add-debt-monthly-pay').value = "0.00";

      addDebtModal.style.display = 'flex';
    });
  }

  // Close Add Debt Modal
  const closeAddDebtX = document.getElementById('close-add-debt-modal-x');
  const closeAddDebtBtn = document.getElementById('close-add-debt-modal-btn');
  if (closeAddDebtX) {
    closeAddDebtX.addEventListener('click', () => {
      addDebtModal.style.display = 'none';
    });
  }
  if (closeAddDebtBtn) {
    closeAddDebtBtn.addEventListener('click', () => {
      addDebtModal.style.display = 'none';
    });
  }

  // Auto-calculation of oylik to'lov
  const inputTotal = document.getElementById('add-debt-total');
  const inputPaid = document.getElementById('add-debt-paid');
  const inputMonths = document.getElementById('add-debt-months');
  const inputMonthly = document.getElementById('add-debt-monthly-pay');

  function calculateMonthlyPay() {
    const total = parseFloat(inputTotal.value) || 0;
    const paid = parseFloat(inputPaid.value) || 0;
    const months = parseInt(inputMonths.value) || 1;
    
    const remaining = total - paid;
    if (remaining > 0 && months > 0) {
      inputMonthly.value = (remaining / months).toFixed(2);
    } else {
      inputMonthly.value = "0.00";
    }
  }

  if (inputTotal) inputTotal.addEventListener('input', calculateMonthlyPay);
  if (inputPaid) inputPaid.addEventListener('input', calculateMonthlyPay);
  if (inputMonths) inputMonths.addEventListener('input', calculateMonthlyPay);

  // Submit Manual Debt
  const addDebtForm = document.getElementById('add-debt-form');
  if (addDebtForm) {
    addDebtForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const payload = {
        customer_name: document.getElementById('add-debt-name').value.trim(),
        customer_phone: document.getElementById('add-debt-phone').value.trim(),
        passport_series_number: document.getElementById('add-debt-passport').value.trim().toUpperCase(),
        passport_pinfl: document.getElementById('add-debt-pinfl').value.trim(),
        customer_address: document.getElementById('add-debt-address').value.trim(),
        product_name: document.getElementById('add-debt-product').value.trim(),
        quantity: parseInt(document.getElementById('add-debt-qty').value) || 1,
        total_amount: parseFloat(document.getElementById('add-debt-total').value) || 0,
        paid_amount: parseFloat(document.getElementById('add-debt-paid').value) || 0,
        installment_months: parseInt(document.getElementById('add-debt-months').value) || 1,
        monthly_payment: parseFloat(document.getElementById('add-debt-monthly-pay').value) || 0,
        due_date: document.getElementById('add-debt-due').value,
      };

      if (payload.passport_pinfl && (payload.passport_pinfl.length !== 14 || isNaN(payload.passport_pinfl))) {
        showToast("JShShIR (PINFL) 14 ta raqamdan iborat bo'lishi shart!", "danger");
        return;
      }

      try {
        const response = await request('/debts', 'POST', payload);
        showToast(response.message || "Nasiya muvaffaqiyatli qo'shildi!", "success");
        addDebtModal.style.display = 'none';
        loadDebts();
      } catch (err) {
        showToast(err.message || "Xatolik yuz berdi", "danger");
      }
    });
  }
});

async function openRepayModal(debtId) {
  const debt = allDebts.find(d => d.id === debtId);
  if (!debt) return;

  document.getElementById('repay-debt-id').value = debtId;
  document.getElementById('repay-customer-name').innerText = debt.customer_name;
  document.getElementById('repay-customer-phone').innerText = debt.customer_phone;
  document.getElementById('repay-total-amount').innerText = `$${debt.total_amount.toFixed(2)}`;
  document.getElementById('repay-remaining-amount').innerText = `$${debt.remaining_amount.toFixed(2)}`;
  
  const amountInput = document.getElementById('repay-amount-input');
  if (amountInput) {
    amountInput.value = debt.remaining_amount.toFixed(2);
    amountInput.max = debt.remaining_amount;
  }

  const form = document.getElementById('repay-form');
  if (debt.status === 'paid') {
    if (form) form.style.display = 'none';
  } else {
    if (form) form.style.display = 'block';
  }

  // Reset Payment Method UI elements
  const repayMethodSelect = document.getElementById('repay-method-input');
  const qrContainer = document.getElementById('repay-click-qr-container');
  const submitBtn = document.getElementById('repay-submit-btn');
  if (repayMethodSelect) repayMethodSelect.value = 'cash';
  if (qrContainer) qrContainer.style.display = 'none';
  if (submitBtn) submitBtn.style.display = 'block';

  // Dynamic Installment Schedule Builder
  const scheduleBody = document.getElementById('repay-schedule-body');
  if (scheduleBody) {
    if (!debt.installment_months) {
      scheduleBody.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);text-align:center;padding:10px;">Muddatli to\'lov jadvali mavjud emas.</div>';
    } else {
      const months = debt.installment_months;
      const monthlyPay = debt.monthly_payment || (debt.total_amount / months);
      const downPayment = Math.max(0, debt.total_amount - (monthlyPay * months));
      
      let scheduleHtml = '';
      let cumulativeExpected = downPayment;
      const creationDate = new Date(debt.created_at);
      
      for (let i = 1; i <= months; i++) {
        cumulativeExpected += monthlyPay;
        const dueDate = new Date(creationDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dueDateStr = dueDate.toLocaleDateString('uz-UZ');
        
        let statusText = '';
        let statusStyle = '';
        if (debt.paid_amount >= cumulativeExpected - 0.01) { // Floating point safety margin
          statusText = 'To\'langan';
          statusStyle = 'background: rgba(16,185,129,0.15); color: #10b981;';
        } else {
          const isOverdue = dueDate < new Date();
          if (isOverdue) {
            statusText = 'Muddati o\'tgan';
            statusStyle = 'background: rgba(239,68,68,0.15); color: #ef4444;';
          } else {
            statusText = 'Kutilmoqda';
            statusStyle = 'background: rgba(245,158,11,0.15); color: #f59e0b;';
          }
        }
        
        scheduleHtml += `
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:6px 12px;border-radius:8px;font-size:12px;margin-bottom:4px;">
            <div>
              <span style="font-weight:600;color:#ffffff;">${i}-oy:</span>
              <span style="color:var(--color-text-secondary);margin-left:5px;">Sana: ${dueDateStr}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-weight:600;color:var(--accent);">$${monthlyPay.toFixed(2)}</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;${statusStyle}">${statusText}</span>
            </div>
          </div>
        `;
      }
      scheduleBody.innerHTML = scheduleHtml;
    }
  }

  // QR Generation helper callback
  function updateRepayMethodUI() {
    if (repayMethodSelect.value === 'click') {
      qrContainer.style.display = 'flex';
      submitBtn.style.display = 'none';
      
      const amount = parseFloat(amountInput.value) || 0;
      if (amount <= 0) return;
      
      const config = currentSettings.click_config || {};
      const merchantId = config.merchant_id || '';
      const serviceId = config.service_id || '';
      const transParam = 'debt_repay_' + debtId;
      
      activeClickTransactionParam = transParam;
      
      const paymentUrl = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount.toFixed(2)}&transaction_param=${transParam}`;
      document.getElementById('repay-click-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(paymentUrl)}`;
    } else {
      qrContainer.style.display = 'none';
      submitBtn.style.display = 'block';
    }
  }

  if (repayMethodSelect) {
    repayMethodSelect.onchange = updateRepayMethodUI;
  }
  if (amountInput) {
    amountInput.oninput = () => {
      if (repayMethodSelect && repayMethodSelect.value === 'click') {
        updateRepayMethodUI();
      }
    };
  }

  // Clear previous repayments history log
  const tbody = document.getElementById('repay-history-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Yuklanmoqda...</td></tr>';

  // Open modal
  const modal = document.getElementById('repay-modal');
  if (modal) modal.style.display = 'flex';

  // Load payment log
  try {
    const payments = await request(`/debts/${debtId}/payments`, 'GET');
    if (tbody) {
      if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--color-text-secondary);">Hozircha to\'lovlar yo\'q</td></tr>';
      } else {
        tbody.innerHTML = payments.map(p => {
          const date = new Date(p.created_at).toLocaleString();
          let type = 'Naqd';
          if (p.payment_method === 'click') type = 'Click';
          else if (p.payment_method === 'card') type = 'Karta';
          
          return `
            <tr>
              <td><code>${date}</code></td>
              <td style="color:#10b981;font-weight:600;">$${p.amount.toFixed(2)}</td>
              <td>${type}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--color-danger);">Yuklashda xatolik</td></tr>';
  }
}

async function handleRepaySubmit(e) {
  e.preventDefault();
  const debtId = document.getElementById('repay-debt-id').value;
  const amount = parseFloat(document.getElementById('repay-amount-input').value) || 0;
  const method = document.getElementById('repay-method-input').value;

  if (amount <= 0) {
    showToast('To\'lov summasi 0 dan katta bo\'lishi kerak', 'danger');
    return;
  }

  try {
    const res = await request(`/debts/${debtId}/repay`, 'POST', {
      amount: amount,
      payment_method: method
    });
     showToast(res.message);
    document.getElementById('repay-modal').style.display = 'none';
    loadDebts();
    loadInstallments();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

// Attach openRepayModal to window context so inline onclick attribute works
window.openRepayModal = openRepayModal;
window.loadDebts = loadDebts;

async function printDebtContract(debtId) {
  let debt = allDebts.find(d => d.id === debtId);
  if (!debt) {
    try {
      showToast('Nasiya ma\'lumotlari yuklanmoqda...', 'info');
      debt = await request(`/debts/${debtId}`, 'GET');
    } catch (err) {
      showToast('Nasiya ma\'lumotlarini yuklashda xatolik: ' + err.message, 'danger');
      return;
    }
  }

  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (!printWindow) {
    showToast('Oynani ochish bloklandi. Iltimos, brauzeringizda pop-up oynalarga ruxsat bering', 'danger');
    return;
  }

  const dueDateStr = debt.due_date ? new Date(debt.due_date).toLocaleDateString('uz-UZ') : 'Kiritilmagan';
  const createdDateStr = new Date(debt.created_at).toLocaleDateString('uz-UZ');

  const html = `
<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <title>Nasiya Savdo Shartnomasi - ${debt.customer_name}</title>
    <style>
        body { font-family: 'Times New Roman', Times, serif; color: #000; background: #fff; padding: 30px; line-height: 1.6; font-size: 14px; }
        .header { text-align: center; margin-bottom: 25px; border-bottom: 2px double #000; padding-bottom: 10px; }
        .header h2 { margin: 0 0 5px 0; font-size: 20px; text-transform: uppercase; font-weight: bold; }
        .header p { margin: 0; font-size: 13px; font-style: italic; }
        .details-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .details-table th, .details-table td { border: 1px solid #000; padding: 10px; text-align: left; }
        .details-table th { background-color: #f5f5f5; font-weight: bold; width: 35%; }
        .section-title { font-weight: bold; margin-top: 20px; font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; }
        .footer-signatures { display: flex; justify-content: space-between; margin-top: 60px; }
        .signature-block { width: 45%; border-top: 1px solid #000; text-align: center; padding-top: 8px; font-weight: bold; }
        @media print {
            body { padding: 0; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>NASIYA SAVDO VA SHARTNOMA KELISHUVI</h2>
        <p>Shartnoma raqami: NS-${debtId.substring(0, 8).toUpperCase()} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Tuzilgan sana: ${createdDateStr}</p>
    </div>
    
    <p>Ushbu shartnoma bir tomondan <strong>"${debt.branch_name}" do'koni</strong> (keyingi o'rinlarda "Sotuvchi" deb yuritiladi) va ikkinchi tomondan fuqaro <strong>"${debt.customer_name}"</strong> (keyingi o'rinlarda "Sotib oluvchi" deb yuritiladi) o'rtasida o'zaro kelishuv va O'zbekiston Respublikasi Fuqarolik Kodeksi talablari asosida quyidagi shartlar bo'yicha yuridik kuchga ega shartnoma ko'rinishida tuzildi:</p>
    
    <div class="section-title">1. SHARTNOMA PREDMETI</div>
    <p>1.1. Sotuvchi o'ziga tegishli bo'lgan muddatli to'lov sharti bilan sotilayotgan quyidagi qurilmani topshiradi, Sotib oluvchi esa qabul qilib oladi va belgilangan muddatda to'lovlarni amalga oshirish majburiyatini oladi.</p>
    
    <table class="details-table">
        <tr>
            <th>Sotib olingan qurilma (Model)</th>
            <td><strong>${debt.product_name}</strong></td>
        </tr>
        <tr>
            <th>Do'kon / Filial nomi</th>
            <td>${debt.branch_name}</td>
        </tr>
        <tr>
            <th>Rasmiylashtirgan xodim</th>
            <td>${debt.cashier_name}</td>
        </tr>
    </table>

    <div class="section-title">2. QARZDORLIK QIYMATI VA TO'LOV JADVALI</div>
    <table class="details-table">
        <tr>
            <th>Qurilmaning umumiy qiymati:</th>
            <td>$${debt.total_amount.toFixed(2)}</td>
        </tr>
        <tr>
            <th>Boshlang'ich to'langan summa (Down payment):</th>
            <td>$${debt.paid_amount.toFixed(2)}</td>
        </tr>
        <tr>
            <th>Qoldiq qarz summasi:</th>
            <td><strong>$${debt.remaining_amount.toFixed(2)}</strong></td>
        </tr>
        ${debt.installment_months ? `
        <tr>
            <th>Bo'lib to'lash muddati:</th>
            <td><strong>${debt.installment_months} oy</strong></td>
        </tr>
        <tr>
            <th>Har oylik to'lov summasi:</th>
            <td><strong>$${debt.monthly_payment.toFixed(2)}</strong></td>
        </tr>
        ` : ''}
        <tr>
            <th>Qarzni uzishning oxirgi muddati:</th>
            <td><strong>${dueDateStr}</strong></td>
        </tr>
    </table>
    <p>2.1. Sotib oluvchi qoldiq qarz summasini to'lov muddatidan oshirmasdan to'liq to'lashi shart. To'lovlar qisman yoki bir yo'la amalga oshirilishi mumkin.</p>

    <div class="section-title">3. TARAFLARNING MAJBURIYATLARI VA QONUNIY JAVOBGARLIGI</div>
    <p>3.1. **Sotib oluvchining majburiyatlari:**</p>
    <p>- Sotib olingan qurilma qiymatini shartnomaning 2-bo'limida belgilangan muddatda to'liq qoplash.</p>
    <p>- Nasiya qarz to'liq yopilmagunga qadar ushbu smartfon qurilmasini uchinchi shaxslarga sotish, garovga qo'yish yoki hadya qilish qat'iyan taqiqlanadi.</p>
    <p>- Telefon raqami, pasport ma'lumotlari yoki yashash manzili o'zgarganda darhol Sotuvchini xabardor qilish.</p>
    <p>3.2. **Sotuvchining huquqlari:**</p>
    <p>- To'lov belgilangan muddatdan kechiktirilgan taqdirda, Sotuvchi har bir kechiktirilgan kun uchun qoldiq summaning 0.5% miqdorida penya (jarima) undirish huquqiga ega.</p>
    <p>- To'lov asossiz ravishda kechiktirilsa va to'lashdan bosh tortilsa, ushbu shartnoma yuridik kuchga ega hujjat sifatida sud organlariga va O'zbekiston Respublikasi sud ijrochilariga taqdim etiladi va qarz majburiy undiruvga qaratiladi.</p>

    <div class="section-title">4. TARAFLARNING YURIDIK MA'LUMOTLARI VA IMZOLARI</div>
    <table class="details-table" style="font-size: 13px;">
        <tr>
            <th style="width: 50%;">SOTUVCHI (Do'kon)</th>
            <th style="width: 50%;">SOTIB OLUVCHI (Fuqaro)</th>
        </tr>
        <tr>
            <td style="vertical-align: top;">
                <strong>Nomi:</strong> ${debt.branch_name}<br>
                <strong>Vakil:</strong> ${debt.cashier_name}<br>
                <strong>Manzil:</strong> Toshkent shahar
            </td>
            <td style="vertical-align: top;">
                <strong>F.I.Sh:</strong> ${debt.customer_name}<br>
                <strong>Telefon:</strong> ${debt.customer_phone}<br>
                <strong>Pasport seriya / raqam:</strong> <strong>${debt.passport_series_number || 'Kiritilmagan'}</strong><br>
                <strong>JShShIR (PINFL):</strong> <code>${debt.passport_pinfl || 'Kiritilmagan'}</code><br>
                <strong>Yashash manzili:</strong> ${debt.customer_address || 'Kiritilmagan'}
            </td>
        </tr>
    </table>

    <div class="footer-signatures">
        <div class="signature-block">
            Sotuvchi (Vakil) imzosi
        </div>
        <div class="signature-block">
            Sotib oluvchi (Mijoz) imzosi
        </div>
    </div>
    
    <div style="margin-top: 40px; text-align: center;" class="no-print">
        <button onclick="window.print()" style="padding: 12px 24px; font-size: 14px; font-weight: bold; background: #f59e0b; color: #fff; border: none; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 10px rgba(245,158,11,0.3);"><i class="fas fa-print"></i> Shartnomani Chop Etish (Print)</button>
    </div>
</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

window.printDebtContract = printDebtContract;

async function previewDebtContract(debtId) {
  let debt = allDebts.find(d => d.id === debtId);
  if (!debt) {
    try {
      showToast('Nasiya ma\'lumotlari yuklanmoqda...', 'info');
      debt = await request(`/debts/${debtId}`, 'GET');
    } catch (err) {
      showToast('Nasiya ma\'lumotlarini yuklashda xatolik: ' + err.message, 'danger');
      return;
    }
  }

  const dueDateStr = debt.due_date ? new Date(debt.due_date).toLocaleDateString('uz-UZ') : 'Kiritilmagan';
  const createdDateStr = new Date(debt.created_at).toLocaleDateString('uz-UZ');

  // Build the clean legal contract HTML
  const html = `
    <div style="font-family: 'Times New Roman', Times, serif; color: #000000; background: #ffffff; line-height: 1.6; font-size: 14px; padding: 10px; max-width: 700px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px double #000; padding-bottom: 10px;">
        <h2 style="margin: 0 0 5px 0; font-size: 20px; text-transform: uppercase; font-weight: bold; color: #000;">NASIYA SAVDO VA SHARTNOMA KELISHUVI</h2>
        <p style="margin: 0; font-size: 13px; font-style: italic; color: #333;">Shartnoma raqami: NS-${debtId.substring(0, 8).toUpperCase()} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Tuzilgan sana: ${createdDateStr}</p>
      </div>
      
      <p style="color: #111;">Ushbu shartnoma bir tomondan <strong>"${debt.branch_name}" do'koni</strong> (Sotuvchi) va ikkinchi tomondan fuqaro <strong>"${debt.customer_name}"</strong> (Sotib oluvchi) o'rtasida o'zaro kelishuv va O'zbekiston Respublikasi Fuqarolik Kodeksi talablari asosida quyidagi shartlar bo'yicha yuridik kuchga ega shartnoma ko'rinishida tuzildi:</p>
      
      <div style="font-weight: bold; margin-top: 20px; font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; color: #000;">1. SHARTNOMA PREDMETI</div>
      <p style="color: #111;">1.1. Sotuvchi o'ziga tegishli bo'lgan muddatli to'lov sharti bilan sotilayotgan quyidagi qurilmani topshiradi, Sotib oluvchi esa qabul qilib oladi va belgilangan muddatda to'lovlarni amalga oshirish majburiyatini oladi.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; width: 35%; color: #000;">Sotib olingan qurilma (Model)</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;"><strong>${debt.product_name}</strong></td>
          </tr>
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; color: #000;">Soni (Quantity)</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;">${debt.quantity || 1} ta</td>
          </tr>
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; color: #000;">Do'kon / Filial nomi</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;">${debt.branch_name}</td>
          </tr>
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; color: #000;">Rasmiylashtirgan xodim</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;">${debt.cashier_name}</td>
          </tr>
      </table>

      <div style="font-weight: bold; margin-top: 20px; font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; color: #000;">2. QARZDORLIK QIYMATI VA TO'LOV JADVALI</div>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; width: 35%; color: #000;">Qurilmaning umumiy qiymati:</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;">$${debt.total_amount.toFixed(2)}</td>
          </tr>
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; color: #000;">Boshlang'ich to'langan summa:</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;">$${debt.paid_amount.toFixed(2)}</td>
          </tr>
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; color: #000;">Qoldiq qarz summasi:</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;"><strong>$${debt.remaining_amount.toFixed(2)}</strong></td>
          </tr>
          ${debt.installment_months ? `
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; color: #000;">Bo'lib to'lash muddati:</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;"><strong>${debt.installment_months} oy</strong></td>
          </tr>
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; color: #000;">Har oylik to'lov summasi:</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;"><strong>$${debt.monthly_payment.toFixed(2)}</strong></td>
          </tr>
          ` : ''}
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; color: #000;">Qarzni uzishning oxirgi muddati:</th>
              <td style="border: 1px solid #000; padding: 10px; text-align: left; color: #000;"><strong>${dueDateStr}</strong></td>
          </tr>
      </table>
      <p style="color: #111;">2.1. Sotib oluvchi qoldiq qarz summasini to'lov muddatidan oshirmasdan to'liq to'lashi shart. To'lovlar qisman yoki bir yo'la amalga oshirilishi mumkin.</p>

      <div style="font-weight: bold; margin-top: 20px; font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; color: #000;">3. TARAFLARNING MAJBURIYATLARI VA QONUNIY JAVOBGARLIGI</div>
      <p style="color: #111;">3.1. <strong>Sotib oluvchining majburiyatlari:</strong></p>
      <p style="color: #111;">- Sotib olingan qurilma qiymatini shartnomaning 2-bo'limida belgilangan muddatda to'liq qoplash.</p>
      <p style="color: #111;">- Nasiya qarz to'liq yopilmagunga qadar ushbu smartfon qurilmasini uchinchi shaxslarga sotish, garovga qo'yish yoki hadya qilish qat'iyan taqiqlanadi.</p>
      <p style="color: #111;">- Telefon raqami, pasport ma'lumotlari yoki yashash manzili o'zgarganda darhol Sotuvchini xabardor qilish.</p>
      <p style="color: #111;">3.2. <strong>Sotuvchining huquqlari:</strong></p>
      <p style="color: #111;">- To'lov belgilangan muddatdan kechiktirilgan taqdirda, Sotuvchi har bir kechiktirilgan kun uchun qoldiq summaning 0.5% miqdorida penya (jarima) undirish huquqiga ega.</p>
      <p style="color: #111;">- To'lov asossiz ravishda kechiktirilsa va to'lashdan bosh tortilsa, ushbu shartnoma yuridik kuchga ega hujjat sifatida sud organlariga va O'zbekiston Respublikasi sud ijrochilariga taqdim etiladi va qarz majburiy undiruvga qaratiladi.</p>

      <div style="font-weight: bold; margin-top: 20px; font-size: 15px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; color: #000;">4. TARAFLARNING YURIDIK MA'LUMOTLARI VA IMZOLARI</div>
      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px;">
          <tr>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; width: 50%; color: #000;">SOTUVCHI (Do'kon)</th>
              <th style="border: 1px solid #000; padding: 10px; text-align: left; background-color: #f5f5f5; font-weight: bold; width: 50%; color: #000;">SOTIB OLUVCHI (Fuqaro)</th>
          </tr>
          <tr>
              <td style="border: 1px solid #000; padding: 10px; vertical-align: top; color: #000;">
                  <strong>Nomi:</strong> ${debt.branch_name}<br>
                  <strong>Vakil:</strong> ${debt.cashier_name}<br>
                  <strong>Manzil:</strong> Toshkent shahar
              </td>
              <td style="border: 1px solid #000; padding: 10px; vertical-align: top; color: #000;">
                  <strong>F.I.Sh:</strong> ${debt.customer_name}<br>
                  <strong>Telefon:</strong> ${debt.customer_phone}<br>
                  <strong>Pasport seriya / raqam:</strong> <strong>${debt.passport_series_number || 'Kiritilmagan'}</strong><br>
                  <strong>JShShIR (PINFL):</strong> <code>${debt.passport_pinfl || 'Kiritilmagan'}</code><br>
                  <strong>Yashash manzili:</strong> ${debt.customer_address || 'Kiritilmagan'}
              </td>
          </tr>
      </table>

      <div style="display: flex; justify-content: space-between; margin-top: 50px;">
          <div style="width: 45%; border-top: 1px solid #000; text-align: center; padding-top: 8px; font-weight: bold; color: #000;">
              Sotuvchi (Vakil) imzosi
          </div>
          <div style="width: 45%; border-top: 1px solid #000; text-align: center; padding-top: 8px; font-weight: bold; color: #000;">
              Sotib oluvchi (Mijoz) imzosi
          </div>
      </div>
    </div>
  `;

  // Render into container
  document.getElementById('document-preview-container').innerHTML = html;

  // Bind close actions
  const closeBtnX = document.getElementById('close-document-modal-x');
  const closeBtn = document.getElementById('close-document-modal-btn');
  const modal = document.getElementById('view-document-modal');
  if (closeBtnX) closeBtnX.onclick = () => { modal.style.display = 'none'; };
  if (closeBtn)  closeBtn.onclick  = () => { modal.style.display = 'none'; };

  // Bind PDF Download Action
  const downloadBtn = document.getElementById('download-document-pdf-btn');
  if (downloadBtn) {
    downloadBtn.onclick = () => {
      // Use html2pdf bundle to download the container content as PDF
      const opt = {
        margin:       [12, 12, 12, 12],
        filename:     `shartnoma_NS-${debt.id.substring(0, 8).toUpperCase()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      showToast("PDF yuklanmoqda, iltimos kuting...", "info");
      html2pdf().set(opt).from(document.getElementById('document-preview-container')).save().then(() => {
        showToast("PDF muvaffaqiyatli yuklab olindi!", "success");
      }).catch(err => {
        showToast("PDF yuklashda xatolik: " + err.message, "danger");
      });
    };
  }

  // Open modal view
  if (modal) modal.style.display = 'flex';
}

window.previewDebtContract = previewDebtContract;

async function approveDebt(debtId) {
  if (!confirm("Ushbu nasiya qarz shartnomasini tasdiqlashni xohlaysizmi?")) return;
  try {
    const res = await request(`/debts/${debtId}/approve`, 'POST');
    showToast(res.message || "Nasiya muvaffaqiyatli tasdiqlandi", "success");
    loadDebts();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

async function rejectDebt(debtId) {
  if (!confirm("Ushbu nasiya qarz shartnomasini rad etishni xohlaysizmi?")) return;
  try {
    const res = await request(`/debts/${debtId}/reject`, 'POST');
    showToast(res.message || "Nasiya muvaffaqiyatli rad etildi", "success");
    loadDebts();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

window.approveDebt = approveDebt;
window.rejectDebt = rejectDebt;

/**
 * Installments Module: Monthly Repayments & Schedules
 */
let allInstallments = [];

async function loadInstallments() {
  try {
    const debts = await request('/debts?status=pending', 'GET');
    const flatList = [];
    const now = new Date();
    
    debts.forEach(d => {
      const months = d.installment_months || 1;
      const monthlyPay = d.monthly_payment || (d.total_amount / months);
      const creationDate = new Date(d.created_at);
      
      const totalInstallmentsAmount = monthlyPay * months;
      const downPayment = Math.max(0, d.total_amount - totalInstallmentsAmount);
      
      let runningPaid = Math.max(0, d.paid_amount - downPayment);
      
      for (let m = 1; m <= months; m++) {
        const monthDueDate = new Date(creationDate);
        monthDueDate.setMonth(monthDueDate.getMonth() + m);
        
        let monthPaidAmount = 0;
        if (runningPaid >= monthlyPay) {
          monthPaidAmount = monthlyPay;
          runningPaid -= monthlyPay;
        } else if (runningPaid > 0) {
          monthPaidAmount = runningPaid;
          runningPaid = 0;
        }
        
        const remainingForMonth = monthlyPay - monthPaidAmount;
        let monthStatus = 'pending';
        
        if (remainingForMonth <= 0.01) {
          monthStatus = 'paid';
        } else if (monthDueDate < now) {
          monthStatus = 'overdue';
        } else {
          monthStatus = 'upcoming';
        }
        
        flatList.push({
          debt_id: d.id,
          customer_name: d.customer_name,
          customer_phone: d.customer_phone,
          product_name: d.product_name,
          branch_name: d.branch_name || 'Noma\'lum',
          cashier_name: d.cashier_name || 'Noma\'lum',
          month_number: m,
          total_months: months,
          due_date: monthDueDate.toISOString().split('T')[0],
          monthly_amount: monthlyPay,
          paid_amount: monthPaidAmount,
          remaining_amount: remainingForMonth,
          status: monthStatus
        });
      }
    });
    
    allInstallments = flatList;
    renderInstallmentsTable();
  } catch (e) {
    showToast(e.message, 'danger');
  }
}

function renderInstallmentsTable() {
  const searchInputEl = document.getElementById('installment-search');
  const searchQuery = searchInputEl ? searchInputEl.value.toLowerCase().trim() : '';
  const filterStatus = document.getElementById('installment-status-filter').value;
  const tbody = document.getElementById('installments-table-body');
  if (!tbody) return;
  
  let filtered = allInstallments.filter(inst => {
    return inst.customer_name.toLowerCase().includes(searchQuery) ||
           inst.customer_phone.toLowerCase().includes(searchQuery) ||
           inst.product_name.toLowerCase().includes(searchQuery);
  });
  
  if (filterStatus === 'overdue') {
    filtered = filtered.filter(inst => inst.status === 'overdue');
  } else if (filterStatus === 'upcoming') {
    filtered = filtered.filter(inst => inst.status === 'upcoming');
  } else if (filterStatus === 'paid') {
    filtered = filtered.filter(inst => inst.status === 'paid');
  }
  
  const totalCount = allInstallments.length;
  const overdueCount = allInstallments.filter(inst => inst.status === 'overdue').length;
  const upcomingCount = allInstallments.filter(inst => inst.status === 'upcoming').length;
  
  const totalEl = document.getElementById('installments-summary-total');
  const overdueEl = document.getElementById('installments-summary-overdue');
  const upcomingEl = document.getElementById('installments-summary-upcoming');
  
  if (totalEl) totalEl.innerText = totalCount;
  if (overdueEl) overdueEl.innerText = overdueCount;
  if (upcomingEl) upcomingEl.innerText = upcomingCount;
  
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--color-text-secondary);">Oylik to'lovlar topilmadi.</td></tr>`;
    return;
  }
  
  tbody.innerHTML = filtered.map(inst => {
    let statusBadge = '';
    let actionBtn = '';
    
    if (inst.status === 'paid') {
      statusBadge = `<span style="font-size:11px;background:rgba(16,185,129,0.15);color:#10b981;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-check"></i> To'langan</span>`;
      actionBtn = `<button class="btn-secondary" onclick="openRepayForMonth('${inst.debt_id}', ${inst.remaining_amount})" style="padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600;"><i class="fas fa-history"></i> Tarix</button>`;
    } else if (inst.status === 'overdue') {
      statusBadge = `<span style="font-size:11px;background:rgba(239,68,68,0.15);color:#ef4444;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-exclamation-circle"></i> Muddati o'tgan</span>`;
      actionBtn = `<button class="btn-primary" onclick="openRepayForMonth('${inst.debt_id}', ${inst.remaining_amount})" style="background:#ef4444; border:none; padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600;"><i class="fas fa-hand-holding-usd"></i> To'lash</button>`;
    } else {
      statusBadge = `<span style="font-size:11px;background:rgba(245,158,11,0.15);color:#f59e0b;padding:4px 8px;border-radius:6px;font-weight:600;"><i class="fas fa-hourglass-half"></i> Kutilmoqda</span>`;
      actionBtn = `<button class="btn-primary" onclick="openRepayForMonth('${inst.debt_id}', ${inst.remaining_amount})" style="background:#f59e0b; border:none; padding:6px 12px; font-size:12px; border-radius:6px; font-weight:600;"><i class="fas fa-hand-holding-usd"></i> To'lash</button>`;
    }
    
    return `
      <tr>
        <td>
          <div style="font-weight:600;color:#ffffff;">${inst.customer_name}</div>
          <div style="font-size:11px;color:var(--color-text-secondary);">${inst.customer_phone}</div>
        </td>
        <td>
          <div style="font-weight:600;color:#ffffff;">${inst.product_name}</div>
          <div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;"><i class="fas fa-store" style="color:var(--accent);margin-right:4px;"></i>${inst.branch_name}</div>
        </td>
        <td style="font-weight:600;">${inst.month_number} - oy / ${inst.total_months}</td>
        <td><code>${inst.due_date}</code></td>
        <td style="font-weight:600;">$${inst.monthly_amount.toFixed(2)}</td>
        <td style="color:#10b981;">$${inst.paid_amount.toFixed(2)}</td>
        <td style="color:#ef4444;font-weight:600;">$${inst.remaining_amount.toFixed(2)}</td>
        <td>${statusBadge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

async function openRepayForMonth(debtId, monthlyAmount) {
  let debt = allDebts.find(d => d.id === debtId);
  if (!debt) {
    try {
      debt = await request(`/debts/${debtId}`, 'GET');
    } catch (e) {
      showToast('Nasiya ma\'lumotlarini yuklab bo\'lmadi: ' + e.message, 'danger');
      return;
    }
  }
  
  document.getElementById('repay-debt-id').value = debtId;
  document.getElementById('repay-customer-name').innerText = debt.customer_name;
  document.getElementById('repay-customer-phone').innerText = debt.customer_phone;
  document.getElementById('repay-total-amount').innerText = `$${debt.total_amount.toFixed(2)}`;
  document.getElementById('repay-remaining-amount').innerText = `$${debt.remaining_amount.toFixed(2)}`;
  
  const amountInput = document.getElementById('repay-amount-input');
  if (amountInput) {
    amountInput.value = monthlyAmount.toFixed(2);
    amountInput.max = debt.remaining_amount;
  }
  
  const form = document.getElementById('repay-form');
  if (debt.status === 'paid') {
    if (form) form.style.display = 'none';
  } else {
    if (form) form.style.display = 'block';
  }
  
  const repayMethodSelect = document.getElementById('repay-method-input');
  const qrContainer = document.getElementById('repay-click-qr-container');
  const submitBtn = document.getElementById('repay-submit-btn');
  if (repayMethodSelect) repayMethodSelect.value = 'cash';
  if (qrContainer) qrContainer.style.display = 'none';
  if (submitBtn) submitBtn.style.display = 'block';
  
  const scheduleBody = document.getElementById('repay-schedule-body');
  if (scheduleBody) {
    if (!debt.installment_months) {
      scheduleBody.innerHTML = '<div style="font-size:12px;color:var(--color-text-secondary);text-align:center;padding:10px;">Muddatli to\'lov jadvali mavjud emas.</div>';
    } else {
      const months = debt.installment_months;
      const monthlyPay = debt.monthly_payment || (debt.total_amount / months);
      const downPayment = Math.max(0, debt.total_amount - (monthlyPay * months));
      
      let scheduleHtml = '';
      let cumulativeExpected = downPayment;
      const creationDate = new Date(debt.created_at);
      
      for (let i = 1; i <= months; i++) {
        cumulativeExpected += monthlyPay;
        const dueDate = new Date(creationDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dueDateStr = dueDate.toLocaleDateString('uz-UZ');
        
        let statusText = '';
        let statusStyle = '';
        if (debt.paid_amount >= cumulativeExpected - 0.01) {
          statusText = 'To\'langan';
          statusStyle = 'background: rgba(16,185,129,0.15); color: #10b981;';
        } else {
          const isOverdue = dueDate < new Date();
          if (isOverdue) {
            statusText = 'Muddati o\'tgan';
            statusStyle = 'background: rgba(239,68,68,0.15); color: #ef4444;';
          } else {
            statusText = 'Kutilmoqda';
            statusStyle = 'background: rgba(245,158,11,0.15); color: #f59e0b;';
          }
        }
        
        scheduleHtml += `
          <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.02);padding:6px 12px;border-radius:8px;font-size:12px;margin-bottom:4px;">
            <div>
              <span style="font-weight:600;color:#ffffff;">${i}-oy:</span>
              <span style="color:var(--color-text-secondary);margin-left:5px;">Sana: ${dueDateStr}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-weight:600;color:var(--accent);">$${monthlyPay.toFixed(2)}</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:4px;font-weight:600;${statusStyle}">${statusText}</span>
            </div>
          </div>
        `;
      }
      scheduleBody.innerHTML = scheduleHtml;
    }
  }
  
  const repayModal = document.getElementById('repay-modal');
  if (repayModal) repayModal.style.display = 'block';
}

window.loadInstallments = loadInstallments;
window.renderInstallmentsTable = renderInstallmentsTable;
window.openRepayForMonth = openRepayForMonth;


