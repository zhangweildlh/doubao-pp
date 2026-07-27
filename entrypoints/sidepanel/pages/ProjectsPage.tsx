// Doubao-pp 项目上下文页（P4）
//
// §8 同构 + 最小豆包化：消费 P2 命令总线（CREATE_PROJECT_CONTEXT / GET_PROJECT_CONTEXT_STATE /
// UPDATE_PROJECT_CONTEXT / DELETE_PROJECT_CONTEXT）+ 通用资源 hook（PROJECT_CONTEXT_UPDATED 刷新）。
// Doubao 的 ProjectEntry 仅含 name/description/context/sessionUrls（不含上游的 conversations/pending
// 等跨会话归档子结构），故页面聚焦「创建 / 编辑 / 删除」最小闭环；上游的会话挂载/待定态后端未移植
// （GET_CURRENT_* 等命令不存在），属最小豆包化裁剪（§8 容许）。

import { useState } from 'react';
import type { ProjectEntry, ProjectInput } from '../../../core/project/store';
import {
  EmptyState,
  SkeletonList,
  useBanner,
  useConfirm,
} from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { useRuntimeResources } from '../hooks/useRuntimeResources';
import { sidepanelRuntimeClient } from '../runtime-client';

export default function ProjectsPage() {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [editing, setEditing] = useState<ProjectEntry | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const banner = useBanner();
  const { confirm, node: confirmNode } = useConfirm();

  const { items, loading, error, reload } = useRuntimeResources<{ type: 'GET_PROJECT_CONTEXT_STATE' }, ProjectEntry>({
    getRequest: { type: 'GET_PROJECT_CONTEXT_STATE' },
    updatedEvent: 'PROJECT_CONTEXT_UPDATED',
    mapResponse: (res) => (Array.isArray(res) ? (res as ProjectEntry[]) : []),
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setContext('');
    setEditing(null);
    setShowForm(false);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (project: ProjectEntry) => {
    setEditing(project);
    setName(project.name);
    setDescription(project.description);
    setContext(project.context);
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    banner.clear();
    try {
      if (editing) {
        await sidepanelRuntimeClient.request({
          type: 'UPDATE_PROJECT_CONTEXT',
          payload: {
            id: editing.id,
            name: name.trim(),
            description: description.trim(),
            context: context.trim(),
            sessionUrls: editing.sessionUrls,
          },
        } as never);
        banner.show('success', t('sidepanel.projects.saved'));
      } else {
        const input: ProjectInput = {
          name: name.trim(),
          description: description.trim(),
          context: context.trim(),
          sessionUrls: [],
        };
        await sidepanelRuntimeClient.request({ type: 'CREATE_PROJECT_CONTEXT', payload: input } as never);
        banner.show('success', t('sidepanel.projects.created'));
      }
      resetForm();
      await reload();
    } catch {
      banner.show('error', t('sidepanel.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (project: ProjectEntry) => {
    const ok = await confirm({
      title: t('sidepanel.projects.deleteConfirm', { name: project.name }),
      message: t('sidepanel.projects.deleteConfirm', { name: project.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    await sidepanelRuntimeClient.request({ type: 'DELETE_PROJECT_CONTEXT', payload: { id: project.id } } as never);
    await reload();
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
        <h2 className="ds-page-title">{t('sidepanel.projects.title')}</h2>
        <button className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg" onClick={openCreate}>
          {t('sidepanel.projects.createProject')}
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('sidepanel.projects.namePlaceholder')}
            className="w-full px-3 py-2 text-xs border outline-none"
            style={inputStyle}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('sidepanel.projects.descriptionPlaceholder')}
            rows={2}
            className="w-full px-3 py-2 text-xs border outline-none resize-none"
            style={inputStyle}
          />
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder={t('sidepanel.projects.contextPlaceholder')}
            rows={3}
            className="w-full px-3 py-2 text-xs border outline-none resize-none"
            style={inputStyle}
          />
          <div className="flex justify-end gap-2">
            <button className="ds-btn-cancel px-3 py-1.5 text-xs rounded-lg" onClick={resetForm}>
              {t('sidepanel.mcp.cancel')}
            </button>
            <button
              className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-40"
              onClick={() => void save()}
              disabled={saving || !name.trim()}
            >
              {editing ? t('sidepanel.projects.save') : t('sidepanel.projects.createProject')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState title={t('sidepanel.projects.empty')} description={t('sidepanel.projects.emptyHelp')} />
        ) : (
          items.map((project) => (
            <div key={project.id} className="ds-surface-panel rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--ds-text)' }}>
                    {project.name}
                  </div>
                  {project.description && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ds-text-secondary)' }}>
                      {project.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(project)}
                    className="ds-action-btn ds-action-btn-edit px-2 py-1 text-[11px] rounded-md"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(project)}
                    className="ds-action-btn ds-action-btn-delete px-2 py-1 text-[11px] rounded-md"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
              {project.context && (
                <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ds-text-secondary)' }}>
                  {project.context}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
