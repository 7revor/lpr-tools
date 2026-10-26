import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldCheckRemote, newerRows, baselineLpr, saveRemoteCache, loadRemoteCache, CHECK_INTERVAL_MS } from './lprSync';
import { DEFAULT_LPR } from '../data/lpr';

const row = (date) => ({ date, lpr1y: 3, lpr5y: 3.5 });

describe('shouldCheckRemote', () => {
  const local = [row('2026-08-20'), row('2026-09-20')];

  it('未到下一期发布时间（次月 20 日北京时间 10:00）不检查', () => {
    expect(shouldCheckRemote(local, null, new Date('2026-10-20T01:59:59Z'))).toBe(false);
  });

  it('到了发布时间且从未检查过时检查', () => {
    expect(shouldCheckRemote(local, null, new Date('2026-10-20T02:00:00Z'))).toBe(true);
  });

  it('距上次检查不足一小时不再检查', () => {
    const now = new Date('2026-10-20T05:00:00Z');
    expect(shouldCheckRemote(local, now.getTime() - CHECK_INTERVAL_MS + 1000, now)).toBe(false);
    expect(shouldCheckRemote(local, now.getTime() - CHECK_INTERVAL_MS, now)).toBe(true);
  });

  it('本地落后多期时立即检查', () => {
    expect(shouldCheckRemote([row('2026-05-20')], Date.now(), new Date(Date.now() + CHECK_INTERVAL_MS))).toBe(true);
  });

  it('本地为空或只有异常日期时不检查', () => {
    const now = new Date('2026-10-23T02:00:00Z');
    expect(shouldCheckRemote([], null, now)).toBe(false);
    expect(shouldCheckRemote([row('2026/9/20')], null, now)).toBe(false);
  });
});

describe('newerRows', () => {
  it('只返回比本地最新一期更晚的行并升序排列', () => {
    const local = [row('2026-05-20'), row('2026-04-20')];
    const remote = [row('2026-07-20'), row('2026-05-20'), row('2026-06-22'), row('2026-03-20')];
    expect(newerRows(local, remote).map((r) => r.date)).toEqual(['2026-06-22', '2026-07-20']);
  });

  it('本地已是最新时返回空数组', () => {
    expect(newerRows(DEFAULT_LPR, DEFAULT_LPR)).toEqual([]);
  });

  it('忽略远端的异常日期', () => {
    expect(newerRows([row('2026-05-20')], [row('2026/7/20'), row('2026-06-22')]).map((r) => r.date)).toEqual(['2026-06-22']);
  });
});

describe('远端缓存与 baselineLpr', () => {
  let storage;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('没有缓存时等于内置数据，且为副本', () => {
    const rows = baselineLpr();
    expect(rows).toEqual(DEFAULT_LPR);
    rows[0].lpr1y = 9;
    expect(DEFAULT_LPR[0].lpr1y).toBe(4.25);
  });

  it('追加缓存中比内置更新的期数', () => {
    saveRemoteCache({ rows: [...DEFAULT_LPR, row('2026-11-20')], checkedAt: 1 });
    expect(baselineLpr().at(-1)).toEqual(row('2026-11-20'));
    expect(baselineLpr()).toHaveLength(DEFAULT_LPR.length + 1);
  });

  it('缓存损坏时记录警告并返回 null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.set('lpr-remote', '{bad json');
    expect(loadRemoteCache()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
