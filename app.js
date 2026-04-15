const STORAGE_KEY = "couple-budget-planner-v1";

const defaultState = {
  fixedExpenses: [],
  transactions: []
};

const config = window.BUDGET_APP_CONFIG || {};
const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const supabase = hasSupabaseConfig
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

const elements = {
  appShell: document.getElementById("appShell"),
  authPanel: document.getElementById("authPanel"),
  authForm: document.getElementById("authForm"),
  authTitle: document.getElementById("authTitle"),
  authDescription: document.getElementById("authDescription"),
  authSubmit: document.getElementById("authSubmit"),
  authToggle: document.getElementById("authToggle"),
  authError: document.getElementById("authError"),
  dashboardState: document.getElementById("dashboardState"),
  setupGuide: document.getElementById("setupGuide"),
  householdPanel: document.getElementById("householdPanel"),
  householdName: document.getElementById("householdName"),
  householdInviteCode: document.getElementById("householdInviteCode"),
  householdUser: document.getElementById("householdUser"),
  signOutButton: document.getElementById("signOutButton"),
  refreshButton: document.getElementById("refreshButton"),
  createHouseholdForm: document.getElementById("createHouseholdForm"),
  joinHouseholdForm: document.getElementById("joinHouseholdForm"),
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
  authMode: "signin",
  user: null,
  household: null,
  fixedExpenses: [],
  transactions: [],
  channel: null
};

initialize();

function initialize() {
  const dateInput = elements.transactionForm.querySelector('input[name="date"]');
  dateInput.value = getTodayString();

  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.authToggle.addEventListener("click", toggleAuthMode);
  elements.signOutButton.addEventListener("click", handleSignOut);
  elements.refreshButton.addEventListener("click", handleRefresh);
  elements.createHouseholdForm.addEventListener("submit", handleCreateHousehold);
  elements.joinHouseholdForm.addEventListener("submit", handleJoinHousehold);
  elements.fixedExpenseForm.addEventListener("submit", handleFixedExpenseSubmit);
  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.fixedExpenseList.addEventListener("click", handleFixedExpenseDelete);
  window.addEventListener("resize", renderChart);

  renderAuthMode();

  if (!hasSupabaseConfig) {
    renderSetupRequired();
    return;
  }

  initializeSupabaseSession();
}

async function initializeSupabaseSession() {
  const {
    data: { session }
  } = await supabase.auth.getSession();

  appState.user = session?.user ?? null;
  updateUserShell();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    appState.user = session?.user ?? null;
    appState.household = null;
    appState.fixedExpenses = [];
    appState.transactions = [];
    teardownRealtime();
    updateUserShell();

    if (appState.user) {
      await loadHouseholdContext();
    } else {
      renderPreLoginState();
    }
  });

  if (appState.user) {
    await loadHouseholdContext();
  } else {
    renderPreLoginState();
  }
}

function renderSetupRequired() {
  elements.appShell.classList.add("is-setup");
  elements.authPanel.classList.remove("is-hidden");
  elements.dashboardState.classList.remove("is-hidden");
  elements.setupGuide.classList.remove("is-hidden");
  elements.authTitle.textContent = "공유형 가계부 설정이 필요해요";
  elements.authDescription.textContent = "Supabase 연결 정보만 넣으면 부부가 각자 폰과 컴퓨터에서 같은 가계부를 사용할 수 있어요.";
  elements.authForm.classList.add("is-hidden");
  elements.authToggle.classList.add("is-hidden");
  elements.householdPanel.classList.add("is-hidden");
  renderFromLocalState();
}

function renderPreLoginState() {
  elements.appShell.classList.remove("is-setup");
  elements.authPanel.classList.remove("is-hidden");
  elements.authForm.classList.remove("is-hidden");
  elements.authToggle.classList.remove("is-hidden");
  elements.dashboardState.classList.remove("is-hidden");
  elements.setupGuide.classList.add("is-hidden");
  elements.householdPanel.classList.add("is-hidden");
  elements.authError.textContent = "";
  renderPlaceholderDashboard("같이 쓰려면 먼저 로그인해 주세요.");
}

function renderWaitingForHousehold() {
  elements.authPanel.classList.add("is-hidden");
  elements.dashboardState.classList.remove("is-hidden");
  elements.householdPanel.classList.remove("is-hidden");
  elements.householdName.textContent = "아직 연결된 가계부가 없어요";
  elements.householdInviteCode.textContent = "-";
  elements.householdMessage.textContent = "한 분이 가계부를 만들고, 다른 분은 초대 코드를 입력해 합류하면 됩니다.";
  renderPlaceholderDashboard("가구를 만들거나 초대 코드로 참여해 주세요.");
}

