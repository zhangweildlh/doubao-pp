// 浮窗展示状态归约器单测（纯函数，无 DOM 依赖）
import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  reduceBridgeEvent,
  type FloatingState,
} from '../core/ui/floating-state.ts';
import type { BridgeDetail } from '../core/provider/doubao/dom-hook.ts';

describe('floating-state 归约', () => {
  it('初始态所有字段为中性值', () => {
    const s = createInitialState();
    expect(s.injected).toBe(false);
    expect(s.conversationId).toBeNull();
    expect(s.sectionId).toBeNull();
    expect(s.sessionUrl).toBeNull();
    expect(s.streamingText).toBe('');
    expect(s.finalText).toBe('');
    expect(s.eventCount).toBe(0);
    expect(s.lastEventAt).toBe(0);
  });

  it('REQUEST_AUGMENTED 置 injected 并计数', () => {
    let s = createInitialState();
    s = reduceBridgeEvent(s, { type: 'REQUEST_AUGMENTED', requestId: 'r1' });
    expect(s.injected).toBe(true);
    expect(s.eventCount).toBe(1);
  });

  it('CONVERSATION_READY 记录会话元信息', () => {
    let s = createInitialState();
    const d: BridgeDetail = {
      type: 'CONVERSATION_READY',
      requestId: 'r1',
      conversationId: 'c1',
      sectionId: 's1',
      sessionUrl: 'https://www.doubao.com/chat/c1',
    };
    s = reduceBridgeEvent(s, d);
    expect(s.conversationId).toBe('c1');
    expect(s.sectionId).toBe('s1');
    expect(s.sessionUrl).toBe('https://www.doubao.com/chat/c1');
  });

  it('STREAMING_TEXT 覆盖流式文本，ASSISTANT_TEXT 替换并清空流式', () => {
    let s = createInitialState();
    s = reduceBridgeEvent(s, { type: 'STREAMING_TEXT', requestId: 'r1', text: '你' });
    expect(s.streamingText).toBe('你');
    s = reduceBridgeEvent(s, { type: 'STREAMING_TEXT', requestId: 'r1', text: '你好呀' });
    expect(s.streamingText).toBe('你好呀');
    s = reduceBridgeEvent(s, {
      type: 'ASSISTANT_TEXT',
      requestId: 'r1',
      text: '你好呀！有什么我可以帮你的吗😊',
    });
    expect(s.finalText).toBe('你好呀！有什么我可以帮你的吗😊');
    expect(s.streamingText).toBe(''); // 定稿后清空流式缓冲
  });

  it('不可变性：归约返回新对象且不修改原状态', () => {
    const s0 = createInitialState();
    const s1 = reduceBridgeEvent(s0, { type: 'REQUEST_AUGMENTED', requestId: 'r1' });
    expect(s0.injected).toBe(false);
    expect(s1.injected).toBe(true);
    expect(s1).not.toBe(s0);
  });

  it('完整事件序列：注入→会话→流式→定稿，终态正确', () => {
    let s: FloatingState = createInitialState();
    s = reduceBridgeEvent(s, { type: 'REQUEST_AUGMENTED', requestId: 'r1' });
    s = reduceBridgeEvent(s, {
      type: 'CONVERSATION_READY',
      requestId: 'r1',
      conversationId: 'c1',
      sectionId: 's1',
      sessionUrl: 'https://www.doubao.com/chat/c1',
    });
    s = reduceBridgeEvent(s, { type: 'STREAMING_TEXT', requestId: 'r1', text: '你好' });
    s = reduceBridgeEvent(s, {
      type: 'ASSISTANT_TEXT',
      requestId: 'r1',
      text: '你好！很高兴为你服务。',
    });
    expect(s.injected).toBe(true);
    expect(s.conversationId).toBe('c1');
    expect(s.finalText).toBe('你好！很高兴为你服务。');
    expect(s.streamingText).toBe('');
    expect(s.eventCount).toBe(4);
  });

  it('多轮对话：新一轮 REQUEST_AUGMENTED 清空上一轮定稿，实时流式不被遮盖', () => {
    let s: FloatingState = createInitialState();
    // 第一轮：注入 → 定稿
    s = reduceBridgeEvent(s, { type: 'REQUEST_AUGMENTED', requestId: 'r1' });
    s = reduceBridgeEvent(s, {
      type: 'ASSISTANT_TEXT',
      requestId: 'r1',
      text: '第一轮定稿文本',
    });
    expect(s.finalText).toBe('第一轮定稿文本');
    expect(s.currentRequestId).toBe('r1');
    // 第二轮：新 requestId 触发轮次切换，应清空上一轮定稿
    s = reduceBridgeEvent(s, { type: 'REQUEST_AUGMENTED', requestId: 'r2' });
    expect(s.finalText).toBe(''); // 上一轮定稿已清空
    expect(s.streamingText).toBe('');
    expect(s.currentRequestId).toBe('r2');
    // 第二轮流式文本应正常显示（不会被残留的 finalText 遮盖）
    s = reduceBridgeEvent(s, { type: 'STREAMING_TEXT', requestId: 'r2', text: '第二轮流式内容' });
    expect(s.streamingText).toBe('第二轮流式内容');
    expect(s.finalText).toBe(''); // 仍有空，renderLive 显示流式而非旧定稿
    // 第二轮定稿替换
    s = reduceBridgeEvent(s, { type: 'ASSISTANT_TEXT', requestId: 'r2', text: '第二轮定稿文本' });
    expect(s.finalText).toBe('第二轮定稿文本');
    expect(s.streamingText).toBe('');
  });
});
