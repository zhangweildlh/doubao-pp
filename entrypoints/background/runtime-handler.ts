// Doubao-pp 后台运行时命令处理器（P0→P2 扩展）
//
// 同构于 Deepseek-pp 的 createPersistenceRuntimeHandlers：用 define*RuntimeCommandHandler
// 注册 typed-handler，并委托给现有 Doubao Store。P2 在 P0 基础上补全记忆/技能/MCP 的
// 写入类命令，并接入 P1 新增的 ProjectStore / PresetStore / SettingsStore，覆盖 13 页面
// 所需的完整 CRUD 命令面；mutation 后通过 broadcast 推送 *_UPDATED 广播，供 sidePanel 响应式刷新。
//
// 命令命名对齐 Deepseek-pp 的 runtime-command-contracts（SAVE_*/DELETE_*/CREATE_*_CONTEXT/
// GET_*_STATE/SET_ACTIVE_PRESET/GET_CONFIG 等），最大化「可搬运资产」低成本跟进能力（§8）。

import type { RuntimeMessageContext } from '../../core/messaging/runtime-boundary.ts';
import {
  definePayloadlessRuntimeCommandHandler,
  defineRuntimeCommandHandler,
  type RuntimeCommandHandler,
  type TypedRuntimeCommandResponse,
} from '../../core/messaging/runtime-command-registry.ts';
import {
  chromeStorageBackend,
} from '../../core/memory/store.ts';
import {
  UserMemoryStore,
} from '../../core/memory/user-memory.ts';
import { SkillStore, chromeSyncStorageBackend, type SkillEntry } from '../../core/skills/store.ts';
import { McpStore, type McpToolEntry } from '../../core/mcp/store.ts';
import { ProjectStore, type ProjectInput, type ProjectEntry } from '../../core/project/store.ts';
import { PresetStore, type PresetInput, type PresetEntry } from '../../core/preset/store.ts';
import { SettingsStore, type PluginSettings, type SettingsPatch } from '../../core/settings/store.ts';
import type {
  SaveMemoryPayload,
  DeleteByIdCommand,
  SaveSkillCommand,
  CreateMcpServerCommand,
  CreateProjectContextCommand,
  SaveProjectContextCommand,
  SavePresetCommand,
  SetActivePresetCommand,
  UpdateConfigCommand,
} from '../../core/messaging/runtime-command-contracts.ts';

export interface DoubaoRuntimeHandlerDependencies {
  /** 用户笔记型记忆（方案 A：与对话记忆 MemoryEntry 并存两套） */
  userMemory: UserMemoryStore;
  mcp: McpStore;
  skill: SkillStore;
  project: ProjectStore;
  preset: PresetStore;
  settings: SettingsStore;
  /** 变更广播（必填；后台接线时注入 broadcastRuntimeUpdate 封装，测试可注入 no-op 捕获）。 */
  broadcast: (type: string) => void;
}

