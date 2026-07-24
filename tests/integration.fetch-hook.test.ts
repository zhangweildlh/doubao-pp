// fetch-hook 拦截契约集成测试（node 环境）
//
// 桩接 window.fetch 与 chrome.runtime，验证：
//   1) installFetchHook 仅安装一次（单例防重装）
//   2) 对 /chat/completion 请求原地增强请求体（记忆标记注入）
//   3) 非 completion 路由直接放行、不增强
// 不需要真实浏览器；SSE 流用空 Response 模拟，避免触发完整解析链路。

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installFetchHook } from '../core/interceptor/fetch-hook.ts';

describe('fetch-hook 拦截契约（集成）', () => {
  let capturedBody: string | null = null;
  let fetchCalls = 0;
  let realFetch: any;

  beforeAll(() => {
    (globalThis as any).chrome = { runtime: { sendMessage: vi.fn() } };
    realFetch = vi.fn(async (_input: any, init?: any) => {
      fetchCalls++;
      capturedBody = init?.body ?? null;
      return new (globalThis as any).Response('', { status: 200 });
    });
    (globalThis as any).window = { fetch: realFetch };
  });

  it('installFetchHook 仅安装一次（单例防重装）', () => {
    installFetchHook({});
    const after1 = (globalThis as any).window.fetch;
    installFetchHook({});
    const after2 = (globalThis as any).window.fetch;
    expect(after1).toBe(after2); // 第二次安装不会生成新的包裹函数
    expect(after1).not.toBe(realFetch); // 首次安装确实包裹了原生 fetch
  });

  it('对 /chat/completion 请求原地增强请求体（注入记忆标记）', async () => {
    const body = {
      messages: [{ content_block: [{ content: { text_block: { text: '你好' } } }] }],
    };
    await (globalThis as any).window.fetch('https://www.doubao.com/chat/completion', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    expect(fetchCalls).toBeGreaterThan(0);
    expect(capturedBody).not.toBeNull();
    const parsed = JSON.parse(capturedBody as string);
    const txt = parsed.messages[0].content_block[0].content.text_block.text as string;
    expect(txt).toContain('[来自Doubao-pp记忆系统的上下文]');
    expect(txt).toContain('你好');
  });

  it('非 completion 路由直接放行、不增强', async () => {
    const before = fetchCalls;
    await (globalThis as any).window.fetch('https://www.doubao.com/some/other', {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ content_block: [{ content: { text_block: { text: 'x' } } }] }],
      }),
    });
    expect(fetchCalls).toBe(before + 1);
    const parsed = JSON.parse(capturedBody as string);
    expect(parsed.messages[0].content_block[0].content.text_block.text).toBe('x');
  });
});
