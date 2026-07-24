// 融合方案 §5（数据层聚合）：统一导出各 Store 单例/工厂
//
// 设计要点：
//   - 后台命令 handler 与页面统一从此处引用存储层，避免到处硬编码后端与 KEY
//   - 默认后端 chrome.storage.local（记忆/MCP/项目/预设/设置均走本地持久化）
//   - 技能走 chrome.storage.sync（见 core/skills/store.ts 内部默认），此处仅导出单例
//   - 单测请直接 import 各具体 Store class 并注入 createMemoryBackend，不要依赖本聚合单例

import { MemoryStore, chromeStorageBackend } from '../memory/store.ts';
import { SkillStore } from '../skills/store.ts';
import { McpStore } from '../mcp/store.ts';
import { chromeSyncStorageBackend } from '../sync/backend.ts';
import { ProjectStore } from '../project/store.ts';
import { PresetStore } from '../preset/store.ts';
import { SettingsStore } from '../settings/store.ts';

/** 记忆存储单例（chrome.storage.local） */
export const memoryStore = new MemoryStore(chromeStorageBackend);
/** 技能存储单例（设计意图走 chrome.storage.sync，跨设备云同步） */
export const skillStore = new SkillStore(chromeSyncStorageBackend);
/** MCP 工具存储单例（chrome.storage.local） */
export const mcpStore = new McpStore();
/** 项目上下文存储单例（chrome.storage.local） */
export const projectStore = new ProjectStore(chromeStorageBackend);
/** 预设存储单例（chrome.storage.local） */
export const presetStore = new PresetStore(chromeStorageBackend);
/** 插件参数配置单例（chrome.storage.local） */
export const settingsStore = new SettingsStore(chromeStorageBackend);

export { MemoryStore, SkillStore, McpStore, ProjectStore, PresetStore, SettingsStore };
export { chromeStorageBackend } from '../memory/store.ts';
export { createMemoryBackend } from '../memory/store.ts';
