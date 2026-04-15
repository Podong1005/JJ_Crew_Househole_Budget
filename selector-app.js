const PROFILES_KEY = "couple-budget-profiles-v1";
const ACTIVE_PROFILE_KEY = "couple-budget-active-profile-v1";
const BUDGET_KEY = "couple-budget-shared-data-v1";

const elements = {
  appShell: document.getElementById("appShell"),
  protectedContent: document.getElementById("protectedContent"),
  authPanel: document.getElementById("authPanel"),
  authForm: document.getElementById("authForm"),
  authError: document.getElementById("authError"),
  profileList: document.getElementById("profileList"),
  profileEmptyState: document.getElementById("profileEmptyState"),
  dashboardState: document.getElementById("dashboardState"),
  householdPanel: document.getElementById("householdPanel"),
  householdName: document.getElementById("householdName"),
  householdInviteCode: document.getElementById("householdInviteCode"),
  householdUser: document.getElementById("householdUser"),
  householdMessage: document.getElementById("householdMessage"),
  refreshButton: document.getElementById("refreshButton"),
  summaryCards: document.getElementById("summaryCards"),
  fixedExpenseForm: document.getElementById("fixedExpenseForm"),
  fixedExpenseList: document.getElementById("fixedExpenseList"),
  transactionForm: document.getElementById("transactionForm"),
  transactionList: document.getElementById("transactionList"),
  monthlyBreakdown: document.getElementById("monthlyBreakdown"),
  monthlyChart: document.getElementById("monthlyChart")
};

const appState = {
  profiles: loadProfiles(),
  activeProfileId: localStorage.getItem(ACTIVE_PROFILE_KEY),
  activeProfile: null,
  fixedExpenses: [],
  transactions: []
};

initialize();

function initialize() {
  elements.transactionForm.querySelector('input[name="date"]').value = getTodayString();
  elements.authForm.addEventListener("submit", handleCreateProfile);
  elements.profileList.addEventListener("click", handleProfileSelection);
  elements.refreshButton.addEventListener("click", returnToProfileSelect);
  elements.fixedExpenseForm.addEventListener("submit", handleFixedExpenseSubmit);
  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.fixedExpenseList.addEventListener("click", handleFixedExpenseDelete);
  window.addEventListener("resize", renderChart);

  loadBudgetState();
  renderProfilePicker();

  const rememberedProfile = appState.profiles.find((profile) => profile.id === appState.activeProfileId);
  if (rememberedProfile) {
    activateProfile(rememberedProfile.id);
  } else {
    showProfileSelect();
  }
}

