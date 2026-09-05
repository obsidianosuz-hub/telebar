import { io } from 'socket.io-client';

const isWebView = window.location.protocol === 'file:';
const defaultMode = 'online';
const SYSTEM_MODE = localStorage.getItem('telebar_system_mode') || defaultMode;

const defaultIp = '10.129.25.97';
let detectedIp = defaultIp;

if (window.location.hostname && window.location.protocol !== 'file:') {
  detectedIp = window.location.hostname;
}

// Reset stale IP in localstorage if accessing via a different active network IP
if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && window.location.protocol !== 'file:') {
  const storedIp = localStorage.getItem('telebar_server_ip');
  if (storedIp && storedIp !== window.location.hostname) {
    localStorage.setItem('telebar_server_ip', window.location.hostname);
  }
}

const SERVER_IP = localStorage.getItem('telebar_server_ip') || detectedIp;
const API_BASE_URL = `http://${SERVER_IP}:8000/api`;
const SOCKET_BASE_URL = `http://${SERVER_IP}:3001`;

let token = localStorage.getItem('telebar_token') || null;
let socket = null;

export function getToken() {
  return token;
}

export function setToken(newToken) {
  token = newToken;
  if (newToken) {
    localStorage.setItem('telebar_token', newToken);
  } else {
    localStorage.removeItem('telebar_token');
  }
}

/**
 * Standard HTTP Request handler to Laravel Backend
 */
// Force update default database imports on first run
if (!localStorage.getItem('db_imported_v2')) {
  localStorage.removeItem('mock_branches');
  localStorage.removeItem('mock_products');
  localStorage.removeItem('mock_staff');
  localStorage.setItem('db_imported_v2', 'true');
}

if (!localStorage.getItem('mock_branches')) {
  localStorage.setItem('mock_branches', JSON.stringify([
    {
      id: "a25d3da6-d4ad-476c-b607-03103e5ebf92",
      name: "Yunusobod filiali",
      address: "Toshkent shahar, Yunusobod tumani"
    },
    {
      id: "a25d3da6-dcbb-404d-9a68-4558edaa69f6",
      name: "Chilonzor filiali",
      address: "Toshkent shahar, Chilonzor tumani"
    }
  ]));
}

if (!localStorage.getItem('mock_products')) {
  localStorage.setItem('mock_products', JSON.stringify([
    {
      id: "a25d3dac-3f0c-4e35-93fb-4d54777dcae8",
      qr_code: "iph15pm-256-blue",
      model_name: "iPhone 15 Pro Max",
      specifications: { storage: "256GB", color: "Blue Titanium", ram: "8GB", size: "159.9x76.7x8.3 mm" },
      quantity: 15,
      purchase_price: 1100.00,
      retail_price: 1350.00,
      branch_id: "a25d3da6-d4ad-476c-b607-03103e5ebf92"
    },
    {
      id: "a25d3dac-41db-4e63-87b1-f585d3c7ee80",
      qr_code: "s24u-512-gray",
      model_name: "Samsung Galaxy S24 Ultra",
      specifications: { storage: "512GB", color: "Titanium Gray", ram: "12GB", size: "162.3x79.0x8.6 mm" },
      quantity: 10,
      purchase_price: 1050.00,
      retail_price: 1290.00,
      branch_id: "a25d3da6-d4ad-476c-b607-03103e5ebf92"
    },
    {
      id: "a25d3dac-44bf-438b-bd2a-75f53cd11d77",
      qr_code: "x14u-512-blk",
      model_name: "Xiaomi 14 Ultra",
      specifications: { storage: "512GB", color: "Black", ram: "16GB", size: "161.4x75.3x9.2 mm" },
      quantity: 5,
      purchase_price: 850.00,
      retail_price: 1050.00,
      branch_id: "a25d3da6-dcbb-404d-9a68-4558edaa69f6"
    },
    {
      id: "a25f9e1c-3677-4898-960d-cd72946ea4ac",
      qr_code: "TEST-1785315582",
      model_name: "iPhone 16 Pro Max",
      specifications: { ram: "8GB", storage: "512GB", color: "Titan Desert", size: "6.9" },
      quantity: 8,
      purchase_price: 1100.00,
      retail_price: 1400.00,
      branch_id: "a25d3da6-d4ad-476c-b607-03103e5ebf92"
    },
    {
      id: "a25f9e3c-d40c-47bb-8216-7e0a1cd2d7bc",
      qr_code: "TEST-1785315603",
      model_name: "iPhone 16 Pro Max",
      specifications: { ram: "8GB", storage: "512GB", color: "Titan Desert", size: "6.9" },
      quantity: 8,
      purchase_price: 1100.00,
      retail_price: 1400.00,
      branch_id: "a25d3da6-d4ad-476c-b607-03103e5ebf92"
    }
  ]));
}

