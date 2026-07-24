// 融合方案 §5（MCP）：工具定义注册表与上下文装配
//
// 设计要点（非检测 / 最小自洽）：
//   - 不移植 Deepseek-pp 整包 mcp 引擎（capability-lease / 传输 / 发现等）。
//     仅在 Doubao-pp 内建一个最小"工具定义注册表"：把启用的 MCP 工具 schema 作为
//     **上下文**注入请求体，让模型"知道有哪些工具可用"（路由 A，非检测）。
//   - 真正的 MCP 传输（连外部 MCP server，走 SSE/WebSocket）属于"路线 B 可被检测"，
//     按融合方案原则**默认禁用**；此处仅保留一个明确抛错的 DisabledMcpTransport 占位，
//     待用户在明确知晓代价时再启用（不在本步骤范围内）。
//   - 复用既有 StorageBackend 契约；MCP 工具定义为用户配置，体量小，走 chrome.storage.local
//   - 本文件顶部不访问 chrome 全局，沙盒导入不抛错

import type { StorageBackend } from '../memory/store.ts';
import { createMemoryBackend, chromeStorageBackend } from '../memory/store.ts';

/** JSON Schema 精简表示（仅取模型需要的字段） */
export interface McpToolInputSchema {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
  [k: string]: unknown;
}

export interface McpToolEntry {
  /** 稳定主键 */
  id: string;
  /** 工具名（注入上下文时作为标题） */
  name: string;
  /** 一句话说明 */
  description: string;
  /** 输入 schema（JSON Schema 子集）；仅作为上下文注入，不用于实际校验 */
  inputSchema: McpToolInputSchema;
  /** 是否启用（禁用则不被注入） */
  enabled: boolean;
  /** 来源标识（如 'user' / 'builtin'） */
  source: string;
  createdAt: number;
  updatedAt: number;
}

export const MCP_STORAGE_KEY = 'doubao_pp_mcp_v1';
const MAX_ENTRIES = 100;
const MAX_CONTEXT_CHARS = 2000;

/** MCP 工具存储：getAll / upsert / remove / clear，按 id 去重 */
export class McpStore {
  constructor(private readonly backend: StorageBackend = chromeStorageBackend) {}

  async getAll(): Promise<McpToolEntry[]> {
    const raw = await this.backend.get(MCP_STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw as McpToolEntry[];
  }

  async upsert(entry: McpToolEntry): Promise<McpToolEntry[]> {
    const list = await this.getAll();
    const now = Date.now();
    const idx = list.findIndex((e) => e.id === entry.id);
    const next: McpToolEntry = {
      ...entry,
      source: entry.source ?? 'user',
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
    };
    if (idx >= 0) {
      next.createdAt = list[idx].createdAt;
      list[idx] = next;
    } else {
      list.push(next);
    }
    const trimmed = list.slice(-MAX_ENTRIES);
    await this.backend.set(MCP_STORAGE_KEY, trimmed);
    return trimmed;
  }

  async remove(id: string): Promise<McpToolEntry[]> {
    const list = await this.getAll();
    const filtered = list.filter((e) => e.id !== id);
    await this.backend.set(MCP_STORAGE_KEY, filtered);
    return filtered;
  }

  async clear(): Promise<void> {
    await this.backend.set(MCP_STORAGE_KEY, []);
  }
}

/** 把启用工具拼为注入上下文（列出名称+说明+字段，作为模型可用的"工具清单"） */
export function composeMcpContext(tools: McpToolEntry[]): string {
  const enabled = tools.filter((t) => t.enabled && t.description.trim().length > 0);
  if (enabled.length === 0) return '';
  const header = '【可用工具】以下 MCP 工具已注册，可在回答中说明可调用它们（当前为上下文提示，未实际发起调用）：';
  const body = enabled
    .map((t) => {
      const props = t.inputSchema?.properties ?? {};
      const paramList = Object.entries(props)
        .map(([k, v]) => `    - ${k}(${v.type ?? 'any'}): ${v.description ?? ''}`)
        .join('\n');
      const required = (t.inputSchema?.required ?? []).length
        ? `  [必填: ${(t.inputSchema?.required ?? []).join(', ')}]`
        : '';
      return `- ${t.name}：${t.description}${required}\n${paramList}`;
    })
    .join('\n');
  const full = `${header}\n${body}`;
  return full.length > MAX_CONTEXT_CHARS ? full.slice(0, MAX_CONTEXT_CHARS) : full;
}

/**
 * MCP 传输占位（路线 B，默认禁用）。
 * 实际连接外部 MCP server 会发起自有签名请求（可被检测），因此默认不允许启用。
 * 仅作为架构占位，明确记录"未启用"的边界。
 */
export class DisabledMcpTransport {
  readonly enabled = false;
  async call(_toolId: string, _args: unknown): Promise<never> {
    throw new Error(
      '[Doubao-pp] MCP 传输为路线 B（可被检测），默认禁用；如需启用请在明确知晓代价后单独配置。',
    );
  }
}

/** 沙盒后端便捷构造（测试用） */
export function createMcpMemoryBackend(initial?: Record<string, unknown>): StorageBackend {
  return createMemoryBackend(initial);
}
