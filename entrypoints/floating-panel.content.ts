// 融合方案 §4.2 / 第4步：页内浮窗（事件桥消费端）
//
// 形态：ISOLATED world 内容脚本，在豆包对话页挂载固定浮窗（Shadow DOM 隔离样式）。
// 实时消费 MAIN world 经 window.dispatchEvent 派发的 CustomEvent(BRIDGE_EVENT)：
//   - REQUEST_AUGMENTED：标记"记忆已注入请求体"
//   - CONVERSATION_READY：展示当前会话 id / section / 链接
//   - STREAMING_TEXT：实时逐字回显（高频，仅页内 CustomEvent，不进 background）
//   - ASSISTANT_TEXT：定稿权威文本替换流式显示
// 另经 chromeStorageBackend 读取已持久化记忆（第2步），供"记忆"标签页浏览。
//
// 非检测：浮窗仅读取页面事件与本地存储，不向豆包发出任何自有请求。
// 采用手写 Shadow DOM 挂载（不依赖 wxt/client 的 createContentScriptUi，跨版本稳健）。

import { BRIDGE_EVENT, type BridgeDetail } from '../core/provider/doubao/dom-hook.ts';
import { chromeStorageBackend, MEMORY_STORAGE_KEY, type MemoryEntry } from '../core/memory/store.ts';
import {
  SkillStore,
  chromeSyncStorageBackend,
  BUILTIN_SKILLS,
  type SkillEntry,
} from '../core/skills/store.ts';
import { McpStore, type McpToolEntry } from '../core/mcp/store.ts';
import { createInitialState, reduceBridgeEvent, type FloatingState } from '../core/ui/floating-state.ts';

// HTML 转义，防 XSS（与 popup 一致）
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );
}

const PANEL_CSS = `
  :host { all: initial; }
  .dp-fab {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    width: 44px; height: 44px; border-radius: 50%;
    background: #2b6cff; color: #fff; border: none; cursor: pointer;
    font-size: 18px; box-shadow: 0 4px 12px rgba(0,0,0,.25);
  }
  .dp-fab:hover { background: #1f5af0; }
  .dp-panel {
    position: fixed; right: 16px; bottom: 68px; z-index: 2147483647;
    width: 340px; max-height: 70vh; overflow: auto;
    background: #fff; color: #222; border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0,0,0,.25); font: 13px/1.5 system-ui, sans-serif;
  }
  .dp-head { display: flex; justify-content: space-between; align-items: center;
    padding: 10px 12px; border-bottom: 1px solid #eee; font-weight: 600; }
  .dp-tabs { display: flex; gap: 6px; padding: 8px 12px 0; }
  .dp-tab { padding: 4px 10px; cursor: pointer; border-bottom: 2px solid transparent; color: #888; }
  .dp-tab.active { color: #2b6cff; border-bottom-color: #2b6cff; }
  .dp-body { padding: 10px 12px; }
  .dp-row { padding: 6px 0; border-bottom: 1px solid #f2f2f2; }
  .dp-muted { color: #888; font-size: 12px; }
  .dp-stream { white-space: pre-wrap; word-break: break-word; margin-top: 4px; }
  .dp-badge { display: inline-block; padding: 1px 6px; border-radius: 6px; font-size: 11px;
    background: #e8f0ff; color: #2b6cff; }
  .dp-link { color: #2b6cff; text-decoration: none; }
  .dp-link:hover { text-decoration: underline; }
`;

let installed = false;

