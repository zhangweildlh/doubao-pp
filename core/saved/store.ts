// Doubao-pp 收藏片段存储（P6）
//
// 与 ProjectStore / PresetStore 同构：复用 StorageBackend 契约，class + 注入后端。
// 承载「收藏的提示词与片段」（LibraryPage 的 saved 子页 / 侧边栏 SavedPage）。
// 存储 KEY：doubao_pp_saved_v1（遵循 doubao_pp_* 前缀，与对话记忆/笔记记忆区分）。
//
// 设计要点（非检测 / 最小自洽）：
//   - 顶部不访问 chrome 全局，沙盒（无 chrome）导入不抛错，可安全单测。
//   - id 生成沿用 Doubao 习惯（saved- 前缀 + crypto.randomUUID 兜底）。
//   - SAVE_SAVED 按 id upsert（id 存在走 update 分支，否则 create）。

import type { StorageBackend } from '../memory/store.ts';
import { createMemoryBackend, chromeStorageBackend } from '../memory/store.ts';

export interface SavedSnippet {
  /** 稳定主键（create 时自动生成，save 时可带以局部更新） */
  id: string;
  /** 标题（展示用） */
  title: string;
  /** 片段内容（提示词 / 模板 / 草稿） */
  content: string;
  /** 标签，便于检索 */
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** create / save 入参：id 可选（带则按 id upsert） */
export type SavedSnippetInput = Omit<SavedSnippet, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export const SAVED_STORAGE_KEY = 'doubao_pp_saved_v1';
const MAX_ENTRIES = 500;

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'saved-' + crypto.randomUUID();
  }
  return 'saved-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 收藏片段存储：getAll / getById / create / update / remove / clear */
export class SavedStore {
  constructor(private readonly backend: StorageBackend = chromeStorageBackend) {}

  async getAll(): Promise<SavedSnippet[]> {
    const raw = await this.backend.get(SAVED_STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw as SavedSnippet[];
  }

  async getById(id: string): Promise<SavedSnippet | undefined> {
    const list = await this.getAll();
    return list.find((e) => e.id === id);
  }

  /** 新建一条收藏；自动生成 id 与时间戳 */
  async create(input: Omit<SavedSnippet, 'id' | 'createdAt' | 'updatedAt'>): Promise<SavedSnippet> {
    const list = await this.getAll();
    const now = Date.now();
    const entry: SavedSnippet = {
      id: genId(),
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    list.push(entry);
    const trimmed = list.slice(-MAX_ENTRIES);
    await this.backend.set(SAVED_STORAGE_KEY, trimmed);
    return entry;
  }

  /**
   * 局部更新某条收藏：合并 patch，刷新 updatedAt；id 与 createdAt 不可被改写。
   * 目标不存在 → 返回原列表，无副作用。
   */
  async update(
    id: string,
    patch: Partial<Omit<SavedSnippet, 'id' | 'createdAt'>>,
  ): Promise<SavedSnippet[]> {
    const list = await this.getAll();
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return list;
    const now = Date.now();
    list[idx] = {
      ...list[idx],
      ...patch,
      id: list[idx].id,
      createdAt: list[idx].createdAt,
      updatedAt: now,
    };
    await this.backend.set(SAVED_STORAGE_KEY, list);
    return list;
  }

  /** 按 id 删除；不存在 no-op */
  async remove(id: string): Promise<SavedSnippet[]> {
    const list = await this.getAll();
    const filtered = list.filter((e) => e.id !== id);
    if (filtered.length === list.length) return list;
    await this.backend.set(SAVED_STORAGE_KEY, filtered);
    return filtered;
  }

  /** 清空全部收藏 */
  async clear(): Promise<void> {
    await this.backend.set(SAVED_STORAGE_KEY, []);
  }

  /** 沙盒后端便捷构造（测试用） */
  static memoryBackend(initial?: Record<string, unknown>): StorageBackend {
    return createMemoryBackend(initial);
  }
}
