// Doubao-pp 能力页（P4）
//
// §8 同构上游 CapabilitiesPage：纯 tab 容器，懒加载 SkillPage / McpPage / ToolsPage /
// BrowserControlPage / PresetPage / AutomationPage。其中 Skill/Mcp/Preset 页已可工作，
// Tools/BrowserControl/Automation 后端待实现（留作占位，不破坏容器正确性）。

import { lazy, Suspense, useState } from 'react';
import RouteFallback from '../components/RouteFallback';
import { SubTabs } from '../components/settings/primitives';
import { useI18n } from '../i18n';

const SkillPage = lazy(() => import('./SkillPage'));
const McpPage = lazy(() => import('./McpPage'));
const ToolsPage = lazy(() => import('./ToolsPage'));
const BrowserControlPage = lazy(() => import('./BrowserControlPage'));
const PresetPage = lazy(() => import('./PresetPage'));
const AutomationPage = lazy(() => import('./AutomationPage'));

type CapabilitiesSubTab = 'skill' | 'mcp' | 'tools' | 'browser' | 'preset' | 'automation';

const SUB_TABS: { key: CapabilitiesSubTab; labelKey: string }[] = [
  { key: 'skill', labelKey: 'sidepanel.capabilitiesPage.tabs.skill' },
  { key: 'mcp', labelKey: 'sidepanel.capabilitiesPage.tabs.mcp' },
  { key: 'tools', labelKey: 'sidepanel.capabilitiesPage.tabs.tools' },
  { key: 'browser', labelKey: 'sidepanel.capabilitiesPage.tabs.browser' },
  { key: 'preset', labelKey: 'sidepanel.capabilitiesPage.tabs.preset' },
  { key: 'automation', labelKey: 'sidepanel.capabilitiesPage.tabs.automation' },
];

export default function CapabilitiesPage() {
  const [sub, setSub] = useState<CapabilitiesSubTab>('skill');
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full">
      <SubTabs
        tabs={SUB_TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) }))}
        value={sub}
        onChange={setSub}
        ariaLabel={t('sidepanel.capabilitiesPage.navLabel')}
      />

      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<RouteFallback />}>
          {sub === 'skill' && <SkillPage />}
          {sub === 'mcp' && <McpPage />}
          {sub === 'tools' && <ToolsPage />}
          {sub === 'browser' && <BrowserControlPage />}
          {sub === 'preset' && <PresetPage />}
          {sub === 'automation' && <AutomationPage />}
        </Suspense>
      </div>
    </div>
  );
}
