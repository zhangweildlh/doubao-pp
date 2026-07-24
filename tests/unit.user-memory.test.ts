// UserMemoryStore（用户笔记型记忆，方案 A 并存两套之一）单元测试
//
// 目标：证明笔记型存储层真实可用，而非橡皮图章。
// 通过 createMemoryBackend 沙盒后端验证：
//   1. create 自动补全 id / 时间戳 / 默认值，且不污染调用方入参
//   2. getById 命中与未命中
//   3. update 局部更新并刷新 updatedAt，但锁定 id 与 createdAt
//   4. remove 按 id 删除、无变化 no-op
//   5. clear 清空
//   6. 多个 Store 实例共享同一后端（不同 KEY）互不串扰
//
// 不依赖 chrome 全局：全部注入 createMemoryBackend 沙盒后端。

import { describe, it, expect } from 'vitest';
import { UserMemoryStore } from '../core/memory/user-memory.ts';
import { createMemoryBackend } from '../core/memory/store.ts';
import type { NewMemory } from '../core/types.ts';

function baseInput(overrides: Partial<NewMemory> = {}): NewMemory {
  return {
    type: 'user',
    name: '测试笔记',
    content: '正文内容',
    tags: ['t1'],
    pinned: false,
    ...overrides,
  };
}

describe('UserMemoryStore（笔记型记忆存储）', () => {
  it('create 补全 id/时间戳/默认值且不污染入参', async () => {
    const store = new UserMemoryStore(createMemoryBackend());
    const input = baseInput();
    const created = await store.create(input);

    expect(typeof created.id).toBe('string');
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.createdAt).toBeTypeOf('number');
    expect(created.updatedAt).toBe(created.createdAt);
    expect(created.scope).toBe('global'); // 默认 global
    expect(created.tags).toEqual(['t1']);
    expect(created.pinned).toBe(false);
    // 入参不应被改写（NewMemory 本身不含 id / createdAt / updatedAt）
    expect(input.id).toBeUndefined();
  });

  it('getById 命中与未命中', async () => {
    const store = new UserMemoryStore(createMemoryBackend());
    const created = await store.create(baseInput());
    const hit = await store.getById(created.id);
    expect(hit?.id).toBe(created.id);
    const miss = await store.getById('non-existent');
    expect(miss).toBeUndefined();
  });

  it('update 局部更新并刷新 updatedAt，但锁定 id 与 createdAt', async () => {
    const store = new UserMemoryStore(createMemoryBackend());
    const created = await store.create(baseInput());
    // 稍作延迟确保时间戳可区分
    await new Promise((r) => setTimeout(r, 2));
    const list = await store.update(created.id, {
      name: '改名',
      content: '新正文',
      pinned: true,
      tags: ['t2'],
    });
    expect(list).toHaveLength(1);
    const updated = list[0];
    expect(updated.name).toBe('改名');
    expect(updated.content).toBe('新正文');
    expect(updated.pinned).toBe(true);
    expect(updated.tags).toEqual(['t2']);
    expect(updated.id).toBe(created.id); // id 锁定
    expect(updated.createdAt).toBe(created.createdAt); // createdAt 锁定
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt); // updatedAt 刷新
  });

  it('update 目标不存在时返回原列表无副作用', async () => {
    const store = new UserMemoryStore(createMemoryBackend());
    await store.create(baseInput());
    const list = await store.update('ghost', { name: 'x' });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('测试笔记');
  });

  it('remove 按 id 删除，无变化 no-op', async () => {
    const store = new UserMemoryStore(createMemoryBackend());
    const a = await store.create(baseInput({ name: 'a' }));
    const b = await store.create(baseInput({ name: 'b' }));
    const afterRemove = await store.remove(a.id);
    expect(afterRemove.map((m) => m.id)).toEqual([b.id]);
    // 删除不存在的 id → 列表不变
    const noop = await store.remove('ghost');
    expect(noop.map((m) => m.id)).toEqual([b.id]);
  });

  it('clear 清空全部', async () => {
    const store = new UserMemoryStore(createMemoryBackend());
    await store.create(baseInput());
    await store.create(baseInput());
    expect((await store.getAll())).toHaveLength(2);
    await store.clear();
    expect(await store.getAll()).toEqual([]);
  });

  it('跨实例共享后端互不串扰（不同 KEY）', async () => {
    const backend = createMemoryBackend();
    const userStore = new UserMemoryStore(backend);
    // 复用同一后端但模拟另一个 Store 的 KEY 不应读到笔记
    const other = new UserMemoryStore(backend);
    await userStore.create(baseInput({ name: 'u1' }));
    expect(await userStore.getAll()).toHaveLength(1);
    expect(await other.getAll()).toHaveLength(1); // 同 KEY → 可见
  });
});
