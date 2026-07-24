// Doubao-pp 运行时消息边界（P0）
//
// 同构于 Deepseek-pp 的 runtime-boundary.ts：保留全部信任/鉴权原语
// （decodeRuntimeMessageEnvelope / createRuntimeMessageContext /
// authorizeRuntimeMessage / createRuntimeBoundaryErrorResponse 等）。
//
// 适配点（豆包化）：
//   1. readDeepSeekChatSessionId（Deepseek 专属钩子）替换为
//      readDoubaoChatSessionId —— 薄封装 core/provider/doubao/chat-session.ts 的
//      resolveChatSessionId，从豆包会话 URL 解析会话 id。
//   2. surface 字面量 'deepseek_content' → 'doubao_content'；信任策略字段
//      deepSeekOrigin → doubaoOrigin；内容命令白名单
//      DEEPSEEK_CONTENT_RUNTIME_COMMANDS → DOUBAO_CONTENT_RUNTIME_COMMANDS。
//   3. 新增 DOUBAO_TAB_URL_PATTERN 常量（豆包会话页 URL 模式）。
//   其余边界逻辑与 Deepseek 完全同构，便于后续阶段审计可搬运性。

import { resolveChatSessionId } from '../provider/doubao/chat-session.ts';

export const RUNTIME_BOUNDARY_ERROR_CODES = {
  invalidMessage: 'runtime_message_invalid',
  unauthorizedSender: 'runtime_message_unauthorized',
} as const;

export type RuntimeBoundaryErrorCode =
  typeof RUNTIME_BOUNDARY_ERROR_CODES[keyof typeof RUNTIME_BOUNDARY_ERROR_CODES];

export interface RuntimeMessageEnvelope {
  type: string;
  payload?: unknown;
  [key: string]: unknown;
}

export interface RuntimeMessageSenderLike {
  id?: string;
  url?: string;
  origin?: string;
  nativeApplication?: string;
  frameId?: number;
  documentId?: string;
  documentLifecycle?: string;
  tab?: {
    id?: number | null;
    url?: string;
  };
}

export interface RuntimeBrowserTabLike {
  id?: number;
  url?: string;
}

export type RuntimeMessageSurface = 'extension_context' | 'doubao_content';

export interface RuntimeMessageContext {
  runtimeId: string;
  surface: RuntimeMessageSurface;
  senderUrl: string;
  senderOrigin: string;
  tabId?: number;
  tabUrl?: string;
  frameId?: number;
  documentId?: string;
  documentLifecycle?: string;
  documentSessionId: string;
  chatSessionId?: string;
}

export interface RuntimeTrustPolicy {
  runtimeId: string;
  extensionOrigin: string;
  doubaoOrigin?: string;
}

/** 豆包会话页 URL 模式（供内容命令白名单与后续广播匹配使用）。 */
export const DOUBAO_TAB_URL_PATTERN = '*://www.doubao.com/*';

/**
 * 从豆包浏览器 URL 读取会话 id 的薄封装。
 * resolveChatSessionId 来自 core/provider/doubao/chat-session.ts（豆包专属解析），
 * 此处仅做空值透传，使边界逻辑保持与 Deepseek 的 readDeepSeekChatSessionId 同构。
 */
export function readDoubaoChatSessionId(tabUrl: string | null | undefined): string | null {
  if (!tabUrl) return null;
  return resolveChatSessionId(tabUrl);
}

export const DOUBAO_CONTENT_RUNTIME_COMMANDS: ReadonlySet<string> = new Set([
  // P0：少量只读命令可在豆包内容页（顶层帧）发起。
  'GET_MEMORIES',
  'GET_SKILLS',
  'GET_MCP_SERVERS',
]);

export const BACKGROUND_RUNTIME_PATHNAMES = [
  '/background.js',
  '/_generated_background_page.html',
] as const;

export class RuntimeBoundaryError extends Error {
  readonly code: RuntimeBoundaryErrorCode;

  constructor(code: RuntimeBoundaryErrorCode, message: string) {
    super(message);
    this.name = 'RuntimeBoundaryError';
    this.code = code;
  }
}

