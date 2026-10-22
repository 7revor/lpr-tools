import { isIsoDate } from "./date";

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
  // 没有任何分段时：倍率模式默认 ×1，加点模式默认 +0BP
  const defaultM = sortedM[0]?.value ?? (lprMode === "multiplier" ? 1 : 0);

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

    // 去掉 3.45 × 1.5 = 5.175000000000001 这类浮点尾差
    const annualRate = Number((lprMode === "multiplier" ? lpr * mValue : lpr + mValue / 100).toFixed(8));
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

// 金额内部统一以「分」为整数运算，避免浮点累加误差；对外输出仍为元
const toCents = (yuan) => Math.round(yuan * 100);
const toYuan = (cents) => cents / 100;
const fmt = (cents) => toYuan(cents).toFixed(2);
// 四舍五入到整数分；先截到 6 位小数，消除 12.4999999999 这类浮点尾差对进位的影响
const roundCents = (x) => Math.round(Number(x.toFixed(6)));

// 日期按 YYYY-MM-DD 字符串比较大小，格式不规范（如 2024/7/22）会导致分段错乱，计算前统一校验
function assertDates({ rateType, endDate, events, lprData, multipliers }) {
  if (!isIsoDate(endDate)) throw new Error(`计息截止日期「${endDate}」格式无效，应为 YYYY-MM-DD`);
  for (const e of events) {
    if (!isIsoDate(e.date)) throw new Error(`${e.type === "loan" ? "借款" : "还款"}日期「${e.date}」格式无效，应为 YYYY-MM-DD`);
  }
  if (rateType !== "lpr") return;
  for (const r of lprData) {
    if (!isIsoDate(r.date)) throw new Error(`LPR 生效日期「${r.date}」格式无效，应为 YYYY-MM-DD`);
  }
  for (const m of multipliers) {
    if (m.startDate && !isIsoDate(m.startDate)) throw new Error(`倍率/加点起始日期「${m.startDate}」格式无效，应为 YYYY-MM-DD`);
  }
}

// 倍率/加点值为空时不能按 0 处理（倍率 0 会让利率归零），必须显式填写
function assertMultipliers({ rateType, multipliers, lprMode }) {
  if (rateType !== "lpr") return;
  for (const m of multipliers) {
    const label = m.startDate ? `起始日期 ${m.startDate} 的` : "首段";
    if (typeof m.value !== "number" || !Number.isFinite(m.value)) {
      throw new Error(`${label}${lprMode === "multiplier" ? "倍率" : "加点值"}未填写`);
    }
    if (lprMode === "multiplier" && m.value <= 0) {
      throw new Error(`${label}倍率必须大于 0`);
    }
  }
}

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

  const events = [];
  validLoans.forEach((l) => events.push({ date: l.date, amount: toCents(l.amount), type: "loan", note: l.note || "" }));
  validRepays.forEach((r) =>
    events.push({ date: r.date, amount: toCents(r.amount), type: "repay", note: r.note || "", mode: r.mode || "先息后本" }),
  );
  // 同日先借款后还款；同类型保持录入顺序（比较器须对称，返回 0 才能依赖稳定排序）
  const typeOrder = { loan: 0, repay: 1 };
  events.sort((a, b) => a.date.localeCompare(b.date) || typeOrder[a.type] - typeOrder[b.type]);
  assertDates({ rateType, endDate, events, lprData, multipliers });
  assertMultipliers({ rateType, multipliers, lprMode });

  const allDates = collectBreakpoints({ rateType, endDate, events, lprData, multipliers, lprTerm, mergeLpr });
  const resolveRate = createRateResolver({ rateType, fixedRate, lprData, multipliers, lprMode, lprTerm });

  // 以下金额变量单位均为分
  const rows = [];
  let principal = 0;
  let accruedInterest = 0;
  let totalInterestAccrued = 0;
  let totalInterestPaid = 0;
  let totalLoan = 0;
  let totalRepay = 0;
  let totalPrincipalPaid = 0;
  let totalOverpaid = 0;
  let eventIdx = 0;
  const warnings = [];

  const lateEvents = events.filter((e) => e.date > endDate);
  if (lateEvents.length > 0) {
    const list = lateEvents.map((e) => `${e.date} ${e.type === "loan" ? "借款" : "还款"} ${fmt(e.amount)}`).join("、");
    warnings.push(`以下 ${lateEvents.length} 笔晚于计息截止日 ${endDate}，未参与计算：${list}`);
  }

  function appendInterestPeriod(curDate, nextDate) {
    const days = daysBetween(parseDate(curDate), parseDate(nextDate));
    if (days <= 0) return;

    const { annualRate, lprBase, multiplierLabel } = resolveRate(curDate);
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

    // 还款超过当时全部应还本息的部分无处冲抵，单独记录并提示，避免金额凭空消失
    const overpaid = repayAmount - interestPaid - principalPaid;
    let note = ev.note || ev.mode;
    if (overpaid > 0) {
      totalOverpaid += overpaid;
      note += `；溢缴 ${fmt(overpaid)}`;
      warnings.push(`${ev.date} 还款 ${fmt(repayAmount)} 超出当时应还本息，溢缴 ${fmt(overpaid)} 未参与冲抵`);
    }

    rows.push({
      dateStart: ev.date, dateEnd: "",
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
      note,
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
    totalLoan: toYuan(totalLoan),
    totalRepay: toYuan(totalRepay),
    totalInterest: toYuan(totalInterestAccrued),
    totalInterestPaid: toYuan(totalInterestPaid),
    totalPrincipalPaid: toYuan(totalPrincipalPaid),
    totalOverpaid: toYuan(totalOverpaid),
    remainPrincipal: toYuan(principal),
    remainInterest: toYuan(accruedInterest),
    warnings,
  };
}