if (!localStorage.getItem('mock_staff')) {
  localStorage.setItem('mock_staff', JSON.stringify([
    {
      id: "a25d3da8-77e1-4f5b-921e-1edb42fbd969",
      branch_id: "a25d3da6-d4ad-476c-b607-03103e5ebf92",
      name: "Yunusobod Kassiri",
      email: "cashier@gmail.com",
      role: "cashier",
      pin_code: "123456",
      wage_structure: 15.00,
      operational_hours: ["Dush-Jum: 08:00 - 20:00"]
    },
    {
      id: "a25d3da9-8709-41d6-9eac-431221a1d7de",
      branch_id: "a25d3da6-dcbb-404d-9a68-4558edaa69f6",
      name: "Chilonzor Kassiri",
      email: "cashier2@gmail.com",
      role: "cashier",
      pin_code: "234567",
      wage_structure: 15.00,
      operational_hours: ["Dush-Jum: 08:00 - 20:00"]
    },
    {
      id: "a25d3daa-9b7d-4c25-a6a2-84f574e999f7",
      branch_id: "a25d3da6-d4ad-476c-b607-03103e5ebf92",
      name: "Diyorbek Kassir",
      email: "diyorbek@gmail.com",
      role: "cashier",
      pin_code: "345678",
      wage_structure: 15.00,
      operational_hours: ["Dush-Jum: 08:00 - 20:00"]
    },
    {
      id: "a25d3dab-abe8-4c92-a762-ffb262a301e6",
      branch_id: "a25d3da6-dcbb-404d-9a68-4558edaa69f6",
      name: "Sardor Kassir",
      email: "sardor@gmail.com",
      role: "cashier",
      pin_code: "456789",
      wage_structure: 15.00,
      operational_hours: ["Dush-Jum: 08:00 - 20:00"]
    },
    {
      id: "a25d3dac-3ad5-4da1-8fef-ecb3a60a3cb7",
      branch_id: null,
      name: "Qurilma Skanerlovchi",
      email: "scanner@gmail.com",
      role: "scanner",
      pin_code: "999999",
      wage_structure: 0.00,
      operational_hours: ["Har kuni 24/7"]
    }
  ]));
}

if (!localStorage.getItem('mock_settings')) {
  localStorage.setItem('mock_settings', JSON.stringify({
    branding: { brand_name: "telebar", logo_url: "" },
    theme: { accent_color: "#00f2fe", preset: "glassmorphism", mode: "dark" },
    salary_rules: { hourly_rate: 15, night_shift_multiplier: 1.5 },
    shift_timings: { day_start: 8, day_end: 20, night_start: 20, night_end: 8 },
    click_config: { active: false, merchant_id: "", service_id: "", user_id: "", secret_key: "", sandbox: true }
  }));
}

if (!localStorage.getItem('mock_sales')) {
  localStorage.setItem('mock_sales', JSON.stringify([]));
}

if (!localStorage.getItem('mock_transitions')) {
  localStorage.setItem('mock_transitions', JSON.stringify([]));
}

if (!localStorage.getItem('mock_scan_requests')) {
  localStorage.setItem('mock_scan_requests', JSON.stringify([]));
}

if (!localStorage.getItem('mock_activity_logs')) {
  localStorage.setItem('mock_activity_logs', JSON.stringify([
    {
      id: 1,
      user_id: 1,
      user_name: 'Admin',
      action_type: 'system',
      description: 'Tizim muvaffaqiyatli ishga tushirildi (Demo)',
      created_at: new Date(Date.now() - 3600000).toISOString()
    }
  ]));
}

if (!localStorage.getItem('mock_partners')) {
  localStorage.setItem('mock_partners', JSON.stringify([
    {
      id: "partner-1",
      name: "Apple Global Distribution",
      contact_person: "John Doe",
      email: "supplier@apple.com",
      phone: "+1 800 123 4567",
      customs_terms: "Bojxona to'lovi: 12%, Rasmiylashtirish: 3 kun, Soliq shartlari: Standard VAT"
    },
    {
      id: "partner-2",
      name: "Samsung Logistics Asia",
      contact_person: "Park Ji-Sung",
      email: "logistics@samsung.com",
      phone: "+82 2 555 1234",
      customs_terms: "Bojxona to'lovi: 10%, Rasmiylashtirish: 2 kun, Erkin iqtisodiy zona imtiyozi"
    }
  ]));
}

if (!localStorage.getItem('mock_debts')) {
  localStorage.setItem('mock_debts', JSON.stringify([
    {
      id: "debt-1",
      customer_name: "Azizbek Karimov",
      customer_phone: "+998 90 123 45 67",
      passport_series: "AA",
      passport_number: "1234567",
      product_name: "iPhone 15 Pro Max",
      total_amount: 1350.00,
      initial_payment: 350.00,
      remaining_amount: 1000.00,
      monthly_payment: 166.67,
      period_months: 6,
      status: "active",
      created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
      payments: [
        { id: "pay-1", amount: 166.67, payment_method: "cash", paid_at: new Date(Date.now() - 86400000 * 2).toISOString() }
      ]
    }
  ]));
}

/**
 * Standard HTTP Request handler to Laravel Backend with Offline Demo Mock Fallback
 */
export async function request(endpoint, method = 'GET', body = null) {
  if (SYSTEM_MODE === 'offline') {
    return handleMockRouting(endpoint, method, body);
  }

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  // Intercept if we are using a Mock Token or if fetch fails
  const isMockToken = token && token.startsWith('mock-');
  
  if (isMockToken || endpoint === '/auth/login' || endpoint === '/auth/verify-pin' || endpoint === '/auth/quick-login') {
    try {
      // Try real network request first, but fall back if it fails
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      return data;
    } catch (e) {
      console.log(`[API Redirect] Backend offline. Routing "${endpoint}" via local Mock database...`);
      return handleMockRouting(endpoint, method, body);
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        setToken(null);
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
      throw new Error(data.message || 'Xatolik yuz berdi');
    }

    return data;
  } catch (error) {
    console.warn(`[API Redirect] Fallback to Mock database due to error:`, error.message);
    return handleMockRouting(endpoint, method, body);
  }
}

