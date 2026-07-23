// Doubao-pp background service worker
//
// 监听 MAIN world content script 通过 chrome.runtime.sendMessage 发来的
// 事件桥消息（__doubaoPpBridge: true），暂存最近 20 条供后续 popup/sidebar 消费。
//
// 注：defineBackground 由 wxt auto-import 提供，无需显式 import。

import { BRIDGE_EVENT } from '../core/provider/doubao/dom-hook.ts';

// 模块级消息缓存，最多保留最近 20 条
const bridgeMessages: Array<{ type: string; detail: unknown; receivedAt: number }> = [];
const MAX_BRIDGE_MESSAGES = 20;

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (msg: Record<string, unknown>, _sender, _sendResponse) => {
      // 过滤非桥接消息（同时校验事件名，仅接受 BRIDGE_EVENT 类型）
      if (msg.__doubaoPpBridge !== true || msg.type !== BRIDGE_EVENT) return;

      // 打印桥接消息，便于调试
      console.info('[Doubao-pp][bridge]', msg.type, msg.detail);

      // 暂存到模块级数组，超出上限则移除最早条目
      bridgeMessages.push({
        type: msg.type as string,
        detail: msg.detail,
        receivedAt: Date.now(),
      });
      if (bridgeMessages.length > MAX_BRIDGE_MESSAGES) {
        bridgeMessages.shift();
      }
    },
  );

  console.info('[Doubao-pp] background service worker 已启动');
});
