// Doubao-pp 核心逻辑单元测试（P2-1 补充 + 偏差修复回归门禁）
//
// 覆盖：
//   P1 关键修复：applyPatchOp / extractBrief / collectAssistantText / collectStreamingText / augmentCompletionRequest
//   P2 未接线函数冒烟：chat-session 解析 / dom-hook（P2-a/b/d）/ auth 登录态读取
//   BUG 修复回归：resolveChatSessionId 不得误匹配 /chat/completion

import { describe, it, expect } from 'vitest';
import {
  applyPatchOp,
  collectAssistantText,
  collectStreamingText,
  extractBrief,
} from '../core/provider/doubao/stream-codec.ts';
import { augmentCompletionRequest, CONTEXT_SENTINEL } from '../core/provider/doubao/request-aug.ts';
import { resolveChatSessionId, buildSessionUrl } from '../core/provider/doubao/chat-session.ts';
import {
  getUIFramework,
  isVisibleMessage,
  createEmptyRequestCache,
  BRIDGE_EVENT,
} from '../core/provider/doubao/dom-hook.ts';
import { readPageAuth } from '../core/provider/doubao/auth.ts';

describe('applyPatchOp', () => {
  it('append 追加到末尾', () => {
    expect(applyPatchOp({ patch_type: 'append', patch_value: '好' }, '你好')).toBe('你好好');
  });
  it('replace 在偏移处替换', () => {
    expect(applyPatchOp({ patch_type: 'replace', patch_object: 1, patch_value: 'X' }, 'abc')).toBe(
      'aXc',
    );
  });
  it('insert 在偏移前插入', () => {
    expect(applyPatchOp({ patch_type: 'insert', patch_object: 2, patch_value: 'X' }, 'abc')).toBe(
      'abXc',
    );
  });
  it('未知 patch_type 安全回退原文本', () => {
    expect(applyPatchOp({ patch_type: 'weird' }, 'abc')).toBe('abc');
  });
  it('空 op 安全回退原文本', () => {
    expect(applyPatchOp(null, 'abc')).toBe('abc');
  });
});

describe('extractBrief / collectAssistantText', () => {
  const events = [
    {
      id: null,
      event: 'SSE_REPLY_END',
      data: { end_type: 1, msg_finish_attr: { brief: '完整文本' } },
    },
  ] as any;

  it('extractBrief 返回 brief', () => {
    expect(extractBrief(events)).toBe('完整文本');
  });
  it('collectAssistantText 优先 brief', () => {
    expect(collectAssistantText(events)).toBe('完整文本');
  });
  it('collectAssistantText 无 brief 时回退流式拼接', () => {
    const noBrief = [{ id: null, event: 'CHUNK_DELTA', data: { text: '流' } }] as any;
    expect(collectAssistantText(noBrief)).toBe('流');
  });
});

describe('collectStreamingText', () => {
  it('拼接 CHUNK_DELTA 并应用 patch_op 补丁', () => {
    const events = [
      {
        id: null,
        event: 'STREAM_MSG_NOTIFY',
        data: { content: { content_block: [{ content: { text_block: { text: '你' } } }] } },
      },
      { id: null, event: 'CHUNK_DELTA', data: { text: '好' } },
      { id: null, event: 'STREAM_CHUNK', data: { patch_op: { patch_type: 'append', patch_value: '！' } } },
    ] as any;
    expect(collectStreamingText(events)).toBe('你好！');
  });
});

