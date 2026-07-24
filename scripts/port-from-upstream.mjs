#!/usr/bin/env node
// Doubao-pp 移植辅助脚本（P0-5）：从 Deepseek-pp 源批量做品牌 / 域名 / 文案替换。
//
// 用法：
//   node scripts/port-from-upstream.mjs [--src <dir>] [--out <dir>] [--dry]
//
// 默认：
//   --src = 仓库上一级的 Deepseek-pp（D:/Documents/AI_Work_Temp/Deepseek-pp）
//   --out = ./ported（仓库内 ported/，已被 .gitignore 忽略）
//   --dry = 仅打印将替换的文件，不写文件
//
// 替换映射（路线 A 非检测：仅改文案 / 域名 / 品牌，不碰签名逻辑）：
//   DeepSeek++        → Doubao-pp
//   deepseek-plus-plus → doubao-pp
//   DeepSeek          → Doubao
//   chat.deepseek.com → www.doubao.com
//   api.deepseek.com  → www.doubao.com
//   deepseek.com      → doubao.com
//   deepseek          → doubao
//
// 安全边界：
//   - 只读文本文件（按扩展名白名单过滤）
//   - 跳过 .git / node_modules / dist / .wxt / .workbuddy / analysis / ported
//   - 显式不触碰 core/provider/doubao/*（本仓库手写实现，方案 §4.4）
//   - 默认不写入「内容未变化」的文件
//   - 严禁将 --src 指向本仓库自身（见下方安全拦截）

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const args = parseArgs(process.argv.slice(2));
const src = resolve(args.src ?? resolve(REPO, '..', 'Deepseek-pp'));
const out = resolve(args.out ?? resolve(REPO, 'ported'));
const dry = args.dry === true;

// 顺序敏感：先长后短、先具体域名后通用词，避免 deepseek.com 误伤 chat.deepseek.com。
const REPLACEMENTS = [
  [/DeepSeek\+\+/g, 'Doubao-pp'],
  [/deepseek-plus-plus/g, 'doubao-pp'],
  [/DeepSeek/g, 'Doubao'],
  [/chat\.deepseek\.com/g, 'www.doubao.com'],
  [/api\.deepseek\.com/g, 'www.doubao.com'],
  [/deepseek\.com/g, 'doubao.com'],
  [/deepseek/g, 'doubao'],
];

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.html', '.vue', '.py',
  '.txt', '.yml', '.yaml', '.svg',
]);
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', '.output', '.wxt',
  '.workbuddy', '.mimocode', 'analysis', 'ported',
]);
// 方案 §4.4：显式不触碰本仓库手写实现 core/provider/doubao/*
// （即便误把 --src 指向本仓库，也绝不覆盖手写代码）。
const SKIP_PATH_PREFIXES = new Set([
  'core/provider/doubao',
  'core/provider/doubao/',
]);

function isSkippedPath(relNorm) {
  for (const p of SKIP_PATH_PREFIXES) {
    if (relNorm === p || relNorm.startsWith(p + '/')) return true;
  }
  return false;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') o.dry = true;
    else if (a === '--src') o.src = argv[++i];
    else if (a === '--out') o.out = argv[++i];
  }
  return o;
}

let fileCount = 0;
let changeCount = 0;

if (resolve(src) === REPO) {
  console.error(
    '安全拦截：请勿将 --src 指向本仓库自身（Doubao-pp）。\n' +
      '该脚本仅用于从外部 Deepseek-pp 源生成移植副本，避免误覆盖手写代码。',
  );
  process.exit(1);
}
if (!existsDir(src)) {
  console.error(`源目录不存在：${src}`);
  process.exit(1);
}

walk(src, out);

console.log(`\n移植扫描完成：扫描 ${fileCount} 个文件，其中 ${changeCount} 个含可替换项。`);
console.log(`源：${src}`);
console.log(`目标：${out}`);
if (dry) console.log('[dry-run] 未写入任何文件');

function walk(dir, outDir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = resolve(dir, entry.name);
    const rel = relative(src, full);
    const relNorm = rel.split(/[\\/]/).join('/');
    if (isSkippedPath(relNorm)) continue;
    const target = resolve(outDir, rel);
    if (entry.isDirectory()) {
      walk(full, target);
    } else if (entry.isFile()) {
      fileCount++;
      if (!TEXT_EXT.has(extname(entry.name).toLowerCase())) continue;
      const original = readFileSync(full, 'utf8');
      const replaced = applyReplacements(original);
      if (replaced === original) continue;
      changeCount++;
      if (dry) {
        console.log(`[dry] 将替换：${rel}`);
      } else {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, replaced, 'utf8');
        console.log(`已移植：${rel}`);
      }
    }
  }
}

function applyReplacements(text) {
  let result = text;
  for (const [re, to] of REPLACEMENTS) {
    result = result.replace(re, to);
  }
  return result;
}

function existsDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
