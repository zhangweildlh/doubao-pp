// 第 6 步：loadInjectionContext 跨世界回退协议单测（jsdom 环境，window 可用）
//
// 覆盖：
//   - MAIN world 侧：无直读 chrome.storage 时经 window.postMessage 请求，
//     收到 ISOLATED relay 的 CTX_RESP 后正确解析上下文字符串（请求/响应协议）
//   - relay 侧 buildContextResponse：读取 chrome.storage 并合并为响应载荷
//   - 纯单测环境（无 chrome）fail-open 立即返回空串，不悬挂

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadInjectionContext,
  buildContextResponse,
  CTX_REQ_CHANNEL,
  CTX_RESP_CHANNEL,
} from '../core/provider/doubao/injection.ts';
import { setAuthed } from '../core/provider/doubao/auth-state.ts';
import {
  MemoryStore,
  chromeStorageBackend,
  type MemoryEntry,
} from '../core/memory/store.ts';
import { SkillStore, chromeSyncStorageBackend, type SkillEntry } from '../core/skills/store.ts';

function stubChromeNoStorage() {
  // chrome 存在但 storage 缺失（模拟 360Chrome MAIN world）
  (globalThis as any).chrome = { runtime: {} };
}

function stubChromeWithStorage() {
  const local: Record<string, unknown> = {};
  const sync: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (k: string) => (k in local ? { [k]: local[k] } : {}),
        set: async (o: Record<string, unknown>) => {
          Object.assign(local, o);
        },
      },
      sync: {
        get: async (k: string) => (k in sync ? { [k]: sync[k] } : {}),
        set: async (o: Record<string, unknown>) => {
          Object.assign(sync, o);
        },
      },
    },
  };
  return { local, sync };
}

describe('loadInjectionContext 跨世界回退协议（MAIN world 侧）', () => {
  beforeEach(() => {
    setAuthed(true);
    stubChromeNoStorage();
  });
  afterEach(() => {
    delete (globalThis as any).chrome;
    setAuthed(true);
  });

  it('无直读能力时经 window.postMessage 请求，收到 relay 响应后解析上下文', async () => {
    const expected = '【历史记忆】回读测试要点';
    // 模拟 ISOLATED relay：监听 CTX_REQ，回传 CTX_RESP
    const onReq = (e: MessageEvent) => {
      const d = e.data as Record<string, unknown>;
      if (!d || d[CTX_REQ_CHANNEL] !== true) return;
      window.removeEventListener('message', onReq);
      window.postMessage({ [CTX_RESP_CHANNEL]: true, reqId: d.reqId, context: expected }, '*');
    };
    window.addEventListener('message', onReq);

    const ctx = await loadInjectionContext();
    expect(ctx).toBe(expected);
    window.removeEventListener('message', onReq);
  });

  it('发出请求的 reqId 与响应 reqId 严格匹配（防串扰）', async () => {
    let capturedReqId: string | null = null;
    const onReq = (e: MessageEvent) => {
      const d = e.data as Record<string, unknown>;
      if (!d || d[CTX_REQ_CHANNEL] !== true) return;
      capturedReqId = d.reqId as string;
      // 故意回传错误 reqId，应被忽略并继续等待超时（1s）后 fail-open 空串
      window.postMessage({ [CTX_RESP_CHANNEL]: true, reqId: 'wrong-id', context: 'X' }, '*');
    };
    window.addEventListener('message', onReq);

    const ctx = await loadInjectionContext();
    expect(capturedReqId).not.toBeNull();
    expect(ctx).toBe(''); // 错误 reqId → 超时 fail-open
    window.removeEventListener('message', onReq);
  });

  it('纯单测环境（无 chrome）fail-open 立即返回空串，不悬挂', async () => {
    delete (globalThis as any).chrome;
    const ctx = await loadInjectionContext();
    expect(ctx).toBe('');
  });
});

describe('buildContextResponse（relay 侧）', () => {
  let store: ReturnType<typeof stubChromeWithStorage>;
  beforeEach(async () => {
    setAuthed(true);
    store = stubChromeWithStorage();
    await new MemoryStore(chromeStorageBackend).append({
      id: 'c1', conversationId: 'c1', sectionId: null, sessionUrl: null,
      assistantText: '回读要点A', createdAt: 1, updatedAt: 1,
    } as MemoryEntry);
    await new SkillStore(chromeSyncStorageBackend).upsert({
      id: 'u1', name: 'X', description: 'd', content: '技能X内容',
      enabled: true, builtin: false, createdAt: 1, updatedAt: 1,
    } as SkillEntry);
  });
  afterEach(() => {
    delete (globalThis as any).chrome;
    setAuthed(true);
  });

  it('读取 chrome.storage 并合并为响应载荷', async () => {
    const payload = await buildContextResponse('r1');
    expect(payload[CTX_RESP_CHANNEL]).toBe(true);
    expect(payload.reqId).toBe('r1');
    expect(payload.context).toContain('回读要点A');
    expect(payload.context).toContain('技能X内容');
  });
});
