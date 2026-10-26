// Cloudflare Worker 入口。静态资源由 [assets] 直接托管，只有 /api/* 会进入这里（见 wrangler.toml 的 run_worker_first）。
// 入口模块只能有 default 导出：workerd 会把每个具名导出都当作入口处理器，导出常量会导致启动失败。
import { route, runScheduled } from './lpr.js';

export default {
  fetch: route,
  scheduled: runScheduled,
};
