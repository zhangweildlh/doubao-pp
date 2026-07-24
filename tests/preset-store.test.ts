// 预设存储单测（node 环境，沙盒内存后端）
import { describe, it, expect } from 'vitest';
import {
  PresetStore,
  PRESETS_STORAGE_KEY,
  ACTIVE_PRESET_ID_KEY,
  type PresetInput,
} from '../core/preset/store.ts';

function makeInput(over: Partial<PresetInput> = {}): PresetInput {
  return {
    name: '严谨模式',
    description: '预设说明',
    context: '请严谨作答',
    params: { limit: 8000 },
    ...over,
  };
}

describe('PresetStore', () => {
  it('create 后 getAll 可见，且自动生成 id/时间戳', async () => {
    const store = new PresetStore(PresetStore.memoryBackend());
    const list = await store.create(makeInput());
    expect(list.length).toBe(1);
    expect(list[0].id).toMatch(/^preset-/);
    expect(list[0].createdAt).toBeGreaterThan(0);
    expect((await store.getAll()).length).toBe(1);
  });

  it('update 改字段；不存在 id 为 no-op', async () => {
    const store = new PresetStore(PresetStore.memoryBackend());
    const [created] = await store.create(makeInput());
    const list = await store.update(created.id, { name: '改名', context: '新上下文' });
    expect(list[0].name).toBe('改名');
    expect(list[0].createdAt).toBe(created.createdAt);
    expect(await store.update('ghost', { name: 'x' })).toEqual(list);
  });

  it('remove 删除；若删除的是激活预设则清空激活标记', async () => {
    const store = new PresetStore(PresetStore.memoryBackend());
    const l1 = await store.create(makeInput({ name: 'a' }));
    const p1 = l1[l1.length - 1]; // create 返回全量列表，取末位即新条目
    const l2 = await store.create(makeInput({ name: 'b' }));
    const p2 = l2[l2.length - 1];
    expect(await store.setActive(p1.id)).toBe(true);
    expect((await store.getActive())!.id).toBe(p1.id);
    const after = await store.remove(p1.id);
    expect(after.find((e) => e.id === p1.id)).toBeUndefined();
    expect(await store.getActiveId()).toBe(''); // 激活标记已清空
    // 删除剩余的 p2 后列表清空
    expect((await store.remove(p2.id)).length).toBe(0);
  });

  it('getActive / setActive 仅对存在的预设生效', async () => {
    const store = new PresetStore(PresetStore.memoryBackend());
    expect(await store.setActive('not-exist')).toBe(false); // 不存在 → 不生效
    expect(await store.getActive()).toBeUndefined();
    const [p] = await store.create(makeInput());
    expect(await store.setActive(p.id)).toBe(true);
    expect((await store.getActive())!.id).toBe(p.id);
  });

  it('脏数据（非数组）回退空数组而不崩溃', async () => {
    const store = new PresetStore(
      PresetStore.memoryBackend({ [PRESETS_STORAGE_KEY]: 'broken', [ACTIVE_PRESET_ID_KEY]: 'x' }),
    );
    expect(await store.getAll()).toEqual([]);
  });
});
