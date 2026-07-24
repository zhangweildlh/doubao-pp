// 桥接事件派发双路径单测（node/jsdom 环境）
//
// 守护两步关键逻辑：
//   1) bridgeEmitPage：仅派发页内 CustomEvent，绝不调用 chrome.runtime.sendMessage
//      （高频 STREAMING_TEXT 不能淹没 background 消息通道）
//   2) bridgeEmit（完整桥接）：优先 chrome.runtime.sendMessage（标准浏览器），
//      缺失 chrome.runtime 时回退 window.postMessage 中继（360Chrome 等环境）
//
// 每个用例后清理全局桩，避免跨测试污染。

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BRIDGE_EVENT,
  bridgeEmit,
  bridgeEmitPage,
  type BridgeDetail,
} from '../core/provider/doubao/dom-hook.ts';

describe('bridgeEmit / bridgeEmitPage 派发路径', () => {
  afterEach(() => {
    delete (globalThis as any).chrome;
    delete (globalThis as any).postMessage;
    delete (globalThis as any).dispatchEvent;
    delete (globalThis as any).CustomEvent;
  });

  it('bridgeEmitPage 仅派发页内 CustomEvent，且不调用 chrome.runtime.sendMessage', () => {
    const sendMessage = vi.fn();
    (globalThis as any).chrome = { runtime: { sendMessage } };

    const received: BridgeDetail[] = [];
    const listener = (e: Event) => received.push((e as CustomEvent).detail as BridgeDetail);
    window.addEventListener(BRIDGE_EVENT, listener);

    const payload: BridgeDetail = { type: 'STREAMING_TEXT', requestId: 'r1', text: '你好' };
    bridgeEmitPage(payload);

    window.removeEventListener(BRIDGE_EVENT, listener);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(payload);
    expect(sendMessage).not.toHaveBeenCalled(); // 高频事件绝不进 background
  });

  it('bridgeEmit 优先 chrome.runtime.sendMessage（标准浏览器）', () => {
    const sendMessage = vi.fn();
    (globalThis as any).chrome = { runtime: { sendMessage } };
    const postMessage = vi.fn();
    (globalThis as any).postMessage = postMessage;

    const payload: BridgeDetail = { type: 'ASSISTANT_TEXT', requestId: 'r1', text: '定稿' };
    bridgeEmit(payload);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const msg = sendMessage.mock.calls[0][0];
    expect(msg.__doubaoPpBridge).toBe(true);
    expect(msg.type).toBe(BRIDGE_EVENT);
    expect(msg.detail).toEqual(payload);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('bridgeEmit 在 chrome.runtime 缺失时回退 postMessage 中继（360Chrome）', () => {
    const postMessage = vi.fn();
    (globalThis as any).postMessage = postMessage;
    // 关键：不设置 globalThis.chrome，模拟 360Chrome MAIN world 无 chrome.runtime

    const payload: BridgeDetail = {
      type: 'CONVERSATION_READY',
      requestId: 'r1',
      conversationId: 'c1',
      sectionId: 's1',
      sessionUrl: 'https://www.doubao.com/chat/c1',
    };
    bridgeEmit(payload);

    expect(postMessage).toHaveBeenCalledTimes(1);
    const relay = postMessage.mock.calls[0][0];
    expect(relay.__doubaoPpRelay).toBe(true);
    expect(relay.type).toBe(BRIDGE_EVENT);
    expect(relay.detail).toEqual(payload);
  });
});
