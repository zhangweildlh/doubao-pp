// Doubao-pp 自动化页（P6）
//
// §8 同构 + 最小豆包化：消费命令总线（GET_AUTOMATIONS / CREATE_AUTOMATION / DELETE_AUTOMATION）
// + 通用资源 hook（AUTOMATIONS_UPDATED 广播刷新）。规则为轻量声明，v1.11.6.2 仅做增删的最小闭环
// （实际调度引擎属后续阶段，§8 容许的豆包化裁剪）；启用停用由创建时 enabled 字段决定。

import { useState } from 'react';
import type {
  AutomationAction,
  AutomationRule,
  AutomationRuleInput,
  AutomationTrigger,
} from '../../../core/automation/store';
import {
  EmptyState,
  SkeletonList,
  ToggleRow,
  SegmentedControl,
  TextField,
  useBanner,
  useConfirm,
} from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { useRuntimeResources } from '../hooks/useRuntimeResources';
import { sidepanelRuntimeClient } from '../runtime-client';

function triggerLabel(t: (key: string) => string, trigger: AutomationTrigger): string {
  switch (trigger) {
    case 'manual':
      return t('sidepanel.automation.triggerManual');
    case 'onNewConversation':
      return t('sidepanel.automation.triggerOnNewConversation');
    case 'onPageLoad':
      return t('sidepanel.automation.triggerOnPageLoad');
  }
}

function actionLabel(t: (key: string) => string, action: AutomationAction): string {
  switch (action) {
    case 'injectContext':
      return t('sidepanel.automation.actionInjectContext');
    case 'openSidePanel':
      return t('sidepanel.automation.actionOpenSidePanel');
    case 'runSkill':
      return t('sidepanel.automation.actionRunSkill');
  }
}

export default function AutomationPage() {
  const { t } = useI18n();
  const banner = useBanner();
  const { confirm, node: confirmNode } = useConfirm();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState<AutomationTrigger>('manual');
  const [action, setAction] = useState<AutomationAction>('injectContext');
  const [enabled, setEnabled] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const { items, loading, error, reload } = useRuntimeResources<{ type: 'GET_AUTOMATIONS' }, AutomationRule>({
    getRequest: { type: 'GET_AUTOMATIONS' },
    updatedEvent: 'AUTOMATIONS_UPDATED',
    mapResponse: (res) => (Array.isArray(res) ? (res as AutomationRule[]) : []),
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setTrigger('manual');
    setAction('injectContext');
    setEnabled(false);
    setShowForm(false);
  };

  const triggerOptions = [
    { key: 'manual' as AutomationTrigger, label: t('sidepanel.automation.triggerManual') },
    { key: 'onNewConversation' as AutomationTrigger, label: t('sidepanel.automation.triggerOnNewConversation') },
    { key: 'onPageLoad' as AutomationTrigger, label: t('sidepanel.automation.triggerOnPageLoad') },
  ];
  const actionOptions = [
    { key: 'injectContext' as AutomationAction, label: t('sidepanel.automation.actionInjectContext') },
    { key: 'openSidePanel' as AutomationAction, label: t('sidepanel.automation.actionOpenSidePanel') },
    { key: 'runSkill' as AutomationAction, label: t('sidepanel.automation.actionRunSkill') },
  ];

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    banner.clear();
    try {
      const input: AutomationRuleInput = {
        name: name.trim(),
        description: description.trim(),
        enabled,
        trigger,
        action,
        actionParam: '',
      };
      await sidepanelRuntimeClient.request({ type: 'CREATE_AUTOMATION', payload: input } as never);
      banner.show('success', t('sidepanel.automation.created'));
      resetForm();
      await reload();
    } catch {
      banner.show('error', t('sidepanel.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rule: AutomationRule) => {
    const ok = await confirm({
      title: t('sidepanel.automation.deleteConfirm', { name: rule.name }),
      message: t('sidepanel.automation.deleteConfirm', { name: rule.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    await sidepanelRuntimeClient.request({ type: 'DELETE_AUTOMATION', payload: { id: rule.id } } as never);
    await reload();
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.automation.pageTitle')}</h2>
        <button className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg" onClick={() => setShowForm((v) => !v)}>
          {t('sidepanel.automation.newRule')}
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
          <TextField
            label={t('sidepanel.automation.namePlaceholder')}
            value={name}
            placeholder={t('sidepanel.automation.namePlaceholder')}
            onChange={setName}
          />
          <TextField
            label={t('sidepanel.automation.descriptionPlaceholder')}
            value={description}
            placeholder={t('sidepanel.automation.descriptionPlaceholder')}
            onChange={setDescription}
          />
          <div className="space-y-1">
            <div className="text-[10px] font-medium" style={{ color: 'var(--ds-text-tertiary)' }}>
              {t('sidepanel.automation.triggerManual')}
            </div>
            <SegmentedControl
              ariaLabel={t('sidepanel.automation.triggerManual')}
              options={triggerOptions}
              value={trigger}
              onChange={setTrigger}
            />
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-medium" style={{ color: 'var(--ds-text-tertiary)' }}>
              {t('sidepanel.automation.actionInjectContext')}
            </div>
            <SegmentedControl
              ariaLabel={t('sidepanel.automation.actionInjectContext')}
              options={actionOptions}
              value={action}
              onChange={setAction}
            />
          </div>
          <ToggleRow
            title={t('sidepanel.automation.enabled')}
            description={t('sidepanel.automation.disabled')}
            enabled={enabled}
            onToggle={setEnabled}
          />
          <div className="flex justify-end gap-2">
            <button className="ds-btn-cancel px-3 py-1.5 text-xs rounded-lg" onClick={resetForm}>
              {t('common.cancel')}
            </button>
            <button
              className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-40"
              onClick={() => void save()}
              disabled={saving || !name.trim()}
            >
              {t('sidepanel.automation.save')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState title={t('sidepanel.automation.emptyTitle')} description={t('sidepanel.automation.emptyDescription')} />
        ) : (
          items.map((rule) => (
            <div key={rule.id} className="ds-surface-panel rounded-xl p-3 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--ds-text)' }}>
                    {rule.name}
                  </div>
                  {rule.description && (
                    <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--ds-text-secondary)' }}>
                      {rule.description}
                    </p>
                  )}
                  <div className="text-[10px] mt-1" style={{ color: 'var(--ds-text-tertiary)' }}>
                    {triggerLabel(t, rule.trigger)} · {actionLabel(t, rule.action)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded"
                    style={{
                      color: rule.enabled ? 'var(--ds-success)' : 'var(--ds-text-tertiary)',
                      background: rule.enabled ? 'var(--ds-success-bg)' : 'var(--ds-surface)',
                    }}
                  >
                    {rule.enabled ? t('sidepanel.automation.enabled') : t('sidepanel.automation.disabled')}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(rule)}
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
