# Doubao-pp

将 [Deepseek-pp](https://github.com/zhangweildlh/deepseek-pp) 浏览器扩展（记忆 / Skill / 工具 / 自动化 / MCP / 云同步 / 浮窗）移植到**豆包网页版**（`https://www.doubao.com/chat/`）的项目。当前版本 **v1.11.6.1**。

## 目标

在豆包网页版复刻 Deepseek-pp 的本地增强能力，采用「非检测」路线：MAIN world content script 钩 `window.fetch` **原地增强页面自有请求**，复用页面自动注入的 `a_bogus` / `msToken` 签名，规避自实现反爬签名（路线 A 优先；仅当路线 A 不可行才用可被检测的独立客户端，路线 B）。扩展**零额外出站签名请求**——所有 `/chat/completion` 请求由页面自身发出并自带签名，扩展只在本地克隆响应流做 SSE 解析。

## 当前状态

- **版本 v1.11.6.1（第 1–6 步全部完成）**：豆包网页版本地增强扩展已完整落地并通过代码层 + 构建层验收。
  - **路线 A 非检测增强**：`window.fetch` 原地增强页面自有请求，复用页面 `a_bogus`/`msToken` 签名。
  - **四类上层能力已接线**：记忆注入（localStorage）、技能系统、MCP 本地工具、云同步（sync backend）可在对话前装配为上下文注入用户文本前。
  - **浮窗 + 背景桥接 + ISOLATED→MAIN 中继**：浮窗采用 Shadow DOM 隔离；360Chrome 等 MAIN world 无 `chrome.runtime`/`chrome.storage` 的环境通过 ISOLATED 中继跨世界回读上下文。
  - **跨阶段审查收敛**：修复 1 个真实 BUG（超长上下文截断用户原文），无变量/内存泄漏、无污染、无阶段冲突。
- **验证结果**：`npm run compile`（tsc）0 错误；`npm run test`（vitest）108/108（17 文件）；`npm run build:chrome`（wxt 0.20.27）成功，生成 `dist/chrome-mv3/`。
- **真机人工验收**：登录豆包逐项验证记忆注入 / SSE 回显 / 浮窗多轮 / 技能+MCP+云同步，见 `analysis/docs/第6步验收报告与人工测试手册.md`。

## 目录结构

```
analysis/                            # 分析产出物（不进生产构建）
  docs/                              # 可行性分析、融合方案、实测方案、验收报告
  capture/                           # DevTools 抓包证据与脚本
  validate/                          # 原型代码 + 验证器 + 协同审核报告
core/
  provider/                          # 生产代码：ChatProvider 解耦实现
    types.ts                         # 统一契约 ChatProvider（含 context/loadInjectionContext?）
    active.ts                        # 运行期按 URL 选择 provider（固定 doubao）
    deepseek/provider.ts             # Deepseek 对称占位实现
    doubao/
      contracts.ts                   # 端点 / 路由 / 选择器 / 框架全局（实测裁决）
      stream-codec.ts               # 命名事件 SSE 解析 + brief 定稿文本抽取
      request-aug.ts                 # 路线 A 原地增强（记忆/技能/MCP 上下文注入，保留用户原文）
      injection.ts                   # 上下文装配 + 跨世界中继回退（360Chrome 兼容）
      dom-hook.ts                    # window.DoubaoUIFramework 钩子 + 事件桥（桥接/页内）
      auth.ts                        # 仅读页面既有登录态（fail-open）
      auth-state.ts                  # 登录态内存缓存
      chat-session.ts                # 会话 URL 解析
      dom-observer.ts                # 浮窗渲染 DOM 观察
      provider.ts                    # 豆包 ChatProvider 实现聚合
  interceptor/
    fetch-hook.ts                    # 豆包感知 window.fetch 拦截器（路线 A 非检测 + SSE 本地解析）
  memory/store.ts                    # 记忆本地存储（上限 100，去重）
  sync/backend.ts                    # 云同步后端（上限防护）
  skills/store.ts                    # 技能存储（上限 200，上下文封顶 3000）
  mcp/store.ts                       # MCP 工具存储（上限 100，上下文封顶 2000）
  ui/floating-state.ts               # 浮窗状态归约器（多轮 currentRequestId 防护）
entrypoints/
  main-world.content.ts              # MAIN world 内容脚本入口（钩 fetch + auth + DOM 观察）
  relay.content.ts                   # ISOLATED 中继（MAIN→background 桥接 + 上下文回读）
  floating-panel.content.ts         # ISOLATED 浮窗（Shadow DOM 隔离）
  background.ts                      # Service Worker（桥接/记忆写入，上限防护）
  popup/main.ts                      # 弹窗入口（wxt 无 definePopup，仅 HTML 形态）
scripts/
  port-from-upstream.mjs             # 上游(Deepseek-pp)批量品牌/域名/文案替换辅助脚本
tests/                               # vitest 套件（jsdom 环境，108 用例）
wxt.config.ts                        # 扩展构建配置（豆包化清单 + 权限预算）
.github/workflows/ci.yml             # CI：compile + build:chrome + 上传远端编译产物
CHANGELOG.md                         # 版本变更日志
package.json / tsconfig.json / vitest.config.ts
```

## 浏览器兼容性与中继回退

- **标准 Chromium（Chrome / Edge）**：MAIN world 直读 `chrome.storage` 装配注入上下文（快速路径）。
- **360 浏览器（360Chrome 内核）**：MAIN world 无 `chrome.runtime`/`chrome.storage` → 由 ISOLATED `relay.content.ts` 经 `postMessage`（`__doubaoPpCtxReq`/`__doubaoPpCtxResp`）跨世界回读上下文（中继路径）。
- `loadInjectionContext` 设三重 fail-open 守卫（存在性 / try-catch / 1s 超时），任何异常均返回空串而非崩溃，保证扩展永不在登录态读取时挂死。

## 构建与验证

```bash
npm install            # 安装依赖（postinstall 会执行 wxt prepare 生成类型）
npm run compile        # tsc --noEmit 类型校验
npm run test           # vitest 跑完整测试套件（jsdom 环境）
npm run build:chrome   # 构建 Chrome MV3 到 dist/chrome-mv3/
npm run dev            # 开发模式（wxt 热重载）
npm run build:all      # 构建 chrome / edge / firefox
node scripts/port-from-upstream.mjs --dry   # 预演上游移植替换（不写文件）
```

> **远端编译（CI）**：推送到 `main` 或推送 `v*` 标签会触发 GitHub Actions，自动执行 `compile` + `build:chrome`，并将 `dist/chrome-mv3` 作为构建产物（artifact）上传，可在 Actions 运行页下载。Release 仅自取构建产物，不发布到应用商店。

## 技术事实基线（来自 phaseB_sse.json 实算）

- 端点 `POST /chat/completion?aid=497858...`；命名事件 SSE 流共 18 个。
- 权威完整助手文本 = 仅 `SSE_REPLY_END(end_type:1).msg_finish_attr.brief`。
- `CHUNK_DELTA` / `STREAM_MSG_NOTIFY` 仅用于实时逐字显示；`STREAM_CHUNK` 携 `patch_op` 增量构建正文。
- DOM 钩子 `window.DoubaoUIFramework`；`HIDDEN_MESSAGE_STATUSES = Set([1,3,5,7,19])`。
- 豆包无 PoW（与 Deepseek 根本差异）。

完整设计见 `analysis/docs/融合版可落地移植方案.md`；审核记录见 `analysis/validate/协同审核与优化报告.md`；第 6 步验收与人工测试手册见 `analysis/docs/第6步验收报告与人工测试手册.md`。
