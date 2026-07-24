// 云同步后端单测（node 环境，桩 chrome.storage.sync）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  chromeSyncStorageBackend,
  selectBackendFor,
  DEFAULT_SYNC_POLICY,
} from '../core/sync/backend.ts';
import { createMemoryBackend } from '../core/memory/store.ts';

function stubSync() {
  const sync: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      sync: {
        get: async (k: string) => (k in sync ? { [k]: sync[k] } : {}),
        set: async (o: Record<string, unknown>) => {
          Object.assign(sync, o);
        },
      },
    },
  };
  return sync;
}

describe('chromeSyncStorageBackend', () => {
  beforeEach(() => stubSync());
  afterEach(() => delete (globalThis as any).chrome);

  it('get/set 经 chrome.storage.sync 往返', async () => {
    await chromeSyncStorageBackend.set('k', [1, 2, 3]);
    expect(await chromeSyncStorageBackend.get('k')).toEqual([1, 2, 3]);
  });

  it('无 chrome 环境时 get/set 安全（get 返回 undefined，set 不抛）', async () => {
    delete (globalThis as any).chrome;
    expect(await chromeSyncStorageBackend.get('k')).toBeUndefined();
    await expect(chromeSyncStorageBackend.set('k', 1)).resolves.toBeUndefined();
  });
});

describe('selectBackendFor', () => {
  const local = createMemoryBackend();

  it('策略启用且环境支持 sync → 返回同步后端', () => {
    stubSync();
    const b = selectBackendFor('skills', DEFAULT_SYNC_POLICY, local);
    expect(b).toBe(chromeSyncStorageBackend);
  });

  it('策略禁用 → 返回本地后端', () => {
    stubSync();
    const policy = { ...DEFAULT_SYNC_POLICY, skills: false };
    const b = selectBackendFor('skills', policy, local);
    expect(b).toBe(local);
  });

  it('环境无 chrome.storage.sync → 退回本地后端', () => {
    delete (globalThis as any).chrome;
    const b = selectBackendFor('skills', DEFAULT_SYNC_POLICY, local);
    expect(b).toBe(local);
  });

  afterEach(() => delete (globalThis as any).chrome);
});
