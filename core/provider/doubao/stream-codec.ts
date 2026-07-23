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

/**
 * patch_op 增量解析：将补丁操作应用到累积文本上。
 *
 * 补丁格式（从页面逆向观察）：
 *   {
 *     patch_object: "/content/..." | number,   // JSON 指针或数组索引定位
 *     patch_type: "replace" | "insert" | "append",
 *     patch_value: string                       // 替换/插入的文本内容
 *   }
 *
 * 语义：
 *   - replace: 根据 patch_object 定位已有片段，用 patch_value 替换
 *   - insert:  根据 patch_object 定位插入点，将 patch_value 插入到该点之前
 *   - append:  忽略 patch_object，将 patch_value 追加到文本末尾
 *
 * 对无法解析的 op 安全回退 baseText。
 */
export function applyPatchOp(op: unknown, baseText: string): string {
  if (!op || typeof op !== 'object') return baseText;
  const patch = op as {
    patch_object?: unknown;
    patch_type?: string;
    patch_value?: string;
  };

  const patchType = patch.patch_type;
  const patchValue = typeof patch.patch_value === 'string' ? patch.patch_value : '';

  // append：直接追加到末尾
  if (patchType === 'append') {
    return baseText + patchValue;
  }

  // 尝试从 patch_object 提取定位偏移量
  let offset = -1;
  const po = patch.patch_object;

  if (typeof po === 'number') {
    // 数组索引直接作为偏移
    offset = po;
  } else if (typeof po === 'string' && po.startsWith('/')) {
    // JSON 指针：提取最后一段作为整数索引（如 /content/1 → 1）
    const segments = po.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    const n = Number(last);
    if (!Number.isNaN(n)) {
      offset = n;
    }
  }

  // replace：用 patch_value 替换 baseText 中的对应片段
  if (patchType === 'replace') {
    if (offset >= 0 && offset < baseText.length) {
      return baseText.slice(0, offset) + patchValue + baseText.slice(offset + patchValue.length);
    }
    // 无有效偏移时尝试尾部替换（页面实际行为常为追加式替换）
    return baseText + patchValue;
  }

  // insert：在偏移位置之前插入 patch_value
  if (patchType === 'insert') {
    if (offset >= 0 && offset <= baseText.length) {
      return baseText.slice(0, offset) + patchValue + baseText.slice(offset);
    }
    // 无效偏移则追加
    return baseText + patchValue;
  }

  // 未知 patch_type → 安全回退
  return baseText;
}

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

// 流式增量显示用：顺序拼接 STREAM_MSG_NOTIFY 首段 + 所有 CHUNK_DELTA.text，
// 并对 STREAM_CHUNK 的 patch_op 做增量补丁（修复"缺失某字"的回退场景）。
// 注意：此拼接用于"实时逐字显示"，不保证与最终完整文本逐字相等（前缀/补丁差异），
// 但通过 patch_op 可以更接近 brief 的权威完整文本。
export function collectStreamingText(events: StreamEvent[]): string {
  const parts: string[] = [];
  let patchedText = ''; // 累积文本，供 patch_op 基于偏移操作
  for (const e of events) {
    if (!e.data || typeof e.data !== 'object') continue;
    if (e.event === 'STREAM_MSG_NOTIFY') {
      const t = firstTextBlockText(e.data);
      if (t) {
        patchedText = t;
        parts.length = 0; // 重新初始化：STREAM_MSG_NOTIFY 提供基础文本
        parts.push(t);
      }
    } else if (e.event === 'CHUNK_DELTA') {
      const t = (e.data as { text?: string }).text;
      if (typeof t === 'string') {
        patchedText += t;
        parts.push(t);
      }
    } else if (e.event === 'STREAM_CHUNK') {
      // STREAM_CHUNK 携带 patch_op：对已累积的文本做增量补丁
      const chunkData = e.data as { patch_op?: unknown };
      if (chunkData.patch_op) {
        patchedText = applyPatchOp(chunkData.patch_op, patchedText);
        // 补丁后重新生成 parts（清空再重建，确保一致性）
        parts.length = 0;
        parts.push(patchedText);
      }
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
