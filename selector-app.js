const ACTIVE_PROFILE_KEY = "couple-budget-active-profile-v1";
const BUDGET_KEY = "couple-budget-shared-data-v1";
const DEFAULT_TAB = "monthly";

const USERS = [
  { id: "husband", name: "우진", avatar: "우" },
  { id: "wife", name: "하정", avatar: "하" }
];

const elements = {
  appShell: document.getElementById("appShell"),
  protectedContent: document.getElementById("protectedContent"),
  authPanel: document.getElementById("authPanel"),
  authError: document.getElementById("authError"),
  profileList: document.getElementById("profileList"),
  householdUser: document.getElementById("householdUser"),
  refreshButton: document.getElementById("refreshButton"),
  summaryCards: document.getElementById("summaryCards"),
  fixedExpenseForm: document.getElementById("fixedExpenseForm"),
  fixedExpenseList: document.getElementById("fixedExpenseList"),
  transactionForm: document.getElementById("transactionForm"),
  transactionList: document.getElementById("transactionList"),
  monthlyBreakdown: document.getElementById("monthlyBreakdown"),
  monthlyChart: document.getElementById("monthlyChart"),
  dailyChart: document.getElementById("dailyChart"),
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  tabPanels: [...document.querySelectorAll("[data-tab-panel]")]
};

const appState = {
  activeProfileId: localStorage.getItem(ACTIVE_PROFILE_KEY),
  activeProfile: null,
  activeTab: DEFAULT_TAB,
  fixedExpenses: [],
  transactions: []
};

initialize();

function initialize() {
  elements.transactionForm.querySelector('input[name="date"]').value = getTodayString();
  elements.profileList.addEventListener("click", handleProfileSelection);
  elements.refreshButton.addEventListener("click", returnToProfileSelect);
  elements.fixedExpenseForm.addEventListener("submit", handleFixedExpenseSubmit);
  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.fixedExpenseList.addEventListener("click", handleFixedExpenseDelete);
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });
  window.addEventListener("resize", renderVisibleCharts);

  loadBudgetState();

  const rememberedProfile = USERS.find((profile) => profile.id === appState.activeProfileId);
  if (rememberedProfile) {
    activateProfile(rememberedProfile.id);
  } else {
    showProfileSelect();
  }
}

function loadBudgetState() {
  const saved = localStorage.getItem(BUDGET_KEY);
  if (!saved) {
    saveBudgetState();
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    appState.fixedExpenses = Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : [];
    appState.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  } catch {
    appState.fixedExpenses = [];
    appState.transactions = [];
    saveBudgetState();
  }
}

function saveBudgetState() {
  localStorage.setItem(BUDGET_KEY, JSON.stringify({
    fixedExpenses: appState.fixedExpenses,
    transactions: appState.transactions
  }));
}

function handleProfileSelection(event) {
  const button = event.target.closest("[data-profile-id]");
  if (!button) {
    return;
  }

  activateProfile(button.dataset.profileId);
}

function activateProfile(profileId) {
  const profile = USERS.find((item) => item.id === profileId);
  if (!profile) {
    showProfileSelect();
    return;
  }

  appState.activeProfile = profile;
  appState.activeProfileId = profile.id;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  showDashboard();
}

function returnToProfileSelect() {
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
  appState.activeProfileId = null;
  appState.activeProfile = null;
  showProfileSelect();
}

function showProfileSelect() {
  elements.appShell.classList.add("page-shell--select");
  elements.authPanel.classList.remove("is-hidden");
  elements.protectedContent.classList.add("is-hidden");
  elements.authError.textContent = "";
}

function showDashboard() {
  elements.appShell.classList.remove("page-shell--select");
  elements.authPanel.classList.add("is-hidden");
  elements.protectedContent.classList.remove("is-hidden");
  elements.householdUser.textContent = appState.activeProfile.name;
  render();
  setActiveTab(DEFAULT_TAB);
}

function setActiveTab(tabName) {
  appState.activeTab = tabName;
  elements.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.tabPanel === tabName);
  });
  renderVisibleCharts();
}

function handleFixedExpenseSubmit(event) {
  event.preventDefault();
  if (!appState.activeProfile) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const name = formData.get("name").toString().trim();
  const amount = Number(formData.get("amount"));
  if (!name || amount <= 0) {
    return;
  }

  appState.fixedExpenses.unshift({
    id: crypto.randomUUID(),
    name,
    amount,
    createdBy: appState.activeProfile.name,
    createdAt: new Date().toISOString()
  });
  event.currentTarget.reset();
  saveBudgetState();
  render();
}

