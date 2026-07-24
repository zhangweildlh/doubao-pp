// Doubao-pp sidePanel 应用骨架（P0）
//
// 自研 tab 路由（不引入 react-router）：useState 维护当前 tab，配合 React.lazy
// 动态导入各页面 + <Suspense> 兜底。P0 各页面均为占位组件，但路由 / tab 栏 /
// 懒加载接线真实可用，后续阶段在对应页面内填充实现即可。

import { lazy, Suspense, useState } from 'react';
import RouteFallback from './components/RouteFallback';

export type Tab =
  | 'chat'
  | 'library'
  | 'projects'
  | 'capabilities'
  | 'settings'
  | 'memory'
  | 'saved'
  | 'skill'
  | 'mcp'
  | 'tools'
  | 'automation'
  | 'browserControl';

const ChatPage = lazy(() => import('./pages/ChatPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const CapabilitiesPage = lazy(() => import('./pages/CapabilitiesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const SavedPage = lazy(() => import('./pages/SavedPage'));
const SkillPage = lazy(() => import('./pages/SkillPage'));
const McpPage = lazy(() => import('./pages/McpPage'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));
const AutomationPage = lazy(() => import('./pages/AutomationPage'));
const BrowserControlPage = lazy(() => import('./pages/BrowserControlPage'));

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'chat', label: '对话', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
  { key: 'library', label: '记忆库', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253' },
  { key: 'projects', label: '项目', icon: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z' },
  { key: 'capabilities', label: '能力', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { key: 'memory', label: '记忆', icon: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7z M8 11h8 M8 15h5' },
  { key: 'saved', label: '收藏', icon: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v14l-7-4-7 4V5z' },
  { key: 'skill', label: '技能', icon: 'M12 2l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1.5L12 2z' },
  { key: 'mcp', label: 'MCP', icon: 'M4 6h4v4H4V6z M10 14h4v4h-4v-4z M16 6h4v4h-4V6z M8 8h4 M14 16h4' },
  { key: 'tools', label: '工具', icon: 'M14.7 6.3a4 4 0 00-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 005.4-5.4l-2.6 2.6-2-2 2.6-2.6z' },
  { key: 'automation', label: '自动化', icon: 'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M5 5l3 3 M16 16l3 3 M19 5l-3 3 M8 16l-3 3' },
  { key: 'browserControl', label: '浏览器', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20z M2 12h20 M12 2c3 3 3 17 0 20 M12 2c-3 3-3 17 0 20' },
  { key: 'settings', label: '设置', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <div className="ds-app-shell">
      <nav className="side-tabs" aria-label="主导航">
        {TABS.map((tabConfig) => (
          <button
            key={tabConfig.key}
            type="button"
            onClick={() => setTab(tabConfig.key)}
            className={`side-tab${tab === tabConfig.key ? ' side-tab-active' : ''}`}
            aria-current={tab === tabConfig.key ? 'page' : undefined}
            title={tabConfig.label}
          >
            <svg
              className="side-tab-icon"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={tabConfig.icon} />
            </svg>
            <span className="side-tab-label">{tabConfig.label}</span>
            {tab === tabConfig.key && <span className="side-tab-indicator" />}
          </button>
        ))}
      </nav>

      <main className="ds-app-main">
        <Suspense fallback={<RouteFallback />}>
          {tab === 'chat' && <ChatPage />}
          {tab === 'library' && <LibraryPage />}
          {tab === 'projects' && <ProjectsPage />}
          {tab === 'capabilities' && <CapabilitiesPage />}
          {tab === 'settings' && <SettingsPage />}
          {tab === 'memory' && <MemoryPage />}
          {tab === 'saved' && <SavedPage />}
          {tab === 'skill' && <SkillPage />}
          {tab === 'mcp' && <McpPage />}
          {tab === 'tools' && <ToolsPage />}
          {tab === 'automation' && <AutomationPage />}
          {tab === 'browserControl' && <BrowserControlPage />}
        </Suspense>
      </main>
    </div>
  );
}
