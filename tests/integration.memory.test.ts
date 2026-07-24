// background 记忆持久化集成测试（node 环境）
//
// 桩接 defineBackground + chrome.runtime.onMessage + chrome.storage.local，
// 验证 CONVERSATION_READY + ASSISTANT_TEXT 经 requestId 关联后持久化为记忆条目，
// 同会话去重更新，以及 GET_MEMORY / CLEAR_MEMORY 响应。

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BRIDGE_EVENT } from '../core/provider/doubao/dom-hook.ts';

describe('background 记忆持久化（集成）', () => {
  let registerListener: (msg: any, sender: any, sendResponse: any) => void = () => {};
  let storage: Map<string, unknown>;

  beforeAll(async () => {
    const listeners: Array<(msg: any, sender: any, sendResponse: any) => void> = [];
    storage = new Map();
    (globalThis as any).chrome = {
      runtime: { onMessage: { addListener: (fn: any) => listeners.push(fn) } },
      storage: {
        local: {
          get: async (k: string) => (storage.has(k) ? { [k]: storage.get(k) } : {}),
          set: async (obj: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(obj)) storage.set(k, v);
          },
        },
      },
    };
    (globalThis as any).defineBackground = (cb: any) => cb({});
    await import('../entrypoints/background.ts');
    registerListener = listeners[0];
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('CONVERSATION_READY + ASSISTANT_TEXT 持久化为一条记忆', async () => {
    registerListener(
      {
        __doubaoPpBridge: true,
        type: BRIDGE_EVENT,
        detail: {
          type: 'CONVERSATION_READY',
          requestId: 'r1',
          conversationId: 'c1',
          sectionId: 's1',
          sessionUrl: 'url',
        },
      },
      {},
      () => {},
    );
    registerListener(
      {
        __doubaoPpBridge: true,
        type: BRIDGE_EVENT,
        detail: { type: 'ASSISTANT_TEXT', requestId: 'r1', text: '你好世界' },
      },
      {},
      () => {},
    );
    await flush();
    const sendResponse = vi.fn();
    registerListener({ type: 'GET_MEMORY' }, {}, sendResponse);
    await flush();
    const entries = sendResponse.mock.calls[0][0] as Array<{
      conversationId: string;
      assistantText: string;
    }>;
    expect(entries.length).toBe(1);
    expect(entries[0].conversationId).toBe('c1');
    expect(entries[0].assistantText).toBe('你好世界');
  });

  it('同会话再次 ASSISTANT_TEXT 去重更新（仍为 1 条）', async () => {
    registerListener(
      {
        __doubaoPpBridge: true,
        type: BRIDGE_EVENT,
        detail: {
          type: 'CONVERSATION_READY',
          requestId: 'r2',
          conversationId: 'c1',
          sectionId: 's1',
          sessionUrl: 'url',
        },
      },
      {},
      () => {},
    );
    registerListener(
      {
        __doubaoPpBridge: true,
        type: BRIDGE_EVENT,
        detail: { type: 'ASSISTANT_TEXT', requestId: 'r2', text: '更新版回复' },
      },
      {},
      () => {},
    );
    await flush();
    const sendResponse = vi.fn();
    registerListener({ type: 'GET_MEMORY' }, {}, sendResponse);
    await flush();
    const entries = sendResponse.mock.calls[0][0] as Array<{
      conversationId: string;
      assistantText: string;
    }>;
    expect(entries.length).toBe(1);
    expect(entries[0].conversationId).toBe('c1');
    expect(entries[0].assistantText).toBe('更新版回复');
  });

  it('CLEAR_MEMORY 清空记忆并返回 { ok: true }', async () => {
    const clr = vi.fn();
    registerListener({ type: 'CLEAR_MEMORY' }, {}, clr);
    await flush();
    expect(clr).toHaveBeenCalledWith({ ok: true });
    const get = vi.fn();
    registerListener({ type: 'GET_MEMORY' }, {}, get);
    await flush();
    expect(get.mock.calls[0][0]).toEqual([]);
  });
});
