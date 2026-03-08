import { memo, useCallback, useRef } from 'react';
import { DatePicker, App as AntdApp } from 'antd';
import dayjs from 'dayjs';

// 支持的输入格式：显示固定用第一个（YYYY-MM-DD），解析时依次尝试所有格式
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
 * 预处理：将 "2024-11-013"、"2024/011/3" 这类因输入法补零导致的溢位格式
 * 还原为合法的 "2024-11-13"，再交给 dayjs strict 解析。
 * 仅处理有分隔符（- 或 /）的三段式，无分隔符格式原样返回。
 */
function normalizeRawInput(str) {
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

/**
 * SmartDatePicker
 * - value: string 'YYYY-MM-DD' or ''
 * - onChange(dateStr: string): 标准化后的日期字符串
 * - onBlur(e): 可选的额外 blur 回调（在内部验证之后执行）
 * - 其他 antd DatePicker props 透传
 */
const SmartDatePicker = memo(function SmartDatePicker({
  value,
  onChange,
  onBlur: outerBlur,
  style,
  ...rest
}) {
  const { message } = AntdApp.useApp();

  // 用 ref 跟踪最新 onChange 值，避免 blur 时闭包读到旧值
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  const handleChange = useCallback((date) => {
    if (date?.isValid()) {
      const normalized = date.format('YYYY-MM-DD');
      latestValueRef.current = normalized;
      onChange(normalized);
    } else if (!date) {
      latestValueRef.current = '';
      onChange('');
    }
  }, [onChange]);

  const handleBlur = useCallback((e) => {
    const raw = (e?.target?.value ?? '').trim();

    if (raw) {
      const parsed = tryParseDate(raw);
      if (!parsed) {
        // antd 无法解析，也非我们支持的任何格式 → 回填今日
        const today = dayjs().format('YYYY-MM-DD');
        latestValueRef.current = today;
        onChange(today);
        message.warning(`"${raw}" 无法识别为有效日期，已自动填入今日`);
      }
      // 若 parsed 成功，说明 antd 已通过 format 数组正确处理，无需额外操作
    }

    outerBlur?.(e);
  }, [onChange, message, outerBlur]);

  return (
    <DatePicker
      value={value ? dayjs(value, 'YYYY-MM-DD') : null}
      format={DATE_FORMATS}
      onChange={handleChange}
      onBlur={handleBlur}
      style={style}
      {...rest}
    />
  );
});

export default SmartDatePicker;
