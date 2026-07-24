# Changelog

本文件记录 Doubao-pp 浏览器扩展的版本变更。版本号遵循 `vMAJOR.MINOR.PATCH.BUILD` 约定。

## [1.11.6.1] - 2026-07-24

第 1–6 步全部完成，扩展具备完整本地增强能力并通过代码层 + 构建层验收。

### 新增能力
- **第 1 步｜项目奠基**：仓库建立、可行性分析归档 `analysis/`、生产代码骨架（`core/provider` 解耦 + `core/interceptor/fetch-hook` + `entrypoints` 入口 + wxt 构建配置）落地。
- **第 2 步｜记忆系统**：本地记忆存储（上限 100 条、去重），可在对话前注入用户长期上下文。
- **第 3 步｜鉴权门禁**：仅读取页面既有登录态（fail-open），不实现 `a_bogus`/PoW 反爬签名。
- **第 4 步｜浮窗 UI**：Shadow DOM 隔离的浮窗面板，多轮对话 `currentRequestId` 防护，监听页内桥接事件实时渲染。
- **第 5 步｜上层能力接线**：技能系统（上限 200、上下文封顶 3000）、MCP 本地工具（上限 100、上下文封顶 2000）、云同步后端（上限防护）与动态注入（`loadInjectionContext`）串联；背景页（Service Worker）桥接与记忆写入。
- **第 6 步｜真实环境验收 + 360Chrome 兼容**：
  - `loadInjectionContext` 跨世界中继回退：标准 Chromium 走 MAIN world 直读快速路径；360Chrome 等无 `chrome.storage` 环境改由 ISOLATED 中继经 `postMessage`（`__doubaoPpCtxReq`/`__doubaoPpCtxResp`）回读上下文。
  - 三重 fail-open 守卫（存在性 / try-catch / 1s 超时），`loadInjectionContext` 永不 reject。

### 修复
- **跨阶段审查（1–6 步）**：修复 `request-aug.ts` 在记忆+技能+MCP 上下文合计超长时连用户原文一起截断（用户提问静默丢失）的缺陷；改为超长时仅裁剪上下文部分，用户原文始终完整保留，并补回归测试锁定行为。

### 验证
- `npm run compile`（tsc）0 错误。
- `npm run test`（vitest）108/108 通过（17 文件，含中继协议与截断回归用例）。
- `npm run build:chrome`（wxt 0.20.27）构建成功，生成 `dist/chrome-mv3/`。
- 360Chrome 无头加载冒烟 EXIT=0，manifest_version=3，三内容脚本均注册。

### 兼容
- Chrome / Edge（标准 Chromium）：MAIN world 直读 `chrome.storage`。
- 360 浏览器（360Chrome 内核）：经 ISOLATED 中继跨世界回读上下文。

### 已知待办（非阻塞）
- 真机人工验收（登录豆包逐项验证记忆注入 / SSE 回显 / 浮窗多轮 / 技能+MCP+云同步）需用户在网络通畅的真实浏览器完成。
- 可选健壮兜底：`applyPatchOp` 增量累积、可选 MCP 实际传输（路线 B）。

### CI / 远端编译（参考 Deepseek-pp 方案补齐）
- `ci.yml`：PR / `main` 推送 / `workflow_dispatch` 触发；`contents: read`；并发取消；跑 `compile` + `test` + `build:chrome` 并上传 `dist/chrome-mv3` 产物。
- `release.yml`（新建）：`v*` 标签推送 / `workflow_dispatch(tag)` 触发；`contents: write`；校验 tag 与 HEAD 一致 → `compile`+`test` → `zip:chrome`/`zip:edge`/`zip:firefox` → `gh release create` 把各浏览器 zip 挂到 GitHub Release（**不发布到应用商店**）。
- 参考 `D:\Documents\AI_Work_Temp\Deepseek-pp\.github\workflows\ci.yml` 与 `release.yml`；其 `scripts/*.mjs` 为功能级冒烟测试（拉起原生 host 测 MCP 工具），与 doubao-pp 的 wxt 构建级远端编译不同类，未照搬。
