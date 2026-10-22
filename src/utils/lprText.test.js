import { describe, it, expect } from 'vitest';
import { parseLprText } from './lprText';

describe('parseLprText', () => {
  it('日期统一规范为 YYYY-MM-DD', () => {
    const text = '2024/7/22\t3.35%\t3.85%\n2024-10-21,3.10,3.60\n20250520;3.00%;3.50%';
    expect(parseLprText(text)).toEqual([
      { date: '2024-07-22', lpr1y: 3.35, lpr5y: 3.85 },
      { date: '2024-10-21', lpr1y: 3.1, lpr5y: 3.6 },
      { date: '2025-05-20', lpr1y: 3, lpr5y: 3.5 },
    ]);
  });

  it('跳过表头与无法识别的行', () => {
    const text = '日期\t1年期\t5年期\n2024-13-01\t3.1\t3.6\n2024-10-21\t3.10%\t3.60%';
    expect(parseLprText(text)).toEqual([{ date: '2024-10-21', lpr1y: 3.1, lpr5y: 3.6 }]);
  });

  it('同一日期重复时以最后一行为准', () => {
    const text = '2024-10-21\t3.10\t3.60\n2024/10/21\t3.15\t3.65';
    expect(parseLprText(text)).toEqual([{ date: '2024-10-21', lpr1y: 3.15, lpr5y: 3.65 }]);
  });
});
