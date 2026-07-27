import { useEffect, useState } from 'react';
import type { Skill, SkillInput } from '../../../core/types';
import { useI18n } from '../i18n';

// §8 豆包化适配：上游 SkillForm 用 instructions/source/memoryEnabled 字段 + ToggleRow 记忆注入开关。
// Doubao Skill 类型无这些字段（见 core/types.ts），此处仅保留 name/description/content，
// content 替 instructions；移除 source/memoryEnabled 与记忆注入开关，守住"最小豆包化"铁律。

interface Props {
  initialSkill?: Skill | null;
  onSave: (skill: SkillInput) => void;
  onCancel: () => void;
}

export default function SkillForm({ initialSkill, onSave, onCancel }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(initialSkill?.name ?? '');
  const [description, setDescription] = useState(initialSkill?.description ?? '');
  const [content, setContent] = useState(initialSkill?.content ?? '');

  const normalizedName = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const isEditing = Boolean(initialSkill);

  useEffect(() => {
    setName(initialSkill?.name ?? '');
    setDescription(initialSkill?.description ?? '');
    setContent(initialSkill?.content ?? '');
  }, [initialSkill]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedName || !content.trim()) return;
    onSave({
      name: normalizedName,
      description: description.trim(),
      content: content.trim(),
      enabled: initialSkill?.enabled !== false,
      builtin: initialSkill?.builtin ?? false,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="ds-form rounded-xl p-4 space-y-3">
      <div>
        <input
          type="text"
          placeholder={t('sidepanel.skill.form.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="ds-input w-full px-3 py-2 text-sm rounded-lg transition-all duration-150"
        />
        {normalizedName && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--ds-text-tertiary)' }}>
            {t('sidepanel.skill.form.triggerCommand')} <code className="font-mono" style={{ color: 'var(--ds-blue)' }}>/{normalizedName}</code>
          </p>
        )}
      </div>

      <input
        type="text"
        placeholder={t('sidepanel.skill.form.descriptionPlaceholder')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="ds-input w-full px-3 py-2 text-sm rounded-lg transition-all duration-150"
      />

      <div>
        <label className="text-[11px] mb-1.5 block font-medium" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.skill.form.instructionsLabel')}
        </label>
        <textarea
          rows={6}
          placeholder={t('sidepanel.skill.form.instructionsPlaceholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="ds-input w-full px-3 py-2 text-sm font-mono rounded-lg resize-none transition-all duration-150"
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="ds-btn-cancel px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          className="ds-btn-primary px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-all duration-150"
        >
          {isEditing ? t('common.saveChanges') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
