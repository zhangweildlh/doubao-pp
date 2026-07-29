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
  MemoryStore,
  type MemoryEntry,
} from '../../core/memory/store.ts';
import {
  UserMemoryStore,
} from '../../core/memory/user-memory.ts';
import { SkillStore, chromeSyncStorageBackend, type SkillEntry } from '../../core/skills/store.ts';
import { McpStore, type McpToolEntry } from '../../core/mcp/store.ts';
import { ProjectStore, type ProjectInput, type ProjectEntry } from '../../core/project/store.ts';
import { PresetStore, type PresetInput, type PresetEntry } from '../../core/preset/store.ts';
import { SettingsStore, type PluginSettings, type SettingsPatch } from '../../core/settings/store.ts';
import { SavedStore, type SavedSnippet, type SavedSnippetInput } from '../../core/saved/store.ts';
import { AutomationStore, type AutomationRule, type AutomationRuleInput } from '../../core/automation/store.ts';
import { BrowserControlStore } from '../../core/browser-control/store.ts';
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
  SaveSavedCommand,
  CreateAutomationCommand,
  SetBrowserControlCommand,
} from '../../core/messaging/runtime-command-contracts.ts';

export interface DoubaoRuntimeHandlerDependencies {
  /** 对话记忆（自动抓取，响应会话历史命令，与笔记型记忆并存两套） */
  memory: MemoryStore;
  /** 用户笔记型记忆（方案 A：与对话记忆 MemoryEntry 并存两套） */
  userMemory: UserMemoryStore;
  mcp: McpStore;
  skill: SkillStore;
  project: ProjectStore;
  preset: PresetStore;
  settings: SettingsStore;
  /** 收藏片段（P6） */
  saved: SavedStore;
  /** 自动化规则（P6） */
  automation: AutomationStore;
  /** 浏览器控制开关（P6，默认关闭） */
  browserControl: BrowserControlStore;
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

  // —— 会话历史（P6：复用对话记忆 store） ——
  const getConversationHistory = definePayloadlessRuntimeCommandHandler(
    'GET_CONVERSATION_HISTORY',
    (_context: RuntimeMessageContext) =>
      deps.memory.getAll() as Promise<TypedRuntimeCommandResponse<'GET_CONVERSATION_HISTORY'>>,
  );

  const clearConversationHistory = definePayloadlessRuntimeCommandHandler(
    'CLEAR_CONVERSATION_HISTORY',
    async () => {
      await deps.memory.clear();
      emit('CONVERSATION_HISTORY_UPDATED');
      return { ok: true };
    },
  );

  // —— 收藏片段（P6） ——
  const getSaved = definePayloadlessRuntimeCommandHandler(
    'GET_SAVED',
    (_context: RuntimeMessageContext) =>
      deps.saved.getAll() as Promise<TypedRuntimeCommandResponse<'GET_SAVED'>>,
  );

  const saveSaved = defineRuntimeCommandHandler<'SAVE_SAVED', SaveSavedCommand>({
    type: 'SAVE_SAVED',
    decode: (message) => message.payload as SaveSavedCommand,
    handle: async (request) => {
      const { id, ...input } = request;
      if (id) {
        await deps.saved.update(id, input);
      } else {
        await deps.saved.create(input);
      }
      emit('SAVED_UPDATED');
      return { ok: true };
    },
  });

  const deleteSaved = defineRuntimeCommandHandler<'DELETE_SAVED', DeleteByIdCommand>({
    type: 'DELETE_SAVED',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => {
      await deps.saved.remove(request.id);
      emit('SAVED_UPDATED');
      return { ok: true };
    },
  });

  // —— 自动化规则（P6） ——
  const getAutomations = definePayloadlessRuntimeCommandHandler(
    'GET_AUTOMATIONS',
    (_context: RuntimeMessageContext) =>
      deps.automation.getAll() as Promise<TypedRuntimeCommandResponse<'GET_AUTOMATIONS'>>,
  );

  const createAutomation = defineRuntimeCommandHandler<'CREATE_AUTOMATION', CreateAutomationCommand>({
    type: 'CREATE_AUTOMATION',
    decode: (message) => message.payload as CreateAutomationCommand,
    handle: async (request) => {
      const { id, ...input } = request;
      // 幂等 upsert 语义（Low5）：命令名虽为 CREATE_AUTOMATION，但 payload 携带 id 时按该 id 更新，
      // 否则新建。v1.11.6.2 自动化为最小闭环（无运行时启停，enabled 由创建决定），前端 save 恒不传 id，
      // 故实际路径恒为新创建；保留 upsert 仅为契约最小兼容，不破坏 §8 命令命名同构。
      if (id) {
        await deps.automation.update(id, input);
      } else {
        await deps.automation.create(input);
      }
      emit('AUTOMATIONS_UPDATED');
      return { ok: true };
    },
  });

  const deleteAutomation = defineRuntimeCommandHandler<'DELETE_AUTOMATION', DeleteByIdCommand>({
    type: 'DELETE_AUTOMATION',
    decode: (message) => message.payload as DeleteByIdCommand,
    handle: async (request) => {
      await deps.automation.remove(request.id);
      emit('AUTOMATIONS_UPDATED');
      return { ok: true };
    },
  });

  // —— 浏览器控制（P6，默认关闭） ——
  const getBrowserControl = definePayloadlessRuntimeCommandHandler(
    'GET_BROWSER_CONTROL',
    (_context: RuntimeMessageContext) =>
      deps.browserControl.getEnabled().then((enabled) => ({ enabled })) as Promise<
        TypedRuntimeCommandResponse<'GET_BROWSER_CONTROL'>
      >,
  );

  const setBrowserControl = defineRuntimeCommandHandler<'SET_BROWSER_CONTROL', SetBrowserControlCommand>({
    type: 'SET_BROWSER_CONTROL',
    decode: (message) => message.payload as SetBrowserControlCommand,
    handle: async (request) => {
      await deps.browserControl.setEnabled(request.enabled);
      emit('BROWSER_CONTROL_UPDATED');
      return { ok: true };
    },
  });

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
    // 会话历史（P6）
    getConversationHistory,
    clearConversationHistory,
    // 收藏片段（P6）
    getSaved,
    saveSaved,
    deleteSaved,
    // 自动化规则（P6）
    getAutomations,
    createAutomation,
    deleteAutomation,
    // 浏览器控制（P6）
    getBrowserControl,
    setBrowserControl,
  ];
}

// 便捷构造：用真机后端装配默认依赖。供 background.ts 直接调用。
export function createDefaultDoubaoRuntimeDependencies(
  broadcast: (type: string) => void,
): DoubaoRuntimeHandlerDependencies {
  return {
    memory: new MemoryStore(chromeStorageBackend),
    userMemory: new UserMemoryStore(chromeStorageBackend),
    skill: new SkillStore(chromeSyncStorageBackend),
    mcp: new McpStore(chromeStorageBackend),
    project: new ProjectStore(chromeStorageBackend),
    preset: new PresetStore(chromeStorageBackend),
    settings: new SettingsStore(chromeStorageBackend),
    saved: new SavedStore(chromeStorageBackend),
    automation: new AutomationStore(chromeStorageBackend),
    browserControl: new BrowserControlStore(chromeStorageBackend),
    broadcast,
  };
}
