(() => {
const SESSION_KEY = "jj-crew-budget-session-v2";
const LEGACY_SHARED_STORAGE_KEY = "couple-budget-shared-data-v1";
const LEGACY_MIGRATION_PREFIX = "jj-crew-shared-migrated-";

const config = window.BUDGET_APP_CONFIG || {};
const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);

const elements = {
  appShell: document.getElementById("appShell"),
  protectedContent: document.getElementById("protectedContent"),
  authPanel: document.getElementById("authPanel"),
  authForm: document.getElementById("authForm"),
  authTitle: document.getElementById("authTitle"),
  authDescription: document.getElementById("authDescription"),
  authSubmit: document.getElementById("authSubmit"),
  authModeStatus: document.getElementById("authModeStatus"),
  authError: document.getElementById("authError"),
  householdPanel: document.getElementById("householdPanel"),
  householdName: document.getElementById("householdName"),
  householdInviteCode: document.getElementById("householdInviteCode"),
  householdUser: document.getElementById("householdUser"),
  signOutButton: document.getElementById("signOutButton"),
  refreshButton: document.getElementById("refreshButton"),
  householdMessage: document.getElementById("householdMessage"),
  summaryCards: document.getElementById("summaryCards"),
  fixedExpenseForm: document.getElementById("fixedExpenseForm"),
  fixedExpenseList: document.getElementById("fixedExpenseList"),
  transactionForm: document.getElementById("transactionForm"),
  transactionList: document.getElementById("transactionList"),
  monthlyBreakdown: document.getElementById("monthlyBreakdown"),
  monthlyChart: document.getElementById("monthlyChart")
};

const appState = {
  householdCode: "",
  householdKey: "",
  fixedExpenses: [],
  transactions: [],
  pollTimer: null
};

initialize();

function initialize() {
  elements.transactionForm.querySelector('input[name="date"]').value = getTodayString();
  elements.authForm.addEventListener("submit", handleBudgetAccess);
  elements.signOutButton.addEventListener("click", handleChangeBudget);
  elements.refreshButton.addEventListener("click", handleRefresh);
  elements.fixedExpenseForm.addEventListener("submit", handleFixedExpenseSubmit);
  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.fixedExpenseList.addEventListener("click", handleFixedExpenseDelete);
  window.addEventListener("resize", renderChart);

  if (!hasSupabaseConfig) {
    renderSetupRequired();
    return;
  }

  const queryAccess = getQueryAccess();
  if (queryAccess) {
    renderAccessForm();
    fillAccessForm(queryAccess.householdCode, queryAccess.pin);
    elements.authModeStatus.textContent = "링크에 포함된 코드와 PIN으로 입장하는 중...";
    window.setTimeout(() => {
      elements.authForm.requestSubmit();
    }, 0);
    return;
  }

  const savedSession = readSavedSession();
  if (savedSession) {
    appState.householdCode = savedSession.householdCode;
    appState.householdKey = savedSession.householdKey;
    loadBudgetData();
    startPolling();
    return;
  }

  renderAccessForm();
}

function renderSetupRequired() {
  elements.appShell.classList.add("page-shell--auth");
  elements.protectedContent.classList.add("is-hidden");
  elements.authPanel.classList.remove("is-hidden");
  elements.authForm.classList.add("is-hidden");
  elements.authTitle.textContent = "공유 가계부 설정이 필요해요";
  elements.authDescription.innerHTML = '먼저 <code>config.js</code>에 Supabase URL과 Anon Key를 넣고, <code>supabase-schema.sql</code>을 Supabase SQL Editor에서 실행해 주세요.';
  elements.authModeStatus.textContent = "";
  elements.authError.textContent = "설정 후 같은 코드와 PIN으로 여러 기기에서 접속할 수 있어요.";
}

function renderAccessForm() {
  elements.appShell.classList.add("page-shell--auth");
  elements.protectedContent.classList.add("is-hidden");
  elements.authPanel.classList.remove("is-hidden");
  elements.authForm.classList.remove("is-hidden");
  elements.authTitle.textContent = "공유 가계부 입장";
  elements.authDescription.textContent = "두 기기에서 같은 가계부 코드와 PIN을 입력하면 같은 내역을 볼 수 있어요.";
  elements.authSubmit.textContent = "입장";
  elements.authModeStatus.textContent = "로그인 없이 코드와 PIN으로 연결합니다.";
  elements.authError.textContent = "";
}

function fillAccessForm(householdCode, pin) {
  elements.authForm.elements.budgetCode.value = householdCode;
  elements.authForm.elements.budgetPin.value = pin;
}

function renderDashboard() {
  elements.appShell.classList.remove("page-shell--auth");
  elements.authPanel.classList.add("is-hidden");
  elements.protectedContent.classList.remove("is-hidden");
  elements.householdPanel.classList.remove("is-hidden");
  elements.householdName.textContent = appState.householdCode || "공유 가계부";
  elements.householdInviteCode.textContent = "PIN은 저장하지 않습니다";
  elements.householdUser.textContent = appState.householdCode || "미연결";
  elements.signOutButton.textContent = "가계부 변경";
  elements.refreshButton.textContent = "새로고침";
  elements.householdMessage.textContent = "같은 코드와 PIN을 입력한 기기끼리 같은 데이터를 공유합니다.";
  render();
}

async function handleBudgetAccess(event) {
  event.preventDefault();
  if (!hasSupabaseConfig) {
    elements.authError.textContent = "Supabase 설정을 찾지 못했어요. config.js를 확인해 주세요.";
    return;
  }

  const formData = new FormData(event.currentTarget);
  const householdCode = normalizeBudgetCode(formData.get("budgetCode"));
  const pin = String(formData.get("budgetPin") || "").trim();

  if (!householdCode || pin.length < 4) {
    elements.authError.textContent = "가계부 코드와 4자리 이상의 PIN을 입력해 주세요.";
    return;
  }

  elements.authSubmit.disabled = true;
  elements.authSubmit.textContent = "연결 중...";
  elements.authModeStatus.textContent = "가계부 코드와 PIN을 확인하는 중...";
  elements.authError.textContent = "";

  try {
    const householdKey = await createHouseholdKey(householdCode, pin);
    appState.householdCode = householdCode;
    appState.householdKey = householdKey;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ householdCode, householdKey }));
    await migrateLegacyLocalBudgetData();
    elements.authModeStatus.textContent = "공유 가계부 데이터를 불러오는 중...";
    const loaded = await loadBudgetData();
    if (loaded) {
      startPolling();
      elements.authForm.reset();
    }
  } catch (error) {
    appState.householdCode = "";
    appState.householdKey = "";
    localStorage.removeItem(SESSION_KEY);
    elements.authError.textContent = `가계부 연결 중 문제가 생겼어요: ${error.message}`;
    elements.authModeStatus.textContent = "연결 실패";
  } finally {
    elements.authSubmit.disabled = false;
    elements.authSubmit.textContent = "입장";
  }
}