function renderActiveDashboard() {
  elements.authPanel.classList.add("is-hidden");
  elements.dashboardState.classList.add("is-hidden");
  elements.householdPanel.classList.remove("is-hidden");
  elements.householdName.textContent = appState.household?.name || "우리집 가계부";
  elements.householdInviteCode.textContent = appState.household?.invite_code || "-";
  elements.householdMessage.textContent = "같은 초대 코드를 공유하면 부부가 같은 데이터를 보게 됩니다.";
  render();
}

function updateUserShell() {
  elements.householdUser.textContent = appState.user?.email || "로그인되지 않음";
  elements.signOutButton.disabled = !appState.user;
  elements.refreshButton.disabled = !appState.user;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (!supabase) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const email = formData.get("email").toString().trim();
  const password = formData.get("password").toString();

  if (!email || !password) {
    elements.authError.textContent = "이메일과 비밀번호를 입력해 주세요.";
    return;
  }

  elements.authError.textContent = "";

  if (appState.authMode === "signin") {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    elements.authError.textContent = error?.message || "";
    return;
  }

  const { error } = await supabase.auth.signUp({ email, password });
  elements.authError.textContent = error
    ? error.message
    : "회원가입 요청이 완료됐어요. 이메일 인증이 켜져 있다면 받은 편지함을 확인해 주세요.";
}

function toggleAuthMode() {
  appState.authMode = appState.authMode === "signin" ? "signup" : "signin";
  elements.authError.textContent = "";
  renderAuthMode();
}

function renderAuthMode() {
  const isSignIn = appState.authMode === "signin";
  elements.authTitle.textContent = isSignIn ? "부부 공동 가계부 로그인" : "공동 가계부 계정 만들기";
  elements.authDescription.textContent = isSignIn
    ? "각자 로그인한 뒤 같은 가계부에 연결하면 어디서든 같은 데이터를 볼 수 있어요."
    : "계정을 만든 뒤 한 분이 가계부를 만들고, 다른 분은 초대 코드로 참여하세요.";
  elements.authSubmit.textContent = isSignIn ? "로그인" : "회원가입";
  elements.authToggle.textContent = isSignIn ? "처음이라면 회원가입" : "이미 계정이 있다면 로그인";
}

async function handleSignOut() {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut();
}

async function handleRefresh() {
  if (!appState.user) {
    return;
  }

  await loadHouseholdContext(true);
}

async function handleCreateHousehold(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const householdName = formData.get("householdName").toString().trim();

  if (!householdName) {
    elements.householdMessage.textContent = "가계부 이름을 입력해 주세요.";
    return;
  }

  const { error } = await supabase.rpc("create_household_with_owner", {
    p_name: householdName
  });

  if (error) {
    elements.householdMessage.textContent = error.message;
    return;
  }

  event.currentTarget.reset();
  await loadHouseholdContext(true);
}

async function handleJoinHousehold(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const inviteCode = formData.get("inviteCode").toString().trim().toUpperCase();

  if (!inviteCode) {
    elements.householdMessage.textContent = "초대 코드를 입력해 주세요.";
    return;
  }

  const { error } = await supabase.rpc("join_household_by_invite_code", {
    p_invite_code: inviteCode
  });

  if (error) {
    elements.householdMessage.textContent = error.message;
    return;
  }

  event.currentTarget.reset();
  await loadHouseholdContext(true);
}

