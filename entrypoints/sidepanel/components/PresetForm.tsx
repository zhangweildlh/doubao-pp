import { useState } from 'react';
import type { PresetInput, SystemPromptPreset } from '../../../core/types';
import { useI18n } from '../i18n';

// §8 豆包化适配：上游 PresetForm 用 crypto.randomUUID() 生成 id 并传 content 字段；
// Doubao PresetStore 自带 genId（见 core/preset/store.ts），id 由 Store 生成，
// 故组件仅传 PresetInput（无 id/时间戳），且用 context 替 content。

interface Props {
  initial?: SystemPromptPreset;
  onSave: (preset: PresetInput) => void;
  onCancel: () => void;
}

export default function PresetForm({ initial, onSave, onCancel }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [content, setContent] = useState(initial?.context ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    onSave({
      name: name.trim(),
      context: content.trim(),
      description: name.trim(),
      params: initial?.params ?? {},
    });
  };

  return (
    <form onSubmit={handleSubmit} className="ds-form rounded-xl p-4 space-y-3">
      <input
        type="text"
        placeholder={t('sidepanel.preset.form.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="ds-input w-full px-3 py-2 text-sm rounded-lg transition-all duration-150"
      />

      <div>
        <label className="text-[11px] mb-1.5 block font-medium" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.preset.form.contentLabel')}
        </label>
        <textarea
          rows={8}
          placeholder={t('sidepanel.preset.form.contentPlaceholder')}
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
          {initial ? t('common.update') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
