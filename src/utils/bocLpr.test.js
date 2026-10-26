import { describe, it, expect } from 'vitest';
import { parseBocLprHtml, validateLprRows, nextReleaseAt, latestLprDate } from './bocLpr';
import { DEFAULT_LPR } from '../data/lpr';

// 按中行页面的实际排版生成表格：表头 + 倒序数据行，每个单元格单独一行
function bocHtml(rows) {
  const body = [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => `<tr>\n<td>${r.date}</td>\n<td>${r.lpr1y.toFixed(2)}%</td>\n<td>${r.lpr5y.toFixed(2)}%</td></tr>`)
    .join('\n');
  return `<h2 align="center">全国银行间同业拆借中心发布的贷款市场报价利率（LPR）</h2><table align="center" border="1" cellspacing="0" cellpadding="3">
<tbody>
<tr>
<th width="100">LPR报价</th>
<th width="80">1年期</th>
<th width="80">5年期以上</th></tr>
${body}</tbody></table><p><strong>【贷款市场报价利率】</strong></p>`;
}

describe('parseBocLprHtml', () => {
  it('解析全部数据行并按日期升序返回', () => {
    expect(parseBocLprHtml(bocHtml(DEFAULT_LPR))).toEqual(DEFAULT_LPR);
  });

  it('把中行页面的错误日期修正为官方日期', () => {
    const html = bocHtml(DEFAULT_LPR.map((r) => (r.date === '2021-02-20' ? { ...r, date: '2021-02-22' } : r)));
    const rows = parseBocLprHtml(html);
    expect(rows.some((r) => r.date === '2021-02-22')).toBe(false);
    expect(rows.find((r) => r.date === '2021-02-20')).toEqual({ date: '2021-02-20', lpr1y: 3.85, lpr5y: 4.65 });
  });

  it('页面结构变化时返回空数组', () => {
    expect(parseBocLprHtml('<html><body>维护中</body></html>')).toEqual([]);
  });
});

describe('validateLprRows', () => {
  it('完整连续的数据通过校验', () => {
    expect(() => validateLprRows(DEFAULT_LPR, DEFAULT_LPR.slice(0, -1))).not.toThrow();
  });

  it('空数据报错', () => {
    expect(() => validateLprRows([])).toThrow('未解析到任何 LPR 数据');
  });

  it('首期不是 2019-08-20 报错', () => {
    expect(() => validateLprRows(DEFAULT_LPR.slice(1))).toThrow('首期日期应为 2019-08-20');
  });

  it('中间缺月报错', () => {
    const rows = DEFAULT_LPR.filter((r) => r.date !== '2023-05-22');
    expect(() => validateLprRows(rows)).toThrow('月份不连续：应为 2023-05');
  });

  it('同月重复报错', () => {
    const rows = [...DEFAULT_LPR.slice(0, 3), { date: '2019-10-28', lpr1y: 4.2, lpr5y: 4.85 }, ...DEFAULT_LPR.slice(3)];
    expect(() => validateLprRows(rows)).toThrow('月份不连续');
  });

  it('利率数值异常报错', () => {
    const rows = DEFAULT_LPR.map((r, i) => (i === 5 ? { ...r, lpr5y: 0 } : r));
    expect(() => validateLprRows(rows)).toThrow('lpr5y 数值异常');
  });

  it('比上一版少期报错', () => {
    expect(() => validateLprRows(DEFAULT_LPR.slice(0, -1), DEFAULT_LPR)).toThrow('期数比上一版少');
  });

  it('上一版中的日期消失报错', () => {
    const prev = DEFAULT_LPR.map((r) => (r.date === '2021-02-20' ? { ...r, date: '2021-02-22' } : r));
    expect(() => validateLprRows(DEFAULT_LPR, prev)).toThrow('2021-02-22 在新数据中消失');
  });
});

describe('nextReleaseAt', () => {
  it('为次月 20 日北京时间 10:00', () => {
    expect(nextReleaseAt('2026-05-20').toISOString()).toBe('2026-06-20T02:00:00.000Z');
  });

  it('上一期顺延到月底也按次月 20 日计', () => {
    expect(nextReleaseAt('2026-02-24').toISOString()).toBe('2026-03-20T02:00:00.000Z');
  });

  it('12 月跨年', () => {
    expect(nextReleaseAt('2025-12-22').toISOString()).toBe('2026-01-20T02:00:00.000Z');
  });
});

describe('latestLprDate', () => {
  it('返回最大日期，与数组顺序无关', () => {
    expect(latestLprDate([{ date: '2024-01-22' }, { date: '2026-10-20' }, { date: '2025-03-20' }])).toBe('2026-10-20');
  });

  it('空数组返回空字符串', () => {
    expect(latestLprDate([])).toBe('');
  });
});
