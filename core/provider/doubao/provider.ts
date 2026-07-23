// 融合方案 §4.1：豆包 ChatProvider 实现聚合（步骤 4 doubao/ 装配点）
//
// 将 contracts / stream-codec / request-aug / chat-session / dom-hook / auth
// 收口为满足统一契约 ChatProvider 的单一对象。fetch-hook 仅依赖此对象，
// 不再感知平台差异。

import type { ChatProvider, StreamEvent } from '../types.ts';
import {
  DOUBAO_WEB_ORIGIN,
  DOUBAO_SELECTORS,
  UIFRAMEWORK_GLOBAL,
} from './contracts.ts';
import { parseDoubaoSSE } from './stream-codec.ts';
import { augmentCompletionRequest } from './request-aug.ts';
import { resolveChatSessionId, buildSessionUrl } from './chat-session.ts';

// 记忆 / Skills 注入标记（对齐验证②的 INJECT_TEXT）
const MEMORY_MARKER = '[来自Doubao-pp记忆系统的上下文] ';

export function createDoubaoProvider(): ChatProvider {
  return {
    id: 'doubao',
    webOrigin: DOUBAO_WEB_ORIGIN,
    contentScriptMatches: ['*://www.doubao.com/chat/*'],
    hostPermissions: ['https://www.doubao.com/*'],

    matchWebRoute(url: string, _method: string, baseUrl: string): boolean {
      const base = baseUrl || 'https://www.doubao.com';
      return url.includes('/chat/completion') && url.startsWith(base);
    },

    augmentCompletionRequest(body: unknown): unknown {
      // 防御校验 G1：body 必须是非空对象且含 messages 数组，否则跳过增强
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        !('messages' in body) ||
        !Array.isArray((body as Record<string, unknown>).messages)
      ) {
        return body;
      }

      // 用 try-catch 包裹增强逻辑，异常时退回原请求体，绝不向上抛出
      try {
        const r = augmentCompletionRequest(body, { marker: MEMORY_MARKER });
        return r.body;
      } catch (err) {
        console.error('[Doubao-pp] 增强失败，退回原请求', err);
        return body;
      }
    },

    parseSSEStream(resp: Response): AsyncGenerator<StreamEvent> {
      return parseDoubaoSSE(resp);
    },

    resolveChatSessionId,
    buildSessionUrl,

    selectors: DOUBAO_SELECTORS,
    uiFrameworkGlobal: UIFRAMEWORK_GLOBAL,
  };
}
