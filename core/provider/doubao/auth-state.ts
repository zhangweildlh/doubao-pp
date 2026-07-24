// 融合方案 §4.2-4 / P2-backlog 落地：auth 真实接线的共享开关
//
// 设计取舍（防回归，关键）：
//   默认 authed = true（fail-open）。原因——路线 A 的记忆注入已实机验证
//   （验证结论 §2.5 verdict=PASS），而页面 sessionid 可能为 HttpOnly、未必能在
//   document.cookie 读到；若首屏即误判"未登录"会直接破坏记忆注入。故先 fail-open
//   保证注入可用，startAuthWatcher 读取到明确登录信号后再精确置位；真实浏览器二次
//   确认（第 3 步真机验收）后可据此收紧或移除门禁。

let authed = true;

export function setAuthed(value: boolean): void {
  authed = value;
}

export function isAuthed(): boolean {
  return authed;
}
