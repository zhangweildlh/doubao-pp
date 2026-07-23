// 融合方案 §4.2-1：解耦落点（步骤 2 关键改造）
//
// 原 fetch-hook.ts：
//   import { matchDeepSeekWebRoute } from '../deepseek/request-codec';
//   import { consumeDeepSeekSseFrames } from '../deepseek/stream-codec';
// 改为：
//   import { getActiveProvider } from '../provider/active';
//
// 本模块按运行期 URL / 构建变量选择当前 provider，使 Deepseek-pp 引擎层
// 与豆包实现并列共存、互不污染。

import type { ChatProvider } from './types.ts';
import { createDoubaoProvider } from './doubao/provider.ts';
// 对称实现（占位，验证类型一致性）：import { createDeepseekProvider } from './deepseek/provider';

let activeProvider: ChatProvider | null = null;

export function getActiveProvider(): ChatProvider {
  if (activeProvider) return activeProvider;
  // 当前移植目标为豆包；实际发布可据构建变量 / 运行时 URL 切换。
  activeProvider = createDoubaoProvider();
  return activeProvider;
}

export function setActiveProvider(p: ChatProvider): void {
  activeProvider = p;
}

export function isDoubaoRoute(url: string): boolean {
  return url.includes('doubao.com');
}

export function isDeepseekRoute(url: string): boolean {
  return url.includes('deepseek.com') || url.includes('api.deepseek.com');
}
