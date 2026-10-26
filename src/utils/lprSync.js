// 前端自动追加新一期 LPR：何时向 /api/lpr 拉取、拉到后追加哪些行。
// 用户的 lprData 可手动编辑，所以只追加比本地最新一期更晚的数据，已有行一律不改。
import { DEFAULT_LPR } from '../data/lpr';
import { nextReleaseAt } from './bocLpr';

const REMOTE_CACHE_KEY = 'lpr-remote';
// 到了发布时间但接口还没有新一期（中行页面滞后、节假日顺延）时，最多每小时再查一次
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 只看规范日期，避免手工录入的异常日期干扰字符串比较
function latestIsoDate(rows) {
  return rows.reduce((max, r) => (ISO_DATE_RE.test(r.date) && r.date > max ? r.date : max), '');
}

export function shouldCheckRemote(localRows, lastCheckedAt, now = new Date()) {
  const latest = latestIsoDate(localRows);
  // 本地 LPR 被清空时不自动补，尊重用户的操作
  if (!latest) return false;
  if (now < nextReleaseAt(latest)) return false;
  return !(lastCheckedAt && now.getTime() - lastCheckedAt < CHECK_INTERVAL_MS);
}

// 远端数据中比本地最新一期更晚的行，按日期升序
export function newerRows(localRows, remoteRows) {
  const latest = latestIsoDate(localRows);
  return remoteRows
    .filter((r) => ISO_DATE_RE.test(r.date) && r.date > latest)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function loadRemoteCache() {
  try {
    const raw = localStorage.getItem(REMOTE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('读取 LPR 远端缓存失败', err);
    return null;
  }
}

export function saveRemoteCache(cache) {
  try {
    localStorage.setItem(REMOTE_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    // 隐私模式或存储已满时写入会失败，只影响拉取节流，仅记录
    console.warn('保存 LPR 远端缓存失败', err);
  }
}

// 内置数据 + 已拉取到的新期数：首次打开、恢复内置、清空数据时使用
export function baselineLpr() {
  const base = DEFAULT_LPR.map((r) => ({ ...r }));
  return [...base, ...newerRows(base, loadRemoteCache()?.rows ?? [])];
}
