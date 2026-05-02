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
  incomeForm: document.getElementById("incomeForm"),
  expenseForm: document.getElementById("expenseForm"),
  historyTypeFilter: document.getElementById("historyTypeFilter"),
  historyCategoryFilter: document.getElementById("historyCategoryFilter"),
  transactionList: document.getElementById("transactionList"),
  dailyBreakdown: document.getElementById("dailyBreakdown"),
  dailyChart: document.getElementById("dailyChart"),
  monthlyBreakdown: document.getElementById("monthlyBreakdown"),
  monthlyChart: document.getElementById("monthlyChart"),
  tabButtons: [...document.querySelectorAll("[data-tab]")],
  tabPanels: [...document.querySelectorAll("[data-tab-panel]")]
};

const appState = {
  householdCode: "",
  householdKey: "",
  activeTab: "daily",
  fixedExpenses: [],
  historyFilter: {
    type: "all",
    category: "all"
  },
  transactions: [],
  pollTimer: null
};

initialize();

function initialize() {
  elements.incomeForm.querySelector('input[name="date"]').value = getTodayString();
  elements.expenseForm.querySelector('input[name="date"]').value = getTodayString();
  elements.fixedExpenseForm.querySelector('input[name="date"]').value = getTodayString();
  elements.authForm.addEventListener("submit", handleBudgetAccess);
  elements.signOutButton.addEventListener("click", handleChangeBudget);
  elements.refreshButton.addEventListener("click", handleRefresh);
  elements.fixedExpenseForm.addEventListener("submit", handleFixedExpenseSubmit);
  elements.incomeForm.addEventListener("submit", handleIncomeSubmit);
  elements.expenseForm.addEventListener("submit", handleExpenseSubmit);
  elements.historyTypeFilter.addEventListener("change", handleHistoryFilterChange);
  elements.historyCategoryFilter.addEventListener("change", handleHistoryFilterChange);
  elements.fixedExpenseList.addEventListener("click", handleFixedExpenseDelete);
  elements.transactionList.addEventListener("click", handleTransactionDelete);
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });
  window.addEventListener("resize", renderCharts);

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
  setActiveTab(appState.activeTab);
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
  appState.historyFilter = { type: "all", category: "all" };
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
  const date = String(formData.get("date") || "");
  const name = String(formData.get("name") || "").trim();
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") || "").trim();

  if (!date || !name || amount <= 0) {
    return;
  }

  const { error } = await callSupabaseRpc("add_shared_fixed_expense", {
    p_household_key: appState.householdKey,
    p_date: date,
    p_name: name,
    p_amount: amount,
    p_note: note
  });

  if (error) {
    elements.householdMessage.textContent = error.message;
    return;
  }

  event.currentTarget.reset();
  elements.fixedExpenseForm.querySelector('input[name="date"]').value = getTodayString();
  await loadBudgetData();
}

async function handleIncomeSubmit(event) {
  await handleTransactionSubmit(event, "income", elements.incomeForm);
}

async function handleExpenseSubmit(event) {
  await handleTransactionSubmit(event, "expense", elements.expenseForm);
}

