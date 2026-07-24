// Doubao-pp popup 逻辑（P2-1：桥接历史查看器）
//
// 本文件由 popup/index.html 以 <script type="module"> 加载。
// 打开 popup 时从 background 拉取暂存的桥接历史，
// 以原生 DOM 渲染简单列表，并提供清空功能。
// 零外部依赖，仅使用原生 DOM API。
//
// 说明：wxt 0.20.x 不提供 definePopup 辅助函数，popup 入口采用标准 HTML 形态
// （entrypoints/popup/index.html + 本脚本），默认导出无需包装函数。

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

// 从 background 拉取历史并渲染
function refresh(): void {
  chrome.runtime.sendMessage(
    { type: 'GET_BRIDGE_HISTORY' },
    (history: BridgeItem[] | undefined) => {
      renderList(history ?? []);
    },
  );
}

// 清空历史后刷新
function clearHistory(): void {
  chrome.runtime.sendMessage({ type: 'CLEAR_BRIDGE_HISTORY' }, () => {
    refresh();
  });
}

// 渲染历史列表到子容器
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
          <span style="color:#666;font-size:12px">${item.type}</span>
          <span style="margin-left:8px">${summarizeDetail(item.detail)}</span>
        </div>`,
    )
    .join('');
}

// 初始化 DOM 结构并绑定事件
function init(): void {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = `
    <div style="padding:12px;font-family:system-ui,sans-serif;min-width:300px">
      <h3 style="margin:0 0 8px">桥接历史</h3>
      <button id="clear-btn" style="margin-bottom:12px;padding:4px 12px;cursor:pointer">清空</button>
      <div id="list"></div>
    </div>`;

  const clearBtn = root.querySelector('#clear-btn');
  clearBtn?.addEventListener('click', clearHistory);

  // 初始拉取
  refresh();
}

// popup HTML 加载后 DOM 已就绪，直接初始化
init();

// 模块标记：使本文件可被测试以 import 方式加载（不影响 wxt 将其构建为脚本入口）
export {};
