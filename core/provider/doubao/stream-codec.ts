// 融合方案 §2.2：真实 SSE 命名事件解析 → 增量文本（步骤 4 doubao/stream-codec）
//
// 实测事件序列（发"你好"）：
//   SSE_HEARTBEAT / SSE_ACK / FULL_MSG_NOTIFY / STREAM_MSG_NOTIFY
//   / CHUNK_DELTA×N / STREAM_CHUNK×N（patch_op 增量）/ SSE_REPLY_END×3
//
// 解析规则（实测校正，取代早期"CHUNK_DELTA 拼接=最终文本"的错误表述）：
//   ★ 权威完整助手文本 = 仅 SSE_REPLY_END(end_type:1) 的 msg_finish_attr.brief。
//     —— brief 是服务端给出的"定稿"，与用户在界面看到的最终文本逐字一致。
//   ★ CHUNK_DELTA / STREAM_MSG_NOTIFY 只用于"实时逐字显示"（流式渲染），
//     其拼接结果不保证与 brief 逐字相等（前缀/补丁差异），不可用作记忆/上下文存储。
//   ★ STREAM_CHUNK 携带 patch_op（JSON 补丁语义：patch_object 定位、patch_type 定操作、
//     patch_value 为值），是页面增量构建正文的底层机制；原型不解析补丁，
//     生产如需"无 brief 回退"可在此实现 applyPatchOp（见审计优化说明）。
//
// 本模块是验证①（validate_stream_codec.py）的 TypeScript 等价实现，
// 直接消费 fetch Response 流，暴露 AsyncGenerator<StreamEvent>，
// 可接入 Deepseek-pp 现有流式渲染管道。

import type { ChatProvider, StreamEvent } from '../types.ts';

type RawEvent = { id: string | null; event: string | null; data: string[] };

// 把原始 SSE 文本按空行分帧，逐事件解析为 {id, event, data(已尝试 JSON 解析)}
export async function* parseDoubaoSSE(resp: Response): AsyncGenerator<StreamEvent> {
  if (!resp.body) return;
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let cur: RawEvent = { id: null, event: null, data: [] };

  const emitCurrent = (): StreamEvent | null => {
    if (cur.event === null && cur.data.length === 0) return null;
    const ev = buildEvent(cur);
    cur = { id: null, event: null, data: [] };
    return ev;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line === '') {
        const ev = emitCurrent();
        if (ev) yield ev;
        continue;
      }
      if (line.startsWith('id:')) cur.id = line.slice(3).trim();
      else if (line.startsWith('event:')) cur.event = line.slice(6).trim();
      else if (line.startsWith('data:')) cur.data.push(line.slice(5).trim());
    }
  }
  const last = emitCurrent();
  if (last) yield last;
}

function buildEvent(cur: RawEvent): StreamEvent {
  const raw = cur.data.join('\n');
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // 非 JSON 时保留原文本
  }
  return { id: cur.id, event: cur.event ?? '', data };
}

// 取权威完整助手文本：仅 SSE_REPLY_END(end_type:1) 的 msg_finish_attr.brief 可靠。
// 多个 SSE_REPLY_END 中只有 end_type:1 携带 brief（实测 end_type:2/3 为 suggest/finish 标记）。
export function extractBrief(events: StreamEvent[]): string | null {
  let brief: string | null = null;
  for (const e of events) {
    if (e.event === 'SSE_REPLY_END' && e.data && typeof e.data === 'object') {
      const b = (e.data as { msg_finish_attr?: { brief?: string } }).msg_finish_attr?.brief;
      if (typeof b === 'string') brief = b; // 取最后一个含 brief 的（通常唯一 end_type:1）
    }
  }
  return brief;
}

// 从 content_block 结构里取首个 text_block.text（适配 STREAM_MSG_NOTIFY / FULL_MSG_NOTIFY）
function firstTextBlockText(d: unknown): string | null {
  const msg = d as {
    content?: { content_block?: Array<{ content?: { text_block?: { text?: string } } }> };
  };
  const blocks = msg.content?.content_block;
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      const t = b.content?.text_block?.text;
      if (typeof t === 'string') return t;
    }
  }
  return null;
}

// 流式增量显示用：顺序拼接 STREAM_MSG_NOTIFY 首段 + 所有 CHUNK_DELTA.text。
// 注意：此拼接用于"实时逐字显示"，不保证与最终完整文本逐字相等（前缀/补丁差异）。
export function collectStreamingText(events: StreamEvent[]): string {
  const parts: string[] = [];
  for (const e of events) {
    if (!e.data || typeof e.data !== 'object') continue;
    if (e.event === 'STREAM_MSG_NOTIFY') {
      const t = firstTextBlockText(e.data);
      if (t) parts.push(t);
    } else if (e.event === 'CHUNK_DELTA') {
      const t = (e.data as { text?: string }).text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  return parts.join('');
}

// 权威完整助手文本（用于记忆/上下文存储）：优先 brief，缺失时回退流式拼接。
export function collectAssistantText(events: StreamEvent[]): string {
  const brief = extractBrief(events);
  if (brief) return brief;
  return collectStreamingText(events);
}
