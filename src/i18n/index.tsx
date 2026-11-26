import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './locales/en.json';
import ja from './locales/ja.json';

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
export type PluralMessage = Partial<Record<PluralCategory, string>> & { other: string };
export type MessageValue = string | PluralMessage;
export type TextDirection = 'ltr' | 'rtl';

type DictionaryShape<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? T[K] extends PluralMessage
      ? MessageValue
      : DictionaryShape<T[K]>
    : MessageValue;
};

export type LocaleDictionary = DictionaryShape<typeof ja>;

const LOCALES = {
  en,
  ja,
} as const satisfies Record<string, LocaleDictionary>;

export type SupportedLocale = keyof typeof LOCALES;

export interface LocaleMeta {
  code: SupportedLocale;
  htmlLang: string;
  ogLocale: string;
  dir: TextDirection;
  nativeLabel: string;
  shortLabel: string;
  canvasFontFamily: string;
}

/**
 * Single source of truth for supported locales.
 * Adding a future language (including RTL scripts like 'ar'/'he' or regional scripts like 'zh-Hans')
 * only requires adding its dictionary to LOCALES and registering its metadata here.
 */
export const SUPPORTED_LOCALES: readonly LocaleMeta[] = [
  {
    code: 'en',
    htmlLang: 'en',
    ogLocale: 'en_US',
    dir: 'ltr',
    nativeLabel: 'English',
    shortLabel: 'EN',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif',
  },
  {
    code: 'ja',
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    dir: 'ltr',
    nativeLabel: '日本語',
    shortLabel: 'JA',
    canvasFontFamily: '"Noto Sans JP", "Plus Jakarta Sans", sans-serif',
  },
] as const;

export const DEFAULT_LOCALE: SupportedLocale = 'en';
const LOCALE_STORAGE_KEY = 'vcm_locale';
const LOCALE_QUERY_PARAM = 'lang';

/**
 * Future-proof BCP 47 regional/script alias map for hierarchical locale resolution
 * (e.g. zh-CN -> zh-Hans, zh-TW -> zh-Hant once Chinese dictionaries are added).
 */
const BCP47_SCRIPT_ALIASES: Readonly<Record<string, string>> = {
  'zh-cn': 'zh-hans',
  'zh-sg': 'zh-hans',
  'zh-tw': 'zh-hant',
  'zh-hk': 'zh-hant',
  'zh-mo': 'zh-hant',
};

const LOCALE_META_MAP: Record<SupportedLocale, LocaleMeta> = SUPPORTED_LOCALES.reduce(
  (acc, item) => {
    acc[item.code] = item;
    return acc;
  },
  {} as Record<SupportedLocale, LocaleMeta>
);