function handleTransactionSubmit(event) {
  event.preventDefault();
  if (!appState.activeProfile) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const transaction = {
    id: crypto.randomUUID(),
    date: formData.get("date").toString(),
    type: formData.get("type").toString(),
    category: formData.get("category").toString().trim(),
    amount: Number(formData.get("amount")),
    note: formData.get("note").toString().trim(),
    createdBy: appState.activeProfile.name,
    createdAt: new Date().toISOString()
  };

  if (!transaction.date || !transaction.category || transaction.amount <= 0) {
    return;
  }

  appState.transactions.unshift(transaction);
  event.currentTarget.reset();
  elements.transactionForm.querySelector('input[name="date"]').value = getTodayString();
  saveBudgetState();
  render();
}

function handleFixedExpenseDelete(event) {
  const button = event.target.closest("[data-delete-id]");
  if (!button) {
    return;
  }

  appState.fixedExpenses = appState.fixedExpenses.filter((item) => item.id !== button.dataset.deleteId);
  saveBudgetState();
  render();
}

function render() {
  renderSummaryCards();
  renderMonthlyBreakdown();
  renderFixedExpenses();
  renderTransactions();
  renderVisibleCharts();
}

function renderSummaryCards() {
  const monthly = getCurrentMonthSummary();
  const fixedTotal = getFixedExpenseTotal();
  const totalExpense = monthly.expense + fixedTotal;
  const savings = monthly.income - totalExpense;
  const savingsRate = monthly.income > 0 ? Math.round((savings / monthly.income) * 100) : 0;

  const cards = [
    { title: "이번 달 수입", value: formatCurrency(monthly.income), className: "amount amount--income", subtext: "등록된 수입 합계" },
    { title: "이번 달 지출", value: formatCurrency(totalExpense), className: "amount amount--expense", subtext: `고정비 ${formatCurrency(fixedTotal)} 포함` },
    { title: "예상 저축", value: formatCurrency(savings), className: `amount ${savings >= 0 ? "amount--saving" : "amount--expense"}`, subtext: `저축률 ${savingsRate}%` },
    { title: "작성자", value: appState.activeProfile?.name || "미선택", className: "amount", subtext: "새 내역에 저장될 사용자" }
  ];

  elements.summaryCards.innerHTML = cards.map((card) => `
    <article class="summary-card">
      <h3>${card.title}</h3>
      <div class="${card.className}">${card.value}</div>
      <p class="subtext">${card.subtext}</p>
    </article>
  `).join("");
}

function renderMonthlyBreakdown() {
  const current = getCurrentMonthSummary();
  const fixedTotal = getFixedExpenseTotal();
  const totalExpense = current.expense + fixedTotal;
  const savings = current.income - totalExpense;
  const average = getMonthlyAverageExpense();

  const cards = [
    { title: "고정비 합계", value: formatCurrency(fixedTotal), helper: "매월 반복 비용" },
    { title: "변동 지출", value: formatCurrency(current.expense), helper: "이번 달 일반 지출" },
    { title: "월 평균 지출", value: formatCurrency(average), helper: "최근 6개월 기준" },
    { title: "총 지출", value: formatCurrency(totalExpense), helper: "고정비 + 변동 지출" },
    { title: "총 수입", value: formatCurrency(current.income), helper: "이번 달 수입 합계" },
    { title: "남은 금액", value: formatCurrency(savings), helper: "수입 - 총 지출" }
  ];

  elements.monthlyBreakdown.innerHTML = cards.map((card) => `
    <article class="insight-card">
      <h3>${card.title}</h3>
      <div class="amount">${card.value}</div>
      <p class="subtext">${card.helper}</p>
    </article>
  `).join("");
}

function renderFixedExpenses() {
  if (appState.fixedExpenses.length === 0) {
    elements.fixedExpenseList.innerHTML = '<div class="empty-state">아직 등록된 고정비가 없습니다.</div>';
    return;
  }

  elements.fixedExpenseList.innerHTML = [...appState.fixedExpenses]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .map((item) => `
      <article class="fixed-item">
        <div class="fixed-item__meta">
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.createdBy || "미지정")} 등록</p>
        </div>
        <div class="fixed-item__actions">
          <div class="amount amount--expense">${formatCurrency(item.amount)}</div>
          <button type="button" data-delete-id="${item.id}">삭제</button>
        </div>
      </article>
    `).join("");
}

