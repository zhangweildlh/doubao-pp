// 融合方案 §4.1：豆包 ChatProvider 实现聚合（步骤 4 doubao/ 装配点）
//
// 将 contracts / stream-codec / request-aug / chat-session / dom-hook / auth
// 收口为满足统一契约 ChatProvider 的单一对象。fetch-hook 仅依赖此对象，
// 不再感知平台差异。

import type { ChatProvider, StreamEvent } from '../types.ts';
import {
  DOUBAO_WEB_ORIGIN,
  DOUBAO_SELECTORS,
  UI_FRAMEWORK_CANDIDATES,
} from './contracts.ts';
import { parseDoubaoSSE } from './stream-codec.ts';
import { augmentCompletionRequest, CONTEXT_SENTINEL } from './request-aug.ts';
import { resolveChatSessionId, buildSessionUrl } from './chat-session.ts';
import { isAuthed } from './auth-state.ts';
import { loadInjectionContext } from './injection.ts';

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

    // 异步加载注入上下文（记忆 + 技能 + MCP），供增强前读取。
    // 失败 fail-open：返回空串时增强退化为仅注入哨兵前缀。
    async loadInjectionContext(): Promise<string> {
      return loadInjectionContext();
    },

    augmentCompletionRequest(body: unknown, context?: string): unknown {
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

      // auth 真实接线（软门禁，fail-open）：未确认登录态时跳过记忆注入，
      // 避免把标记发到登录/异常上下文；登录态判定由 startAuthWatcher 经 document.cookie 置位。
      if (!isAuthed()) return body;

      // 用 try-catch 包裹增强逻辑，异常时退回原请求体，绝不向上抛出
      try {
        const dynamic = context && context.length > 0 ? context : '';
        const fullContext = CONTEXT_SENTINEL + dynamic;
        const r = augmentCompletionRequest(body, {
          context: fullContext,
          maxInjectionChars: 8000,
        });
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
    // 注：uiFrameworkGlobal 仅作契约占位；实际框架检测由 dom-observer 经
    // dom-hook.getUIFrameworkName() 用 UI_FRAMEWORK_CANDIDATES 软检测列表完成
    // （真机验收确认 DoubaoUIFramework 在豆包网页版不存在，故取候选[0]仅为契约示意）。
    uiFrameworkGlobal: UI_FRAMEWORK_CANDIDATES[0],
  };
}
