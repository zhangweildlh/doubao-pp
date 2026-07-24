// Doubao-pp 运行时命令契约（P0→P2 扩展）
//
// 同构于 Deepseek-pp 的 runtime-command-contracts.ts：保留全部契约原语
// （RuntimeCommandContract / 工厂函数 / owner 分类 / getRuntimeCommandOwner），
// 并补齐 13 页面所需的完整命令面（记忆/技能/MCP 写入类 + P1 的 Project/Preset/Settings CRUD）。
//
// 命令命名严格对齐 Deepseek-pp 的 runtime-command-contracts（SAVE_*/DELETE_*/CREATE_*_CONTEXT/
// GET_*_STATE/SET_ACTIVE_PRESET/GET_CONFIG 等），最大化「可搬运资产」低成本跟进能力（§8）。
//
// 命令分两类：
//   - typed-handler：由 background 的 RuntimeCommandRegistry 实际处理（请求/响应）。
//   - client-only：仅由 background 向 sidePanel 广播（如 *_UPDATED），不进注册表。

import type { Memory, NewMemory } from '../types.ts';
import type { SkillEntry } from '../skills/store.ts';
import type { McpToolEntry } from '../mcp/store.ts';
import type { ProjectInput, ProjectEntry } from '../project/store.ts';
import type { PresetInput, PresetEntry } from '../preset/store.ts';
import type { PluginSettings } from '../settings/store.ts';

export type RuntimeRequestBoundary =
  | 'none'
  | 'payload-cast'
  | 'payload-delegated'
  | 'payload-decoded';
export type RuntimeResponseFamily =
  | 'value'
  | 'nullable-value'
  | 'ack'
  | 'status'
  | 'domain-error'
  | 'status-or-domain-error'
  | 'status-or-domain-error-or-tool-result'
  | 'value-or-domain-error'
  | 'tool-result'
  | 'unrouted';
export type RuntimeErrorFamily = 'background-error' | 'tool-error' | 'none';
export type RuntimeCommandSurface = 'live-and-declared' | 'live-only' | 'declared-only';
export type RuntimePayloadPresence = 'none' | 'required' | 'optional';
export type RuntimeCommandOwner = 'typed-handler' | 'client-only';

export interface RuntimeCommandContract {
  owner: RuntimeCommandOwner;
  surface: RuntimeCommandSurface;
  request: {
    access: RuntimeRequestBoundary;
    presence: RuntimePayloadPresence;
  };
  response: RuntimeResponseFamily;
  error: RuntimeErrorFamily;
}

function command(
  owner: RuntimeCommandOwner,
  request: RuntimeRequestBoundary,
  response: RuntimeResponseFamily,
  error: RuntimeErrorFamily = 'background-error',
  surface: RuntimeCommandSurface = 'live-and-declared',
  presence: RuntimePayloadPresence = request === 'none' ? 'none' : 'required',
): RuntimeCommandContract {
  return { owner, surface, request: { access: request, presence }, response, error };
}

function typedCommand(
  request: RuntimeRequestBoundary,
  response: RuntimeResponseFamily,
  error: RuntimeErrorFamily = 'background-error',
  surface: RuntimeCommandSurface = 'live-and-declared',
  presence: RuntimePayloadPresence = request === 'none' ? 'none' : 'required',
): RuntimeCommandContract {
  return command('typed-handler', request, response, error, surface, presence);
}

