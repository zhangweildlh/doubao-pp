// createDoubaoProvider 契约集成测试（node 环境）
//
// 验证 ChatProvider 实现的核心契约：路由匹配、记忆注入增强、非法 body 防御。

import { describe, it, expect } from 'vitest';
import { createDoubaoProvider } from '../core/provider/doubao/provider.ts';

describe('createDoubaoProvider 契约（集成）', () => {
  const p = createDoubaoProvider();

  it('id 与 webOrigin 正确', () => {
    expect(p.id).toBe('doubao');
    expect(p.webOrigin).toContain('doubao.com');
  });

  it('matchWebRoute 仅命中 /chat/completion', () => {
    expect(p.matchWebRoute('https://www.doubao.com/chat/completion', 'POST', p.webOrigin)).toBe(true);
    expect(p.matchWebRoute('https://www.doubao.com/chat/abc123', 'POST', p.webOrigin)).toBe(false);
    expect(p.matchWebRoute('https://www.doubao.com/chat/completion', 'GET', p.webOrigin)).toBe(true);
  });

  it('augmentCompletionRequest 注入标记并返回增强体（不污染原对象）', () => {
    const body = {
      messages: [{ content_block: [{ content: { text_block: { text: '你好' } } }] }],
    };
    const out = p.augmentCompletionRequest(body) as any;
    expect(out).not.toBe(body);
    const txt = out.messages[0].content_block[0].content.text_block.text as string;
    expect(txt).toContain('[来自Doubao-pp记忆系统的上下文]');
    expect(txt).toContain('你好');
    // 原 body 不被修改（深拷贝增强）
    expect((body as any).messages[0].content_block[0].content.text_block.text).toBe('你好');
  });

  it('augmentCompletionRequest 防御：非法 body 原样返回', () => {
    const bad = { foo: 1 };
    expect(p.augmentCompletionRequest(bad)).toBe(bad);
    const arr = [] as any[];
    expect(p.augmentCompletionRequest(arr)).toBe(arr);
  });
});