export function decodeRuntimeMessageEnvelope(value: unknown): RuntimeMessageEnvelope {
  if (!isPlainRuntimeRecord(value) || typeof value.type !== 'string' || value.type.length === 0) {
    throw new RuntimeBoundaryError(
      RUNTIME_BOUNDARY_ERROR_CODES.invalidMessage,
      'Runtime message must be a plain object with a non-empty type.',
    );
  }
  return value as RuntimeMessageEnvelope;
}

export function createRuntimeMessageContext(
  sender: RuntimeMessageSenderLike,
  policy: RuntimeTrustPolicy,
): RuntimeMessageContext {
  if (sender.id !== policy.runtimeId || sender.nativeApplication) {
    throwUnauthorized('Runtime sender does not belong to this extension.');
  }
  if (sender.documentLifecycle && sender.documentLifecycle !== 'active') {
    throwUnauthorized('Runtime sender document is not active.');
  }

  const senderUrl = requiredUrl(sender.url);
  const senderOrigin = readUrlOrigin(senderUrl);
  const tabUrl = sender.tab?.url ? requiredUrl(sender.tab.url) : undefined;
  if (sender.origin && sender.origin !== senderOrigin) {
    throwUnauthorized('Runtime sender origin does not match its URL.');
  }

  const extensionOrigin = normalizeOrigin(policy.extensionOrigin);
  if (senderOrigin === extensionOrigin) {
    const frameId = validOptionalFrameId(sender.frameId);
    return {
      runtimeId: policy.runtimeId,
      surface: 'extension_context',
      senderUrl,
      senderOrigin,
      tabId: validTabId(sender.tab?.id),
      tabUrl,
      frameId,
      documentId: validDocumentId(sender.documentId),
      documentLifecycle: sender.documentLifecycle,
      documentSessionId: createDocumentSessionId('extension_context', sender, senderUrl, frameId),
    };
  }

  if (!policy.doubaoOrigin) {
    throwUnauthorized('Runtime sender is not an extension context.');
  }
  const doubaoOrigin = normalizeOrigin(policy.doubaoOrigin);
  const tabId = validTabId(sender.tab?.id);
  const frameId = validOptionalFrameId(sender.frameId);
  if (senderOrigin !== doubaoOrigin || tabId === undefined || (frameId !== undefined && frameId !== 0)) {
    throwUnauthorized('Runtime content sender is not the Doubao top-level frame.');
  }
  if (tabUrl && readUrlOrigin(tabUrl) !== doubaoOrigin) {
    throwUnauthorized('Runtime sender tab is not a Doubao top-level document.');
  }
  if (frameId === undefined && tabUrl === undefined) {
    throwUnauthorized('Runtime content sender has no top-level frame evidence.');
  }

  return {
    runtimeId: policy.runtimeId,
    surface: 'doubao_content',
    senderUrl,
    senderOrigin,
    tabId,
    tabUrl,
    frameId: frameId ?? 0,
    documentId: validDocumentId(sender.documentId),
    documentLifecycle: sender.documentLifecycle,
    documentSessionId: createDocumentSessionId('doubao_content', sender, senderUrl, frameId ?? 0),
    // sender.url 标识内容文档，SPA 导航中可能保留初始 URL；浏览器持有的 tab URL
    // 是鉴权通过后的当前豆包路由，因此由它负责会话绑定。
    chatSessionId: readDoubaoChatSessionId(tabUrl ?? senderUrl) ?? undefined,
  };
}

/**
 * 内容消息到达后，重读接收端浏览器当前的 tab 路由。MessageSender.tab 在同源
 * SPA 导航中可能保留导航前 URL，不足以做授权绑定，故此处用浏览器持有的 tab URL。
 */
