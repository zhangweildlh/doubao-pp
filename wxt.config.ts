// Doubao-pp wxt 构建配置（融合方案 §4 / P0-4 精修版）
//
// 相对 Deepseek-pp 的 wxt.config.ts 做了豆包化裁剪：
//   - host_permissions 仅声明豆包网页版域名。路线 A 下扩展不在后台直连豆包 API，
//     所有 /chat/completion 请求由页面自身发出并自带 a_bogus/msToken 签名；
//     故 host_permissions 仅为后续「后台直连」预留，当前保持最小化。
//   - 移除 pyodide / skill 资源复制钩子（P0 阶段不移植 Python 沙箱与技能包）。
//   - 保留 asciiJavaScriptOutputPlugin（确保中文文案在打包后不被破坏）。

import { defineConfig, type ConfigEnv, type UserManifest } from 'wxt';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const rootDir = dirname(fileURLToPath(import.meta.url));
const extensionVersion = readPackageVersion();
const CHROMIUM_BROWSERS = new Set(['chrome', 'edge']);

const MANIFEST_NAME = 'Doubao-pp';
const MANIFEST_DESCRIPTION =
  '为豆包网页版（doubao.com）提供记忆、技能与自动化能力的浏览器扩展（Deepseek-pp 移植）';
const MANIFEST_ACTION_TITLE = 'Doubao-pp';

function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as {
    version?: unknown;
  };
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error('package.json version is required for extension manifest');
  }
  return pkg.version;
}

export function createManifest(env: ConfigEnv): UserManifest {
  const isChromiumTarget = CHROMIUM_BROWSERS.has(env.browser);
  return {
    name: MANIFEST_NAME,
    description: MANIFEST_DESCRIPTION,
    version: extensionVersion,
    permissions: ['storage', 'alarms', 'contextMenus'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    host_permissions: ['*://www.doubao.com/*', '*://doubao.com/*'],
    // 路线 A 下扩展当前不向页面注入资源；按方案 §4.3 预留豆包域可访问资源声明，
    // 供后续侧边栏 / 浮窗 / 记忆面板注入扩展资源时使用。
    web_accessible_resources: [
      {
        resources: ['chunks/*'],
        matches: ['*://www.doubao.com/*', '*://doubao.com/*'],
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    ...(isChromiumTarget
      ? {
          action: {
            default_title: MANIFEST_ACTION_TITLE,
          },
        }
      : {}),
  };
}

// 非 ASCII 转义插件：确保中文文案在打包后不被破坏（沿用 Deepseek-pp 验证过的方案）。
function asciiJavaScriptOutputPlugin(): Plugin {
  return {
    name: 'doubao-pp-ascii-js-output',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') {
          item.code = escapeNonAscii(item.code);
          continue;
        }
        if (!item.fileName.endsWith('.js')) continue;
        const source =
          typeof item.source === 'string'
            ? item.source
            : Buffer.from(item.source).toString('utf8');
        item.source = escapeNonAscii(source);
      }
    },
  };
}

function escapeNonAscii(source: string): string {
  let escaped = '';
  for (const char of source) {
    const code = char.codePointAt(0);
    if (code === undefined || code <= 0x7f) {
      escaped += char;
    } else if (code <= 0xffff) {
      escaped += `\\u${code.toString(16).padStart(4, '0')}`;
    } else {
      const v = code - 0x10000;
      const hi = 0xd800 + (v >> 10);
      const lo = 0xdc00 + (v & 0x3ff);
      escaped += `\\u${hi.toString(16).padStart(4, '0')}\\u${lo.toString(16).padStart(4, '0')}`;
    }
  }
  return escaped;
}

export default defineConfig({
  outDir: 'dist',
  targetBrowsers: ['chrome', 'edge', 'firefox'],
  manifest: createManifest,
  vite: () => ({
    plugins: [asciiJavaScriptOutputPlugin()],
  }),
});
