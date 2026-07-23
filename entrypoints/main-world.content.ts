// 融合方案 §4.2 / 路线 A：豆包网页版 MAIN world 内容脚本入口
//
// 在页面主世界钩住 window.fetch，复用页面原生签名，原地增强豆包自有
// /chat/completion 请求，并把解析到的助手文本经事件桥广播给扩展其余部分。
//
// 注：defineContentScript 由 wxt 自动导入（auto-import），无需显式 import。

import { installFetchHook } from '../core/interceptor/fetch-hook.ts';
import { getActiveProvider } from '../provider/active.ts';

export default defineContentScript({
  matches: ['*://www.doubao.com/chat/*'],
  world: 'MAIN',
  runAt: 'document_start',
  async main() {
    const provider = getActiveProvider();
    installFetchHook({
      onRequestBody(_body, requestId) {
        console.debug('[Doubao-pp] 已增强请求体', requestId);
      },
      onAssistantText(text, requestId) {
        console.debug('[Doubao-pp] 助手文本', requestId, text.slice(0, 40));
      },
      onError(message, error) {
        console.error('[Doubao-pp]', message, error);
      },
    });
    console.info(`[Doubao-pp] 已挂载 ${provider.id} 拦截器（路线 A 非检测）`);
  },
});
