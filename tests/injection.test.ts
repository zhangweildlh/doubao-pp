// 注入上下文装配单测（node 环境）
//
// 覆盖：
//   - buildContext 纯函数（记忆+技能+MCP 合并，fail-open 无 chrome 不依赖）
//   - loadInjectionContext：经 chrome.storage 读取三类数据并合并；fail-open 守卫
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildContext, loadInjectionContext } from '../core/provider/doubao/injection.ts';
import { setAuthed } from '../core/provider/doubao/auth-state.ts';
import {
  MemoryStore,
  chromeStorageBackend,
  type MemoryEntry,
} from '../core/memory/store.ts';
import { SkillStore, chromeSyncStorageBackend, type SkillEntry } from '../core/skills/store.ts';
import { McpStore, type McpToolEntry } from '../core/mcp/store.ts';

function stubChrome() {
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

describe('buildContext（纯函数）', () => {
  const mem: MemoryEntry[] = [
    { id: 'c1', conversationId: 'c1', sectionId: null, sessionUrl: null, assistantText: '历史要点A', createdAt: 1, updatedAt: 1 },
  ];
  const skills: SkillEntry[] = [
    { id: 'u1', name: 'X', description: 'd', content: '技能X内容', enabled: true, builtin: false, createdAt: 1, updatedAt: 1 },
  ];
  const tools: McpToolEntry[] = [
    { id: 't1', name: 'tool1', description: '工具一', inputSchema: {}, enabled: true, source: 'user', createdAt: 1, updatedAt: 1 },
  ];

  it('合并三类上下文', () => {
    const ctx = buildContext(mem, skills, tools);
    expect(ctx).toContain('历史记忆');
    expect(ctx).toContain('历史要点A');
    expect(ctx).toContain('技能上下文');
    expect(ctx).toContain('技能X内容');
    expect(ctx).toContain('可用工具');
    expect(ctx).toContain('工具一');
  });

  it('空用户输入仍含内建技能上下文（builtin 默认启用）', () => {
    const ctx = buildContext([], [], []);
    expect(ctx).toContain('技能上下文');
    expect(ctx).toContain('简明扼要');
  });
});

describe('loadInjectionContext', () => {
  beforeEach(() => {
    setAuthed(true);
    stubChrome();
  });
  afterEach(() => {
    delete (globalThis as any).chrome;
    setAuthed(true);
  });

  it('从 chrome.storage 读取并合并（记忆 local / 技能 sync / MCP local）', async () => {
    await new MemoryStore(chromeStorageBackend).append({
      id: 'c1', conversationId: 'c1', sectionId: null, sessionUrl: null,
      assistantText: '历史要点A', createdAt: 1, updatedAt: 1,
    });
    await new SkillStore(chromeSyncStorageBackend).upsert({
      id: 'u1', name: 'X', description: 'd', content: '技能X内容',
      enabled: true, builtin: false, createdAt: 1, updatedAt: 1,
    });
    await new McpStore(chromeStorageBackend).upsert({
      id: 't1', name: 'tool1', description: '工具一', inputSchema: {},
      enabled: true, source: 'user', createdAt: 1, updatedAt: 1,
    });
    const ctx = await loadInjectionContext();
    expect(ctx).toContain('历史要点A');
    expect(ctx).toContain('技能X内容');
    expect(ctx).toContain('工具一');
  });

  it('无存储数据时仍含内建技能上下文（builtin 默认启用）', async () => {
    const ctx = await loadInjectionContext();
    expect(ctx).toContain('技能上下文');
    expect(ctx).toContain('简明扼要');
  });

  it('未确认登录态 fail-open 返回空串', async () => {
    setAuthed(false);
    const ctx = await loadInjectionContext();
    expect(ctx).toBe('');
  });

  it('无 chrome.storage 时 fail-open 返回空串', async () => {
    delete (globalThis as any).chrome;
    const ctx = await loadInjectionContext();
    expect(ctx).toBe('');
  });
});
