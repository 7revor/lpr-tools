import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

// 严格模式按格式解析依赖该插件；此处注册保证脱离入口文件（如单元测试）也可用
dayjs.extend(customParseFormat);

// 显示固定用第一个格式（YYYY-MM-DD），解析时依次尝试所有格式
export const DATE_FORMATS = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'YYYYMMDD',
  'YYYY-M-D',
  'YYYY/M/D',
  'YYYY-M-DD',
  'YYYY-MM-D',
  'YYYY/M/DD',
  'YYYY/MM/D',
];

/**
 * 预处理：将 "2024-11-013"、"2024/011/3" 这类因 antd 自动补零导致的溢位格式
 * 还原为合法的 "2024-11-13"，再交给 dayjs strict 解析。
 * 仅处理有分隔符（- 或 /）的三段式，无分隔符格式原样返回。
 */
export function normalizeRawInput(str) {
  if (!str) return str;
  const sep = str.includes('-') ? '-' : str.includes('/') ? '/' : null;
  if (sep) {
    const parts = str.split(sep);
    if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
      return parts.map((p) => String(parseInt(p, 10))).join(sep);
    }
  }
  return str;
}

export function tryParseDate(str) {
  if (!str) return null;
  const s = normalizeRawInput(str.trim());
  for (const fmt of DATE_FORMATS) {
    const d = dayjs(s, fmt, true); // strict mode
    if (d.isValid()) return d;
  }
  return null;
}

// 任意支持格式 → 'YYYY-MM-DD'，无法识别返回 null
export function normalizeDate(str) {
  return tryParseDate(str)?.format('YYYY-MM-DD') ?? null;
}

// 是否为计算可直接使用的规范日期字符串（补零的 YYYY-MM-DD 且真实存在）
export function isIsoDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str) && dayjs(str, 'YYYY-MM-DD', true).isValid();
}
