// Doubao-pp shell-host 复用（§8 铁律④）：检测 DeepSeek++ shell-host 可用性。
//
// 真正写 allowed_origins 需本地 Node 脚本 scripts/shell-host-register.mjs（浏览器沙箱
// 无法写注册表/文件系统）。本模块负责：取本扩展 id、best-effort 探测 shell-host 是否
// 可达（需其 allowed_origins 已含本扩展 id）、构造供用户在本地运行的注册命令。

export const SHELL_HOST_NAME = 'com.deepseek_pp.shell';

export function getDoubaoExtensionId(): string | undefined {
  try {
    return chrome.runtime.id;
  } catch {
    return undefined;
  }
}

export interface ShellHostProbeResult {
  reachable: boolean;
  error?: string;
}

// best-effort 探测 shell-host 是否可达（需其 allowed_origins 已含本扩展 id）。
// 不抛异常：任何失败都归为 reachable=false，由调用方决定是否提示用户注册。
export function probeShellHost(): Promise<ShellHostProbeResult> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(
        SHELL_HOST_NAME,
        { type: 'ping' },
        (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            resolve({ reachable: false, error: lastError.message });
            return;
          }
          resolve({ reachable: true });
        },
      );
    } catch (err) {
      resolve({ reachable: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

// 构造用户在本地运行的注册命令（追加 Doubao-pp 到 shell-host allowed_origins）。
export function getShellHostRegisterCommand(browser: string, extensionId?: string): string {
  const id = extensionId ?? '<doubao-extension-id>';
  return `node scripts/shell-host-register.mjs --browser ${browser} --extension-id ${id}`;
}
