// 融合方案 §2.1 / §2.5：豆包端点、路由、查询参数预算（实测裁决，取代一切推测）

// 实测端点：POST https://www.doubao.com/chat/completion（非 /samantha/chat/completion）
export const DOUBAO_WEB_ORIGIN = 'https://www.doubao.com';
export const DOUBAO_COMPLETION_PATH = '/chat/completion';
export const DOUBAO_COMPLETION_URL = DOUBAO_WEB_ORIGIN + DOUBAO_COMPLETION_PATH;

// 实测查询参数（§2.1）：aid 固定为 497858，device_platform=web 等
// 注意：这些参数是"页面自己发出的"，扩展不重算，此处仅作文档/契约对照。
export const DOUBAO_QUERY_PARAMS: Record<string, string> = {
  aid: '497858',
  device_platform: 'web',
  doubao_device_platform: 'web',
  language: 'zh',
  region: 'CN',
  sys_region: 'CN',
  samantha_web: '1',
  version_code: '20800',
  use_olympus_account: '1',
};

// §2.1 实测 bot_id（豆包网页版固定助手 id）
export const BOT_ID = '7338286299411103781';

// §2.5 DOM 选择器（实测 textarea.semi-input-textarea + P2 范本）
export const DOUBAO_SELECTORS = {
  inputBox: 'textarea.semi-input-textarea',
  assistantMessage: '[class*="chat-content"]',
  actionButton: "button[aria-label*='发送']",
};

// §2.5 前端框架全局对象（页面注入与 UI 钩子的天然落点）
export const UIFRAMEWORK_GLOBAL = 'DoubaoUIFramework';

// P2-b：隐藏消息状态枚举，避免误注入 / 重复处理可见消息
export const HIDDEN_MESSAGE_STATUSES = new Set<number>([1, 3, 5, 7, 19]);
