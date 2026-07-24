// @vitest-environment jsdom
// DOM 钩子 + auth 真实接线集成测试（jsdom 模拟豆包页面，选择器以真机验收 2026-07-24 为准）
import { describe, it, expect, afterAll } from 'vitest';
import { BRIDGE_EVENT } from '../core/provider/doubao/dom-hook.ts';
import {
  startDomObserver,
  startAuthWatcher,
  extractAssistantText,
  shouldProcessMessage,
  isAssistantMessage,
} from '../core/provider/doubao/dom-observer.ts';
import { setAuthed, isAuthed } from '../core/provider/doubao/auth-state.ts';

function attachCollector(): any[] {
  const events: any[] = [];
  const handler = (e: Event) => events.push((e as CustomEvent).detail);
  window.addEventListener(BRIDGE_EVENT, handler);
  return events;
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

afterAll(() => {
  delete (globalThis as any).chrome;
  delete (globalThis as any).React;
  delete (globalThis as any).DoubaoUIFramework;
  setAuthed(true);
});

describe('dom-observer 真实接线（真机 DOM 结构 2026-07-24）', () => {
  it('DOM_READY 广播（无框架全局时 frameworkPresent=false，best-effort）', async () => {
    delete (globalThis as any).DoubaoUIFramework;
    delete (globalThis as any).React;
    const events = attachCollector();
    startDomObserver();
    await tick(0);
    const ready = events.find((e) => e?.type === 'DOM_READY');
    expect(ready).toBeTruthy();
    expect(ready.frameworkPresent).toBe(false);
  });

  it('助手消息（data-message-id，无发送气泡）出现时广播 PAGE_MESSAGE', async () => {
    const events = attachCollector();
    const div = document.createElement('div');
    div.setAttribute('data-message-id', '999');
    div.textContent = '你好世界';
    document.body.appendChild(div);
    await tick();
    const msg = events.find((e) => e?.type === 'PAGE_MESSAGE');
    expect(msg).toBeTruthy();
    expect(msg.text).toContain('你好世界');
  });

  it('用户消息（含发送气泡 class）不广播 PAGE_MESSAGE', async () => {
    const events = attachCollector();
    const div = document.createElement('div');
    div.setAttribute('data-message-id', '998');
    const bubble = document.createElement('div');
    bubble.className = 'bg-g-send-msg-bubble-bg';
    div.appendChild(bubble);
    div.appendChild(document.createTextNode('我的提问'));
    document.body.appendChild(div);
    await tick();
    const msg = events.filter((e) => e?.type === 'PAGE_MESSAGE' && e.text?.includes('我的提问'));
    expect(msg.length).toBe(0);
  });
});

describe('auth-watcher 真实接线', () => {
  it('读取 document.cookie 广播 AUTH_STATUS 并置门禁', async () => {
    // jsdom 默认 url 为 about:blank，cookie 不可靠；直接定义 cookie getter 供 readPageAuth 读取
    const protoDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      get: () => 'mstoken=abc',
      configurable: true,
    });

    const events = attachCollector();
    startAuthWatcher();
    await tick(0);

    if (protoDesc) Object.defineProperty(document, 'cookie', protoDesc);
    else delete (document as any).cookie;

    const auth = events.find((e) => e?.type === 'AUTH_STATUS');
    expect(auth).toBeTruthy();
    expect(auth.auth.hasMsToken).toBe(true);
    expect(isAuthed()).toBe(true);
  });
});

describe('纯函数', () => {
  it('extractAssistantText 去空白', () => {
    const el = document.createElement('div');
    el.textContent = '  x  ';
    expect(extractAssistantText(el)).toBe('x');
  });

  it('isAssistantMessage 区分用户/助手', () => {
    const assistant = document.createElement('div');
    assistant.setAttribute('data-message-id', '1');
    expect(isAssistantMessage(assistant)).toBe(true);

    const user = document.createElement('div');
    user.setAttribute('data-message-id', '2');
    const bubble = document.createElement('div');
    bubble.className = 'bg-g-send-msg-bubble-bg';
    user.appendChild(bubble);
    expect(isAssistantMessage(user)).toBe(false);

    const user2 = document.createElement('div');
    user2.className = 'justify-end';
    expect(isAssistantMessage(user2)).toBe(false);
  });

  it('shouldProcessMessage 仅处理非空助手消息', () => {
    const assistant = document.createElement('div');
    assistant.setAttribute('data-message-id', '1');
    assistant.textContent = 'y';
    expect(shouldProcessMessage(assistant)).toBe(true);
    assistant.textContent = '';
    expect(shouldProcessMessage(assistant)).toBe(false);

    const user = document.createElement('div');
    user.setAttribute('data-message-id', '2');
    user.className = 'bg-g-send-msg-bubble-bg';
    user.textContent = 'z';
    expect(shouldProcessMessage(user)).toBe(false);
  });

  it('getStatusFromEl 缺失 data-msg-status 时返回 undefined（isVisibleMessage 视为可见，有文本即通过）', () => {
    const el = document.createElement('div');
    el.setAttribute('data-message-id', '1');
    el.textContent = 'x';
    // 真实豆包无 data-msg-status，故 status=undefined → isVisibleMessage 返回 true，不阻断处理
    expect(shouldProcessMessage(el)).toBe(true);
  });
});
