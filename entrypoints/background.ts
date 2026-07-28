// Doubao-pp background service worker
//
// 职责：
//   1. 监听 MAIN world content script 经 chrome.runtime.sendMessage 发来的
//      事件桥消息（__doubaoPpBridge: true），暂存最近 20 条供 popup/sidebar 调试查看。
//   2. 消费 CONVERSATION_READY + ASSISTANT_TEXT 事件，将定稿助手文本持久化到记忆系统
//      （chrome.storage.local），按 conversationId 去重。
//   3. 响应 popup 的 GET_BRIDGE_HISTORY / CLEAR_BRIDGE_HISTORY / GET_MEMORY / CLEAR_MEMORY。
//
// 注：defineBackground 由 wxt auto-import 提供，无需显式 import。

import { BRIDGE_EVENT } from '../core/provider/doubao/dom-hook.ts';
import {
  MemoryStore,
  chromeStorageBackend,
  type MemoryEntry,
} from '../core/memory/store.ts';
import { UserMemoryStore } from '../core/memory/user-memory.ts';
import { SkillStore, chromeSyncStorageBackend } from '../core/skills/store.ts';
import { McpStore } from '../core/mcp/store.ts';
import { ProjectStore } from '../core/project/store.ts';
import { PresetStore } from '../core/preset/store.ts';
import { SettingsStore } from '../core/settings/store.ts';
import { SavedStore } from '../core/saved/store.ts';
import { AutomationStore } from '../core/automation/store.ts';
import { BrowserControlStore } from '../core/browser-control/store.ts';
import { broadcastRuntimeUpdate, type RuntimeBroadcastDependencies, type RuntimeBroadcastTab } from '../core/messaging/broadcast.ts';
import {
  decodeRuntimeMessageEnvelope,
  createRuntimeMessageContext,
  authorizeRuntimeMessage,
  createRuntimeBoundaryErrorResponse,
  DOUBAO_TAB_URL_PATTERN,
  type RuntimeMessageEnvelope,
} from '../core/messaging/runtime-boundary.ts';
import {
  createRuntimeCommandRegistry,
  getRuntimeCommandOwner,
  CLIENT_ONLY_RUNTIME_COMMAND_TYPES,
  type RuntimeCommandRegistry,
} from '../core/messaging/runtime-command-registry.ts';
import { createDoubaoRuntimeHandlers } from './background/runtime-handler.ts';
import { probeShellHost } from '../core/shell-host/register.ts';

// 模块级消息缓存，最多保留最近 20 条（调试用桥接历史）
const bridgeMessages: Array<{ type: string; detail: unknown; receivedAt: number }> = [];
const MAX_BRIDGE_MESSAGES = 20;
// pendingConv 上限：CONVERSATION_READY 仅在 ASSISTANT_TEXT 到达时删除，
// 若请求异常未到达则长期驻留；设上限防无限增长（淘汰最旧仅丢失回退元信息，不崩溃）
const MAX_PENDING = 64;

// 记忆存储（真机后端：chrome.storage.local）
//   - memory：第2步自动抓取对话记忆（响应 popup 单数 GET_MEMORY / CLEAR_MEMORY）
//   - userMemory：用户笔记型记忆（响应命令总线复数 GET_MEMORIES / SAVE_MEMORY 等）
// 两套并存、互不干扰（方案 A）。
const memory = new MemoryStore(chromeStorageBackend);
const userMemory = new UserMemoryStore(chromeStorageBackend);

// 命令总线依赖：技能走云同步后端、其余走本地后端，均复用现有 Store。
// P1 新增 project/preset/settings 同构 Store，覆盖 13 页面全部 CRUD 命令面。
const skill = new SkillStore(chromeSyncStorageBackend);
const mcp = new McpStore(chromeStorageBackend);
const project = new ProjectStore(chromeStorageBackend);
const preset = new PresetStore(chromeStorageBackend);
const settings = new SettingsStore(chromeStorageBackend);
const saved = new SavedStore(chromeStorageBackend);
const automation = new AutomationStore(chromeStorageBackend);
const browserControl = new BrowserControlStore(chromeStorageBackend);

