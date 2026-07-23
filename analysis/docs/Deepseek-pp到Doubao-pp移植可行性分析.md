# 基于 Deepseek-pp 改造 Doubao-pp 的可行性分析报告

> 分析对象：浏览器扩展(extension)项目 `Deepseek-pp`
> 本地目录：`D:\Documents\AI_Work_Temp\Deepseek-pp`（git 根目录，main 分支，v1.11.5，origin=zhangweildlh/deepseek-pp，upstream=zhu1090093659/deepseek-pp）
> 目标：以该项目为基础，在网页版「豆包(doubao)」上实现与网页版 Deepseek 一致的功能与体验，并做到上游更新后能用简单/固定的修改（脚本）快速移植。
> 本文仅做可行性分析，**不创建 Doubao-pp 项目，也不修改 Deepseek-pp 的任何代码与文件**。

---

## 一、执行摘要（结论先行）

1. **整体思路可行**：Deepseek-pp 的代码存在清晰的「平台无关逻辑」与「平台适配层」分层，平台无关逻辑（记忆、技能、工具、自动化、云同步、侧边栏 UI 等）占代码主体，可完整复用到豆包。
2. **但「仅用固定脚本 + Fork(复刻)」无法完成移植**。核心请求拦截器 `fetch-hook.ts` 直接硬编码依赖 `core/deepseek/` 适配层（用 `matchDeepSeekWebRoute` 按 Deepseek 的域名与路径识别请求）。若只做字符串替换把 `chat.deepseek.com` 改成 `doubao.com`，拦截器对豆包的请求**完全无法匹配**，记忆注入、工具调用、流式处理会全部失效。
3. **必须做一层架构改造**：把核心拦截器从「硬编码依赖 deepseek」改为「依赖抽象的 ChatProvider(提供者) 接口」，并将平台适配拆成并列的 `core/deepseek/` 与 `core/doubao/`。改造后，上游通用逻辑的更新可通过 `git merge upstream/main` 自动同步；仅当「适配层契约」变化时，才需手写跟进豆包适配层。
4. **移植工作量分三档**：
   - 机械替换（品牌名、清单名称、域名配置、i18n 文案、浮窗品牌资产）→ 可完全脚本化，工作量低。
   - 配置/正则替换（入口 `matches`、会话 URL 解析、host_permissions）→ 可脚本或配置化，工作量低。
   - **协议重写（SSE 流解析、请求体编解码、认证/反爬、DOM 选择器）→ 必须手写，且是持续维护成本，工作量中-高，不可脚本化。**
5. **最大风险点**：豆包网页版使用与 Deepseek **完全不同的私有协议**（SSE 事件类型 2001/2002/2003 + `content.text` 字段，而非 Deepseek 的 JSON patch `{p,o,v}` 格式），且认证为「字节签名注入」对抗机制。这部分逆向与维护成本最高，且网页改版可能随时失效。

---

## 二、Deepseek-pp 项目深度拆解

### 2.1 技术栈与产品形态

- 框架：WXT（浏览器扩展开发框架）+ React 19 + TypeScript + MV3（清单 V3）
- 目标浏览器：Chrome / Edge / Firefox（仅桌面端）
- 构建：Vite（WXT 内置），产物为 `dist/chrome-mv3`、`dist/edge-mv3`、`dist/firefox-mv3`
- 产品定位：给网页版 Deepseek 增加「智能体记忆(agentic memory)、技能(Skills)、工具(tools)、自动化(automation)、MCP 工具」等能力

### 2.2 核心运行时模型（来自 AGENTS.md）

1. 拦截(intercept) Deepseek 网页的请求与从页面运行时流出的响应流；
2. 用记忆/Skill/预设/项目/工具上下文增强(augment)请求体；
3. 解析工具调用(tool-call)输出，并经扩展自有边界执行已批准的能力；
4. 在 IndexedDB 与浏览器存储中持久化用户状态；
5. 集成可选的 MCP、Native Host(原生宿主)、云同步(sync)、沙箱(sandbox)、侧边栏(side panel)、浮动聊天(floating-chat) 等界面。

