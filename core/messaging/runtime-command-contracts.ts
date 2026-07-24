// Doubao-pp 运行时命令契约（P0）
//
// 同构于 Deepseek-pp 的 runtime-command-contracts.ts：保留全部契约原语
// （RuntimeCommandContract / 工厂函数 / owner 分类 / getRuntimeCommandOwner），
// 但仅声明 P0 阶段实际接入的命令子集，便于后续阶段近原样扩展。
//
// 命令分两类：
//   - typed-handler：由 background 的 RuntimeCommandRegistry 实际处理（请求/响应）。
//   - client-only：仅由 background 向 sidePanel 广播（如 *_UPDATED），不进注册表。

import type { MemoryEntry } from '../memory/store.ts';
import type { SkillEntry } from '../skills/store.ts';
import type { McpToolEntry } from '../mcp/store.ts';

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
  // —— P0 typed-handler 命令（由 background 实际处理） ——
  GET_MEMORIES: typedCommand('none', 'value'),
  GET_MCP_SERVERS: typedCommand('none', 'value'),
  GET_SKILLS: typedCommand('none', 'value'),

  // —— client-only 广播命令（background → sidePanel，不进注册表） ——
  MEMORIES_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
  MCP_SERVERS_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
  SKILLS_UPDATED: command('client-only', 'none', 'unrouted', 'none', 'declared-only', 'none'),
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

/**
 * 命令的「请求/响应」形状映射。registry 与 sidePanel 客户端据此推导类型。
 * 后续阶段扩展命令时，只需在此补充对应条目，即可保持与 Deepseek-pp 同构。
 */
export interface RuntimeCommandContracts {
  GET_MEMORIES: {
    request: { type: 'GET_MEMORIES' };
    response: MemoryEntry[];
  };
  GET_MCP_SERVERS: {
    request: { type: 'GET_MCP_SERVERS' };
    response: McpToolEntry[];
  };
  GET_SKILLS: {
    request: { type: 'GET_SKILLS' };
    response: SkillEntry[];
  };
  MEMORIES_UPDATED: {
    request: { type: 'MEMORIES_UPDATED' };
    response: { ok: true };
  };
  MCP_SERVERS_UPDATED: {
    request: { type: 'MCP_SERVERS_UPDATED' };
    response: { ok: true };
  };
  SKILLS_UPDATED: {
    request: { type: 'SKILLS_UPDATED' };
    response: { ok: true };
  };
}
