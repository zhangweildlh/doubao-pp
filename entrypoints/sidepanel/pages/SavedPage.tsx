// Doubao-pp 收藏页（P6）
//
// §8 同构 + 最小豆包化：消费命令总线（GET_SAVED / SAVE_SAVED / DELETE_SAVED）+ 通用资源 hook
// （SAVED_UPDATED 广播刷新）。收藏「提示词 / 片段 / 模板」，与笔记型记忆（MemoryPage）区分：
// 此处为轻量片段收藏，不含类型筛选等记忆高级能力。

import { useState } from 'react';
import type { SavedSnippet, SavedSnippetInput } from '../../../core/saved/store';
import {
  EmptyState,
  SkeletonList,
  useBanner,
  useConfirm,
} from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { useRuntimeResources } from '../hooks/useRuntimeResources';
import { sidepanelRuntimeClient } from '../runtime-client';

export default function SavedPage() {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editing, setEditing] = useState<SavedSnippet | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const banner = useBanner();
  const { confirm, node: confirmNode } = useConfirm();

  const { items, loading, error, reload } = useRuntimeResources<{ type: 'GET_SAVED' }, SavedSnippet>({
    getRequest: { type: 'GET_SAVED' },
    updatedEvent: 'SAVED_UPDATED',
    mapResponse: (res) => (Array.isArray(res) ? (res as SavedSnippet[]) : []),
  });

  const resetForm = () => {
    setTitle('');
    setContent('');
    setEditing(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (snippet: SavedSnippet) => {
    setEditing(snippet);
    setTitle(snippet.title);
    setContent(snippet.content);
    setShowForm(true);
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    banner.clear();
    try {
      const input: SavedSnippetInput = {
        id: editing?.id,
        title: title.trim(),
        content: content.trim(),
        // 保留原标签：编辑既有收藏时沿用其 tags，新建时为空；避免静默清空（Low1）。
        tags: editing?.tags ?? [],
      };
      await sidepanelRuntimeClient.request({ type: 'SAVE_SAVED', payload: input } as never);
      banner.show('success', t('sidepanel.saved.created'));
      resetForm();
      await reload();
    } catch {
      banner.show('error', t('sidepanel.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (snippet: SavedSnippet) => {
    const ok = await confirm({
      title: t('sidepanel.saved.deleteConfirm', { name: snippet.title }),
      message: t('sidepanel.saved.deleteConfirm', { name: snippet.title }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await sidepanelRuntimeClient.request({ type: 'DELETE_SAVED', payload: { id: snippet.id } } as never);
      await reload();
    } catch {
      // 删除失败仍保留列表并提示，避免静默 reload 致 UI 与存储不一致（Low2）。
      banner.show('error', t('sidepanel.settings.saveFailed'));
    }
  };

  const inputStyle = {
    background: 'var(--ds-bg)',
    borderColor: 'var(--ds-border)',
    color: 'var(--ds-text)',
    borderRadius: 'var(--radius-ctrl)',
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.saved.pageTitle')}</h2>
        <button className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg" onClick={openCreate}>
          {t('sidepanel.saved.newSaved')}
        </button>
      </header>

      {error && (
        <div className="ds-banner-error text-xs px-3 py-2 rounded-lg mt-3" style={{ color: 'var(--ds-warning)' }}>
          {error}
        </div>
      )}
      {banner.node}
      {confirmNode}

      {showForm && (
        <div className="ds-surface-panel rounded-xl p-4 space-y-3 mt-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('sidepanel.saved.titlePlaceholder')}
            className="w-full px-3 py-2 text-xs border outline-none"
            style={inputStyle}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('sidepanel.saved.contentPlaceholder')}
            rows={4}
            className="w-full px-3 py-2 text-xs border outline-none resize-none"
            style={inputStyle}
          />
          <div className="flex justify-end gap-2">
            <button className="ds-btn-cancel px-3 py-1.5 text-xs rounded-lg" onClick={resetForm}>
              {t('common.cancel')}
            </button>
            <button
              className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-40"
              onClick={() => void save()}
              disabled={saving || !title.trim()}
            >
              {t('sidepanel.saved.save')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState title={t('sidepanel.saved.emptyTitle')} description={t('sidepanel.saved.emptyDescription')} />
        ) : (
          items.map((snippet) => (
            <div key={snippet.id} className="ds-surface-panel rounded-xl p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--ds-text)' }}>
                    {snippet.title}
                  </div>
                  {snippet.content && (
                    <p className="text-[11px] mt-0.5 leading-relaxed whitespace-pre-wrap line-clamp-2" style={{ color: 'var(--ds-text-secondary)' }}>
                      {snippet.content}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(snippet)}
                    className="ds-action-btn ds-action-btn-edit px-2 py-1 text-[11px] rounded-md"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(snippet)}
                    className="ds-action-btn ds-action-btn-delete px-2 py-1 text-[11px] rounded-md"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
