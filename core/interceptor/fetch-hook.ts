// 融合方案 §4.2 / 路线 A：豆包感知的 window.fetch 拦截器（生产落地 v1）
//
// 职责（最小可行集，不含 Deepseek 完整业务）：
//   1. 在 MAIN world 钩住 window.fetch（页面原生签名 a_bogus/msToken 自动保留）。
//   2. 识别豆包 /chat/completion 出站请求，原地增强文本节点（路线 A 非检测）。
//   3. 克隆响应流，解析命名事件 SSE，抽取权威助手文本（brief）。
//   4. 通过 DOM 事件桥（BRIDGE_EVENT）把结果广播给扩展其余部分（侧边栏/浮窗/记忆）。
//
// 接入点：entrypoints/main-world.content.ts 调用 installFetchHook(callbacks)。

import type { ChatProvider, StreamEvent } from '../provider/types.ts';
import { getActiveProvider } from '../provider/active.ts';
import { collectAssistantText } from '../provider/doubao/stream-codec.ts';
import { BRIDGE_EVENT, bridgeEmit } from '../provider/doubao/dom-hook.ts';

export interface FetchHookCallbacks {
  onRequestBody?(body: unknown, requestId: string): void;
  onAssistantText?(text: string, requestId: string): void;
  onError?(message: string, error?: unknown): void;
}

function makeRequestId(url: string): string {
  return `${Date.now()}-${url.slice(-16)}`;
}

let installed = false;

export function installFetchHook(callbacks: FetchHookCallbacks = {}): void {
  if (installed) {
    return;
  }
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
    const provider: ChatProvider = getActiveProvider();
    const isCompletion = provider.matchWebRoute(url, method, provider.webOrigin);

    if (!isCompletion) {
      return originalFetch(input, init);
    }

    // —— 路线 A：原地增强请求体（只改文本节点，不重建 body、不算签名）——
    let finalInit = init;
    if (init?.body != null && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body) as unknown;
        const augmented = provider.augmentCompletionRequest(parsed);
        finalInit = { ...(init as RequestInit), body: JSON.stringify(augmented) };
        callbacks.onRequestBody?.(parsed, makeRequestId(url));
      } catch (err) {
        // 增强失败时退回原始请求，保证豆包可正常使用
        callbacks.onError?.('请求体增强失败（已退回原始请求）', err);
      }
    }

    const response = await originalFetch(input, finalInit);

    // —— 克隆响应流：原始响应交回页面，克隆流用于解析 SSE ——
    const observed = response.clone();
    void consumeStream(provider, observed, callbacks).catch((err) => {
      callbacks.onError?.('SSE 解析异常', err);
    });

    return response;
  }

  window.fetch = hookedFetch as typeof window.fetch;
}

async function consumeStream(
  provider: ChatProvider,
  response: Response,
  callbacks: FetchHookCallbacks,
): Promise<void> {
  const events: StreamEvent[] = [];
  for await (const ev of provider.parseSSEStream(response)) {
    events.push(ev);
  }
  const text = collectAssistantText(events);
  if (text.length > 0) {
    bridgeEmit({ type: 'ASSISTANT_TEXT', text });
    callbacks.onAssistantText?.(text, makeRequestId(provider.webOrigin));
  }
}