/**
 * Simulated backend routes matching database responses
 */
function handleMockRouting(endpoint, method, body) {
  // POST /auth/login
  if (endpoint === '/auth/login' && method === 'POST') {
    const { email, password } = body;
    const cleanEmail = (email || '').toLowerCase().trim().replace('@gamil.com', '@gmail.com');
    if ((cleanEmail === 'admin@gmail.com' || cleanEmail.startsWith('admin')) && (password === 'admin123' || password === 'admin')) {
      return {
        token: 'mock-admin-token',
        user: { id: 'admin-1', name: 'Administrator', email: 'admin@gmail.com', role: 'admin' }
      };
    }
    if (cleanEmail === 'scanner@gmail.com' && password === 'scanner123') {
      return {
        token: 'mock-scanner-token',
        user: { id: 'scanner-1', name: 'Mobile Scanner', email: 'scanner@gmail.com', role: 'scanner' }
      };
    }
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    const user = staff.find(s => s.email === email);
    if (user) {
      const expectedPassword = user.password || 'cashier123';
      if (password === expectedPassword || password === 'cashier123' || password === 'diyorbek123' || password === 'sardor123') {
        return {
          token: 'mock-token-' + user.id,
          user: { ...user, role: user.role || 'cashier' }
        };
      }
    }
    throw new Error('Email yoki parol noto\'g\'ri');
  }

  // POST /auth/verify-pin
  if (endpoint === '/auth/verify-pin' && method === 'POST') {
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    const user = staff.find(s => s.id === body.user_id) || staff[0];
    return {
      message: 'PIN kod to\'g\'ri',
      token: 'mock-token-' + user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'cashier',
        branch_id: user.branch_id
      },
      shift: {
        id: 'shift-' + Date.now(),
        status: 'active',
        generated_revenue: 0.00
      }
    };
  }

  // POST /auth/quick-login
  if (endpoint === '/auth/quick-login' && method === 'POST') {
    const pin = (body.pin_code || '').trim();
    if (pin === '555555' || pin === 'admin123' || pin === '000000') {
      return {
        token: 'mock-admin-token',
        user: { id: 'admin-1', name: 'Administrator', email: 'admin@gmail.com', role: 'admin' },
        message: 'Admin tizimga kirdi'
      };
    }
    if (pin === '999999' || pin === 'scanner123') {
      return {
        token: 'mock-scanner-token',
        user: { id: 'scanner-1', name: 'Qurilma Skanerlovchi', email: 'scanner@gmail.com', role: 'scanner' },
        message: 'Skaner tizimga kirdi'
      };
    }
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    let user = staff.find(s => s.pin_code === pin || s.password === pin);
    if (!user) {
      if (pin === '123456') user = staff.find(s => s.email === 'cashier@gmail.com') || staff[0];
      else if (pin === '234567') user = staff.find(s => s.email === 'cashier2@gmail.com');
      else if (pin === '345678') user = staff.find(s => s.email === 'diyorbek@gmail.com');
      else if (pin === '456789') user = staff.find(s => s.email === 'sardor@gmail.com');
    }
    if (user) {
      const activeShift = {
        id: 'shift-' + Date.now(),
        user_id: user.id,
        user_name: user.name,
        branch_name: 'Yunusobod filiali',
        start_time: new Date().toISOString(),
        status: 'active',
        generated_revenue: 0.00,
        sales_count: 0
      };
      localStorage.setItem('mock_active_shift_' + user.id, JSON.stringify(activeShift));
      return {
        token: 'mock-token-' + user.id,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role || 'cashier',
          branch_id: user.branch_id
        },
        shift: activeShift,
        message: `Xush kelibsiz, ${user.name}!`
      };
    }
    throw new Error('PIN-kod noto\'g\'ri');
  }

  // GET /shifts/current
  if (endpoint === '/shifts/current' && method === 'GET') {
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    let currentUserId = 'a25d3da8-77e1-4f5b-921e-1edb42fbd969';
    if (token && token.startsWith('mock-token-')) {
      currentUserId = token.replace('mock-token-', '');
    }
    const user = staff.find(s => s.id === currentUserId) || staff[0];
    let activeShift = JSON.parse(localStorage.getItem('mock_active_shift_' + user.id) || 'null');
    if (!activeShift) {
      activeShift = {
        id: 'shift-' + Date.now(),
        user_id: user.id,
        user_name: user.name,
        branch_name: 'Yunusobod filiali',
        start_time: new Date().toISOString(),
        status: 'active',
        generated_revenue: 0.00,
        sales_count: 0
      };
      localStorage.setItem('mock_active_shift_' + user.id, JSON.stringify(activeShift));
    }
    const startTimestamp = new Date(activeShift.start_time).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTimestamp) / 1000));
    return {
      active: true,
      shift: {
        ...activeShift,
        elapsed_seconds: elapsedSeconds
      }
    };
  }

  // POST /shifts/end
  if (endpoint === '/shifts/end' && method === 'POST') {
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    let currentUserId = 'a25d3da8-77e1-4f5b-921e-1edb42fbd969';
    if (token && token.startsWith('mock-token-')) {
      currentUserId = token.replace('mock-token-', '');
    }
    const user = staff.find(s => s.id === currentUserId) || staff[0];
    let activeShift = JSON.parse(localStorage.getItem('mock_active_shift_' + user.id) || 'null');
    const start = activeShift ? new Date(activeShift.start_time) : new Date(Date.now() - 3600000);
    const end = new Date();
    const diffSec = Math.floor((end - start) / 1000);
    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const durationText = `${hours > 0 ? hours + ' soat ' : ''}${minutes} daqiqa`;
    const revenue = activeShift ? activeShift.generated_revenue || 0 : 0;
    const salesCount = activeShift ? activeShift.sales_count || 0 : 0;
    const wage = ((diffSec / 3600) * 15.0).toFixed(2);

    const completedShift = {
      id: 'shift-log-' + Date.now(),
      shift_id: activeShift ? activeShift.id : 'shift-1',
      cashier_name: user.name,
      branch_name: 'Yunusobod filiali',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration: durationText,
      total_revenue: revenue,
      sales_count: salesCount,
      calculated_wage: parseFloat(wage)
    };

    const history = JSON.parse(localStorage.getItem('mock_shifts_history') || '[]');
    history.unshift(completedShift);
    localStorage.setItem('mock_shifts_history', JSON.stringify(history));
    localStorage.removeItem('mock_active_shift_' + user.id);

    return {
      message: 'Navbatchilik muvaffaqiyatli yakunlandi',
      summary: completedShift
    };
  }

  // GET /shifts/staff-work-hours
  if (endpoint === '/shifts/staff-work-hours' && method === 'GET') {
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    const history = JSON.parse(localStorage.getItem('mock_shifts_history') || '[]');
    
    // Check any active shifts in storage
    const activeShifts = [];
    staff.forEach(s => {
      const active = JSON.parse(localStorage.getItem('mock_active_shift_' + s.id) || 'null');
      if (active) {
        const startTimestamp = new Date(active.start_time).getTime();
        const elapsed = Math.max(0, Math.floor((Date.now() - startTimestamp) / 1000));
        activeShifts.push({
          shift_id: active.id,
          user_id: s.id,
          user_name: s.name,
          user_email: s.email,
          branch_name: 'Yunusobod filiali',
          shift_type: 'day',
          start_time: active.start_time,
          elapsed_seconds: elapsed,
          revenue: active.generated_revenue || 0,
          sales_count: active.sales_count || 0,
          status: 'online'
        });
      }
    });

    let todayRev = history.reduce((a, b) => a + (b.total_revenue || 0), 0);
    activeShifts.forEach(a => todayRev += (a.revenue || 0));

    return {
      active_shifts: activeShifts,
      completed_shifts: history,
      today_totals: {
        active_cashiers: activeShifts.length,
        today_revenue: todayRev,
        total_hours: history.length * 8 + (activeShifts.length > 0 ? 2 : 0)
      }
    };
  }

  // GET /settings
  if (endpoint === '/settings' && method === 'GET') {
    return JSON.parse(localStorage.getItem('mock_settings'));
  }
  
  // POST /settings
  if (endpoint === '/settings' && method === 'POST') {
    const currentSettings = JSON.parse(localStorage.getItem('mock_settings'));
    currentSettings[body.key] = body.value;
    localStorage.setItem('mock_settings', JSON.stringify(currentSettings));
    
    // Log activity
    logActivityOffline('settings_update', `Tizim sozlamalari yangilandi: '${body.key}' bo'limi tahrirlandi (Demo)`);

    // Broadcast event to Socket.io if connected
    const socket = getSocket();
    if (socket && socket.connected) {
      socket.emit('telemetry:ping', { mock_event: 'settings:changed', key: body.key, value: body.value });
    }
    
    return { message: 'Tizim sozlamalari saqlandi (Demo)', setting: { key: body.key, value: body.value } };
  }

  // GET /products
  if (endpoint.startsWith('/products') && method === 'GET') {
    const products = JSON.parse(localStorage.getItem('mock_products'));
    
    // Handle Search filter query
    const urlParams = new URLSearchParams(endpoint.split('?')[1]);
    const search = urlParams.get('search');
    if (search) {
      const query = search.toLowerCase();
      return products.filter(p => 
        p.model_name.toLowerCase().includes(query) || 
        p.qr_code.toLowerCase().includes(query)
      );
    }
    return products;
  }

  // GET /products/scan/{code}
  if (endpoint.startsWith('/products/scan/') && method === 'GET') {
    const code = endpoint.replace('/products/scan/', '').trim();
    const products = JSON.parse(localStorage.getItem('mock_products'));
    const prod = products.find(p => p.qr_code.toUpperCase() === code.toUpperCase());
    if (!prod) {
      throw new Error('Mahsulot topilmadi');
    }
    return prod;
  }

  // GET /activity-logs
  if (endpoint === '/activity-logs' && method === 'GET') {
    return JSON.parse(localStorage.getItem('mock_activity_logs') || '[]');
  }

  // POST /products
  if (endpoint === '/products' && method === 'POST') {
    const products = JSON.parse(localStorage.getItem('mock_products'));
    const newProd = {
      id: 'prod-' + Date.now(),
      ...body
    };
    products.push(newProd);
    localStorage.setItem('mock_products', JSON.stringify(products));
    logActivityOffline('product_create', `Yangi mahsulot omborga qo'shildi: ${newProd.model_name} (Soni: ${newProd.quantity} dona, Narxi: \$${parseFloat(newProd.retail_price).toFixed(2)}) (Demo)`);
    return { message: 'Yangi mahsulot omborxonaga qo\'shildi (Demo)', product: newProd };
  }

  // PUT /products/{id}
  if (endpoint.startsWith('/products/') && method === 'PUT') {
    const id = endpoint.replace('/products/', '');
    const products = JSON.parse(localStorage.getItem('mock_products'));
    const idx = products.findIndex(p => p.id === id);
    if (idx !== -1) {
      products[idx] = { ...products[idx], ...body };
      localStorage.setItem('mock_products', JSON.stringify(products));
      logActivityOffline('product_update', `Mahsulot ma'lumotlari yangilandi: ${products[idx].model_name} (Yangi soni: ${products[idx].quantity} dona, Yangi narxi: \$${parseFloat(products[idx].retail_price).toFixed(2)}) (Demo)`);
      return { message: 'Mahsulot ma\'lumotlari yangilandi (Demo)', product: products[idx] };
    }
    throw new Error('Mahsulot topilmadi');
  }

  // DELETE /products/{id}
  if (endpoint.startsWith('/products/') && method === 'DELETE') {
    const id = endpoint.replace('/products/', '');
    const products = JSON.parse(localStorage.getItem('mock_products'));
    const prod = products.find(p => p.id === id);
    const filtered = products.filter(p => p.id !== id);
    localStorage.setItem('mock_products', JSON.stringify(filtered));
    if (prod) {
      logActivityOffline('product_delete', `Mahsulot o'chirildi: ${prod.model_name} (Shtrixkod: ${prod.qr_code}) (Demo)`);
    }
    return { message: 'Mahsulot o\'chirildi (Demo)' };
  }

  // GET /auth/staff
  if (endpoint === '/auth/staff' && method === 'GET') {
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    const branches = JSON.parse(localStorage.getItem('mock_branches') || '[]');
    const transitions = JSON.parse(localStorage.getItem('mock_transitions') || '[]');

    return staff.map(s => {
      const b = branches.find(branch => branch.id === s.branch_id);
      const uShifts = transitions.filter(t => t.cashier === s.name).map(t => ({
        id: t.id,
        status: t.status,
        start_time: t.time,
        calculated_wage: t.wage
      }));

      return {
        ...s,
        branch: b || null,
        shifts: uShifts
      };
    });
  }

  // POST /auth/staff
  if (endpoint === '/auth/staff' && method === 'POST') {
    const staff = JSON.parse(localStorage.getItem('mock_staff'));
    const newStaff = {
      id: 'staff-' + Date.now(),
      name: body.name,
      email: body.email || '',
      password: body.password || 'cashier123',
      role: body.role || 'cashier',
      wage_structure: body.wage_structure || 0,
      branch_id: body.branch_id || null,
      operational_hours: ['Dush-Jum: 08:00 - 20:00']
    };
    staff.push(newStaff);
    localStorage.setItem('mock_staff', JSON.stringify(staff));
    return { message: 'Foydalanuvchi muvaffaqiyatli yaratildi (Demo)', user: newStaff };
  }

  // PUT /auth/staff/{id}
  if (endpoint.startsWith('/auth/staff/') && method === 'PUT') {
    const id = endpoint.replace('/auth/staff/', '');
    const staff = JSON.parse(localStorage.getItem('mock_staff'));
    const idx = staff.findIndex(s => s.id === id);
    if (idx !== -1) {
      staff[idx] = { 
        ...staff[idx], 
        name: body.name || staff[idx].name, 
        email: body.email !== undefined ? body.email : staff[idx].email,
        password: body.password !== undefined ? body.password : staff[idx].password,
        role: body.role !== undefined ? body.role : (staff[idx].role || 'cashier'),
        wage_structure: body.wage_structure !== undefined ? body.wage_structure : staff[idx].wage_structure,
        branch_id: body.branch_id !== undefined ? body.branch_id : staff[idx].branch_id
      };
      localStorage.setItem('mock_staff', JSON.stringify(staff));
      return { message: 'Foydalanuvchi ma\'lumotlari yangilandi (Demo)', user: staff[idx] };
    }
    throw new Error('Foydalanuvchi topilmadi');
  }

  // DELETE /auth/staff/{id}
  if (endpoint.startsWith('/auth/staff/') && method === 'DELETE') {
    const id = endpoint.replace('/auth/staff/', '');
    const staff = JSON.parse(localStorage.getItem('mock_staff'));
    const filtered = staff.filter(s => s.id !== id);
    localStorage.setItem('mock_staff', JSON.stringify(filtered));
    return { message: 'Xodim muvaffaqiyatli o\'chirildi (Demo)' };
  }

  // POST /sales/checkout
  if (endpoint === '/sales/checkout' && method === 'POST') {
    const products = JSON.parse(localStorage.getItem('mock_products'));
    const sales = JSON.parse(localStorage.getItem('mock_sales'));
    const invoiceItems = [];
    let grandTotal = 0;

    body.cart.forEach(item => {
      const prod = products.find(p => p.id === item.product_id);
      if (!prod) throw new Error('Mahsulot topilmadi');
      if (prod.quantity < item.quantity) throw new Error(`Omborda yetarli mahsulot yo'q: ${prod.model_name}`);
      
      prod.quantity -= item.quantity;
      const total = prod.retail_price * item.quantity;
      grandTotal += total;

      invoiceItems.push({
        product_name: prod.model_name,
        quantity: item.quantity,
        retail_price: prod.retail_price,
        total_price: total
      });
    });

    localStorage.setItem('mock_products', JSON.stringify(products));
    
    const newSale = {
      id: 'sale-' + Date.now(),
      items: invoiceItems,
      grand_total: grandTotal,
      timestamp: new Date().toISOString()
    };
    sales.push(newSale);
    localStorage.setItem('mock_sales', JSON.stringify(sales));

    // Update mock transitions list to log revenue
    const transitions = JSON.parse(localStorage.getItem('mock_transitions'));
    if (transitions.length > 0 && transitions[0].status === 'active') {
      transitions[0].revenue = (parseFloat(transitions[0].revenue) || 0) + grandTotal;
      localStorage.setItem('mock_transitions', JSON.stringify(transitions));
    }

    // Log activity
    const itemNames = invoiceItems.map(i => `${i.product_name} x ${i.quantity}`).join(', ');
    logActivityOffline('sale', `Sotuv amalga oshirildi: ${itemNames} (Jami: \$${grandTotal.toFixed(2)}) (Demo)`);

    return {
      message: 'Sotuv muvaffaqiyatli yakunlandi (Demo)',
      invoice: {
        items: invoiceItems,
        grand_total: grandTotal,
        timestamp: new Date().toISOString()
      }
    };
  }

  // GET /shifts/analytics
  if (endpoint === '/shifts/analytics' && method === 'GET') {
    const sales = JSON.parse(localStorage.getItem('mock_sales'));
    const products = JSON.parse(localStorage.getItem('mock_products'));
    const transitions = JSON.parse(localStorage.getItem('mock_transitions'));

    const totalRevenue = sales.reduce((acc, s) => acc + s.grand_total, 0);
    const inventoryValuation = products.reduce((acc, p) => acc + (p.quantity * p.purchase_price), 0);
    const totalExpenses = transitions.reduce((acc, t) => acc + (parseFloat(t.wage) || 0), 0);

    const branches = JSON.parse(localStorage.getItem('mock_branches') || '[]');
    const branchBreakdown = branches.map(b => ({
      branch_name: b.name,
      total_sales: totalRevenue * (b.id === 'branch-1' ? 0.65 : 0.35),
      total_devices: Math.ceil(sales.length * (b.id === 'branch-1' ? 0.65 : 0.35))
    }));

    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    const staffStats = staff.map(s => {
      const userShifts = transitions.filter(t => t.cashier === s.name);
      const totalWage = userShifts.reduce((acc, t) => acc + (parseFloat(t.wage) || 0), 0);
      const totalRevenue = userShifts.reduce((acc, t) => acc + (parseFloat(t.revenue) || 0), 0);
      const hasActive = userShifts.some(t => t.status === 'active');
      return {
        id: s.id,
        name: s.name,
        role: 'cashier',
        email: s.email || `${s.name.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
        total_revenue: totalRevenue,
        total_wage: totalWage,
        total_hours: userShifts.length * 8,
        status: hasActive ? 'active' : 'inactive'
      };
    });

    return {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      inventory_valuation: inventoryValuation,
      day_shift_revenue: totalRevenue * 0.6,
      night_shift_revenue: totalRevenue * 0.4,
      transitions: transitions,
      branch_breakdown: branchBreakdown,
      staff_stats: staffStats
    };
  }

  // GET /branches
  if (endpoint === '/branches' && method === 'GET') {
    const branches = JSON.parse(localStorage.getItem('mock_branches') || '[]');
    const products = JSON.parse(localStorage.getItem('mock_products') || '[]');
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');

    return branches.map(b => {
      const bProducts = products.filter(p => p.branch_id === b.id);
      const bStaff = staff.filter(s => s.branch_id === b.id);
      return {
        ...b,
        users_count: bStaff.length,
        products_count: bProducts.length,
        users: bStaff
      };
    });
  }

  // POST /branches
  if (endpoint === '/branches' && method === 'POST') {
    const branches = JSON.parse(localStorage.getItem('mock_branches') || '[]');
    const newBranch = {
      id: 'branch-' + Math.random().toString(36).substr(2, 9),
      name: body.name,
      address: body.address || ''
    };
    branches.push(newBranch);
    localStorage.setItem('mock_branches', JSON.stringify(branches));
    return { message: 'Filial saqlandi (Demo)', branch: newBranch };
  }

  // PUT /branches/*
  if (endpoint.startsWith('/branches/') && endpoint.endsWith('/products') === false && method === 'PUT') {
    const id = endpoint.split('/')[2];
    const branches = JSON.parse(localStorage.getItem('mock_branches') || '[]');
    const idx = branches.findIndex(b => b.id === id);
    if (idx !== -1) {
      branches[idx].name = body.name || branches[idx].name;
      branches[idx].address = body.address !== undefined ? body.address : branches[idx].address;
      localStorage.setItem('mock_branches', JSON.stringify(branches));
      return { message: 'Filial ma\'lumotlari yangilandi (Demo)', branch: branches[idx] };
    }
  }

  // DELETE /branches/*
  if (endpoint.startsWith('/branches/') && method === 'DELETE') {
    const id = endpoint.split('/')[2];
    let branches = JSON.parse(localStorage.getItem('mock_branches') || '[]');
    branches = branches.filter(b => b.id !== id);
    localStorage.setItem('mock_branches', JSON.stringify(branches));
    
    const staff = JSON.parse(localStorage.getItem('mock_staff') || '[]');
    staff.forEach(s => {
      if (s.branch_id === id) s.branch_id = null;
    });
    localStorage.setItem('mock_staff', JSON.stringify(staff));

    return { message: 'Filial o\'chirildi (Demo)' };
  }

  // GET /branches/*/products
  if (endpoint.startsWith('/branches/') && endpoint.endsWith('/products') && method === 'GET') {
    const id = endpoint.split('/')[2];
    const products = JSON.parse(localStorage.getItem('mock_products') || '[]');
    return products.filter(p => p.branch_id === id);
  }

  // GET /sales/history
  if (endpoint === '/sales/history' && method === 'GET') {
    const sales = JSON.parse(localStorage.getItem('mock_sales') || '[]');
    return sales.map(s => {
      return (s.items || []).map(item => ({
        id: s.id,
        product_name: item.product_name || 'Noma\'lum smartfon',
        qr_code: 'TEL-MOCK',
        specifications: { ram: 'N/A', storage: 'N/A', color: 'N/A' },
        quantity: item.quantity || 1,
        retail_price: item.retail_price || 0,
        total_price: item.total_price || 0,
        cashier: 'Kassir Demo',
        time: s.timestamp
      }));
    }).flat();
  }

  // GET /scan-requests
  if (endpoint === '/scan-requests' && method === 'GET') {
    const list = JSON.parse(localStorage.getItem('mock_scan_requests') || '[]');
    const branches = JSON.parse(localStorage.getItem('mock_branches') || '[]');
    return list.filter(r => r.status === 'pending').map(r => {
      const b = branches.find(branch => branch.id === r.branch_id);
      return {
        ...r,
        branch: b || null
      };
    });
  }

  // POST /scan-requests
  if (endpoint === '/scan-requests' && method === 'POST') {
    const list = JSON.parse(localStorage.getItem('mock_scan_requests') || '[]');
    const req = {
      id: 'scan-' + Math.random().toString(36).substr(2, 9),
      qr_code: body.qr_code,
      branch_id: body.branch_id || null,
      status: 'pending',
      created_at: new Date().toISOString()
    };
    list.push(req);
    localStorage.setItem('mock_scan_requests', JSON.stringify(list));
    
    // Log activity
    logActivityOffline('scan_request', `Yangi shtrix-kod skanerlandi: ${req.qr_code} (Omborga kiritish arizasi) (Demo)`);

    return { message: 'Skanerlash arizasi omborga yuborildi (Demo)', scan_request: req };
  }

  // PUT /scan-requests/*
  if (endpoint.startsWith('/scan-requests/') && method === 'PUT') {
    const id = endpoint.split('/')[2];
    const list = JSON.parse(localStorage.getItem('mock_scan_requests') || '[]');
    const idx = list.findIndex(r => r.id === id);
    if (idx !== -1) {
      list[idx].status = body.status;
      localStorage.setItem('mock_scan_requests', JSON.stringify(list));
      
      // Log activity
      logActivityOffline('scan_update', `Skanerlash arizasi ko'rib chiqildi: ${list[idx].qr_code} (${body.status === 'approved' ? 'Tasdiqlandi' : 'Rad etildi'}) (Demo)`);

      return { message: 'Ariza holati yangilandi (Demo)', scan_request: list[idx] };
    }
  }

  // DELETE /scan-requests/*
  if (endpoint.startsWith('/scan-requests/') && method === 'DELETE') {
    const id = endpoint.split('/')[2];
    let list = JSON.parse(localStorage.getItem('mock_scan_requests') || '[]');
    list = list.filter(r => r.id !== id);
    localStorage.setItem('mock_scan_requests', JSON.stringify(list));
    return { message: 'Skanerlash arizasi o\'chirildi (Demo)' };
  }

  // GET /partners
  if (endpoint === '/partners' && method === 'GET') {
    return JSON.parse(localStorage.getItem('mock_partners') || '[]');
  }

  // POST /partners
  if (endpoint === '/partners' && method === 'POST') {
    const list = JSON.parse(localStorage.getItem('mock_partners') || '[]');
    const newItem = {
      id: 'partner-' + Date.now(),
      name: body.name,
      contact_person: body.contact_person,
      email: body.email,
      phone: body.phone,
      customs_terms: body.customs_terms || ''
    };
    list.push(newItem);
    localStorage.setItem('mock_partners', JSON.stringify(list));
    return { message: "Hamkor muvaffaqiyatli qo'shildi (Demo)", partner: newItem };
  }

  // PUT /partners/{id}
  if (endpoint.startsWith('/partners/') && method === 'PUT') {
    const id = endpoint.replace('/partners/', '');
    const list = JSON.parse(localStorage.getItem('mock_partners') || '[]');
    const idx = list.findIndex(p => p.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...body };
      localStorage.setItem('mock_partners', JSON.stringify(list));
      return { message: "Hamkor ma'lumotlari yangilandi (Demo)", partner: list[idx] };
    }
    throw new Error("Hamkor topilmadi");
  }

  // DELETE /partners/{id}
  if (endpoint.startsWith('/partners/') && method === 'DELETE') {
    const id = endpoint.replace('/partners/', '');
    let list = JSON.parse(localStorage.getItem('mock_partners') || '[]');
    list = list.filter(p => p.id !== id);
    localStorage.setItem('mock_partners', JSON.stringify(list));
    return { message: "Hamkor o'chirildi (Demo)" };
  }

  // GET /partner-orders
  if (endpoint === '/partner-orders' && method === 'GET') {
    const orders = JSON.parse(localStorage.getItem('mock_partner_orders') || '[]');
    const partners = JSON.parse(localStorage.getItem('mock_partners') || '[]');
    return orders.map(o => ({
      ...o,
      partner: partners.find(p => p.id === o.partner_id) || null
    }));
  }

  // POST /partner-orders
  if (endpoint === '/partner-orders' && method === 'POST') {
    const orders = JSON.parse(localStorage.getItem('mock_partner_orders') || '[]');
    const newItem = {
      id: 'order-' + Date.now(),
      partner_id: body.partner_id,
      product_name: body.product_name,
      quantity: parseInt(body.quantity || 0),
      contract_note: body.contract_note || '',
      customs_duty: parseFloat(body.customs_duty || 0),
      status: 'pending',
      created_at: new Date().toISOString()
    };
    orders.push(newItem);
    localStorage.setItem('mock_partner_orders', JSON.stringify(orders));
    
    const partners = JSON.parse(localStorage.getItem('mock_partners') || '[]');
    newItem.partner = partners.find(p => p.id === body.partner_id) || null;
    return { message: "Buyurtma & Shartnoma ro'yxatdan o'tkazildi (Demo)", order: newItem };
  }

  // PUT /partner-orders/{id}
  if (endpoint.startsWith('/partner-orders/') && method === 'PUT') {
    const id = endpoint.replace('/partner-orders/', '');
    const orders = JSON.parse(localStorage.getItem('mock_partner_orders') || '[]');
    const idx = orders.findIndex(o => o.id === id);
    if (idx !== -1) {
      orders[idx] = { ...orders[idx], ...body };
      localStorage.setItem('mock_partner_orders', JSON.stringify(orders));
      
      const partners = JSON.parse(localStorage.getItem('mock_partners') || '[]');
      orders[idx].partner = partners.find(p => p.id === orders[idx].partner_id) || null;
      return { message: "Buyurtma holati yangilandi (Demo)", order: orders[idx] };
    }
    throw new Error("Buyurtma topilmadi");
  }

  // GET /debts
  if (endpoint.startsWith('/debts') && endpoint.includes('/pay') === false && endpoint.includes('/approve') === false && method === 'GET') {
    return JSON.parse(localStorage.getItem('mock_debts') || '[]');
  }

  // POST /debts
  if (endpoint === '/debts' && method === 'POST') {
    const debts = JSON.parse(localStorage.getItem('mock_debts') || '[]');
    const newDebt = {
      id: 'debt-' + Date.now(),
      customer_name: body.customer_name || 'Mijoz',
      customer_phone: body.customer_phone || '',
      passport_series: body.passport_series || '',
      passport_number: body.passport_number || '',
      product_name: body.product_name || 'Mahsulot',
      total_amount: parseFloat(body.total_amount) || 0,
      initial_payment: parseFloat(body.initial_payment) || 0,
      remaining_amount: (parseFloat(body.total_amount) || 0) - (parseFloat(body.initial_payment) || 0),
      monthly_payment: parseFloat(body.monthly_payment) || 0,
      period_months: parseInt(body.period_months) || 6,
      status: 'active',
      created_at: new Date().toISOString(),
      payments: []
    };
    debts.unshift(newDebt);
    localStorage.setItem('mock_debts', JSON.stringify(debts));
    return { message: 'Nasiya shartnomasi rasmiylashtirildi (Demo)', debt: newDebt };
  }

  // POST /debts/:id/pay
  if (endpoint.includes('/debts/') && endpoint.endsWith('/pay') && method === 'POST') {
    const debtId = endpoint.split('/')[2];
    const debts = JSON.parse(localStorage.getItem('mock_debts') || '[]');
    const debt = debts.find(d => d.id === debtId);
    if (debt) {
      const amount = parseFloat(body.amount) || 0;
      debt.remaining_amount = Math.max(0, debt.remaining_amount - amount);
      if (debt.remaining_amount <= 0) debt.status = 'paid';
      debt.payments = debt.payments || [];
      debt.payments.push({
        id: 'pay-' + Date.now(),
        amount: amount,
        payment_method: body.payment_method || 'cash',
        paid_at: new Date().toISOString()
      });
      localStorage.setItem('mock_debts', JSON.stringify(debts));
      return { message: 'To\'lov qabul qilindi (Demo)', debt };
    }
  }

  return {};
}


