import { memo, useCallback, useEffect, useRef } from 'react';
import { DatePicker, App as AntdApp } from 'antd';
import dayjs from 'dayjs';
import { DATE_FORMATS, normalizeRawInput, tryParseDate } from '../utils/date';

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
  useEffect(() => { latestValueRef.current = value; }, [value]);

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
      // 完全无法解析 → 保留原日期并提示；静默改成今日会让计息结果悄悄出错
      // antd 在 blur 时已把输入框还原为上一次的有效值，这里无需再提交
      const kept = latestValueRef.current;
      message.warning(
        kept
          ? `"${raw}" 无法识别为有效日期，已保留原日期 ${kept}`
          : `"${raw}" 无法识别为有效日期，请按 YYYY-MM-DD 格式输入`,
      );
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
