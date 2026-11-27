import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './locales/en.json';
import ja from './locales/ja.json';
import es from './locales/es.json';
import ko from './locales/ko.json';
import zhHant from './locales/zh-hant.json';
import pt from './locales/pt.json';
import zhHans from './locales/zh-hans.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import id from './locales/id.json';
import ar from './locales/ar.json';

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
  es,
  ko,
  'zh-hant': zhHant,
  pt,
  'zh-hans': zhHans,
  de,
  fr,
  id,
  ar,
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
    code: 'ar',
    htmlLang: 'ar',
    ogLocale: 'ar_AR',
    dir: 'rtl',
    nativeLabel: 'العربية',
    shortLabel: 'ar-SA',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans Arabic", sans-serif',
  },
  {
    code: 'de',
    htmlLang: 'de',
    ogLocale: 'de_DE',
    dir: 'ltr',
    nativeLabel: 'Deutsch',
    shortLabel: 'de-DE',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif',
  },
  {
    code: 'en',
    htmlLang: 'en',
    ogLocale: 'en_US',
    dir: 'ltr',
    nativeLabel: 'English',
    shortLabel: 'en-US',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif',
  },
  {
    code: 'es',
    htmlLang: 'es',
    ogLocale: 'es_ES',
    dir: 'ltr',
    nativeLabel: 'Español',
    shortLabel: 'es-ES',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif',
  },
  {
    code: 'fr',
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    dir: 'ltr',
    nativeLabel: 'Français',
    shortLabel: 'fr-FR',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif',
  },
  {
    code: 'id',
    htmlLang: 'id',
    ogLocale: 'id_ID',
    dir: 'ltr',
    nativeLabel: 'Bahasa Indonesia',
    shortLabel: 'id-ID',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif',
  },
  {
    code: 'ja',
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    dir: 'ltr',
    nativeLabel: '日本語',
    shortLabel: 'ja-JP',
    canvasFontFamily: '"Noto Sans JP", "Plus Jakarta Sans", sans-serif',
  },
  {
    code: 'ko',
    htmlLang: 'ko',
    ogLocale: 'ko_KR',
    dir: 'ltr',
    nativeLabel: '한국어',
    shortLabel: 'ko-KR',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans KR", sans-serif',
  },
  {
    code: 'pt',
    htmlLang: 'pt',
    ogLocale: 'pt_BR',
    dir: 'ltr',
    nativeLabel: 'Português',
    shortLabel: 'pt-BR',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif',
  },
  {
    code: 'zh-hans',
    htmlLang: 'zh-Hans',
    ogLocale: 'zh_CN',
    dir: 'ltr',
    nativeLabel: '简体中文',
    shortLabel: 'zh-CN',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans SC", sans-serif',
  },
  {
    code: 'zh-hant',
    htmlLang: 'zh-Hant',
    ogLocale: 'zh_TW',
    dir: 'ltr',
    nativeLabel: '繁體中文',
    shortLabel: 'zh-TW',
    canvasFontFamily: '"Plus Jakarta Sans", "Noto Sans TC", sans-serif',
  },
] as const;

export const DEFAULT_LOCALE: SupportedLocale = 'en';
export const DEFAULT_SITE_URL = 'https://youtube-video-chapter-marker.vercel.app';
const LOCALE_STORAGE_KEY = 'vcm_locale';
const LOCALE_QUERY_PARAM = 'lang';

/**
 * Future-proof BCP 47 regional/script alias map for hierarchical locale resolution
 * (e.g. zh-CN -> zh-Hans, zh-TW -> zh-Hant, legacy 'in' -> 'id').
 */
