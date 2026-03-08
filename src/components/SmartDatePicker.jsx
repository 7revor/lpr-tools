import { memo, useCallback, useRef } from 'react';
import { DatePicker, App as AntdApp } from 'antd';
import dayjs from 'dayjs';

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
function normalizeRawInput(str) {
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

/**
 * SmartDatePicker
 *
 * 核心问题：antd DatePicker 在 blur 时会先处理内部状态（把"012"还原成"01"），
 * 再触发我们的 onBlur 回调，导致 e.target.value 已经是旧值。
 * 解决：在外层 div 上监听原生 onInput，实时捕获用户键入的原始文本，
 * blur 时优先使用这份捕获值，而非被 antd 还原后的值。
 *
 * Props:
 *   value     string 'YYYY-MM-DD' 或 ''
 *   onChange  (dateStr: string) => void  — 标准化后的日期字符串
 *   onBlur    (e) => void               — 可选额外 blur 回调，在内部验证后执行
 *   其余 antd DatePicker props 透传
 */
const SmartDatePicker = memo(function SmartDatePicker({
  value,
  onChange,
  onBlur: outerBlur,
  style,
  ...rest
}) {
  const { message } = AntdApp.useApp();

  // 始终持有最新的已提交值，避免 blur 时闭包读到过期 value
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  // 通过 wrapper div 的原生 onInput 捕获用户真实键入的原始文本
  // （早于 antd 在 blur 时的内部处理，不会被还原）
  const rawInputRef = useRef('');

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
    // 优先使用实时捕获的原始值；antd 已处理完成时 rawInputRef 也会是格式化后的值
    const captured = rawInputRef.current;
    rawInputRef.current = ''; // 重置，为下一次输入做准备

    const raw = normalizeRawInput((captured || e?.target?.value || '').trim());
    if (!raw) {
      outerBlur?.(e);
      return;
    }

    const parsed = tryParseDate(raw);
    if (!parsed) {
      // 完全无法解析 → 回填今日并提示
      const today = dayjs().format('YYYY-MM-DD');
      latestValueRef.current = today;
      onChange(today);
      message.warning(`"${raw}" 无法识别为有效日期，已自动填入今日`);
    } else {
      // 解析成功：如果 antd 内部已经回滚（未触发 onChange），主动提交正确值
      const dateStr = parsed.format('YYYY-MM-DD');
      if (dateStr !== latestValueRef.current) {
        latestValueRef.current = dateStr;
        onChange(dateStr);
      }
    }

    outerBlur?.(e);
  }, [onChange, message, outerBlur]);

  return (
    // display:contents 让 div 不占布局空间，但保留事件捕获能力
    <div
      style={{ display: 'contents' }}
      onInput={(e) => {
        if (e.target.tagName === 'INPUT') rawInputRef.current = e.target.value;
      }}
    >
      <DatePicker
        value={value ? dayjs(value, 'YYYY-MM-DD') : null}
        format={DATE_FORMATS}
        onChange={handleChange}
        onBlur={handleBlur}
        style={style}
        {...rest}
      />
    </div>
  );
});

export default SmartDatePicker;
