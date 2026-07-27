// Doubao-pp 技能管理页（P4）
//
// §8 同构 + 最小豆包化：消费 P3 豆包化技能组件（SkillCard/SkillForm，content 替 instructions、
// 剥离 source/remote/memoryEnabled）+ P2 命令总线（GET_SKILLS/SAVE_SKILL/DELETE_SKILL）+ 通用资源 hook。
// 技能启用/停用经 SAVE_SKILL upsert（含 enabled 字段），触发 SKILLS_UPDATED 广播刷新。

import { useState } from 'react';
import type { Skill, SkillInput } from '../../../core/types';
import SkillCard from '../components/SkillCard';
import SkillForm from '../components/SkillForm';
import { EmptyState, SkeletonList } from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { useRuntimeResources } from '../hooks/useRuntimeResources';
import { sidepanelRuntimeClient } from '../runtime-client';

export default function SkillPage() {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Skill | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const { items, loading, error, reload } = useRuntimeResources<{ type: 'GET_SKILLS' }, Skill>({
    getRequest: { type: 'GET_SKILLS' },
    updatedEvent: 'SKILLS_UPDATED',
    mapResponse: (res) => (Array.isArray(res) ? (res as Skill[]) : []),
  });

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (skill: Skill) => {
    setEditing(skill);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleSave = async (input: SkillInput) => {
    setSaving(true);
    try {
      const baseCreatedAt = editing && editing.createdAt ? editing.createdAt : Date.now();
      const payload: Skill = editing
        ? { ...editing, ...input, id: editing.id }
        : {
            id: input.id ?? `user-${Date.now().toString(36)}`,
            name: input.name,
            description: input.description,
            content: input.content,
            enabled: input.enabled ?? true,
            builtin: false,
            createdAt: baseCreatedAt,
            updatedAt: Date.now(),
          };
      await sidepanelRuntimeClient.request({ type: 'SAVE_SKILL', payload } as never);
      closeForm();
      await reload();
    } catch {
      // 静默失败，错误态由 reload 后 error 呈现
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: Skill) => {
    if (skill.builtin) return; // 内建不可删（与 SkillStore.remove 一致）
    await sidepanelRuntimeClient.request({ type: 'DELETE_SKILL', payload: { id: skill.id } } as never);
    await reload();
  };

  const handleToggleEnabled = async (skill: Skill) => {
    await sidepanelRuntimeClient.request({
      type: 'SAVE_SKILL',
      payload: { ...skill, enabled: !skill.enabled },
    } as never);
    await reload();
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.skill.pageTitle')}</h2>
        <button className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg" onClick={openCreate}>
          {t('sidepanel.skill.newSkill')}
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
            title={t('sidepanel.skill.emptyTitle')}
            description={t('sidepanel.skill.emptyDescription')}
          />
        ) : (
          items.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onEdit={() => openEdit(skill)}
              onDelete={() => void handleDelete(skill)}
              onToggleEnabled={() => void handleToggleEnabled(skill)}
            />
          ))
        )}
      </div>

      {showForm && (
        <div className="mt-4">
          <SkillForm initialSkill={editing} onSave={(s: SkillInput) => void handleSave(s)} onCancel={closeForm} />
          {saving && <div className="mt-2 text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>{t('common.saving')}</div>}
        </div>
      )}
    </section>
  );
}
