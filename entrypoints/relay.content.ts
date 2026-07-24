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
    console.info('[Doubao-pp] 隔离世界中继已就绪（MAIN→background 桥接）');
  },
});