function loadProfiles() {
  const saved = localStorage.getItem(PROFILES_KEY);
  if (!saved) {
    return [];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProfiles() {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(appState.profiles));
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

function handleCreateProfile(event) {
  event.preventDefault();
  const profileName = new FormData(event.currentTarget).get("profileName").toString().trim();

  if (!profileName) {
    elements.authError.textContent = "이름을 입력해 주세요.";
    return;
  }

  const duplicate = appState.profiles.find((profile) => profile.name === profileName);
  if (duplicate) {
    elements.authError.textContent = "같은 이름의 계정이 이미 있어요. 아래 목록에서 선택해 주세요.";
    return;
  }

  const profile = { id: crypto.randomUUID(), name: profileName, createdAt: new Date().toISOString() };
  appState.profiles.unshift(profile);
  saveProfiles();
  event.currentTarget.reset();
  elements.authError.textContent = "";
  renderProfilePicker();
  activateProfile(profile.id);
}

function handleProfileSelection(event) {
  const button = event.target.closest("[data-profile-id]");
  if (!button) {
    return;
  }

  activateProfile(button.dataset.profileId);
}

function activateProfile(profileId) {
  const profile = appState.profiles.find((item) => item.id === profileId);
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
  elements.appShell.classList.add("page-shell--auth");
  elements.authPanel.classList.remove("is-hidden");
  elements.protectedContent.classList.add("is-hidden");
  elements.dashboardState.classList.add("is-hidden");
  elements.householdPanel.classList.add("is-hidden");
  renderProfilePicker();
}

function showDashboard() {
  elements.appShell.classList.remove("page-shell--auth");
  elements.authPanel.classList.add("is-hidden");
  elements.protectedContent.classList.remove("is-hidden");
  elements.dashboardState.classList.add("is-hidden");
  elements.householdPanel.classList.remove("is-hidden");
  elements.householdName.textContent = "우리집 가계부";
  elements.householdInviteCode.textContent = appState.activeProfile.name;
  elements.householdUser.textContent = appState.activeProfile.name;
  elements.householdMessage.textContent = "계정 목록으로 돌아가려면 '계정 목록으로'를 눌러 주세요.";
  render();
}

function renderProfilePicker() {
  const hasProfiles = appState.profiles.length > 0;
  elements.profileEmptyState.classList.toggle("is-hidden", hasProfiles);

  if (!hasProfiles) {
    elements.profileList.innerHTML = "";
    return;
  }

  elements.profileList.innerHTML = appState.profiles.map((profile) => `
    <button type="button" class="profile-card" data-profile-id="${profile.id}">
      <span class="profile-card__avatar">${escapeHtml(profile.name.slice(0, 1).toUpperCase())}</span>
      <span class="profile-card__name">${escapeHtml(profile.name)}</span>
      <span class="profile-card__hint">이 계정으로 들어가기</span>
    </button>
  `).join("");
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

  appState.fixedExpenses.unshift({ id: crypto.randomUUID(), name, amount, createdBy: appState.activeProfile.name });
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
  renderFixedExpenses();
  renderMonthlyBreakdown();
  renderTransactions();
  renderChart();
}

function renderSummaryCards() {
  const monthly = getCurrentMonthSummary();
  const fixedTotal = appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const savingsRate = monthly.income > 0 ? Math.round((monthly.savings / monthly.income) * 100) : 0;

  const cards = [
    { title: "이번 달 수입", value: formatCurrency(monthly.income), className: "amount amount--income", subtext: "이번 달에 기록된 모든 수입 합계" },
    { title: "이번 달 소비", value: formatCurrency(monthly.expense + fixedTotal), className: "amount amount--expense", subtext: `고정비 ${formatCurrency(fixedTotal)} 포함` },
    { title: "예상 저축", value: formatCurrency(monthly.savings), className: `amount ${monthly.savings >= 0 ? "amount--saving" : "amount--expense"}`, subtext: `저축률 ${savingsRate}%` }
  ];

  elements.summaryCards.innerHTML = cards.map((card) => `
    <article class="summary-card">
      <h3>${card.title}</h3>
      <div class="${card.className}">${card.value}</div>
      <p class="subtext">${card.subtext}</p>
    </article>
  `).join("");
}

function renderFixedExpenses() {
  if (appState.fixedExpenses.length === 0) {
    elements.fixedExpenseList.innerHTML = '<div class="empty-state">아직 등록된 고정비가 없어요.</div>';
    return;
  }

  elements.fixedExpenseList.innerHTML = [...appState.fixedExpenses]
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .map((item) => `
      <article class="fixed-item">
        <div class="fixed-item__meta">
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.createdBy || "기록자 없음")}</p>
        </div>
        <div class="fixed-item__actions">
          <div class="amount amount--expense">${formatCurrency(item.amount)}</div>
          <button type="button" data-delete-id="${item.id}">삭제</button>
        </div>
      </article>
    `).join("");
}

function renderMonthlyBreakdown() {
  const current = getCurrentMonthSummary();
  const fixedTotal = appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const totalExpense = current.expense + fixedTotal;
  const average = getMonthlyAverageExpense();

  const cards = [
    { title: "고정비 합계", value: formatCurrency(fixedTotal), helper: "매달 반복 비용" },
    { title: "변동 지출", value: formatCurrency(current.expense), helper: "식비, 교통, 쇼핑 등" },
    { title: "월 평균 소비", value: formatCurrency(average), helper: "최근 기록 기준" },
    { title: "총 소비", value: formatCurrency(totalExpense), helper: "고정비 + 변동 지출" },
    { title: "총 수입", value: formatCurrency(current.income), helper: "이번 달 수입 합계" },
    { title: "남은 저축 여력", value: formatCurrency(current.savings), helper: "수입 - 총 소비" }
  ];

  elements.monthlyBreakdown.innerHTML = cards.map((card) => `
    <article class="insight-card">
      <h3>${card.title}</h3>
      <div class="amount">${card.value}</div>
      <p class="subtext">${card.helper}</p>
    </article>
  `).join("");
}

function renderTransactions() {
  const sorted = [...appState.transactions].sort((a, b) => `${b.date}${b.createdAt || ""}`.localeCompare(`${a.date}${a.createdAt || ""}`));
  if (sorted.length === 0) {
    elements.transactionList.innerHTML = '<div class="empty-state">아직 기록된 수입 / 지출 내역이 없어요.</div>';
    return;
  }

  const rows = sorted.slice(0, 12).map((entry) => `
    <tr>
      <td>${entry.date}</td>
      <td><span class="pill pill--${entry.type}">${entry.type === "income" ? "수입" : "지출"}</span></td>
      <td>${escapeHtml(entry.category)}</td>
      <td>${escapeHtml(entry.note || "-")}<br><span class="table-meta">${escapeHtml(entry.createdBy || "")}</span></td>
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
          <th>메모</th>
          <th>금액</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderChart() {
  const canvas = elements.monthlyChart;
  const context = canvas.getContext("2d");
  const chartData = getMonthlyTrend();
  const fixedTotal = appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = chartData.map((item) => item.expense + fixedTotal);
  const savings = chartData.map((item) => item.income - (item.expense + fixedTotal));
  const maxPositive = Math.max(...expenses, ...savings.filter((value) => value > 0), 100000);
  const maxNegative = Math.min(...savings.filter((value) => value < 0), 0);

  const width = canvas.clientWidth * window.devicePixelRatio;
  const height = canvas.clientHeight * window.devicePixelRatio;
  canvas.width = width;
  canvas.height = height;
  context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  const drawWidth = canvas.clientWidth;
  const drawHeight = canvas.clientHeight;
  context.clearRect(0, 0, drawWidth, drawHeight);

  const padding = { top: 20, right: 24, bottom: 36, left: 24 };
  const chartHeight = drawHeight - padding.top - padding.bottom;
  const columnWidth = (drawWidth - padding.left - padding.right) / Math.max(chartData.length, 1);
  const zeroLineRatio = maxNegative < 0 ? maxPositive / (maxPositive + Math.abs(maxNegative)) : 1;
  const zeroY = padding.top + chartHeight * zeroLineRatio;

  context.strokeStyle = "rgba(109, 71, 44, 0.12)";
  context.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = padding.top + (chartHeight / 3) * i;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(drawWidth - padding.right, y);
    context.stroke();
  }

  context.strokeStyle = "rgba(109, 71, 44, 0.22)";
  context.beginPath();
  context.moveTo(padding.left, zeroY);
  context.lineTo(drawWidth - padding.right, zeroY);
  context.stroke();

  chartData.forEach((item, index) => {
    const expenseValue = expenses[index];
    const savingsValue = savings[index];
    const baseX = padding.left + index * columnWidth;
    const expenseBarHeight = (expenseValue / maxPositive) * chartHeight * zeroLineRatio;
    const positiveSavingsHeight = savingsValue > 0 ? (savingsValue / maxPositive) * chartHeight * zeroLineRatio : 0;
    const negativeSavingsHeight = savingsValue < 0 && maxNegative !== 0 ? (Math.abs(savingsValue) / Math.abs(maxNegative)) * chartHeight * (1 - zeroLineRatio) : 0;
    const barWidth = Math.min(26, columnWidth * 0.28);

    context.fillStyle = "#d95d39";
    roundRect(context, baseX + columnWidth * 0.15, zeroY - expenseBarHeight, barWidth, expenseBarHeight, 10);

    if (negativeSavingsHeight > 0) {
      context.fillStyle = "#8f3d2f";
      roundRect(context, baseX + columnWidth * 0.55, zeroY, barWidth, negativeSavingsHeight, 10);
    }
    if (positiveSavingsHeight > 0) {
      context.fillStyle = "#2e8b57";
      roundRect(context, baseX + columnWidth * 0.55, zeroY - positiveSavingsHeight, barWidth, positiveSavingsHeight, 10);
    }

    context.fillStyle = "#7f6755";
    context.font = '12px "Segoe UI", sans-serif';
    context.textAlign = "center";
    context.fillText(item.label, baseX + columnWidth * 0.5, drawHeight - 12);
  });
}

function getCurrentMonthSummary() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentTransactions = appState.transactions.filter((entry) => entry.date.startsWith(monthKey));
  const fixedTotal = appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

  const income = currentTransactions.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expense = currentTransactions.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + Number(entry.amount), 0);

  return { income, expense, savings: income - (expense + fixedTotal) };
}

function getMonthlyAverageExpense() {
  const trend = getMonthlyTrend();
  const fixedTotal = appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const totals = trend.map((item) => item.expense + fixedTotal);
  return totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0;
}

function getMonthlyTrend() {
  const months = [];
  const now = new Date();
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = `${date.getMonth() + 1}월`;
    const monthTransactions = appState.transactions.filter((entry) => entry.date.startsWith(key));
    months.push({
      key,
      label,
      income: monthTransactions.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + Number(entry.amount), 0),
      expense: monthTransactions.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + Number(entry.amount), 0)
    });
  }
  return months;
}

function roundRect(context, x, y, width, height, radius) {
  if (height <= 0) {
    return;
  }
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(Number(value) || 0);
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
