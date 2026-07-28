// Doubao-pp 工具页（P6）
//
// §8 同构 + 最小豆包化：以只读目录形式列出本扩展实际具备的内置能力（来自
// core/tools/catalog.ts 的 BUILTIN_TOOLS 静态目录）。该目录与上游「工具」概念对齐，
// 避免 ToolsPage 做成空壳（§8「13 页面」parity 要求页面真实可读）。
// 本页无后端依赖，直接消费静态导出，按 TOOL_CATEGORIES 分组展示。

import { useI18n } from '../i18n';
import {
  BUILTIN_TOOLS,
  TOOL_CATEGORIES,
  type BuiltinTool,
} from '../../../core/tools/catalog';

export default function ToolsPage() {
  const { t } = useI18n();

  // 按分类分组（保持 TOOL_CATEGORIES 声明顺序），仅保留非空分组
  const grouped = (Object.keys(TOOL_CATEGORIES) as BuiltinTool['category'][])
    .map((category) => ({
      category,
      label: TOOL_CATEGORIES[category],
      tools: BUILTIN_TOOLS.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.tools.length > 0);

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.tools.pageTitle')}</h2>
      </header>

      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--ds-text-secondary)' }}>
        {t('sidepanel.tools.description')}
      </p>

      <div className="mt-3 space-y-4">
        {grouped.map((group) => (
          <div key={group.category} className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--ds-text-tertiary)' }}>
              {group.label}
            </div>
            <div className="space-y-2">
              {group.tools.map((tool) => (
                <div key={tool.id} className="ds-surface-panel rounded-xl p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium" style={{ color: 'var(--ds-text)' }}>
                      {tool.name}
                    </div>
                    <span
                      className="shrink-0 text-[10px] px-2 py-0.5 rounded"
                      style={{
                        color: tool.enabledByDefault ? 'var(--ds-success)' : 'var(--ds-text-tertiary)',
                        background: tool.enabledByDefault ? 'var(--ds-success-bg)' : 'var(--ds-surface)',
                      }}
                    >
                      {tool.enabledByDefault ? t('sidepanel.tools.enabled') : t('sidepanel.tools.disabled')}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ds-text-secondary)' }}>
                    {tool.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