const BCP47_SCRIPT_ALIASES: Readonly<Record<string, string>> = {
  'zh-cn': 'zh-hans',
  'zh-sg': 'zh-hans',
  'zh-tw': 'zh-hant',
  'zh-hk': 'zh-hant',
  'zh-mo': 'zh-hant',
  in: 'id',
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

const hasOwn = (obj: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

function isSupportedLocale(value: string): value is SupportedLocale {
  return hasOwn(LOCALES, value);
}

/**
 * Hierarchical BCP 47 locale matcher:
 * 1. Exact tag match (e.g. "ja", "en", future "zh-hans")
 * 2. Regional/script alias match (e.g. "zh-cn" -> "zh-hans")
 * 3. Base language subtag match (e.g. "en-US" -> "en", "ja-JP" -> "ja")
 */
export function matchSupportedLocale(rawTag: string | null | undefined): SupportedLocale | null {
  if (!rawTag || typeof rawTag !== 'string' || rawTag.length > 64) return null;
  const normalized = rawTag.trim().replace(/_/g, '-').toLowerCase();
  if (!normalized) return null;

  if (isSupportedLocale(normalized)) return normalized;

  const byHtmlLang = SUPPORTED_LOCALES.find((m) => m.htmlLang.toLowerCase() === normalized);
  if (byHtmlLang) return byHtmlLang.code;

  const aliased = hasOwn(BCP47_SCRIPT_ALIASES, normalized)
    ? BCP47_SCRIPT_ALIASES[normalized]
    : undefined;
  if (aliased) {
    if (isSupportedLocale(aliased)) return aliased;
    const byAlias = SUPPORTED_LOCALES.find((m) => m.htmlLang.toLowerCase() === aliased);
    if (byAlias) return byAlias.code;
  }

  const parts = normalized.split('-');
  if (parts.length >= 2) {
    const langScript = `${parts[0]}-${parts[1]}`;
    if (isSupportedLocale(langScript)) return langScript;
    const byLangScript = SUPPORTED_LOCALES.find((m) => m.htmlLang.toLowerCase() === langScript);
    if (byLangScript) return byLangScript.code;
    const aliasedPair = hasOwn(BCP47_SCRIPT_ALIASES, langScript)
      ? BCP47_SCRIPT_ALIASES[langScript]
      : undefined;
    if (aliasedPair) {
      if (isSupportedLocale(aliasedPair)) return aliasedPair;
      const byAliasPair = SUPPORTED_LOCALES.find((m) => m.htmlLang.toLowerCase() === aliasedPair);
      if (byAliasPair) return byAliasPair.code;
    }
  }

  const base = parts[0];
  if (base && isSupportedLocale(base)) return base;
  const byBase = SUPPORTED_LOCALES.find((m) => m.htmlLang.toLowerCase().split('-')[0] === base);
  return byBase ? byBase.code : null;
}

function getCanonicalOrigin(): string {
  const envUrl =
    typeof import.meta !== 'undefined' && typeof import.meta.env?.VITE_SITE_URL === 'string'
      ? import.meta.env.VITE_SITE_URL.trim()
      : '';
  if (envUrl && /^https?:\/\//i.test(envUrl)) {
    return envUrl.replace(/\/+$/, '');
  }
  return DEFAULT_SITE_URL;
}

function readPathLocale(): SupportedLocale | null {
  if (typeof window === 'undefined') return null;
  try {
    const match = /^\/([a-z]{2}(?:-[a-z0-9]{2,4})?)(?:\/|$)/i.exec(window.location.pathname);
    if (!match) return null;
    return matchSupportedLocale(match[1]);
  } catch {
    return null;
  }
}

function isRootOrLocalePath(pathname: string): boolean {
  if (pathname === '/' || pathname === '') return true;
  const match = /^\/([a-z]{2}(?:-[a-z0-9]{2,4})?)\/?$/i.exec(pathname);
  return Boolean(match && matchSupportedLocale(match[1]));
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

function syncUrlLocale(locale: SupportedLocale): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (isRootOrLocalePath(url.pathname)) {
      const targetPath = `/${locale}/`;
      const hadQueryLang = url.searchParams.has(LOCALE_QUERY_PARAM);
      if (url.pathname === targetPath && !hadQueryLang) return;
      url.pathname = targetPath;
      url.searchParams.delete(LOCALE_QUERY_PARAM);
      window.history.replaceState(window.history.state, '', url.toString());
      return;
    }
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
 * 1. URL path prefix (/en/, /ja/)
 * 2. URL query parameter (?lang=...) — backwards compatible with shared links
 * 3. Persisted user preference (localStorage)
 * 4. Browser language list (navigator.languages -> navigator.language)
 * 5. Fallback default ('en')
 */
export function resolveInitialLocale(): SupportedLocale {
  return (
    readPathLocale() ??
    readQueryLocale() ??
    readStoredLocale() ??
    detectBrowserLocale() ??
    DEFAULT_LOCALE
  );
}

let activeLocale: SupportedLocale = resolveInitialLocale();

export function getActiveLocale(): SupportedLocale {
  return activeLocale;
}

export function getLocaleMeta(locale: SupportedLocale = activeLocale): LocaleMeta {
  return hasOwn(LOCALE_META_MAP, locale) ? LOCALE_META_MAP[locale] : LOCALE_META_MAP[DEFAULT_LOCALE];
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
    hasOwn(value as object, 'other') &&
    typeof (value as Record<string, unknown>).other === 'string'
  );
}

function lookupRawMessage(dict: LocaleDictionary, key: TranslationKey): MessageValue | null {
  const parts = key.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (
      current &&
      typeof current === 'object' &&
      hasOwn(current as object, part)
    ) {
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
  const safeCount = Number.isFinite(count) ? count : 0;
  const absCount = Math.abs(safeCount);
  if (absCount === 0 && hasOwn(raw, 'zero') && raw.zero !== undefined) return raw.zero;
  const rules = getPluralRules(locale);
  const category = (rules ? rules.select(absCount) : absCount === 1 ? 'one' : 'other') as PluralCategory;
  return (hasOwn(raw, category) ? raw[category] : undefined) ?? raw.other;
}

function formatMessage(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    hasOwn(params, name) ? String(params[name]) : match
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
  const safeLocale: SupportedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const dict = LOCALES[safeLocale];
  const raw = lookupRawMessage(dict, key) ?? lookupRawMessage(LOCALES[DEFAULT_LOCALE], key);
  if (raw === null) return key;

  const countCandidate = params && typeof params.count === 'number' ? params.count : 0;
  const template = selectPluralTemplate(raw, countCandidate, safeLocale);
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
  const safeLocale: SupportedLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const dict = LOCALES[safeLocale];
  const raw = lookupRawMessage(dict, key) ?? lookupRawMessage(LOCALES[DEFAULT_LOCALE], key);
  if (raw === null) return key;

  const template = selectPluralTemplate(raw, count, safeLocale);
  const mergedParams: TranslationParams =
    params && hasOwn(params, 'count')
      ? params
      : { count: formatLocalizedNumber(count, undefined, safeLocale), ...params };
  return formatMessage(template, mergedParams);
}

function upsertMetaTag(attrName: 'name' | 'property', attrValue: string, content: string): void {
  let tag = document.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attrName, attrValue);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function upsertLinkTag(
  selector: string,
  attrs: Record<string, string>
): void {
  let tag = document.querySelector(selector);
  if (!tag) {
    tag = document.createElement('link');
    document.head.appendChild(tag);
  }
  for (const [key, val] of Object.entries(attrs)) {
    tag.setAttribute(key, val);
  }
}

function syncDocumentMetadata(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return;
  const meta = getLocaleMeta(locale);
  const origin = getCanonicalOrigin();
  const isExplicitLocaleUrl = Boolean(readPathLocale() || readQueryLocale());
  const canonicalUrl = isExplicitLocaleUrl ? `${origin}/${locale}/` : `${origin}/`;
  const ogImageUrl = `${origin}/og-image.png`;

  document.documentElement.lang = meta.htmlLang;
  document.documentElement.dir = meta.dir;

  const title = translate('meta.title', undefined, locale);
  const description = translate('meta.description', undefined, locale);
  const siteName = translate('meta.siteName', undefined, locale);
  const ogImageAlt = translate('meta.ogImageAlt', undefined, locale);
  const appDescription = translate('meta.appDescription', undefined, locale);

  document.title = title;
  upsertMetaTag('name', 'description', description);
  upsertMetaTag('property', 'og:site_name', siteName);
  upsertMetaTag('property', 'og:title', title);
  upsertMetaTag('property', 'og:description', description);
  upsertMetaTag('property', 'og:url', canonicalUrl);
  upsertMetaTag('property', 'og:locale', meta.ogLocale);
  upsertMetaTag('property', 'og:image', ogImageUrl);
  upsertMetaTag('property', 'og:image:alt', ogImageAlt);
  upsertMetaTag('name', 'twitter:title', title);
  upsertMetaTag('name', 'twitter:description', description);
  upsertMetaTag('name', 'twitter:image', ogImageUrl);
  upsertMetaTag('name', 'twitter:image:alt', ogImageAlt);

  document
    .querySelectorAll('meta[property="og:locale:alternate"]')
    .forEach((node) => node.remove());
  for (const item of SUPPORTED_LOCALES) {
    if (item.code === locale) continue;
    const altTag = document.createElement('meta');
    altTag.setAttribute('property', 'og:locale:alternate');
    altTag.setAttribute('content', item.ogLocale);
    document.head.appendChild(altTag);
  }

  upsertLinkTag('link[rel="canonical"]', {
    rel: 'canonical',
    href: canonicalUrl,
  });

  for (const item of SUPPORTED_LOCALES) {
    upsertLinkTag(`link[rel="alternate"][hreflang="${item.htmlLang}"]`, {
      rel: 'alternate',
      hreflang: item.htmlLang,
      href: `${origin}/${item.code}/`,
    });
  }
  upsertLinkTag('link[rel="alternate"][hreflang="x-default"]', {
    rel: 'alternate',
    hreflang: 'x-default',
    href: `${origin}/`,
  });

  const faqKeys: ReadonlyArray<readonly [TranslationKey, TranslationKey]> = [
    ['faq.q1', 'faq.a1'],
    ['faq.q2', 'faq.a2'],
    ['faq.q3', 'faq.a3'],
    ['faq.q4', 'faq.a4'],
    ['faq.q5', 'faq.a5'],
  ];

  const jsonLdPayload = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: siteName,
        url: canonicalUrl,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web Browser',
        softwareVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.6.2',
        browserRequirements: 'Requires a modern web browser with HTML5 video support',
        inLanguage: isExplicitLocaleUrl ? meta.htmlLang : SUPPORTED_LOCALES.map((item) => item.htmlLang),
        isAccessibleForFree: true,
        description: appDescription,
        image: ogImageUrl,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqKeys.map(([qKey, aKey]) => ({
          '@type': 'Question',
          name: translate(qKey, undefined, locale),
          acceptedAnswer: {
            '@type': 'Answer',
            text: translate(aKey, undefined, locale),
          },
        })),
      },
    ],
  };

  let jsonLdScript = document.getElementById('seo-json-ld');
  if (!jsonLdScript) {
    jsonLdScript = document.createElement('script');
    jsonLdScript.id = 'seo-json-ld';
    jsonLdScript.setAttribute('type', 'application/ld+json');
    document.head.appendChild(jsonLdScript);
  }
  jsonLdScript.textContent = JSON.stringify(jsonLdPayload);
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
    syncUrlLocale(next);
  }, []);

  useEffect(() => {
    activeLocale = locale;
    syncDocumentMetadata(locale);
  }, [locale]);

  // Keep locale in sync if browser history navigates across /en/, /ja/, or ?lang= URLs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const fromUrl = readPathLocale() ?? readQueryLocale();
      if (fromUrl && fromUrl !== activeLocale) {
        activeLocale = fromUrl;
        setLocaleState(fromUrl);
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
