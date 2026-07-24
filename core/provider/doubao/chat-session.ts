// 融合方案 §4.1：会话 URL 解析（步骤 4 doubao/chat-session）
//
// 会话标识来源：SSE_ACK.data.ack_client_meta.{conversation_id, section_id}
// 豆包会话页 URL 形如 https://www.doubao.com/chat/<conversation_id>

import { DOUBAO_WEB_ORIGIN } from './contracts.ts';

export function resolveChatSessionId(url: string): string | null {
  // 负向后顾排除 API 端点 /chat/completion：否则会把 "completion" 误当会话 id
  // （fetch-hook 回退路径会对 /chat/completion 请求 URL 调用本函数）。
  const m = url.match(/doubao\.com\/chat\/(?!completion\b)([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

export function buildSessionUrl(id: string): string {
  return `${DOUBAO_WEB_ORIGIN}/chat/${id}`;
}
