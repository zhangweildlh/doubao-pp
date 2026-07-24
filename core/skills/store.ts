// 融合方案 §5（技能系统）：技能存储与上下文装配
//
// 设计要点（非检测 / 最小自洽）：
//   - 不移植 Deepseek-pp 整包 skill 引擎（GitHub 导入 / Office CLI / 打包资产等），
//     仅在 Doubao-pp 内建一个最小技能注册表：技能 = 可注入模型的提示/上下文块
//   - 复用既有 StorageBackend 契约；默认后端为 chrome.storage.sync（跨设备云同步）
//   - 内建技能随扩展打包（不可删、可禁用）；用户技能存于 storage（可增删改）
//   - composeSkillContext 把"已启用"的技能拼接为注入上下文，供路线 A 注入请求体
//   - 本文件顶部不访问 chrome 全局，沙盒（无 chrome）导入不抛错，可安全单测

import type { StorageBackend } from '../memory/store.ts';
import { createMemoryBackend } from '../memory/store.ts';
import { chromeSyncStorageBackend } from '../sync/backend.ts';

export interface SkillEntry {
  /** 稳定主键；内建技能以 'builtin-' 前缀，用户技能以 'user-' 前缀 */
  id: string;
  /** 技能名（展示用，注入上下文时作为标题） */
  name: string;
  /** 一句话说明 */
  description: string;
  /** 注入模型的上下文/提示块（实际文本） */
  content: string;
  /** 是否启用（禁用则不被注入） */
  enabled: boolean;
  /** 是否内建（内建不可删除） */
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

export const SKILLS_STORAGE_KEY = 'doubao_pp_skills_v1';
const MAX_ENTRIES = 200;
const MAX_CONTEXT_CHARS = 3000;

/** 内建技能：随扩展打包的示例技能，证明技能注入管线可用（用户可禁用/不改写） */
export const BUILTIN_SKILLS: SkillEntry[] = [
  {
    id: 'builtin-concise',
    name: '简明扼要',
    description: '回答优先给结论，再展开要点，避免冗长铺垫',
    content:
      '回答风格：先给一句话结论，再用 3-5 个要点展开；除非用户要求，不要写长篇背景铺垫。',
    enabled: true,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-structured',
    name: '结构化输出',
    description: '涉及清单/对比/步骤时优先用表格或编号列表',
    content:
      '当内容包含多个并列项、对比或操作步骤时，优先使用 Markdown 表格或编号列表呈现，提升可读性。',
    enabled: true,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-code-cn',
    name: '代码注释用中文',
    description: '给出代码时，关键行用中文注释说明意图',
    content: '提供代码示例时，对关键逻辑用中文注释解释意图；变量名仍用英文。',
    enabled: false,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
];

/** 技能存储：提供 getAll / upsert / remove / clear，按 id 去重 */
export class SkillStore {
  constructor(private readonly backend: StorageBackend) {}

  async getAll(): Promise<SkillEntry[]> {
    const raw = await this.backend.get(SKILLS_STORAGE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw as SkillEntry[];
  }

  async upsert(entry: SkillEntry): Promise<SkillEntry[]> {
    const list = await this.getAll();
    const now = Date.now();
    const idx = list.findIndex((e) => e.id === entry.id);
    const next: SkillEntry = {
      ...entry,
      builtin: entry.builtin ?? false,
      createdAt: entry.createdAt ?? now,
      updatedAt: now,
    };
    if (idx >= 0) {
      const prev = list[idx];
      next.createdAt = prev.createdAt; // 保留最早创建时间
      list[idx] = next;
    } else {
      list.push(next);
    }
    const trimmed = list.slice(-MAX_ENTRIES);
    await this.backend.set(SKILLS_STORAGE_KEY, trimmed);
    return trimmed;
  }

  async remove(id: string): Promise<SkillEntry[]> {
    const list = await this.getAll();
    const filtered = list.filter((e) => e.id !== id || e.builtin); // 内建不可删
    await this.backend.set(SKILLS_STORAGE_KEY, filtered);
    return filtered;
  }

  async clear(): Promise<void> {
    await this.backend.set(SKILLS_STORAGE_KEY, []);
  }
}

/** 合并内建与用户技能，按 enabled 过滤，拼接为注入上下文（带长度上限） */
export function composeSkillContext(userSkills: SkillEntry[]): string {
  const merged = [...BUILTIN_SKILLS, ...userSkills];
  const enabled = merged.filter((s) => s.enabled && s.content.trim().length > 0);
  if (enabled.length === 0) return '';
  const header = '【技能上下文】以下技能已启用，请在回答中遵循其要求：';
  const body = enabled
    .map((s) => `- ${s.name}：${s.content}`)
    .join('\n');
  const full = `${header}\n${body}`;
  return full.length > MAX_CONTEXT_CHARS
    ? full.slice(0, MAX_CONTEXT_CHARS)
    : full;
}

/** 沙盒后端便捷构造（测试用） */
export function createSkillMemoryBackend(initial?: Record<string, unknown>): StorageBackend {
  return createMemoryBackend(initial);
}

export { chromeSyncStorageBackend };
