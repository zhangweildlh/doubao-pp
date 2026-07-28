// Doubao-pp 后台运行时命令处理器（P2）单元测试
//
// 目标：证明 P2 重写后的 24 个 typed-handler 真实可用，而非橡皮图章。
// 通过 createRuntimeCommandRegistry 的完整 dispatch 路径验证：
//   1. 注册表能构造成功（缺任一 typed 命令会抛错 → 反向证明 24 命令全覆盖）。
//   2. 各 CRUD 命令经 dispatch 后读写一致（round-trip）。
//   3. 每个 mutation 命令处理后按约定推送 *_UPDATED 广播。
//   4. 未知命令经注册表返回 {ok:false, error: runtime_command_unknown}。
//
// 不依赖 chrome 全局：全部 Store 注入 createMemoryBackend 沙盒后端。

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  createMemoryBackend,
  MemoryStore,
  type StorageBackend,
} from '../core/memory/store.ts';
import { UserMemoryStore } from '../core/memory/user-memory.ts';
import { SkillStore } from '../core/skills/store.ts';
import { McpStore } from '../core/mcp/store.ts';
import { ProjectStore } from '../core/project/store.ts';
import { PresetStore } from '../core/preset/store.ts';
import { SettingsStore } from '../core/settings/store.ts';
import { SavedStore } from '../core/saved/store.ts';
import { AutomationStore } from '../core/automation/store.ts';
import { BrowserControlStore } from '../core/browser-control/store.ts';
import { createDoubaoRuntimeHandlers } from '../entrypoints/background/runtime-handler.ts';
import { createRuntimeCommandRegistry } from '../core/messaging/runtime-command-registry.ts';
import type { RuntimeMessageContext } from '../core/messaging/runtime-boundary.ts';

const context: RuntimeMessageContext = {
  runtimeId: 'test-runtime',
  surface: 'extension_context',
  senderUrl: 'chrome-extension://test/sidepanel.html',
  senderOrigin: 'chrome-extension://test',
  documentSessionId: 'test-session',
};

function makeDeps(broadcast: (type: string) => void) {
  // 共享同一内存后端（各 Store 用不同 KEY，互不冲突），便于跨命令往返验证。
  const backend: StorageBackend = createMemoryBackend();
  return {
    memory: new MemoryStore(backend),
    userMemory: new UserMemoryStore(backend),
    skill: new SkillStore(backend),
    mcp: new McpStore(backend),
    project: new ProjectStore(backend),
    preset: new PresetStore(backend),
    settings: new SettingsStore(backend),
    saved: new SavedStore(backend),
    automation: new AutomationStore(backend),
    browserControl: new BrowserControlStore(backend),
    broadcast,
  };
}

