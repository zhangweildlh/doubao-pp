// 记忆存储层单测（node 环境，无 chrome 依赖）
//
// 覆盖：内存后端 append/去重/上限/clear/脏数据，以及 chrome.storage.local 后端桩往返。

import { describe, it, expect, afterAll } from 'vitest';
import {
  MemoryStore,
  createMemoryBackend,
  chromeStorageBackend,
  type MemoryEntry,
} from '../core/memory/store.ts';

function makeEntry(over: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'c1',
    conversationId: 'c1',
    sectionId: 's1',
    sessionUrl: 'https://www.doubao.com/chat/c1',
    assistantText: '你好',
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

describe('MemoryStore（内存后端）', () => {
  it('append 新增条目', async () => {
    const store = new MemoryStore(createMemoryBackend());
    const all = await store.append(makeEntry());
    expect(all.length).toBe(1);
    expect(all[0].assistantText).toBe('你好');
  });

  it('同 id 去重：更新文本但保留最早 createdAt', async () => {
    const store = new MemoryStore(createMemoryBackend());
    await store.append(makeEntry({ assistantText: '第一版', createdAt: 1000 }));
    const all = await store.append(makeEntry({ assistantText: '第二版', createdAt: 9999 }));
    expect(all.length).toBe(1);
    expect(all[0].assistantText).toBe('第二版');
    expect(all[0].createdAt).toBe(1000); // 最早创建时间保持不变
    expect(all[0].updatedAt).toBeGreaterThanOrEqual(9999);
  });

  it('超出上限 100 条丢弃最旧', async () => {
    const store = new MemoryStore(createMemoryBackend());
    for (let i = 0; i < 101; i++) {
      await store.append(
        makeEntry({ id: 'k' + i, conversationId: 'k' + i, assistantText: 't' + i }),
      );
    }
    const all = await store.getAll();
    expect(all.length).toBe(100);
    expect(all[0].id).toBe('k1'); // 最旧 k0 被丢弃
    expect(all[all.length - 1].id).toBe('k100');
  });

  it('clear 清空全部', async () => {
    const store = new MemoryStore(createMemoryBackend());
    await store.append(makeEntry());
    await store.clear();
    expect(await store.getAll()).toEqual([]);
  });

  it('脏数据（非数组）回退空数组而不崩溃', async () => {
    const store = new MemoryStore(
      createMemoryBackend({ doubao_pp_memory_v1: 'broken' }),
    );
    expect(await store.getAll()).toEqual([]);
  });
});

describe('MemoryStore（chrome.storage.local 后端桩）', () => {
  it('append/getAll 经 chrome.storage 往返', async () => {
    const map = new Map<string, unknown>();
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: async (k: string) =>
            map.has(k) ? { [k]: map.get(k) } : {},
          set: async (obj: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(obj)) map.set(k, v);
          },
        },
      },
    };
    const store = new MemoryStore(chromeStorageBackend);
    await store.append(makeEntry({ id: 'x', assistantText: 'A' }));
    const all = await store.getAll();
    expect(all.length).toBe(1);
    expect(all[0].assistantText).toBe('A');
    // 清理全局桩，避免污染其它测试文件
    delete (globalThis as any).chrome;
  });
});

// 兜底清理全局桩（chrome 后端测试已局部删除，此处保证无残留）
afterAll(() => {
  delete (globalThis as any).chrome;
});
