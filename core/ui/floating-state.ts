// 融合方案 §4.2 / 第4步：页内浮窗展示状态归约器（纯函数，可单测、无 DOM 依赖）
//
// 把事件桥（window CustomEvent BRIDGE_EVENT）下发的 BridgeDetail 归约为浮窗的
// 展示状态：记忆注入标记、当前会话元信息、实时流式文本、定稿文本。
// 归约保持不可变（每次返回新对象），便于 React/原生渲染做浅比较。

import type { BridgeDetail } from '../provider/doubao/dom-hook.ts';

export interface FloatingState {
  /** 本次会话是否已把记忆注入请求体（REQUEST_AUGMENTED 触发） */
  injected: boolean;
  /** 当前会话 id（CONVERSATION_READY 解析自 SSE_ACK） */
  conversationId: string | null;
  /** 段落 id */
  sectionId: string | null;
  /** 会话链接（provider.buildSessionUrl 生成） */
  sessionUrl: string | null;
  /** 实时流式累计文本（STREAMING_TEXT，定稿前显示） */
  streamingText: string;
  /** 定稿权威文本（ASSISTANT_TEXT，取自 brief） */
  finalText: string;
  /** 已接收桥接事件数（含心跳外的有效事件） */
  eventCount: number;
  /** 最近一次事件时间戳 */
  lastEventAt: number;
}

export function createInitialState(): FloatingState {
  return {
    injected: false,
    conversationId: null,
    sectionId: null,
    sessionUrl: null,
    streamingText: '',
    finalText: '',
    eventCount: 0,
    lastEventAt: 0,
  };
}

/** 把一个桥接事件应用到当前状态，返回新状态（不可变更新） */
export function reduceBridgeEvent(state: FloatingState, detail: BridgeDetail): FloatingState {
  const next: FloatingState = {
    ...state,
    eventCount: state.eventCount + 1,
    lastEventAt: Date.now(),
  };
  switch (detail.type) {
    case 'REQUEST_AUGMENTED':
      // 标记记忆已注入请求体
      next.injected = true;
      break;
    case 'CONVERSATION_READY':
      next.conversationId = detail.conversationId;
      next.sectionId = detail.sectionId;
      next.sessionUrl = detail.sessionUrl;
      break;
    case 'STREAMING_TEXT':
      // 实时累计文本（fetch-hook 每事件已重算完整累计，这里直接覆盖）
      next.streamingText = detail.text;
      break;
    case 'ASSISTANT_TEXT':
      // 定稿：权威文本替换显示，并清空流式缓冲（避免定稿后再叠加旧流式）
      next.finalText = detail.text;
      next.streamingText = '';
      break;
    case 'ERROR':
      // 仅计数，不改变展示状态
      break;
  }
  return next;
}
