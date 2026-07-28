// Doubao-pp 浏览器控制页（P6）
//
// §8 同构 + 最小豆包化：经命令总线 GET_BROWSER_CONTROL / SET_BROWSER_CONTROL 读取并切换
// 浏览器自动化控制开关。该能力默认关闭（fail-safe），页面提供开关与说明。调度引擎属后续阶段
// （§8 容许的豆包化裁剪），当前为预览开关。

import { useCallback, useEffect, useState } from 'react';
import { ToggleRow, useBanner } from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { sidepanelRuntimeClient, SidepanelRuntimeError } from '../runtime-client';

export default function BrowserControlPage() {
  const { t } = useI18n();
  const banner = useBanner();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sidepanelRuntimeClient.request({ type: 'GET_BROWSER_CONTROL' });
      const value = (res as { enabled: boolean }).enabled;
      setEnabled(value === true);
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const listener = (message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        (message as { type?: unknown }).type === 'BROWSER_CONTROL_UPDATED'
      ) {
        void load();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [load]);

  const toggle = async (next: boolean) => {
    setSaving(true);
    banner.clear();
    try {
      await sidepanelRuntimeClient.request({ type: 'SET_BROWSER_CONTROL', payload: { enabled: next } } as never);
      setEnabled(next);
      await load();
    } catch (err) {
      const msg = err instanceof SidepanelRuntimeError ? err.message : '操作失败，请重试';
      banner.show('error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.browserControl.pageTitle')}</h2>
      </header>

      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--ds-text-secondary)' }}>
        {t('sidepanel.browserControl.description')}
      </p>

      {banner.node}

      <div className="ds-surface-panel rounded-xl p-4 space-y-3 mt-3">
        <ToggleRow
          title={t('sidepanel.browserControl.enableLabel')}
          description={t('sidepanel.browserControl.enableDescription')}
          enabled={enabled}
          disabled={loading || saving}
          onToggle={(next) => void toggle(next)}
        />
        <div className="text-[11px]" style={{ color: 'var(--ds-text-tertiary)' }}>
          {enabled ? t('sidepanel.browserControl.enabledBadge') : t('sidepanel.browserControl.disabledBadge')}
        </div>
        <div className="text-[10px] leading-relaxed" style={{ color: 'var(--ds-text-tertiary)' }}>
          {t('sidepanel.browserControl.previewNote')}
        </div>
      </div>
    </section>
  );
}
