import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncLpr, handleLpr, KV_KEY, MONTHLY_CHECK_CRON } from './lpr.js';
import worker from './index.js';
import { DEFAULT_LPR } from '../src/data/lpr.js';

// 内存版 KV，只实现 Worker 用到的 get/put
function memoryKv(initial) {
  const store = new Map(initial ? [[KV_KEY, JSON.stringify(initial)]] : []);
  return {
    store,
    get: vi.fn(async (key, type) => {
      const raw = store.get(key);
      if (raw === undefined) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    }),
    put: vi.fn(async (key, value) => { store.set(key, value); }),
  };
}

function bocHtml(rows) {
  return [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => `<tr>\n<td>${r.date}</td>\n<td>${r.lpr1y.toFixed(2)}%</td>\n<td>${r.lpr5y.toFixed(2)}%</td></tr>`)
    .join('\n');
}

function bocResponse(rows, etag = '"v2"') {
  return new Response(bocHtml(rows), { status: 200, headers: { ETag: etag, 'Last-Modified': 'Tue, 20 Oct 2026 02:45:15 GMT' } });
}

// 已抓到 2026-09 期的 KV 状态
const PREV_ROWS = DEFAULT_LPR.slice(0, -1);
const prevState = () => ({
  rows: PREV_ROWS,
  latestDate: '2026-09-20',
  etag: '"v1"',
  lastModified: null,
  updatedAt: '2026-09-20T02:00:00.000Z',
  checkedAt: '2026-09-20T02:00:00.000Z',
  lastError: null,
});
const stored = (kv) => JSON.parse(kv.store.get(KV_KEY));

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('syncLpr', () => {
  it('未到下一期发布时间时不请求中行', async () => {
    const kv = memoryKv(prevState());
    const result = await syncLpr({ LPR_KV: kv }, { now: new Date('2026-10-20T01:59:00Z') });
    expect(result).toEqual({ status: 'skipped', latestDate: '2026-09-20' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('抓到新一期时更新数据与 updatedAt，并带上条件请求头', async () => {
    const kv = memoryKv(prevState());
    fetchMock.mockResolvedValue(bocResponse(DEFAULT_LPR));
    const now = new Date('2026-10-20T03:00:00Z');
    const result = await syncLpr({ LPR_KV: kv }, { now });

    expect(fetchMock.mock.calls[0][1].headers['If-None-Match']).toBe('"v1"');
    expect(result).toEqual({ status: 'updated', latestDate: '2026-10-20' });
    expect(stored(kv)).toMatchObject({
      rows: DEFAULT_LPR, latestDate: '2026-10-20', etag: '"v2"',
      updatedAt: now.toISOString(), checkedAt: now.toISOString(), lastError: null,
    });
  });

  it('304 时只更新 checkedAt', async () => {
    const kv = memoryKv(prevState());
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));
    const now = new Date('2026-10-20T02:00:00Z');
    const result = await syncLpr({ LPR_KV: kv }, { now });

    expect(result.status).toBe('not-modified');
    expect(stored(kv)).toEqual({ ...prevState(), checkedAt: now.toISOString() });
  });

  it('页面无新期但内容有变（如 ETag 变化）时 updatedAt 不变', async () => {
    const kv = memoryKv(prevState());
    fetchMock.mockResolvedValue(bocResponse(PREV_ROWS, '"v1b"'));
    const result = await syncLpr({ LPR_KV: kv }, { now: new Date('2026-10-20T02:00:00Z') });

    expect(result.status).toBe('unchanged');
    expect(stored(kv)).toMatchObject({ etag: '"v1b"', updatedAt: prevState().updatedAt });
  });

  it('校验失败时保留原数据、记录 lastError 并抛出', async () => {
    const kv = memoryKv(prevState());
    fetchMock.mockResolvedValue(new Response('<html>系统维护中</html>', { status: 200 }));
    const now = new Date('2026-10-20T02:00:00Z');

    await expect(syncLpr({ LPR_KV: kv }, { now })).rejects.toThrow('未解析到任何 LPR 数据');
    const s = stored(kv);
    expect(s.rows).toEqual(PREV_ROWS);
    expect(s.lastError).toEqual({ message: '未解析到任何 LPR 数据，页面结构可能已变化', at: now.toISOString() });
  });

  it('中行返回错误状态码时记录 lastError 并抛出', async () => {
    const kv = memoryKv(prevState());
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    await expect(syncLpr({ LPR_KV: kv }, { now: new Date('2026-10-20T02:00:00Z') })).rejects.toThrow('HTTP 503');
    expect(stored(kv).lastError.message).toBe('请求中行页面失败：HTTP 503');
  });

  it('KV 为空时首次抓取不带条件请求头', async () => {
    const kv = memoryKv();
    fetchMock.mockResolvedValue(bocResponse(DEFAULT_LPR));
    const result = await syncLpr({ LPR_KV: kv }, { now: new Date('2026-10-23T02:00:00Z') });

    expect(fetchMock.mock.calls[0][1].headers['If-None-Match']).toBeUndefined();
    expect(result).toEqual({ status: 'updated', latestDate: '2026-10-20' });
  });
});

describe('scheduled', () => {
  it('每月 1 日的核对任务忽略发布时间限制', async () => {
    const kv = memoryKv({ ...prevState(), rows: DEFAULT_LPR, latestDate: '2026-10-20' });
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));
    await worker.scheduled({ cron: MONTHLY_CHECK_CRON }, { LPR_KV: kv });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('其余时间按发布时间判断是否请求', async () => {
    const kv = memoryKv({ ...prevState(), rows: DEFAULT_LPR, latestDate: '2026-10-20' });
    await worker.scheduled({ cron: '0 2-10 20-31 * *' }, { LPR_KV: kv });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('/api/lpr', () => {
  const request = (headers = {}) => new Request('https://lpr.example/api/lpr', { headers });

  it('返回 KV 中的数据并带 ETag', async () => {
    const kv = memoryKv(prevState());
    const res = await handleLpr(request(), { LPR_KV: kv });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toBe('"2026-09-20T02:00:00.000Z"');
    expect(await res.json()).toEqual({
      rows: PREV_ROWS, latestDate: '2026-09-20',
      updatedAt: '2026-09-20T02:00:00.000Z', checkedAt: '2026-09-20T02:00:00.000Z',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('If-None-Match 命中时返回 304', async () => {
    const kv = memoryKv(prevState());
    const res = await handleLpr(request({ 'If-None-Match': '"2026-09-20T02:00:00.000Z"' }), { LPR_KV: kv });
    expect(res.status).toBe(304);
  });

  it('KV 为空时当场抓取', async () => {
    const kv = memoryKv();
    fetchMock.mockResolvedValue(bocResponse(DEFAULT_LPR));
    const res = await handleLpr(request(), { LPR_KV: kv });
    expect(res.status).toBe(200);
    expect((await res.json()).latestDate).toBe('2026-10-20');
  });

  it('KV 为空且抓取失败时返回 502', async () => {
    const kv = memoryKv();
    fetchMock.mockRejectedValue(new Error('network down'));
    const res = await handleLpr(request(), { LPR_KV: kv });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: '暂无 LPR 数据：network down' });
  });
});

describe('路由', () => {
  it('未知 /api 路径返回 404，其余交给静态资源', async () => {
    const assets = { fetch: vi.fn(async () => new Response('index')) };
    const env = { LPR_KV: memoryKv(), ASSETS: assets };
    expect((await worker.fetch(new Request('https://lpr.example/api/nope'), env)).status).toBe(404);
    expect(await (await worker.fetch(new Request('https://lpr.example/'), env)).text()).toBe('index');
  });
});
