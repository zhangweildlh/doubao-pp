// Doubao-pp 领域类型（P3 新增，供 sidePanel UI 组件使用）
//
// §8 可搬运：与上游 core/types.ts 对齐 UI 组件用到的领域类型（Memory 笔记型）。
// 注意与现有 core/memory/store.ts 的 MemoryEntry（自动抓取对话记忆）并存：
//   - MemoryEntry（对话记忆）：服务浮窗 / 注入 / 第2步自动抓取，结构不变。
//   - Memory（用户笔记型）：服务记忆管理 UI（标签筛选 / 新增 / 编辑 / 删除），本文件定义。
// 两者独立存储、互不干扰（方案 A：并存两套）。

export type MemoryType = 'user' | 'feedback' | 'topic' | 'reference';
export type MemoryScope = 'global' | 'project';

/**
 * 用户笔记型记忆（记忆管理 UI 专属）。
 * 与上游 Memory 对齐 UI 用到的字段；溯源字段（conversationId/sectionId/sessionUrl）为可选，
 * 预留与第2步对话记忆的关联能力，但默认用户笔记不依赖它们。
 */
export interface Memory {
  /** 稳定主键（创建时生成，string 以贴合 Doubao 其他 Store 习惯） */
  id: string;
  /** 同步标识（预留跨设备同步，可选） */
  syncId?: string;
  /** 作用域（默认 global） */
  scope?: MemoryScope;
  /** 类型：用于标签筛选（全部 / 用户 / 反馈 / 话题 / 参考） */
  type: MemoryType;
  /** 展示名称 */
  name: string;
  /** 记忆正文 */
  content: string;
  /** 补充说明 */
  description?: string;
  /** 标签列表 */
  tags: string[];
  /** 是否置顶 */
  pinned: boolean;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 关联对话 id（可选溯源） */
  conversationId?: string | null;
  /** 关联区块 id（可选溯源） */
  sectionId?: string | null;
  /** 关联会话地址（可选溯源） */
  sessionUrl?: string | null;
  /** 访问计数（预留） */
  accessCount?: number;
  /** 最近访问时间（预留） */
  lastAccessedAt?: number;
}

/** 新建 / 编辑记忆的入参（省略系统字段，可选补全 id/syncId/scope） */
export type NewMemory = Omit<Memory, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  syncId?: string;
  scope?: MemoryScope;
};

/**
 * 技能（记忆管理 UI 与技能页消费）。
 * 与 core/skills/store.ts 的 SkillEntry 字段对齐（id/name/description/content/enabled/builtin/createdAt/updatedAt）；
 * 豆包化：用 `content` 承载注入文本（上游用 `instructions`），无 `source`/`remote`/`memoryEnabled` 字段。
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 新建 / 编辑技能入参（省略系统字段） */
export type SkillInput = Omit<Skill, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

/**
 * 预设（记忆管理 UI 与预设页消费）。
 * 与 core/preset/store.ts 的 PresetEntry 字段对齐：用 `context` 承载注入文本（上游用 `content`）；
 * id 由 PresetStore 自带 genId 生成，故入参无需 id/时间戳（用 PresetInput）。
 */
export interface SystemPromptPreset {
  id: string;
  name: string;
  description: string;
  context: string;
  params: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** 新建 / 编辑预设入参（省略系统字段，id 由 Store 生成） */
export type PresetInput = Omit<SystemPromptPreset, 'id' | 'createdAt' | 'updatedAt'>;
