// LPR 同步与接口逻辑：定时抓取中国银行 LPR 页面写入 KV，并通过 /api/lpr 提供给前端。
// 入口在 index.js；这里的具名导出不能放进入口模块，否则会被 workerd 当作额外的入口处理器而启动失败。
import { BOC_LPR_URL, parseBocLprHtml, validateLprRows, nextReleaseAt, latestLprDate } from '../src/utils/bocLpr.js';

export const KV_KEY = 'lpr:data';
// 每月 1 日的全量核对：即使本期已抓到也发一次条件请求，以发现中行对历史数据的更正
export const MONTHLY_CHECK_CRON = '0 2 1 * *';
const FETCH_TIMEOUT_MS = 15000;

/**
 * 抓取并更新 KV 中的 LPR 数据，返回本次结果说明。
 * KV 中的状态：{ rows, latestDate, etag, lastModified, updatedAt, checkedAt, lastError }
 * - updatedAt 只在 rows 变化时更新，checkedAt 每次实际请求中行后更新
 * - 失败时把错误写入 lastError 并重新抛出，已有数据保持不变
 */
export async function syncLpr(env, { force = false, now = new Date() } = {}) {
  const state = await env.LPR_KV.get(KV_KEY, 'json');
  const hasData = Boolean(state?.rows?.length);

  // 还没到下一期的最早发布时间，不打扰中行
  if (!force && hasData && now < nextReleaseAt(state.latestDate)) {
    return { status: 'skipped', latestDate: state.latestDate };
  }

  const checkedAt = now.toISOString();
  try {
    const headers = { 'User-Agent': 'lpr-tools (+https://lpr.k1kyo.com/)' };
    if (hasData && state.etag) headers['If-None-Match'] = state.etag;
    const res = await fetch(BOC_LPR_URL, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

    if (res.status === 304 && hasData) {
      await env.LPR_KV.put(KV_KEY, JSON.stringify({ ...state, checkedAt, lastError: null }));
      return { status: 'not-modified', latestDate: state.latestDate };
    }
    if (!res.ok) throw new Error(`请求中行页面失败：HTTP ${res.status}`);

    const rows = parseBocLprHtml(await res.text());
    validateLprRows(rows, hasData ? state.rows : []);

    const changed = !hasData || JSON.stringify(rows) !== JSON.stringify(state.rows);
    await env.LPR_KV.put(KV_KEY, JSON.stringify({
      rows,
      latestDate: latestLprDate(rows),
      etag: res.headers.get('ETag'),
      lastModified: res.headers.get('Last-Modified'),
      updatedAt: changed ? checkedAt : state.updatedAt,
      checkedAt,
      lastError: null,
    }));
    return { status: changed ? 'updated' : 'unchanged', latestDate: latestLprDate(rows) };
  } catch (err) {
    console.error('同步 LPR 失败', err);
    await env.LPR_KV.put(KV_KEY, JSON.stringify({ ...state, checkedAt, lastError: { message: err.message, at: checkedAt } }));
    throw err;
  }
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...init.headers },
  });
}

export async function handleLpr(request, env) {
  let state = await env.LPR_KV.get(KV_KEY, 'json');
  // KV 为空（刚部署、定时任务还没跑过）时当场抓一次，无需手动触发
  if (!state?.rows?.length) {
    try {
      await syncLpr(env, { force: true });
    } catch (err) {
      return json({ error: `暂无 LPR 数据：${err.message}` }, { status: 502 });
    }
    state = await env.LPR_KV.get(KV_KEY, 'json');
  }

  const etag = `"${state.updatedAt}"`;
  const headers = { ETag: etag, 'Cache-Control': 'public, max-age=300' };
  if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
  const { rows, latestDate, updatedAt, checkedAt } = state;
  return json({ rows, latestDate, updatedAt, checkedAt }, { headers });
}

// 排查用：不返回数据本身，只看最近一次抓取的情况
export async function handleStatus(env) {
  const state = await env.LPR_KV.get(KV_KEY, 'json');
  return json({
    source: BOC_LPR_URL,
    count: state?.rows?.length ?? 0,
    latestDate: state?.latestDate ?? null,
    updatedAt: state?.updatedAt ?? null,
    checkedAt: state?.checkedAt ?? null,
    etag: state?.etag ?? null,
    lastModified: state?.lastModified ?? null,
    lastError: state?.lastError ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export function route(request, env) {
  const { pathname } = new URL(request.url);
  if (request.method === 'GET' && pathname === '/api/lpr') return handleLpr(request, env);
  if (request.method === 'GET' && pathname === '/api/lpr/status') return handleStatus(env);
  if (pathname.startsWith('/api/')) return json({ error: 'Not Found' }, { status: 404 });
  return env.ASSETS.fetch(request);
}

export async function runScheduled(controller, env) {
  const result = await syncLpr(env, { force: controller.cron === MONTHLY_CHECK_CRON });
  console.log('同步 LPR', controller.cron, result);
}