async function handleTransactionSubmit(event, type, formElement) {
  event.preventDefault();
  if (!appState.householdKey) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const transaction = {
    date: String(formData.get("date") || ""),
    type,
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
  formElement.querySelector('input[name="date"]').value = getTodayString();
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

async function handleTransactionDelete(event) {
  const button = event.target.closest("[data-transaction-delete-id]");
  if (!button || !appState.householdKey) {
    return;
  }

  const { error } = await callSupabaseRpc("delete_shared_transaction", {
    p_household_key: appState.householdKey,
    p_id: button.dataset.transactionDeleteId
  });

  if (error) {
    elements.householdMessage.textContent = error.message;
    return;
  }

  await loadBudgetData();
}

function handleHistoryFilterChange() {
  appState.historyFilter.type = elements.historyTypeFilter.value || "all";
  appState.historyFilter.category = elements.historyCategoryFilter.value || "all";
  renderTransactions();
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
        p_date: item.date || getTodayString(),
        p_name: String(item.name).trim(),
        p_amount: Number(item.amount),
        p_note: item.note || ""
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
  elements.dailyBreakdown.innerHTML = `
    <article class="insight-card">
      <h3>안내</h3>
      <div class="amount">연결 필요</div>
      <p class="subtext">${escapeHtml(message)}</p>
    </article>
  `;
  renderCharts();
}

function render() {
  syncHistoryFilters();
  renderSummaryCards();
  renderFixedExpenses();
  renderDailyBreakdown();
  renderMonthlyBreakdown();
  renderTransactions();
  renderCharts();
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

  if (tabName === "daily" || tabName === "monthly") {
    window.requestAnimationFrame(renderCharts);
  }
}

function renderSummaryCards() {
  const monthly = getCurrentMonthSummary();
  const fixedTotal = getFixedExpenseTotalForMonth(getCurrentMonthKey());
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
    .sort((a, b) => `${b.date || ""}${b.created_at || ""}`.localeCompare(`${a.date || ""}${a.created_at || ""}`))
    .map((item) => `
      <article class="fixed-item">
        <div class="fixed-item__meta">
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.date || "-")}부터 매월 반복</p>
          ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
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
  const fixedTotal = getFixedExpenseTotalForMonth(getCurrentMonthKey());
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

function renderDailyBreakdown() {
  const today = getTodayString();
  const todayTransactions = appState.transactions.filter((entry) => entry.date === today);
  const income = todayTransactions
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const expense = todayTransactions
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const todayFixed = getFixedExpenseDailyEstimate();
  const net = income - (expense + todayFixed);

  const cards = [
    { title: "오늘 수입", value: formatCurrency(income), helper: "오늘 기록된 수입" },
    { title: "오늘 지출", value: formatCurrency(expense), helper: "오늘 기록된 변동 지출" },
    { title: "고정비 일할", value: formatCurrency(todayFixed), helper: "월 고정비를 일 단위로 환산" },
    { title: "오늘 잔액", value: formatCurrency(net), helper: "수입 - 지출 - 일할 고정비" }
  ];

  elements.dailyBreakdown.innerHTML = cards.map((card) => `
    <article class="insight-card">
      <h3>${card.title}</h3>
      <div class="amount">${card.value}</div>
      <p class="subtext">${card.helper}</p>
    </article>
  `).join("");
}


function renderTransactions() {
  const historyEntries = getHistoryEntries();
  renderHistoryCategoryOptions(historyEntries);

  const filtered = historyEntries
    .filter((entry) => appState.historyFilter.type === "all" || entry.type === appState.historyFilter.type)
    .filter((entry) => appState.historyFilter.category === "all" || entry.category === appState.historyFilter.category);

  if (filtered.length === 0) {
    elements.transactionList.innerHTML = '<div class="empty-state">조건에 맞는 내역이 없습니다.</div>';
    return;
  }

  const rows = filtered.map((entry) => `
    <tr>
      <td>${entry.date}</td>
      <td><span class="pill pill--${entry.type}">${getTypeLabel(entry.type)}</span></td>
      <td>${escapeHtml(entry.category)}</td>
      <td>${escapeHtml(entry.note || "-")}</td>
      <td class="amount ${entry.type === "income" ? "amount--income" : "amount--expense"}">${formatCurrency(entry.amount)}</td>
      <td>${entry.type === "fixed"
        ? `<button type="button" class="danger-button" data-delete-id="${entry.sourceId}">삭제</button>`
        : `<button type="button" class="danger-button" data-transaction-delete-id="${entry.id}">삭제</button>`}
      </td>
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
          <th>관리</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderHistoryCategoryOptions(historyEntries) {
  const categories = [...new Set(historyEntries.map((entry) => String(entry.category || "").trim()).filter(Boolean))];
  const currentValue = appState.historyFilter.category;

  if (currentValue !== "all" && !categories.includes(currentValue)) {
    appState.historyFilter.category = "all";
  }

  elements.historyCategoryFilter.innerHTML = [
    '<option value="all">전체</option>',
    ...categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
  ].join("");

  elements.historyCategoryFilter.value = appState.historyFilter.category;
}

function getHistoryEntries() {
  return [...appState.transactions, ...getFixedExpenseOccurrencesThroughCurrentMonth()]
    .sort((a, b) => `${b.date}${b.created_at || ""}`.localeCompare(`${a.date}${a.created_at || ""}`));
}

function syncHistoryFilters() {
  elements.historyTypeFilter.value = appState.historyFilter.type;
  elements.historyCategoryFilter.value = appState.historyFilter.category;
}

function renderCharts() {
  renderMonthlyChart();
  renderDailyChart();
}

function renderMonthlyChart() {
  const canvas = elements.monthlyChart;
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  const chartData = getMonthlyTrend();
  const expenses = chartData.map((item) => item.expense);
  const savings = chartData.map((item) => item.income - item.expense);
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

function renderDailyChart() {
  const canvas = elements.dailyChart;
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  const chartData = getDailyTrend();
  const incomes = chartData.map((item) => item.income);
  const expenses = chartData.map((item) => item.expense);
  const maxValue = Math.max(...incomes, ...expenses, 100000);

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
  const baseline = padding.top + chartHeight;
  const barWidth = Math.min(12, columnWidth * 0.28);

  context.strokeStyle = "rgba(84, 96, 112, 0.14)";
  context.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = padding.top + (chartHeight / 3) * i;
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
    roundRect(context, baseX + columnWidth * 0.22, baseline - incomeHeight, barWidth, incomeHeight, 6);

    context.fillStyle = "#dc2626";
    roundRect(context, baseX + columnWidth * 0.55, baseline - expenseHeight, barWidth, expenseHeight, 6);

    if (index % Math.ceil(chartData.length / 12) === 0 || index === chartData.length - 1) {
      context.fillStyle = "#667085";
      context.font = '11px "Segoe UI", "Malgun Gothic", sans-serif';
      context.textAlign = "center";
      context.fillText(item.label, baseX + columnWidth * 0.5, drawHeight - 12);
    }
  });
}

function getCurrentMonthSummary() {
  const monthKey = getCurrentMonthKey();
  const currentTransactions = appState.transactions.filter((entry) => entry.date.startsWith(monthKey));
  const fixedTotal = getFixedExpenseTotalForMonth(monthKey);
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
  const totals = trend.map((item) => item.expense);
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
        .reduce((sum, entry) => sum + Number(entry.amount), 0) + getFixedExpenseTotalForMonth(key)
    });
  }

  return months;
}

