// Doubao-pp sidePanel 通用资源页 hook（P4）
//
// §8 同构 + 最小豆包化：上游用各 page controller 承载「取数 + 订阅变更广播 + 加载/错误/空态」，
// Doubao 抽此通用 hook 统一封装，避免 13 页面重复、守住与命令总线同构（方式 B 铁律）。
//
// 职责：
//   - load：经 sidepanelRuntimeClient.request 发 GET_* 命令取数；
//   - 订阅后台广播的 *_UPDATED 事件（chrome.runtime.onMessage），命中即重新 load（响应式刷新）；
//   - 暴露 loading / error / items，供页面渲染空态/错误/骨架；
//   - 卸载时移除 onMessage 监听，避免泄漏（生命周期陷阱）。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sidepanelRuntimeClient,
  SidepanelRuntimeError,
} from '../runtime-client';
import type { AnyTypedRuntimeCommandRequest } from '../runtime-client';

export interface UseRuntimeResourcesOptions<
  TGetRequest extends AnyTypedRuntimeCommandRequest,
  TItem,
> {
  /** GET 命令请求（如 { type: 'GET_MEMORIES' }） */
  getRequest: TGetRequest;
  /** 后台变更广播事件名（如 'MEMORIES_UPDATED'），命中即重新 load */
  updatedEvent: string;
  /** 把命令响应映射为列表项数组 */
  mapResponse: (response: unknown) => TItem[];
  /** 初始是否自动加载 */
  autoLoad?: boolean;
}

export interface UseRuntimeResourcesResult<TItem> {
  items: TItem[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useRuntimeResources<
  TGetRequest extends AnyTypedRuntimeCommandRequest,
  TItem,
>(options: UseRuntimeResourcesOptions<TGetRequest, TItem>): UseRuntimeResourcesResult<TItem> {
  const { getRequest, updatedEvent, mapResponse, autoLoad = true } = options;

  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState<boolean>(autoLoad);
  const [error, setError] = useState<string | null>(null);

  // 用 ref 持有最新 reload，避免 onMessage 监听闭包陈旧
  const reloadRef = useRef<() => Promise<void>>(async () => {});

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sidepanelRuntimeClient.request(getRequest as AnyTypedRuntimeCommandRequest);
      setItems(mapResponse(response));
    } catch (err) {
      const msg =
        err instanceof SidepanelRuntimeError
          ? err.message
          : err instanceof Error
            ? err.message
            : '加载失败';
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [getRequest, mapResponse]);

  // 保持 reloadRef 同步最新闭包
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // 首次加载 + 订阅 *_UPDATED 广播
  useEffect(() => {
    void reloadRef.current();

    const listener = (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: unknown }).type === updatedEvent
      ) {
        void reloadRef.current();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
    // 仅初始化一次；updatedEvent 固定，getRequest 由调用方保证稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedEvent]);

  return { items, loading, error, reload };
}