/**
 * Initialize WebSockets connection to Node.js server
 */
export function initSocket(onEventCallback) {
  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_BASE_URL);

  socket.on('connect', () => {
    console.log('[WebSocket] Real-time connection established', socket.id);
  });

  // Listen to telemetry events
  const telemetryEvents = ['shift:started', 'shift:completed', 'sale:created', 'stock:changed', 'settings:changed'];
  
  telemetryEvents.forEach(evt => {
    socket.on(evt, (data) => {
      console.log(`[WebSocket Telemetry] Received event: ${evt}`, data);
      onEventCallback(evt, data);
    });
  });

  socket.on('disconnect', () => {
    console.log('[WebSocket] Connection closed');
  });

  return socket;
}

export function getSocket() {
  return socket;
}

function logActivityOffline(action_type, description) {
  const logs = JSON.parse(localStorage.getItem('mock_activity_logs') || '[]');
  const currentUser = JSON.parse(localStorage.getItem('session_user') || '{"id": 1, "name": "Admin"}');
  
  logs.unshift({
    id: 'log-' + Date.now() + Math.random().toString(36).substr(2, 5),
    user_id: currentUser.id,
    user_name: currentUser.name,
    action_type: action_type,
    description: description,
    created_at: new Date().toISOString()
  });
  
  localStorage.setItem('mock_activity_logs', JSON.stringify(logs.slice(0, 100)));
}