export default defineContentScript({
  matches: ['*://www.doubao.com/chat/*'],
  runAt: 'document_idle',
  world: 'ISOLATED',
  main(ctx) {
    if (installed) return; // 单例防重挂
    installed = true;

    const host = document.createElement('div');
    host.setAttribute('data-doubao-pp-floating', '');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    const container = document.createElement('div');
    shadow.appendChild(container);
    (document.documentElement || document.body).appendChild(host);

    let state: FloatingState = createInitialState();

    container.innerHTML = `
      <button class="dp-fab" title="Doubao-pp 浮窗">豆</button>
      <div class="dp-panel" style="display:none">
        <div class="dp-head">
          <span>Doubao-pp 实时</span>
          <span class="dp-badge" id="dp-inject">未注入</span>
        </div>
        <div class="dp-tabs">
          <span class="dp-tab active" data-tab="live">实时</span>
          <span class="dp-tab" data-tab="mem">记忆</span>
          <span class="dp-tab" data-tab="skill">技能/MCP</span>
        </div>
        <div class="dp-body" id="dp-live"></div>
        <div class="dp-body" id="dp-mem" style="display:none"></div>
        <div class="dp-body" id="dp-skill" style="display:none"></div>
      </div>`;

    const fab = container.querySelector('.dp-fab') as HTMLButtonElement;
    const panel = container.querySelector('.dp-panel') as HTMLElement;
    const liveEl = container.querySelector('#dp-live') as HTMLElement;
    const memEl = container.querySelector('#dp-mem') as HTMLElement;
    const skillEl = container.querySelector('#dp-skill') as HTMLElement;
    const injectEl = container.querySelector('#dp-inject') as HTMLElement;

    const showTab = (tab: 'live' | 'mem' | 'skill') => {
      container.querySelectorAll('.dp-tab').forEach((t) => {
        const el = t as HTMLElement;
        el.classList.toggle('active', el.dataset.tab === tab);
      });
      liveEl.style.display = tab === 'live' ? 'block' : 'none';
      memEl.style.display = tab === 'mem' ? 'block' : 'none';
      skillEl.style.display = tab === 'skill' ? 'block' : 'none';
      if (tab === 'mem') refreshMemory();
      if (tab === 'skill') refreshSkills();
    };
    container.querySelectorAll('.dp-tab').forEach((t) => {
      t.addEventListener('click', () => showTab((t as HTMLElement).dataset.tab as 'live' | 'mem' | 'skill'));
    });
    fab.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    const renderLive = () => {
      injectEl.textContent = state.injected ? '已注入记忆' : '未注入';
      const cid = state.conversationId ?? '（未知）';
      const src = state.finalText || state.streamingText;
      const label = state.finalText ? '定稿文本' : '流式回显';
      liveEl.innerHTML = `
        <div class="dp-row"><span class="dp-muted">会话:</span> ${esc(cid)}</div>
        ${state.sessionUrl ? `<div class="dp-row"><a class="dp-link" href="${esc(state.sessionUrl)}" target="_blank" rel="noreferrer">打开会话</a></div>` : ''}
        <div class="dp-row">
          <span class="dp-muted">${esc(label)}:</span>
          <div class="dp-stream">${esc(src || '（暂无）')}</div>
        </div>
        <div class="dp-row dp-muted">事件数: ${state.eventCount}</div>`;
    };

    const refreshMemory = () => {
      chromeStorageBackend
        .get(MEMORY_STORAGE_KEY)
        .then((raw) => {
          const sorted = Array.isArray(raw)
            ? ([...((raw as MemoryEntry[]).sort((a, b) => b.updatedAt - a.updatedAt))])
            : [];
          if (sorted.length === 0) {
            memEl.innerHTML = '<div class="dp-muted">暂无记忆</div>';
            return;
          }
          memEl.innerHTML = sorted
            .map((e) => {
              const snippet =
                e.assistantText.length > 80 ? e.assistantText.slice(0, 80) + '…' : e.assistantText;
              return `<div class="dp-row">
                <div class="dp-muted">${esc(e.conversationId ?? '未知会话')}</div>
                <div class="dp-stream">${esc(snippet)}</div>
              </div>`;
            })
            .join('');
        })
        .catch(() => {
          memEl.innerHTML = '<div class="dp-muted">读取记忆失败</div>';
        });
    };

    const refreshSkills = () => {
      if (typeof chrome === 'undefined' || !chrome.storage) {
        skillEl.innerHTML = '<div class="dp-muted">无存储权限</div>';
        return;
      }
      const skillStore = new SkillStore(chromeSyncStorageBackend);
      const mcpStore = new McpStore(chromeStorageBackend);
      Promise.all([skillStore.getAll(), mcpStore.getAll()])
        .then(([userSkills, tools]) => {
          const allSkills: SkillEntry[] = [...BUILTIN_SKILLS, ...userSkills];
          const enabledSkills = allSkills.filter((s) => s.enabled);
          const enabledTools = tools.filter((t) => t.enabled);
          const syncOn = !!chrome.storage?.sync;
          const rows: string[] = [];
          rows.push(
            `<div class="dp-row dp-muted">技能（已启用 ${enabledSkills.length}/${allSkills.length}，云同步: ${syncOn ? '开' : '关'}）</div>`,
          );
          if (enabledSkills.length === 0) {
            rows.push('<div class="dp-muted">未启用任何技能</div>');
          } else {
            for (const s of enabledSkills) {
              rows.push(`<div class="dp-row"><b>${esc(s.name)}</b> <span class="dp-muted">${esc(s.id.startsWith('builtin-') ? '内建' : '用户')}</span><div class="dp-stream">${esc(s.content)}</div></div>`);
            }
          }
          rows.push(`<div class="dp-row dp-muted">MCP 工具（已启用 ${enabledTools.length}/${tools.length}，传输默认禁用）</div>`);
          if (enabledTools.length === 0) {
            rows.push('<div class="dp-muted">未注册任何 MCP 工具</div>');
          } else {
            for (const t of enabledTools) {
              rows.push(`<div class="dp-row"><b>${esc(t.name)}</b><div class="dp-stream">${esc(t.description)}</div></div>`);
            }
          }
          skillEl.innerHTML = rows.join('');
        })
        .catch(() => {
          skillEl.innerHTML = '<div class="dp-muted">读取技能失败</div>';
        });
    };

    const onBridge = (e: Event) => {
      const detail = (e as CustomEvent).detail as BridgeDetail;
      state = reduceBridgeEvent(state, detail);
      renderLive();
    };
    window.addEventListener(BRIDGE_EVENT, onBridge);

    // 竞态修复：document_idle 晚于 document_start，可能错过 main-world 已派发的事件。
    // 初始化时主动向 background 查询已有桥接历史，回放补齐状态（与 popup 协议一致）。
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(
        { type: 'GET_BRIDGE_HISTORY' },
        (history: Array<{ type: string; detail: unknown; receivedAt: number }> | undefined) => {
          if (!history || history.length === 0) return;
          // 按时间正序回放（最旧先来），模拟事件到达顺序
          const sorted = [...history].sort((a, b) => a.receivedAt - b.receivedAt);
          for (const item of sorted) {
            if (item.detail && typeof item.detail === 'object') {
              state = reduceBridgeEvent(state, item.detail as BridgeDetail);
            }
          }
          renderLive();
        },
      );
    }

    renderLive();
    refreshMemory();

    // 扩展上下文失效（如页面卸载 / 扩展重载）时移除监听器，避免悬挂引用
    ctx.onInvalidated(() => {
      window.removeEventListener(BRIDGE_EVENT, onBridge);
    });
  },
});
