// MCP 工具注册表单测（node 环境，沙盒内存后端）
import { describe, it, expect } from 'vitest';
import {
  McpStore,
  createMcpMemoryBackend,
  composeMcpContext,
  DisabledMcpTransport,
  MCP_STORAGE_KEY,
  type McpToolEntry,
} from '../core/mcp/store.ts';

function makeTool(id: string, enabled = true): McpToolEntry {
  return {
    id,
    name: `工具${id}`,
    description: `说明-${id}`,
    inputSchema: { type: 'object', properties: { q: { type: 'string', description: '查询' } }, required: ['q'] },
    enabled,
    source: 'user',
    createdAt: 100,
    updatedAt: 100,
  };
}

describe('McpStore', () => {
  it('getAll 脏数据防御：非数组回退空', async () => {
    const store = new McpStore(createMcpMemoryBackend({ [MCP_STORAGE_KEY]: 123 }));
    expect(await store.getAll()).toEqual([]);
  });

  it('upsert 新增并去重', async () => {
    const store = new McpStore(createMcpMemoryBackend());
    await store.upsert(makeTool('t1'));
    const list = await store.upsert(makeTool('t1', false));
    expect(list.length).toBe(1);
    expect(list[0].enabled).toBe(false);
    expect(list[0].createdAt).toBe(100);
  });

  it('remove 删除用户工具', async () => {
    const store = new McpStore(createMcpMemoryBackend());
    await store.upsert(makeTool('t1'));
    const after = await store.remove('t1');
    expect(after.find((e) => e.id === 't1')).toBeUndefined();
  });

  it('clear 清空', async () => {
    const store = new McpStore(createMcpMemoryBackend());
    await store.upsert(makeTool('t1'));
    await store.clear();
    expect(await store.getAll()).toEqual([]);
  });
});

describe('composeMcpContext', () => {
  it('列出启用工具的名称/说明/参数，过滤禁用', () => {
    const tools: McpToolEntry[] = [makeTool('t1'), makeTool('t2', false)];
    const ctx = composeMcpContext(tools);
    expect(ctx).toContain('可用工具');
    expect(ctx).toContain('工具t1');
    expect(ctx).toContain('说明-t1');
    expect(ctx).toContain('查询'); // 参数说明
    expect(ctx).not.toContain('工具t2'); // 禁用不注入
  });

  it('无启用工具返回空串', () => {
    expect(composeMcpContext([makeTool('t1', false)])).toBe('');
  });

  it('超长封顶', () => {
    const big = makeTool('t1');
    big.description = '说明'.repeat(2000);
    const ctx = composeMcpContext([big]);
    expect(ctx.length).toBeLessThanOrEqual(2000);
  });
});

describe('DisabledMcpTransport', () => {
  it('默认禁用，call 抛错（路线 B 不被启用）', async () => {
    const t = new DisabledMcpTransport();
    expect(t.enabled).toBe(false);
    await expect(t.call('t1', {})).rejects.toThrow(/路线 B/);
  });
});
