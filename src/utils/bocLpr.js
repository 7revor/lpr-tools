// 中国银行 LPR 页面的解析与校验。Worker（定时抓取）与前端（判断何时拉取）共用，不依赖 dayjs 等浏览器侧库。

export const BOC_LPR_URL = 'https://www.boc.cn/fimarkets/lilv/fd32/201310/t20131031_2591219.html';

// LPR 机制改革后的首期，数据必须从这一天开始
export const FIRST_LPR_DATE = '2019-08-20';

// 中行页面与官方发布方（中国货币网）不一致的日期：页面日期 → 官方日期。
// 2021-02-20 为春节调休上班日（周六），中行页面误写为 02-22。
export const LPR_DATE_CORRECTIONS = {
  '2021-02-22': '2021-02-20',
};

// 表格每行为「日期 + 1年期% + 5年期%」，表头行（<th>）与正文段落不会匹配
const ROW_RE = /<tr>\s*<td>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>\s*<td>\s*([\d.]+)%\s*<\/td>\s*<td>\s*([\d.]+)%\s*<\/td>\s*<\/tr>/g;

// 解析页面 HTML，套用日期修正，按日期升序返回
export function parseBocLprHtml(html) {
  const rows = [];
  for (const m of html.matchAll(ROW_RE)) {
    const date = LPR_DATE_CORRECTIONS[m[1]] ?? m[1];
    rows.push({ date, lpr1y: Number(m[2]), lpr5y: Number(m[3]) });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 校验抓取结果，不通过时抛出错误（调用方据此拒绝覆盖已有数据）。
 * - 首期为 2019-08-20，此后每月恰好一期、月份连续不断档
 * - 利率在 (0, 10) 之间
 * - 与上一版相比：不能少期，已有日期不能消失
 */
export function validateLprRows(rows, prevRows = []) {
  if (!rows.length) throw new Error('未解析到任何 LPR 数据，页面结构可能已变化');
  if (rows[0].date !== FIRST_LPR_DATE) {
    throw new Error(`首期日期应为 ${FIRST_LPR_DATE}，实际为 ${rows[0].date}`);
  }

  let [year, month] = FIRST_LPR_DATE.split('-').map(Number);
  for (const row of rows) {
    const expected = `${year}-${String(month).padStart(2, '0')}`;
    if (row.date.slice(0, 7) !== expected) {
      throw new Error(`月份不连续：应为 ${expected}，实际为 ${row.date}`);
    }
    for (const key of ['lpr1y', 'lpr5y']) {
      if (!(row[key] > 0 && row[key] < 10)) throw new Error(`${row.date} 的 ${key} 数值异常：${row[key]}`);
    }
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }

  if (rows.length < prevRows.length) {
    throw new Error(`期数比上一版少：${rows.length} < ${prevRows.length}`);
  }
  const dates = new Set(rows.map((r) => r.date));
  const missing = prevRows.find((r) => !dates.has(r.date));
  if (missing) throw new Error(`上一版中的 ${missing.date} 在新数据中消失`);
}

// 最新一期的下一期最早何时能抓到：次月 20 日北京时间 10:00（UTC 02:00）。
// 官方 9:00 发布，中行页面通常晚一到两小时更新；遇节假日顺延时只会更晚，不会更早。
export function nextReleaseAt(latestDate) {
  const [year, month] = latestDate.split('-').map(Number);
  // month 为 1–12，作为 Date.UTC 的 0 基月份参数恰好是「下个月」，12 月会自动进位到次年
  return new Date(Date.UTC(year, month, 20, 2));
}

export function latestLprDate(rows) {
  return rows.reduce((max, r) => (r.date > max ? r.date : max), '');
}