async function loadHouseholdContext(forceRefresh = false) {
  if (!appState.user) {
    renderPreLoginState();
    return;
  }

  if (forceRefresh) {
    teardownRealtime();
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household:households(id, name, invite_code)")
    .eq("user_id", appState.user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    renderPlaceholderDashboard("가계부 연결 정보를 불러오지 못했어요.");
    elements.householdPanel.classList.remove("is-hidden");
    elements.householdMessage.textContent = error.message;
    return;
  }

  appState.household = data?.household ?? null;

  if (!appState.household) {
    renderWaitingForHousehold();
    return;
  }

  await loadBudgetData();
  setupRealtime();
}

async function loadBudgetData() {
  const householdId = appState.household.id;
  const [fixedResponse, transactionResponse] = await Promise.all([
    supabase
      .from("fixed_expenses")
      .select("id, name, amount, created_at")
      .eq("household_id", householdId)
      .order("amount", { ascending: false }),
    supabase
      .from("transactions")
      .select("id, date, type, category, amount, note, created_at")
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
  ]);

  if (fixedResponse.error || transactionResponse.error) {
    renderPlaceholderDashboard("데이터를 불러오는 중 문제가 생겼어요.");
    elements.householdMessage.textContent = fixedResponse.error?.message || transactionResponse.error?.message || "";
    return;
  }

  appState.fixedExpenses = fixedResponse.data || [];
  appState.transactions = transactionResponse.data || [];
  renderActiveDashboard();
}

function setupRealtime() {
  if (!appState.household || appState.channel) {
    return;
  }

  appState.channel = supabase
    .channel(`budget-household-${appState.household.id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "fixed_expenses", filter: `household_id=eq.${appState.household.id}` },
      async () => {
        await loadBudgetData();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "transactions", filter: `household_id=eq.${appState.household.id}` },
      async () => {
        await loadBudgetData();
      }
    )
    .subscribe();
}

function teardownRealtime() {
  if (!appState.channel) {
    return;
  }

  supabase.removeChannel(appState.channel);
  appState.channel = null;
}

async function handleFixedExpenseSubmit(event) {
  event.preventDefault();
  if (!appState.household) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const name = formData.get("name").toString().trim();
  const amount = Number(formData.get("amount"));

  if (!name || amount <= 0) {
    return;
  }

  const { error } = await supabase.from("fixed_expenses").insert({
    household_id: appState.household.id,
    name,
    amount
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
  if (!appState.household) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const transaction = {
    household_id: appState.household.id,
    date: formData.get("date").toString(),
    type: formData.get("type").toString(),
    category: formData.get("category").toString().trim(),
    amount: Number(formData.get("amount")),
    note: formData.get("note").toString().trim()
  };

  if (!transaction.date || !transaction.category || transaction.amount <= 0) {
    return;
  }

  const { error } = await supabase.from("transactions").insert(transaction);

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
  if (!button || !appState.household) {
    return;
  }

  const { error } = await supabase
    .from("fixed_expenses")
    .delete()
    .eq("id", button.dataset.deleteId)
    .eq("household_id", appState.household.id);

  if (error) {
    elements.householdMessage.textContent = error.message;
    return;
  }

  await loadBudgetData();
}

function renderFromLocalState() {
  const saved = loadLocalState();
  appState.fixedExpenses = saved.fixedExpenses;
  appState.transactions = saved.transactions;
  render();
}

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return structuredClone(defaultState);
  }

  try {
    return JSON.parse(saved);
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return structuredClone(defaultState);
  }
}

function renderPlaceholderDashboard(message) {
  elements.summaryCards.innerHTML = `
    <article class="summary-card">
      <h3>공동 가계부 준비 중</h3>
      <div class="amount">${escapeHtml(message)}</div>
      <p class="subtext">설정이 끝나면 여기서 부부가 같은 데이터를 함께 보게 됩니다.</p>
    </article>
  `;
  elements.fixedExpenseList.innerHTML = '<div class="empty-state">고정비 목록은 연결 후 표시됩니다.</div>';
  elements.monthlyBreakdown.innerHTML = `
    <article class="insight-card">
      <h3>안내</h3>
      <div class="amount">로그인 필요</div>
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
  const context = canvas.getContext("2d");
  const chartData = getMonthlyTrend();
  const fixedTotal = appState.fixedExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = chartData.map((item) => item.expense + fixedTotal);
  const savings = chartData.map((item) => item.income - (item.expense + fixedTotal));
  const positiveSavings = savings.filter((value) => value > 0);
  const negativeSavings = savings.filter((value) => value < 0);
  const maxPositive = Math.max(...expenses, ...positiveSavings, 100000);
  const maxNegative = Math.min(...negativeSavings, 0);

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
    const positiveSavingsHeight = savingsValue > 0
      ? (savingsValue / maxPositive) * chartHeight * zeroLineRatio
      : 0;
    const negativeSavingsHeight = savingsValue < 0 && maxNegative !== 0
      ? (Math.abs(savingsValue) / Math.abs(maxNegative)) * chartHeight * (1 - zeroLineRatio)
      : 0;
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
    const label = `${date.getMonth() + 1}월`;
    const monthTransactions = appState.transactions.filter((entry) => entry.date.startsWith(key));
    months.push({
      key,
      label,
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
