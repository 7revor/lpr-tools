// 界面展示用的金额格式：千分位 + 两位小数。复制到 Excel 的数据不走这里，保持纯数字
const moneyFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(v) {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? moneyFormatter.format(n) : '';
}

// 供 antd InputNumber 使用：输入框内显示千分位，提交时去掉逗号
export const thousandsFormatter = (value) => {
  if (value == null || value === '') return '';
  const [int, dec] = String(value).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec === undefined ? grouped : `${grouped}.${dec}`;
};

export const thousandsParser = (value) => (value ? value.replace(/,/g, '') : '');
