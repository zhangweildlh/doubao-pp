// Doubao-pp 原型校验驱动器（步骤 2/4 可落地性实机证明）
//
// 做法：以融合方案 §2 实测事实为唯一基线，用真实抓包证据驱动 TS 原型：
//   - stream-codec：消费 capture/phaseB_sse.json 的 respBody（真实 SSE 流）
//   - request-aug：消费同一抓包的 reqBody（真实请求体 JSON 字符串）
//   - ChatProvider 契约：active 聚合 doubao 实现，验证 matchWebRoute/parseSSEStream/selectors
//   - auth：复用页面签名（非检测）纯函数验证
//   - 交叉校验：步骤 5 浏览器 MAIN world 非检测实机结果（validate/inpage_result.json）
//
// 运行：node validate/prototype/run_validation.ts  （Node 24 原生 TS，无需编译）

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseDoubaoSSE, collectAssistantText, extractBrief } from './core/provider/doubao/stream-codec.ts';
import { augmentCompletionRequest } from './core/provider/doubao/request-aug.ts';
import { createDoubaoProvider } from './core/provider/doubao/provider.ts';
import { getActiveProvider } from './core/provider/active.ts';
import { readPageAuth } from './core/provider/doubao/auth.ts';
import { resolveChatSessionId } from './core/provider/doubao/chat-session.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..'); // validate/prototype -> Doubao-pp
const CAPTURE = resolve(ROOT, 'capture', 'phaseB_sse.json');
const INPAGE = resolve(ROOT, 'validate', 'inpage_result.json');

// 融合方案 §2.2：预期全部出现的 6 类命名事件
const EXPECTED_EVENTS = [
  'SSE_HEARTBEAT',
  'SSE_ACK',
  'FULL_MSG_NOTIFY',
  'STREAM_MSG_NOTIFY',
  'CHUNK_DELTA',
  'SSE_REPLY_END',
];

// 对齐验证②的注入标记
const MEMORY_MARKER = '[来自Doubao-pp记忆系统的上下文] ';

// 真实请求体结构（实测 §2.3，已用 capture 核对）
interface AugBody {
  messages?: Array<{
    content_block?: Array<{ content?: { text_block?: { text?: string } } }>;
  }>;
}

interface Row {
  step: string;
  name: string;
  pass: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const rows: Row[] = [];

  // ---- 载入真实抓包 ----
  const capture = JSON.parse(readFileSync(CAPTURE, 'utf-8'));
  const first = Array.isArray(capture) ? capture[0] : capture;
  const sseText: string = first.respBody || '';
  const reqBodyStr: string = first.reqBody || '{}';

  // ===== 验证②a：stream-codec 解析真实 SSE（步骤 4 doubao/stream-codec）=====
  const events: Array<{ id: string | null; event: string; data: unknown }> = [];
  const resp = new Response(sseText);
  for await (const ev of parseDoubaoSSE(resp)) {
    events.push(ev as { id: string | null; event: string; data: unknown });
  }
  const names = events.map((e) => e.event);
  const missing = EXPECTED_EVENTS.filter((e) => !names.includes(e));
  rows.push({
    step: '步骤3/4',
    name: 'stream-codec：6 类命名事件全解析',
    pass: missing.length === 0,
    detail: missing.length
      ? `缺失 ${missing.join(',')}`
      : `共 ${events.length} 个事件，含 ${EXPECTED_EVENTS.join('/')}`,
  });

  const assistant = collectAssistantText(events); // 现返回权威 brief
  const brief = extractBrief(events);
  // 强化断言：权威完整文本必须与 brief 逐字相等（不再用 includes 弱断言掩盖漏字缺陷）
  const sseTextOk = typeof brief === 'string' && brief.length > 0 && assistant === brief;
  const streamChunkCount = names.filter((n) => n === 'STREAM_CHUNK').length;
  rows.push({
    step: '步骤3/4',
    name: 'stream-codec：权威文本 = SSE_REPLY_END.brief（逐字相等）',
    pass: sseTextOk,
    detail: `canonical="${assistant}"  brief="${brief}"  STREAM_CHUNK观测=${streamChunkCount}`,
  });

