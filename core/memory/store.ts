// 融合方案 §5（记忆系统）：存储层契约与实现
//
// 设计要点：
//   - StorageBackend 可注入：真机用 chrome.storage.local，沙盒测试用纯内存后端
//   - MemoryEntry 为记忆条目的最小结构，按 id（= conversationId）去重
//   - MemoryStore 只负责「读/写/去重/上限/清空」，不感知扩展通信
//
// 注意：本文件顶部不访问 chrome 全局，仅在 chromeStorageBackend 方法体内引用，
// 因此沙盒（无 chrome 环境）导入本模块不会抛错，可安全单测。

export interface MemoryEntry {
  /** 去重主键，通常为 conversationId；无会话时回退 requestId */
  id: string;
  conversationId: string | null;
  sectionId: string | null;
  sessionUrl: string | null;
  /** 定稿助手文本（权威 brief） */
  assistantText: string;
  /** 首次写入时间戳（去重更新时保持不变） */
  createdAt: number;
  /** 最近一次更新时间戳 */
  updatedAt: number;
}

/** 可注入的存储后端；实现须保证 get/set 为异步 */
export interface StorageBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

const STORAGE_KEY = 'doubao_pp_memory_v1';
export const MEMORY_STORAGE_KEY = STORAGE_KEY;
const MAX_ENTRIES = 100;

/** 真机后端：chrome.storage.local（MV3 持久化） */
export const chromeStorageBackend: StorageBackend = {
  async get(key: string): Promise<unknown> {
    const res = await chrome.storage.local.get(key);
    return (res as Record<string, unknown>)[key];
  },
  async set(key: string, value: unknown): Promise<void> {
    await chrome.storage.local.set({ [key]: value } as Record<string, unknown>);
  },
};

/** 沙盒后端：纯内存 Map，用于测试与无 chrome 环境 */
export function createMemoryBackend(
  initial?: Record<string, unknown>,
): StorageBackend {
  const map = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    async get(key: string): Promise<unknown> {
      return map.has(key) ? map.get(key) : undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      map.set(key, value);
    },
  };
}

/** 记忆存储：提供 getAll / append（去重）/ clear 三个动作 */
export class MemoryStore {
  constructor(private readonly backend: StorageBackend) {}

  /** 返回全量记忆条目（非数组时回退空数组，避免脏数据导致崩溃） */
  async getAll(): Promise<MemoryEntry[]> {
    const raw = await this.backend.get(STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw as MemoryEntry[];
  }

  /**
   * 追加或更新一条记忆：
   *   - 同 id 已存在 → 更新文本与元信息，保留最早 createdAt
   *   - 同 id 不存在 → 新增
   *   - 超出 MAX_ENTRIES 时丢弃最旧条目
   * 返回写入后的全量列表（已截断）
   */
  async append(entry: MemoryEntry): Promise<MemoryEntry[]> {
    const list = await this.getAll();
    const now = Date.now();
    const idx = list.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      const prev = list[idx];
      list[idx] = {
        ...prev,
        assistantText: entry.assistantText,
        // 优先采用新值；新值为空时保留既有已知值
        conversationId: entry.conversationId ?? prev.conversationId,
        sectionId: entry.sectionId ?? prev.sectionId,
        sessionUrl: entry.sessionUrl ?? prev.sessionUrl,
        updatedAt: now,
      };
    } else {
      list.push({ ...entry, createdAt: entry.createdAt ?? now, updatedAt: now });
    }
    const trimmed = list.slice(-MAX_ENTRIES);
    await this.backend.set(STORAGE_KEY, trimmed);
    return trimmed;
  }

  /** 清空全部记忆 */
  async clear(): Promise<void> {
    await this.backend.set(STORAGE_KEY, []);
  }
}
