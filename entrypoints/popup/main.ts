// Doubao-pp popup 逻辑（P2-1：桥接历史查看器 + 第2步：记忆标签页）
//
// 本文件由 popup/index.html 以 <script type="module"> 加载。
// 双标签：
//   - 桥接历史（默认）：从 background 拉取暂存桥接消息
//   - 记忆：从 background 拉取持久化记忆条目（第2步新增）
// 零外部依赖，仅使用原生 DOM API。
//
// 说明：wxt 0.20.x 不提供 definePopup 辅助函数，popup 入口采用标准 HTML 形态
// （entrypoints/popup/index.html + 本脚本），默认导出无需包装函数。

import type { MemoryEntry } from '../../core/memory/store.ts';

// HTML 转义，避免助手文本中的特殊字符破坏布局 / 造成注入
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

// 从 detail 中提取摘要文本
function summarizeDetail(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>;
    // 优先取 text 字段（助手回复文本），截断到 60 字
    if (typeof d.text === 'string') {
      return d.text.length > 60 ? d.text.slice(0, 60) + '…' : d.text;
    }
    // 显示会话 ID（如果有）
    if (typeof d.conversationId === 'string') {
      return `会话: ${d.conversationId}`;
    }
  }
  // 兜底：JSON 摘要，截断到 60 字
  const json = JSON.stringify(detail);
  return json.length > 60 ? json.slice(0, 60) + '…' : json;
}

type BridgeItem = { type: string; detail: unknown; receivedAt: number };

// —— 桥接历史标签 ——
function refresh(): void {
  chrome.runtime.sendMessage(
    { type: 'GET_BRIDGE_HISTORY' },
    (history: BridgeItem[] | undefined) => {
      renderList(history ?? []);
    },
  );
}

function clearHistory(): void {
  chrome.runtime.sendMessage({ type: 'CLEAR_BRIDGE_HISTORY' }, () => {
    refresh();
  });
}

function renderList(history: BridgeItem[]): void {
  const listEl = document.getElementById('list');
  if (!listEl) return;
  if (history.length === 0) {
    listEl.innerHTML = '<p style="color:#888">暂无桥接消息</p>';
    return;
  }
  // 按时间倒序，最新在前
  const sorted = [...history].sort((a, b) => b.receivedAt - a.receivedAt);
  listEl.innerHTML = sorted
    .map(
      (item) =>
        `<div style="padding:8px 0;border-bottom:1px solid #eee">
          <span style="color:#666;font-size:12px">${esc(item.type)}</span>
          <span style="margin-left:8px">${esc(summarizeDetail(item.detail))}</span>
        </div>`,
    )
    .join('');
}

// —— 记忆标签（第2步新增） ——
function refreshMemory(): void {
  chrome.runtime.sendMessage(
    { type: 'GET_MEMORY' },
    (entries: MemoryEntry[] | undefined) => {
      renderMemory(entries ?? []);
    },
  );
}

function clearMemory(): void {
  chrome.runtime.sendMessage({ type: 'CLEAR_MEMORY' }, () => {
    refreshMemory();
  });
}

function renderMemory(entries: MemoryEntry[]): void {
  const el = document.getElementById('mem-list');
  if (!el) return;
  if (entries.length === 0) {
    el.innerHTML = '<p style="color:#888">暂无记忆</p>';
    return;
  }
  // 按更新时间倒序，最新在前
  const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
  el.innerHTML = sorted
    .map((e) => {
      const cid = e.conversationId ? `会话: ${e.conversationId}` : '会话: (未知)';
      const snippet =
        e.assistantText.length > 60 ? e.assistantText.slice(0, 60) + '…' : e.assistantText;
      return `<div style="padding:8px 0;border-bottom:1px solid #eee">
        <span style="color:#666;font-size:12px">${esc(cid)}</span>
        <span style="margin-left:8px">${esc(snippet)}</span>
      </div>`;
    })
    .join('');
}

// 标签切换
function showTab(tab: 'bridge' | 'memory'): void {
  const bridgePanel = document.getElementById('panel-bridge');
  const memPanel = document.getElementById('panel-memory');
  const bridgeBtn = document.querySelector('[data-tab="bridge"]');
  const memBtn = document.querySelector('[data-tab="memory"]');
  const activeStyle = 'padding:4px 12px;cursor:pointer;border-bottom:2px solid #36c';
  const idleStyle = 'padding:4px 12px;cursor:pointer;color:#888';
  if (tab === 'bridge') {
    if (bridgePanel) bridgePanel.style.display = 'block';
    if (memPanel) memPanel.style.display = 'none';
    if (bridgeBtn) (bridgeBtn as HTMLElement).setAttribute('style', activeStyle);
    if (memBtn) (memBtn as HTMLElement).setAttribute('style', idleStyle);
  } else {
    if (bridgePanel) bridgePanel.style.display = 'none';
    if (memPanel) memPanel.style.display = 'block';
    if (bridgeBtn) (bridgeBtn as HTMLElement).setAttribute('style', idleStyle);
    if (memBtn) (memBtn as HTMLElement).setAttribute('style', activeStyle);
    refreshMemory();
  }
}

// 初始化 DOM 结构并绑定事件
function init(): void {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = `
    <div style="padding:12px;font-family:system-ui,sans-serif;min-width:320px">
      <div style="display:flex;gap:8px;margin-bottom:12px;border-bottom:1px solid #eee">
        <button data-tab="bridge" style="padding:4px 12px;cursor:pointer;border-bottom:2px solid #36c">桥接历史</button>
        <button data-tab="memory" style="padding:4px 12px;cursor:pointer;color:#888">记忆</button>
      </div>
      <div id="panel-bridge">
        <button id="clear-btn" style="margin-bottom:12px;padding:4px 12px;cursor:pointer">清空</button>
        <div id="list"></div>
      </div>
      <div id="panel-memory" style="display:none">
        <button id="clear-mem-btn" style="margin-bottom:12px;padding:4px 12px;cursor:pointer">清空记忆</button>
        <div id="mem-list"></div>
      </div>
    </div>`;

  const clearBtn = root.querySelector('#clear-btn');
  clearBtn?.addEventListener('click', clearHistory);
  const clearMemBtn = root.querySelector('#clear-mem-btn');
  clearMemBtn?.addEventListener('click', clearMemory);
  root
    .querySelector('[data-tab="bridge"]')
    ?.addEventListener('click', () => showTab('bridge'));
  root
    .querySelector('[data-tab="memory"]')
    ?.addEventListener('click', () => showTab('memory'));

  // 初始拉取桥接历史（记忆标签默认隐藏，激活时再拉取）
  refresh();
}

// popup HTML 加载后 DOM 已就绪，直接初始化
init();

// 模块标记：使本文件可被测试以 import 方式加载（不影响 wxt 将其构建为脚本入口）
export {};
