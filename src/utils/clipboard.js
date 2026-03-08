// 列数与表头一致（14 列），汇总行标签占第 13 列，数值占第 14 列
const COL_COUNT = 14;

function summaryRow(label, value, separator) {
  const cells = Array(COL_COUNT).fill('');
  cells[COL_COUNT - 2] = label;
  cells[COL_COUNT - 1] = value;
  return cells.join(separator);
}

export function copyTableAsText(result, separator = '\t') {
  const {
    rows,
    totalLoan, totalRepay,
    totalInterest, totalInterestPaid,
    remainPrincipal, remainInterest,
  } = result;

  const header = ['序号', '日期/期间', '类型', '发生金额', 'LPR(%)', '倍率/加点', '年利率(%)', '计息天数', '本期利息', '冲息', '利息结余', '还本', '剩余本金', '备注'];
  const lines = [header.join(separator)];

  rows.forEach((r, i) => {
    const vals = [
      i + 1,
      r.date,
      r.type,
      r.amount === '-' ? '-' : Number(r.amount).toFixed(2),
      r.lprBase || '-',
      r.multiplierLabel || '-',
      r.rate,
      r.days,
      r.interest === '-' ? '-' : Number(r.interest).toFixed(2),
      r.interestOffset === '-' ? '-' : Number(r.interestOffset).toFixed(2),
      Number(r.interestBalance).toFixed(2),
      r.principalOffset === '-' ? '-' : Number(r.principalOffset).toFixed(2),
      Number(r.principal).toFixed(2),
      r.note || '',
    ];
    if (separator === ',') {
      lines.push(vals.map((v) => {
        const s = String(v);
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','));
    } else {
      lines.push(vals.join(separator));
    }
  });

  // 汇总行与表格上方 summary-box 保持一致（同样 7 项、同样正负号）
  lines.push(summaryRow('借款总额', totalLoan.toFixed(2), separator));
  lines.push(summaryRow('还款总额', totalRepay.toFixed(2), separator));
  lines.push(summaryRow('剩余本金', remainPrincipal.toFixed(2), separator));
  lines.push(summaryRow('利息合计', totalInterest.toFixed(2), separator));
  lines.push(summaryRow('已还利息', totalInterestPaid.toFixed(2), separator));
  lines.push(summaryRow('未还利息', remainInterest.toFixed(2), separator));
  lines.push(summaryRow('本息合计(未还)', (remainPrincipal + remainInterest).toFixed(2), separator));

  return lines.join('\n');
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}
