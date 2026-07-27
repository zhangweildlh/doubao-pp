// Doubao-pp MCP 工具页（P4）
//
// §8 同构 + 最小豆包化：消费 P2 命令总线（GET_MCP_SERVERS / CREATE_MCP_SERVER / DELETE_MCP_SERVER）
// + 通用资源 hook（MCP_SERVERS_UPDATED 广播刷新）。Doubao 的 MCP 为"上下文提示"模型（仅把启用
// 工具清单注入请求体，不实际发起调用），故页面聚焦「注册 / 启用停用 / 删除」最小闭环；上游的
// 传输/发现/租约等复杂引擎后端未移植，属最小豆包化裁剪（§8 容许）。

import { useState } from 'react';
import type { McpToolEntry } from '../../../core/mcp/store';
import {
  EmptyState,
  SkeletonList,
  ToggleRow,
  useBanner,
  useConfirm,
} from '../components/settings/primitives';
import { useI18n } from '../i18n';
import { useRuntimeResources } from '../hooks/useRuntimeResources';
import { sidepanelRuntimeClient } from '../runtime-client';

export default function McpPage() {
  const { t } = useI18n();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const banner = useBanner();
  const { confirm, node: confirmNode } = useConfirm();

  const { items, loading, error, reload } = useRuntimeResources<{ type: 'GET_MCP_SERVERS' }, McpToolEntry>({
    getRequest: { type: 'GET_MCP_SERVERS' },
    updatedEvent: 'MCP_SERVERS_UPDATED',
    mapResponse: (res) => (Array.isArray(res) ? (res as McpToolEntry[]) : []),
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setShowForm(false);
  };

  const createEntry = async () => {
    if (!name.trim() || !description.trim()) return;
    setSaving(true);
    banner.clear();
    try {
      const entry: McpToolEntry = {
        id: `mcp-${Date.now().toString(36)}`,
        name: name.trim(),
        description: description.trim(),
        inputSchema: { type: 'object', properties: {}, required: [] },
        enabled: true,
        source: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await sidepanelRuntimeClient.request({ type: 'CREATE_MCP_SERVER', payload: entry } as never);
      resetForm();
      banner.show('success', t('sidepanel.mcp.created'));
      await reload();
    } catch {
      banner.show('error', t('sidepanel.mcp.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (tool: McpToolEntry) => {
    // CREATE_MCP_SERVER 按 id upsert；翻转 enabled 即切换启用状态（handler 已广播 MCP_SERVERS_UPDATED）
    await sidepanelRuntimeClient.request({
      type: 'CREATE_MCP_SERVER',
      payload: { ...tool, enabled: !tool.enabled },
    } as never);
    await reload();
  };

  const remove = async (tool: McpToolEntry) => {
    const ok = await confirm({
      title: t('sidepanel.mcp.deleteConfirm', { name: tool.name }),
      message: t('sidepanel.mcp.deleteConfirm', { name: tool.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    await sidepanelRuntimeClient.request({ type: 'DELETE_MCP_SERVER', payload: { id: tool.id } } as never);
    await reload();
  };

  const inputStyle = {
    background: 'var(--ds-bg)',
    borderColor: 'var(--ds-border)',
    color: 'var(--ds-text)',
    borderRadius: 'var(--radius-ctrl)',
  };

  return (
    <section className="ds-page">
      <header className="ds-page-header">
        <h2 className="ds-page-title">{t('sidepanel.mcp.title')}</h2>
        <button
          className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg"
          onClick={() => setShowForm((prev) => !prev)}
        >
          {t('sidepanel.mcp.addTool')}
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
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('sidepanel.mcp.namePlaceholder')}
            className="w-full px-3 py-2 text-xs border outline-none"
            style={inputStyle}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('sidepanel.mcp.descriptionPlaceholder')}
            rows={3}
            className="w-full px-3 py-2 text-xs border outline-none resize-none"
            style={inputStyle}
          />
          <div className="flex justify-end gap-2">
            <button className="ds-btn-cancel px-3 py-1.5 text-xs rounded-lg" onClick={resetForm}>
              {t('sidepanel.mcp.cancel')}
            </button>
            <button
              className="ds-btn-primary px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-40"
              onClick={() => void createEntry()}
              disabled={saving || !name.trim() || !description.trim()}
            >
              {t('sidepanel.mcp.create')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <SkeletonList rows={3} />
        ) : items.length === 0 ? (
          <EmptyState title={t('sidepanel.mcp.empty')} description={t('sidepanel.mcp.emptyHint')} />
        ) : (
          items.map((tool) => (
            <div key={tool.id} className="ds-surface-panel rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--ds-text)' }}>
                    {tool.name}
                  </div>
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ds-text-secondary)' }}>
                    {tool.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(tool)}
                  className="ds-action-btn ds-action-btn-delete px-2 py-1 text-[11px] rounded-md shrink-0"
                >
                  {t('common.delete')}
                </button>
              </div>
              <ToggleRow
                title={tool.enabled ? t('sidepanel.mcp.enabled') : t('sidepanel.mcp.disabled')}
                enabled={tool.enabled}
                onToggle={() => void toggle(tool)}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
