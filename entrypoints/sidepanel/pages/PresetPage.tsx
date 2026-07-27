// Doubao-pp 预设管理页（P4）
//
// §8 同构 + 最小豆包化：消费 P3 豆包化预设组件（PresetCard/PresetForm，context 替 content、
// id 由 PresetStore 生成）+ P2 命令总线（GET_PRESETS/SAVE_PRESET/DELETE_PRESET/SET_ACTIVE_PRESET/
// GET_ACTIVE_PRESET）+ 通用资源 hook。
// 激活态经 GET_ACTIVE_PRESET 取当前 id，SET_ACTIVE_PRESET 切换，触发 PRESETS_UPDATED 广播刷新。

import { useEffect, useState } from 'react';
import type { PresetInput, SystemPromptPreset } from '../../../core/types';
import PresetCard from '../components/PresetCard';
import PresetForm from '../components/PresetForm';
import { EmptyState, SkeletonList } from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { useRuntimeResources } from '../hooks/useRuntimeResources';
import { sidepanelRuntimeClient } from '../runtime-client';

export default function PresetPage() {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<string>('');
  const [editing, setEditing] = useState<SystemPromptPreset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const { items, loading, error, reload } = useRuntimeResources<{ type: 'GET_PRESETS' }, SystemPromptPreset>({
    getRequest: { type: 'GET_PRESETS' },
    updatedEvent: 'PRESETS_UPDATED',
    mapResponse: (res) => (Array.isArray(res) ? (res as SystemPromptPreset[]) : []),
  });

  // 拉取当前激活预设 id（与列表广播解耦，避免每次广播重复请求）
  useEffect(() => {
    void (async () => {
      try {
        const active = await sidepanelRuntimeClient.request({ type: 'GET_ACTIVE_PRESET' });
        setActiveId(
          active && typeof active === 'object' && 'id' in active
            ? String((active as { id?: unknown }).id ?? '')
            : '',
        );
      } catch {
        setActiveId('');
      }
    })();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (preset: SystemPromptPreset) => {
    setEditing(preset);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleSave = async (input: PresetInput) => {
    setSaving(true);
    try {
      // 编辑时带 id（Store 按 id upsert）；新建时不含 id（Store 自带 genId）
      const payload: PresetInput & { id?: string } = editing
        ? { ...input, id: editing.id }
        : input;
      await sidepanelRuntimeClient.request({ type: 'SAVE_PRESET', payload } as never);
      closeForm();
      await reload();
    } catch {
      // 静默，error 态后续呈现
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset: SystemPromptPreset) => {
    await sidepanelRuntimeClient.request({ type: 'DELETE_PRESET', payload: { id: preset.id } } as never);
    if (activeId === preset.id) setActiveId('');
    await reload();
  };

  const handleActivate = async (preset: SystemPromptPreset) => {
    await sidepanelRuntimeClient.request({ type: 'SET_ACTIVE_PRESET', payload: { id: preset.id } } as never);
    setActiveId(preset.id);
    await reload();
  };
  const handleDeactivate = async () => {
    await sidepanelRuntimeClient.request({ type: 'SET_ACTIVE_PRESET', payload: { id: '' } } as never);
    setActiveId('');
    await reload();
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.preset.pageTitle')}</h2>
        <button className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg" onClick={openCreate}>
          {t('sidepanel.preset.newPreset')}
        </button>
      </header>

      {error && (
        <div className="ds-banner-error text-xs px-3 py-2 rounded-lg mt-3" style={{ color: 'var(--ds-warning)' }}>
          {error}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            title={t('sidepanel.preset.emptyTitle')}
            description={t('sidepanel.preset.emptyDescription')}
          />
        ) : (
          items.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={preset.id === activeId}
              onActivate={() => void handleActivate(preset)}
              onDeactivate={() => void handleDeactivate()}
              onEdit={() => openEdit(preset)}
              onDelete={() => void handleDelete(preset)}
            />
          ))
        )}
      </div>

      {showForm && (
        <div className="mt-4">
          <PresetForm initial={editing ?? undefined} onSave={(p: PresetInput) => void handleSave(p)} onCancel={closeForm} />
          {saving && <div className="mt-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>{t('common.saving')}</div>}
        </div>
      )}
    </section>
  );
}
