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
  marker: string;
  // 预留：超过该长度的注入会被裁剪，避免破坏请求
  maxInjectionChars?: number;
}

export interface AugmentResult {
  body: unknown;
  changed: boolean;
  injectedText: string;
}

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
  const marker = opts.marker;
  if (tb.text.indexOf(marker) !== -1) {
    return { body, changed: false, injectedText: '' }; // 已注入，幂等
  }
  let injected = marker + tb.text;
  if (opts.maxInjectionChars && injected.length > opts.maxInjectionChars) {
    injected = injected.slice(0, opts.maxInjectionChars);
  }
  // 深拷贝后只改文本节点，其余（client_meta/option/ext 等）原样保留
  const newBody = structuredClone(typed) as DoubaoCompletionBody;
  const target = newBody.messages![0].content_block![0].content!.text_block!;
  target.text = injected;
  return { body: newBody, changed: true, injectedText: injected };
}