type NestedKeyOf<T> = {
  [K in keyof T & string]: T[K] extends PluralMessage
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${NestedKeyOf<T[K]>}`
      : K;
}[keyof T & string];

export type TranslationKey = NestedKeyOf<LocaleDictionary>;
export type TranslationParams = Record<string, string | number>;

function isSupportedLocale(value: string): value is SupportedLocale {
  return Object.prototype.hasOwnProperty.call(LOCALES, value);
}

/**
 * Hierarchical BCP 47 locale matcher:
 * 1. Exact tag match (e.g. "ja", "en", future "zh-hans")
 * 2. Regional/script alias match (e.g. "zh-cn" -> "zh-hans")
 * 3. Base language subtag match (e.g. "en-US" -> "en", "ja-JP" -> "ja")
 */
export function matchSupportedLocale(rawTag: string | null | undefined): SupportedLocale | null {
  if (!rawTag) return null;
  const normalized = rawTag.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return null;

  if (isSupportedLocale(normalized)) return normalized;

  const byHtmlLang = SUPPORTED_LOCALES.find((m) => m.htmlLang.toLowerCase() === normalized);
  if (byHtmlLang) return byHtmlLang.code;

  const aliased = BCP47_SCRIPT_ALIASES[normalized];
  if (aliased) {
    if (isSupportedLocale(aliased)) return aliased;
    const byAlias = SUPPORTED_LOCALES.find((m) => m.htmlLang.toLowerCase() === aliased);
    if (byAlias) return byAlias.code;
  }

  const base = normalized.split('-')[0];
  if (base && isSupportedLocale(base)) return base;
  const byBase = SUPPORTED_LOCALES.find((m) => m.htmlLang.toLowerCase().split('-')[0] === base);
  return byBase ? byBase.code : null;
}

function readQueryLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return matchSupportedLocale(params.get(LOCALE_QUERY_PARAM));
  } catch {
    return null;
  }
}

function readStoredLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    return matchSupportedLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage errors (e.g. restricted private mode)
  }
}

function syncUrlQueryLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(LOCALE_QUERY_PARAM) === locale) return;
    url.searchParams.set(LOCALE_QUERY_PARAM, locale);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Ignore history API restrictions in sandboxed environments
  }
}

function detectBrowserLocale(): SupportedLocale | null {
  if (typeof navigator === 'undefined') return null;
  const candidates: string[] = [];
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages);
  }
  if (navigator.language) {
    candidates.push(navigator.language);
  }
  for (const tag of candidates) {
    const matched = matchSupportedLocale(tag);
    if (matched) return matched;
  }
  return null;
}

/**
 * Resolves the initial locale in strict priority order:
 * 1. URL query parameter (?lang=...)
 * 2. Persisted user preference (localStorage)
 * 3. Browser language list (navigator.languages -> navigator.language)
 * 4. Fallback default ('en')
 */
export function resolveInitialLocale(): SupportedLocale {
  return readQueryLocale() ?? readStoredLocale() ?? detectBrowserLocale() ?? DEFAULT_LOCALE;
}

let activeLocale: SupportedLocale = resolveInitialLocale();

export function getActiveLocale(): SupportedLocale {
  return activeLocale;
}

export function getLocaleMeta(locale: SupportedLocale = activeLocale): LocaleMeta {
  return LOCALE_META_MAP[locale] ?? LOCALE_META_MAP[DEFAULT_LOCALE];
}

export function getActiveLocaleMeta(): LocaleMeta {
  return getLocaleMeta(activeLocale);
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function getPluralRules(locale: SupportedLocale): Intl.PluralRules | null {
  if (typeof Intl === 'undefined' || typeof Intl.PluralRules !== 'function') return null;
  const htmlLang = getLocaleMeta(locale).htmlLang;
  let rules = pluralRulesCache.get(htmlLang);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(htmlLang);
      pluralRulesCache.set(htmlLang, rules);
    } catch {
      return null;
    }
  }
  return rules;
}

function isPluralMessage(value: unknown): value is PluralMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'other' in value &&
    typeof (value as Record<string, unknown>).other === 'string'
  );
}

function lookupRawMessage(dict: LocaleDictionary, key: TranslationKey): MessageValue | null {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  if (typeof current === 'string' || isPluralMessage(current)) {
    return current;
  }
  return null;
}

function selectPluralTemplate(
  raw: MessageValue,
  count: number,
  locale: SupportedLocale
): string {
  if (typeof raw === 'string') return raw;
  const rules = getPluralRules(locale);
  const absCount = Math.abs(count);
  const category = (rules ? rules.select(absCount) : absCount === 1 ? 'one' : 'other') as PluralCategory;
  return raw[category] ?? raw.other;
}

function formatMessage(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/**
 * Formats numbers according to the active locale (for UI counters & file sizes).
 * Note: YouTube-exportable timecodes (00:00:00) intentionally bypass this to preserve strict ASCII digits.
 */
export function formatLocalizedNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale: SupportedLocale = activeLocale
): string {
  if (!Number.isFinite(value)) return '0';
  try {
    return new Intl.NumberFormat(getLocaleMeta(locale).htmlLang, options).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Standalone translation function for both React components and utility modules.
 * Automatically resolves CLDR plural messages when a numeric `count` param is provided.
 */
export function translate(
  key: TranslationKey,
  params?: TranslationParams,
  locale: SupportedLocale = activeLocale
): string {
  const dict = LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE];
  const raw = lookupRawMessage(dict, key) ?? lookupRawMessage(LOCALES[DEFAULT_LOCALE], key);
  if (raw === null) return key;

  const countCandidate = params && typeof params.count === 'number' ? params.count : 0;
  const template = selectPluralTemplate(raw, countCandidate, locale);
  return formatMessage(template, params);
}

/**
 * Explicit CLDR plural-aware translation function supporting any count value
 * (including signed deltas where `count` is the magnitude while `params` carries formatted display text).
 */
export function translatePlural(
  key: TranslationKey,
  count: number,
  params?: TranslationParams,
  locale: SupportedLocale = activeLocale
): string {
  const dict = LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE];
  const raw = lookupRawMessage(dict, key) ?? lookupRawMessage(LOCALES[DEFAULT_LOCALE], key);
  if (raw === null) return key;

  const template = selectPluralTemplate(raw, count, locale);
  const mergedParams: TranslationParams =
    params && 'count' in params
      ? params
      : { count: formatLocalizedNumber(count, undefined, locale), ...params };
  return formatMessage(template, mergedParams);
}

function syncDocumentMetadata(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return;
  const meta = getLocaleMeta(locale);
  document.documentElement.lang = meta.htmlLang;
  document.documentElement.dir = meta.dir;

  const title = translate('meta.title', undefined, locale);
  const description = translate('meta.description', undefined, locale);
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);

  let ogLocaleTag = document.querySelector('meta[property="og:locale"]');
  if (!ogLocaleTag) {
    ogLocaleTag = document.createElement('meta');
    ogLocaleTag.setAttribute('property', 'og:locale');
    document.head.appendChild(ogLocaleTag);
  }
  ogLocaleTag.setAttribute('content', meta.ogLocale);
}

interface I18nContextValue {
  locale: SupportedLocale;
  localeMeta: LocaleMeta;
  supportedLocales: readonly LocaleMeta[];
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  tp: (key: TranslationKey, count: number, params?: TranslationParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  localeMeta: LOCALE_META_MAP[DEFAULT_LOCALE],
  supportedLocales: SUPPORTED_LOCALES,
  setLocale: () => {},
  t: (key, params) => translate(key, params, DEFAULT_LOCALE),
  tp: (key, count, params) => translatePlural(key, count, params, DEFAULT_LOCALE),
  formatNumber: (value, options) => formatLocalizedNumber(value, options, DEFAULT_LOCALE),
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    const initial = resolveInitialLocale();
    activeLocale = initial;
    return initial;
  });

  const setLocale = useCallback((next: SupportedLocale) => {
    activeLocale = next;
    setLocaleState(next);
    writeStoredLocale(next);
    syncUrlQueryLocale(next);
  }, []);

  useEffect(() => {
    activeLocale = locale;
    syncDocumentMetadata(locale);
  }, [locale]);

  // Keep locale in sync if browser history navigates across ?lang= URLs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const fromQuery = readQueryLocale();
      if (fromQuery && fromQuery !== activeLocale) {
        activeLocale = fromQuery;
        setLocaleState(fromQuery);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(key, params, locale),
    [locale]
  );

  const tp = useCallback(
    (key: TranslationKey, count: number, params?: TranslationParams) =>
      translatePlural(key, count, params, locale),
    [locale]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      formatLocalizedNumber(value, options, locale),
    [locale]
  );

  const localeMeta = getLocaleMeta(locale);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localeMeta,
      supportedLocales: SUPPORTED_LOCALES,
      setLocale,
      t,
      tp,
      formatNumber,
    }),
    [locale, localeMeta, setLocale, t, tp, formatNumber]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
