// Doubao-pp useRuntimeResources hook 单测（P4）
//
// 验证：1) 挂载即发 GET_* 命令；2) 命中 *_UPDATED 广播重新 load；3) 卸载移除监听（无泄漏）；
// 4) 加载/错误/空态正确流转。使用 react-dom/client + React.act（不引入 testing-library 依赖，
// 守住"不装新工具"本地原则）；vi.mock 隔离 chrome.runtime。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRuntimeResources } from '../entrypoints/sidepanel/hooks/useRuntimeResources';
import type { AnyTypedRuntimeCommandRequest } from '../entrypoints/sidepanel/runtime-client';

// 声明 React 19 act 环境，消除 "not configured to support act" 警告
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 隔离 chrome.runtime.onMessage
const listeners: Array<(msg: unknown) => void> = [];
const fakeSendMessage = vi.fn();
const fakeOnMessage = {
  addListener: (fn: (msg: unknown) => void) => listeners.push(fn),
  removeListener: (fn: (msg: unknown) => void) => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  listeners.length = 0;
  fakeSendMessage.mockReset();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: fakeSendMessage,
      onMessage: fakeOnMessage,
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function Harness({
  getRequest,
  updatedEvent,
  onItems,
}: {
  getRequest: AnyTypedRuntimeCommandRequest;
  updatedEvent: string;
  onItems?: (n: number) => void;
}) {
  const { items, loading, error } = useRuntimeResources<AnyTypedRuntimeCommandRequest, { id: string }>({
    getRequest,
    updatedEvent,
    mapResponse: (res) => (Array.isArray(res) ? (res as { id: string }[]) : []),
  });
  onItems?.(items.length);
  return createElement(
    'div',
    null,
    createElement('span', { 'data-testid': 'loading' }, String(loading)),
    createElement('span', { 'data-testid': 'error' }, error ?? ''),
    createElement('span', { 'data-testid': 'count' }, String(items.length)),
  );
}

function read(testid: string): string {
  return container.querySelector(`[data-testid="${testid}"]`)?.textContent ?? '';
}

describe('useRuntimeResources', () => {
  it('挂载即请求 GET 命令，并渲染列表', async () => {
    fakeSendMessage.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]);
    await act(async () => {
      root.render(
        createElement(Harness, {
          getRequest: { type: 'GET_MEMORIES' } as AnyTypedRuntimeCommandRequest,
          updatedEvent: 'MEMORIES_UPDATED',
        }),
      );
    });

    expect(fakeSendMessage).toHaveBeenCalledTimes(1);
    expect(fakeSendMessage).toHaveBeenCalledWith({ type: 'GET_MEMORIES' });
    expect(read('count')).toBe('2');
    expect(read('loading')).toBe('false');
  });

  it('命中 *_UPDATED 广播会重新 load（计数 +1）', async () => {
    fakeSendMessage.mockResolvedValueOnce([{ id: 'a' }]);
    await act(async () => {
      root.render(
        createElement(Harness, {
          getRequest: { type: 'GET_MEMORIES' } as AnyTypedRuntimeCommandRequest,
          updatedEvent: 'MEMORIES_UPDATED',
        }),
      );
    });
    expect(read('count')).toBe('1');

    fakeSendMessage.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    await act(async () => {
      listeners.forEach((fn) => fn({ type: 'MEMORIES_UPDATED' }));
    });

    expect(read('count')).toBe('3');
    expect(fakeSendMessage).toHaveBeenCalledTimes(2);
  });

  it('卸载时移除 onMessage 监听（无泄漏）', async () => {
    fakeSendMessage.mockResolvedValueOnce([]);
    await act(async () => {
      root.render(
        createElement(Harness, {
          getRequest: { type: 'GET_MEMORIES' } as AnyTypedRuntimeCommandRequest,
          updatedEvent: 'MEMORIES_UPDATED',
        }),
      );
    });
    expect(read('loading')).toBe('false');
    expect(listeners.length).toBe(1);

    await act(async () => {
      root.unmount();
    });
    expect(listeners.length).toBe(0);
  });

  it('加载失败进入 error 态，不崩溃', async () => {
    fakeSendMessage.mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      root.render(
        createElement(Harness, {
          getRequest: { type: 'GET_MEMORIES' } as AnyTypedRuntimeCommandRequest,
          updatedEvent: 'MEMORIES_UPDATED',
        }),
      );
    });
    expect(read('error')).toBe('boom');
    expect(read('count')).toBe('0');
  });
});
