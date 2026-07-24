// 项目上下文存储单测（node 环境，沙盒内存后端）
import { describe, it, expect } from 'vitest';
import {
  ProjectStore,
  PROJECTS_STORAGE_KEY,
  type ProjectInput,
} from '../core/project/store.ts';

function makeInput(over: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: '项目A',
    description: '一个归档项目',
    context: '背景资料',
    sessionUrls: ['https://www.doubao.com/chat/1'],
    ...over,
  };
}

describe('ProjectStore', () => {
  it('create 后 getAll 可见，且自动生成 id/时间戳', async () => {
    const store = new ProjectStore(ProjectStore.memoryBackend());
    const list = await store.create(makeInput());
    expect(list.length).toBe(1);
    expect(list[0].id).toMatch(/^proj-/);
    expect(list[0].createdAt).toBeGreaterThan(0);
    expect(list[0].updatedAt).toBe(list[0].createdAt);
    const all = await store.getAll();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('项目A');
  });

  it('getById 命中 / update 改字段', async () => {
    const store = new ProjectStore(ProjectStore.memoryBackend());
    const [created] = await store.create(makeInput());
    const got = await store.getById(created.id);
    expect(got!.name).toBe('项目A');
    const list = await store.update(created.id, { name: '改名', context: '新背景' });
    expect(list[0].name).toBe('改名');
    expect(list[0].context).toBe('新背景');
    expect(list[0].createdAt).toBe(created.createdAt); // 创建时间锁定
    // 不存在的 id 更新为 no-op
    expect(await store.update('ghost', { name: 'x' })).toEqual(list);
  });

  it('remove 删除后 getAll 不含该条', async () => {
    const store = new ProjectStore(ProjectStore.memoryBackend());
    await store.create(makeInput({ name: 'keep' }));
    const list2 = await store.create(makeInput({ name: 'drop' }));
    const drop = list2[list2.length - 1]; // create 返回全量列表，取末位即新条目
    const after = await store.remove(drop.id);
    expect(after.find((e) => e.id === drop.id)).toBeUndefined();
    expect(after.find((e) => e.name === 'keep')).toBeDefined();
    expect(after.length).toBe(1);
    expect((await store.getAll()).find((e) => e.id === drop.id)).toBeUndefined();
    // 不存在的 id 删除为 no-op
    expect((await store.remove('ghost')).length).toBe(1);
  });

  it('脏数据（非数组）回退空数组而不崩溃', async () => {
    const store = new ProjectStore(
      ProjectStore.memoryBackend({ [PROJECTS_STORAGE_KEY]: 'broken' }),
    );
    expect(await store.getAll()).toEqual([]);
  });
});
