// Doubao-pp i18n 类型（P3 同构上游 Deepseek-pp/core/i18n/types.ts）
//
// 设计要点（§8 可搬运）：保留与上游同名的导出，使上游 UI 组件可近原样搬运。
// 为兼容「Doubao 字典按需覆盖」的务实策略，LocaleMessageKey / LocaleArrayKey 采用
// 开放 string 类型——组件用到的 key 须在字典中存在（运行时校验，缺失回退 key 本身，
// 不抛错崩溃），无需在类型层穷举全部 key，降低上游组件搬运的摩擦成本。

export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_PREFERENCES = ['auto', ...SUPPORTED_LOCALES] as const;
export type LocalePreference = typeof LOCALE_PREFERENCES[number];

export const DEFAULT_LOCALE: SupportedLocale = 'zh-CN';
export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = 'auto';

export type MessageParamValue = string | number | boolean;
export type MessageParams = Record<string, MessageParamValue>;

/** 开放叶子 key 类型：Doubao 字典按需定义，组件搬运零摩擦（§8 友好）。 */
export type LocaleMessageKey = string;
export type LocaleArrayKey = string;

export type LocaleResourceTree = {
  readonly [key: string]: string | readonly string[] | LocaleResourceTree;
};

export interface ResolvedLocale {
  locale: SupportedLocale;
  fallback: boolean;
}

export interface ResolvedLocaleState extends ResolvedLocale {
  preference: LocalePreference;
  browserLanguages: readonly string[];
}

export interface ResolvedMessage {
  value: string;
  locale: SupportedLocale;
  fallback: boolean;
}

export interface ResolvedMessageArray {
  value: readonly string[];
  locale: SupportedLocale;
  fallback: boolean;
}
