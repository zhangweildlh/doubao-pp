# Doubao-pp

将 [Deepseek-pp](https://github.com/zhangweildlh/deepseek-pp) 浏览器扩展（记忆 / Skill / 工具 / 自动化 / MCP / 云同步 / 侧边栏 / 浮窗）移植到**豆包网页版**（`https://www.doubao.com/chat/`）的项目。

## 目标

在豆包网页版复刻 Deepseek-pp 的本地增强能力，采用「非检测」路线：MAIN world content script 钩 `window.fetch` **原地增强页面自有请求**，复用页面自动注入的 `a_bogus` / `msToken` 签名，规避自实现反爬签名（路线 A 优先；仅当路线 A 不可行才用可被检测的独立客户端，路线 B）。

## 当前状态

- **阶段 P0（生产落地）已完成并验证**：仓库已建，分析产出物归档于 `analysis/`；生产代码骨架（`core/provider` 解耦实现 + `core/interceptor/fetch-hook` + `entrypoints` 入口 + wxt 构建配置）已全部落地。
- **验证结果**：`npm run compile`（tsc 类型校验）通过；`npm run build:chrome`（wxt 构建）成功，生成 `dist/chrome-mv3/`（manifest + `content-scripts/main-world.js`）。生成的清单 `host_permissions` 含 `*://www.doubao.com/*`、`*://doubao.com/*`，content script `matches: *://www.doubao.com/chat/*`、`world: MAIN`。
- 原型验证（SSE 文本重建、ChatProvider 解耦）此前已通过 7/7 机器校验，详见 `analysis/validate/`。
- 经三轮独立审核（主Agent 兜底，MiMo code 因代理波动未接入），结论一致：原型达「验证就绪」。

## 目录结构

```
analysis/                            # 分析产出物（不进生产构建）
  docs/                              # 可行性分析、融合方案、实测方案
  capture/                           # DevTools 抓包证据与脚本（js/ 前端 chunk 除外）
  validate/                          # 原型代码 + 验证器 + 协同审核报告
core/
  provider/                          # 生产代码：ChatProvider 解耦实现
    types.ts                         # 统一契约 ChatProvider
    active.ts                        # 运行期按 URL 选择 provider（当前默认 doubao）
    deepseek/provider.ts             # Deepseek 对称占位实现
    doubao/
      contracts.ts                   # 端点 / 路由 / 选择器 / 框架全局（实测裁决）
      stream-codec.ts               # 命名事件 SSE 解析 + brief 定稿文本抽取
      request-aug.ts                 # 路线 A 原地增强（只改文本节点）
      dom-hook.ts                    # window.DoubaoUIFramework 钩子 + 事件桥
      auth.ts                        # 仅读页面既有登录态（不实现 a_bogus/PoW）
      chat-session.ts                # 会话 URL 解析
      provider.ts                    # 豆包 ChatProvider 实现聚合
  interceptor/
    fetch-hook.ts                    # 豆包感知 window.fetch 拦截器（路线 A 非检测）
entrypoints/
  main-world.content.ts              # MAIN world 内容脚本入口（豆包网页版）
scripts/
  port-from-upstream.mjs             # 上游(Deepseek-pp)批量品牌/域名/文案替换辅助脚本
wxt.config.ts                        # 扩展构建配置（豆包化清单 + 权限预算）
.github/workflows/ci.yml             # CI：compile + build:chrome
package.json / tsconfig.json / vitest.config.ts
```

## 构建与验证

```bash
npm install            # 安装依赖（postinstall 会执行 wxt prepare 生成类型）
npm run compile        # tsc --noEmit 类型校验
npm run build:chrome   # 构建 Chrome MV3 到 dist/chrome-mv3/
npm run dev            # 开发模式（wxt 热重载）
npm run build:all      # 构建 chrome / edge / firefox
node scripts/port-from-upstream.mjs --dry   # 预演上游移植替换（不写文件）
```

## 技术事实基线（来自 phaseB_sse.json 实算）

- 端点 `POST /chat/completion?aid=497858...`；命名事件 SSE 流共 18 个。
- 权威完整助手文本 = 仅 `SSE_REPLY_END(end_type:1).msg_finish_attr.brief`。
- `CHUNK_DELTA` / `STREAM_MSG_NOTIFY` 仅用于实时逐字显示；`STREAM_CHUNK` 携 `patch_op` 增量构建正文。
- DOM 钩子 `window.DoubaoUIFramework`；`HIDDEN_MESSAGE_STATUSES = Set([1,3,5,7,19])`。
- 豆包无 PoW（与 Deepseek 根本差异）。

完整设计见 `analysis/docs/融合版可落地移植方案.md`；审核记录见 `analysis/validate/协同审核与优化报告.md`。
