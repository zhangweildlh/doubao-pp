// 融合方案 §4.2-3 / P2 范本 + §4.2-4：DOM 钩子 + auth 真实接线（步骤 4 doubao/dom-observer）
//
// 把 dom-hook.ts 的纯函数真正接入豆包页面流（MAIN world）：
//   - getUIFramework()：检测 DoubaoUIFramework 全局，于 DOM_READY 广播
//   - isVisibleMessage()：按 HIDDEN_MESSAGE_STATUSES 过滤隐藏 / 系统消息
//   - createEmptyRequestCache()：初始化页面请求槽位（P2-d），供后续记忆 / 导出消费
//   - readPageAuth()：读取页面登录态，经 AUTH_STATUS 广播并驱动注入软门禁
//   - bridgeEmit()：把页面事件桥到 popup / 侧边栏 / 浮窗 / 记忆系统
//
// 纯函数（extractAssistantText / getStatusFromEl / shouldProcessMessage）与运行时接线
// 分离，便于在 jsdom 中单测而不依赖浏览器全局。

import {
  getUIFramework,
  isVisibleMessage,
  createEmptyRequestCache,
  bridgeEmit,
  DOUBAO_SELECTORS,
  UIFRAMEWORK_GLOBAL,
} from './dom-hook.ts';
import { readPageAuth, type PageAuthSnapshot } from './auth.ts';
import { setAuthed } from './auth-state.ts';

// —— 纯函数（可单测，无浏览器依赖）——

// 从助手消息元素抽取文本（selector 命中容器，取 textContent 去空白）
export function extractAssistantText(el: Element): string {
  return (el.textContent ?? '').trim();
}

// 从元素读取消息状态：优先 data-msg-status，回退 data-status
// （豆包真实属性名待第 3 步真机确认，此处用通用命名，缺失则视为无状态）
export function getStatusFromEl(el: Element): number | undefined {
  const raw = el.getAttribute('data-msg-status') ?? el.getAttribute('data-status');
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

// 是否应处理该消息：可见（非隐藏状态）且含非空文本
export function shouldProcessMessage(el: Element): boolean {
  if (!isVisibleMessage(getStatusFromEl(el))) return false;
  return extractAssistantText(el).length > 0;
}

// —— 运行时接线（仅 MAIN world / 浏览器环境）——

let domStarted = false;
let authStarted = false;
const emitted = new WeakSet<Element>();

export interface DomReadyPayload {
  type: 'DOM_READY';
  frameworkPresent: boolean;
  uiFrameworkGlobal: string;
  selectors: typeof DOUBAO_SELECTORS;
}

export interface PageMessagePayload {
  type: 'PAGE_MESSAGE';
  role: 'assistant';
  text: string;
  status?: number;
}

export interface AuthStatusPayload {
  type: 'AUTH_STATUS';
  auth: PageAuthSnapshot;
}

// DOM 钩子真实接线：检测框架 + 监听助手消息 + 初始化请求槽位
export function startDomObserver(): void {
  if (domStarted) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  domStarted = true;

  const fw = getUIFramework();
  const ready: DomReadyPayload = {
    type: 'DOM_READY',
    frameworkPresent: fw !== null,
    uiFrameworkGlobal: UIFRAMEWORK_GLOBAL,
    selectors: DOUBAO_SELECTORS,
  };
  bridgeEmit(ready);

  // P2-d：初始化页面请求槽位捕获（供记忆 / 导出消费；完整填充待真机确认 API 路径）
  const cache = createEmptyRequestCache();
  (window as unknown as Record<string, unknown>).__doubaoPpRequestCache = cache;

  // 监听文档变动：元素新增（childList）或文本流式增长（characterData）均触发扫描。
  // 用 querySelectorAll 全量扫描 + WeakSet 去重，既覆盖"流式追加文本后才有内容"的场景，
  // 又避免同一条消息重复广播（高频 STREAMING 文本不刷屏）。
  const observer = new MutationObserver(() => {
    const els = document.querySelectorAll(DOUBAO_SELECTORS.assistantMessage);
    els.forEach((el: Element) => {
      if (emitted.has(el)) return;
      if (!shouldProcessMessage(el)) return;
      emitted.add(el);
      const status = getStatusFromEl(el);
      const payload: PageMessagePayload = {
        type: 'PAGE_MESSAGE',
        role: 'assistant',
        text: extractAssistantText(el),
        ...(status !== undefined ? { status } : {}),
      };
      bridgeEmit(payload);
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

// auth 真实接线：读取页面登录态 → 广播 AUTH_STATUS + 驱动注入软门禁
export function startAuthWatcher(): void {
  if (authStarted) return;
  if (typeof document === 'undefined') return;
  authStarted = true;

  const cookie = document.cookie ?? '';
  const auth = readPageAuth(cookie);
  // 软门禁：msToken 或 sessionid 任一可读即视为已登录；fail-open 由 auth-state 默认保证
  setAuthed(auth.hasMsToken || auth.hasSessionCookie);
  const payload: AuthStatusPayload = { type: 'AUTH_STATUS', auth };
  bridgeEmit(payload);
}