describe('augmentCompletionRequest（记忆注入）', () => {
  const opts = { context: CONTEXT_SENTINEL + '[M]' };

  it('在用户文本前注入上下文', () => {
    const body = { messages: [{ content_block: [{ content: { text_block: { text: '你好' } } }] }] };
    const r = augmentCompletionRequest(body, opts);
    expect(r.changed).toBe(true);
    expect((r.body as any).messages[0].content_block[0].content.text_block.text).toBe(
      CONTEXT_SENTINEL + '[M]你好',
    );
  });
  it('已含哨兵则幂等跳过', () => {
    const body = {
      messages: [{ content_block: [{ content: { text_block: { text: CONTEXT_SENTINEL + '你好' } } }] }],
    };
    const r = augmentCompletionRequest(body, opts);
    expect(r.changed).toBe(false);
  });
  it('非法 body 退回原对象', () => {
    const body = { foo: 1 };
    const r = augmentCompletionRequest(body, opts);
    expect(r.changed).toBe(false);
    expect(r.body).toBe(body);
  });
  it('不污染原始 body（深拷贝）', () => {
    const body: any = {
      messages: [{ content_block: [{ content: { text_block: { text: '你好' } } }] }],
    };
    const r = augmentCompletionRequest(body, opts);
    expect(body.messages[0].content_block[0].content.text_block.text).toBe('你好');
    expect((r.body as any).messages[0].content_block[0].content.text_block.text).toBe(
      CONTEXT_SENTINEL + '[M]你好',
    );
  });
  it('超长上下文仅裁剪上下文、绝不截断用户原文（回归：避免静默丢失用户提问）', () => {
    const userText = '用户真实提问：请解释抗疏力土壤稳定剂的固化机理';
    const hugeContext = CONTEXT_SENTINEL + 'X'.repeat(9000); // 远超 maxInjectionChars
    const body: any = {
      messages: [{ content_block: [{ content: { text_block: { text: userText } } }] }],
    };
    const r = augmentCompletionRequest(body, { context: hugeContext, maxInjectionChars: 8000 });
    expect(r.changed).toBe(true);
    const out = (r.body as any).messages[0].content_block[0].content.text_block.text as string;
    // 用户原文必须完整保留（不被 slice 切掉）
    expect(out.endsWith(userText)).toBe(true);
    // 整体不超过上限（上下文被裁剪）
    expect(out.length).toBeLessThanOrEqual(8000);
    // 哨兵前缀仍在（上下文裁剪后仍含前缀）
    expect(out.startsWith(CONTEXT_SENTINEL)).toBe(true);
  });
});

describe('resolveChatSessionId / buildSessionUrl（BUG 修复回归）', () => {
  it('从真实会话页 URL 解析 id', () => {
    expect(resolveChatSessionId('https://www.doubao.com/chat/abc123xyz')).toBe('abc123xyz');
  });
  it('对 /chat/completion 端点返回 null（修复误匹配）', () => {
    expect(resolveChatSessionId('https://www.doubao.com/chat/completion')).toBeNull();
    expect(resolveChatSessionId('https://www.doubao.com/chat/completion?x=1')).toBeNull();
  });
  it('无关 URL 返回 null', () => {
    expect(resolveChatSessionId('https://www.doubao.com/')).toBeNull();
    expect(resolveChatSessionId('https://www.doubao.com/chat/')).toBeNull();
  });
  it('buildSessionUrl 拼出正确 URL', () => {
    expect(buildSessionUrl('abc123')).toBe('https://www.doubao.com/chat/abc123');
  });
});

describe('dom-hook 导出冒烟（P2 未接线函数守护）', () => {
  it('BRIDGE_EVENT 事件名已定义', () => {
    expect(typeof BRIDGE_EVENT).toBe('string');
    expect(BRIDGE_EVENT.length).toBeGreaterThan(0);
  });
  it('getUIFramework 在 node 环境返回 null 且不抛异常', () => {
    expect(getUIFramework()).toBeNull();
  });
  it('isVisibleMessage 正确过滤隐藏状态', () => {
    expect(isVisibleMessage(1)).toBe(false);
    expect(isVisibleMessage(7)).toBe(false);
    expect(isVisibleMessage(2)).toBe(true);
    expect(isVisibleMessage(undefined)).toBe(true);
  });
  it('createEmptyRequestCache 返回预期槽位结构', () => {
    expect(createEmptyRequestCache()).toEqual({ single: null, recent: null, title: null });
  });
});

describe('readPageAuth（P2 未接线函数守护）', () => {
  it('识别 session cookie 与 msToken', () => {
    const s = readPageAuth('sessionid=abc; mstoken=xyz; web_id=123');
    expect(s.hasSessionCookie).toBe(true);
    expect(s.hasMsToken).toBe(true);
    expect(s.webId).toBe('123');
  });
  it('缺失登录态时全部为 false/null', () => {
    const s = readPageAuth('foo=bar');
    expect(s.hasSessionCookie).toBe(false);
    expect(s.hasMsToken).toBe(false);
    expect(s.webId).toBeNull();
  });
});
