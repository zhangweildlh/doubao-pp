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

// 模块级消息缓存，最多保留最近 20 条（调试用桥接历史）
const bridgeMessages: Array<{ type: string; detail: unknown; receivedAt: number }> = [];
const MAX_BRIDGE_MESSAGES = 20;
// pendingConv 上限：CONVERSATION_READY 仅在 ASSISTANT_TEXT 到达时删除，
// 若请求异常未到达则长期驻留；设上限防无限增长（淘汰最旧仅丢失回退元信息，不崩溃）
const MAX_PENDING = 64;

// 记忆存储（真机后端：chrome.storage.local）
const memory = new MemoryStore(chromeStorageBackend);

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
    const meta = (reqId && pendingConv.get(reqId)) || null;
    // 关联优先用 pendingConv（CONVERSATION_READY 与 ASSISTANT_TEXT 同 reqId 配对，稳定去重）；
    // lastConversationId 仅作异常兜底（reqId 不匹配时）。正常流程不触发兜底，
    // 并发对话流理论上有串号风险，但 fetch-hook 保证 READY/定稿文本同 reqId 配对，实际不触发。
    const conversationId = meta?.conversationId ?? lastConversationId;
    const entry: MemoryEntry = {
      id: conversationId ?? reqId ?? `anon-${Date.now()}`,
      conversationId,
      sectionId: meta?.sectionId ?? null,
      sessionUrl: meta?.sessionUrl ?? null,
      assistantText: text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    // 记忆写入为异步且不需要回包；捕获异常避免未处理的 promise 拒绝
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
  chrome.runtime.onMessage.addListener(
    (
      msg: Record<string, unknown>,
      _sender,
      sendResponse: (response?: unknown) => void,
    ) => {
      // —— popup 请求：桥接历史 ——
      if (msg.type === 'GET_BRIDGE_HISTORY') {
        sendResponse(bridgeMessages.slice());
        return true;
      }
      if (msg.type === 'CLEAR_BRIDGE_HISTORY') {
        bridgeMessages.length = 0;
        sendResponse({ ok: true });
        return true;
      }

      // —— popup 请求：记忆 ——
      if (msg.type === 'GET_MEMORY') {
        // 捕获异常并回空数组，避免消息通道因拒绝而挂起
        memory.getAll().then(sendResponse).catch(() => sendResponse([]));
        return true; // 保持消息通道以异步回包
      }
      if (msg.type === 'CLEAR_MEMORY') {
        memory.clear().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
      }

      // 过滤非桥接消息（同时校验事件名，仅接受 BRIDGE_EVENT 类型）
      if (msg.__doubaoPpBridge !== true || msg.type !== BRIDGE_EVENT) return;

      const detail = (msg.detail ?? {}) as Record<string, unknown>;
      handleBridgeDetail(detail);
    },
  );

  console.info('[Doubao-pp] background service worker 已启动');
});
