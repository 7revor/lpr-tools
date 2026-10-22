function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(d1, d2) {
  return Math.round((d2 - d1) / 86400000);
}

// 预先排序 LPR 与倍率数据，返回按日期查询生效利率的函数，避免每个计息段都重新排序
function createRateResolver({ rateType, fixedRate, lprData, multipliers, lprMode, lprTerm }) {
  if (rateType === "fixed") {
    return () => ({ annualRate: fixedRate, lprBase: "", multiplierLabel: "固定" });
  }

  const sortedLpr = [...lprData].sort((a, b) => a.date.localeCompare(b.date));
  const sortedM = [...multipliers].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  const defaultM = sortedM[0]?.value ?? 1;

  return (dateStr) => {
    const r = sortedLpr.findLast((x) => x.date <= dateStr);
    // 早于首条 LPR 的区间没有可用利率，不能按 0 计息
    if (!r) {
      throw new Error(
        sortedLpr.length === 0
          ? "LPR 数据为空，请导入或恢复默认 LPR 数据"
          : `计息区间起始日 ${dateStr} 早于 LPR 数据最早生效日 ${sortedLpr[0].date}，无法确定利率。` +
            "该期间请改用固定利率（如贷款基准利率）或补充更早的利率数据",
      );
    }
    const lpr = lprTerm === "5y" ? r.lpr5y : r.lpr1y;
    const m = sortedM.findLast((x) => !x.startDate || x.startDate <= dateStr);
    const mValue = m ? m.value : defaultM;

    const annualRate = lprMode === "multiplier" ? lpr * mValue : lpr + mValue / 100;
    const multiplierLabel = lprMode === "multiplier" ? `×${mValue}` : mValue >= 0 ? `+${mValue}BP` : `${mValue}BP`;
    return { annualRate, lprBase: lpr.toFixed(2), multiplierLabel };
  };
}

// 收集所有分段点：事件日、截止日，以及 LPR 模式下的利率变动日、倍率/加点生效日
function collectBreakpoints({ rateType, endDate, events, lprData, multipliers, lprTerm, mergeLpr }) {
  const breakpoints = new Set([endDate]);
  events.forEach((e) => breakpoints.add(e.date));

  if (rateType === "lpr") {
    if (mergeLpr) {
      // 仅在所选期限的 LPR 值相对上一期发生变化时才设分段点，
      // 从而把利率相同的连续月份合并为一段（事件、倍率/加点变化仍单独分段）
      const sortedLpr = [...lprData].sort((a, b) => a.date.localeCompare(b.date));
      let prevVal = null;
      sortedLpr.forEach((r) => {
        const val = lprTerm === "5y" ? r.lpr5y : r.lpr1y;
        if (prevVal === null || val !== prevVal) breakpoints.add(r.date);
        prevVal = val;
      });
    } else {
      lprData.forEach((r) => breakpoints.add(r.date));
    }
    multipliers.forEach((m) => {
      if (m.startDate) breakpoints.add(m.startDate);
    });
  }

  // endDate 已在集合中且是过滤后的最大值，排序后必为最后一项
  return [...breakpoints].filter((d) => d <= endDate).sort();
}

// 借款/事件行基础模板，interestBalance 传入当前利息结余
function makeEventRow(date, type, amount, principal, note, interestBalance = 0) {
  return {
    dateStart: date, dateEnd: "", type, amount, principal,
    interestOffset: "", principalOffset: "",
    lprBase: "", multiplierLabel: "", rate: "", days: "", interest: "",
    interestBalance: interestBalance.toFixed(2),
    note, isEvent: true,
  };
}