function handleChangeBudget() {
  stopPolling();
  localStorage.removeItem(SESSION_KEY);
  appState.householdCode = "";
  appState.householdKey = "";
  appState.fixedExpenses = [];
  appState.transactions = [];
  renderAccessForm();
}

async function handleRefresh() {
  if (!appState.householdKey) {
    return;
  }

  await loadBudgetData();
}

async function loadBudgetData() {
  if (!appState.householdKey) {
    renderAccessForm();
    return false;
  }

  const { data, error } = await callSupabaseRpc("get_shared_budget", {
    p_household_key: appState.householdKey
  });

  if (error) {
    localStorage.removeItem(SESSION_KEY);
    elements.householdMessage.textContent = error.message;
    if (!elements.protectedContent.classList.contains("is-hidden")) {
      renderPlaceholderDashboard("데이터를 불러오는 중 문제가 생겼어요.");
    } else {
      elements.authError.textContent = `Supabase 오류: ${error.message}`;
      elements.authModeStatus.textContent = "연결 실패";
    }
    return false;
  }

  const budgetData = typeof data === "string" ? JSON.parse(data) : data;
  appState.fixedExpenses = budgetData?.fixed_expenses || [];
  appState.transactions = budgetData?.transactions || [];
  renderDashboard();
  return true;
}

function startPolling() {
  stopPolling();
  appState.pollTimer = window.setInterval(() => {
    if (appState.householdKey && !document.hidden) {
      loadBudgetData();
    }
  }, 15000);
}

function stopPolling() {
  if (!appState.pollTimer) {
    return;
  }

  window.clearInterval(appState.pollTimer);
  appState.pollTimer = null;
}

async function handleFixedExpenseSubmit(event) {
  event.preventDefault();
  if (!appState.householdKey) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const name = String(formData.get("name") || "").trim();
  const amount = Number(formData.get("amount"));

  if (!name || amount <= 0) {
    return;
  }

  const { error } = await callSupabaseRpc("add_shared_fixed_expense", {
    p_household_key: appState.householdKey,
    p_name: name,
    p_amount: amount
  });

  if (error) {
    elements.householdMessage.textContent = error.message;
    return;
  }

  event.currentTarget.reset();
  await loadBudgetData();
}

