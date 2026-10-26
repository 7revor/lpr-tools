function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(d1, d2) {
  return Math.round((d2 - d1) / 86400000);
}

function getEffectiveRate(dateStr, lprData, multipliers, lprMode, lprTerm = "1y") {
  const sorted = [...lprData].sort((a, b) => a.date.localeCompare(b.date));
  let lpr = 0;
  for (const r of sorted) {
    if (r.date <= dateStr) lpr = lprTerm === "5y" ? r.lpr5y : r.lpr1y;
  }

  const sortedM = [...multipliers].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  let mValue = sortedM[0]?.value ?? 1;
  for (const m of sortedM) {
    if (!m.startDate || m.startDate <= dateStr) mValue = m.value;
  }

  const finalRate = lprMode === "multiplier" ? lpr * mValue : lpr + mValue / 100;
  const multiplierLabel = lprMode === "multiplier" ? `×${mValue}` : mValue >= 0 ? `+${mValue}BP` : `${mValue}BP`;
  return { lpr, finalRate, multiplierLabel };
}

// 金额内部统一以「分」为整数运算，避免浮点累加误差；对外输出仍为元
const toCents = (yuan) => Math.round(yuan * 100);
const toYuan = (cents) => cents / 100;
const fmt = (cents) => toYuan(cents).toFixed(2);
// 四舍五入到整数分；先截到 6 位小数，消除 12.4999999999 这类浮点尾差对进位的影响
const roundCents = (x) => Math.round(Number(x.toFixed(6)));

