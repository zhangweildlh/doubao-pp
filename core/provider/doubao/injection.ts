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
//
// 第 6 步健壮增强（解决 360Chrome MAIN world 无 chrome.storage 的遗留风险）：
//   loadInjectionContext 优先直读 MAIN world 的 chrome.storage；
//   若 MAIN world 缺失 chrome.storage（360Chrome 实测 chrome.runtime 缺失，
//   chrome.storage 大概率同样缺失），则经 window.postMessage 跨世界请求
//   ISOLATED relay（其具完整 chrome.storage）回读上下文，relay 原路返回。
//   两路径对标准 Chrome 与 360Chrome 均健壮（标准 Chrome 走直读快速路径）。

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

/** 跨世界上下文回读通道（MAIN world ↔ ISOLATED relay，借 window.postMessage 跨 realm） */
export const CTX_REQ_CHANNEL = '__doubaoPpCtxReq';
export const CTX_RESP_CHANNEL = '__doubaoPpCtxResp';
/** relay 响应超时（ms）：同文档 postMessage 往返 <1ms，1s 足以覆盖扩展冷启动抖动 */
const RELAY_TIMEOUT_MS = 1000;

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

/** MAIN world 是否具备直读 chrome.storage 能力（标准 Chrome 具此；360Chrome MAIN world 不具） */
export function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    !!chrome.storage &&
    typeof chrome.storage.local?.get === 'function'
  );
}

/**
 * 直读并合并三类上下文（不含 auth 门禁，由调用方决定）。
 * fail-open：无 chrome.storage 或读取异常时返回空串。
 */
export async function readInjectionContextString(): Promise<string> {
  if (!hasChromeStorage()) return '';
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

/**
 * MAIN world 入口：优先直读 chrome.storage；360Chrome MAIN world 无 chrome.storage
 * 时经 ISOLATED relay 回读（relay 具完整 chrome.storage）。fail-open 返回空串。
 */
export async function loadInjectionContext(): Promise<string> {
  if (!isAuthed()) return '';
  if (hasChromeStorage()) return readInjectionContextString();
  return requestContextViaRelay();
}

/**
 * 跨世界回读：经 window.postMessage 向 ISOLATED relay 发请求，relay 读 chrome.storage
 * 后原路返回上下文字符串。超时或无扩展环境（纯单测）fail-open 返回空串。
 */
function requestContextViaRelay(): Promise<string> {
  return new Promise((resolve) => {
    // fail-open 守卫：无扩展环境或 window 跨世界 API 缺失时直接返回空串。
    // 真实浏览器 window.addEventListener/postMessage 始终存在，不影响 360Chrome 回退路径；
    // 此处仅防最小桩环境（如集成测试 window={fetch}）调用抛错导致 Promise reject。
    if (
      typeof chrome === 'undefined' ||
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function' ||
      typeof window.postMessage !== 'function'
    ) {
      resolve('');
      return;
    }
    const reqId = String(Math.random());
    const onResp = (e: MessageEvent) => {
      const d = e.data as Record<string, unknown> | null;
      if (!d || d[CTX_RESP_CHANNEL] !== true || d.reqId !== reqId) return;
      window.removeEventListener('message', onResp);
      resolve(typeof d.context === 'string' ? d.context : '');
    };
    try {
      window.addEventListener('message', onResp);
      // 跨 realm 投递给 ISOLATED relay
      window.postMessage({ [CTX_REQ_CHANNEL]: true, reqId }, '*');
    } catch {
      // 跨世界投递异常：fail-open 返回空串，绝不 reject
      resolve('');
      return;
    }
    // 超时 fail-open
    setTimeout(() => {
      window.removeEventListener('message', onResp);
      resolve('');
    }, RELAY_TIMEOUT_MS);
  });
}

/**
 * relay 侧：构造上下文响应载荷（读取 chrome.storage 并合并为字符串）。
 * 供 ISOLATED relay 在收到 CTX_REQ 时调用，再经 window.postMessage 回传 MAIN world。
 */
export async function buildContextResponse(
  reqId: string,
): Promise<{ [CTX_RESP_CHANNEL]: true; reqId: string; context: string }> {
  const context = await readInjectionContextString();
  return { [CTX_RESP_CHANNEL]: true, reqId, context };
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
