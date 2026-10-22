import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { today, normalizeDate, isIsoDate } from './date';

describe('today', () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Asia/Shanghai';
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
  });

  it('使用本地时区日期：北京时间 07:30 仍是当天', () => {
    vi.setSystemTime(new Date('2026-10-21T23:30:00Z')); // 北京时间 2026-10-22 07:30
    expect(today()).toBe('2026-10-22');
  });
});

describe('normalizeDate / isIsoDate', () => {
  it('多种输入格式规范为 YYYY-MM-DD', () => {
    expect(normalizeDate('2024/7/2')).toBe('2024-07-02');
    expect(normalizeDate('20240702')).toBe('2024-07-02');
    expect(normalizeDate('2024-02-30')).toBeNull();
  });

  it('仅接受补零且真实存在的日期', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('2024-2-9')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});