describe('Doubao 运行时命令处理器（P2 覆盖）', () => {
  let broadcast: Mock<(type: string) => void>;
  let registry: ReturnType<typeof createRuntimeCommandRegistry>;

  beforeEach(() => {
    broadcast = vi.fn<(type: string) => void>();
    registry = createRuntimeCommandRegistry({
      typedHandlers: createDoubaoRuntimeHandlers(makeDeps(broadcast)),
    });
  });

  it('注册表构造成功即证明 34 个 typed-handler 全覆盖', () => {
    // createRuntimeCommandRegistry 内部会校验 TYPED_RUNTIME_COMMAND_TYPES 每个都有 handler，
    // 缺任一都会抛错使本测试失败。能走到这里即证明覆盖完整（24 原 + P6 新增 10）。
    expect(registry.types.length).toBe(34);
  });

  it('记忆（笔记型）：SAVE→GET→GET_BY_ID→DELETE→CLEAR 全链路 + 广播', async () => {
    expect(await registry.dispatch({ type: 'GET_MEMORIES' }, context)).toEqual([]);

    await registry.dispatch(
      {
        type: 'SAVE_MEMORY',
        payload: {
          type: 'user',
          name: '笔记1',
          content: '你好',
          tags: ['greeting'],
          pinned: false,
        },
      },
      context,
    );
    expect(broadcast).toHaveBeenCalledWith('MEMORIES_UPDATED');

    const list = (await registry.dispatch({ type: 'GET_MEMORIES' }, context)) as Array<{
      content: string;
      name: string;
      id: string;
      type: string;
    }>;
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe('你好');
    expect(list[0].name).toBe('笔记1');
    expect(list[0].type).toBe('user');
    const id = list[0].id;

    const byId = (await registry.dispatch(
      { type: 'GET_MEMORY_BY_ID', payload: { id } },
      context,
    )) as { id: string } | null;
    expect(byId?.id).toBe(id);

    // 按 id 更新（同一 SAVE_MEMORY 命令，id 存在走 update 分支）
    broadcast.mockClear();
    await registry.dispatch(
      {
        type: 'SAVE_MEMORY',
        payload: {
          id,
          type: 'user',
          name: '笔记1（改）',
          content: '你好世界',
          tags: ['greeting', 'edited'],
          pinned: true,
        },
      },
      context,
    );
    expect(broadcast).toHaveBeenCalledWith('MEMORIES_UPDATED');
    const updated = (await registry.dispatch(
      { type: 'GET_MEMORY_BY_ID', payload: { id } },
      context,
    )) as { name: string; content: string; pinned: boolean };
    expect(updated.name).toBe('笔记1（改）');
    expect(updated.content).toBe('你好世界');
    expect(updated.pinned).toBe(true);

    broadcast.mockClear();
    await registry.dispatch({ type: 'DELETE_MEMORY', payload: { id } }, context);
    expect(broadcast).toHaveBeenCalledWith('MEMORIES_UPDATED');
    expect(await registry.dispatch({ type: 'GET_MEMORIES' }, context)).toEqual([]);

    await registry.dispatch(
      { type: 'SAVE_MEMORY', payload: { type: 'feedback', name: 'f', content: 'a', tags: [], pinned: false } },
      context,
    );
    broadcast.mockClear();
    await registry.dispatch({ type: 'CLEAR_MEMORIES' }, context);
    expect(broadcast).toHaveBeenCalledWith('MEMORIES_UPDATED');
    expect(await registry.dispatch({ type: 'GET_MEMORIES' }, context)).toEqual([]);
  });

  it('技能：SAVE_SKILL 写入并广播 SKILLS_UPDATED', async () => {
    broadcast.mockClear();
    await registry.dispatch(
      {
        type: 'SAVE_SKILL',
        payload: {
          id: 's1',
          name: '简明',
          description: 'd',
          content: 'c',
          enabled: true,
          builtin: false,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      context,
    );
    expect(broadcast).toHaveBeenCalledWith('SKILLS_UPDATED');
    const skills = (await registry.dispatch({ type: 'GET_SKILLS' }, context)) as Array<{ id: string }>;
    expect(skills.map((s) => s.id)).toContain('s1');
  });

  it('MCP：CREATE_MCP_SERVER 写入并广播 MCP_SERVERS_UPDATED', async () => {
    broadcast.mockClear();
    await registry.dispatch(
      {
        type: 'CREATE_MCP_SERVER',
        payload: {
          id: 'm1',
          name: 'mc',
          description: 'd',
          inputSchema: { type: 'object' },
          enabled: true,
          source: 'user',
          createdAt: 1,
          updatedAt: 1,
        },
      },
      context,
    );
    expect(broadcast).toHaveBeenCalledWith('MCP_SERVERS_UPDATED');
    const tools = (await registry.dispatch({ type: 'GET_MCP_SERVERS' }, context)) as Array<{ id: string }>;
    expect(tools.map((t) => t.id)).toContain('m1');
  });

  it('项目：CREATE_PROJECT_CONTEXT 写入并广播 PROJECT_CONTEXT_UPDATED', async () => {
    broadcast.mockClear();
    await registry.dispatch(
      {
        type: 'CREATE_PROJECT_CONTEXT',
        payload: { name: '项目A', description: 'd', context: 'c', sessionUrls: [] },
      },
      context,
    );
    expect(broadcast).toHaveBeenCalledWith('PROJECT_CONTEXT_UPDATED');
    const projects = (await registry.dispatch(
      { type: 'GET_PROJECT_CONTEXT_STATE' },
      context,
    )) as Array<{ name: string }>;
    expect(projects.map((p) => p.name)).toContain('项目A');
  });

  it('预设：SAVE_PRESET 创建 → SET_ACTIVE_PRESET → GET_ACTIVE_PRESET 往返', async () => {
    broadcast.mockClear();
    await registry.dispatch(
      { type: 'SAVE_PRESET', payload: { name: '预设1', description: 'd', context: 'c', params: {} } },
      context,
    );
    expect(broadcast).toHaveBeenCalledWith('PRESETS_UPDATED');

    const presets = (await registry.dispatch({ type: 'GET_PRESETS' }, context)) as Array<{ id: string }>;
    expect(presets).toHaveLength(1);
    const pid = presets[0].id;

    broadcast.mockClear();
    await registry.dispatch({ type: 'SET_ACTIVE_PRESET', payload: { id: pid } }, context);
    expect(broadcast).toHaveBeenCalledWith('PRESETS_UPDATED');

    const active = (await registry.dispatch({ type: 'GET_ACTIVE_PRESET' }, context)) as
      | { id: string }
      | null;
    expect(active?.id).toBe(pid);
  });

  it('配置：GET_CONFIG 默认值 → UPDATE_CONFIG 广播 → RESET_CONFIG 复位', async () => {
    const cfg = (await registry.dispatch({ type: 'GET_CONFIG' }, context)) as {
      autoInject: boolean;
      injectionLimit: number;
      syncStrategy: string;
      theme: string;
    };
    expect(cfg).toEqual({
      autoInject: true,
      injectionLimit: 8000,
      syncStrategy: 'local',
      theme: 'system',
    });

    broadcast.mockClear();
    const updated = (await registry.dispatch(
      { type: 'UPDATE_CONFIG', payload: { injectionLimit: 4000 } },
      context,
    )) as { injectionLimit: number };
    expect(updated.injectionLimit).toBe(4000);
    expect(broadcast).toHaveBeenCalledWith('SETTINGS_UPDATED');

    const reset = (await registry.dispatch({ type: 'RESET_CONFIG' }, context)) as { injectionLimit: number };
    expect(reset.injectionLimit).toBe(8000);
  });

  it('未知命令返回 runtime_command_unknown（不被误判为广播）', async () => {
    const res = await registry.dispatch({ type: 'NON_EXISTENT_CMD' }, context);
    expect(res).toEqual({ ok: false, error: 'runtime_command_unknown' });
  });

  it('会话历史（P6）：空 → CLEAR 幂等 → 广播', async () => {
    expect(await registry.dispatch({ type: 'GET_CONVERSATION_HISTORY' }, context)).toEqual([]);
    broadcast.mockClear();
    await registry.dispatch({ type: 'CLEAR_CONVERSATION_HISTORY' }, context);
    expect(broadcast).toHaveBeenCalledWith('CONVERSATION_HISTORY_UPDATED');
  });

  it('收藏片段（P6）：SAVE→GET→DELETE 全链路 + 广播', async () => {
    broadcast.mockClear();
    await registry.dispatch(
      {
        type: 'SAVE_SAVED',
        payload: { title: '片段1', content: '内容', tags: ['t'] },
      },
      context,
    );
    expect(broadcast).toHaveBeenCalledWith('SAVED_UPDATED');
    const list = (await registry.dispatch({ type: 'GET_SAVED' }, context)) as Array<{ id: string; title: string }>;
    expect(list).toHaveLength(1);
    const id = list[0].id;

    broadcast.mockClear();
    await registry.dispatch({ type: 'DELETE_SAVED', payload: { id } }, context);
    expect(broadcast).toHaveBeenCalledWith('SAVED_UPDATED');
    expect(await registry.dispatch({ type: 'GET_SAVED' }, context)).toEqual([]);
  });

  it('自动化规则（P6）：CREATE→GET→DELETE 全链路 + 广播', async () => {
    broadcast.mockClear();
    await registry.dispatch(
      {
        type: 'CREATE_AUTOMATION',
        payload: { name: '规则A', description: 'd', enabled: true, trigger: 'manual', action: 'injectContext', actionParam: '' },
      },
      context,
    );
    expect(broadcast).toHaveBeenCalledWith('AUTOMATIONS_UPDATED');
    const list = (await registry.dispatch({ type: 'GET_AUTOMATIONS' }, context)) as Array<{ id: string }>;
    expect(list).toHaveLength(1);
    const id = list[0].id;

    broadcast.mockClear();
    await registry.dispatch({ type: 'DELETE_AUTOMATION', payload: { id } }, context);
    expect(broadcast).toHaveBeenCalledWith('AUTOMATIONS_UPDATED');
    expect(await registry.dispatch({ type: 'GET_AUTOMATIONS' }, context)).toEqual([]);
  });

  it('浏览器控制（P6）：默认 false → SET true → GET 往返', async () => {
    const initial = (await registry.dispatch({ type: 'GET_BROWSER_CONTROL' }, context)) as { enabled: boolean };
    expect(initial.enabled).toBe(false);
    broadcast.mockClear();
    await registry.dispatch({ type: 'SET_BROWSER_CONTROL', payload: { enabled: true } }, context);
    expect(broadcast).toHaveBeenCalledWith('BROWSER_CONTROL_UPDATED');
    const next = (await registry.dispatch({ type: 'GET_BROWSER_CONTROL' }, context)) as { enabled: boolean };
    expect(next.enabled).toBe(true);
  });
});
