// 融合方案 §4.2-3 / P2 范本：window.DoubaoUIFramework 钩子 + 选择器（步骤 4 doubao/dom-hook）
//
// 提供"非检测"地读取页面数据 / 挂载 UI 钩子的骨架，直接对齐
// cf-jx/doubao-export-chat-free 的 content.js 四段（P2-a/b/c/d）：
//   P2-a 框架钩子：window.DoubaoUIFramework
//   P2-b 消息状态过滤：HIDDEN_MESSAGE_STATUSES
//   P2-c 事件桥：BRIDGE_EVENT
//   P2-d 请求槽位捕获：createEmptyRequestCache()

import {
  DOUBAO_SELECTORS,
  HIDDEN_MESSAGE_STATUSES,
  UI_FRAMEWORK_CANDIDATES,
} from './contracts.ts';

// P2-c：content ↔ popup/worker/侧边栏 React 通信桥事件名
export const BRIDGE_EVENT = '__DOUBAO_PP_BRIDGE_V1__';

// P2-a：读取豆包 SPA 框架全局对象（页面注入落点）
// 已真实接线：dom-observer.ts 在 MAIN world 调用 getUIFramework() 检测框架并广播 DOM_READY。
// 真机验收（2026-07-24）确认 DoubaoUIFramework 在豆包网页版不存在，改为软检测候选列表：
// 命中任意已知框架全局即视为框架存在（best-effort，不影响路线 A 注入与记忆桥接）。
export function getUIFrameworkName(): string {
  const w = globalThis as unknown as Record<string, unknown>;
  for (const k of UI_FRAMEWORK_CANDIDATES) {
    const v = w[k];
    if (v && (typeof v === 'object' || typeof v === 'function')) return k;
  }
  return '';
}

export function getUIFramework(): Record<string, unknown> | null {
  const name = getUIFrameworkName();
  if (!name) return null;
  return (globalThis as unknown as Record<string, unknown>)[name] as Record<string, unknown> | null;
}

// P2-b：隐藏消息状态判定，避免误注入 / 重复处理
// 已真实接线：dom-observer.ts 的 shouldProcessMessage() 调用 isVisibleMessage() 过滤隐藏 / 系统消息。
export function isVisibleMessage(status?: number): boolean {
  if (status === undefined) return true;
  return !HIDDEN_MESSAGE_STATUSES.has(status);
}

// P2-d：捕获页面自有请求的响应（非检测地获取页面数据，供记忆系统消费）
// 已真实接线：dom-observer.ts 的 startDomObserver() 调用 createEmptyRequestCache() 初始化请求槽位（window.__doubaoPpRequestCache）。
export function createEmptyRequestCache() {
  return { single: null as unknown, recent: null as unknown, title: null as unknown };
}

// P2-c：把豆包事件桥接到扩展侧边栏 / 浮窗 / 后台 service worker
//
// 双路径：
//   1) 页面内 CustomEvent（供 MAIN world / 验证脚本消费，标准浏览器与 360Chrome 均可用）
//   2) 后台桥接：
//      - 优先 chrome.runtime.sendMessage（标准浏览器 MAIN world 拥有 chrome.runtime）
//      - 回退 window.postMessage 交由 ISOLATED world 中继脚本转发（360Chrome 等环境
//        MAIN world 无 chrome.runtime，详见 entrypoints/relay.content.ts）
export const RELAY_MESSAGE = '__doubaoPpRelay';

// 桥接事件载荷类型：MAIN world（fetch-hook）→ 页内浮窗 / background 共享协议
export type BridgeDetail =
  | { type: 'REQUEST_AUGMENTED'; requestId: string }
  | {
      type: 'CONVERSATION_READY';
      requestId: string;
      conversationId: string | null;
      sectionId: string | null;
      sessionUrl: string | null;
    }
  | { type: 'STREAMING_TEXT'; requestId: string; text: string }
  | { type: 'ASSISTANT_TEXT'; requestId: string; text: string }
  | { type: 'ERROR'; message: string };

// 注：完整桥接接受 unknown（dom-observer 还会下发 DOM_READY / PAGE_MESSAGE /
// AUTH_STATUS 等载荷，背景仅按 detail 透存，不强约束）；精准的 BridgeDetail 类型
// 仅用于 bridgeEmitPage（高频流式）与浮窗归约器，保证消费端类型安全。
export function bridgeEmit(payload: unknown): void {
  const w = globalThis as any;
  // 1) 页面内 CustomEvent（MAIN world / 验证脚本消费）
  if (w.dispatchEvent) {
    try {
      w.dispatchEvent(new CustomEvent(BRIDGE_EVENT, { detail: payload }));
    } catch {
      /* 忽略 */
    }
  }
  // 2) 后台桥接：优先直连，缺失 chrome.runtime 时回退 postMessage 中继
  const bridgeMsg = { __doubaoPpBridge: true, type: BRIDGE_EVENT, detail: payload };
  if (w.chrome?.runtime?.sendMessage) {
    try {
      w.chrome.runtime.sendMessage(bridgeMsg);
      return;
    } catch {
      /* 直连失败，继续回退 */
    }
  }
  if (w.postMessage) {
    try {
      w.postMessage({ __doubaoPpRelay: true, type: BRIDGE_EVENT, detail: payload }, '*');
    } catch {
      /* 非扩展上下文，静默忽略 */
    }
  }
}

// 仅页内 CustomEvent 桥接（不进 background）：供高频流式事件（STREAMING_TEXT）使用，
// 避免每字 chunk 都触发 chrome.runtime.sendMessage / postMessage 中继，淹没消息通道。
// ISOLATED world 浮窗仍以 window CustomEvent 监听消费（DOM 事件跨 realm 共享，
// MAIN world 派发的 CustomEvent 可被隔离世界内容脚本的监听器接收）。
export function bridgeEmitPage(payload: BridgeDetail): void {
  // 优先使用 window（真实浏览器 / jsdom 下存在），确保 CustomEvent 派发到页面 window，
  // 被 ISOLATED world 浮窗的 window 监听器接收；Node 无 window 时回退 globalThis。
  const w = (typeof window !== 'undefined' ? window : globalThis) as any;
  if (!w.dispatchEvent) return;
  try {
    w.dispatchEvent(new CustomEvent(BRIDGE_EVENT, { detail: payload }));
  } catch {
    /* 非扩展 / 异常环境，静默忽略 */
  }
}

export { DOUBAO_SELECTORS, UI_FRAMEWORK_CANDIDATES };
