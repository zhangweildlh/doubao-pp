// 技能存储单测（node 环境，沙盒内存后端）
import { describe, it, expect } from 'vitest';
import {
  SkillStore,
  createSkillMemoryBackend,
  composeSkillContext,
  BUILTIN_SKILLS,
  SKILLS_STORAGE_KEY,
  type SkillEntry,
} from '../core/skills/store.ts';

function makeSkill(id: string, content: string, enabled = true): SkillEntry {
  return {
    id,
    name: `技能${id}`,
    description: `desc-${id}`,
    content,
    enabled,
    builtin: false,
    createdAt: 100,
    updatedAt: 100,
  };
}

describe('SkillStore', () => {
  it('getAll 脏数据防御：非数组回退空', async () => {
    const store = new SkillStore(createSkillMemoryBackend({ [SKILLS_STORAGE_KEY]: 'bad' }));
    expect(await store.getAll()).toEqual([]);
  });

  it('upsert 新增并去重（同 id 更新文本、保留 createdAt）', async () => {
    const store = new SkillStore(createSkillMemoryBackend());
    await store.upsert(makeSkill('u1', '内容A'));
    const list = await store.upsert(makeSkill('u1', '内容B'));
    expect(list.length).toBe(1);
    expect(list[0].content).toBe('内容B');
    expect(list[0].createdAt).toBe(100);
    expect(list[0].updatedAt).toBeGreaterThan(100);
  });

  it('remove 对不存在/内建 id 为 no-op（内建技能不入库，无法被删）', async () => {
    const store = new SkillStore(createSkillMemoryBackend());
    await store.upsert(makeSkill('u1', '用户技能'));
    // 内建技能不在用户库中，remove 其 id 为 no-op，不影响用户技能
    const after = await store.remove(BUILTIN_SKILLS[0].id);
    expect(after.find((e) => e.id === 'u1')).toBeDefined();
  });

  it('clear 清空全部', async () => {
    const store = new SkillStore(createSkillMemoryBackend());
    await store.upsert(makeSkill('u1', 'x'));
    await store.clear();
    expect(await store.getAll()).toEqual([]);
  });
});

describe('composeSkillContext', () => {
  it('合并内建+用户，过滤禁用，封顶', () => {
    const user: SkillEntry[] = [
      makeSkill('u1', '用户技能内容'),
      makeSkill('u2', '禁用技能', false),
    ];
    const ctx = composeSkillContext(user);
    expect(ctx).toContain('技能上下文');
    expect(ctx).toContain('用户技能内容'); // 用户启用技能
    expect(ctx).not.toContain('禁用技能'); // 禁用不注入
    // 内建启用的（简明扼要 / 结构化输出）应出现
    expect(ctx).toContain('简明扼要');
    expect(ctx).toContain('结构化输出');
    // 内建禁用的（代码注释用中文）不应出现
    expect(ctx).not.toContain('代码注释用中文');
  });

  it('用户禁用技能不注入，但内建启用技能仍注入', () => {
    const ctx = composeSkillContext([
      { ...makeSkill('u1', 'x', false), builtin: false },
    ]);
    expect(ctx).not.toContain('x'); // 禁用用户技能不注入
    expect(ctx).toContain('简明扼要'); // 内建启用技能仍注入
  });

  it('超长内容封顶', () => {
    const long = '技能内容'.repeat(2000);
    const ctx = composeSkillContext([makeSkill('u1', long)]);
    expect(ctx.length).toBeLessThanOrEqual(3000);
  });
});