export const RUNTIME_COMMAND_CONTRACTS = {
  // —— typed-handler 命令（由 background 实际处理） ——
  // 记忆
  GET_MEMORIES: typedCommand('none', 'value'),
  GET_MEMORY_BY_ID: typedCommand('payload-cast', 'nullable-value'),
  SAVE_MEMORY: typedCommand('payload-cast', 'ack'),
  DELETE_MEMORY: typedCommand('payload-cast', 'ack'),
  CLEAR_MEMORIES: typedCommand('none', 'ack'),
  // 技能
  GET_SKILLS: typedCommand('none', 'value'),
  SAVE_SKILL: typedCommand('payload-cast', 'ack'),
  DELETE_SKILL: typedCommand('payload-cast', 'ack'),
  // MCP
  GET_MCP_SERVERS: typedCommand('none', 'value'),
  GET_MCP_SERVER: typedCommand('payload-cast', 'nullable-value'),
  CREATE_MCP_SERVER: typedCommand('payload-cast', 'ack'),
  DELETE_MCP_SERVER: typedCommand('payload-cast', 'ack'),
  // 项目上下文
  CREATE_PROJECT_CONTEXT: typedCommand('payload-cast', 'ack'),
  GET_PROJECT_CONTEXT_STATE: typedCommand('none', 'value'),
  UPDATE_PROJECT_CONTEXT: typedCommand('payload-cast', 'ack'),
  DELETE_PROJECT_CONTEXT: typedCommand('payload-cast', 'ack'),
  // 预设
  GET_PRESETS: typedCommand('none', 'value'),
  GET_ACTIVE_PRESET: typedCommand('none', 'nullable-value'),
  SAVE_PRESET: typedCommand('payload-cast', 'ack'),
  DELETE_PRESET: typedCommand('payload-cast', 'ack'),
  SET_ACTIVE_PRESET: typedCommand('payload-cast', 'ack'),
  // 插件配置
  GET_CONFIG: typedCommand('none', 'value'),
  UPDATE_CONFIG: typedCommand('payload-cast', 'value'),
  RESET_CONFIG: typedCommand('none', 'value'),

  // —— client-only 广播命令（background → sidePanel，不进注册表） ——
  MEMORIES_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
  SKILLS_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
  MCP_SERVERS_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
  PROJECT_CONTEXT_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
  PRESETS_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
  SETTINGS_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
} as const satisfies Record<string, RuntimeCommandContract>;

export const TYPED_RUNTIME_COMMAND_TYPES = commandTypesOwnedBy('typed-handler');
export const CLIENT_ONLY_RUNTIME_COMMAND_TYPES = commandTypesOwnedBy('client-only');

export function getRuntimeCommandOwner(type: string): RuntimeCommandOwner | undefined {
  if (!Object.hasOwn(RUNTIME_COMMAND_CONTRACTS, type)) return undefined;
  return RUNTIME_COMMAND_CONTRACTS[type as keyof typeof RUNTIME_COMMAND_CONTRACTS].owner;
}

function commandTypesOwnedBy(owner: RuntimeCommandOwner): readonly string[] {
  return Object.freeze(Object.entries(RUNTIME_COMMAND_CONTRACTS)
    .filter(([, contract]) => contract.owner === owner)
    .map(([type]) => type));
}

/** 命令载荷类型：按 id 删除/查询（通用）。 */
export type DeleteByIdCommand = { id: string };
/**
 * 命令载荷类型：用户笔记型记忆 upsert（完整笔记条目，id 可选）。
 * id 存在时后台按 id 更新，否则新建；溯源字段可选（关联第2步对话记忆，但默认不依赖）。
 * 对应 core/types.ts 的 NewMemory（方案 A：与对话记忆 MemoryEntry 并存两套）。
 */
export type SaveMemoryPayload = NewMemory;
/** 命令载荷类型：技能 upsert（完整条目）。 */
export type SaveSkillCommand = SkillEntry;
/** 命令载荷类型：MCP 服务 upsert（完整条目）。 */
export type CreateMcpServerCommand = McpToolEntry;
/** 命令载荷类型：项目上下文创建（无需关心 id/时间戳）。 */
export type CreateProjectContextCommand = ProjectInput;
/** 命令载荷类型：项目上下文更新（带 id + 局部字段）。 */
export type SaveProjectContextCommand = { id: string } & ProjectInput;
/** 命令载荷类型：预设 upsert（id 存在则更新，否则创建）。 */
export type SavePresetCommand = { id?: string } & PresetInput;
/** 命令载荷类型：预设激活（按 id）。 */
export type SetActivePresetCommand = { id: string };
/** 命令载荷类型：配置局部更新。 */
export type UpdateConfigCommand = Partial<PluginSettings>;

/**
 * 命令的「请求/响应」形状映射。registry 与 sidePanel 客户端据此推导类型。
 * 扩展命令时，在此补充对应条目即可保持与 Deepseek-pp 同构。
 */
