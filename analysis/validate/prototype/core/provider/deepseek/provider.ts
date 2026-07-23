// 对称占位（融合方案 §4.1 目录结构演示）：Deepseek 与豆包并列实现同一契约。
//
// 实际代码来自把原 core/deepseek/ 收敛后的实现（contracts / request-codec /
// stream-codec / pow / active-client / chat-session）。此处仅占位，用于验证
// "两套实现满足同一 ChatProvider 契约" 的类型一致性，证明解耦可行。

import type { ChatProvider, StreamEvent } from '../types.ts';

export function createDeepseekProvider(): ChatProvider {
  return {
    id: 'deepseek',
    webOrigin: 'https://chat.deepseek.com',
    contentScriptMatches: ['*://chat.deepseek.com/*'],
    hostPermissions: ['*://chat.deepseek.com/*', 'https://api.deepseek.com/*'],
    matchWebRoute(url: string): boolean {
      return url.includes('chat.deepseek.com') || url.includes('api.deepseek.com');
    },
    augmentCompletionRequest(body: unknown): unknown {
      // 原 deepseek 增强逻辑（本原型不展开）；保持契约签名一致。
      return body;
    },
    parseSSEStream(_resp: Response): AsyncGenerator<StreamEvent> {
      return (async function* () {})();
    },
    resolveChatSessionId(url: string): string | null {
      const m = url.match(/chat\.deepseek\.com\/([a-zA-Z0-9_-]+)/);
      return m ? m[1] : null;
    },
    buildSessionUrl(id: string): string {
      return `https://chat.deepseek.com/${id}`;
    },
    selectors: { inputBox: 'textarea', assistantMessage: '.message', actionButton: 'button' },
    uiFrameworkGlobal: '',
  };
}
