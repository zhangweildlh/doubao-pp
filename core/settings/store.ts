// 融合方案 §5（插件参数配置）：用户原痛点"无法设置插件参数"的存储后端
//
// 设计要点（非检测 / 最小自洽）：
//   - 与 MemoryStore / SkillStore 同构：复用 StorageBackend 契约，class + 注入后端
//   - 存储 KEY：doubao_pp_settings（新增，遵循 doubao_pp_* 前缀）
//   - 默认后端 chrome.storage.local（用户配置本地持久化即可）
//   - getSettings 合并默认值（缺失字段回填默认），updateSettings 局部更新，resetSettings 复位
//   - 本文件顶部不访问 chrome 全局，沙盒（无 chrome）导入不抛错，可安全单测

import type { StorageBackend } from '../memory/store.ts';
import { createMemoryBackend, chromeStorageBackend } from '../memory/store.ts';

export type SyncStrategy = 'local' | 'sync';
export type ThemePref = 'light' | 'dark' | 'system';

export interface PluginSettings {
  /** 是否自动注入上下文（默认 true，fail-open 一致：缺省即注入） */
  autoInject: boolean;
  /** 注入字符上限（对齐 request-aug 的 maxInjectionChars，默认 8000） */
  injectionLimit: number;
  /** 同步策略：本地 / 云同步，默认 'local' */
  syncStrategy: SyncStrategy;
  /** 主题偏好，默认 'system' */
  theme: ThemePref;
}

/** 可更新的设置字段（全部可选，局部 patch） */
export type SettingsPatch = Partial<PluginSettings>;

export const SETTINGS_STORAGE_KEY = 'doubao_pp_settings';

/** 默认设置：任何缺失字段都按此回填，保证上层拿到的对象字段完整 */
export const DEFAULT_SETTINGS: PluginSettings = {
  autoInject: true,
  injectionLimit: 8000,
  syncStrategy: 'local',
  theme: 'system',
};

/** 把任意存储值规整为合法设置对象（字段缺失/类型错误时回填默认） */
function normalize(raw: unknown): PluginSettings {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: PluginSettings = { ...DEFAULT_SETTINGS };
  if (typeof obj.autoInject === 'boolean') out.autoInject = obj.autoInject;
  if (typeof obj.injectionLimit === 'number' && Number.isFinite(obj.injectionLimit)) {
    out.injectionLimit = obj.injectionLimit;
  }
  if (obj.syncStrategy === 'local' || obj.syncStrategy === 'sync') {
    out.syncStrategy = obj.syncStrategy;
  }
  if (obj.theme === 'light' || obj.theme === 'dark' || obj.theme === 'system') {
    out.theme = obj.theme;
  }
  return out;
}

/** 插件参数配置存储：getSettings / updateSettings / resetSettings，含默认值回填 */
export class SettingsStore {
  constructor(private readonly backend: StorageBackend = chromeStorageBackend) {}

  /** 读取设置并合并默认值（缺失字段回填默认） */
  async getSettings(): Promise<PluginSettings> {
    const raw = await this.backend.get(SETTINGS_STORAGE_KEY);
    const merged = normalize(raw);
    // 规整后回写，保证存储内始终为完整对象
    await this.backend.set(SETTINGS_STORAGE_KEY, merged);
    return merged;
  }

  /** 局部更新设置字段，返回更新后（已合并默认）的完整对象 */
  async updateSettings(patch: SettingsPatch): Promise<PluginSettings> {
    const current = await this.getSettings();
    const next: PluginSettings = { ...current, ...patch };
    const merged = normalize(next); // 防脏字段（如注入非法字符串到枚举）
    await this.backend.set(SETTINGS_STORAGE_KEY, merged);
    return merged;
  }

  /** 复位为默认设置 */
  async resetSettings(): Promise<PluginSettings> {
    await this.backend.set(SETTINGS_STORAGE_KEY, { ...DEFAULT_SETTINGS });
    return { ...DEFAULT_SETTINGS };
  }

  /** 沙盒后端便捷构造（测试用） */
  static memoryBackend(initial?: Record<string, unknown>): StorageBackend {
    return createMemoryBackend(initial);
  }
}
