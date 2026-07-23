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
  UIFRAMEWORK_GLOBAL,
  HIDDEN_MESSAGE_STATUSES,
} from './contracts.ts';

// P2-c：content ↔ popup/worker/侧边栏 React 通信桥事件名
export const BRIDGE_EVENT = '__DOUBAO_PP_BRIDGE_V1__';

// P2-a：读取豆包 SPA 框架全局对象（页面注入落点）
export function getUIFramework(): Record<string, unknown> | null {
  const w = globalThis as unknown as Record<string, unknown>;
  const fw = w[UIFRAMEWORK_GLOBAL];
  return (fw as Record<string, unknown>) || null;
}

// P2-b：隐藏消息状态判定，避免误注入 / 重复处理
export function isVisibleMessage(status?: number): boolean {
  if (status === undefined) return true;
  return !HIDDEN_MESSAGE_STATUSES.has(status);
}

// P2-d：捕获页面自有请求的响应（非检测地获取页面数据，供记忆系统消费）
export function createEmptyRequestCache() {
  return { single: null as unknown, recent: null as unknown, title: null as unknown };
}

// P2-c：把豆包事件桥接到扩展侧边栏 / 浮窗
export function bridgeEmit(payload: unknown): void {
  const w = globalThis as unknown as { dispatchEvent?: (e: Event) => boolean };
  if (w.dispatchEvent) {
    w.dispatchEvent(new CustomEvent(BRIDGE_EVENT, { detail: payload }));
  }
  // 跨执行环境桥接：MAIN world → background service worker
  // chrome.runtime.sendMessage 在普通网页上下文会抛异常，用可选链 + try-catch 屏蔽
  try {
    (globalThis as any).chrome?.runtime?.sendMessage({
      __doubaoPpBridge: true,
      type: BRIDGE_EVENT,
      detail: payload,
    });
  } catch {
    // 非扩展上下文（普通网页），静默忽略
  }
}

export { DOUBAO_SELECTORS };