### 2.3 目录结构与分层

```
Deepseek-pp/
├── wxt.config.ts            # 构建配置：manifest、host_permissions、品牌资源
├── package.json             # 依赖与脚本（workspaces: packages/*）
├── core/                    # 核心逻辑（与平台部分解耦）
│   ├── deepseek/            # ★平台适配层（Deepseek 专属）
│   │   ├── contracts.ts      # 域名/路由/API URL/body 预算（集中常量）
│   │   ├── request-codec.ts  # 请求体编解码 + 路由匹配
│   │   ├── stream-codec.ts   # SSE 帧解码（Deepseek 私有格式）
│   │   ├── stream-metrics.ts # token 速度统计
│   │   ├── pow.ts            # 工作量证明(PoW) 反爬挑战
│   │   ├── active-client.ts  # 登录 token / 缺失 token 提示
│   │   ├── chat-session.ts   # 会话 URL 解析
│   │   └── conversation-export.ts
│   ├── interceptor/         # ★核心拦截器（直接 import core/deepseek）
│   │   ├── fetch-hook.ts     # hook window.fetch + XMLHttpRequest + IndexedDB
│   │   └── ...
│   ├── memory/ skill/ tool/ automation/ sync/  # 平台无关：记忆/技能/工具/自动化/同步
│   ├── messaging/ prompt/ usage/ project/ preset/ artifact/ inline-agent/ i18n/ theme/
│   └── ui/ content/         # 平台无关 UI + 页面注入（含 Deepseek 特定选择器）
├── entrypoints/             # 扩展入口
│   ├── content.ts           # ISOLATED world 内容脚本（matches chat.deepseek.com）
│   ├── main-world.content.ts# MAIN world 注入（与页面 JS 桥接）
│   ├── floating-chat.content.ts # 浮动聊天按钮
│   ├── background.ts        # 服务工作者(service worker)，平台判断
│   ├── background/          # 各类后台处理器
│   └── sidepanel/           # React 侧边栏 UI（平台无关）
├── packages/shell-host/     # 原生宿主（本地命令执行，平台无关）
└── scripts/                 # 构建/校验/冒烟脚本（部分含域名硬编码）
```

### 2.4 平台耦合点全景（按可移植性分级）

**A 类 — 集中配置型（好）：已收口到 `core/deepseek/contracts.ts`**
- `DEEPSEEK_WEB_ORIGIN = 'https://chat.deepseek.com'`（contracts.ts:1）
- `DEEPSEEK_WEB_ROUTES`：completion/regenerate/history/powChallenge 等路径（contracts.ts:3-12）
- `DEEPSEEK_OFFICIAL_API_URL = 'https://api.deepseek.com/chat/completions'`（contracts.ts:15）
- `DEEPSEEK_BYPASS_HOOK_HEADER`、`DEEPSEEK_BODY_BUDGETS`（contracts.ts:18-26）

**B 类 — 分散硬编码型（中）：入口层 / i18n / 校验脚本**
- `wxt.config.ts:68-71`：`host_permissions` 含 `chat.deepseek.com`、`api.deepseek.com`、`cn.bing.com`
- `wxt.config.ts:89-101`：`web_accessible_resources` 含 `pet/deepseek-whale-pet-states.png`、匹配 `chat.deepseek.com`
- `entrypoints/content.ts:508`：`matches: ['*://chat.deepseek.com/*']`
- `entrypoints/main-world.content.ts:27`：同上
- `entrypoints/background.ts:285-289`：`DEEPSEEK_HOME_URL`、`DEEPSEEK_TAB_URL_PATTERN`、hostname 检查
- `entrypoints/background.ts:1074, 1119`：会话路径正则、hostname 判断
- `core/i18n/resources/zh-CN.ts`、`en.ts`：多处 `chat.deepseek.com` 文案
- `scripts/manifest-policy-check.mjs:29-32`：声明并校验上述域名