function renderTransactions() {
  const sorted = [...appState.transactions]
    .sort((a, b) => `${b.date}${b.createdAt || ""}`.localeCompare(`${a.date}${a.createdAt || ""}`));

  if (sorted.length === 0) {
    elements.transactionList.innerHTML = '<div class="empty-state">아직 기록된 수입 / 지출 내역이 없습니다.</div>';
    return;
  }

  const rows = sorted.map((entry) => `
    <tr>
      <td>${entry.date}</td>
      <td><span class="pill pill--${entry.type}">${entry.type === "income" ? "수입" : "지출"}</span></td>
      <td>${escapeHtml(entry.category)}</td>
      <td>${escapeHtml(entry.createdBy || "미지정")}</td>
      <td>${escapeHtml(entry.note || "-")}</td>
      <td class="amount ${entry.type === "income" ? "amount--income" : "amount--expense"}">${formatCurrency(entry.amount)}</td>
    </tr>
  `).join("");

  elements.transactionList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>날짜</th>
          <th>구분</th>
          <th>카테고리</th>
          <th>작성자</th>
          <th>메모</th>
          <th>금액</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderVisibleCharts() {
  if (appState.activeTab === "monthly") {
    renderGroupedBarChart(elements.monthlyChart, getMonthlyTrend(), { includeFixedExpense: true });
  }
  if (appState.activeTab === "daily") {
    renderGroupedBarChart(elements.dailyChart, getDailyTrend(), { includeFixedExpense: false });
  }
}

function renderGroupedBarChart(canvas, chartData, options = {}) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  const fixedTotal = options.includeFixedExpense ? getFixedExpenseTotal() : 0;
  const incomes = chartData.map((item) => item.income);
  const expenses = chartData.map((item) => item.expense + fixedTotal);
  const maxValue = Math.max(...incomes, ...expenses, 100000);

  const width = Math.max(canvas.clientWidth, 320) * window.devicePixelRatio;
  const height = canvas.clientHeight * window.devicePixelRatio;
  canvas.width = width;
  canvas.height = height;
  context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  const drawWidth = canvas.clientWidth;
  const drawHeight = canvas.clientHeight;
  context.clearRect(0, 0, drawWidth, drawHeight);

  const padding = { top: 18, right: 18, bottom: 34, left: 18 };
  const chartHeight = drawHeight - padding.top - padding.bottom;
  const columnWidth = (drawWidth - padding.left - padding.right) / Math.max(chartData.length, 1);
  const barWidth = Math.min(24, columnWidth * 0.25);
  const baseline = padding.top + chartHeight;

  context.strokeStyle = "rgba(84, 96, 112, 0.14)";
  context.lineWidth = 1;
  for (let index = 0; index < 4; index += 1) {
    const y = padding.top + (chartHeight / 3) * index;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(drawWidth - padding.right, y);
    context.stroke();
  }

  chartData.forEach((item, index) => {
    const baseX = padding.left + index * columnWidth;
    const incomeHeight = (incomes[index] / maxValue) * chartHeight;
    const expenseHeight = (expenses[index] / maxValue) * chartHeight;

    context.fillStyle = "#2563eb";
    roundRect(context, baseX + columnWidth * 0.22, baseline - incomeHeight, barWidth, incomeHeight, 8);

    context.fillStyle = "#dc2626";
    roundRect(context, baseX + columnWidth * 0.55, baseline - expenseHeight, barWidth, expenseHeight, 8);

    context.fillStyle = "#667085";
    context.font = '12px "Segoe UI", "Malgun Gothic", sans-serif';
    context.textAlign = "center";
    context.fillText(item.label, baseX + columnWidth * 0.5, drawHeight - 12);
  });
}

function getCurrentMonthSummary() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentTransactions = appState.transactions.filter((entry) => entry.date.startsWith(monthKey));
  return summarizeTransactions(currentTransactions);
}

function getMonthlyAverageExpense() {
  const trend = getMonthlyTrend();
  const fixedTotal = getFixedExpenseTotal();
  const totals = trend.map((item) => item.expense + fixedTotal);
  return totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0;
}

function getMonthlyTrend() {
  const months = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthTransactions = appState.transactions.filter((entry) => entry.date.startsWith(key));
    months.push({
      key,
      label: `${date.getMonth() + 1}월`,
      ...summarizeTransactions(monthTransactions)
    });
  }
  return months;
}

function getDailyTrend() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dailyTransactions = appState.transactions.filter((entry) => entry.date === key);
    days.push({
      key,
      label: String(day),
      ...summarizeTransactions(dailyTransactions)
    });
  }
  return days;
}

function summarizeTransactions(transactions) {
  return {
    income: transactions
      .filter((entry) => entry.type === "income")
      .reduce((sum, entry) => sum + Number(entry.amount), 0),
    expense: transactions
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + Number(entry.amount), 0)
  };
}

function getFixedExpenseTotal() {
  return appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
}

function roundRect(context, x, y, width, height, radius) {
  if (height <= 0) {
    return;
  }

  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fill();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
