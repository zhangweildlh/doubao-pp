// Doubao-pp sidePanel 运行时事件编解码（P0）
//
// 同构于 Deepseek-pp 的 runtime-event-codec.ts：保留 isSidepanelRuntimeEvent /
// decodeThemeUpdatedEvent 原语。适配点：DeepseekTheme 类型替换为本地 DoubaoTheme，
// 不再依赖 Deepseek 的 core/types（豆包主题后续阶段接入）。

export type DoubaoTheme = 'light' | 'dark';

export function isSidepanelRuntimeEvent<TType extends string>(
  value: unknown,
  types: readonly TType[],
): value is { type: TType } {
  const record = plainRecord(value);
  return record !== null
    && typeof record.type === 'string'
    && types.includes(record.type as TType);
}

export function decodeThemeUpdatedEvent(value: unknown): DoubaoTheme | null {
  const record = plainRecord(value);
  if (record?.type !== 'THEME_UPDATED') return null;
  return record.theme === 'light' || record.theme === 'dark'
    ? record.theme
    : null;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return value as Record<string, unknown>;
}
