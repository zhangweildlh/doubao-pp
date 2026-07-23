// 融合方案 §4.1：ChatProvider 统一契约（步骤 2 解耦核心）
//
// 设计意图：
//   Deepseek-pp 原 fetch-hook.ts 直接 hard-import '../deepseek/...'（致命耦合开关）。
//   解耦后，fetch-hook 改为依赖"当前 active provider 满足本契约"，从而豆包实现
//   可并列挂接，且不污染 deepseek 引擎层。
//
// 本文件即融合方案 §4.1 给出的 ChatProvider 接口的忠实 TypeScript 落地形态。

export type ProviderId = 'deepseek' | 'doubao';

export interface StreamEvent {
  id: string | null;
  event: string;
  data: unknown;
}

export interface ProviderSelectors {
  inputBox: string;
  assistantMessage: string;
  actionButton: string;
}

export interface ChatProvider {
  readonly id: ProviderId;
  readonly webOrigin: string;
  readonly contentScriptMatches: string[];
  readonly hostPermissions: string[];

  // 路由识别（替换原 matchDeepSeekWebRoute）
  matchWebRoute(url: string, method: string, baseUrl: string): boolean;

  // ★ 路线 A：原地增强（非检测）——只改文本节点，不重建请求体、不自己算签名
  augmentCompletionRequest(body: unknown): unknown;

  // 命名事件 → 增量文本（替换原 consumeDeepSeekSseFrames）
  parseSSEStream(resp: Response): AsyncGenerator<StreamEvent>;

  resolveChatSessionId(url: string): string | null;
  buildSessionUrl(id: string): string;

  readonly selectors: ProviderSelectors;
  readonly uiFrameworkGlobal: string;
}
