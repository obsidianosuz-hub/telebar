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

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('main-shell').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('pin-pad-container').style.display = 'none';
}

/**
 * Handle Login Step 1: Email and Password
 */
async function handleLoginFormSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

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
    if (email === 'admin@gmail.com' && password === 'admin123') {
      setToken('mock-admin-token');
      currentUser = { id: 'mock-admin-id', name: 'Admin Demo', email: 'admin@gmail.com', role: 'admin' };
      
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
    
    if (user.role === 'cashier') {
      document.getElementById('nav-dash').style.display = 'none';
      document.getElementById('nav-wh').style.display = 'block';
      document.getElementById('nav-staff-tab').style.display = 'none';
      document.getElementById('nav-branches-tab').style.display = 'none';
      document.getElementById('nav-click-tab').style.display = 'none';
      document.getElementById('nav-activities-tab').style.display = 'none';
      document.getElementById('nav-set').style.display = 'none';
      document.getElementById('open-add-product-modal').style.display = 'none';
      
      const actionsHeader = document.getElementById('wh-actions-header');
      if (actionsHeader) actionsHeader.style.display = 'none';
      const purchaseHeader = document.getElementById('wh-purchase-header');
      if (purchaseHeader) purchaseHeader.style.display = 'none';
      
      switchTab('pos');
    } else {
      document.getElementById('nav-dash').style.display = 'block';
      document.getElementById('nav-wh').style.display = 'block';
      document.getElementById('nav-staff-tab').style.display = 'block';
      document.getElementById('nav-branches-tab').style.display = 'block';
      document.getElementById('nav-click-tab').style.display = 'block';
      document.getElementById('nav-activities-tab').style.display = 'block';
      document.getElementById('nav-set').style.display = 'block';
      document.getElementById('open-add-product-modal').style.display = 'block';
      
      const actionsHeader = document.getElementById('wh-actions-header');
      if (actionsHeader) actionsHeader.style.display = 'table-cell';
      const purchaseHeader = document.getElementById('wh-purchase-header');
      if (purchaseHeader) purchaseHeader.style.display = 'table-cell';
      
      switchTab('dashboard');
    }
  }

  applyTranslations();

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
    showToast(`${data.user_name} navbatchilikni boshladi.`, 'success');
    appendShiftTransitionLog(data, 'started');
    if (currentView === 'dashboard') loadDashboardData();
  }
  
  else if (event === 'shift:completed') {
    showToast(`${data.user_name} navbatchiligini yakunladi. Tushum: $${data.revenue}`, 'success');
    appendShiftTransitionLog(data, 'completed');
    if (currentView === 'dashboard') loadDashboardData();
  }
  
  else if (event === 'sale:created') {
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
      
      activeClickTransactionParam = '';
      completePOSCheckout();
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
  } else if (view === 'warehouse') {
    loadWarehouseProducts();
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
            <button class="cashier-selector-btn" style="width:100%; display:flex; align-items:center; gap:10px; padding:12px 16px; background:${index === 0 ? 'rgba(0, 242, 254, 0.08)' : 'rgba(255,255,255,0.02)'}; border:1px solid ${index === 0 ? 'rgba(0, 242, 254, 0.25)' : 'rgba(255,255,255,0.06)'}; border-radius:10px; color:#ffffff; font-size:13px; font-weight:600; text-align:left; cursor:pointer; transition:all 0.2s; border-style:solid;">
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
              b.style.background = 'rgba(255,255,255,0.02)';
              b.style.borderColor = 'rgba(255,255,255,0.06)';
            });
            btn.style.background = 'rgba(0, 242, 254, 0.08)';
            btn.style.borderColor = 'rgba(0, 242, 254, 0.25)';
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
          salesTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-secondary);" data-i18n="dash_no_sales">Hozircha sotuvlar amalga oshirilmagan</td></tr>`;
        } else {
          salesTbody.innerHTML = salesHistory.map(sale => `
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
              <td style="font-size:12px;color:var(--color-text-secondary);">${new Date(sale.time).toLocaleString()}</td>
            </tr>
          `).join('');
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
        <div class="product-card" data-id="${p.id}" style="display: flex; flex-direction: column; min-height: 220px; justify-content: space-between;">
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
            ${p.quantity === 0 
              ? `<span style="font-size:10px;background:rgba(239,68,68,0.1);color:#ef4444;padding:2px 6px;border-radius:4px;font-weight:600;">Tugagan</span>`
              : p.quantity < 5 
                ? `<span style="font-size:10px;background:rgba(245,158,11,0.1);color:#f59e0b;padding:2px 6px;border-radius:4px;font-weight:600;">Kam (${p.quantity} ta)</span>`
                : `<span style="font-size:10px;background:rgba(16,185,129,0.1);color:#10b981;padding:2px 6px;border-radius:4px;font-weight:600;">Sotuvda (${p.quantity} ta)</span>`
            }
          </div>
        </div>
      `;
    }).join('');

    // Attach click events
    container.querySelectorAll('.product-card').forEach(card => {
      card.addEventListener('click', () => {
        const prodId = card.getAttribute('data-id');
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

    let html = '';
    Object.keys(groups).forEach(branchName => {
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
    document.getElementById('staff-id').value = staff.id;
    document.getElementById('staff-name').value = staff.name;
    document.getElementById('staff-email').value = staff.email;
    document.getElementById('staff-email').disabled = true; // Email locks
    document.getElementById('staff-password').value = '';
    document.getElementById('staff-password').placeholder = 'Uzgartirmaslik uchun bo\'sh qoldiring';
    document.getElementById('staff-pin').value = '';
    document.getElementById('staff-pin').placeholder = 'Uzgartirmaslik uchun bo\'sh qoldiring';
    document.getElementById('staff-wage').value = staff.wage_structure;

    const select = document.getElementById('staff-branch-id');
    if (select) select.value = staff.branch_id || '';
  } else {
    title.setAttribute('data-i18n', 'modal_add_staff');
    form.reset();
    document.getElementById('staff-id').value = '';
    document.getElementById('staff-email').disabled = false;
    document.getElementById('staff-password').placeholder = 'Tizim paroli';
    document.getElementById('staff-pin').placeholder = '4 xonali PIN';
  }
  applyTranslations();
}

async function handleSaveStaff() {
  const id = document.getElementById('staff-id').value;
  const email = document.getElementById('staff-email').value.trim();
  
  if (!email.toLowerCase().endsWith('@gmail.com')) {
    showToast("E-pochta manzili faqat @gmail.com bo'lishi shart!", "danger");
    return;
  }

  const payload = {
    name: document.getElementById('staff-name').value,
    email: email,
    wage_structure: parseFloat(document.getElementById('staff-wage').value),
    branch_id: document.getElementById('staff-branch-id').value || null
  };

  const pass = document.getElementById('staff-password').value;
  const pin = document.getElementById('staff-pin').value;

  if (pass) payload.password = pass;
  if (pin) payload.pin_code = pin;

  try {
    let res;
    if (id) {
      res = await request(`/auth/staff/${id}`, 'PUT', payload);
    } else {
      payload.pin_code = pin; // required for registering
      payload.password = pass;
      res = await request('/auth/staff', 'POST', payload);
    }
    showToast(res.message);
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
  // Login Form
  document.getElementById('login-form').addEventListener('submit', handleLoginFormSubmit);

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

  // POS simulated scanner
  document.getElementById('sim-scan-btn').addEventListener('click', simulateScannerLookup);
  document.getElementById('simulated-qr-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') simulateScannerLookup();
  });

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
  const clickPaySuccessBtn = document.getElementById('click-pay-success-btn');

  if (closePaySelectBtn) {
    closePaySelectBtn.addEventListener('click', () => {
      if (paySelectModal) paySelectModal.style.display = 'none';
    });
  }

  if (payCashBtn) {
    payCashBtn.addEventListener('click', () => {
      if (paySelectModal) paySelectModal.style.display = 'none';
      completePOSCheckout();
    });
  }

  if (payClickBtn) {
    payClickBtn.addEventListener('click', () => {
      if (paySelectModal) paySelectModal.style.display = 'none';
      
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

  // Settings save
  document.getElementById('save-settings-btn').addEventListener('click', handleSaveSettings);
  document.getElementById('save-click-config-btn').addEventListener('click', handleSaveClickConfig);

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



  // Cashier UI Watchdog Guard
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
      
      if (dash && dash.style.display !== 'none') dash.style.display = 'none';
      if (wh && wh.style.display !== 'block') wh.style.display = 'block';
      if (staff && staff.style.display !== 'none') staff.style.display = 'none';
      if (branches && branches.style.display !== 'none') branches.style.display = 'none';
      if (clickTab && clickTab.style.display !== 'none') clickTab.style.display = 'none';
      if (activitiesTab && activitiesTab.style.display !== 'none') activitiesTab.style.display = 'none';
      if (settings && settings.style.display !== 'none') settings.style.display = 'none';
      if (addBtn && addBtn.style.display !== 'none') addBtn.style.display = 'none';
      if (actionsHeader && actionsHeader.style.display !== 'none') actionsHeader.style.display = 'none';
      if (purchaseHeader && purchaseHeader.style.display !== 'none') purchaseHeader.style.display = 'none';
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
  if (role === 'cashier' && !id && (!pin_code || pin_code.length !== 4)) {
    showToast("Kassir uchun 4 xonali PIN kod majburiy!", "warning");
    return;
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
    
    document.getElementById('click-active').checked = !!config.active;
    document.getElementById('click-merchant-id').value = config.merchant_id || '';
    document.getElementById('click-service-id').value = config.service_id || '';
    document.getElementById('click-user-id').value = config.user_id || '';
    document.getElementById('click-secret-key').value = config.secret_key || '';
    document.getElementById('click-sandbox').checked = !!config.sandbox;
    document.getElementById('click-card-number').value = config.card_number || '';
    document.getElementById('click-card-expiry').value = config.card_expiry || '';
    document.getElementById('click-card-holder').value = config.card_holder || '';
  } catch (e) {
    showToast("Click sozlamalarini yuklashda xatolik: " + e.message, 'danger');
  }
}

async function handleSaveClickConfig() {
  const payload = {
    key: 'click_config',
    value: {
      active: document.getElementById('click-active').checked,
      merchant_id: document.getElementById('click-merchant-id').value.trim(),
      service_id: document.getElementById('click-service-id').value.trim(),
      user_id: document.getElementById('click-user-id').value.trim(),
      secret_key: document.getElementById('click-secret-key').value.trim(),
      sandbox: document.getElementById('click-sandbox').checked,
      card_number: document.getElementById('click-card-number').value.trim(),
      card_expiry: document.getElementById('click-card-expiry').value.trim(),
      card_holder: document.getElementById('click-card-holder').value.trim()
    }
  };

  try {
    const res = await request('/settings', 'POST', payload);
    if (!currentSettings) currentSettings = {};
    currentSettings.click_config = payload.value;
    showToast(res.message || "Click sozlamalari muvaffaqiyatli saqlandi");
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