**C 类 — 协议实现型（最难，无法简单替换）**
- `core/interceptor/fetch-hook.ts:1-6, 155-209`：**直接 import `../deepseek/contracts`、`../deepseek/request-codec`、``../deepseek/stream-codec``，用 `matchDeepSeekWebRoute({url, method, baseUrl: document.baseURI})` 识别路由**。这是平台耦合的「开关」——不替换这里的依赖，拦截器永远只对 Deepseek 请求生效。
- `core/deepseek/stream-codec.ts`（被 fetch-hook 引用）：Deepseek 私有 SSE 帧格式 `{p:'response/fragments', o:'APPEND', v:[...]}`（见 fetch-hook.ts:540-615 的解析逻辑）。
- `core/deepseek/request-codec.ts:127-184`：`encodeCompletionRequest` 用 Deepseek 请求体字段（`chat_session_id`、`parent_message_id`、`model_type`、`prompt`、`ref_file_ids`、`thinking_enabled`、`search_enabled`）。
- `core/deepseek/pow.ts`：PoW 反爬挑战（`create_pow_challenge`）。
- `core/deepseek/chat-session.ts:1`：会话 URL 正则 `/^\/(?:a\/)?chat\/s\/([^/?#]+)/`。
- `core/ui/prompt-text-insertion.ts:6`：`findPromptTextarea` 用 `textarea#chat-input` 选择器（Deepseek 页面特定 DOM）。
- `entrypoints/content/adapters/chat-launcher.ts:13-14, 178-215`：浮窗品牌资产硬编码（鲸鱼图标 `pet/deepseek-whale-pet-states.png`、`Open DS++ Chat` 文案、storage key `deepseek_pp_floating_chat_enabled`）。

### 2.5 关键架构事实：已有的「契约/端口(port)」哲学

`AGENTS.md` 明确规定：
> *"Contract modules must not import concrete browser, DOM, provider, or entrypoint implementations."*（契约模块不得导入具体的浏览器/DOM/提供者/入口实现）
> *"Introduce only narrow environment ports."*（只引入窄环境端口）

这说明项目**设计理念上支持可移植**，且已把 Deepseek 专属逻辑集中在 `core/deepseek/`。但「集中」不等于「抽象」——`fetch-hook.ts` 等核心模块仍是**具体 import deepseek 模块**，而非依赖一个 `Provider` 接口。这正是改造的切入点。

---

## 三、豆包网页版技术事实（联网核实）

通过检索逆向项目（doubao2API、DoubaoFreeApi）与公开技术分析，豆包网页版现状如下：

| 维度 | Deepseek 网页版 | 豆包网页版 | 差异程度 |
|---|---|---|---|
| 域名 | `chat.deepseek.com` | `doubao.com`（对话页 `/chat/...`） | 低（字符串替换） |
| 聊天接口路径 | `/api/v0/chat/completion` | `/chat/completion` | 低（改路由表） |
| SSE 帧格式 | JSON patch：`{p,o,v}`（`response/fragments` APPEND） | 自定义事件类型：`2001`=内容、`2002`=初始化、`2003`=终止；内容在 `content.text` | **高（需重写解析器）** |
| 请求体字段 | `chat_session_id`/`parent_message_id`/`model_type`/`prompt`/`ref_file_ids` | `conversation_id`/`message_id`/`section_id` + 不同字段集 | **高（需重写编解码）** |
| 认证/反爬 | PoW 挑战（`create_pow_challenge`） | 字节 JS 自动注入签名（`JS_STREAM_DOUBAO`） | **高（对抗性，逆向成本高）** |
| 会话标识 | URL 路径 `/a/chat/s/{id}` | URL 路径 `/chat/{id}`（格式不同） | 中（改解析正则） |
| 官方 API | `api.deepseek.com`（自有格式） | 方舟 API 兼容 OpenAI（`messages`/`stream`/`model`），**但网页版用内部协议，非官方 OpenAI 格式** | **高（网页版不可直接套用官方 API）** |
| DOM 结构 | Deepseek 页面（输入框 `textarea#chat-input` 等） | 豆包页面（结构不同） | **高（需重写选择器）** |