async function handleTransactionSubmit(event) {
  event.preventDefault();
  if (!appState.householdKey) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const transaction = {
    date: String(formData.get("date") || ""),
    type: String(formData.get("type") || ""),
    category: String(formData.get("category") || "").trim(),
    amount: Number(formData.get("amount")),
    note: String(formData.get("note") || "").trim()
  };

  if (!transaction.date || !transaction.category || transaction.amount <= 0) {
    return;
  }

  const { error } = await callSupabaseRpc("add_shared_transaction", {
    p_household_key: appState.householdKey,
    p_date: transaction.date,
    p_type: transaction.type,
    p_category: transaction.category,
    p_amount: transaction.amount,
    p_note: transaction.note
  });

  if (error) {
    elements.householdMessage.textContent = error.message;
    return;
  }

  event.currentTarget.reset();
  elements.transactionForm.querySelector('input[name="date"]').value = getTodayString();
  await loadBudgetData();
}

async function handleFixedExpenseDelete(event) {
  const button = event.target.closest("[data-delete-id]");
  if (!button || !appState.householdKey) {
    return;
  }

  const { error } = await callSupabaseRpc("delete_shared_fixed_expense", {
    p_household_key: appState.householdKey,
    p_id: button.dataset.deleteId
  });

  if (error) {
    elements.householdMessage.textContent = error.message;
    return;
  }

  await loadBudgetData();
}

async function migrateLegacyLocalBudgetData() {
  const migrationKey = `${LEGACY_MIGRATION_PREFIX}${appState.householdKey}`;
  if (!appState.householdKey || localStorage.getItem(migrationKey)) {
    return;
  }

  const saved = localStorage.getItem(LEGACY_SHARED_STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(migrationKey, "empty");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(saved);
  } catch {
    localStorage.setItem(migrationKey, "invalid");
    return;
  }

  const fixedExpenses = Array.isArray(parsed.fixedExpenses) ? parsed.fixedExpenses : [];
  const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];

  for (const item of fixedExpenses) {
    if (item?.name && Number(item.amount) > 0) {
      await callSupabaseRpc("add_shared_fixed_expense", {
        p_household_key: appState.householdKey,
        p_name: String(item.name).trim(),
        p_amount: Number(item.amount)
      });
    }
  }

  for (const item of transactions) {
    if (item?.date && item?.type && item?.category && Number(item.amount) > 0) {
      await callSupabaseRpc("add_shared_transaction", {
        p_household_key: appState.householdKey,
        p_date: item.date,
        p_type: item.type,
        p_category: String(item.category).trim(),
        p_amount: Number(item.amount),
        p_note: [item.note, item.createdBy ? `작성자: ${item.createdBy}` : ""].filter(Boolean).join(" / ")
      });
    }
  }

  localStorage.setItem(migrationKey, new Date().toISOString());
}

