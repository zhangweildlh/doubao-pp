// Doubao-pp 设置页（P4）
//
// §8 同构 + 最小豆包化：消费 P2 命令总线（GET_CONFIG / UPDATE_CONFIG / RESET_CONFIG）+ 通用
// 反馈原语（useBanner / ToggleRow / SegmentedControl）。Doubao 的 PluginSettings 字段较上游精简
// （autoInject / injectionLimit / syncStrategy / theme），仅渲染这四组，避免搬运上游 8 个子页的
// DeepSeek 专属配置（api/voice 等后端不存在）。SETTINGS_UPDATED 广播触发重新拉取。

import { useEffect, useState } from 'react';
import type { PluginSettings, SettingsPatch, SyncStrategy, ThemePref } from '../../../core/settings/store';
import {
  SegmentedControl,
  ToggleRow,
  useBanner,
} from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { sidepanelRuntimeClient } from '../runtime-client';

export default function SettingsPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<PluginSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const banner = useBanner();

  const load = async () => {
    try {
      const next = await sidepanelRuntimeClient.request({ type: 'GET_CONFIG' });
      setSettings(next as PluginSettings);
    } catch {
      // 静默：错误态由下方 banner 兜底（若后续操作失败）
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const listener = (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: unknown }).type === 'SETTINGS_UPDATED'
      ) {
        void load();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const patch = async (p: SettingsPatch) => {
    setSaving(true);
    banner.clear();
    try {
      const next = await sidepanelRuntimeClient.request({ type: 'UPDATE_CONFIG', payload: p });
      setSettings(next as PluginSettings);
      banner.show('success', t('sidepanel.settings.saved'));
    } catch {
      banner.show('error', t('sidepanel.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    banner.clear();
    try {
      const next = await sidepanelRuntimeClient.request({ type: 'RESET_CONFIG' });
      setSettings(next as PluginSettings);
      banner.show('success', t('sidepanel.settings.resetDone'));
    } catch {
      banner.show('error', t('sidepanel.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.settings.title')}</h2>
        <button
          className="ds-btn-secondary px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-40"
          onClick={() => void reset()}
          disabled={saving || !settings}
        >
          {t('sidepanel.settings.reset')}
        </button>
      </header>

      {banner.node}

      {loading || !settings ? (
        <div className="mt-3 text-xs" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('common.saving')}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="ds-surface-panel rounded-xl p-4 space-y-3">
            <ToggleRow
              title={t('sidepanel.settings.autoInject')}
              description={t('sidepanel.settings.autoInjectDescription')}
              enabled={settings.autoInject}
              onToggle={(next) => void patch({ autoInject: next })}
            />
            <label className="block space-y-1">
              <span className="text-[11px]" style={{ color: 'var(--ds-text-secondary)' }}>
                {t('sidepanel.settings.injectionLimit')}
              </span>
              <input
                type="number"
                min={0}
                step={500}
                value={settings.injectionLimit}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) void patch({ injectionLimit: n });
                }}
                className="w-full px-3 py-2 text-xs rounded-lg border outline-none"
                style={{
                  background: 'var(--ds-bg)',
                  borderColor: 'var(--ds-border)',
                  color: 'var(--ds-text)',
                  borderRadius: 'var(--radius-ctrl)',
                }}
              />
            </label>
            <div className="space-y-1">
              <span className="text-[11px]" style={{ color: 'var(--ds-text-secondary)' }}>
                {t('sidepanel.settings.syncStrategy')}
              </span>
              <SegmentedControl
                ariaLabel={t('sidepanel.settings.syncStrategy')}
                value={settings.syncStrategy}
                onChange={(key) => void patch({ syncStrategy: key as SyncStrategy })}
                options={[
                  { key: 'local', label: t('sidepanel.settings.syncLocal') },
                  { key: 'sync', label: t('sidepanel.settings.syncSync') },
                ]}
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px]" style={{ color: 'var(--ds-text-secondary)' }}>
                {t('sidepanel.settings.theme')}
              </span>
              <SegmentedControl
                ariaLabel={t('sidepanel.settings.theme')}
                value={settings.theme}
                onChange={(key) => void patch({ theme: key as ThemePref })}
                options={[
                  { key: 'light', label: t('sidepanel.settings.themeLight') },
                  { key: 'dark', label: t('sidepanel.settings.themeDark') },
                  { key: 'system', label: t('sidepanel.settings.themeSystem') },
                ]}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
