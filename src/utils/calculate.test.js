import { describe, it, expect } from 'vitest';
import { calculate } from './calculate';
import { DEFAULT_LPR } from '../data/lpr';

const base = {
  rateType: 'lpr',
  fixedRate: 4.35,
  dayBase: 365,
  lprData: DEFAULT_LPR,
  multipliers: [{ startDate: '', value: 1 }],
  lprMode: 'multiplier',
  lprTerm: '1y',
  mergeLpr: true,
  repays: [],
};

const periods = (res) => res.rows.filter((r) => !r.isEvent);
const repayRows = (res) => res.rows.filter((r) => r.type === '还款');

// 手工计算：Σ round(本金 × 年利率 / 基数 × 天数, 2)，每段先舍入到分再累加
function manual(principal, segs, dayBase = 365) {
  return segs.reduce((s, [a, b, rate]) => {
    const seg = principal * rate / 100 / dayBase * ((new Date(b) - new Date(a)) / 86400000);
    return s + Math.round(seg * 100) / 100;
  }, 0);
}

describe('calculate 基础校验', () => {
  it('缺少截止日期时报错', () => {
    expect(() => calculate({ ...base, endDate: '', loans: [{ date: '2024-01-01', amount: 1 }] })).toThrow('截止日期');
  });

  it('没有有效借款时报错', () => {
    expect(() => calculate({ ...base, endDate: '2024-12-31', loans: [{ date: '2024-01-01', amount: 0 }] })).toThrow('至少输入一笔借款');
  });
});

describe('截止日之后的事件', () => {
  it('不参与计算并给出警告', () => {
    const res = calculate({
      ...base, endDate: '2024-06-30',
      loans: [{ date: '2024-01-01', amount: 10000 }, { date: '2024-08-01', amount: 5000 }],
      repays: [{ date: '2024-07-01', amount: 100, mode: '先息后本' }],
    });
    expect(res.totalLoan).toBe(10000);
    expect(res.totalRepay).toBe(0);
    expect(res.warnings).toEqual([
      '以下 2 笔晚于计息截止日 2024-06-30，未参与计算：2024-07-01 还款 100.00、2024-08-01 借款 5000.00',
    ]);
  });

  it('截止日当天的还款参与计算', () => {
    const res = calculate({
      ...base, endDate: '2024-06-30',
      loans: [{ date: '2024-01-01', amount: 10000 }],
      repays: [{ date: '2024-06-30', amount: 100, mode: '先息后本' }],
    });
    expect(res.totalRepay).toBe(100);
    expect(res.warnings).toEqual([]);
  });
});

