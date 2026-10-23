import { useEffect, useRef } from 'react';
import { shouldCheckRemote, newerRows, loadRemoteCache, saveRemoteCache } from '../utils/lprSync';

async function fetchRemoteLpr(signal) {
  const res = await fetch('/api/lpr', { signal });
  if (!res.ok) throw new Error(`/api/lpr 返回 HTTP ${res.status}`);
  const { rows } = await res.json();
  if (!Array.isArray(rows)) throw new Error('/api/lpr 返回的数据格式不正确');
  return rows;
}

/**
 * 页面打开时，若本地最新一期之后应已发布新一期，则向 /api/lpr 拉取并追加。
 * 只在打开时检查一次；请求失败时继续使用本地数据。
 */
export function useLprAutoUpdate(lprData, setLprData, showToast) {
  // 拉取是异步的，返回时要和用户最新的数据比较，而不是打开页面那一刻的
  const lprDataRef = useRef(lprData);
  useEffect(() => { lprDataRef.current = lprData; }, [lprData]);

  useEffect(() => {
    const cache = loadRemoteCache();
    if (!shouldCheckRemote(lprDataRef.current, cache?.checkedAt)) return;

    const controller = new AbortController();
    fetchRemoteLpr(controller.signal)
      .then((rows) => {
        saveRemoteCache({ rows, checkedAt: Date.now() });
        const added = newerRows(lprDataRef.current, rows);
        if (!added.length) return;
        setLprData((prev) => [...prev, ...newerRows(prev, rows)]);
        showToast(`已自动更新 ${added.length} 期 LPR，最新至 ${added.at(-1).date}`);
      })
      .catch((err) => {
        // StrictMode 下首次挂载的请求会被中止，属正常流程
        if (err.name === 'AbortError') return;
        // 失败也记录检查时间，避免接口异常期间每次打开都请求
        saveRemoteCache({ rows: cache?.rows ?? [], checkedAt: Date.now() });
        console.warn('自动更新 LPR 失败，继续使用本地数据', err);
      });
    return () => controller.abort();
  }, [setLprData, showToast]);
}
