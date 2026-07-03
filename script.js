const STORAGE_KEY = 'calorieBankData';
let data = {
  target: 2500,
  region: 'gb',
  startTime: Date.now(),
  loggedCalories: 0,
  history: {}
};
let currentBalance = 0;
let rate = 0;
let html5QrCode = null;

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { const parsed = JSON.parse(saved); data = parsed; } catch(e) {}
  }
  if (!data.history) data.history = {};
  if (!data.region) data.region = 'gb';
  rate = data.target / 86400;
  updateCurrentBalance();
}
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function updateCurrentBalance() {
  const seconds = (Date.now() - data.startTime) / 1000;
  currentBalance = seconds * rate - data.loggedCalories;
  return currentBalance;
}

function updateUI() {
  const balance = updateCurrentBalance();
  document.getElementById('balanceDisplay').textContent = Math.round(balance) + ' kcal';
  drawRing(balance);
  document.getElementById('rateDisplay').textContent = `+${(rate * 3600).toFixed(0)} kcal/hour`;
  document.getElementById('targetInput').value = data.target;
  document.getElementById('regionSelect').value = data.region;
}
function drawRing(balance) {
  const canvas = document.getElementById('ringCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w/2, cy = h/2, radius = 80, lw = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = lw;
  ctx.stroke();
  let fraction = Math.max(-1, Math.min(1.5, balance / data.target));
  const startAngle = -0.5 * Math.PI;
  const endAngle = startAngle + (fraction * 2 * Math.PI);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = fraction >= 0 ? '#22c55e' : '#ef4444';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

let foodResults = [];
async function searchFood(query) {
  if (!query.trim()) { document.getElementById('foodResults').innerHTML = ''; return; }
  const region = data.region;
  const url = `https://${region}.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const products = json.products || [];
    foodResults = products.map(p => {
      const n = p.nutriments || {};
      let cal = n['energy-kcal_100g'] || n['energy_100g'] || n['energy_kcal_100g'] || n['energy'] || 0;
      if (typeof cal === 'string') cal = parseFloat(cal) || 0;
      const protein = n['proteins_100g'] || n['protein_100g'] || 0;
      const carbs = n['carbohydrates_100g'] || n['carbohydrate_100g'] || 0;
      const fat = n['fat_100g'] || n['fat'] || 0;
      return {
        name: p.product_name || p.brands || 'Unknown',
        cal: Math.round(cal),
        protein: Math.round(protein * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        fat: Math.round(fat * 10) / 10,
        serving: p.serving_size || '100g'
      };
    }).filter(f => f.cal > 0);
    renderFoodResults();
  } catch(e) {
    console.error('Search error:', e);
    document.getElementById('foodResults').innerHTML = '<div class="food-result-item" style="color:#ef4444;">⚠️ Error searching. Check internet.</div>';
    foodResults = [];
  }
}
function renderFoodResults() {
  const container = document.getElementById('foodResults');
  if (!foodResults.length) { container.innerHTML = '<div class="food-result-item" style="color:#94a3b8;">No results</div>'; return; }
  container.innerHTML = foodResults.map(f => `
    <div class="food-result-item" data-cal="${f.cal}" data-protein="${f.protein}" data-carbs="${f.carbs}" data-fat="${f.fat}">
      <span>${f.name}</span>
      <span style="font-size:12px;">${f.cal} kcal | P:${f.protein}g C:${f.carbs}g F:${f.fat}g</span>
    </div>
  `).join('');
  container.querySelectorAll('.food-result-item').forEach(el => {
    el.addEventListener('click', function() {
      const cals = parseFloat(this.dataset.cal);
      const protein = parseFloat(this.dataset.protein) || 0;
      const carbs = parseFloat(this.dataset.carbs) || 0;
      const fat = parseFloat(this.dataset.fat) || 0;
      if (cals > 0) {
        const name = this.querySelector('span')?.textContent || 'Food';
        addCalories(cals, name, protein, carbs, fat);
      }
      document.getElementById('foodSearch').value = '';
      foodResults = [];
      renderFoodResults();
    });
  });
}

// CORE ADD FUNCTION — accepts macros now
function addCalories(cals, name = 'Manual', protein = 0, carbs = 0, fat = 0) {
  if (!cals || cals <= 0) return;
  data.loggedCalories += cals;
  const today = new Date().toISOString().split('T')[0];
  if (!data.history[today]) data.history[today] = [];
  data.history[today].push({
    cal: cals,
    name: name,
    protein: parseFloat(protein) || 0,
    carbs: parseFloat(carbs) || 0,
    fat: parseFloat(fat) || 0,
    time: new Date().toISOString()
  });
  saveData();
  updateUI();
  renderLog();
  // Clear manual fields
  document.getElementById('manualCals').value = '';
  document.getElementById('manualProtein').value = '';
  document.getElementById('manualCarbs').value = '';
  document.getElementById('manualFat').value = '';
}

function renderLog() {
  const container = document.getElementById('logList');
  const dates = Object.keys(data.history).sort().reverse();
  if (!dates.length) { container.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:20px;">No entries yet</div>'; return; }
  container.innerHTML = dates.map(date => {
    const meals = data.history[date] || [];
    const total = meals.reduce((s, m) => s + m.cal, 0);
    const totalP = meals.reduce((s, m) => s + (m.protein || 0), 0);
    const totalC = meals.reduce((s, m) => s + (m.carbs || 0), 0);
    const totalF = meals.reduce((s, m) => s + (m.fat || 0), 0);
    const detail = meals.map(m => `${m.cal} kcal`).join(', ');
    return `
      <div class="log-day" data-date="${date}">
        <div class="log-day-header"><span>${date}</span><span>${total} kcal</span></div>
        <div class="log-day-detail">${detail}</div>
        <div class="log-day-macros">P: ${totalP.toFixed(0)}g &nbsp; C: ${totalC.toFixed(0)}g &nbsp; F: ${totalF.toFixed(0)}g</div>
      </div>
    `;
  }).join('');
  container.querySelectorAll('.log-day').forEach(el => {
    el.addEventListener('click', function() { openEditModal(this.dataset.date); });
  });
}

let editDate = null;
function openEditModal(date) {
  editDate = date;
  document.getElementById('editDayTitle').textContent = `Edit ${date}`;
  renderEditMeals(date);
  document.getElementById('editModal').classList.add('active');
}
function renderEditMeals(date) {
  const container = document.getElementById('editMealList');
  const meals = data.history[date] || [];
  if (!meals.length) { container.innerHTML = '<div style="color:#94a3b8;padding:8px;">No meals</div>'; return; }
  container.innerHTML = meals.map((m, idx) => `
    <div class="edit-meal-item">
      <span>${m.name || 'Meal'}: ${m.cal} kcal (P:${m.protein||0} C:${m.carbs||0} F:${m.fat||0})</span>
      <button data-index="${idx}">✕</button>
    </div>
  `).join('');
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', function() {
      const idx = parseInt(this.dataset.index);
      data.history[date].splice(idx, 1);
      if (data.history[date].length === 0) delete data.history[date];
      saveData();
      renderEditMeals(date);
      renderLog();
      updateUI();
    });
  });
}
document.getElementById('editAddMealBtn').addEventListener('click', function() {
  const input = document.getElementById('editMealCals');
  const cals = parseInt(input.value);
  if (cals > 0 && editDate) {
    if (!data.history[editDate]) data.history[editDate] = [];
    data.history[editDate].push({ cal: cals, name: 'Added', protein:0, carbs:0, fat:0, time: new Date().toISOString() });
    saveData();
    renderEditMeals(editDate);
    renderLog();
    updateUI();
    input.value = '';
  }
});
document.getElementById('editSaveBtn').addEventListener('click', function() {
  document.getElementById('editModal').classList.remove('active');
  rebuildLoggedCalories();
  saveData();
  updateUI();
  renderLog();
});
function rebuildLoggedCalories() {
  let total = 0;
  for (const date in data.history) {
    for (const meal of data.history[date]) { total += meal.cal; }
  }
  data.loggedCalories = total;
}

// SETTINGS
document.getElementById('updateTargetBtn').addEventListener('click', function() {
  const newTarget = parseInt(document.getElementById('targetInput').value);
  if (newTarget > 0) {
    const currentBal = updateCurrentBalance();
    data.target = newTarget;
    rate = data.target / 86400;
    const now = Date.now();
    data.startTime = now;
    data.loggedCalories = -currentBal;
    saveData();
    updateUI();
    renderLog();
  }
});
document.getElementById('resetAllBtn').addEventListener('click', function() {
  if (confirm('Delete ALL data?')) {
    data.history = {};
    data.loggedCalories = 0;
    data.startTime = Date.now();
    saveData();
    updateUI();
    renderLog();
  }
});
document.getElementById('setBalanceBtn').addEventListener('click', function() {
  const val = parseFloat(document.getElementById('balanceOverride').value);
  if (!isNaN(val)) {
    const now = Date.now();
    data.startTime = now;
    data.loggedCalories = -val;
    saveData();
    updateUI();
    renderLog();
    document.getElementById('balanceOverride').value = '';
  }
});
document.getElementById('regionSelect').addEventListener('change', function() {
  data.region = this.value;
  saveData();
});

// EXPORT / IMPORT
document.getElementById('exportBtn').addEventListener('click', function() {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calorie_bank_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importBtn').addEventListener('click', function() {
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const imported = JSON.parse(ev.target.result);
      data = imported;
      if (!data.history) data.history = {};
      rate = data.target / 86400;
      saveData();
      updateUI();
      renderLog();
      alert('Import successful!');
    } catch(err) { alert('Invalid backup file.'); }
  };
  reader.readAsText(file);
  this.value = '';
});

// NAV
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const viewId = this.dataset.view;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if (viewId === 'logView') renderLog();
  });
});

// QUICK BUTTONS
document.querySelectorAll('.quick-btn[data-cals]').forEach(btn => {
  btn.addEventListener('click', function() {
    addCalories(parseInt(this.dataset.cals), 'Quick', 0, 0, 0);
  });
});
document.getElementById('customAddBtn').addEventListener('click', function() {
  document.getElementById('manualCals').focus();
});

// MANUAL ADD WITH MACROS
document.getElementById('manualAddBtn').addEventListener('click', function() {
  const cals = parseInt(document.getElementById('manualCals').value);
  const protein = parseFloat(document.getElementById('manualProtein').value) || 0;
  const carbs = parseFloat(document.getElementById('manualCarbs').value) || 0;
  const fat = parseFloat(document.getElementById('manualFat').value) || 0;
  if (cals > 0) {
    addCalories(cals, 'Manual', protein, carbs, fat);
  }
});

// SEARCH
document.getElementById('searchFoodBtn').addEventListener('click', function() {
  searchFood(document.getElementById('foodSearch').value);
});
document.getElementById('foodSearch').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') document.getElementById('searchFoodBtn').click();
});

// MODAL CLOSE
document.querySelector('.close-modal').addEventListener('click', function() {
  document.getElementById('editModal').classList.remove('active');
});
document.getElementById('editModal').addEventListener('click', function(e) {
  if (e.target === this) this.classList.remove('active');
});
document.getElementById('settingsToggle').addEventListener('click', function() {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.nav-btn[data-view="settingsView"]').classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('settingsView').classList.add('active');
});

// ========== BARCODE SCANNER (FULL SCREEN) ==========
document.getElementById('scanBarcodeBtn').addEventListener('click', function() {
  openScanner();
});
document.getElementById('closeScannerBtn').addEventListener('click', function() {
  closeScanner();
});
document.getElementById('scannerModal').addEventListener('click', function(e) {
  if (e.target === this) closeScanner();
});

function openScanner() {
  const modal = document.getElementById('scannerModal');
  modal.classList.add('active');
  document.getElementById('scannerStatus').textContent = '📷 Initializing camera...';
  setTimeout(() => { startScanner(); }, 400);
}
function startScanner() {
  const container = document.getElementById('scannerContainer');
  if (html5QrCode) { html5QrCode.clear(); html5QrCode = null; }
  html5QrCode = new Html5Qrcode("scannerContainer");
  const config = { fps: 15, qrbox: { width: 280, height: 150 }, aspectRatio: 1.0 };
  html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanError)
    .then(() => {
      document.getElementById('scannerStatus').textContent = '📷 Camera ready - point at barcode';
    })
    .catch(err => {
      console.error("Camera error:", err);
      alert("Could not access camera. Please grant camera permission.");
      closeScanner();
    });
}
function onScanSuccess(decodedText, decodedResult) {
  if (html5QrCode) {
    html5QrCode.stop();
    html5QrCode.clear();
    html5QrCode = null;
  }
  document.getElementById('scannerStatus').textContent = '✅ Barcode detected! Fetching product...';
  fetchProductByBarcode(decodedText);
}
function onScanError(err) { /* ignore */ }

async function fetchProductByBarcode(barcode) {
  const region = data.region;
  const url = `https://${region}.openfoodfacts.org/api/v0/product/${barcode}.json`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 0 || !json.product) {
      alert(`No product found for barcode: ${barcode}`);
      closeScanner();
      return;
    }
    const product = json.product;
    const name = product.product_name || product.brands || 'Unknown product';
    const n = product.nutriments || {};
    let cals = n['energy-kcal_100g'] || n['energy_100g'] || n['energy'] || 0;
    if (typeof cals === 'string') cals = parseFloat(cals) || 0;
    cals = Math.round(cals);
    const protein = Math.round((n['proteins_100g'] || 0) * 10) / 10;
    const carbs = Math.round((n['carbohydrates_100g'] || 0) * 10) / 10;
    const fat = Math.round((n['fat_100g'] || 0) * 10) / 10;
    if (cals === 0) {
      alert(`Product found but no calorie data.\n${name}`);
      closeScanner();
      return;
    }
    if (confirm(`Add ${cals} kcal for "${name}"?\nP:${protein}g | C:${carbs}g | F:${fat}g`)) {
      addCalories(cals, `📷 ${name}`, protein, carbs, fat);
    }
    closeScanner();
  } catch(err) {
    console.error("Fetch error:", err);
    alert("Error fetching product. Check internet.");
    closeScanner();
  }
}
function closeScanner() {
  if (html5QrCode) {
    try { html5QrCode.stop(); html5QrCode.clear(); } catch(e) {}
    html5QrCode = null;
  }
  document.getElementById('scannerModal').classList.remove('active');
  document.getElementById('scannerContainer').innerHTML = '';
  document.getElementById('scannerStatus').textContent = '📷 Initializing camera...';
}

loadData();
updateUI();
renderLog();
setInterval(updateUI, 1000);
