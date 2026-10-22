import { normalizeDate } from './date';

// 解析粘贴的 LPR 文本：每行「日期 1年期 5年期」，Tab/逗号/分号分隔，百分号可有可无。
// 日期统一规范为 YYYY-MM-DD（计算按字符串比较日期，2024/7/22 这类格式必须先转换），
// 无法识别的行（如表头）跳过；同一日期重复出现时以最后一行为准。
export function parseLprText(text) {
  const lines = text.trim().split('\n').filter((l) => l.trim());
  const byDate = new Map();
  for (const line of lines) {
    const parts = line.split(/[\t,;]+/).map((s) => s.trim());
    if (parts.length >= 3) {
      const date = normalizeDate(parts[0]);
      const lpr1y = parseFloat(parts[1].replace('%', ''));
      const lpr5y = parseFloat(parts[2].replace('%', ''));
      if (date && !isNaN(lpr1y) && !isNaN(lpr5y)) {
        byDate.set(date, { date, lpr1y, lpr5y });
      }
    }
  }
  return [...byDate.values()];
}