// 变更广播（P2）：mutation 命令处理后推送 *_UPDATED，供 sidePanel 响应式刷新。
// 复用 Deepseek 同构的 broadcastRuntimeUpdate：扩展内 chrome.runtime.sendMessage
// + 匹配豆包会话页的 content script 双通道投递，best-effort 容错（无接收端不报错）。
const runtimeBroadcastDependencies: RuntimeBroadcastDependencies = {
  tabUrlPattern: DOUBAO_TAB_URL_PATTERN,
  sendRuntimeMessage: (payload) => chrome.runtime.sendMessage(payload) as Promise<unknown>,
  queryTabsByUrl: (pattern) =>
    chrome.tabs.query({ url: pattern }) as Promise<readonly RuntimeBroadcastTab[]>,
  sendTabMessage: (tabId, payload) =>
    chrome.tabs.sendMessage(tabId, payload) as Promise<unknown>,
  reportError: (code, error) => console.error('[Doubao-pp][broadcast]', code, error),
};
function broadcast(type: string): void {
  void broadcastRuntimeUpdate({ type }, undefined, runtimeBroadcastDependencies);
}

// 运行时命令注册表（命令总线核心，P0→P2 扩展为 24 个 typed-handler）。
// 与现有桥接逻辑（GET_BRIDGE_HISTORY / GET_MEMORY 等）互不干扰，走独立通道。
const runtimeCommandRegistry: RuntimeCommandRegistry = createRuntimeCommandRegistry({
  typedHandlers: createDoubaoRuntimeHandlers({
    memory,
    userMemory,
    mcp,
    skill,
    project,
    preset,
    settings,
    saved,
    automation,
    browserControl,
    broadcast,
  }),
});

// 关联 CONVERSATION_READY 与 ASSISTANT_TEXT：二者共享 requestId
type PendingMeta = {
  conversationId: string | null;
  sectionId: string | null;
  sessionUrl: string | null;
};
const pendingConv = new Map<string, PendingMeta>();
let lastConversationId: string | null = null;

