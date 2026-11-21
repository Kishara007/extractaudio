export type LocaleCode = 'en' | 'es' | 'pt' | 'de' | 'fr' | 'ja' | 'zh' | 'ru';

export interface LocaleInfo {
  code: LocaleCode;
  label: string;
  htmlLang: string;
}

export const SUPPORTED_LOCALES: readonly LocaleInfo[] = [
  { code: 'en', label: 'English', htmlLang: 'en' },
  { code: 'es', label: 'Español', htmlLang: 'es' },
  { code: 'pt', label: 'Português', htmlLang: 'pt' },
  { code: 'de', label: 'Deutsch', htmlLang: 'de' },
  { code: 'fr', label: 'Français', htmlLang: 'fr' },
  { code: 'ja', label: '日本語', htmlLang: 'ja' },
  { code: 'zh', label: '简体中文', htmlLang: 'zh-Hans' },
  { code: 'ru', label: 'Русский', htmlLang: 'ru' },
] as const;

export const DEFAULT_LOCALE: LocaleCode = 'en';

export function isLocaleCode(value: string | null | undefined): value is LocaleCode {
  return SUPPORTED_LOCALES.some((item) => item.code === value);
}
