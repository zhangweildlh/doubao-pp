// Doubao-pp 记忆管理页（P4）
//
// §8 同构 + 最小豆包化：消费 P3 笔记型记忆组件（MemoryCard/MemoryForm）+ P2 命令总线
// （GET_MEMORIES/SAVE_MEMORY/GET_MEMORY_BY_ID/DELETE_MEMORY/CLEAR_MEMORIES）+ 通用资源 hook。
// 笔记型记忆（Memory）与第2步对话记忆（MemoryEntry）并存、互不影响。

import { useMemo, useState } from 'react';
import type { Memory, MemoryType, NewMemory } from '../../../core/types';
import MemoryCard from '../components/MemoryCard';
import MemoryForm from '../components/MemoryForm';
import { EmptyState, SegmentedControl, SkeletonList, Spinner } from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { useRuntimeResources } from '../hooks/useRuntimeResources';
import { sidepanelRuntimeClient } from '../runtime-client';

type FilterKey = 'all' | MemoryType;

const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'sidepanel.memory.filters.all' },
  { key: 'user', labelKey: 'sidepanel.memory.types.user' },
  { key: 'feedback', labelKey: 'sidepanel.memory.types.feedback' },
  { key: 'topic', labelKey: 'sidepanel.memory.types.topic' },
  { key: 'reference', labelKey: 'sidepanel.memory.types.reference' },
];

export default function MemoryPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [editing, setEditing] = useState<Memory | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const { items, loading, error, reload } = useRuntimeResources<{ type: 'GET_MEMORIES' }, Memory>({
    getRequest: { type: 'GET_MEMORIES' },
    updatedEvent: 'MEMORIES_UPDATED',
    mapResponse: (res) => (Array.isArray(res) ? (res as Memory[]) : []),
  });

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((m) => m.type === filter)),
    [items, filter],
  );

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (mem: Memory) => {
    setEditing(mem);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleSave = async (mem: NewMemory) => {
    setSaving(true);
    try {
      const payload: NewMemory = editing ? { ...mem, id: editing.id } : mem;
      await sidepanelRuntimeClient.request({
        type: 'SAVE_MEMORY',
        payload,
      } as never);
      closeForm();
      await reload();
    } catch {
      // 错误由页面层 banner 或 reload 后 error 态呈现；此处静默，保持交互流畅
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (mem: Memory) => {
    await sidepanelRuntimeClient.request({ type: 'DELETE_MEMORY', payload: { id: mem.id } } as never);
    await reload();
  };

  const handleTogglePin = async (mem: Memory) => {
    // 置顶 = 更新 pinned 字段（SAVE_MEMORY 按 id upsert）
    await sidepanelRuntimeClient.request({
      type: 'SAVE_MEMORY',
      payload: { ...mem, pinned: !mem.pinned, id: mem.id },
    } as never);
    await reload();
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.memory.pageTitle')}</h2>
        <button className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg" onClick={openCreate}>
          {t('sidepanel.memory.newMemory')}
        </button>
      </header>

      <SegmentedControl
        ariaLabel={t('sidepanel.memory.filterAria')}
        options={FILTERS.map((f) => ({ key: f.key, label: t(f.labelKey) }))}
        value={filter}
        onChange={(k) => setFilter(k as FilterKey)}
      />

      {error && (
        <div className="ds-banner-error text-xs px-3 py-2 rounded-lg mt-3" style={{ color: 'var(--ds-warning)' }}>
          {error}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <SkeletonList rows={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t('sidepanel.memory.emptyTitle')}
            description={t('sidepanel.memory.emptyDescription')}
            actions={
              <button className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg" onClick={openCreate}>
                {t('sidepanel.memory.newMemory')}
              </button>
            }
          />
        ) : (
          filtered.map((mem) => (
            <MemoryCard
              key={mem.id}
              memory={mem}
              onEdit={() => openEdit(mem)}
              onDelete={() => void handleDelete(mem)}
              onTogglePin={() => void handleTogglePin(mem)}
            />
          ))
        )}
      </div>

      {showForm && (
        <div className="mt-4">
          <MemoryForm initial={editing} onSave={(m: NewMemory) => void handleSave(m)} onCancel={closeForm} />
          {saving && <div className="mt-2 flex items-center gap-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}><Spinner /> {t('common.saving')}</div>}
        </div>
      )}
    </section>
  );
}
