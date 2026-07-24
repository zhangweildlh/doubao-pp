// @vitest-environment jsdom
//
// popup 记忆标签页集成测试（jsdom 环境）
//
// 在 DOM 与 chrome 桩就位后动态导入 popup/main.ts，验证：
//   - 默认仍渲染「桥接历史」标签（兼容旧测试）
//   - 激活「记忆」标签触发 GET_MEMORY 并倒序渲染条目
//   - 「清空记忆」按钮触发 CLEAR_MEMORY

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

describe('popup 记忆标签页（集成）', () => {
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const memory = [
      {
        id: 'c1',
        conversationId: 'c1',
        sectionId: 's1',
        sessionUrl: 'url',
        assistantText: '记忆内容示例',
        createdAt: 100,
        updatedAt: 200,
      },
      {
        id: 'c2',
        conversationId: 'c2',
        sectionId: 's2',
        sessionUrl: 'url2',
        assistantText: '另一条记忆',
        createdAt: 50,
        updatedAt: 300,
      },
    ];
    const history = [
      {
        type: '__DOUBAO_PP_BRIDGE_V1__',
        detail: { text: '桥接示例' },
        receivedAt: 100,
      },
    ];
    sendMessage = vi.fn((msg: any, cb: any) => {
      if (msg.type === 'GET_BRIDGE_HISTORY') cb(history);
      else if (msg.type === 'GET_MEMORY') cb(memory);
      else cb();
    });
    (globalThis as any).chrome = { runtime: { sendMessage } };
    await import('../entrypoints/popup/main.ts');
  });

  // 清理全局桩，避免 globalThis.chrome 跨文件污染
  afterAll(() => {
    delete (globalThis as any).chrome;
  });

  it('默认渲染桥接历史标签与清空按钮（兼容旧测试）', () => {
    const app = document.getElementById('app')!;
    expect(app.innerHTML).toContain('桥接历史');
    expect(document.getElementById('clear-btn')).not.toBeNull();
  });

  it('激活记忆标签触发 GET_MEMORY 并倒序渲染条目', () => {
    const memTab = document.querySelector('[data-tab="memory"]') as HTMLButtonElement;
    memTab.click();
    const memCalls = sendMessage.mock.calls.filter(
      (c: any[]) => c[0]?.type === 'GET_MEMORY',
    );
    expect(memCalls.length).toBeGreaterThanOrEqual(1);

    const memList = document.getElementById('mem-list')!;
    expect(memList.innerHTML).toContain('记忆内容示例');
    expect(memList.innerHTML).toContain('另一条记忆');
    // 倒序：updatedAt 300(c2) 应在 200(c1) 之前
    expect(memList.innerHTML.indexOf('另一条记忆')).toBeLessThan(
      memList.innerHTML.indexOf('记忆内容示例'),
    );
  });

  it('记忆标签的清空按钮触发 CLEAR_MEMORY', () => {
    const memTab = document.querySelector('[data-tab="memory"]') as HTMLButtonElement;
    memTab.click();
    const clearBtn = document.getElementById('clear-mem-btn') as HTMLButtonElement;
    clearBtn.click();
    const clearCalls = sendMessage.mock.calls.filter(
      (c: any[]) => c[0]?.type === 'CLEAR_MEMORY',
    );
    expect(clearCalls.length).toBeGreaterThanOrEqual(1);
  });
});
