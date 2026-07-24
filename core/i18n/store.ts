// Doubao-pp i18n 偏好存储（P3 同构上游 core/i18n/store.ts）
//
// 与上游同构：locale 偏好的读写与监听，落 chrome.storage.local。存储键改为
// doubao_pp_locale_preference（与上游 deepseek_pp_locale_preference 区分）。

import {
  DEFAULT_LOCALE_PREFERENCE,
  getBrowserLanguageCandidates,
  normalizeLocalePreference,
  resolveLocalePreference,
  type LocalePreference,
  type ResolvedLocaleState,
} from './index';

export const LOCALE_PREFERENCE_STORAGE_KEY = 'doubao_pp_locale_preference';

export async function getLocalePreference(): Promise<LocalePreference> {
  const data = (await chrome.storage.local.get(LOCALE_PREFERENCE_STORAGE_KEY)) as Record<string, unknown>;
  return normalizeLocalePreference(data[LOCALE_PREFERENCE_STORAGE_KEY]);
}

export async function saveLocalePreference(preference: LocalePreference): Promise<LocalePreference> {
  const normalized = normalizeLocalePreference(preference);
  if (normalized === DEFAULT_LOCALE_PREFERENCE) {
    await chrome.storage.local.remove(LOCALE_PREFERENCE_STORAGE_KEY);
    return normalized;
  }
  await chrome.storage.local.set({ [LOCALE_PREFERENCE_STORAGE_KEY]: normalized });
  return normalized;
}

export async function getResolvedLocaleState(
  browserLanguages = getBrowserLanguageCandidates(),
): Promise<ResolvedLocaleState> {
  const preference = await getLocalePreference();
  return resolveLocalePreference(preference, browserLanguages);
}

export function watchLocalePreference(
  listener: (preference: LocalePreference) => void,
): () => void {
  const handleChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') return;
    if (!(LOCALE_PREFERENCE_STORAGE_KEY in changes)) return;
    listener(normalizeLocalePreference(changes[LOCALE_PREFERENCE_STORAGE_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
