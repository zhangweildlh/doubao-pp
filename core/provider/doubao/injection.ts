// 融合方案 §5：注入上下文装配（记忆 + 技能 + MCP）
//
// 在路线 A 增强前，由 fetch-hook 经 provider.loadInjectionContext() 异步读取：
//   - 记忆（chrome.storage.local，取最近若干条，封顶防膨胀）
//   - 技能（chrome.storage.sync，已启用技能拼接）
//   - MCP（chrome.storage.local，已启用工具 schema 拼接为上下文）
// 合并为一段上下文文本返回，供 request-aug 注入用户文本之前。
//
// 失败即 fail-open：任一读取异常或环境无 chrome.storage 时返回空串，
// 增强退化为仅注入哨兵前缀，绝不阻断豆包正常对话。

import { MemoryStore, chromeStorageBackend, type MemoryEntry } from '../../memory/store.ts';
import {
  SkillStore,
  chromeSyncStorageBackend,
  composeSkillContext,
  type SkillEntry,
} from '../../skills/store.ts';
import {
  McpStore,
  composeMcpContext,
  type McpToolEntry,
} from '../../mcp/store.ts';
import { isAuthed } from './auth-state.ts';

const MAX_MEMORY_CHARS = 3000;
const MAX_MEMORY_ENTRIES = 5;

/** 把记忆条目拼为上下文（取最近 N 条，封顶） */
export function composeMemoryContext(entries: MemoryEntry[]): string {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const recent = [...entries]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_MEMORY_ENTRIES)
    .map((e) => e.assistantText)
    .filter((t) => t && t.trim().length > 0)
    .join('\n---\n');
  if (!recent) return '';
  const header = '【历史记忆】以下是与本会话相关的历史对话要点：';
  const full = `${header}\n${recent}`;
  return full.length > MAX_MEMORY_CHARS ? full.slice(0, MAX_MEMORY_CHARS) : full;
}

/**
 * 加载完整注入上下文。返回空串表示"无需注入额外上下文"（fail-open）。
 * 仅在已确认登录态且有 chrome.storage 时读取；其余情况直接空串。
 */
export async function loadInjectionContext(): Promise<string> {
  if (!isAuthed()) return '';
  if (typeof chrome === 'undefined' || !chrome.storage) return '';

  try {
    const memStore = new MemoryStore(chromeStorageBackend);
    const skillStore = new SkillStore(chromeSyncStorageBackend);
    const mcpStore = new McpStore(chromeStorageBackend);

    const [mem, skills, tools] = await Promise.all([
      memStore.getAll(),
      skillStore.getAll(),
      mcpStore.getAll(),
    ]);

    return buildContext(mem, skills, tools);
  } catch {
    return '';
  }
}

/** 纯函数：合并三类上下文（便于单测，不依赖 chrome） */
export function buildContext(
  mem: MemoryEntry[],
  skills: SkillEntry[],
  tools: McpToolEntry[],
): string {
  const parts: string[] = [];
  const m = composeMemoryContext(mem);
  if (m) parts.push(m);
  const s = composeSkillContext(skills);
  if (s) parts.push(s);
  const t = composeMcpContext(tools);
  if (t) parts.push(t);
  return parts.join('\n\n');
}