describe('LPR 浮动计息', () => {
  const args = { ...base, endDate: '2024-12-31', loans: [{ date: '2024-01-01', amount: 10000 }] };

  it('跨 LPR 调整分段计息，结果与手算一致', () => {
    const res = calculate(args);
    const expected = manual(10000, [
      ['2024-01-01', '2024-07-22', 3.45],
      ['2024-07-22', '2024-10-21', 3.35],
      ['2024-10-21', '2024-12-31', 3.10],
    ]);
    expect(res.totalInterest).toBeCloseTo(expected, 2);
    expect(periods(res).map((r) => [r.dateStart, r.dateEnd, r.lprBase])).toEqual([
      ['2024-01-01', '2024-07-22', '3.45'],
      ['2024-07-22', '2024-10-21', '3.35'],
      ['2024-10-21', '2024-12-31', '3.10'],
    ]);
  });

  it('计息区间早于首条 LPR 时报错而不是按 0 计息', () => {
    expect(() => calculate({ ...args, endDate: '2019-12-31', loans: [{ date: '2019-01-01', amount: 10000 }] }))
      .toThrow('早于 LPR 数据最早生效日 2019-08-20');
  });

  it('LPR 数据为空时报错', () => {
    expect(() => calculate({ ...args, lprData: [] })).toThrow('LPR 数据为空');
  });

  it('早于首条 LPR 但当时本金为 0（尚未借款）不报错', () => {
    const res = calculate({
      ...args, endDate: '2019-12-31',
      loans: [{ date: '2019-09-01', amount: 10000 }],
      repays: [{ date: '2019-01-01', amount: 1, mode: '先息后本' }],
    });
    expect(periods(res)[0].lprBase).toBe('4.25');
  });

  it('合并与不合并 LPR 分段的利息合计相同', () => {
    const merged = calculate(args);
    const split = calculate({ ...args, mergeLpr: false });
    expect(periods(split).length).toBeGreaterThan(periods(merged).length);
    expect(split.totalInterest).toBeCloseTo(merged.totalInterest, 2);
  });

  it('5 年期 LPR', () => {
    const res = calculate({ ...args, lprTerm: '5y' });
    const expected = manual(10000, [
      ['2024-01-01', '2024-02-20', 4.2],
      ['2024-02-20', '2024-07-22', 3.95],
      ['2024-07-22', '2024-10-21', 3.85],
      ['2024-10-21', '2024-12-31', 3.6],
    ]);
    expect(res.totalInterest).toBeCloseTo(expected, 2);
  });

  it('倍率分段：起始日期切分并按段内倍率计息', () => {
    const res = calculate({
      ...args,
      multipliers: [{ startDate: '', value: 1 }, { startDate: '2024-04-01', value: 1.5 }],
    });
    const expected = manual(10000, [['2024-01-01', '2024-04-01', 3.45]])
      + manual(10000, [
        ['2024-04-01', '2024-07-22', 3.45 * 1.5],
        ['2024-07-22', '2024-10-21', 3.35 * 1.5],
        ['2024-10-21', '2024-12-31', 3.10 * 1.5],
      ]);
    expect(res.totalInterest).toBeCloseTo(expected, 2);
    expect(periods(res)[1].multiplierLabel).toBe('×1.5');
  });

  it('加点模式：LPR + BP/100', () => {
    const res = calculate({ ...args, lprMode: 'basis', multipliers: [{ startDate: '', value: 50 }] });
    const expected = manual(10000, [
      ['2024-01-01', '2024-07-22', 3.95],
      ['2024-07-22', '2024-10-21', 3.85],
      ['2024-10-21', '2024-12-31', 3.60],
    ]);
    expect(res.totalInterest).toBeCloseTo(expected, 2);
    expect(periods(res)[0].multiplierLabel).toBe('+50BP');
  });
});

describe('金额精度', () => {
  const sumRows = (res) => periods(res).reduce((s, r) => s + Math.round(Number(r.interest) * 100), 0) / 100;

  it('表格逐行利息之和等于利息合计（逐段四舍五入到分）', () => {
    const amounts = [12345.67, 98765.43, 1000000, 333.33, 7777777.77, 0.01];
    for (const amount of amounts) {
      for (const value of [1, 1.3, 1.5, 4]) {
        const res = calculate({
          ...base, mergeLpr: false, multipliers: [{ startDate: '', value }],
          endDate: '2026-06-30', loans: [{ date: '2019-09-01', amount }],
          repays: [{ date: '2022-03-15', amount: amount / 3, mode: '先息后本' }],
        });
        expect(sumRows(res)).toBe(res.totalInterest);
        expect(Math.round((res.totalInterestPaid + res.remainInterest) * 100)).toBe(Math.round(res.totalInterest * 100));
      }
    }
  });

  it('单段利息按分四舍五入', () => {
    // 100 元 × 3.65% / 365 × 1 天 = 0.01 元；× 5 天 = 0.05 元；0.5 元 × 1 天 = 0.0005 元 → 0.00
    const fixed = { ...base, rateType: 'fixed', fixedRate: 3.65 };
    expect(calculate({ ...fixed, endDate: '2024-01-06', loans: [{ date: '2024-01-01', amount: 100 }] }).totalInterest).toBe(0.05);
    expect(calculate({ ...fixed, endDate: '2024-01-02', loans: [{ date: '2024-01-01', amount: 0.5 }] }).totalInterest).toBe(0);
  });

  it('倍率乘积不带浮点尾差', () => {
    const res = calculate({
      ...base, multipliers: [{ startDate: '', value: 1.5 }],
      endDate: '2024-07-01', loans: [{ date: '2024-01-01', amount: 10000 }],
    });
    expect(periods(res)[0].rate).toBe('5.1750');
  });
});

describe('固定利率', () => {
  it('按固定年利率与 360 天基数计息', () => {
    const res = calculate({
      ...base, rateType: 'fixed', fixedRate: 3.6, dayBase: 360,
      endDate: '2024-12-31', loans: [{ date: '2024-01-01', amount: 10000 }],
    });
    expect(periods(res)).toHaveLength(1);
    expect(res.totalInterest).toBeCloseTo(10000 * 0.036 / 360 * 365, 2);
  });
});