function getDailyTrend() {
  const days = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayTransactions = appState.transactions.filter((entry) => entry.date === key);
    days.push({
      key,
      label: String(day),
      income: dayTransactions
        .filter((entry) => entry.type === "income")
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
      expense: dayTransactions
        .filter((entry) => entry.type === "expense")
        .reduce((sum, entry) => sum + Number(entry.amount), 0) + getFixedExpenseTotalForDate(key)
    });
  }

  return days;
}

function getFixedExpenseTotalForMonth(monthKey) {
  return appState.fixedExpenses
    .filter((item) => shouldApplyFixedExpenseToMonth(item, monthKey))
    .reduce((sum, item) => sum + Number(item.amount), 0);
}

function getFixedExpenseTotalForDate(dateKey) {
  return getFixedExpenseOccurrencesForMonth(dateKey.slice(0, 7))
    .filter((item) => item.date === dateKey)
    .reduce((sum, item) => sum + Number(item.amount), 0);
}

function getFixedExpenseOccurrencesThroughCurrentMonth() {
  const occurrences = [];
  const currentMonthKey = getCurrentMonthKey();

  appState.fixedExpenses.forEach((item) => {
    if (!isValidDateString(item.date)) {
      return;
    }

    let monthKey = item.date.slice(0, 7);
    while (monthKey <= currentMonthKey) {
      occurrences.push(createFixedExpenseOccurrence(item, monthKey));
      monthKey = getNextMonthKey(monthKey);
    }
  });

  return occurrences;
}

function getFixedExpenseOccurrencesForMonth(monthKey) {
  return appState.fixedExpenses
    .filter((item) => shouldApplyFixedExpenseToMonth(item, monthKey))
    .map((item) => createFixedExpenseOccurrence(item, monthKey));
}

function shouldApplyFixedExpenseToMonth(item, monthKey) {
  return isValidDateString(item.date) && item.date.slice(0, 7) <= monthKey;
}

function createFixedExpenseOccurrence(item, monthKey) {
  const occurrenceDay = Math.min(Number(item.date.slice(8, 10)), getDaysInMonth(monthKey));
  return {
    id: `${item.id}-${monthKey}`,
    sourceId: item.id,
    date: `${monthKey}-${String(occurrenceDay).padStart(2, "0")}`,
    type: "fixed",
    category: item.name,
    amount: Number(item.amount),
    note: item.note || "매월 반복 고정비",
    created_at: item.created_at || item.date
  };
}

function getFixedExpenseDailyEstimate() {
  const monthKey = getCurrentMonthKey();
  const [, month] = monthKey.split("-").map(Number);
  const year = Number(monthKey.slice(0, 4));
  const daysInMonth = new Date(year, month, 0).getDate();
  const fixedTotal = getFixedExpenseTotalForMonth(monthKey);
  return fixedTotal / daysInMonth;
}

function getNextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonth = new Date(year, month, 1);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
}

function getDaysInMonth(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function getTypeLabel(type) {
  if (type === "income") {
    return "수입";
  }
  if (type === "fixed") {
    return "고정비";
  }
  return "지출";
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
