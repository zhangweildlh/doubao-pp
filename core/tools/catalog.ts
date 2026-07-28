// Doubao-pp 内置工具目录（P6，静态）
//
// 与上游「工具」概念对齐的最小豆包化呈现：侧边栏 ToolsPage 以只读目录形式列出本扩展
// 实际具备的内置能力（来自 v1.11.6.x 已落地的记忆注入 / 技能 / MCP / shell-host /
// pyodide 等），避免把 ToolsPage 做成空壳（§8「13 页面」parity 要求页面真实可读）。
//
// 静态目录，无后端依赖；若后续某能力被裁剪，从本目录移除对应条目即可。

export interface BuiltinTool {
  /** 稳定标识 */
  id: string;
  /** 工具名 */
  name: string;
  /** 一句话说明 */
  description: string;
  /** 分类（用于分组展示） */
  category: 'context' | 'automation' | 'integration' | 'sandbox';
  /** 是否默认启用（展示用徽标） */
  enabledByDefault: boolean;
}

export const BUILTIN_TOOLS: readonly BuiltinTool[] = [
  {
    id: 'context-injection',
    name: '上下文注入',
    description: '将记忆、预设与项目上下文自动注入到豆包对话请求体（路线 A 原地增强）。',
    category: 'context',
    enabledByDefault: true,
  },
  {
    id: 'conversation-capture',
    name: '对话记忆抓取',
    description: '自动抓取豆包对话定稿文本，持久化为对话记忆，供浮窗与历史查看。',
    category: 'context',
    enabledByDefault: true,
  },
  {
    id: 'skill-dispatch',
    name: '技能调度',
    description: '以 /name 触发可注入模型的用户技能，支持启用停用与编辑。',
    category: 'automation',
    enabledByDefault: true,
  },
  {
    id: 'mcp-bridge',
    name: 'MCP 工具桥接',
    description: '注册 MCP 工具条目并将其作为上下文提示注入请求体（上下文提示模型，非实际调用）。',
    category: 'integration',
    enabledByDefault: true,
  },
  {
    id: 'shell-host',
    name: '本地 Shell 能力',
    description: '经 DeepSeek++ shell-host 复用本地命令执行能力（需本机已安装 DeepSeek++）。',
    category: 'integration',
    enabledByDefault: false,
  },
  {
    id: 'pyodide-sandbox',
    name: 'Python 沙箱',
    description: '经 pyodide WASM 运行时在扩展内安全运行 Python 脚本（§8 parity 保留能力）。',
    category: 'sandbox',
    enabledByDefault: true,
  },
];

export const TOOL_CATEGORIES: Record<BuiltinTool['category'], string> = {
  context: '上下文',
  automation: '自动化',
  integration: '集成',
  sandbox: '沙箱',
};
