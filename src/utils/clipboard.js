export function copyTableAsText(result, separator = '\t') {
  const { rows, totalInterest, totalInterestPaid, remainInterest } = result;
  const header = ['序号', '日期/期间', '类型', '发生金额', '剩余本金', 'LPR(%)', '倍率/加点', '年利率(%)', '计息天数', '利息', '备注'];
  const lines = [header.join(separator)];

  rows.forEach((r, i) => {
    const vals = [
      i + 1,
      r.date,
      r.type,
      r.amount === '-' ? '-' : Number(r.amount).toFixed(2),
      Number(r.principal).toFixed(2),
      r.lprBase || '-',
      r.multiplierLabel || '-',
      r.rate,
      r.days,
      r.interest === '-' ? '-' : Number(r.interest).toFixed(2),
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

  lines.push(['', '', '', '', '', '', '', '', '利息合计（产生）', totalInterest.toFixed(2), ''].join(separator));
  lines.push(['', '', '', '', '', '', '', '', '已还利息', `-${totalInterestPaid.toFixed(2)}`, ''].join(separator));
  lines.push(['', '', '', '', '', '', '', '', '未还利息', remainInterest.toFixed(2), ''].join(separator));
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
