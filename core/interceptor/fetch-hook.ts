// 融合方案 §4.2 / 路线 A：豆包感知的 window.fetch 拦截器（生产落地 v2）
//
// 相对 v1 的增强：
//   - 解析 SSE_ACK 抽取会话标识（conversation_id / section_id），经事件桥下发
//   - 区分「流式逐字文本」(STREAM_MSG_NOTIFY/CHUNK_DELTA) 与「定稿文本」(SSE_REPLY_END.brief)
//   - 结构化事件桥协议（REQUEST_AUGMENTED / CONVERSATION_READY / STREAMING_TEXT /
//     ASSISTANT_TEXT / ERROR），供侧边栏/浮窗/记忆系统消费
//   - 会话 URL 经 provider.resolveChatSessionId 解析，缺失时回退 SSE_ACK

import type { ChatProvider, StreamEvent } from '../provider/types.ts';
import { getActiveProvider } from '../provider/active.ts';
import {
  collectAssistantText,
  collectStreamingText,
} from '../provider/doubao/stream-codec.ts';
import { bridgeEmit } from '../provider/doubao/dom-hook.ts';

export interface RequestContext {
  requestId: string;
  url: string;
  providerId: string;
}

export interface ConversationMeta {
  conversationId: string | null;
  sectionId: string | null;
  sessionUrl: string | null;
}

export interface FetchHookCallbacks {
  onRequestBody?(body: unknown, ctx: RequestContext): void;
  onConversationReady?(meta: ConversationMeta, ctx: RequestContext): void;
  onStreamingText?(text: string, ctx: RequestContext): void;
  onAssistantText?(text: string, ctx: RequestContext): void;
  onError?(message: string, error?: unknown): void;
}

let installed = false;

export function installFetchHook(callbacks: FetchHookCallbacks = {}): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  async function hookedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = (init?.method ?? 'POST').toUpperCase();
    const provider = getActiveProvider();
    const isCompletion = provider.matchWebRoute(url, method, provider.webOrigin);

    if (!isCompletion) return originalFetch(input, init);

    const ctx: RequestContext = {
      requestId: makeRequestId(url),
      url,
      providerId: provider.id,
    };

    // —— 路线 A：原地增强请求体（只改文本节点，不重建 body、不算签名）——
    let finalInit = init;
    if (init?.body != null && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body) as unknown;
        const augmented = provider.augmentCompletionRequest(parsed);
        finalInit = { ...(init as RequestInit), body: JSON.stringify(augmented) };
        callbacks.onRequestBody?.(parsed, ctx);
        bridgeEmit({ type: 'REQUEST_AUGMENTED', requestId: ctx.requestId });
      } catch (err) {
        // 增强失败时退回原始请求，保证豆包可正常使用
        callbacks.onError?.('请求体增强失败（已退回原始请求）', err);
      }
    }

    const response = await originalFetch(input, finalInit);

    // —— 克隆响应流：原始响应交回页面，克隆流用于解析 SSE ——
    const observed = response.clone();
    void consumeStream(provider, observed, ctx, callbacks).catch((err) => {
      callbacks.onError?.('SSE 解析异常', err);
    });

    return response;
  }

  window.fetch = hookedFetch as typeof window.fetch;
}

function extractConversationMeta(
  events: StreamEvent[],
  provider: ChatProvider,
  url: string,
): ConversationMeta {
  let conversationId: string | null = null;
  let sectionId: string | null = null;
  for (const e of events) {
    if (e.event === 'SSE_ACK' && e.data && typeof e.data === 'object') {
      const ack = (e.data as { ack_client_meta?: { conversation_id?: string; section_id?: string } })
        .ack_client_meta;
      if (ack) {
        if (typeof ack.conversation_id === 'string') conversationId = ack.conversation_id;
        if (typeof ack.section_id === 'string') sectionId = ack.section_id;
      }
    }
  }
  // 回退：从 URL 解析会话标识
  if (!conversationId) conversationId = provider.resolveChatSessionId(url);
  const sessionUrl = conversationId ? provider.buildSessionUrl(conversationId) : null;
  return { conversationId, sectionId, sessionUrl };
}

async function consumeStream(
  provider: ChatProvider,
  response: Response,
  ctx: RequestContext,
  callbacks: FetchHookCallbacks,
): Promise<void> {
  const events: StreamEvent[] = [];
  for await (const ev of provider.parseSSEStream(response)) {
    events.push(ev);
  }

  const meta = extractConversationMeta(events, provider, ctx.url);
  if (meta.conversationId) {
    callbacks.onConversationReady?.(meta, ctx);
    bridgeEmit({ type: 'CONVERSATION_READY', ...meta, requestId: ctx.requestId });
  }

  // 流式逐字文本：仅用于实时显示，不保证与定稿逐字相等
  const streaming = collectStreamingText(events);
  if (streaming.length > 0) {
    callbacks.onStreamingText?.(streaming, ctx);
  }

  // 定稿文本：权威 brief（缺失时回退流式拼接），用于记忆/上下文存储
  const finalText = collectAssistantText(events);
  if (finalText.length > 0) {
    bridgeEmit({ type: 'ASSISTANT_TEXT', text: finalText, requestId: ctx.requestId });
    callbacks.onAssistantText?.(finalText, ctx);
  }
}

function makeRequestId(url: string): string {
  return `${Date.now()}-${url.slice(-16)}`;
}