describe('还款冲抵', () => {
  const fixed = { ...base, rateType: 'fixed', fixedRate: 3.65, endDate: '2024-12-31', loans: [{ date: '2024-01-01', amount: 10000 }] };
  // 2024-01-01 至 2024-03-01 共 60 天，利息 = 10000 × 3.65% / 365 × 60 = 60

  it('先息后本：先冲利息再还本金', () => {
    const res = calculate({ ...fixed, repays: [{ date: '2024-03-01', amount: 1060, mode: '先息后本' }] });
    const row = repayRows(res)[0];
    expect(row.interestOffset).toBe('60.00');
    expect(row.principalOffset).toBe('1000.00');
    expect(row.principal).toBe(9000);
    expect(row.interestBalance).toBe('0.00');
  });

  it('先本后息：先还本金再冲利息', () => {
    const res = calculate({ ...fixed, repays: [{ date: '2024-03-01', amount: 1060, mode: '先本后息' }] });
    const row = repayRows(res)[0];
    expect(row.principalOffset).toBe('1060.00');
    expect(row.interestOffset).toBe('');
    expect(row.interestBalance).toBe('60.00');
  });

  it('还款日之后按新本金计息', () => {
    const res = calculate({ ...fixed, repays: [{ date: '2024-03-01', amount: 5060, mode: '先息后本' }] });
    expect(res.totalInterest).toBeCloseTo(60 + 5000 * 0.0365 / 365 * 305, 2);
    expect(res.remainPrincipal).toBe(5000);
  });

  it('同日先借款后还款', () => {
    const res = calculate({
      ...fixed,
      loans: [{ date: '2024-01-01', amount: 10000 }, { date: '2024-03-01', amount: 2000 }],
      repays: [{ date: '2024-03-01', amount: 1060, mode: '先息后本' }],
    });
    const types = res.rows.filter((r) => r.dateStart === '2024-03-01' && r.isEvent).map((r) => r.type);
    expect(types).toEqual(['借款', '还款']);
    expect(repayRows(res)[0].principal).toBe(11000);
  });

  it('同日多笔还款保持录入顺序', () => {
    const repays = ['A', 'B', 'C', 'D', 'E'].map((note, i) => ({
      date: '2024-03-01', amount: 100, note, mode: i % 2 ? '先息后本' : '先本后息',
    }));
    // 录入顺序打乱借还款交错，排序后借款在前、还款仍按录入顺序
    const loans = [{ date: '2024-01-01', amount: 10000 }, { date: '2024-03-01', amount: 500, note: 'L' }];
    const res = calculate({ ...fixed, loans, repays });
    const notes = res.rows.filter((r) => r.dateStart === '2024-03-01' && r.isEvent).map((r) => r.note);
    expect(notes).toEqual(['L', 'A', 'B', 'C', 'D', 'E']);
  });

  it('超额还款记录溢缴金额并给出警告', () => {
    const res = calculate({ ...fixed, repays: [{ date: '2024-03-01', amount: 50000, mode: '先息后本' }] });
    expect(res.totalInterestPaid + res.totalPrincipalPaid + res.totalOverpaid).toBeCloseTo(res.totalRepay, 2);
    expect(res.totalOverpaid).toBeCloseTo(50000 - 10060, 2);
    expect(repayRows(res)[0].note).toContain('溢缴 39940.00');
    expect(res.warnings).toHaveLength(1);
  });

  it('借款前的还款整笔计为溢缴', () => {
    const res = calculate({ ...fixed, repays: [{ date: '2023-12-01', amount: 300, mode: '先本后息' }] });
    expect(res.totalOverpaid).toBe(300);
    expect(res.remainPrincipal).toBe(10000);
  });

  it('恰好还清时没有溢缴', () => {
    const res = calculate({ ...fixed, repays: [{ date: '2024-03-01', amount: 10060, mode: '先本后息' }] });
    expect(res.totalOverpaid).toBe(0);
    expect(res.warnings).toEqual([]);
  });

  it('全部还清后停止计息', () => {
    const res = calculate({ ...fixed, repays: [{ date: '2024-03-01', amount: 10060, mode: '先息后本' }] });
    expect(res.remainPrincipal).toBe(0);
    expect(res.remainInterest).toBe(0);
    expect(periods(res)).toHaveLength(1);
  });
});
