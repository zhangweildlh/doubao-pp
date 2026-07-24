// 融合方案 §4.2-1 / §2.6：路线 A 原地增强（非检测，步骤 4 doubao/request-aug）
//
// 设计要点（关键降代价 + 非检测双收益）：
//   - 不重建完整请求体（免逆向 body 结构的高代价）
//   - 不自己算 a_bogus / msToken（页面 fetch hook 自动注入 → 服务器视角为正常用户请求）
//   - 只定位出站 /chat/completion 请求体中"用户文本"节点，将记忆 / Skills 上下文注入其前
//   - 幂等：已注入过则跳过，避免重复注入

export interface TextBlock {
  text: string;
  [k: string]: unknown;
}
export interface ContentBlock {
  block_type?: number;
  content?: { text_block?: TextBlock };
  [k: string]: unknown;
}
export interface DoubaoMessage {
  content_block?: ContentBlock[];
  [k: string]: unknown;
}
export interface DoubaoCompletionBody {
  messages?: DoubaoMessage[];
  [k: string]: unknown;
}

export interface AugmentOptions {
  /** 完整待注入上下文（含稳定哨兵前缀 CONTEXT_SENTINEL），将置于用户文本之前 */
  context: string;
  // 预留：超过该长度的注入会被裁剪，避免破坏请求
  maxInjectionChars?: number;
}

export interface AugmentResult {
  body: unknown;
  changed: boolean;
  injectedText: string;
}

/**
 * 注入上下文稳定哨兵：幂等判定依据（不随动态内容变化，避免重试时误判）。
 * 同时作为"记忆/技能已注入"的可识别标记（供浮窗/验证读取）。
 */
export const CONTEXT_SENTINEL = '[Doubao-pp 上下文] ';

// 定位路径（实测 §2.3 / 真实抓包核对）：
//   body.messages[0].content_block[0].content.text_block.text
export function augmentCompletionRequest(
  body: unknown,
  opts: AugmentOptions,
): AugmentResult {
  if (!body || typeof body !== 'object') {
    return { body, changed: false, injectedText: '' };
  }
  const typed = body as DoubaoCompletionBody;
  const msgs = typed.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) {
    return { body, changed: false, injectedText: '' };
  }
  const first = msgs[0];
  const block = first.content_block?.[0];
  const tb = block?.content?.text_block;
  if (!tb || typeof tb.text !== 'string') {
    return { body, changed: false, injectedText: '' };
  }
  // 幂等：已含哨兵前缀即视为已注入，避免重复注入（哨兵稳定，不受动态内容影响）
  if (tb.text.indexOf(CONTEXT_SENTINEL) !== -1) {
    return { body, changed: false, injectedText: '' };
  }
  let injected = opts.context + tb.text;
  if (opts.maxInjectionChars && injected.length > opts.maxInjectionChars) {
    // 超长时仅裁剪"上下文"部分，绝不截断用户原文（避免静默丢失用户提问）。
    // 计算给用户原文预留后的剩余额度；上下文超长则截断上下文，用户文本始终完整保留。
    const room = opts.maxInjectionChars - tb.text.length;
    if (room > 0) {
      injected = opts.context.slice(0, room) + tb.text;
    } else {
      // 极端：用户原文本身已超上限，放弃注入上下文，仅保留用户原文（fail-open）
      injected = tb.text;
    }
  }
  // 深拷贝后只改文本节点，其余（client_meta/option/ext 等）原样保留
  const newBody = structuredClone(typed) as DoubaoCompletionBody;
  const target = newBody.messages![0].content_block![0].content!.text_block!;
  target.text = injected;
  return { body: newBody, changed: true, injectedText: injected };
}