**核心结论**：豆包与 Deepseek 在「表层交互（SSE 流式打字机、对话式网页）」相似，但**线协议(wire protocol)、认证机制、页面 DOM 三者均不同**。这意味着网络拦截层的「协议栈」必须整体重写，无法靠字符串替换完成。

---

## 四、可行性判断

### 4.1 核心判断

**思路成立，但「固定脚本 + Fork」只能覆盖机械替换层；协议层必须手写，且需先做一处架构解耦改造。**

若不改造直接 Fork + 全局替换：
- 入口 `matches` 改为 `doubao.com` → 内容脚本能在豆包页面加载 ✅
- 但 `fetch-hook` 仍调用 `matchDeepSeekWebRoute` → 豆包请求路由不匹配 → 拦截器跳过 → 记忆/工具/流处理全失效 ❌
- 即使手动让路由匹配，`stream-codec` 解析的是 Deepseek 的 `{p,o,v}` 格式，豆包返回 `2001/content.text` → 解析失败/无文本 ❌
- `pow.ts` 拿 Deepseek 的 PoW 挑战去请求豆包 → 认证失败 ❌

因此，**必须让核心拦截器依赖可切换的 Provider，而非写死的 deepseek 模块**。

### 4.2 移植工作量分级表

| 模块 | 移植方式 | 工作量 | 能否脚本化 |
|---|---|---|---|
| 品牌名 / 包名 / 清单名 / README 标题 | 字符串替换 | 低 | ✅ 完全脚本 |
| 域名 / host_permissions（配置层） | 配置表替换 | 低 | ✅ 脚本 |
| 入口 `matches` / hostname 检查 / 路径正则 | 配置替换 | 低 | ✅ 脚本 |
| i18n 品牌文案 | 字符串替换 | 低 | ✅ 脚本 |
| 浮窗品牌资产（图标/文案/storage key） | 资源替换 + 字符串 | 低 | ✅ 部分脚本 |
| 会话 URL 解析（chat-session） | 重写正则（配置化） | 低 | ⚠️ 配置 |
| **核心拦截器解耦（fetch-hook → Provider 接口）** | **一次性架构改造** | 中 | ⚠️ 一次性 |
| **SSE 流解析（stream-codec）** | **重写实现** | 高 | ❌ 手写 |
| **请求体编解码（request-codec）** | **重写实现** | 中-高 | ❌ 手写 |
| **认证/反爬（pow → 签名）** | **重写实现** | 高（对抗性） | ❌ 手写 |
| **DOM 选择器（输入框/会话列表/历史）** | **重写选择器** | 中 | ❌ 手写 |

### 4.3 推荐移植架构（策略 C：Provider 抽象 + 并列适配层 + 移植脚本）

**第 1 步（架构改造，一次性，建议在 Deepseek-pp 上游推动或 Doubao-pp fork 时做）：**
1. 新增 `core/provider/types.ts`，定义统一 `ChatProvider` 接口，涵盖：
   - `webOrigin`、`webRoutes`、`officialApiUrl`
   - `matchWebRoute(url, method, baseUrl)`
   - `encodeCompletionRequest` / `encodeHistoryRequest` / `encodeCreateSession` / `encodeAuthChallenge`
   - `createStreamState()`（SSE 帧解码器，隐藏具体格式）
   - `resolveChatSessionId(url)`
   - `captureClientHeaders(headers)`
   - `acquireAuth()`（获取/注入 PoW 或字节签名）
   - `uiSelectors`（输入框、会话列表、历史等 DOM 选择器）
2. 将 `core/deepseek/` 视为 `core/provider/deepseek/` 实现该接口（基本是重命名 + 补接口签名）。
3. 新增 `core/provider/doubao/`，实现豆包协议（重写 SSE/请求体/签名/URL/DOM 五块）。
4. 新增 `core/provider/active.ts`：依据**构建变量**（如 `BUILD_TARGET=doubao`）或运行时 URL 选择当前 Provider。
5. `fetch-hook.ts`、`main-world.content.ts`、`content.ts` 等从 `import '../deepseek/...'` 改为 `import '../provider/active'`。入口 `matches` 由 Provider 提供。