export interface RuntimeCommandContracts {
  GET_MEMORIES: { request: { type: 'GET_MEMORIES' }; response: Memory[] };
  GET_MEMORY_BY_ID: { request: { type: 'GET_MEMORY_BY_ID'; payload: DeleteByIdCommand }; response: Memory | null };
  SAVE_MEMORY: { request: { type: 'SAVE_MEMORY'; payload: SaveMemoryPayload }; response: { ok: true } };
  DELETE_MEMORY: { request: { type: 'DELETE_MEMORY'; payload: DeleteByIdCommand }; response: { ok: true } };
  CLEAR_MEMORIES: { request: { type: 'CLEAR_MEMORIES' }; response: { ok: true } };

  GET_SKILLS: { request: { type: 'GET_SKILLS' }; response: SkillEntry[] };
  SAVE_SKILL: { request: { type: 'SAVE_SKILL'; payload: SaveSkillCommand }; response: { ok: true } };
  DELETE_SKILL: { request: { type: 'DELETE_SKILL'; payload: DeleteByIdCommand }; response: { ok: true } };

  GET_MCP_SERVERS: { request: { type: 'GET_MCP_SERVERS' }; response: McpToolEntry[] };
  GET_MCP_SERVER: { request: { type: 'GET_MCP_SERVER'; payload: DeleteByIdCommand }; response: McpToolEntry | null };
  CREATE_MCP_SERVER: { request: { type: 'CREATE_MCP_SERVER'; payload: CreateMcpServerCommand }; response: { ok: true } };
  DELETE_MCP_SERVER: { request: { type: 'DELETE_MCP_SERVER'; payload: DeleteByIdCommand }; response: { ok: true } };

  CREATE_PROJECT_CONTEXT: { request: { type: 'CREATE_PROJECT_CONTEXT'; payload: CreateProjectContextCommand }; response: { ok: true } };
  GET_PROJECT_CONTEXT_STATE: { request: { type: 'GET_PROJECT_CONTEXT_STATE' }; response: ProjectEntry[] };
  UPDATE_PROJECT_CONTEXT: { request: { type: 'UPDATE_PROJECT_CONTEXT'; payload: SaveProjectContextCommand }; response: { ok: true } };
  DELETE_PROJECT_CONTEXT: { request: { type: 'DELETE_PROJECT_CONTEXT'; payload: DeleteByIdCommand }; response: { ok: true } };

  GET_PRESETS: { request: { type: 'GET_PRESETS' }; response: PresetEntry[] };
  GET_ACTIVE_PRESET: { request: { type: 'GET_ACTIVE_PRESET' }; response: PresetEntry | null };
  SAVE_PRESET: { request: { type: 'SAVE_PRESET'; payload: SavePresetCommand }; response: { ok: true } };
  DELETE_PRESET: { request: { type: 'DELETE_PRESET'; payload: DeleteByIdCommand }; response: { ok: true } };
  SET_ACTIVE_PRESET: { request: { type: 'SET_ACTIVE_PRESET'; payload: SetActivePresetCommand }; response: { ok: true } };

  GET_CONFIG: { request: { type: 'GET_CONFIG' }; response: PluginSettings };
  UPDATE_CONFIG: { request: { type: 'UPDATE_CONFIG'; payload: UpdateConfigCommand }; response: PluginSettings };
  RESET_CONFIG: { request: { type: 'RESET_CONFIG' }; response: PluginSettings };

  MEMORIES_UPDATED: { request: { type: 'MEMORIES_UPDATED' }; response: { ok: true } };
  SKILLS_UPDATED: { request: { type: 'SKILLS_UPDATED' }; response: { ok: true } };
  MCP_SERVERS_UPDATED: { request: { type: 'MCP_SERVERS_UPDATED' }; response: { ok: true } };
  PROJECT_CONTEXT_UPDATED: { request: { type: 'PROJECT_CONTEXT_UPDATED' }; response: { ok: true } };
  PRESETS_UPDATED: { request: { type: 'PRESETS_UPDATED' }; response: { ok: true } };
  SETTINGS_UPDATED: { request: { type: 'SETTINGS_UPDATED' }; response: { ok: true } };
}
