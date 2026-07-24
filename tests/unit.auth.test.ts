// auth 真实接线单测（node 环境）：readPageAuth + auth-state 软门禁 + provider 注入门禁
import { describe, it, expect, afterEach } from 'vitest';
import { readPageAuth } from '../core/provider/doubao/auth.ts';
import { setAuthed, isAuthed } from '../core/provider/doubao/auth-state.ts';
import { createDoubaoProvider } from '../core/provider/doubao/provider.ts';

afterEach(() => setAuthed(true)); // 还原 fail-open 默认，避免影响其他用例

describe('readPageAuth 纯函数', () => {
  it('解析 sessionid / mstoken / web_id', () => {
    const s = readPageAuth('a=1; sessionid=xyz; mstoken=MT; web_id=12345; b=2');
    expect(s.hasSessionCookie).toBe(true);
    expect(s.hasMsToken).toBe(true);
    expect(s.webId).toBe('12345');
  });

  it('无登录信号时全 false', () => {
    const s = readPageAuth('theme=dark; lang=zh');
    expect(s.hasSessionCookie).toBe(false);
    expect(s.hasMsToken).toBe(false);
    expect(s.webId).toBeNull();
  });
});

describe('auth-state 软门禁', () => {
  it('默认 fail-open（已登录）', () => {
    // 不调用 setAuthed，默认应为 true
    expect(isAuthed()).toBe(true);
  });

  it('setAuthed 可控', () => {
    setAuthed(false);
    expect(isAuthed()).toBe(false);
    setAuthed(true);
    expect(isAuthed()).toBe(true);
  });
});

describe('provider 注入受 auth 门禁控制', () => {
  const p = createDoubaoProvider();
  const body = {
    messages: [{ content_block: [{ content: { text_block: { text: '你好' } } }] }],
  };

  it('已登录（默认）→ 注入标记', () => {
    setAuthed(true);
    const out = p.augmentCompletionRequest(body) as any;
    expect(
      (out.messages[0].content_block[0].content.text_block.text as string),
    ).toContain('[来自Doubao-pp记忆系统的上下文]');
  });

  it('未登录 → 跳过注入，原样返回', () => {
    setAuthed(false);
    const out = p.augmentCompletionRequest(body);
    expect(out).toBe(body);
  });
});
