const STORAGE_KEY = "dynamicSavingsPlanTimeStructureV1";
const CONFIG_KEY = "dynamicSavingsPlanConfig";
const todayISO = () => new Date().toISOString().slice(0,10);

// Helpers
function id(){ return crypto.randomUUID(); }
function yen(v){ return "¥" + Number(v || 0).toLocaleString("ja-JP"); }
function percent(v){ return Number.isFinite(v) ? Math.round(v * 10) / 10 + "%" : "0%"; }
function esc(v){ return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
function set(id,value){ const el=document.getElementById(id); if(el) el.textContent=value; }

const defaultData = {
  incomes: [
    { id: id(), name: "男方工资", amount: 350000 },
    { id: id(), name: "女方工资", amount: 400000 }
  ],
  pools: [
    { id: id(), name: "第一层：共同生活", type: "common", amount: 350000 },
    { id: id(), name: "第二层：个人生活", type: "personal", amount: 150000 },
    { id: id(), name: "第三层：家庭缓冲", type: "saving", amount: 100000 },
    { id: id(), name: "第四层：长期存钱", type: "saving", amount: 150000 }
  ],
  limits: [
    { id: id(), name: "平日饮食", cycle: "day", amount: 2000, dayType: "weekday", category: "饮食类" },
    { id: id(), name: "假日饮食", cycle: "day", amount: 5000, dayType: "weekend", category: "饮食类" },
    { id: id(), name: "交通出行", cycle: "day", amount: 500, dayType: "all", category: "交通出行" },
    { id: id(), name: "平日购物", cycle: "day", amount: 1000, dayType: "weekday", category: "普通购物消费" },
    { id: id(), name: "假日购物", cycle: "day", amount: 3000, dayType: "weekend", category: "普通购物消费" },
    { id: id(), name: "房租水电", cycle: "day", amount: 5000, dayType: "all", category: "房租水电" },
    { id: id(), name: "物品倒卖限额", cycle: "day", amount: 10000, dayType: "all", category: "物品倒卖" },
    { id: id(), name: "平日娱乐", cycle: "day", amount: 500, dayType: "weekday", category: "娱乐消费" },
    { id: id(), name: "假日娱乐", cycle: "day", amount: 5000, dayType: "weekend", category: "娱乐消费" },
    { id: id(), name: "医疗健康", cycle: "day", amount: 1000, dayType: "all", category: "医疗健康" },
    { id: id(), name: "教育培训", cycle: "day", amount: 2000, dayType: "all", category: "教育培训" }
  ],
  fixed: [
    { id: id(), name: "男方手机", owner: "男方", amount: 4000, status: "保留" },
    { id: id(), name: "男方ChatGPT", owner: "男方", amount: 3000, status: "保留" },
    { id: id(), name: "彩票", owner: "男方", amount: 1200, status: "考虑取消" },
    { id: id(), name: "Amazon会员", owner: "男方", amount: 500, status: "检查" },
    { id: id(), name: "Netflix", owner: "男方", amount: 500, status: "检查" },
    { id: id(), name: "女方手机", owner: "女方", amount: 4000, status: "保留" },
    { id: id(), name: "女方ChatGPT", owner: "女方", amount: 3000, status: "保留" }
  ],
  logs: [
    { id: id(), date: todayISO(), type: "expense", person: "共同", category: "晚餐", amount: 0 }
  ],
  warnings: [
    { id: id(), text: "今天所有花销必须先记录，再付款。", priority: "high", done: false },
    { id: id(), text: "每一餐都不能超过限定额度。", priority: "high", done: false },
    { id: id(), text: "便利店、咖啡、外卖属于最容易失控的小额消费。", priority: "high", done: false },
    { id: id(), text: "个人账户原则上不追加，花完就停止。", priority: "high", done: false },
    { id: id(), text: "购物前等待10分钟，确认是否真的必要。", priority: "mid", done: false },
    { id: id(), text: "今天是否珍惜了每一分钱？", priority: "mid", done: false }
  ]
};

// State management
let data = structuredClone(defaultData);
let config = {
  dataDirectory: "",
  currentFile: ""
};
let collapsedGroups = new Set(); // 存储折叠的日期

// Initial Load
async function initApp() {
  const storedConfig = localStorage.getItem(CONFIG_KEY);
  if (storedConfig) {
    config = JSON.parse(storedConfig);
    document.getElementById('dataDirectoryPath').value = config.dataDirectory;
    
    if (config.dataDirectory) {
      await refreshFileList();
      if (config.currentFile) {
        await switchFile(config.currentFile);
      }
    }
  } else {
    // Fallback to localStorage if no file-based config exists
    data = loadDataFromLocalStorage();
    render();
  }
}

function loadDataFromLocalStorage() {
  try { 
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return structuredClone(defaultData);
    return JSON.parse(stored);
  } catch { return structuredClone(defaultData); }
}

// File System Operations
async function selectDataDirectory() {
  const path = await window.electronAPI.selectDirectory();
  if (path) {
    config.dataDirectory = path;
    document.getElementById('dataDirectoryPath').value = path;
    saveConfig();
    await refreshFileList();
  }
}

async function refreshFileList() {
  if (!config.dataDirectory) return;
  const files = await window.electronAPI.listFiles(config.dataDirectory);
  const fileListEl = document.getElementById('fileList');
  fileListEl.innerHTML = '';
  
  if (files.length === 0) {
    fileListEl.innerHTML = '<p class="hint">该目录下没有 JSON 文件，请新建一个。</p>';
    return;
  }

  files.forEach(file => {
    const div = document.createElement('div');
    div.className = `file-item ${config.currentFile === file ? 'active' : ''}`;
    div.innerHTML = `
      <div class="file-info">
        <span>📄</span>
        <span class="file-name">${file}</span>
      </div>
    `;
    div.onclick = () => switchFile(file);
    fileListEl.appendChild(div);
  });
}

async function createNewFile() {
  if (!config.dataDirectory) {
    alert('请先选择数据存储目录');
    return;
  }
  let fileName = document.getElementById('newFileName').value.trim();
  if (!fileName) {
    alert('请输入文件名');
    return;
  }
  if (!fileName.endsWith('.json')) fileName += '.json';
  
  const filePath = `${config.dataDirectory}/${fileName}`;
  const success = await window.electronAPI.writeFile(filePath, defaultData);
  
  if (success) {
    document.getElementById('newFileName').value = '';
    await refreshFileList();
    await switchFile(fileName);
  } else {
    alert('创建文件失败');
  }
}

async function switchFile(fileName) {
  if (!config.dataDirectory) return;
  const filePath = `${config.dataDirectory}/${fileName}`;
  const fileData = await window.electronAPI.readFile(filePath);
  
  if (fileData) {
    data = fileData;
    config.currentFile = fileName;
    saveConfig();
    await refreshFileList();
    render();
  } else {
    alert('读取文件失败');
  }
}

function saveConfig() {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// Override existing saveData
async function saveData() {
  if (config.dataDirectory && config.currentFile) {
    const filePath = `${config.dataDirectory}/${config.currentFile}`;
    await window.electronAPI.writeFile(filePath, data);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

// Initialize
initApp();

// UI Interactions
function showSection(sectionId) {
  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    const text = item.querySelector('span:last-child').textContent;
    const sectionMap = {
      '控制面板': 'dashboard',
      '预算规划': 'budget',
      '每日记账': 'records',
      '数据分析': 'analysis',
      '警示清单': 'warnings',
      '数据管理': 'settings'
    };
    if (sectionMap[text] === sectionId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update section active state
  document.querySelectorAll('.section').forEach(section => {
    if (section.id === sectionId) {
      section.classList.add('active');
    } else {
      section.classList.remove('active');
    }
  });

  if (sectionId === 'analysis') {
    renderAnalysis();
  }
}

function render(){
  ["incomes","pools","limits","fixed","logs","warnings"].forEach(k => { if(!Array.isArray(data[k])) data[k]=[]; });
  renderIncomes(); renderPools(); renderLimits(); renderFixed(); renderLogs(); renderWarnings(); renderHistory(); renderAnalysis(); calculate(); saveData();
}

let currentAnalysisPeriod = 'month';

function updateAnalysisPeriod(period) {
  currentAnalysisPeriod = period;
  // Update button active state
  document.querySelectorAll('.period-selector .btn').forEach(btn => {
    if (btn.textContent.includes(period === 'month' ? '本月' : '本年')) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  renderAnalysis();
}

function renderAnalysis() {
  const today = todayISO();
  const now = new Date();
  const monthPrefix = today.slice(0, 7);
  const yearPrefix = today.slice(0, 4);

  const filterFn = currentAnalysisPeriod === 'month' 
    ? x => String(x.date).startsWith(monthPrefix)
    : x => String(x.date).startsWith(yearPrefix);

  const filteredLogs = data.logs.filter(filterFn);
  
  const stats = {
    income: totalByType(filteredLogs, "income"),
    expense: totalByType(filteredLogs, "expense"),
    saving: totalByType(filteredLogs, "saving"),
    count: filteredLogs.length
  };

  const netBalance = stats.income - stats.expense;
  const savingRate = stats.income > 0 ? (stats.saving / stats.income * 100) : 0;

  // Update Summary Stats
  set("analysisTotalIncome", yen(stats.income));
  set("analysisTotalExpense", yen(stats.expense));
  set("analysisSavingRate", Math.round(savingRate) + "%");
  set("analysisNetBalance", yen(netBalance));

  drawAnalysisTrendChart(filteredLogs);
  drawCategoryChart(filteredLogs);
  renderBudgetProgress(stats.expense);
  renderFinancialInsights(stats, filteredLogs);
}

function drawAnalysisTrendChart(logs) {
  const canvas = document.getElementById("analysisTrendChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + "px";
  canvas.style.height = rect.height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const now = new Date();
  let labels = [];
  let values = [];

  if (currentAnalysisPeriod === 'month') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      labels.push(String(i));
      values.push(totalByType(logs.filter(x => x.date === dateStr), "expense"));
    }
  } else {
    for (let i = 1; i <= 12; i++) {
      const monthStr = `${now.getFullYear()}-${String(i).padStart(2, '0')}`;
      labels.push(i + "月");
      values.push(totalByType(logs.filter(x => String(x.date).startsWith(monthStr)), "expense"));
    }
  }

  const max = Math.max(...values, 1000);
  const padding = 40;
  const w = rect.width - padding * 2;
  const h = rect.height - padding * 2;

  ctx.clearRect(0, 0, rect.width, rect.height);
  
  // Grid lines
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (i / 4) * h;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(rect.width - padding, y);
    ctx.stroke();
  }

  // Draw line
  const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
  gradient.addColorStop(0, 'rgba(79, 70, 229, 0.2)');
  gradient.addColorStop(1, 'rgba(79, 70, 229, 0)');

  ctx.strokeStyle = "#4f46e5";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.beginPath();
  values.forEach((val, i) => {
    const x = padding + (i / (labels.length - 1)) * w;
    const y = rect.height - padding - (val / max) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Area fill
  ctx.lineTo(rect.width - padding, rect.height - padding);
  ctx.lineTo(padding, rect.height - padding);
  ctx.fillStyle = gradient;
  ctx.fill();

  // X Labels
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  labels.forEach((label, i) => {
    if (labels.length > 12 && i % 5 !== 0 && i !== labels.length - 1) return;
    const x = padding + (i / (labels.length - 1)) * w;
    ctx.fillText(label, x, rect.height - padding + 20);
  });
}

function drawCategoryChart(logs) {
  const canvas = document.getElementById("analysisCategoryChart");
  const legend = document.getElementById("categoryLegend");
  if (!canvas || !legend) return;
  
  const expenseLogs = logs.filter(x => x.type === 'expense');
  const categories = {};
  expenseLogs.forEach(log => {
    const cat = log.category || "其他";
    categories[cat] = (categories[cat] || 0) + log.amount;
  });

  const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalExpense = expenseLogs.reduce((s, x) => s + x.amount, 0);

  const colors = ["#4f46e5", "#10b981", "#f59e0b", "#3b82f6", "#f43f5e", "#8b5cf6"];
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 200 * dpr;
  canvas.height = 200 * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, 200, 200);
  let start = -Math.PI / 2;
  
  if (totalExpense === 0) {
    ctx.fillStyle = "#f1f5f9";
    ctx.beginPath();
    ctx.arc(100, 100, 80, 0, Math.PI * 2);
    ctx.fill();
    legend.innerHTML = "<div class='hint'>暂无支出数据</div>";
    return;
  }

  sortedCats.forEach((cat, i) => {
    const angle = (cat[1] / totalExpense) * Math.PI * 2;
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(100, 100);
    ctx.arc(100, 100, 80, start, start + angle);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });

  // Inner circle for donut chart
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(100, 100, 50, 0, Math.PI * 2);
  ctx.fill();

  legend.innerHTML = sortedCats.map((cat, i) => `
    <div class="legend-item-pie">
      <div class="legend-label">
        <span class="color-dot" style="background:${colors[i % colors.length]}"></span>
        ${cat[0]}
      </div>
      <strong>${Math.round(cat[1] / totalExpense * 100)}%</strong>
    </div>
  `).join("");
}

function renderBudgetProgress(currentExpense) {
  const list = document.getElementById("budgetProgressList");
  if (!list) return;

  const monthBudget = sum(data.pools.filter(x => x.type !== 'saving'));
  const dayBudget = getEffectiveDailyLimit().total;
  
  const items = [
    { label: "本月总预算", current: currentExpense, total: monthBudget },
    { label: "今日可用限额", current: currentExpense / (new Date().getDate() || 1), total: dayBudget }
  ];

  list.innerHTML = items.map(item => {
    const rate = Math.min(100, (item.current / item.total * 100) || 0);
    const color = rate > 90 ? "var(--danger)" : (rate > 70 ? "var(--warning)" : "var(--success)");
    return `
      <div class="progress-item">
        <div class="progress-header">
          <span>${item.label}</span>
          <span>${yen(item.current)} / ${yen(item.total)}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: ${rate}%; background: ${color}"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderFinancialInsights(stats, logs) {
  const list = document.getElementById("financialInsights");
  if (!list) return;

  const insights = [];
  
  // 储蓄建议
  const savingRate = stats.income > 0 ? (stats.saving / stats.income * 100) : 0;
  if (savingRate < 20) {
    insights.push({ icon: "📉", text: `当前储蓄率仅为 ${Math.round(savingRate)}%，建议增加“储蓄类”资金池的比例，目标设为 30% 以上。` });
  } else {
    insights.push({ icon: "🌟", text: "储蓄习惯良好，请继续保持！可以考虑将闲置资金投入长期存钱计划。" });
  }

  // 消费建议
  const expenseRatio = stats.income > 0 ? (stats.expense / stats.income * 100) : 0;
  if (expenseRatio > 80) {
    insights.push({ icon: "⚠️", text: "支出占收入比重过高（超过80%），财务风险较大。请检查“支出构成”图表，寻找可削减的开支。" });
  }

  // 分类洞察
  const categories = {};
  logs.filter(x => x.type === 'expense').forEach(log => {
    categories[log.category] = (categories[log.category] || 0) + log.amount;
  });
  const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    insights.push({ icon: "🔍", text: `“${topCat[0]}”是您最大的开销项，共支出 ${yen(topCat[1])}。看看是否有平价替代方案？` });
  }

  // 结余建议
  if (stats.income - stats.expense < 0) {
    insights.push({ icon: "🚨", text: "本期入不敷出！请务必严格执行每日限额，并检查是否有不必要的固定扣费可以取消。" });
  }

  list.innerHTML = insights.slice(0, 3).map(item => `
    <div class="insight-item">
      <div class="insight-icon">${item.icon}</div>
      <div class="insight-text">${item.text}</div>
    </div>
  `).join("");
}

function renderIncomes(){
  const list = document.getElementById("incomeList");
  if(!list) return;
  list.innerHTML = data.incomes.map(x => `
    <div class="row income-row">
      <input value="${esc(x.name)}" onchange="updateItem('incomes','${x.id}','name',this.value)" />
      <input type="number" min="0" value="${x.amount}" onchange="updateItem('incomes','${x.id}','amount',this.value)" />
      <button class="btn danger-text small" onclick="deleteItem('incomes','${x.id}')">删除</button>
    </div>`).join("");
}

function renderPools(){
  const list = document.getElementById("poolList");
  if(!list) return;
  list.innerHTML = data.pools.map(x => `
    <div class="row pool-row">
      <input value="${esc(x.name)}" onchange="updateItem('pools','${x.id}','name',this.value)" />
      <select onchange="updateItem('pools','${x.id}','type',this.value)">
        <option value="common" ${x.type==='common'?'selected':''}>共同生活</option>
        <option value="personal" ${x.type==='personal'?'selected':''}>个人生活</option>
        <option value="saving" ${x.type==='saving'?'selected':''}>储蓄类</option>
        <option value="free" ${x.type==='free'?'selected':''}>可支配</option>
      </select>
      <input type="number" min="0" value="${x.amount}" onchange="updateItem('pools','${x.id}','amount',this.value)" />
      <button class="btn danger-text small" onclick="deleteItem('pools','${x.id}')">删除</button>
    </div>`).join("");
}

function renderLimits(){
  const list = document.getElementById("limitList");
  if(!list) return;
  const dayTypes = { all: "全天候", weekday: "平日(周一至五)", weekend: "假日(周六日)" };

  list.innerHTML = data.limits.map(x => `
    <div class="row limit-row">
      <input value="${esc(x.name)}" onchange="updateItem('limits','${x.id}','name',this.value)" placeholder="限额名称 (如: 平日饮食)" />
      <select onchange="updateItem('limits','${x.id}','dayType',this.value)">
        ${Object.entries(dayTypes).map(([k,v]) => `<option value="${k}" ${x.dayType===k?'selected':''}>${v}</option>`).join("")}
      </select>
      <input value="${esc(x.category)}" list="categorySuggestions" onchange="updateItem('limits','${x.id}','category',this.value)" placeholder="所属分类 (如: 饮食类)" />
      <input type="number" min="0" value="${x.amount}" onchange="updateItem('limits','${x.id}','amount',this.value)" placeholder="金额" />
      <button class="btn danger-text small" onclick="deleteItem('limits','${x.id}')">删除</button>
    </div>`).join("");
}

function renderFixed(){
  const list = document.getElementById("fixedList");
  if(!list) return;
  list.innerHTML = data.fixed.map(x => `
    <div class="row fixed-row">
      <input value="${esc(x.name)}" onchange="updateItem('fixed','${x.id}','name',this.value)" />
      <select onchange="updateItem('fixed','${x.id}','owner',this.value)">
        <option value="男方" ${x.owner==='男方'?'selected':''}>男方</option>
        <option value="女方" ${x.owner==='女方'?'selected':''}>女方</option>
        <option value="共同" ${x.owner==='共同'?'selected':''}>共同</option>
      </select>
      <input type="number" min="0" value="${x.amount}" onchange="updateItem('fixed','${x.id}','amount',this.value)" />
      <select onchange="updateItem('fixed','${x.id}','status',this.value)">
        <option ${x.status==='保留'?'selected':''}>保留</option>
        <option ${x.status==='检查'?'selected':''}>检查</option>
        <option ${x.status==='考虑取消'?'selected':''}>考虑取消</option>
        <option ${x.status==='已取消'?'selected':''}>已取消</option>
      </select>
      <button class="btn danger-text small" onclick="deleteItem('fixed','${x.id}')">删除</button>
    </div>`).join("");
}

function toggleDateGroup(date) {
  if (collapsedGroups.has(date)) {
    collapsedGroups.delete(date);
  } else {
    collapsedGroups.add(date);
  }
  renderLogs();
}

function renderLogs(){
  const list = document.getElementById("logList");
  if(!list) return;
  
  // 定义预设分类 (保持用户要求的顺序)
  const presetCategories = ["购物类", "日常类", "娱乐类", "医疗类", "交通类", "饮食类"];
  // 获取用户在限额中自定义的分类（排除预设分类和“其他”）
  const customCategories = [...new Set(data.limits.map(x => x.category)
    .filter(cat => cat && !presetCategories.includes(cat) && cat !== "其他" && cat !== "Other")
  )];
  // 合并所有分类
  const allCategories = [...presetCategories, ...customCategories];
  
  // 按日期分组
  const groups = {};
  data.logs.forEach(log => {
    if (!groups[log.date]) groups[log.date] = [];
    groups[log.date].push(log);
  });

  // 日期排序（降序）
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  if (sortedDates.length === 0) {
    list.innerHTML = `
      <div class="hint" style="text-align:center;padding:60px;">
        <div style="font-size:64px;margin-bottom:24px;">✍️</div>
        还没有记录，开始记第一笔账吧！
      </div>`;
    return;
  }

  list.innerHTML = sortedDates.map(date => {
    const logs = groups[date];
    const isCollapsed = collapsedGroups.has(date);
    const dayTotal = logs.filter(x => x.type === 'expense').reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
    
    return `
      <div class="log-date-group ${isCollapsed ? 'collapsed' : ''}">
        <div class="log-date-header" onclick="toggleDateGroup('${date}')">
          <div class="date-text">
            <span class="toggle-icon">▼</span>
            <span>📅 ${date}</span>
          </div>
          <span class="day-total">当日支出: ${yen(dayTotal)}</span>
        </div>
        <div class="rows">
          ${logs.map(x => `
            <div class="log-row log-row-grid type-${x.type}">
              <input type="date" value="${x.date}" onchange="updateItem('logs','${x.id}','date',this.value)" style="font-size: 12px; color: var(--text-muted);" />
              <select onchange="updateItem('logs','${x.id}','type',this.value)" style="font-weight: 700;">
                <option value="expense" ${x.type==='expense'?'selected':''}>💸 消费</option>
                <option value="income" ${x.type==='income'?'selected':''}>💰 收入</option>
                <option value="saving" ${x.type==='saving'?'selected':''}>🏦 储蓄</option>
              </select>
              <select onchange="updateItem('logs','${x.id}','person',this.value)">
                <option value="共同" ${x.person==='共同'?'selected':''}>👥 共同</option>
                <option value="男方" ${x.person==='男方'?'selected':''}>👨 男方</option>
                <option value="女方" ${x.person==='女方'?'selected':''}>👩 女方</option>
              </select>
              <select onchange="updateItem('logs','${x.id}','category',this.value)">
                <option value="" ${!x.category ? 'selected' : ''}>🏷️ 种类</option>
                ${allCategories.map(cat => `<option value="${cat}" ${x.category === cat ? 'selected' : ''}>${cat}</option>`).join("")}
                <option value="其他" ${x.category === 'Other' || x.category === '其他' ? 'selected' : ''}>其他</option>
              </select>
              <input value="${esc(x.note || '')}" placeholder="📝 备注 (地点、内容等)" onchange="updateItem('logs','${x.id}','note',this.value)" />
              <input type="number" class="amount-input" min="0" value="${x.amount}" onchange="updateItem('logs','${x.id}','amount',this.value)" />
              <button class="btn danger-text small" onclick="deleteItem('logs','${x.id}')" title="删除">🗑️</button>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function renderWarnings(){
  const list = document.getElementById("warningList");
  if(!list) return;
  const priorityText = { high:"高", mid:"中", low:"低" };
  const total = data.warnings.length;
  const done = data.warnings.filter(x => x.done).length;
  set("warningTotal", total); set("warningDone", done); set("warningRate", percent(total ? done / total * 100 : 0));
  list.innerHTML = data.warnings.map(x => `
    <div class="warning-item ${x.done?'done':''}">
      <input type="checkbox" ${x.done?'checked':''} onchange="updateItem('warnings','${x.id}','done',this.checked)" />
      <div class="text" style="flex:1">${esc(x.text)}</div>
      <span class="priority-tag ${x.priority}">${priorityText[x.priority] || '中'}</span>
      <button class="btn danger-text small" onclick="deleteItem('warnings','${x.id}')">删除</button>
    </div>`).join("");
}

function renderHistory(){
  const input = document.getElementById("historyDate");
  const listEl = document.getElementById("historyList");
  if(!input || !listEl) return;
  if(!input.value) input.value = todayISO();
  const date = input.value;
  const list = data.logs.filter(x => x.date === date);

  if(!list.length){
    listEl.innerHTML = `
      <div class="hint" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;">☕</div>
        这一天没有记录，是休息日吗？
      </div>`;
    return;
  }

  const dIncome = totalByType(list, "income");
  const dExpense = totalByType(list, "expense");
  const dSaving = totalByType(list, "saving");
  const limitInfo = getEffectiveDailyLimit(date);
  const limitDay = limitInfo.total;
  const left = limitDay - dExpense;

  const typeText = { expense:"消费", income:"收入", saving:"储蓄" };
  
  let html = `
    <div class="history-day-group">
      <div class="history-date-header">
        <span>📅 ${date} (${limitInfo.dayTypeInfo})</span>
        <span>${dExpense > limitDay ? '⚠️ 已超额' : '✅ 正常'}</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; margin-bottom: 20px;">
        <div class="summary-card" style="padding: 12px; border-radius: 12px;">
          <span style="font-size: 11px;">总支出</span>
          <strong style="font-size: 16px;">${yen(dExpense)}</strong>
        </div>
        ${Object.entries(limitInfo.categories).map(([cat, limit]) => {
          const spent = list.filter(x => x.category === cat && x.type === 'expense').reduce((s, x) => s + x.amount, 0);
          const cLeft = limit - spent;
          return `
            <div class="summary-card" style="padding: 12px; border-radius: 12px; border-top: 3px solid ${cLeft < 0 ? 'var(--danger)' : 'var(--success)'}">
              <span style="font-size: 11px;">${cat}剩余</span>
              <strong style="font-size: 16px; color: ${cLeft < 0 ? 'var(--danger)' : 'var(--text-main)'}">${yen(cLeft)}</strong>
            </div>
          `;
        }).join("")}
      </div>
      <div class="rows">
         ${list.map(x => `
          <div class="row history-row" style="background: white; border: 1px solid var(--border);">
            <div class="type-${x.type}" style="font-weight:700; color: ${x.type==='expense'?'var(--danger)':'var(--success)'}">${typeText[x.type] || x.type}</div>
            <div>${esc(x.person || "共同")}</div>
            <div style="flex:1">
              <span class="history-category">${esc(x.category || "未分类")}</span>
              <span class="history-note">${x.note ? ' - ' + esc(x.note) : ''}</span>
            </div>
            <div style="text-align:right;font-weight:800;color:var(--text-main)">${yen(x.amount)}</div>
            <button class="btn danger-text small" onclick="deleteItem('logs','${x.id}')">删除</button>
          </div>
        `).join("")}
       </div>
    </div>
  `;
  listEl.innerHTML = html;
}

function setHistoryToday(){
  const input = document.getElementById("historyDate");
  if(!input) return;
  input.value = todayISO();
  renderHistory();
}

function changeHistoryDate(days){
  const input = document.getElementById("historyDate");
  if(!input) return;
  const base = input.value ? new Date(input.value) : new Date(todayISO());
  base.setDate(base.getDate() + days);
  input.value = base.toISOString().slice(0,10);
  renderHistory();
}

function exportSelectedDay(){
  const input = document.getElementById("historyDate");
  const date = input && input.value ? input.value : todayISO();
  const records = data.logs.filter(x => x.date === date);
  const payload = {
    date,
    exportedAt: new Date().toISOString(),
    summary: {
      income: totalByType(records,"income"),
      saving: totalByType(records,"saving"),
      expense: totalByType(records,"expense"),
      count: records.length
    },
    records
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-record-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function calculate(){
  const incomeTotal = sum(data.incomes);
  const poolTotal = sum(data.pools);
  const savingTotal = data.pools.filter(x => x.type === "saving").reduce((s,x)=>s+Number(x.amount||0),0);
  const fixedTotal = data.fixed.filter(x => x.status !== "已取消").reduce((s,x)=>s+Number(x.amount||0),0);
  const today = todayISO();
  const now = new Date(today);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay()+6)%7));
  const monthPrefix = today.slice(0,7);
  const yearPrefix = today.slice(0,4);

  const ranges = {
    d: x => x.date === today,
    w: x => new Date(x.date) >= weekStart && new Date(x.date) <= now,
    m: x => String(x.date).startsWith(monthPrefix),
    y: x => String(x.date).startsWith(yearPrefix)
  };
  const report = key => {
    const list = data.logs.filter(ranges[key]);
    return {
      income: totalByType(list,"income"),
      saving: totalByType(list,"saving"),
      expense: totalByType(list,"expense"),
      list: list
    };
  };
  const d=report("d"), w=report("w"), m=report("m"), y=report("y");
  
  const limitInfo = getEffectiveDailyLimit();
  const limitDay = limitInfo.total;
  const limitWeek = limitDay * 7; // 简单估算周限额
  const todayLeft = Math.max(0, limitDay - d.expense);

  set("sumIncome", yen(incomeTotal));
  set("sumBudget", yen(poolTotal));
  set("sumSaving", yen(savingTotal));
  set("sumTodayLeft", yen(todayLeft));
  set("currentDailyLimit", yen(limitDay));
  set("dailyLimitSource", `今日为：${limitInfo.dayTypeInfo}`);
  
  const grid = document.getElementById("categoryLimitsGrid");
  if (grid) {
    grid.innerHTML = Object.entries(limitInfo.categories).map(([cat, limit]) => {
      const spent = d.list.filter(x => x.category === cat && x.type === 'expense').reduce((s, x) => s + x.amount, 0);
      const left = limit - spent;
      return `
        <div style="font-size: 13px;">
          <div style="color: var(--text-muted); margin-bottom: 2px;">${cat}</div>
          <div style="display: flex; justify-content: space-between;">
            <strong style="color: ${left < 0 ? 'var(--danger)' : 'var(--text-main)'}">${yen(left)}</strong>
            <span style="color: var(--text-muted); font-size: 11px;">/ ${yen(limit)}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  set("incomeTotal", yen(incomeTotal));
  set("poolTotal", yen(poolTotal));
  set("fixedTotal", yen(fixedTotal));

  const warningEl = document.getElementById("budgetWarning");
  if (warningEl) {
    warningEl.style.display = (incomeTotal === poolTotal) ? "none" : "block";
  }

  setPeriod("d", d, limitDay);
  setPeriod("w", w, limitWeek);
  setPeriod("m", m, incomeTotal - savingTotal);
  // setPeriod("y", y, (incomeTotal - savingTotal) * 12);

  drawChart();
}

function setPeriod(prefix, r, budget){
  set(prefix+"Income", yen(r.income));
  set(prefix+"Saving", yen(r.saving));
  set(prefix+"Expense", yen(r.expense));
  set(prefix+"Left", yen((budget || 0) + r.income - r.saving - r.expense));
}
function sum(list){ return list.reduce((s,x)=>s+Number(x.amount||0),0); }
function totalByType(list,type){ return list.filter(x=>x.type===type).reduce((s,x)=>s+Number(x.amount||0),0); }

function getEffectiveDailyLimit(targetDate = null) {
  const dateObj = targetDate ? new Date(targetDate) : new Date();
  const day = dateObj.getDay(); // 0 (Sun) to 6 (Sat)
  const isWeekend = (day === 0 || day === 6);
  const currentDayType = isWeekend ? "weekend" : "weekday";
  
  // 动态获取当前所有已定义的限额分类
  const categories = [...new Set(data.limits.map(x => x.category).filter(Boolean))];
  
  const results = {
    total: 0,
    categories: {},
    dayTypeInfo: isWeekend ? "假日" : "平日"
  };

  categories.forEach(cat => {
    // 寻找匹配当前日期类型和分类的限额
    const match = data.limits.find(x => 
      (x.dayType === currentDayType || x.dayType === "all") && 
      x.category === cat
    );
    if (match) {
      const amount = Number(match.amount || 0);
      results.categories[cat] = amount;
      results.total += amount;
    }
  });

  return results;
}

function drawChart(){
  const canvas=document.getElementById("poolChart"), legend=document.getElementById("poolLegend");
  if(!canvas || !legend) return;
  const colors = { common:"#4f46e5", personal:"#10b981", saving:"#f59e0b", free:"#3b82f6" };
  const groups = [
    { label:"共同生活", value:data.pools.filter(x=>x.type==='common').reduce((s,x)=>s+Number(x.amount||0),0), color:colors.common },
    { label:"个人生活", value:data.pools.filter(x=>x.type==='personal').reduce((s,x)=>s+Number(x.amount||0),0), color:colors.personal },
    { label:"储蓄类", value:data.pools.filter(x=>x.type==='saving').reduce((s,x)=>s+Number(x.amount||0),0), color:colors.saving },
    { label:"可支配", value:data.pools.filter(x=>x.type==='free').reduce((s,x)=>s+Number(x.amount||0),0), color:colors.free }
  ];
  const size=220,dpr=window.devicePixelRatio||1,ctx=canvas.getContext("2d");
  canvas.width=size*dpr; canvas.height=size*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,size,size);
  const total=groups.reduce((s,x)=>s+Math.max(0,x.value),0); let start=-Math.PI/2;
  if(total){
    groups.forEach(g=>{ const a=Math.max(0,g.value)/total*Math.PI*2; ctx.beginPath(); ctx.arc(110,110,90,start,start+a); ctx.arc(110,110,60,start+a,start,true); ctx.closePath(); ctx.fillStyle=g.color; ctx.fill(); start+=a; });
    ctx.textAlign="center"; ctx.fillStyle="#1e293b"; ctx.font="800 14px sans-serif"; ctx.fillText("资金分流",110,105); ctx.fillStyle="#64748b"; ctx.font="700 12px sans-serif"; ctx.fillText(yen(total),110,125);
  }
  legend.innerHTML=groups.map(g=>`<div class="legend-item"><span><span class="color-dot" style="background:${g.color}"></span>${g.label}</span><strong>${yen(g.value)}</strong></div>`).join("");
}

function updateItem(group,id,key,value){
  const item=data[group].find(x=>x.id===id); if(!item) return;
  if(["amount"].includes(key)) item[key]=Math.round(Number(value||0)); else item[key]=value;
  render();
}
function deleteItem(group,id){ data[group]=data[group].filter(x=>x.id!==id); render(); }
function addIncome(){ data.incomes.push({id:id(),name:"新收入",amount:0}); render(); }
function addPool(){ data.pools.push({id:id(),name:"新资金池",type:"common",amount:0}); render(); }

function recommendAllocation() {
  const incomeTotal = sum(data.incomes);
  if (incomeTotal <= 0) {
    alert("请先设置收入来源。");
    return;
  }
  if (data.pools.length === 0) {
    alert("请先添加至少一个资金池。");
    return;
  }

  // 推荐权重
  const weights = { saving: 0.3, common: 0.4, personal: 0.2, free: 0.1 };
  
  // 统计现有池类型
  const typesInPools = [...new Set(data.pools.map(p => p.type))];
  const availableWeights = typesInPools.reduce((acc, t) => acc + (weights[t] || 0), 0);
  
  if (availableWeights === 0) {
    // 如果都没有定义的权重，则平分
    const perPool = Math.floor(incomeTotal / data.pools.length);
    data.pools.forEach(p => p.amount = perPool);
  } else {
    // 按权重分配，并考虑同一类型的多个池平分该类型的权重
    data.pools.forEach(p => {
      const typeWeight = weights[p.type] || 0;
      const typeCount = data.pools.filter(x => x.type === p.type).length;
      p.amount = Math.round((incomeTotal * (typeWeight / availableWeights)) / typeCount);
    });
  }

  // 处理舍入误差，将差额补在第一个池子上（确保总计依然等于收入总计）
  const currentTotal = sum(data.pools);
  if (currentTotal !== incomeTotal && data.pools.length > 0) {
    data.pools[0].amount += (incomeTotal - currentTotal);
  }

  render();
}

function addLimit(){ data.limits.push({id:id(),name:"新限额",dayType:"all",category:"",amount:0}); render(); }
function addFixed(){ data.fixed.push({id:id(),name:"新固定扣费",owner:"共同",amount:0,status:"检查"}); render(); }
function addLog(){ data.logs.unshift({id:id(),date:todayISO(),type:"expense",person:"共同",category:"",note:"",amount:0}); render(); }
function addWarning(){ const text=document.getElementById("warningText").value.trim(); const priority=document.getElementById("warningPriority").value; if(!text) return; data.warnings.push({id:id(),text,priority,done:false}); document.getElementById("warningText").value=""; render(); }
function resetWarnings(){ data.warnings=data.warnings.map(x=>({...x,done:false})); render(); }

function exportData(){ const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="dynamic-savings-plan-backup.json"; a.click(); URL.revokeObjectURL(url); }
function importData(event){ const file=event.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ const imported=JSON.parse(reader.result); data=imported; render(); }catch{ alert("导入失败，请确认JSON格式正确"); } }; reader.readAsText(file); event.target.value=""; }
function resetData(){ if(!confirm("确定恢复默认数据吗？当前修改会被覆盖。")) return; data=structuredClone(defaultData); render(); }

window.addEventListener("resize", drawChart);
document.addEventListener("DOMContentLoaded", render);
