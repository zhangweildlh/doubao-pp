// @vitest-environment jsdom
// DOM 钩子 + auth 真实接线集成测试（jsdom 模拟豆包页面）
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BRIDGE_EVENT } from '../core/provider/doubao/dom-hook.ts';
import {
  startDomObserver,
  startAuthWatcher,
  extractAssistantText,
  shouldProcessMessage,
} from '../core/provider/doubao/dom-observer.ts';
import { setAuthed, isAuthed } from '../core/provider/doubao/auth-state.ts';

function attachCollector(): any[] {
  const events: any[] = [];
  const handler = (e: Event) => events.push((e as CustomEvent).detail);
  window.addEventListener(BRIDGE_EVENT, handler);
  return events;
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

beforeAll(() => {
  // 模拟豆包 SPA 框架全局对象存在
  (globalThis as any).DoubaoUIFramework = { version: '1' };
});

afterAll(() => {
  delete (globalThis as any).DoubaoUIFramework;
  delete (globalThis as any).chrome;
  setAuthed(true);
});

describe('dom-observer 真实接线', () => {
  it('DOM_READY 广播 frameworkPresent=true', async () => {
    const events = attachCollector();
    startDomObserver();
    await tick(0);
    const ready = events.find((e) => e?.type === 'DOM_READY');
    expect(ready).toBeTruthy();
    expect(ready.frameworkPresent).toBe(true);
  });

  it('可见助手消息出现时广播 PAGE_MESSAGE', async () => {
    const events = attachCollector();
    const div = document.createElement('div');
    div.className = 'chat-content';
    div.textContent = '你好世界';
    document.body.appendChild(div);
    await tick();
    const msg = events.find((e) => e?.type === 'PAGE_MESSAGE');
    expect(msg).toBeTruthy();
    expect(msg.text).toContain('你好世界');
  });

  it('隐藏状态消息（data-msg-status=1）被过滤，不广播', async () => {
    const events = attachCollector();
    const div = document.createElement('div');
    div.className = 'chat-content';
    div.setAttribute('data-msg-status', '1');
    div.textContent = '系统消息';
    document.body.appendChild(div);
    await tick();
    const hidden = events.filter(
      (e) => e?.type === 'PAGE_MESSAGE' && e.text?.includes('系统消息'),
    );
    expect(hidden.length).toBe(0);
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

  it('shouldProcessMessage 过滤隐藏状态', () => {
    const el = document.createElement('div');
    el.setAttribute('data-msg-status', '3');
    el.textContent = 'y';
    expect(shouldProcessMessage(el)).toBe(false);
    el.removeAttribute('data-msg-status');
    expect(shouldProcessMessage(el)).toBe(true);
  });
});
