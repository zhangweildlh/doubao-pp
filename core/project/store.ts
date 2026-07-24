// 融合方案 §5（项目上下文）：会话归档 / 项目上下文存储
//
// 设计要点（非检测 / 最小自洽）：
//   - 与 MemoryStore / SkillStore / McpStore 同构：复用 StorageBackend 契约，class + 注入后端
//   - 默认后端为 chrome.storage.local（项目上下文体量可能较大，走本地持久化）
//   - 豆包场景：把一次或一组会话归档为一个"项目"，承载跨会话的上下文/备忘
//   - 存储 KEY：doubao_pp_project_context（对齐 Deepseek deepseek_pp_project_context）
//   - 本文件顶部不访问 chrome 全局，沙盒（无 chrome）导入不抛错，可安全单测

import type { StorageBackend } from '../memory/store.ts';
import { createMemoryBackend, chromeStorageBackend } from '../memory/store.ts';

export interface ProjectEntry {
  /** 稳定主键（create 时自动生成） */
  id: string;
  /** 项目名（展示用） */
  name: string;
  /** 项目描述 / 归档说明 */
  description: string;
  /** 项目级注入上下文（持久化的背景资料 / 约束） */
  context: string;
  /** 关联会话 URL 列表（会话归档指向） */
  sessionUrls: string[];
  createdAt: number;
  updatedAt: number;
}

/** create 入参：无需关心 id / 时间戳 */
export type ProjectInput = Omit<ProjectEntry, 'id' | 'createdAt' | 'updatedAt'>;

export const PROJECTS_STORAGE_KEY = 'doubao_pp_project_context';
const MAX_ENTRIES = 200;

/** 简单唯一 id（无 chrome 依赖，沙盒可跑） */
function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'proj-' + crypto.randomUUID();
  }
  return 'proj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 项目上下文存储：getAll / getById / create / update / remove，按 id 去重，上限 200 */
export class ProjectStore {
  constructor(private readonly backend: StorageBackend = chromeStorageBackend) {}

  async getAll(): Promise<ProjectEntry[]> {
    const raw = await this.backend.get(PROJECTS_STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw as ProjectEntry[];
  }

  async getById(id: string): Promise<ProjectEntry | undefined> {
    const list = await this.getAll();
    return list.find((e) => e.id === id);
  }

  /** 新建一条项目；自动生成 id 与时间戳，超出上限丢弃最旧 */
  async create(input: ProjectInput): Promise<ProjectEntry[]> {
    const list = await this.getAll();
    const now = Date.now();
    const entry: ProjectEntry = {
      id: genId(),
      name: input.name,
      description: input.description ?? '',
      context: input.context ?? '',
      sessionUrls: input.sessionUrls ?? [],
      createdAt: now,
      updatedAt: now,
    };
    list.push(entry);
    const trimmed = list.slice(-MAX_ENTRIES);
    await this.backend.set(PROJECTS_STORAGE_KEY, trimmed);
    return trimmed;
  }

  /**
   * 局部更新某项目：合并 patch，刷新 updatedAt；id 与 createdAt 不可被改写。
   * 目标不存在 → 返回原列表，无副作用。
   */
  async update(
    id: string,
    patch: Partial<Omit<ProjectEntry, 'id' | 'createdAt'>>,
  ): Promise<ProjectEntry[]> {
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
    await this.backend.set(PROJECTS_STORAGE_KEY, list);
    return list;
  }

  /** 按 id 删除；不存在 no-op */
  async remove(id: string): Promise<ProjectEntry[]> {
    const list = await this.getAll();
    const filtered = list.filter((e) => e.id !== id);
    if (filtered.length === list.length) return list;
    await this.backend.set(PROJECTS_STORAGE_KEY, filtered);
    return filtered;
  }

  /** 沙盒后端便捷构造（测试用） */
  static memoryBackend(initial?: Record<string, unknown>): StorageBackend {
    return createMemoryBackend(initial);
  }
}
