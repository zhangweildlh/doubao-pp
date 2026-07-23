// Doubao-pp 核心逻辑单元测试（P2-1 补充，作为"无 BUG"回归门禁）
//
// 覆盖 P1 关键修复点：
//   - applyPatchOp（append/replace/insert/未知 op/空 op 安全回退）
//   - extractBrief / collectAssistantText（brief 优先，缺 brief 回退流式）
//   - collectStreamingText（CHUNK_DELTA 拼接 + STREAM_CHUNK patch_op 补丁）
//   - augmentCompletionRequest（标记注入 / 幂等 / 非法 body 退回 / 不污染原 body）

import { describe, it, expect } from 'vitest';
import {
  applyPatchOp,
  collectAssistantText,
  collectStreamingText,
  extractBrief,
} from '../core/provider/doubao/stream-codec.ts';
import { augmentCompletionRequest } from '../core/provider/doubao/request-aug.ts';

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
  const opts = { marker: '[M]' };

  it('在用户文本前注入标记', () => {
    const body = { messages: [{ content_block: [{ content: { text_block: { text: '你好' } } }] }] };
    const r = augmentCompletionRequest(body, opts);
    expect(r.changed).toBe(true);
    expect((r.body as any).messages[0].content_block[0].content.text_block.text).toBe('[M]你好');
  });
  it('已含标记则幂等跳过', () => {
    const body = { messages: [{ content_block: [{ content: { text_block: { text: '[M]你好' } } }] }] };
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
    expect((r.body as any).messages[0].content_block[0].content.text_block.text).toBe('[M]你好');
  });
});
