// Doubao-pp 后台运行时命令处理器（P0）
//
// 同构于 Deepseek-pp 的 createPersistenceRuntimeHandlers：用 define*RuntimeCommandHandler
// 注册 P0 的 typed-handler，并委托给现有 Doubao Store。后续阶段在此追加更多命令处理器即可。

import type { RuntimeMessageContext } from '../../core/messaging/runtime-boundary.ts';
import {
  definePayloadlessRuntimeCommandHandler,
  type RuntimeCommandHandler,
  type TypedRuntimeCommandResponse,
} from '../../core/messaging/runtime-command-registry.ts';
import { MemoryStore, chromeStorageBackend } from '../../core/memory/store.ts';
import { SkillStore, chromeSyncStorageBackend } from '../../core/skills/store.ts';
import { McpStore } from '../../core/mcp/store.ts';

export interface DoubaoRuntimeHandlerDependencies {
  memory: MemoryStore;
  mcp: McpStore;
  skill: SkillStore;
}

export function createDoubaoRuntimeHandlers(
  deps: DoubaoRuntimeHandlerDependencies,
): RuntimeCommandHandler[] {
  const getMemories = definePayloadlessRuntimeCommandHandler(
    'GET_MEMORIES',
    (_context: RuntimeMessageContext) =>
      deps.memory.getAll() as Promise<TypedRuntimeCommandResponse<'GET_MEMORIES'>>,
  );

  const getSkills = definePayloadlessRuntimeCommandHandler(
    'GET_SKILLS',
    (_context: RuntimeMessageContext) =>
      deps.skill.getAll() as Promise<TypedRuntimeCommandResponse<'GET_SKILLS'>>,
  );

  const getMcpServers = definePayloadlessRuntimeCommandHandler(
    'GET_MCP_SERVERS',
    (_context: RuntimeMessageContext) =>
      deps.mcp.getAll() as Promise<TypedRuntimeCommandResponse<'GET_MCP_SERVERS'>>,
  );

  return [getMemories, getSkills, getMcpServers];
}

// 便捷构造：用真机后端装配默认依赖。供 background.ts 直接调用。
export function createDefaultDoubaoRuntimeDependencies(): DoubaoRuntimeHandlerDependencies {
  return {
    memory: new MemoryStore(chromeStorageBackend),
    skill: new SkillStore(chromeSyncStorageBackend),
    mcp: new McpStore(chromeStorageBackend),
  };
}
