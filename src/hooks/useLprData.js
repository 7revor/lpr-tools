import { useEffect, useState } from 'react';
import { baselineLpr, shouldCheckRemote, newerRows, loadRemoteCache, saveRemoteCache } from '../utils/lprSync';

async function fetchRemoteLpr(signal) {
  const res = await fetch('/api/lpr', { signal });
  if (!res.ok) throw new Error(`/api/lpr 返回 HTTP ${res.status}`);
  const { rows } = await res.json();
  if (!Array.isArray(rows)) throw new Error('/api/lpr 返回的数据格式不正确');
  return rows;
}

/**
 * 计算使用的 LPR 数据（只读）：内置数据 + 已拉取到的新期数。
 * 页面打开时，若最新一期之后应已发布新一期，则向 /api/lpr 拉取；请求失败时继续使用已有数据。
 */
export function useLprData(showToast) {
  const [lprData, setLprData] = useState(baselineLpr);

  useEffect(() => {
    const current = baselineLpr();
    const cache = loadRemoteCache();
    if (!shouldCheckRemote(current, cache?.checkedAt)) return;

    const controller = new AbortController();
    fetchRemoteLpr(controller.signal)
      .then((rows) => {
        saveRemoteCache({ rows, checkedAt: Date.now() });
        const added = newerRows(current, rows);
        if (!added.length) return;
        setLprData(baselineLpr());
        showToast(`已自动更新 ${added.length} 期 LPR，最新至 ${added.at(-1).date}`);
      })
      .catch((err) => {
        // StrictMode 下首次挂载的请求会被中止，属正常流程
        if (err.name === 'AbortError') return;
        // 失败也记录检查时间，避免接口异常期间每次打开都请求
        saveRemoteCache({ rows: cache?.rows ?? [], checkedAt: Date.now() });
        console.warn('自动更新 LPR 失败，继续使用已有数据', err);
      });
    return () => controller.abort();
  }, [showToast]);

  return lprData;
}
