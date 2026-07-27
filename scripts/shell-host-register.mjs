#!/usr/bin/env node
// Doubao-pp shell-host 复用注册脚本（§8 铁律④）
//
// 检测 DeepSeek++ shell-host 是否已注册到当前浏览器；已注册则把 Doubao-pp 扩展 id
// 追加到其 manifest 的 allowed_origins（Chrome 系）/ allowed_extensions（Firefox），
// 实现「合并追加」复用；未注册则提示用 npx deepseek-pp-shell-host install 安装。
//
// 纯 Node 跨平台实现，不依赖源仓 @deepseek-pp/shell-host 包（遵循「不装新工具」原则）。
// 用法：node scripts/shell-host-register.mjs --browser chrome --extension-id <doubao-ext-id>

import { homedir, platform } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { posix, resolve, win32 } from 'node:path';

const HOST_NAME = 'com.deepseek_pp.shell';
const SUPPORTED = ['chrome', 'chromium', 'edge', 'firefox'];

function assertBrowser(browser) {
  if (!SUPPORTED.includes(browser)) throw new Error(`Unsupported browser: ${browser}`);
}

function resolveLocations({ os, browser, home, localAppData }) {
  assertBrowser(browser);
  const path = os === 'win32' ? win32 : posix;
  let appDataRoot;
  let manifestDir;

  if (os === 'darwin') {
    const segs = {
      chrome: ['Google', 'Chrome', 'NativeMessagingHosts'],
      chromium: ['Chromium', 'NativeMessagingHosts'],
      edge: ['Microsoft Edge', 'NativeMessagingHosts'],
      firefox: ['Mozilla', 'NativeMessagingHosts'],
    }[browser];
    appDataRoot = path.resolve(home, 'Library', 'Application Support', 'DeepSeek++');
    manifestDir = path.resolve(home, 'Library', 'Application Support', ...segs);
  } else if (os === 'linux') {
    const segs = {
      chrome: ['.config', 'google-chrome', 'NativeMessagingHosts'],
      chromium: ['.config', 'chromium', 'NativeMessagingHosts'],
      edge: ['.config', 'microsoft-edge', 'NativeMessagingHosts'],
      firefox: ['.mozilla', 'native-messaging-hosts'],
    }[browser];
    appDataRoot = path.resolve(home, '.local', 'share', 'deepseek-pp');
    manifestDir = path.resolve(home, ...segs);
  } else if (os === 'win32') {
    const appData = localAppData || path.resolve(home, 'AppData', 'Local');
    appDataRoot = path.resolve(appData, 'DeepSeek++');
    manifestDir = path.resolve(appDataRoot, 'NativeMessagingHosts');
  } else {
    throw new Error(`Unsupported platform: ${os}`);
  }

  const manifestFileName =
    os === 'win32' ? `${HOST_NAME}.${browser}.json` : `${HOST_NAME}.json`;
  return {
    manifestDir,
    manifestPath: path.resolve(manifestDir, manifestFileName),
  };
}

function parseArgs(argv) {
  const args = { browser: 'chrome', extensionId: null, dryRun: false };
  const tokens = [...argv];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === '--browser' && tokens[i + 1]) args.browser = tokens[++i].toLowerCase();
    else if (tokens[i] === '--extension-id' && tokens[i + 1]) args.extensionId = tokens[++i];
    else if (tokens[i] === '--dry-run') args.dryRun = true;
    else if (tokens[i] === '--help' || tokens[i] === '-h') { printHelp(); process.exit(0); }
    else throw new Error(`Unknown option: ${tokens[i]}`);
  }
  assertBrowser(args.browser);
  return args;
}

function printHelp() {
  console.log(`Doubao-pp shell-host 复用注册

用法:
  node scripts/shell-host-register.mjs --browser chrome --extension-id <doubao-ext-id>

检测 DeepSeek++ shell-host 是否已注册；已注册则把 Doubao-pp 扩展 id 追加到其
allowed_origins（Chrome 系）/ allowed_extensions（Firefox），实现「合并追加」复用；
未注册则提示用 npx deepseek-pp-shell-host install 安装。
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { manifestPath, manifestDir } = resolveLocations({
    os: platform(),
    browser: args.browser,
    home: homedir(),
    localAppData: process.env.LOCALAPPDATA,
  });

  if (!existsSync(manifestPath)) {
    console.error(`未发现 DeepSeek++ shell-host manifest: ${manifestPath}`);
    if (!args.extensionId) {
      throw new Error('需提供 --extension-id（Doubao-pp 扩展 id）以安装 shell-host');
    }
    console.error(
      `请先安装 DeepSeek++ shell-host：\n` +
      `  npx deepseek-pp-shell-host install --browser ${args.browser} --extension-id ${args.extensionId}\n` +
      `然后重跑本脚本以追加 Doubao-pp 到其 allowed_origins。`,
    );
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const isFirefox = args.browser === 'firefox';
  const field = isFirefox ? 'allowed_extensions' : 'allowed_origins';
  const list = manifest[field] || [];

  if (!args.extensionId) {
    console.log(`shell-host 已注册，${field}: ${list.join(', ') || '(空)'}`);
    return;
  }

  const entry = isFirefox ? args.extensionId : `chrome-extension://${args.extensionId}/`;
  if (list.includes(entry)) {
    console.log(`Doubao-pp 已在 ${field} 中：${entry}`);
    return;
  }

  list.push(entry);
  manifest[field] = list;

  if (args.dryRun) {
    console.log(`[dry-run] 将追加 ${entry} 到 ${manifestPath}`);
    return;
  }

  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `已追加 Doubao-pp 到 shell-host ${field}：${entry}\n路径：${manifestPath}\n重启浏览器生效。`,
  );
}

try {
  main();
} catch (err) {
  console.error(`\n注册失败：${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
