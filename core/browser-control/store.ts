// Doubao-pp 浏览器自动化控制开关存储（P6）
//
// 与 SettingsStore 思路类似但独立成模块：承载「浏览器自动化控制」的启用开关。
// 该能力默认关闭（豆包化最小实现，避免默认开启带来副作用），页面提供开关与说明。
// 存储 KEY：doubao_pp_browser_control_v1（遵循 doubao_pp_* 前缀）。
//
// 设计要点（非检测 / 最小自洽）：
//   - 顶部不访问 chrome 全局，沙盒（无 chrome）导入不抛错，可安全单测。
//   - 仅持久化一个布尔开关；调度引擎属后续阶段（§8 容许的豆包化裁剪）。

import type { StorageBackend } from '../memory/store.ts';
import { createMemoryBackend, chromeStorageBackend } from '../memory/store.ts';

export const BROWSER_CONTROL_STORAGE_KEY = 'doubao_pp_browser_control_v1';

/** 默认关闭（fail-safe：默认不启用浏览器自动化控制） */
export const DEFAULT_BROWSER_CONTROL_ENABLED = false;

interface BrowserControlState {
  enabled: boolean;
}

function normalize(raw: unknown): BrowserControlState {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { enabled: obj.enabled === true };
}

/** 浏览器控制开关存储：getEnabled / setEnabled */
export class BrowserControlStore {
  constructor(private readonly backend: StorageBackend = chromeStorageBackend) {}

  /** 读取开关（缺省回退默认 false） */
  async getEnabled(): Promise<boolean> {
    const raw = await this.backend.get(BROWSER_CONTROL_STORAGE_KEY);
    return normalize(raw).enabled;
  }

  /** 写入开关，返回写入后的值 */
  async setEnabled(enabled: boolean): Promise<boolean> {
    const next: BrowserControlState = { enabled: enabled === true };
    await this.backend.set(BROWSER_CONTROL_STORAGE_KEY, next);
    return next.enabled;
  }

  /** 沙盒后端便捷构造（测试用） */
  static memoryBackend(initial?: Record<string, unknown>): StorageBackend {
    return createMemoryBackend(initial);
  }
}
