// background service worker 桥接消息处理集成测试（node 环境）
//
// 通过桩接 wxt 的 defineBackground（全局）与 chrome.runtime，
// 验证桥接消息的暂存上限、GET/CLEAR 响应、非桥接消息过滤。
// 不改动生产代码，仅用全局桩在测试期捕获 background 注册的监听器。

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { BRIDGE_EVENT } from '../core/provider/doubao/dom-hook.ts';

describe('background 桥接消息处理（集成）', () => {
  let registerListener: (msg: any, sender: any, sendResponse: any) => void = () => {};
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const listeners: Array<(msg: any, sender: any, sendResponse: any) => void> = [];
    sendMessage = vi.fn();
    (globalThis as any).chrome = {
      runtime: {
        onMessage: { addListener: (fn: any) => listeners.push(fn) },
        sendMessage,
      },
    };
    // 桩接 wxt auto-import 的 defineBackground，捕获其回调以便触发监听器注册
    (globalThis as any).defineBackground = (cb: any) => {
      cb({});
    };
    // 必须在桩之后动态导入，否则模块顶层 defineBackground(...) 会因未定义而抛错
    await import('../entrypoints/background.ts');
    registerListener = listeners[0];
  });

  // 清理全局桩，避免 globalThis.chrome 跨文件污染
  afterAll(() => {
    delete (globalThis as any).chrome;
    delete (globalThis as any).defineBackground;
  });

  it('GET_BRIDGE_HISTORY 初态返回空数组且返回 true（保持消息通道）', () => {
    const sendResponse = vi.fn();
    const ret = registerListener({ type: 'GET_BRIDGE_HISTORY' }, {}, sendResponse);
    expect(ret).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith([]);
  });

  it('桥接消息暂存上限 20 条，超出移除最早一条', () => {
    // 用合法的 BridgeDetail（STREAMING_TEXT）：background 对该类型有意跳过 console 日志，
    // 但仍会进入暂存队列，从而既验证上限、又避免测试期控制台刷屏噪声。
    for (let i = 0; i < 25; i++) {
      registerListener(
        {
          __doubaoPpBridge: true,
          type: BRIDGE_EVENT,
          detail: { type: 'STREAMING_TEXT', requestId: 'r', text: 'm' + i },
        },
        {},
        () => {},
      );
    }
    const sendResponse = vi.fn();
    registerListener({ type: 'GET_BRIDGE_HISTORY' }, {}, sendResponse);
    const hist = sendResponse.mock.calls[0][0] as Array<{ detail: { text: string } }>;
    expect(hist.length).toBe(20);
    expect(hist.some((m) => m.detail.text === 'm0')).toBe(false); // 最早被移除
    expect(hist.some((m) => m.detail.text === 'm24')).toBe(true); // 最新保留
  });

  it('CLEAR_BRIDGE_HISTORY 清空并返回 { ok: true }', () => {
    const sendResponse = vi.fn();
    registerListener({ type: 'CLEAR_BRIDGE_HISTORY' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    const getResp = vi.fn();
    registerListener({ type: 'GET_BRIDGE_HISTORY' }, {}, getResp);
    expect(getResp).toHaveBeenCalledWith([]);
  });

  it('非桥接消息 / 事件名不符的消息被忽略（不暂存）', () => {
    const beforeLen = (() => {
      const r = vi.fn();
      registerListener({ type: 'GET_BRIDGE_HISTORY' }, {}, r);
      return (r.mock.calls[0][0] as any[]).length;
    })();
    registerListener({ type: 'RANDOM_MSG', foo: 1 }, {}, () => {});
    registerListener({ __doubaoPpBridge: true, type: 'WRONG_EVENT', detail: {} }, {}, () => {});
    const afterLen = (() => {
      const r = vi.fn();
      registerListener({ type: 'GET_BRIDGE_HISTORY' }, {}, r);
      return (r.mock.calls[0][0] as any[]).length;
    })();
    expect(afterLen).toBe(beforeLen);
  });
});
