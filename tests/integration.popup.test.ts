// @vitest-environment jsdom
//
// popup 桥接历史查看器集成测试（jsdom 环境）
//
// 在导入前构造 #app 容器、桩接 chrome.runtime.sendMessage，
// 验证 init() 渲染标题/清空按钮、拉取历史渲染列表、点击清空触发 CLEAR。

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

describe('popup 桥接历史查看器（集成）', () => {
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const history = [
      { type: '__DOUBAO_PP_BRIDGE_V1__', detail: { text: '助手回复内容示例' }, receivedAt: 100 },
      { type: '__DOUBAO_PP_BRIDGE_V1__', detail: { text: '另一条' }, receivedAt: 200 },
    ];
    sendMessage = vi.fn((msg: any, cb: any) => {
      if (msg.type === 'GET_BRIDGE_HISTORY') cb(history);
      else cb();
    });
    (globalThis as any).chrome = { runtime: { sendMessage } };
    // 必须在 DOM 与 chrome 桩就位后动态导入（main.ts 顶层即 init()）
    await import('../entrypoints/popup/main.ts');
  });

  // 清理全局桩，避免 globalThis.chrome 跨文件污染
  afterAll(() => {
    delete (globalThis as any).chrome;
  });

  it('初始化渲染标题与清空按钮', () => {
    const app = document.getElementById('app')!;
    expect(app.innerHTML).toContain('桥接历史');
    expect(document.getElementById('clear-btn')).not.toBeNull();
  });

  it('拉取历史并渲染列表（按 receivedAt 倒序）', () => {
    const list = document.getElementById('list')!;
    expect(list.innerHTML).toContain('助手回复内容示例');
    const idxAnother = list.innerHTML.indexOf('另一条');
    const idxFirst = list.innerHTML.indexOf('助手回复内容示例');
    expect(idxAnother).toBeGreaterThanOrEqual(0);
    expect(idxFirst).toBeGreaterThanOrEqual(0);
    expect(idxAnother).toBeLessThan(idxFirst); // receivedAt 200 在前
  });

  it('点击清空按钮触发 CLEAR_BRIDGE_HISTORY', () => {
    const btn = document.getElementById('clear-btn')!;
    (btn as HTMLButtonElement).click();
    const clearCalled = sendMessage.mock.calls.some(
      (c: any[]) => c[0]?.type === 'CLEAR_BRIDGE_HISTORY',
    );
    expect(clearCalled).toBe(true);
  });
});
