// 融合方案 §4.2-4：认证层（步骤 4 doubao/auth）
//
// 立场（非检测核心约束）：
//   - 不实现 a_bogus（字节系签名，等同 TikTok X-Bogus）
//   - 不实现 PoW（豆包实测"无 PoW"，与 Deepseek 的 pow.ts 根本不同）
//   - 仅读取页面既有登录态（Cookie / sessionid / msToken / web_id）
//   - 所有签名交由页面原生逻辑注入，扩展不发任何自有签名请求

export interface PageAuthSnapshot {
  hasSessionCookie: boolean;
  hasMsToken: boolean;
  webId: string | null;
}

// 入参为 document.cookie 字符串（页面内直接取 cookie）；此处纯函数，便于单测。
// TODO(P2-backlog): 当前未接线。待记忆注入流程在增强请求前读取页面登录态，
//   校验注入合法性（登录态缺失时跳过注入）；路线 A 下仅读取不重算签名。
export function readPageAuth(cookie: string): PageAuthSnapshot {
  const parts = cookie.split(';').map((c) => c.trim());
  const keys = parts.map((c) => c.split('=')[0].toLowerCase());
  const hasSessionCookie = keys.some((k) => /sessionid|^sid_tt$|tt_csrf/.test(k));
  const hasMsToken = keys.includes('mstoken');
  let webId: string | null = null;
  const m = cookie.match(/(?:^|;\s*)web_id=([^;]+)/i);
  if (m) webId = m[1];
  return { hasSessionCookie, hasMsToken, webId };
}