  // ===== 验证②b：request-aug 原地增强真实请求体（步骤 4 doubao/request-aug）=====
  const reqBody = JSON.parse(reqBodyStr);
  const aug = augmentCompletionRequest(reqBody, { marker: MEMORY_MARKER });
  const augBody = aug.body as AugBody;
  const newText: string =
    augBody.messages?.[0]?.content_block?.[0]?.content?.text_block?.text ?? '';
  rows.push({
    step: '步骤4',
    name: 'request-aug：原地增强请求体文本节点',
    pass: aug.changed && newText.startsWith(MEMORY_MARKER),
    detail: `changed=${aug.changed} 增强后文本="${newText.slice(0, 36)}..."`,
  });

  // ===== 验证②c：ChatProvider 契约聚合（步骤 2 解耦落点）=====
  const provider = getActiveProvider();
  const providerOk =
    provider.id === 'doubao' &&
    provider.matchWebRoute('https://www.doubao.com/chat/completion?aid=497858', 'POST', provider.webOrigin) &&
    typeof provider.parseSSEStream === 'function' &&
    provider.selectors.inputBox.includes('textarea') &&
    provider.uiFrameworkGlobal === 'DoubaoUIFramework';
  rows.push({
    step: '步骤2',
    name: 'ChatProvider 契约：active 聚合 doubao 实现',
    pass: providerOk,
    detail: `id=${provider.id} matches=${provider.contentScriptMatches.join(',')} uiGlobal=${provider.uiFrameworkGlobal}`,
  });

  // ===== 验证②d：chat-session 路由解析（步骤 4 doubao/chat-session）=====
  const sid = resolveChatSessionId('https://www.doubao.com/chat/abc123-def456');
  rows.push({
    step: '步骤4',
    name: 'chat-session：会话 URL 解析',
    pass: sid === 'abc123-def456',
    detail: `resolveChatSessionId -> ${sid}`,
  });

  // ===== 验证②e：auth 复用页面签名（非检测，步骤 4 doubao/auth）=====
  const auth = readPageAuth('sessionid=abc; msToken=xyz; web_id=1234567890123456789');
  rows.push({
    step: '步骤4',
    name: 'auth：仅读页面既有登录态（不实现 a_bogus/PoW）',
    pass: auth.hasSessionCookie && auth.hasMsToken && auth.webId === '1234567890123456789',
    detail: `hasSession=${auth.hasSessionCookie} hasMsToken=${auth.hasMsToken} webId=${auth.webId}`,
  });

  // ===== 交叉校验：步骤 5 浏览器 MAIN world 非检测实机（validate/inpage_result.json）=====
  try {
    const inpage = JSON.parse(readFileSync(INPAGE, 'utf-8'));
    rows.push({
      step: '步骤5（交叉）',
      name: '浏览器 MAIN world 非检测实机',
      pass: inpage.verdict === 'PASS',
      detail: `verdict=${inpage.verdict} augmented=${inpage.augmented} url_signed_by_page=${inpage.request_url_signed_by_page} inject_marker_present=${inpage.inject_marker_present}`,
    });
  } catch (e) {
    rows.push({
      step: '步骤5（交叉）',
      name: '浏览器 MAIN world 非检测实机',
      pass: false,
      detail: `读取 validate/inpage_result.json 失败：${String(e)}`,
    });
  }

  // ---- 输出 ----
  const passCount = rows.filter((r) => r.pass).length;
  const verdict = passCount === rows.length ? 'PASS' : 'FAIL';

  console.log('='.repeat(72));
  console.log('Doubao-pp 原型校验（步骤 2/4 TS 模块 vs 真实抓包）');
  console.log('='.repeat(72));
  for (const r of rows) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] (${r.step}) ${r.name}`);
    console.log(`        ${r.detail}`);
  }
  console.log('-'.repeat(72));
  console.log(`汇总：${passCount}/${rows.length} 通过  →  verdict = ${verdict}`);

  const out = {
    generated_at: new Date().toISOString(),
    source: 'validate/prototype/run_validation.ts (Node 24 原生 TS 直跑)',
    evidence: { sse_capture: 'capture/phaseB_sse.json', inpage_result: 'validate/inpage_result.json' },
    rows,
    summary: `${passCount}/${rows.length}`,
    verdict,
  };
  const outPath = resolve(HERE, 'prototype_validation_result.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`结果已写入：${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
