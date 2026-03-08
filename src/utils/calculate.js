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

function makeEventRow(date, type, amount, principal, note) {
  return {
    date,
    type,
    amount,
    principal,
    lprBase: "-",
    multiplierLabel: "-",
    rate: "-",
    days: "-",
    interest: "-",
    note,
    isEvent: true,
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
  loans,
  repays,
}) {
  if (!endDate) throw new Error("请设置计息截止日期");

  const validLoans = loans.filter((l) => l.date && l.amount > 0);
  const validRepays = repays.filter((r) => r.date && r.amount > 0);

  if (validLoans.length === 0) throw new Error("请至少输入一笔借款");

  const endD = parseDate(endDate);

  const events = [];
  validLoans.forEach((l) => events.push({ date: l.date, amount: l.amount, type: "loan", note: l.note || "" }));
  validRepays.forEach((r) =>
    events.push({ date: r.date, amount: r.amount, type: "repay", note: r.note || "", mode: r.mode || "先息后本" }),
  );
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.type === "loan" ? -1 : 1));

  const breakpoints = new Set();
  breakpoints.add(endDate);
  events.forEach((e) => breakpoints.add(e.date));

  if (rateType === "lpr") {
    lprData.forEach((r) => breakpoints.add(r.date));
    multipliers.forEach((m) => {
      if (m.startDate) breakpoints.add(m.startDate);
    });
  }

  const allDates = [...breakpoints].filter((d) => d <= endDate).sort();
  if (!allDates.includes(endDate)) allDates.push(endDate);

  const rows = [];
  let principal = 0;
  let accruedInterest = 0;
  let totalInterestAccrued = 0;
  let totalInterestPaid = 0;
  let totalLoan = 0;
  let totalRepay = 0;
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
      lprBase = "-";
      multiplierLabel = "固定";
    } else {
      const r = getEffectiveRate(curDate, lprData, multipliers, lprMode, lprTerm);
      annualRate = r.finalRate;
      lprBase = r.lpr.toFixed(2);
      multiplierLabel = r.multiplierLabel;
    }

    const dailyRate = annualRate / 100 / dayBase;
    const interest = principal * dailyRate * days;
    accruedInterest += interest;
    totalInterestAccrued += interest;

    rows.push({
      date: `${curDate} 至 ${nextDate}`,
      type: "计息",
      amount: "-",
      principal,
      lprBase,
      multiplierLabel,
      rate: annualRate.toFixed(4),
      days,
      interest: interest.toFixed(2),
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
          rows.push(makeEventRow(curDate, "借款", ev.amount, principal, ev.note));
        } else {
          const repayAmount = ev.amount;
          totalRepay += repayAmount;

          if (ev.mode === "先息后本") {
            const interestPaid = Math.min(repayAmount, accruedInterest);
            accruedInterest -= interestPaid;
            totalInterestPaid += interestPaid;
            const remaining = repayAmount - interestPaid;
            const principalPaid = Math.min(remaining, principal);
            principal -= principalPaid;
            if (principal < 0) principal = 0;
            const isSplit = interestPaid > 0 && principalPaid > 0;
            const firstNote = isSplit ? `${ev.mode}，本次还款共${repayAmount.toFixed(2)}元` : ev.note || ev.mode;
            if (interestPaid > 0) {
              rows.push({
                ...makeEventRow(curDate, "还款(冲息)", interestPaid, principal + principalPaid, firstNote),
                interest: (-interestPaid).toFixed(2),
              });
            }
            if (principalPaid > 0) {
              rows.push(
                makeEventRow(
                  curDate,
                  "还款(还本)",
                  principalPaid,
                  principal,
                  isSplit && interestPaid > 0 ? "" : ev.note || ev.mode,
                ),
              );
            }
            if (interestPaid === 0 && principalPaid === 0) {
              rows.push(makeEventRow(curDate, "还款", repayAmount, principal, ev.note || ev.mode));
            }
          } else {
            const principalPaid = Math.min(repayAmount, principal);
            principal -= principalPaid;
            if (principal < 0) principal = 0;
            const remaining = repayAmount - principalPaid;
            const interestPaid = Math.min(remaining, accruedInterest);
            accruedInterest -= interestPaid;
            totalInterestPaid += interestPaid;
            const isSplit = principalPaid > 0 && interestPaid > 0;
            const firstNote = isSplit ? `${ev.mode}，本次还款共${repayAmount.toFixed(2)}元` : ev.note || ev.mode;
            if (principalPaid > 0) {
              rows.push(makeEventRow(curDate, "还款(还本)", principalPaid, principal, firstNote));
            }
            if (interestPaid > 0) {
              rows.push({
                ...makeEventRow(
                  curDate,
                  "还款(冲息)",
                  interestPaid,
                  principal,
                  isSplit && principalPaid > 0 ? "" : ev.note || ev.mode,
                ),
                interest: (-interestPaid).toFixed(2),
              });
            }
            if (principalPaid === 0 && interestPaid === 0) {
              rows.push(makeEventRow(curDate, "还款", repayAmount, principal, ev.note || ev.mode));
            }
          }
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
          lprBase = "-";
          multiplierLabel = "固定";
        } else {
          const r = getEffectiveRate(lastDate, lprData, multipliers, lprMode, lprTerm);
          annualRate = r.finalRate;
          lprBase = r.lpr.toFixed(2);
          multiplierLabel = r.multiplierLabel;
        }
        const dailyRate = annualRate / 100 / dayBase;
        const interest = principal * dailyRate * days;
        accruedInterest += interest;
        totalInterestAccrued += interest;
        rows.push({
          date: `${lastDate} 至 ${endDate}`,
          type: "计息",
          amount: "-",
          principal,
          lprBase,
          multiplierLabel,
          rate: annualRate.toFixed(4),
          days,
          interest: interest.toFixed(2),
          note: "",
          isEvent: false,
        });
      }
    }
  }

  return {
    rows,
    totalLoan,
    totalRepay,
    totalInterest: totalInterestAccrued,
    totalInterestPaid,
    remainPrincipal: principal,
    remainInterest: accruedInterest,
  };
}
