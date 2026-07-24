// 用户笔记型记忆存储（P3-3 新增，方案 A 并存两套之一）
//
// 与 core/memory/store.ts 的 MemoryEntry（自动抓取对话记忆）并存、互不干扰：
//   - MemoryEntry / MemoryStore（对话记忆）：服务浮窗 / 注入 / 第2步自动抓取，结构不变。
//   - Memory / UserMemoryStore（用户笔记型）：服务记忆管理 UI（标签筛选 / 新增 / 编辑 / 删除）。
//
// 设计要点（同构现有 Store 范式）：
//   - StorageBackend 可注入：真机用 chrome.storage.local，沙盒测试用纯内存后端
//   - 顶部不访问 chrome 全局，仅在 chromeStorageBackend 方法体内引用，沙盒导入安全
//   - id 生成沿用 Doubao 习惯（mem- 前缀 + crypto.randomUUID 兜底），与 PresetStore/ProjectStore 一致

import type { Memory, NewMemory } from '../types.ts';
import {
  chromeStorageBackend,
  createMemoryBackend,
  type StorageBackend,
} from './store.ts';

const STORAGE_KEY = 'doubao_pp_user_memories_v1';
export const USER_MEMORY_STORAGE_KEY = STORAGE_KEY;
const MAX_ENTRIES = 1000;

/** 真机后端：复用 chrome.storage.local（MV3 持久化） */
export { chromeStorageBackend };

/** 沙盒后端：纯内存 Map，用于测试与无 chrome 环境 */
export { createMemoryBackend };

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'mem-' + crypto.randomUUID();
  }
  return 'mem-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 用户笔记型记忆存储：getAll / create（含 id 与时间戳）/ getById / update（局部）/ remove / clear */
export class UserMemoryStore {
  constructor(private readonly backend: StorageBackend) {}

  /** 返回全量笔记型记忆（非数组时回退空数组，避免脏数据导致崩溃） */
  async getAll(): Promise<Memory[]> {
    const raw = await this.backend.get(STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw as Memory[];
  }

  /**
   * 新建一条笔记型记忆：
   *   - id 缺省时后台生成（mem- 前缀）
   *   - 补全 createdAt / updatedAt 与默认值（scope 默认 global、tags 默认 []、pinned 默认 false）
   * 返回写入后的完整条目
   */
  async create(input: NewMemory): Promise<Memory> {
    const list = await this.getAll();
    const now = Date.now();
    const entry: Memory = {
      id: input.id ?? genId(),
      syncId: input.syncId,
      scope: input.scope ?? 'global',
      type: input.type,
      name: input.name,
      content: input.content,
      description: input.description,
      tags: input.tags ?? [],
      pinned: input.pinned ?? false,
      createdAt: now,
      updatedAt: now,
      conversationId: input.conversationId ?? null,
      sectionId: input.sectionId ?? null,
      sessionUrl: input.sessionUrl ?? null,
      accessCount: input.accessCount ?? 0,
      lastAccessedAt: input.lastAccessedAt,
    };
    list.push(entry);
    const trimmed = list.slice(-MAX_ENTRIES);
    await this.backend.set(STORAGE_KEY, trimmed);
    return entry;
  }

  /** 按 id 精确读取单条；不存在返回 undefined */
  async getById(id: string): Promise<Memory | undefined> {
    const list = await this.getAll();
    return list.find((m) => m.id === id);
  }

  /**
   * 局部更新某条笔记型记忆的字段（如 name / content / tags / pinned / 溯源字段）。
   *   - 目标 id 不存在 → 返回原列表，无副作用
   *   - 存在 → 合并 patch，刷新 updatedAt；id 与 createdAt 不可被 patch 改写
   * 返回更新后的全量列表
   */
  async update(id: string, patch: Partial<Omit<Memory, 'id' | 'createdAt'>>): Promise<Memory[]> {
    const list = await this.getAll();
    const idx = list.findIndex((m) => m.id === id);
    if (idx < 0) return list;
    const now = Date.now();
    list[idx] = {
      ...list[idx],
      ...patch,
      id: list[idx].id, // id 锁定
      createdAt: list[idx].createdAt, // createdAt 锁定
      updatedAt: now,
    };
    await this.backend.set(STORAGE_KEY, list);
    return list;
  }

  /** 按 id 删除一条记忆；不存在则 no-op，返回原列表 */
  async remove(id: string): Promise<Memory[]> {
    const list = await this.getAll();
    const filtered = list.filter((m) => m.id !== id);
    if (filtered.length === list.length) return list; // 无变化
    await this.backend.set(STORAGE_KEY, filtered);
    return filtered;
  }

  /** 清空全部笔记型记忆 */
  async clear(): Promise<void> {
    await this.backend.set(STORAGE_KEY, []);
  }
}