function renderPlaceholderDashboard(message) {
  elements.summaryCards.innerHTML = `
    <article class="summary-card">
      <h3>공유 가계부 준비 중</h3>
      <div class="amount">${escapeHtml(message)}</div>
      <p class="subtext">같은 코드와 PIN을 입력하면 여러 기기에서 같은 데이터를 볼 수 있어요.</p>
    </article>
  `;
  elements.fixedExpenseList.innerHTML = '<div class="empty-state">고정비 목록은 연결 후 표시됩니다.</div>';
  elements.monthlyBreakdown.innerHTML = `
    <article class="insight-card">
      <h3>안내</h3>
      <div class="amount">연결 필요</div>
      <p class="subtext">${escapeHtml(message)}</p>
    </article>
  `;
  elements.transactionList.innerHTML = '<div class="empty-state">최근 거래 내역은 연결 후 표시됩니다.</div>';
  renderChart();
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
    {
      title: "이번 달 수입",
      value: formatCurrency(monthly.income),
      className: "amount amount--income",
      subtext: "이번 달에 기록된 모든 수입 합계"
    },
    {
      title: "이번 달 소비",
      value: formatCurrency(monthly.expense + fixedTotal),
      className: "amount amount--expense",
      subtext: `고정비 ${formatCurrency(fixedTotal)} 포함`
    },
    {
      title: "예상 저축",
      value: formatCurrency(monthly.savings),
      className: `amount ${monthly.savings >= 0 ? "amount--saving" : "amount--expense"}`,
      subtext: `저축률 ${savingsRate}%`
    }
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
          <p>매달 반복되는 지출</p>
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
  const discretionary = current.expense;
  const totalExpense = discretionary + fixedTotal;
  const average = getMonthlyAverageExpense();

  const cards = [
    { title: "고정비 합계", value: formatCurrency(fixedTotal), helper: "매달 반복 비용" },
    { title: "변동 지출", value: formatCurrency(discretionary), helper: "식비, 교통, 쇼핑 등" },
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
  const sorted = [...appState.transactions]
    .sort((a, b) => `${b.date}${b.created_at || ""}`.localeCompare(`${a.date}${a.created_at || ""}`));

  if (sorted.length === 0) {
    elements.transactionList.innerHTML = '<div class="empty-state">아직 기록된 수입 / 지출 내역이 없어요.</div>';
    return;
  }

  const rows = sorted.slice(0, 12).map((entry) => `
    <tr>
      <td>${entry.date}</td>
      <td><span class="pill pill--${entry.type}">${entry.type === "income" ? "수입" : "지출"}</span></td>
      <td>${escapeHtml(entry.category)}</td>
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
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  const chartData = getMonthlyTrend();
  const fixedTotal = appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = chartData.map((item) => item.expense + fixedTotal);
  const savings = chartData.map((item) => item.income - (item.expense + fixedTotal));
  const positiveSavings = savings.filter((value) => value > 0);
  const negativeSavings = savings.filter((value) => value < 0);
  const maxPositive = Math.max(...expenses, ...positiveSavings, 100000);
  const maxNegative = Math.min(...negativeSavings, 0);

  const width = Math.max(canvas.clientWidth, 320) * window.devicePixelRatio;
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

  context.strokeStyle = "rgba(84, 96, 112, 0.14)";
  context.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = padding.top + (chartHeight / 3) * i;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(drawWidth - padding.right, y);
    context.stroke();
  }

  context.strokeStyle = "rgba(84, 96, 112, 0.24)";
  context.beginPath();
  context.moveTo(padding.left, zeroY);
  context.lineTo(drawWidth - padding.right, zeroY);
  context.stroke();

  chartData.forEach((item, index) => {
    const expenseValue = expenses[index];
    const savingsValue = savings[index];
    const baseX = padding.left + index * columnWidth;
    const expenseBarHeight = (expenseValue / maxPositive) * chartHeight * zeroLineRatio;
    const positiveSavingsHeight = savingsValue > 0
      ? (savingsValue / maxPositive) * chartHeight * zeroLineRatio
      : 0;
    const negativeSavingsHeight = savingsValue < 0 && maxNegative !== 0
      ? (Math.abs(savingsValue) / Math.abs(maxNegative)) * chartHeight * (1 - zeroLineRatio)
      : 0;
    const barWidth = Math.min(26, columnWidth * 0.28);

    context.fillStyle = "#dc2626";
    roundRect(context, baseX + columnWidth * 0.15, zeroY - expenseBarHeight, barWidth, expenseBarHeight, 10);

    context.fillStyle = savingsValue < 0 ? "#b45309" : "#138a45";
    if (negativeSavingsHeight > 0) {
      roundRect(context, baseX + columnWidth * 0.55, zeroY, barWidth, negativeSavingsHeight, 10);
    }
    if (positiveSavingsHeight > 0) {
      roundRect(context, baseX + columnWidth * 0.55, zeroY - positiveSavingsHeight, barWidth, positiveSavingsHeight, 10);
    }

    context.fillStyle = "#667085";
    context.font = '12px "Segoe UI", "Malgun Gothic", sans-serif';
    context.textAlign = "center";
    context.fillText(item.label, baseX + columnWidth * 0.5, drawHeight - 12);
  });
}

function getCurrentMonthSummary() {
  const monthKey = getCurrentMonthKey();
  const currentTransactions = appState.transactions.filter((entry) => entry.date.startsWith(monthKey));
  const fixedTotal = appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const income = currentTransactions
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expense = currentTransactions
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);

  return {
    income,
    expense,
    savings: income - (expense + fixedTotal)
  };
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
    const monthTransactions = appState.transactions.filter((entry) => entry.date.startsWith(key));
    months.push({
      key,
      label: `${date.getMonth() + 1}월`,
      income: monthTransactions
        .filter((entry) => entry.type === "income")
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
      expense: monthTransactions
        .filter((entry) => entry.type === "expense")
        .reduce((sum, entry) => sum + Number(entry.amount), 0)
    });
  }

  return months;
}

function readSavedSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return saved?.householdCode && saved?.householdKey ? saved : null;
  } catch {
    return null;
  }
}

function getQueryAccess() {
  const params = new URLSearchParams(window.location.search);
  const householdCode = normalizeBudgetCode(params.get("budgetCode"));
  const pin = String(params.get("budgetPin") || "").trim();

  if (!householdCode || pin.length < 4) {
    return null;
  }

  return { householdCode, pin };
}

function normalizeBudgetCode(value) {
  return String(value || "").trim().replace(/\s+/g, "-").toLowerCase();
}

async function callSupabaseRpc(functionName, payload) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let data = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }
  }

  if (!response.ok) {
    return {
      data: null,
      error: {
        message: data?.message || data?.error_description || data?.hint || responseText || `HTTP ${response.status}`
      }
    };
  }

  return { data, error: null };
}

async function createHouseholdKey(householdCode, pin) {
  const source = `jj-crew-budget:${householdCode}:${pin}`;
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
})();
