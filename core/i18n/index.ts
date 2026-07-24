// Doubao-pp i18n 解析（P3 同构上游 core/i18n/index.ts）
//
// 与上游同构：createTranslator / resolveMessage / formatMessage / resolveLocalePreference 等。
// 关键适配（§8 务实）：LocaleMessageKey 为开放 string，resolveMessage 在 key 缺失时
// 回退到 DEFAULT_LOCALE 字典，再缺失则返回 key 本身（不抛错），避免开发期因字典缺 key 崩溃。

import { zhCN, type LocaleMessages } from './resources/zh-CN';
import { en } from './resources/en';
import {
  DEFAULT_LOCALE,
  DEFAULT_LOCALE_PREFERENCE,
  LOCALE_PREFERENCES,
  SUPPORTED_LOCALES,
  type LocaleMessageKey,
  type LocaleArrayKey,
  type LocalePreference,
  type MessageParams,
  type ResolvedLocale,
  type ResolvedLocaleState,
  type ResolvedMessage,
  type ResolvedMessageArray,
  type SupportedLocale,
} from './types';

export {
  DEFAULT_LOCALE,
  DEFAULT_LOCALE_PREFERENCE,
  LOCALE_PREFERENCES,
  SUPPORTED_LOCALES,
  type LocalePreference,
  type LocaleResourceTree,
  type MessageParams,
  type MessageParamValue,
  type ResolvedLocale,
  type ResolvedLocaleState,
  type ResolvedMessage,
  type ResolvedMessageArray,
  type SupportedLocale,
} from './types';

export type { LocaleMessageKey, LocaleArrayKey };

export const localeResources: Record<SupportedLocale, LocaleMessages> = {
  'zh-CN': zhCN,
  en,
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function isLocalePreference(value: unknown): value is LocalePreference {
  return typeof value === 'string' && (LOCALE_PREFERENCES as readonly string[]).includes(value);
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return isLocalePreference(value) ? value : DEFAULT_LOCALE_PREFERENCE;
}

export function resolveSupportedLocale(value: unknown): ResolvedLocale {
  if (isSupportedLocale(value)) return { locale: value, fallback: false };
  return { locale: DEFAULT_LOCALE, fallback: true };
}

export function normalizeSupportedLocale(value: unknown): SupportedLocale {
  return resolveSupportedLocale(value).locale;
}

export function resolveLocalePreference(
  preferenceInput: unknown,
  browserLanguages: readonly string[] = getBrowserLanguageCandidates(),
): ResolvedLocaleState {
  const preference = normalizeLocalePreference(preferenceInput);
  if (preference !== 'auto') {
    return {
      preference,
      locale: preference,
      fallback: false,
      browserLanguages: [...browserLanguages],
    };
  }

  for (const language of browserLanguages) {
    const locale = localeFromLanguageTag(language);
    if (locale) {
      return {
        preference,
        locale,
        fallback: false,
        browserLanguages: [...browserLanguages],
      };
    }
  }

  return {
    preference,
    locale: DEFAULT_LOCALE,
    fallback: true,
    browserLanguages: [...browserLanguages],
  };
}

export function getBrowserLanguageCandidates(): string[] {
  const candidates: string[] = [];
  const chromeLanguage = getChromeUiLanguage();
  if (chromeLanguage) candidates.push(chromeLanguage);

  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages.filter((language): language is string => typeof language === 'string'));
    }
    if (typeof navigator.language === 'string') {
      candidates.push(navigator.language);
    }
  }

  return dedupe(candidates.map((language) => language.trim()).filter(Boolean));
}

function getChromeUiLanguage(): string | null {
  try {
    const i18n = typeof chrome !== 'undefined' ? chrome.i18n : undefined;
    const language = i18n?.getUILanguage?.();
    return typeof language === 'string' && language.trim() ? language : null;
  } catch {
    return null;
  }
}

function localeFromLanguageTag(language: string): SupportedLocale | null {
  const normalized = language.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return null;
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (
    normalized === 'zh' ||
    normalized.startsWith('zh-') ||
    normalized === 'cn' ||
    normalized.startsWith('cn-')
  ) {
    return 'zh-CN';
  }
  return null;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function translate(
  localeInput: unknown,
  key: LocaleMessageKey,
  params?: MessageParams,
): string {
  return resolveMessage(localeInput, key, params).value;
}

export function translateArray(localeInput: unknown, key: LocaleArrayKey): readonly string[] {
  return resolveMessageArray(localeInput, key).value;
}

export function createTranslator(localeInput: unknown): {
  locale: SupportedLocale;
  fallback: boolean;
  t: (key: LocaleMessageKey, params?: MessageParams) => string;
  ta: (key: LocaleArrayKey) => readonly string[];
} {
  const resolved = resolveSupportedLocale(localeInput);
  return {
    ...resolved,
    t: (key, params) => resolveMessage(resolved.locale, key, params).value,
    ta: (key) => resolveMessageArray(resolved.locale, key).value,
  };
}

export function resolveMessage(
  localeInput: unknown,
  key: LocaleMessageKey,
  params?: MessageParams,
): ResolvedMessage {
  const locale = resolveSupportedLocale(localeInput);
  const value = readResourcePath(localeResources[locale.locale], key);
  if (typeof value !== 'string') {
    // 开放 key：缺失时回退默认语言，仍缺失则返回 key 本身，避免组件崩溃（§8 友好）
    const fb = readResourcePath(localeResources[DEFAULT_LOCALE], key);
    if (typeof fb !== 'string') return { value: key, locale: locale.locale, fallback: true };
    return { value: formatMessage(fb, params), locale: locale.locale, fallback: true };
  }
  return {
    value: formatMessage(value, params),
    locale: locale.locale,
    fallback: locale.fallback,
  };
}

export function resolveMessageArray(localeInput: unknown, key: LocaleArrayKey): ResolvedMessageArray {
  const locale = resolveSupportedLocale(localeInput);
  const value = readResourcePath(localeResources[locale.locale], key);
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return { value: [key], locale: locale.locale, fallback: true };
  }
  return {
    value,
    locale: locale.locale,
    fallback: locale.fallback,
  };
}

export function formatMessage(template: string, params: MessageParams = {}): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) return match;
    return String(params[name]);
  });
}

export function getLocaleStringKeys(locale: SupportedLocale = DEFAULT_LOCALE): string[] {
  return collectLocaleKeys(localeResources[locale], 'string');
}

export function getLocaleArrayKeys(locale: SupportedLocale = DEFAULT_LOCALE): string[] {
  return collectLocaleKeys(localeResources[locale], 'array');
}

function readResourcePath(resource: LocaleMessages, key: string): unknown {
  let current: unknown = resource;
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function collectLocaleKeys(resource: unknown, kind: 'string' | 'array', prefix = ''): string[] {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) return [];

  const keys: string[] = [];
  const entries = Object.entries(resource as Record<string, unknown>);
  for (const [name, value] of entries) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (typeof value === 'string') {
      if (kind === 'string') keys.push(path);
      continue;
    }
    if (Array.isArray(value)) {
      if (kind === 'array') keys.push(path);
      continue;
    }
    keys.push(...collectLocaleKeys(value, kind, path));
  }
  return keys;
}