export function createDoubaoRuntimeHandlers(
  deps: DoubaoRuntimeHandlerDependencies,
): RuntimeCommandHandler[] {
  const emit = (type: string): void => {
    deps.broadcast(type);
  };

  // —— 记忆（用户笔记型，方案 A：与对话记忆 MemoryEntry 并存两套） ——
  const getMemories = definePayloadlessRuntimeCommandHandler(
    'GET_MEMORIES',
    (_context: RuntimeMessageContext) =>
      deps.userMemory.getAll() as Promise<TypedRuntimeCommandResponse<'GET_MEMORIES'>>,
  );

  const getMemoryById = defineRuntimeCommandHandler<'GET_MEMORY_BY_ID', DeleteByIdCommand>({
    type: 'GET_MEMORY_BY_ID',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => (await deps.userMemory.getById(request.id)) ?? null,
  });

  const saveMemory = defineRuntimeCommandHandler<'SAVE_MEMORY', SaveMemoryPayload>({
    type: 'SAVE_MEMORY',
    decode: (message) => message.payload as SaveMemoryPayload,
    handle: async (request) => {
      // id 存在 → 按 id 局部更新；否则新建（id 由 UserMemoryStore 生成）
      if (request.id) {
        const { id, ...patch } = request;
        await deps.userMemory.update(id, patch);
      } else {
        await deps.userMemory.create(request);
      }
      emit('MEMORIES_UPDATED');
      return { ok: true };
    },
  });

  const deleteMemory = defineRuntimeCommandHandler<'DELETE_MEMORY', DeleteByIdCommand>({
    type: 'DELETE_MEMORY',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => {
      await deps.userMemory.remove(request.id);
      emit('MEMORIES_UPDATED');
      return { ok: true };
    },
  });

  const clearMemories = definePayloadlessRuntimeCommandHandler(
    'CLEAR_MEMORIES',
    async () => {
      await deps.userMemory.clear();
      emit('MEMORIES_UPDATED');
      return { ok: true };
    },
  );

  // —— 技能 ——
  const getSkills = definePayloadlessRuntimeCommandHandler(
    'GET_SKILLS',
    (_context: RuntimeMessageContext) =>
      deps.skill.getAll() as Promise<TypedRuntimeCommandResponse<'GET_SKILLS'>>,
  );

  const saveSkill = defineRuntimeCommandHandler<'SAVE_SKILL', SaveSkillCommand>({
    type: 'SAVE_SKILL',
    decode: (message) => message.payload as SaveSkillCommand,
    handle: async (request) => {
      await deps.skill.upsert(request);
      emit('SKILLS_UPDATED');
      return { ok: true };
    },
  });

  const deleteSkill = defineRuntimeCommandHandler<'DELETE_SKILL', DeleteByIdCommand>({
    type: 'DELETE_SKILL',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => {
      await deps.skill.remove(request.id);
      emit('SKILLS_UPDATED');
      return { ok: true };
    },
  });

  // —— MCP ——
  const getMcpServers = definePayloadlessRuntimeCommandHandler(
    'GET_MCP_SERVERS',
    (_context: RuntimeMessageContext) =>
      deps.mcp.getAll() as Promise<TypedRuntimeCommandResponse<'GET_MCP_SERVERS'>>,
  );

  const getMcpServer = defineRuntimeCommandHandler<'GET_MCP_SERVER', DeleteByIdCommand>({
    type: 'GET_MCP_SERVER',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => {
      const list = await deps.mcp.getAll();
      return list.find((e) => e.id === request.id) ?? null;
    },
  });

  const createMcpServer = defineRuntimeCommandHandler<'CREATE_MCP_SERVER', CreateMcpServerCommand>({
    type: 'CREATE_MCP_SERVER',
    decode: (message) => message.payload as CreateMcpServerCommand,
    handle: async (request) => {
      await deps.mcp.upsert(request);
      emit('MCP_SERVERS_UPDATED');
      return { ok: true };
    },
  });

  const deleteMcpServer = defineRuntimeCommandHandler<'DELETE_MCP_SERVER', DeleteByIdCommand>({
    type: 'DELETE_MCP_SERVER',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => {
      await deps.mcp.remove(request.id);
      emit('MCP_SERVERS_UPDATED');
      return { ok: true };
    },
  });

  // —— 项目上下文 ——
  const createProjectContext = defineRuntimeCommandHandler<'CREATE_PROJECT_CONTEXT', CreateProjectContextCommand>({
    type: 'CREATE_PROJECT_CONTEXT',
    decode: (message) => message.payload as CreateProjectContextCommand,
    handle: async (request) => {
      await deps.project.create(request);
      emit('PROJECT_CONTEXT_UPDATED');
      return { ok: true };
    },
  });

  const getProjectContextState = definePayloadlessRuntimeCommandHandler(
    'GET_PROJECT_CONTEXT_STATE',
    (_context: RuntimeMessageContext) =>
      deps.project.getAll() as Promise<TypedRuntimeCommandResponse<'GET_PROJECT_CONTEXT_STATE'>>,
  );

  const updateProjectContext = defineRuntimeCommandHandler<'UPDATE_PROJECT_CONTEXT', SaveProjectContextCommand>({
    type: 'UPDATE_PROJECT_CONTEXT',
    decode: (message) => message.payload as SaveProjectContextCommand,
    handle: async (request) => {
      const { id, ...patch } = request;
      await deps.project.update(id, patch);
      emit('PROJECT_CONTEXT_UPDATED');
      return { ok: true };
    },
  });

  const deleteProjectContext = defineRuntimeCommandHandler<'DELETE_PROJECT_CONTEXT', DeleteByIdCommand>({
    type: 'DELETE_PROJECT_CONTEXT',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => {
      await deps.project.remove(request.id);
      emit('PROJECT_CONTEXT_UPDATED');
      return { ok: true };
    },
  });

  // —— 预设 ——
  const getPresets = definePayloadlessRuntimeCommandHandler(
    'GET_PRESETS',
    (_context: RuntimeMessageContext) =>
      deps.preset.getAll() as Promise<TypedRuntimeCommandResponse<'GET_PRESETS'>>,
  );

  const getActivePreset = definePayloadlessRuntimeCommandHandler(
    'GET_ACTIVE_PRESET',
    async () => (await deps.preset.getActive()) ?? null,
  );

  const savePreset = defineRuntimeCommandHandler<'SAVE_PRESET', SavePresetCommand>({
    type: 'SAVE_PRESET',
    decode: (message) => message.payload as SavePresetCommand,
    handle: async (request) => {
      const { id, ...input } = request;
      if (id) await deps.preset.update(id, input);
      else await deps.preset.create(input);
      emit('PRESETS_UPDATED');
      return { ok: true };
    },
  });

  const deletePreset = defineRuntimeCommandHandler<'DELETE_PRESET', DeleteByIdCommand>({
    type: 'DELETE_PRESET',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => {
      await deps.preset.remove(request.id);
      emit('PRESETS_UPDATED');
      return { ok: true };
    },
  });

  const setActivePreset = defineRuntimeCommandHandler<'SET_ACTIVE_PRESET', SetActivePresetCommand>({
    type: 'SET_ACTIVE_PRESET',
    decode: (message) => message.payload as SetActivePresetCommand,
    handle: async (request) => {
      await deps.preset.setActive(request.id);
      emit('PRESETS_UPDATED');
      return { ok: true };
    },
  });

  // —— 插件参数配置 ——
  const getConfig = definePayloadlessRuntimeCommandHandler(
    'GET_CONFIG',
    (_context: RuntimeMessageContext) =>
      deps.settings.getSettings() as Promise<TypedRuntimeCommandResponse<'GET_CONFIG'>>,
  );

  const updateConfig = defineRuntimeCommandHandler<'UPDATE_CONFIG', UpdateConfigCommand>({
    type: 'UPDATE_CONFIG',
    decode: (message) => message.payload as UpdateConfigCommand,
    handle: async (request) => {
      const next = await deps.settings.updateSettings(request);
      emit('SETTINGS_UPDATED');
      return next;
    },
  });

  const resetConfig = definePayloadlessRuntimeCommandHandler(
    'RESET_CONFIG',
    (_context: RuntimeMessageContext) =>
      deps.settings.resetSettings() as Promise<TypedRuntimeCommandResponse<'RESET_CONFIG'>>,
  );

  return [
    // 记忆
    getMemories,
    getMemoryById,
    saveMemory,
    deleteMemory,
    clearMemories,
    // 技能
    getSkills,
    saveSkill,
    deleteSkill,
    // MCP
    getMcpServers,
    getMcpServer,
    createMcpServer,
    deleteMcpServer,
    // 项目
    createProjectContext,
    getProjectContextState,
    updateProjectContext,
    deleteProjectContext,
    // 预设
    getPresets,
    getActivePreset,
    savePreset,
    deletePreset,
    setActivePreset,
    // 设置
    getConfig,
    updateConfig,
    resetConfig,
  ];
}

// 便捷构造：用真机后端装配默认依赖。供 background.ts 直接调用。
export function createDefaultDoubaoRuntimeDependencies(
  broadcast: (type: string) => void,
): DoubaoRuntimeHandlerDependencies {
  return {
    userMemory: new UserMemoryStore(chromeStorageBackend),
    skill: new SkillStore(chromeSyncStorageBackend),
    mcp: new McpStore(chromeStorageBackend),
    project: new ProjectStore(chromeStorageBackend),
    preset: new PresetStore(chromeStorageBackend),
    settings: new SettingsStore(chromeStorageBackend),
    broadcast,
  };
}