export function calculate({
  rateType,
  fixedRate,
  dayBase,
  endDate,
  lprData,
  multipliers,
  lprMode,
  lprTerm = "1y",
  mergeLpr = false,
  loans,
  repays,
}) {
  if (!endDate) throw new Error("请设置计息截止日期");

  const validLoans = loans.filter((l) => l.date && l.amount > 0);
  const validRepays = repays.filter((r) => r.date && r.amount > 0);

  if (validLoans.length === 0) throw new Error("请至少输入一笔借款");

  const events = [];
  validLoans.forEach((l) => events.push({ date: l.date, amount: l.amount, type: "loan", note: l.note || "" }));
  validRepays.forEach((r) =>
    events.push({ date: r.date, amount: r.amount, type: "repay", note: r.note || "", mode: r.mode || "先息后本" }),
  );
  // 同日先借款后还款；同类型保持录入顺序（比较器须对称，返回 0 才能依赖稳定排序）
  const typeOrder = { loan: 0, repay: 1 };
  events.sort((a, b) => a.date.localeCompare(b.date) || typeOrder[a.type] - typeOrder[b.type]);

  const allDates = collectBreakpoints({ rateType, endDate, events, lprData, multipliers, lprTerm, mergeLpr });
  const resolveRate = createRateResolver({ rateType, fixedRate, lprData, multipliers, lprMode, lprTerm });

  const rows = [];
  let principal = 0;
  let accruedInterest = 0;
  let totalInterestAccrued = 0;
  let totalInterestPaid = 0;
  let totalLoan = 0;
  let totalRepay = 0;
  let totalPrincipalPaid = 0;
  let eventIdx = 0;

  function appendInterestPeriod(curDate, nextDate) {
    const days = daysBetween(parseDate(curDate), parseDate(nextDate));
    if (days <= 0) return;

    const { annualRate, lprBase, multiplierLabel } = resolveRate(curDate);
    const dailyRate = annualRate / 100 / dayBase;
    const interest = principal * dailyRate * days;
    accruedInterest += interest;
    totalInterestAccrued += interest;

    rows.push({
      dateStart: curDate, dateEnd: nextDate,
      type: "计息",
      amount: "",
      interestOffset: "",
      principalOffset: "",
      principal,
      lprBase,
      multiplierLabel,
      rate: annualRate.toFixed(4),
      days,
      interest: interest.toFixed(2),
      interestBalance: accruedInterest.toFixed(2),
      note: "",
      isEvent: false,
    });
  }

  function applyRepay(ev) {
    const repayAmount = ev.amount;
    totalRepay += repayAmount;

    let interestPaid = 0;
    let principalPaid = 0;

    if (ev.mode === "先息后本") {
      interestPaid = Math.min(repayAmount, accruedInterest);
      principalPaid = Math.min(repayAmount - interestPaid, principal);
    } else {
      // 先本后息
      principalPaid = Math.min(repayAmount, principal);
      interestPaid = Math.min(repayAmount - principalPaid, accruedInterest);
    }
    accruedInterest -= interestPaid;
    principal -= principalPaid;
    totalInterestPaid += interestPaid;
    totalPrincipalPaid += principalPaid;

    rows.push({
      dateStart: ev.date, dateEnd: "",
      type: "还款",
      amount: repayAmount,
      interestOffset: interestPaid > 0 ? interestPaid.toFixed(2) : "",
      principalOffset: principalPaid > 0 ? principalPaid.toFixed(2) : "",
      principal,
      lprBase: "",
      multiplierLabel: "",
      rate: "",
      days: "",
      interest: "",
      interestBalance: accruedInterest.toFixed(2),
      note: ev.note || ev.mode,
      isEvent: true,
    });
  }

  for (let i = 0; i < allDates.length; i++) {
    const curDate = allDates[i];

    // 事件日期均已加入分段点，这里只会处理恰好落在 curDate 的事件
    while (eventIdx < events.length && events[eventIdx].date === curDate) {
      const ev = events[eventIdx];
      if (ev.type === "loan") {
        principal += ev.amount;
        totalLoan += ev.amount;
        rows.push(makeEventRow(curDate, "借款", ev.amount, principal, ev.note, accruedInterest));
      } else {
        applyRepay(ev);
      }
      eventIdx++;
    }

    if (i < allDates.length - 1 && principal > 0) {
      appendInterestPeriod(curDate, allDates[i + 1]);
    }
  }

  return {
    rows,
    totalLoan,
    totalRepay,
    totalInterest: totalInterestAccrued,
    totalInterestPaid,
    totalPrincipalPaid,
    remainPrincipal: principal,
    remainInterest: accruedInterest,
  };
}