**第 2 步（移植脚本，放在 Doubao-pp 仓库 `scripts/port-from-upstream.mjs`）：**
- 在 `git fetch upstream && git merge upstream/main` 之后运行。
- 自动应用「机械替换」：品牌名、清单名、域名（配置层）、i18n 文案、浮窗品牌字符串。这些替换已收口到少数配置文件 + i18n 资源，脚本风险可控。
- **不触碰** `core/provider/doubao/`（手写维护，避免被脚本覆盖）。
- 附带校验：扫描是否残留未替换的 `chat.deepseek.com` 等硬编码（把现有 `manifest-policy-check.mjs` 扩展为也核查 upstream 遗漏的硬编码）。

**第 3 步（同步上游工作流）：**
- 上游更新「通用逻辑」（core/memory、tool、skill、automation、sync、UI 等）→ `git merge` 自动合入，新功能/BUG 修复自动获得 ✅
- 上游更新「适配层契约」（`core/provider/types.ts` 接口变动）→ 需对应更新 `core/provider/doubao/` 实现（人工，但频率低，且 Deepseek 侧同步改动会给出明确信号）⚠️
- 上游更新「入口层/配置层」→ 重跑移植脚本即可 ✅

---

## 五、风险与边界

1. **SSE 协议差异是最大工作量**：豆包 `2001/2002/2003` 事件 vs Deepseek JSON patch，需完全重写 `stream-codec`。不可脚本化，需逆向 + 单测覆盖。
2. **认证对抗性**：豆包的字节签名/反爬是持续对抗机制，网页改版可能随时失效，需长期维护，且存在被检测/限流风险。
3. **DOM 选择器脆弱**：豆包页面改版会导致输入框/会话定位失效，需持续跟进（建议将选择器配置化并加冒烟测试）。
4. **合规与稳定性**：逆向网页私有协议存在合规与账号风险，生产使用前需评估。
5. **上游重构风险**：若上游把 `core/deepseek` 进一步打散或改名，移植脚本与 merge 需相应调整——这正是「Provider 抽象」要提前规避的。

---

## 六、总体可行性评估

| 评估项 | 结论 |
|---|---|
| 功能可行性 | ✅ 可行。平台无关逻辑（占主体）完整复用，仅适配层重写。 |
| 「简单固定修改/脚本移植」可行性 | ⚠️ 部分可行。机械层可脚本化；协议/认证/DOM 三层必须手写且持续维护。 |
| 首次工作量 | 中-高：解耦改造（中）+ 豆包适配层（中-高，尤其 SSE 解析 + 签名 + DOM）。 |
| 后续同步工作量 | 低：脚本 + 偶尔适配层跟进（仅当适配层契约变化）。 |
| 推荐度 | 若目标是「长期跟随上游的豆包版」：必须做 Provider 抽象改造。若仅一次性移植：可直接 Fork + 手工改适配层，但后续同步成本陡增。 |

---

## 七、给下一步的具体建议（若决定推进）

1. **先验证豆包协议**：用浏览器开发者工具抓包，确认豆包 `/chat/completion` 的真实请求体字段、SSE 事件格式、签名注入点。这是所有工作的前提。
2. **在 Deepseek-pp 侧推动 Provider 抽象**：把 `core/deepseek/` 收敛为 `core/provider/deepseek/` 并实现统一接口，让核心拦截器依赖接口。这同时改善上游架构，易被上游接受。
3. **Doubao-pp 作为 fork**：保持 `core/provider/doubao/` 独立目录，配 `scripts/port-from-upstream.mjs` 做机械替换。
4. **优先级排序**：先打通「请求拦截 + 记忆注入 + SSE 文本回显」（最小可用），再补工具调用、自动化、云同步等。

> 本报告基于静态代码分析与公开技术资料，未运行、未修改 Deepseek-pp 任何文件。所有关于豆包协议的判断需以实际抓包为准。
