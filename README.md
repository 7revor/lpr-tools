# LPR 借贷计息计算器

一个纯前端的 LPR（贷款市场报价利率）借贷计息计算工具，支持多笔借款与还款的分段利率精确计算。

**在线体验**：部署于 Cloudflare Pages（通过 `wrangler.toml` 配置）

---

## 功能特性

### 借还款管理
- 支持任意笔数的借款（金额 + 日期）与还款（金额 + 日期）自由录入
- 还款方式可逐笔选择：**先息后本** / **先本后息**
- 先息后本模式下，利息冲减单独一行展示（红色负数），清晰呈现资金流向

### LPR 利率配置
- **内置** 2019-08-20 至今的完整 LPR 历史数据（1年期 + 5年期）
- 支持**倍率模式**（如 × 1.5）或**加点模式**（如 +50BP），可分时段设置不同倍率/加点
- 支持**固定利率**计算（不依赖 LPR）
- LPR 数据支持多种方式导入：
  - JSON 文件
  - 纯文本（`YYYY-MM-DD\t3.00%\t3.50%` 格式，可直接从官网复制粘贴）

### 计算与结果
- 日利率基数可选 **365 天** 或 **360 天**
- 计息截止日期可自由指定
- 结果表格展示：计息区间、类型、发生金额、剩余本金、LPR 基础利率、倍率/加点、年利率、计息天数、利息、备注
- 汇总行显示：累计产生利息 / 已还利息 / 未还利息
- 一键复制为 **Excel 制表符**格式或 **CSV** 格式，粘贴即用

### 数据持久化与导入导出
- 自动保存所有输入数据到 `localStorage`，刷新页面不丢失
- 支持将当前状态（所有借还款条目、LPR 配置、基础设置）**导出为 JSON**
- 支持从 JSON 文件**一键还原**全部数据

---

## 技术栈

| 技术 | 说明 |
|---|---|
| React 19 | 函数组件 + Hooks（`memo`/`useCallback`/`useMemo`） |
| Ant Design 6 | UI 组件库，按需加载 |
| Day.js | 日期处理，含 `customParseFormat` 插件 |
| Vite 7 | 构建工具 |
| Cloudflare Pages | 部署（`wrangler` CLI） |

---

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产包
npm run build

# 本地预览构建产物
npm run preview
```

---

## 部署到 Cloudflare Pages

```bash
# 构建
npm run build

# 部署（需已登录 wrangler）
npx wrangler pages deploy
```

---

## LPR 数据导入格式

**JSON 格式**（数组）：
```json
[
  { "date": "2024-11-20", "lpr1y": 3.1, "lpr5y": 3.6 },
  { "date": "2025-01-20", "lpr1y": 3.1, "lpr5y": 3.6 }
]
```

**纯文本格式**（Tab 或逗号分隔，可直接从央行/Wind 复制）：
```
2025-01-20	3.10%	3.60%
2024-11-20	3.10%	3.60%
2024-10-21	3.10%	3.60%
```

---

## 项目结构

```
src/
├── components/
│   ├── SmartDatePicker.jsx   # 多格式智能日期输入（自动格式化/容错）
│   ├── Settings.jsx          # 基础设置（日利率基数、截止日期）
│   ├── EntryList.jsx         # 借款/还款条目列表
│   ├── LprConfig.jsx         # LPR 数据与倍率配置
│   └── ResultTable.jsx       # 计算结果表格
├── utils/
│   ├── calculate.js          # 核心计息逻辑
│   └── clipboard.js          # Excel/CSV 复制
├── data/
│   └── lpr.js                # 内置 LPR 历史数据
├── App.jsx                   # 主应用（状态管理 + localStorage）
└── main.jsx                  # 入口
```

---

## 许可证

MIT