export function refreshDoubaoContentRuntimeContext(
  context: RuntimeMessageContext,
  tab: RuntimeBrowserTabLike,
  policy: Pick<RuntimeTrustPolicy, 'doubaoOrigin'>,
): RuntimeMessageContext {
  if (context.surface !== 'doubao_content') return context;
  if (context.tabId === undefined || validTabId(tab.id) !== context.tabId) {
    throwUnauthorized('Runtime sender browser tab does not match its receiving tab.');
  }
  if (!policy.doubaoOrigin) {
    throwUnauthorized('Runtime trust policy is missing the Doubao origin.');
  }

  const tabUrl = requiredBrowserTabUrl(tab.url);
  const doubaoOrigin = normalizeOrigin(policy.doubaoOrigin);
  if (readUrlOrigin(tabUrl) !== doubaoOrigin) {
    throwUnauthorized('Runtime sender browser tab is not a Doubao top-level document.');
  }

  return {
    ...context,
    tabUrl,
    chatSessionId: readDoubaoChatSessionId(tabUrl) ?? undefined,
  };
}

export function createExtensionRuntimeMessageContext(
  sender: RuntimeMessageSenderLike,
  policy: Pick<RuntimeTrustPolicy, 'runtimeId' | 'extensionOrigin'> & {
    allowedPathnames?: readonly string[];
  },
): RuntimeMessageContext {
  const context = createRuntimeMessageContext(sender, policy);
  if (context.surface !== 'extension_context') {
    throwUnauthorized('Runtime sender is not an extension context.');
  }
  if (
    policy.allowedPathnames &&
    !policy.allowedPathnames.includes(new URL(context.senderUrl).pathname)
  ) {
    throwUnauthorized('Runtime extension sender path is not authorized.');
  }
  return context;
}

export function authorizeRuntimeMessage(
  envelope: RuntimeMessageEnvelope,
  context: RuntimeMessageContext,
): void {
  if (context.surface === 'extension_context') return;
  if (DOUBAO_CONTENT_RUNTIME_COMMANDS.has(envelope.type)) return;
  throwUnauthorized(`Runtime command ${envelope.type} is not authorized for Doubao content.`);
}

export function createRuntimeBoundaryErrorResponse(
  error: unknown,
  envelope?: RuntimeMessageEnvelope,
): Record<string, unknown> {
  const code = error instanceof RuntimeBoundaryError
    ? error.code
    : RUNTIME_BOUNDARY_ERROR_CODES.invalidMessage;
  const message = error instanceof Error ? error.message : 'Runtime message rejected.';
  if (envelope?.type === 'EXECUTE_TOOL_CALL' || envelope?.type === 'RUN_ARTIFACT_CODE') {
    return {
      ok: false,
      summary: 'Runtime request rejected',
      detail: message,
      error: { code, message, retryable: false },
    };
  }
  return {
    ok: false,
    error: code,
  };
}

function createDocumentSessionId(
  surface: RuntimeMessageSurface,
  sender: RuntimeMessageSenderLike,
  senderUrl: string,
  frameId: number | undefined,
): string {
  const documentId = validDocumentId(sender.documentId);
  if (documentId) return documentId;
  return [surface, validTabId(sender.tab?.id) ?? 'extension', frameId, senderUrl].join(':');
}

function requiredUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throwUnauthorized('Runtime sender URL is missing.');
  }
  try {
    return new URL(value).href;
  } catch {
    throwUnauthorized('Runtime sender URL is invalid.');
  }
}

function requiredBrowserTabUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throwUnauthorized('Runtime sender browser tab URL is missing.');
  }
  try {
    return new URL(value).href;
  } catch {
    throwUnauthorized('Runtime sender browser tab URL is invalid.');
  }
}

function normalizeOrigin(value: string): string {
  try {
    return readUrlOrigin(new URL(value).href);
  } catch {
    throwUnauthorized('Runtime trust policy contains an invalid origin.');
  }
}

function readUrlOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
    return `${url.protocol}//${url.host}`;
  }
  return url.origin;
}

function validTabId(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throwUnauthorized('Runtime sender tab is invalid.');
}

function validOptionalFrameId(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throwUnauthorized('Runtime sender frame is invalid.');
}

function validDocumentId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && value.length > 0) return value;
  throwUnauthorized('Runtime sender document ID is invalid.');
}

function throwUnauthorized(message: string): never {
  throw new RuntimeBoundaryError(RUNTIME_BOUNDARY_ERROR_CODES.unauthorizedSender, message);
}

export function isPlainRuntimeRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
