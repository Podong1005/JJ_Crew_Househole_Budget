const STORAGE_KEY = "couple-budget-planner-v1";

const defaultState = {
  fixedExpenses: [
    { id: crypto.randomUUID(), name: "월세", amount: 850000 },
    { id: crypto.randomUUID(), name: "통신비", amount: 120000 },
    { id: crypto.randomUUID(), name: "보험", amount: 180000 }
  ],
  transactions: [
    { id: crypto.randomUUID(), date: "2026-01-05", type: "income", category: "급여", amount: 4200000, note: "남편 월급" },
    { id: crypto.randomUUID(), date: "2026-01-25", type: "income", category: "급여", amount: 2500000, note: "아내 월급" },
    { id: crypto.randomUUID(), date: "2026-01-08", type: "expense", category: "식비", amount: 240000, note: "장보기" },
    { id: crypto.randomUUID(), date: "2026-02-03", type: "expense", category: "교통", amount: 98000, note: "주유비" },
    { id: crypto.randomUUID(), date: "2026-02-24", type: "income", category: "보너스", amount: 500000, note: "성과급" },
    { id: crypto.randomUUID(), date: "2026-03-11", type: "expense", category: "데이트", amount: 160000, note: "주말 외식" },
    { id: crypto.randomUUID(), date: "2026-03-26", type: "income", category: "급여", amount: 6800000, note: "합산 급여" },
    { id: crypto.randomUUID(), date: "2026-04-04", type: "expense", category: "생활용품", amount: 73000, note: "생필품" },
    { id: crypto.randomUUID(), date: "2026-04-10", type: "expense", category: "문화생활", amount: 112000, note: "영화, 카페" }
  ]
};

const elements = {
  summaryCards: document.getElementById("summaryCards"),
  fixedExpenseForm: document.getElementById("fixedExpenseForm"),
  fixedExpenseList: document.getElementById("fixedExpenseList"),
  transactionForm: document.getElementById("transactionForm"),
  transactionList: document.getElementById("transactionList"),
  monthlyBreakdown: document.getElementById("monthlyBreakdown"),
  monthlyChart: document.getElementById("monthlyChart")
};

let state = loadState();

initialize();

function initialize() {
  const dateInput = elements.transactionForm.querySelector('input[name="date"]');
  dateInput.value = new Date().toISOString().slice(0, 10);

  elements.fixedExpenseForm.addEventListener("submit", handleFixedExpenseSubmit);
  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.fixedExpenseList.addEventListener("click", handleFixedExpenseDelete);
  window.addEventListener("resize", renderChart);

  render();
}

function loadState() {
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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function handleFixedExpenseSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = formData.get("name").toString().trim();
  const amount = Number(formData.get("amount"));

  if (!name || amount <= 0) {
    return;
  }

  state.fixedExpenses.unshift({
    id: crypto.randomUUID(),
    name,
    amount
  });

  event.currentTarget.reset();
  saveState();
  render();
}

function handleTransactionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const transaction = {
    id: crypto.randomUUID(),
    date: formData.get("date").toString(),
    type: formData.get("type").toString(),
    category: formData.get("category").toString().trim(),
    amount: Number(formData.get("amount")),
    note: formData.get("note").toString().trim()
  };

  if (!transaction.date || !transaction.category || transaction.amount <= 0) {
    return;
  }

  state.transactions.unshift(transaction);
  event.currentTarget.reset();
  elements.transactionForm.querySelector('input[name="date"]').value = new Date().toISOString().slice(0, 10);
  saveState();
  render();
}

function handleFixedExpenseDelete(event) {
  const button = event.target.closest("[data-delete-id]");
  if (!button) {
    return;
  }

  const { deleteId } = button.dataset;
  state.fixedExpenses = state.fixedExpenses.filter((item) => item.id !== deleteId);
  saveState();
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
  const fixedTotal = state.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
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
      className: "amount amount--saving",
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
  if (state.fixedExpenses.length === 0) {
    elements.fixedExpenseList.innerHTML = '<div class="empty-state">아직 등록된 고정비가 없어요.</div>';
    return;
  }

  elements.fixedExpenseList.innerHTML = [...state.fixedExpenses]
    .sort((a, b) => b.amount - a.amount)
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
  const fixedTotal = state.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
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
  const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));

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
  const fixedTotal = state.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
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
  const columnWidth = (drawWidth - padding.left - padding.right) / chartData.length;
  const zeroLineRatio = maxNegative < 0 ? maxPositive / (maxPositive + Math.abs(maxNegative)) : 1;
  const zeroY = padding.top + chartHeight * (1 - zeroLineRatio);

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
    roundRect(
      context,
      baseX + columnWidth * 0.15,
      zeroY - expenseBarHeight,
      barWidth,
      expenseBarHeight,
      10
    );

    context.fillStyle = savingsValue >= 0 ? "#2e8b57" : "#8f3d2f";
    roundRect(context, baseX + columnWidth * 0.55, zeroY, barWidth, negativeSavingsHeight, 10);
    roundRect(
      context,
      baseX + columnWidth * 0.55,
      zeroY - positiveSavingsHeight,
      barWidth,
      positiveSavingsHeight,
      10
    );

    context.fillStyle = "#7f6755";
    context.font = '12px "Montserrat", sans-serif';
    context.textAlign = "center";
    context.fillText(item.label, baseX + columnWidth * 0.5, drawHeight - 12);
  });
}

function getCurrentMonthSummary() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentTransactions = state.transactions.filter((entry) => entry.date.startsWith(monthKey));
  const fixedTotal = state.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);

  const income = currentTransactions
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const expense = currentTransactions
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + entry.amount, 0);

  return {
    income,
    expense,
    savings: income - (expense + fixedTotal)
  };
}

function getMonthlyAverageExpense() {
  const trend = getMonthlyTrend();
  const fixedTotal = state.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const totals = trend.map((item) => item.expense + fixedTotal);
  return totals.reduce((sum, value) => sum + value, 0) / totals.length;
}

function getMonthlyTrend() {
  const months = [];
  const now = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = `${date.getMonth() + 1}월`;
    const monthTransactions = state.transactions.filter((entry) => entry.date.startsWith(key));
    months.push({
      key,
      label,
      income: monthTransactions
        .filter((entry) => entry.type === "income")
        .reduce((sum, entry) => sum + entry.amount, 0),
      expense: monthTransactions
        .filter((entry) => entry.type === "expense")
        .reduce((sum, entry) => sum + entry.amount, 0)
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
  }).format(value);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
