// 融合方案 §5（预设）：可保存的参数组合 / 上下文预设存储
//
// 设计要点（非检测 / 最小自洽）：
//   - 与 MemoryStore / SkillStore 同构：复用 StorageBackend 契约，class + 注入后端
//   - 预设 = 用户可保存的参数组合或上下文预设（如"严谨模式 / 中文注释 / 8000 字注入上限"）
//   - 存储 KEY：doubao_pp_presets（列表）+ doubao_pp_active_preset_id（当前激活）
//     对齐 Deepseek deepseek_pp_presets / deepseek_pp_active_preset_id
//   - 默认后端 chrome.storage.local（预设体积小，本地持久化即可；也可按需改 sync）
//   - 本文件顶部不访问 chrome 全局，沙盒（无 chrome）导入不抛错，可安全单测

import type { StorageBackend } from '../memory/store.ts';
import { createMemoryBackend, chromeStorageBackend } from '../memory/store.ts';

export interface PresetEntry {
  /** 稳定主键（create 时自动生成） */
  id: string;
  /** 预设名（展示用） */
  name: string;
  /** 预设说明 */
  description: string;
  /** 该预设下要注入模型的上下文块 */
  context: string;
  /** 该预设携带的参数（自由键值，供后续页面/命令消费） */
  params: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** create 入参：无需关心 id / 时间戳 */
export type PresetInput = Omit<PresetEntry, 'id' | 'createdAt' | 'updatedAt'>;

export const PRESETS_STORAGE_KEY = 'doubao_pp_presets';
export const ACTIVE_PRESET_ID_KEY = 'doubao_pp_active_preset_id';
const MAX_ENTRIES = 200;

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'preset-' + crypto.randomUUID();
  }
  return 'preset-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 预设存储：getAll / getById / create / update / remove / getActive / setActive */
export class PresetStore {
  constructor(private readonly backend: StorageBackend = chromeStorageBackend) {}

  async getAll(): Promise<PresetEntry[]> {
    const raw = await this.backend.get(PRESETS_STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw as PresetEntry[];
  }

  async getById(id: string): Promise<PresetEntry | undefined> {
    const list = await this.getAll();
    return list.find((e) => e.id === id);
  }

  /** 新建一条预设；自动生成 id 与时间戳，超出上限丢弃最旧 */
  async create(input: PresetInput): Promise<PresetEntry[]> {
    const list = await this.getAll();
    const now = Date.now();
    const entry: PresetEntry = {
      id: genId(),
      name: input.name,
      description: input.description ?? '',
      context: input.context ?? '',
      params: input.params ?? {},
      createdAt: now,
      updatedAt: now,
    };
    list.push(entry);
    const trimmed = list.slice(-MAX_ENTRIES);
    await this.backend.set(PRESETS_STORAGE_KEY, trimmed);
    return trimmed;
  }

  /**
   * 局部更新某预设：合并 patch，刷新 updatedAt；id 与 createdAt 不可被改写。
   * 目标不存在 → 返回原列表，无副作用。
   */
  async update(
    id: string,
    patch: Partial<Omit<PresetEntry, 'id' | 'createdAt'>>,
  ): Promise<PresetEntry[]> {
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
    await this.backend.set(PRESETS_STORAGE_KEY, list);
    return list;
  }

  /** 按 id 删除；若删除的是当前激活预设，则清空激活标记 */
  async remove(id: string): Promise<PresetEntry[]> {
    const list = await this.getAll();
    const filtered = list.filter((e) => e.id !== id);
    if (filtered.length === list.length) return list;
    await this.backend.set(PRESETS_STORAGE_KEY, filtered);
    const active = await this.getActiveId();
    if (active === id) await this.backend.set(ACTIVE_PRESET_ID_KEY, '');
    return filtered;
  }

  /** 读取当前激活预设 id（无则返回 ''） */
  async getActiveId(): Promise<string> {
    const raw = await this.backend.get(ACTIVE_PRESET_ID_KEY);
    return typeof raw === 'string' ? raw : '';
  }

  /** 返回当前激活预设实体；未设置 / 不存在返回 undefined */
  async getActive(): Promise<PresetEntry | undefined> {
    const id = await this.getActiveId();
    if (!id) return undefined;
    return this.getById(id);
  }

  /** 设定当前激活预设 id（仅当目标存在时生效，返回是否设置成功） */
  async setActive(id: string): Promise<boolean> {
    const target = await this.getById(id);
    if (!target) return false;
    await this.backend.set(ACTIVE_PRESET_ID_KEY, id);
    return true;
  }

  /** 沙盒后端便捷构造（测试用） */
  static memoryBackend(initial?: Record<string, unknown>): StorageBackend {
    return createMemoryBackend(initial);
  }
}
