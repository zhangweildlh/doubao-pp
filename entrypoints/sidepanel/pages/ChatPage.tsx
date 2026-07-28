// Doubao-pp 对话历史页（P6）
//
// §8 同构 + 最小豆包化：经命令总线 GET_CONVERSATION_HISTORY / CLEAR_CONVERSATION_HISTORY
// 读取并清空后台自动抓取的对话记忆（MemoryStore，键 doubao_pp_memory_v1）。复用通用资源 hook
// （CONVERSATION_HISTORY_UPDATED 广播刷新）。此为「会话历史查看」，不内置独立对话编辑器。

import { useState } from 'react';
import type { MemoryEntry } from '../../../core/memory/store';
import { EmptyState, SkeletonList, useBanner, useConfirm } from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { useRuntimeResources } from '../hooks/useRuntimeResources';
import { sidepanelRuntimeClient } from '../runtime-client';

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export default function ChatPage() {
  const { t } = useI18n();
  const [clearing, setClearing] = useState(false);
  const banner = useBanner();
  const { confirm, node: confirmNode } = useConfirm();

  const { items, loading, error, reload } = useRuntimeResources<{ type: 'GET_CONVERSATION_HISTORY' }, MemoryEntry>({
    getRequest: { type: 'GET_CONVERSATION_HISTORY' },
    updatedEvent: 'CONVERSATION_HISTORY_UPDATED',
    mapResponse: (res) => (Array.isArray(res) ? (res as MemoryEntry[]) : []),
  });

  const handleClear = async () => {
    const ok = await confirm({
      title: t('sidepanel.chat.clearConfirm'),
      message: t('sidepanel.chat.clearConfirm'),
      confirmLabel: t('sidepanel.chat.clear'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    setClearing(true);
    banner.clear();
    try {
      await sidepanelRuntimeClient.request({ type: 'CLEAR_CONVERSATION_HISTORY' });
      banner.show('success', t('sidepanel.chat.clearDone'));
      await reload();
    } catch {
      banner.show('error', t('sidepanel.settings.saveFailed'));
    } finally {
      setClearing(false);
    }
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.chat.pageTitle')}</h2>
        <button
          className="ds-btn-secondary px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40"
          onClick={() => void handleClear()}
          disabled={clearing || loading || items.length === 0}
        >
          {t('sidepanel.chat.clear')}
        </button>
      </header>

      {banner.node}
      {confirmNode}

      {error && (
        <div className="ds-banner-error text-xs px-3 py-2 rounded-lg mt-3" style={{ color: 'var(--ds-warning)' }}>
          {error}
        </div>
      )}

      <div className="mt-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>
        {t('sidepanel.chat.count', { count: items.length })}
      </div>

      <div className="mt-2 space-y-2">
        {loading ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            title={t('sidepanel.chat.emptyTitle')}
            description={t('sidepanel.chat.emptyDescription')}
          />
        ) : (
          items
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((conv) => (
              <div key={conv.id} className="ds-surface-panel rounded-xl p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--ds-text)' }}>
                    {conv.conversationId ?? conv.id}
                  </div>
                  <div className="text-[10px] shrink-0" style={{ color: 'var(--ds-text-tertiary)' }}>
                    {formatTime(conv.createdAt)}
                  </div>
                </div>
                <p
                  className="text-[11px] leading-relaxed whitespace-pre-wrap line-clamp-3"
                  style={{ color: 'var(--ds-text-secondary)' }}
                >
                  {conv.assistantText}
                </p>
              </div>
            ))
        )}
      </div>
    </section>
  );
}
