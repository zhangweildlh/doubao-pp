// 融合方案 §4.2 / 跨世界桥接中继（隔离世界内容脚本）
//
// 背景：豆包网页版运行于 360Chrome 时，MAIN world 内容脚本的 window.chrome 被环境
// 替换为不含 runtime 的对象（实测 document_start 即 chrome.runtime === undefined），
// 导致 bridgeEmit 原用的 chrome.runtime.sendMessage 静默失败，后台 service worker
// 永远收不到桥接事件（DOM_READY / AUTH_STATUS / PAGE_MESSAGE / ASSISTANT_TEXT 等），
// 进而记忆无法持久化。
//
// 解法：新增 ISOLATED world（隔离世界）内容脚本作为中继。隔离世界拥有完整的
// chrome.runtime.sendMessage 能力。MAIN world 改用 window.postMessage 把桥接载荷
// 发给本中继，由中继转发到 background service worker。该路径在「标准 Chrome 直连」
// 与「360Chrome 中继」两种环境下均健壮（bridgeEmit 采用双路径：优先 sendMessage，
// 缺失时回退 postMessage 中继）。
//
// 注：defineContentScript 由 wxt 自动导入（auto-import），无需显式 import。

import { BRIDGE_EVENT } from '../core/provider/doubao/dom-hook.ts';
import {
  CTX_REQ_CHANNEL,
  CTX_RESP_CHANNEL,
  buildContextResponse,
} from '../core/provider/doubao/injection.ts';

export default defineContentScript({
  matches: ['*://www.doubao.com/chat/*'],
  world: 'ISOLATED',
  main() {
    // MAIN world 经 window.postMessage 投递的桥接载荷，标记 __doubaoPpRelay
    window.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as Record<string, unknown> | null;
      if (!data || data.__doubaoPpRelay !== true) return;
      try {
        // 转发为后台可识别的桥接消息（__doubaoPpBridge: true, type = BRIDGE_EVENT）
        chrome.runtime.sendMessage({
          __doubaoPpBridge: true,
          type: BRIDGE_EVENT,
          detail: data.detail,
        });
      } catch {
        // 扩展上下文异常时静默忽略
      }
    });

    // 第 6 步：MAIN world（360Chrome 可能无 chrome.storage）经跨世界请求回读注入上下文。
    // ISOLATED relay 具完整 chrome.storage，读后原路 postMessage 回传 MAIN world。
    window.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as Record<string, unknown> | null;
      if (!data || data[CTX_REQ_CHANNEL] !== true) return;
      const reqId = typeof data.reqId === 'string' ? data.reqId : '';
      if (!reqId) return;
      buildContextResponse(reqId)
        .then((payload) => {
          window.postMessage(payload, '*');
        })
        .catch(() => {
          // fail-open：读取出错也回传空上下文，保证 MAIN world 不悬挂
          window.postMessage({ [CTX_RESP_CHANNEL]: true, reqId, context: '' }, '*');
        });
    });

    console.info('[Doubao-pp] 隔离世界中继已就绪（MAIN→background 桥接 / 上下文回读）');
  },
});
