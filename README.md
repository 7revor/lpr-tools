# LPR 借贷计息计算器

一个纯前端的 LPR（贷款市场报价利率）借贷计息计算工具，支持多笔借款与还款的分段利率精确计算。

**[在线体验](https://lpr.k1kyo.com/)**

---

## 功能特性

### 借还款管理

- 支持任意笔数的借款（金额 + 日期）与还款（金额 + 日期）自由录入
- 还款方式可逐笔选择：**先息后本** / **先本后息**
- 先息后本模式下，利息冲减单独一行展示（红色负数），清晰呈现资金流向

### LPR 利率配置

- **内置** 2019-08-20 至今的完整 LPR 历史数据（1年期 + 5年期）
- **自动更新**：每月 20 日新一期发布后，打开页面即自动更新，无需手动维护
- LPR 数据**只读**：页面显示数据更新至哪一期，点击可在弹窗中查看全部期数；不支持手动修改，计算统一使用官方数据
- 支持**倍率模式**（如 × 1.5）或**加点模式**（如 +50BP），可分时段设置不同倍率/加点
- 支持**固定利率**计算（不依赖 LPR）

### 计算与结果

- 日利率基数可选 **365 天** 或 **360 天**
- 计息截止日期可自由指定
- 结果表格展示：计息区间、类型、发生金额、剩余本金、LPR 基础利率、倍率/加点、年利率、计息天数、利息、备注
- 汇总行显示：累计产生利息 / 已还利息 / 未还利息
- 一键复制为 **Excel 制表符**格式或 **CSV** 格式，粘贴即用

### 数据持久化与导入导出

- 自动保存所有输入数据到 `localStorage`，刷新页面不丢失
- 支持将当前状态（所有借还款条目、倍率/加点配置、基础设置）**导出为 JSON**，LPR 数据不随之导出
- 支持从 JSON 文件**一键还原**全部数据

---

## 技术栈

| 技术             | 说明                                               |
| ---------------- | -------------------------------------------------- |
| React 19         | 函数组件 + Hooks（`memo`/`useCallback`/`useMemo`） |
| Ant Design 6     | UI 组件库，按需加载                                |
| Day.js           | 日期处理，含 `customParseFormat` 插件              |
| Vite 7           | 构建工具                                           |
| Cloudflare Workers | 静态资源托管 + Cron 抓取 LPR + KV 存储（`wrangler` CLI） |

---

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行单元测试
npm test

# 构建生产包
npm run build

# 本地预览构建产物
npm run preview

# 联调 LPR 自动更新：先在另一个终端启动 Worker（本地模拟 KV，监听 8787），
# npm run dev 会把 /api 代理过去
npm run dev:worker
```

本地 Worker 启动后可手动触发定时任务：`curl "http://localhost:8787/__scheduled?cron=0+2+1+*+*"`。

---

## LPR 自动更新

数据来源为[中国银行 LPR 页面](https://www.boc.cn/fimarkets/lilv/fd32/201310/t20131031_2591219.html)，该页面列出 2019-08-20 以来的全部期数。

- **Worker 定时任务**：每月 20–31 日北京时间 10:00–18:00 每小时检查一次，本期抓到后直到下月 20 日都直接跳过；每月 1 日再做一次核对。请求带 ETag，页面未变化时中行返回 304
- **校验**：首期为 2019-08-20、每月恰好一期且不断档、利率在合理范围、不少于上一版。校验或请求失败时保留 KV 中的原数据并记录错误
- **日期修正**：中行页面把 2021-02-20（春节调休上班日）误写为 2021-02-22，以中国货币网为准修正，修正表见 `src/utils/bocLpr.js`
- **接口**：`GET /api/lpr` 返回全部期数（支持 ETag/304）；`GET /api/lpr/status` 查看最近一次抓取时间与错误
- **前端**：最新一期的次月 20 日 10:00 后，打开页面时请求 `/api/lpr`，把比内置数据更新的期数缓存在 localStorage 并用于计算；没拿到新一期时最多每小时再查一次

---

## 部署到 Cloudflare Workers

```bash
# 构建并部署（需已登录 wrangler：npx wrangler login）
npm run deploy
```

KV 命名空间 `LPR_KV` 与定时任务配置见 `wrangler.toml`。

---

## 项目结构

```
worker/
├── index.js                  # Worker 入口（只允许 default 导出）
└── lpr.js                    # 定时抓取、KV 读写与 /api/lpr 接口
src/
├── hooks/
│   └── useLprData.js         # 计算用的 LPR 数据（只读），打开页面时按发布时间拉取新一期
├── components/
│   ├── SmartDatePicker.jsx   # 多格式智能日期输入（自动格式化/容错）
│   ├── Settings.jsx          # 基础设置（日利率基数、截止日期）
│   ├── EntryList.jsx         # 借款/还款条目列表
│   ├── LprConfig.jsx         # LPR 数据概要与倍率配置
│   ├── LprDataModal.jsx      # LPR 数据详情弹窗（只读）
│   └── ResultTable.jsx       # 计算结果表格
├── utils/
│   ├── calculate.js          # 核心计息逻辑
│   ├── bocLpr.js             # 中行 LPR 页面解析、校验与发布时间（Worker 与前端共用）
│   ├── lprSync.js            # 前端何时拉取、追加哪些期数
│   └── clipboard.js          # Excel/CSV 复制
├── data/
│   └── lpr.js                # 内置 LPR 历史数据
├── App.jsx                   # 主应用（状态管理 + localStorage）
└── main.jsx                  # 入口
```

---

## 许可证

MIT