// 借款/事件行基础模板，金额参数均为分
function makeEventRow(date, type, amountCents, principalCents, note, interestBalanceCents = 0) {
  return {
    dateStart: date, dateEnd: "", type, amount: toYuan(amountCents), principal: toYuan(principalCents),
    interestOffset: "", principalOffset: "",
    lprBase: "", multiplierLabel: "", rate: "", days: "", interest: "",
    interestBalance: fmt(interestBalanceCents),
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

  const endD = parseDate(endDate);

  const events = [];
  validLoans.forEach((l) => events.push({ date: l.date, amount: toCents(l.amount), type: "loan", note: l.note || "" }));
  validRepays.forEach((r) =>
    events.push({ date: r.date, amount: toCents(r.amount), type: "repay", note: r.note || "", mode: r.mode || "先息后本" }),
  );
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.type === "loan" ? -1 : 1));

  const breakpoints = new Set();
  breakpoints.add(endDate);
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

  const allDates = [...breakpoints].filter((d) => d <= endDate).sort();
  if (!allDates.includes(endDate)) allDates.push(endDate);

  // 以下金额变量单位均为分
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
    const d1 = parseDate(curDate);
    const d2 = parseDate(nextDate);
    if (d2 > endD || d1 >= endD) return;
    const actualEnd = d2 <= endD ? d2 : endD;
    const days = daysBetween(d1, actualEnd);
    if (days <= 0) return;

    let annualRate, lprBase, multiplierLabel;
    if (rateType === "fixed") {
      annualRate = fixedRate;
      lprBase = "";
      multiplierLabel = "固定";
    } else {
      const r = getEffectiveRate(curDate, lprData, multipliers, lprMode, lprTerm);
      annualRate = r.finalRate;
      lprBase = r.lpr.toFixed(2);
      multiplierLabel = r.multiplierLabel;
    }

    // 每段利息先四舍五入到分再累加，保证表格逐行利息之和等于合计
    const interest = roundCents((principal * annualRate * days) / (100 * dayBase));
    accruedInterest += interest;
    totalInterestAccrued += interest;

    rows.push({
      dateStart: curDate, dateEnd: nextDate,
      type: "计息",
      amount: "",
      interestOffset: "",
      principalOffset: "",
      principal: toYuan(principal),
      lprBase,
      multiplierLabel,
      rate: annualRate.toFixed(4),
      days,
      interest: fmt(interest),
      interestBalance: fmt(accruedInterest),
      note: "",
      isEvent: false,
    });
  }

  for (let i = 0; i < allDates.length; i++) {
    const curDate = allDates[i];

    while (eventIdx < events.length && events[eventIdx].date <= curDate) {
      const ev = events[eventIdx];
      if (ev.date === curDate) {
        if (ev.type === "loan") {
          principal += ev.amount;
          totalLoan += ev.amount;
          rows.push(makeEventRow(curDate, "借款", ev.amount, principal, ev.note, accruedInterest));
        } else {
          const repayAmount = ev.amount;
          totalRepay += repayAmount;

          let interestPaid = 0;
          let principalPaid = 0;

          if (ev.mode === "先息后本") {
            interestPaid = Math.min(repayAmount, accruedInterest);
            accruedInterest -= interestPaid;
            totalInterestPaid += interestPaid;
            const remaining = repayAmount - interestPaid;
            principalPaid = Math.min(remaining, principal);
            principal -= principalPaid;
            if (principal < 0) principal = 0;
          } else {
            // 先本后息
            principalPaid = Math.min(repayAmount, principal);
            principal -= principalPaid;
            if (principal < 0) principal = 0;
            const remaining = repayAmount - principalPaid;
            interestPaid = Math.min(remaining, accruedInterest);
            accruedInterest -= interestPaid;
            totalInterestPaid += interestPaid;
          }
          totalPrincipalPaid += principalPaid;

          rows.push({
            dateStart: curDate, dateEnd: "",
            type: "还款",
            amount: toYuan(repayAmount),
            interestOffset: interestPaid > 0 ? fmt(interestPaid) : "",
            principalOffset: principalPaid > 0 ? fmt(principalPaid) : "",
            principal: toYuan(principal),
            lprBase: "",
            multiplierLabel: "",
            rate: "",
            days: "",
            interest: "",
            interestBalance: fmt(accruedInterest),
            note: ev.note || ev.mode,
            isEvent: true,
          });
        }
      }
      eventIdx++;
    }

    if (i < allDates.length - 1 && principal > 0) {
      appendInterestPeriod(curDate, allDates[i + 1]);
    }
  }

  if (principal > 0 && events.length > 0) {
    const lastDate = allDates[allDates.length - 1];
    const lastD = parseDate(lastDate);
    if (lastD < endD && lastDate !== endDate) {
      const days = daysBetween(lastD, endD);
      if (days > 0) {
        let annualRate, lprBase, multiplierLabel;
        if (rateType === "fixed") {
          annualRate = fixedRate;
          lprBase = "";
          multiplierLabel = "固定";
        } else {
          const r = getEffectiveRate(lastDate, lprData, multipliers, lprMode, lprTerm);
          annualRate = r.finalRate;
          lprBase = r.lpr.toFixed(2);
          multiplierLabel = r.multiplierLabel;
        }
        const interest = roundCents((principal * annualRate * days) / (100 * dayBase));
        accruedInterest += interest;
        totalInterestAccrued += interest;
        rows.push({
          dateStart: lastDate, dateEnd: endDate,
          type: "计息",
          amount: "",
          interestOffset: "",
          principalOffset: "",
          principal: toYuan(principal),
          lprBase,
          multiplierLabel,
          rate: annualRate.toFixed(4),
          days,
          interest: fmt(interest),
          interestBalance: fmt(accruedInterest),
          note: "",
          isEvent: false,
        });
      }
    }
  }

  return {
    rows,
    totalLoan: toYuan(totalLoan),
    totalRepay: toYuan(totalRepay),
    totalInterest: toYuan(totalInterestAccrued),
    totalInterestPaid: toYuan(totalInterestPaid),
    totalPrincipalPaid: toYuan(totalPrincipalPaid),
    remainPrincipal: toYuan(principal),
    remainInterest: toYuan(accruedInterest),
  };
}