function handleBridgeDetail(detail: Record<string, unknown>): void {
  // 所有桥接事件一律存入缓存（供浮窗/popup 查询），不受后续 early return 影响
  bridgeMessages.push({
    type: BRIDGE_EVENT,
    detail,
    receivedAt: Date.now(),
  });
  if (bridgeMessages.length > MAX_BRIDGE_MESSAGES) {
    bridgeMessages.shift();
  }

  const evtType = detail.type;

  // CONVERSATION_READY：记录会话元信息，供后续 ASSISTANT_TEXT 关联
  if (evtType === 'CONVERSATION_READY') {
    const reqId = detail.requestId as string | undefined;
    const meta: PendingMeta = {
      conversationId: (detail.conversationId as string | null) ?? null,
      sectionId: (detail.sectionId as string | null) ?? null,
      sessionUrl: (detail.sessionUrl as string | null) ?? null,
    };
    if (reqId) {
      pendingConv.set(reqId, meta);
      if (pendingConv.size > MAX_PENDING) {
        const oldest = pendingConv.keys().next().value;
        if (oldest !== undefined) pendingConv.delete(oldest);
      }
    }
    if (meta.conversationId) lastConversationId = meta.conversationId;
    return;
  }

  // ASSISTANT_TEXT：定稿文本，持久化到记忆系统（按 conversationId 去重）
  if (evtType === 'ASSISTANT_TEXT') {
    const reqId = detail.requestId as string | undefined;
    const text = typeof detail.text === 'string' ? detail.text : '';
    // M3：优先使用载荷自带元信息（SW 休眠/重启后 pendingConv 内存已清空仍可正确关联）；
    // 其次回退内存 pendingConv（CONVERSATION_READY 与 ASSISTANT_TEXT 同 reqId 配对）；
    // 最后兜底 lastConversationId（异常场景，正常流程不触发）。
    const payloadConversationId = (detail.conversationId as string | null | undefined) ?? null;
    const payloadSectionId = (detail.sectionId as string | null | undefined) ?? null;
    const payloadSessionUrl = (detail.sessionUrl as string | null | undefined) ?? null;
    const meta = (reqId && pendingConv.get(reqId)) || null;
    const conversationId =
      payloadConversationId ?? meta?.conversationId ?? lastConversationId;
    const sectionId = payloadSectionId ?? meta?.sectionId ?? null;
    const sessionUrl = payloadSessionUrl ?? meta?.sessionUrl ?? null;
    const entry: MemoryEntry = {
      id: conversationId ?? reqId ?? `anon-${Date.now()}`,
      conversationId,
      sectionId,
      sessionUrl,
      assistantText: text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    // 记忆写入为异步且不需要回包；捕获异常避免未处理的 promise 拒绝。
    // M5：MemoryStore.append 内部已串行化写入，避免并发丢失更新。
    memory.append(entry).catch((err) => {
      console.error('[Doubao-pp] 记忆写入失败', err);
    });
    if (reqId) pendingConv.delete(reqId);
    return;
  }

  // 其他桥接事件（REQUEST_AUGMENTED / CONVERSATION_READY / ERROR 等）仅暂存供调试。
  // STREAMING_TEXT 现在走页内 CustomEvent 桥接（bridgeEmitPage），background 收不到，
  // 此分支实际不可达，保留作防御；ASSISTANT_TEXT 文本体量大且已持久化，跳过以免日志膨胀。
  // 仅对 REQUEST_AUGMENTED / CONVERSATION_READY / ERROR 等元信息事件记录便于排障。
  if (detail.type !== 'STREAMING_TEXT' && detail.type !== 'ASSISTANT_TEXT') {
    console.info('[Doubao-pp][bridge]', detail.type, detail);
  }
}

export default defineBackground(() => {
  // 统一消息入口：运行时命令总线 + 桥接历史 + 记忆持久化 三通道合并为单个监听器。
  // 单一 addListener 顺序处理，避免多监听器注册顺序影响（修复 background 集成测试取
  // listeners[0] 的契约）：命令信封优先走命令总线 dispatch，其余消息按 popup 请求 /
  // 桥接事件分流，与原双监听器运行时行为等价。
  chrome.runtime.onMessage.addListener(
    (
      msg: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      // —— 运行时命令总线（P0）：尝试解析为合法命令信封 ——
      try {
        const envelope = decodeRuntimeMessageEnvelope(msg);
        // 仅处理 typed-handler 命令；client-only 广播（*_UPDATED）与未知消息放行到下方逻辑
        if (
          !CLIENT_ONLY_RUNTIME_COMMAND_TYPES.includes(envelope.type) &&
          getRuntimeCommandOwner(envelope.type) !== undefined
        ) {
          try {
            const context = createRuntimeMessageContext(sender, {
              runtimeId: chrome.runtime.id,
              extensionOrigin: chrome.runtime.getURL('/'),
              doubaoOrigin: new URL('https://www.doubao.com/').origin,
            });
            authorizeRuntimeMessage(envelope, context);
            runtimeCommandRegistry
              .dispatch(envelope, context)
              .then(sendResponse)
              .catch((error: unknown) =>
                sendResponse(createRuntimeBoundaryErrorResponse(error, envelope)),
              );
          } catch (error) {
            sendResponse(createRuntimeBoundaryErrorResponse(error, envelope));
          }
          return true;
        }
      } catch {
        // 非运行时命令信封，走下方桥接 / popup 逻辑
      }

      // —— popup 请求：桥接历史 ——
      const m = msg as Record<string, unknown>;
      if (m.type === 'GET_BRIDGE_HISTORY') {
        sendResponse(bridgeMessages.slice());
        return true;
      }
      if (m.type === 'CLEAR_BRIDGE_HISTORY') {
        bridgeMessages.length = 0;
        sendResponse({ ok: true });
        return true;
      }

      // —— popup 请求：记忆 ——
      if (m.type === 'GET_MEMORY') {
        // 捕获异常并回空数组，避免消息通道因拒绝而挂起
        memory.getAll().then(sendResponse).catch(() => sendResponse([]));
        return true; // 保持消息通道以异步回包
      }
      if (m.type === 'CLEAR_MEMORY') {
        memory.clear().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
      }

      // —— 桥接事件暂存（MAIN world content script 经 chrome.runtime.sendMessage 发来）——
      if (m.__doubaoPpBridge === true && m.type === BRIDGE_EVENT) {
        const detail = (m.detail ?? {}) as Record<string, unknown>;
        handleBridgeDetail(detail);
      }
    },
  );

  // P5：best-effort 探测 shell-host 复用状态（§8 铁律④），失败仅告警不阻塞启动
  void probeShellHost()
    .then((res) => {
      if (res.reachable) {
        console.info('[Doubao-pp][shell-host] 已连接 DeepSeek++ shell-host。');
      } else {
        console.info(
          '[Doubao-pp][shell-host] 未检测到可用的 shell-host；如需本地 shell 能力，' +
            '运行 scripts/shell-host-register.mjs 追加本扩展到其 allowed_origins。',
        );
      }
    })
    .catch(() => {});

  console.info('[Doubao-pp] background service worker 已启动');
});
