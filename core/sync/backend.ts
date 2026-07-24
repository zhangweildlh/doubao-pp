// 融合方案 §5（云同步）：跨设备存储后端
//
// 设计要点（非检测优先）：
//   - 复用既有 StorageBackend 契约（core/memory/store.ts），对上层存储（记忆/技能/MCP）透明
//   - 后端基于 chrome.storage.sync：由 Chrome 账户在用户设备间自动同步，
//     扩展**不自发任何网络请求**，因此与"路线 A 非检测"原则完全兼容
//   - chrome.storage.sync 有配额（单 key ≤ 8KB、总 ≤ 100KB），故仅适合同步
//     体量较小的用户配置（技能、MCP 工具定义）；体积较大的记忆仍走 chrome.storage.local
//   - 本模块顶部不访问 chrome 全局，仅在方法体内引用，沙盒（无 chrome）导入不抛错

import type { StorageBackend } from '../memory/store.ts';

/**
 * 跨设备云同步后端：封装 chrome.storage.sync。
 * 仅当用户登录 Chrome 账户并开启同步时才有跨设备效果；否则退化为本地存储。
 */
export const chromeSyncStorageBackend: StorageBackend = {
  async get(key: string): Promise<unknown> {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) return undefined;
    const res = await chrome.storage.sync.get(key);
    return (res as Record<string, unknown>)[key];
  },
  async set(key: string, value: unknown): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) return;
    await chrome.storage.sync.set({ [key]: value } as Record<string, unknown>);
  },
};

/** 同步策略：标识某类数据是否启用云同步（默认仅技能启用，记忆/MCP 走本地） */
export interface SyncPolicy {
  skills: boolean;
  memory: boolean;
  mcp: boolean;
}

export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  skills: true,
  memory: false,
  mcp: false,
};

/**
 * 根据策略为指定数据类别选择后端：
 *   - 启用同步且环境支持 → chrome.storage.sync
 *   - 否则 → 本地后端（由调用方传入，这里回退为 undefined 表示"用默认本地"）
 */
export function selectBackendFor(
  category: keyof SyncPolicy,
  policy: SyncPolicy,
  local: StorageBackend,
): StorageBackend {
  if (policy[category] && typeof chrome !== 'undefined' && !!chrome.storage?.sync) {
    return chromeSyncStorageBackend;
  }
  return local;
}
