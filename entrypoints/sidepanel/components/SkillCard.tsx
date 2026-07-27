import type { Skill } from '../../../core/types';
import { SVG_PATHS } from '../constants';
import { useI18n } from '../i18n';

// §8 豆包化适配：上游 SkillCard 渲染 skill.remote/skill.source/skill.memoryEnabled 徽标。
// Doubao Skill 类型无这些字段（见 core/types.ts），此处仅渲染 builtin 徽标 + 启用态，
// 剥离 remote/source/memoryEnabled 渲染，守住"最小豆包化"铁律。

interface Props {
  skill: Skill;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleEnabled?: () => void;
  busy?: boolean;
}

export default function SkillCard({ skill, onEdit, onDelete, onToggleEnabled, busy }: Props) {
  const { t } = useI18n();
  const enabled = skill.enabled !== false;
  const hasActions = Boolean(onEdit || onDelete || onToggleEnabled);
  const toggleLabel = enabled
    ? t('sidepanel.skill.actions.disableSkill', { name: skill.name })
    : t('sidepanel.skill.actions.enableSkill', { name: skill.name });

  return (
    <div
      className="ds-card group"
      style={{ padding: '12px 14px', opacity: enabled ? undefined : 0.6 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <code
            className="font-mono font-semibold"
            style={{
              fontSize: '12px',
              padding: '2px 6px',
              borderRadius: 'var(--radius-ctrl)',
              background: 'var(--ds-blue-light)',
              color: 'var(--ds-blue)',
            }}
          >
            /{skill.name}
          </code>
          {skill.builtin && (
            <span
              className="text-[10px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--ds-text-tertiary)' }}
            >
              {t('sidepanel.skill.sources.builtin')}
            </span>
          )}
          {!enabled && (
            <span
              className="text-[10px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--ds-warning)' }}
            >
              {t('sidepanel.skill.disabledBadge')}
            </span>
          )}
        </div>
        {hasActions && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
            {onToggleEnabled && (
              <button
                type="button"
                title={enabled ? t('common.deactivate') : t('common.enable')}
                aria-label={toggleLabel}
                onClick={onToggleEnabled}
                className="ds-action-btn w-7 h-7 flex items-center justify-center"
                style={{ borderRadius: 'var(--radius-ctrl)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={enabled ? 'M18.364 18.364A9 9 0 015.636 5.636m12.728 12.728A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636' : 'M5 13l4 4L19 7'} />
                </svg>
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                title={t('common.edit')}
                aria-label={t('sidepanel.skill.actions.editSkill', { name: skill.name })}
                onClick={onEdit}
                className="ds-action-btn ds-action-btn-edit w-7 h-7 flex items-center justify-center"
                style={{ borderRadius: 'var(--radius-ctrl)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={SVG_PATHS.edit} />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                title={t('common.delete')}
                aria-label={t('sidepanel.skill.actions.deleteSkill', { name: skill.name })}
                onClick={onDelete}
                className="ds-action-btn ds-action-btn-delete w-7 h-7 flex items-center justify-center"
                style={{ borderRadius: 'var(--radius-ctrl)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={SVG_PATHS.trash} />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--ds-text-secondary)', marginTop: '8px' }}>
        {skill.description}
      </p>

      {skill.content && (
        <p
          className="text-[11px] leading-relaxed line-clamp-3"
          style={{ color: 'var(--ds-text-tertiary)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--ds-border)' }}
        >
          {skill.content}
        </p>
      )}
    </div>
  );
}
