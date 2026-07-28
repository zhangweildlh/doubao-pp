// Doubao-pp 自动化规则存储（P6）
//
// 与 ProjectStore / SavedStore 同构：复用 StorageBackend 契约，class + 注入后端。
// 承载「自动化规则与运行记录」（侧边栏 AutomationPage）。
// 存储 KEY：doubao_pp_automations_v1（遵循 doubao_pp_* 前缀）。
//
// 设计要点（非检测 / 最小自洽）：
//   - 顶部不访问 chrome 全局，沙盒（无 chrome）导入不抛错，可安全单测。
//   - 规则为轻量声明（name/description/enabled/trigger/action），v1.11.6.2 仅做
//     增删与启用停用的最小闭环；实际调度引擎属后续阶段（§8 容许的豆包化裁剪）。
//   - id 生成沿用 Doubao 习惯（auto- 前缀 + crypto.randomUUID 兜底）。

import type { StorageBackend } from '../memory/store.ts';
import { createMemoryBackend, chromeStorageBackend } from '../memory/store.ts';

export type AutomationTrigger = 'manual' | 'onNewConversation' | 'onPageLoad';
export type AutomationAction = 'injectContext' | 'openSidePanel' | 'runSkill';

export interface AutomationRule {
  /** 稳定主键 */
  id: string;
  /** 规则名（展示用） */
  name: string;
  /** 规则说明 */
  description: string;
  /** 是否启用 */
  enabled: boolean;
  /** 触发条件 */
  trigger: AutomationTrigger;
  /** 触发动作 */
  action: AutomationAction;
  /** 动作参数（如关联技能 id / 注入上下文 id），可空 */
  actionParam: string;
  createdAt: number;
  updatedAt: number;
}

/** create / save 入参：id 可选（带则按 id upsert） */
export type AutomationRuleInput = Omit<
  AutomationRule,
  'id' | 'createdAt' | 'updatedAt'
> & { id?: string };

export const AUTOMATIONS_STORAGE_KEY = 'doubao_pp_automations_v1';
const MAX_ENTRIES = 200;

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 'auto-' + crypto.randomUUID();
  }
  return 'auto-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 自动化规则存储：getAll / getById / create / update / remove / clear */
export class AutomationStore {
  constructor(private readonly backend: StorageBackend = chromeStorageBackend) {}

  async getAll(): Promise<AutomationRule[]> {
    const raw = await this.backend.get(AUTOMATIONS_STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw as AutomationRule[];
  }

  async getById(id: string): Promise<AutomationRule | undefined> {
    const list = await this.getAll();
    return list.find((e) => e.id === id);
  }

  /** 新建一条规则；自动生成 id 与时间戳，enabled 缺省 false */
  async create(
    input: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AutomationRule> {
    const list = await this.getAll();
    const now = Date.now();
    const entry: AutomationRule = {
      id: genId(),
      name: input.name,
      description: input.description ?? '',
      enabled: input.enabled ?? false,
      trigger: input.trigger ?? 'manual',
      action: input.action ?? 'injectContext',
      actionParam: input.actionParam ?? '',
      createdAt: now,
      updatedAt: now,
    };
    list.push(entry);
    const trimmed = list.slice(-MAX_ENTRIES);
    await this.backend.set(AUTOMATIONS_STORAGE_KEY, trimmed);
    return entry;
  }

  /**
   * 局部更新某规则：合并 patch，刷新 updatedAt；id 与 createdAt 不可被改写。
   * 目标不存在 → 返回原列表，无副作用。
   */
  async update(
    id: string,
    patch: Partial<Omit<AutomationRule, 'id' | 'createdAt'>>,
  ): Promise<AutomationRule[]> {
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
    await this.backend.set(AUTOMATIONS_STORAGE_KEY, list);
    return list;
  }

  /** 按 id 删除；不存在 no-op */
  async remove(id: string): Promise<AutomationRule[]> {
    const list = await this.getAll();
    const filtered = list.filter((e) => e.id !== id);
    if (filtered.length === list.length) return list;
    await this.backend.set(AUTOMATIONS_STORAGE_KEY, filtered);
    return filtered;
  }

  /** 清空全部规则 */
  async clear(): Promise<void> {
    await this.backend.set(AUTOMATIONS_STORAGE_KEY, []);
  }

  /** 沙盒后端便捷构造（测试用） */
  static memoryBackend(initial?: Record<string, unknown>): StorageBackend {
    return createMemoryBackend(initial);
  }
}
