import { describe, it, expect } from 'vitest';
import { calculate } from './calculate';
import { DEFAULT_LPR } from '../data/lpr';

const toCents = (yuan) => Math.round(Number(yuan) * 100);
const sumCents = (rows, field) => rows.reduce((s, r) => s + (r[field] === '' ? 0 : toCents(r[field])), 0);

const base = {
  rateType: 'lpr',
  fixedRate: 4.35,
  dayBase: 365,
  lprData: DEFAULT_LPR,
  multipliers: [{ startDate: '', value: 1.5 }],
  lprMode: 'multiplier',
  lprTerm: '1y',
  mergeLpr: false,
};

describe('calculate 舍入', () => {
  it('长期限多分段：逐行利息之和等于利息合计', () => {
    const res = calculate({
      ...base,
      endDate: '2026-10-26',
      loans: [
        { date: '2019-09-03', amount: 123456.78 },
        { date: '2021-03-17', amount: 98765.43 },
      ],
      repays: [
        { date: '2022-06-08', amount: 33333.33, mode: '先息后本' },
        { date: '2024-01-15', amount: 55555.55, mode: '先本后息' },
      ],
    });
    expect(toCents(res.totalInterest)).toBe(sumCents(res.rows, 'interest'));
    expect(toCents(res.totalInterestPaid)).toBe(sumCents(res.rows, 'interestOffset'));
    // 累计利息 = 已还利息 + 未还利息，且与最后一行的利息结余一致
    expect(toCents(res.totalInterest)).toBe(toCents(res.totalInterestPaid) + toCents(res.remainInterest));
    expect(toCents(res.remainInterest)).toBe(toCents(res.rows.at(-1).interestBalance));
  });

  it('每行利息结余 = 上一行结余 + 本期利息 - 冲息', () => {
    const res = calculate({
      ...base,
      endDate: '2025-12-31',
      loans: [{ date: '2020-01-07', amount: 87654.32 }],
      repays: [{ date: '2023-05-11', amount: 12345.67, mode: '先息后本' }],
    });
    let balance = 0;
    for (const r of res.rows) {
      balance += (r.interest === '' ? 0 : toCents(r.interest)) - (r.interestOffset === '' ? 0 : toCents(r.interestOffset));
      expect(toCents(r.interestBalance)).toBe(balance);
    }
  });

  it('固定利率、截止日不在分段点上时最后一段同样舍入', () => {
    const res = calculate({
      ...base,
      rateType: 'fixed',
      fixedRate: 3.85,
      endDate: '2024-08-09',
      loans: [{ date: '2023-01-03', amount: 1001.01 }, { date: '2023-07-19', amount: 2333.33 }],
      repays: [],
    });
    expect(toCents(res.totalInterest)).toBe(sumCents(res.rows, 'interest'));
  });
});
