# Doubao-pp

将 [Deepseek-pp](https://github.com/zhangweildlh/deepseek-pp) 浏览器扩展（记忆 / Skill / 工具 / 自动化 / MCP / 云同步 / 侧边栏 / 浮窗）移植到**豆包网页版**（`https://www.doubao.com/chat/`）的项目。

## 目标

在豆包网页版复刻 Deepseek-pp 的本地增强能力，采用「非检测」路线：MAIN world content script 钩 `window.fetch` **原地增强页面自有请求**，复用页面自动注入的 `a_bogus` / `msToken` 签名，规避自实现反爬签名（路线 A 优先；仅当路线 A 不可行才用可被检测的独立客户端，路线 B）。

## 当前状态

- **阶段 P0（生产落地初始化）**：仓库已建，分析产出物归档于 `analysis/`；后续生产代码按 P0-2~P0-5 逐步落地。
- 原型验证（SSE 文本重建、ChatProvider 解耦）已通过 7/7 机器校验，详见 `analysis/validate/`。
- 经三轮独立审核（主Agent 兜底，MiMo code 因代理波动未接入），结论一致：原型达「验证就绪」（非生产就绪）。

## 目录结构

```
analysis/                          # 分析产出物（不进生产构建）
  docs/                            # 可行性分析、融合方案、实测方案
  capture/                         # DevTools 抓包证据与脚本（js/ 前端 chunk 除外）
  validate/                        # 原型代码 + 验证器 + 协同审核报告
core/provider/                     # 生产代码：ChatProvider 解耦实现（P0-2 落地）
  types.ts  active.ts  deepseek/  doubao/
entrypoints/                       # 扩展入口（P0-2 从 Deepseek-pp 复制适配）
wxt.config.ts                      # 扩展配置（P0-4 改造 host_permissions）
scripts/port-from-upstream.mjs    # 上游移植脚本（P0-5 编写）
```

## 技术事实基线（来自 phaseB_sse.json 实算）

- 端点 `POST /chat/completion?aid=497858...`；命名事件 SSE 流共 18 个。
- 权威完整助手文本 = 仅 `SSE_REPLY_END(end_type:1).msg_finish_attr.brief`（16 字实测）。
- `CHUNK_DELTA` / `STREAM_MSG_NOTIFY` 仅用于实时逐字显示；`STREAM_CHUNK` 携 `patch_op` 增量构建正文。
- DOM 钩子 `window.DoubaoUIFramework`；`HIDDEN_MESSAGE_STATUSES = Set([1,3,5,7,19])`。
- 豆包无 PoW（与 Deepseek 根本差异）。

完整设计见 `analysis/docs/融合版可落地移植方案.md`；审核记录见 `analysis/validate/协同审核与优化报告.md`。
