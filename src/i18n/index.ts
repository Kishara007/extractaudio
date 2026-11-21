import { useEffect, useState } from 'react';
import en from './en.json';
import es from './es.json';
import pt from './pt.json';
import de from './de.json';
import fr from './fr.json';
import ja from './ja.json';
import zh from './zh.json';
import ru from './ru.json';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocaleCode, type LocaleCode } from './locales';

export type Dictionary = typeof en;

export const DICTIONARIES: Record<LocaleCode, Dictionary> = {
  en,
  es,
  pt,
  de,
  fr,
  ja,
  zh,
  ru,
};

const STORAGE_KEY = 'videomp3_locale';
const LOCALE_EVENT = 'videomp3:locale-change';

export function getDictionary(locale: LocaleCode = DEFAULT_LOCALE): Dictionary {
  return DICTIONARIES[locale] ?? en;
}

export function getStoredLocale(): LocaleCode {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    if (isLocaleCode(urlLang)) return urlLang;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocaleCode(saved)) return saved;
  } catch {
    // Ignore storage access errors in restricted privacy contexts.
  }
  return DEFAULT_LOCALE;
}

function resolveNestedKey(obj: unknown, path: string): string | null {
  let current: unknown = obj;
  for (const segment of path.split('.')) {
    if (current && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return null;
    }
  }
  return typeof current === 'string' ? current : null;
}

/**
 * Updates static Astro DOM elements marked with `data-i18n` and `data-i18n-aria-label`,
 * plus page `<html lang>`, `<title>`, and `<meta name="description">`.
 */
export function applyStaticTranslations(locale: LocaleCode): void {
  if (typeof document === 'undefined') return;
  const dict = getDictionary(locale);
  const localeMeta = SUPPORTED_LOCALES.find((item) => item.code === locale);
  if (localeMeta) {
    document.documentElement.lang = localeMeta.htmlLang;
  }

  const pageId = document.documentElement.dataset.page;
  if (pageId === 'home' || pageId === 'howToUse' || pageId === 'hireMe') {
    const seoEntry = dict.seo[pageId];
    document.title = seoEntry.title;
    const descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) descMeta.setAttribute('content', seoEntry.description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', seoEntry.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', seoEntry.description);
  }

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    const value = resolveNestedKey(dict, key);
    if (value !== null) {
      el.textContent = value;
    }
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria;
    if (!key) return;
    const value = resolveNestedKey(dict, key);
    if (value !== null) {
      el.setAttribute('aria-label', value);
    }
  });
}

export function setActiveLocale(locale: LocaleCode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore storage quota or private mode errors.
  }
  applyStaticTranslations(locale);
  window.dispatchEvent(new CustomEvent<LocaleCode>(LOCALE_EVENT, { detail: locale }));
}

/**
 * React hook returning the active locale & typed dictionary.
 * Initializes to `'en'` during SSR/initial hydration to guarantee zero hydration mismatch,
 * then syncs immediately on mount and listens to cross-island locale changes.
 */
export function useI18n(): { locale: LocaleCode; t: Dictionary; setLocale: (next: LocaleCode) => void } {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);

  useEffect(() => {
    const initial = getStoredLocale();
    if (initial !== DEFAULT_LOCALE) {
      setLocaleState(initial);
      applyStaticTranslations(initial);
    }

    const handleLocaleEvent = (event: Event) => {
      const custom = event as CustomEvent<LocaleCode>;
      if (isLocaleCode(custom.detail)) {
        setLocaleState(custom.detail);
      }
    };

    window.addEventListener(LOCALE_EVENT, handleLocaleEvent);
    return () => window.removeEventListener(LOCALE_EVENT, handleLocaleEvent);
  }, []);

  return {
    locale,
    t: getDictionary(locale),
    setLocale: setActiveLocale,
  };
}
