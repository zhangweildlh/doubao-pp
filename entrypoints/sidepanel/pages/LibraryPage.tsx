// Doubao-pp 记忆库页（P4）
//
// §8 同构上游 LibraryPage：纯 tab 容器，懒加载 MemoryPage（已完）与 SavedPage（后端待实现）。
// 不引入额外 controller；路由/懒加载接线与上游逐字一致，仅 import 路径与 i18n key 指 Doubao。

import { lazy, Suspense, useState } from 'react';
import RouteFallback from '../components/RouteFallback';
import { SubTabs } from '../components/settings/primitives';
import { useI18n } from '../i18n';

const MemoryPage = lazy(() => import('./MemoryPage'));
const SavedPage = lazy(() => import('./SavedPage'));

type LibrarySubTab = 'memory' | 'saved';

const SUB_TABS: { key: LibrarySubTab; labelKey: string }[] = [
  { key: 'memory', labelKey: 'sidepanel.libraryPage.tabs.memory' },
  { key: 'saved', labelKey: 'sidepanel.libraryPage.tabs.saved' },
];

export default function LibraryPage() {
  const [sub, setSub] = useState<LibrarySubTab>('memory');
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full">
      <SubTabs
        tabs={SUB_TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) }))}
        value={sub}
        onChange={setSub}
        ariaLabel={t('sidepanel.libraryPage.navLabel')}
      />

      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={<RouteFallback />}>
          {sub === 'memory' && <MemoryPage />}
          {sub === 'saved' && <SavedPage />}
        </Suspense>
      </div>
    </div>
  );
}
