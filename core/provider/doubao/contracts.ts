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

// §2.5 DOM 选择器（真机验收 2026-07-24 确认）
// - inputBox：输入框 textarea（P2 范本实测）
// - assistantMessage：每条消息（用户/助手）容器均带 data-message-id，为稳定语义属性，
//   不随 CSS module 构建哈希变化（实测文本节点 class 为 container-* 哈希，禁止用作选择器）
// - userBubbleClass：用户发送消息含发送气泡背景 class；助手消息不含 → 用于区分用户/助手
// - actionButton：发送按钮
export const DOUBAO_SELECTORS = {
  inputBox: 'textarea.semi-input-textarea',
  assistantMessage: '[data-message-id]',
  userBubbleClass: 'bg-g-send-msg-bubble-bg',
  actionButton: "button[aria-label*='发送']",
};

// 注意：原 UIFRAMEWORK_GLOBAL='DoubaoUIFramework' 经真机验收确认在豆包网页版不存在，
// 改为软检测候选列表（见 dom-hook.ts UI_FRAMEWORK_CANDIDATES），命中任意即视为框架存在。
// 框架全局对象软检测候选（集中此处，避免 provider→dom-hook 循环依赖）
export const UI_FRAMEWORK_CANDIDATES = ['DoubaoUIFramework', '__NEXT_DATA__', 'React', '__doubaoApp'];

// P2-b：隐藏消息状态枚举（保留作 future-proof；豆包真实当前无 data-msg-status 属性，
// 故 isVisibleMessage(undefined) 恒返回 true，不阻断处理）
export const HIDDEN_MESSAGE_STATUSES = new Set<number>([1, 3, 5, 7, 19]);
