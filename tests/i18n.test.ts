import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SUPPORTED_LOCALES,
  matchSupportedLocale,
  translate,
  translatePlural,
  type SupportedLocale,
} from '../src/i18n/index.tsx';

const LOCALES_DIR = path.resolve(process.cwd(), 'src/i18n/locales');
const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

function flattenLocale(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const subKeys = Object.keys(val as Record<string, unknown>);
      if (subKeys.length > 0 && subKeys.every((k) => PLURAL_KEYS.has(k))) {
        out[fullKey] = val;
      } else {
        Object.assign(out, flattenLocale(val as Record<string, unknown>, fullKey));
      }
    } else {
      out[fullKey] = val;
    }
  }
  return out;
}

function extractPlaceholders(value: unknown): string[] {
  const strings =
    typeof value === 'string'
      ? [value]
      : Object.values(value as Record<string, string>);
  const set = new Set<string>();
  for (const s of strings) {
    for (const match of String(s).matchAll(/\{\{(\w+)\}\}/g)) {
      set.add(match[1]);
    }
  }
  return [...set].sort();
}

describe('SUPPORTED_LOCALES metadata', () => {
  it('lists all locales in alphabetical order by code with BCP 47 ll-RR shortLabels', () => {
    const codes = SUPPORTED_LOCALES.map((l) => l.code);
    const sorted = [...codes].sort((a, b) => a.localeCompare(b, 'en'));
    assert.deepEqual(codes, sorted);

    for (const meta of SUPPORTED_LOCALES) {
      assert.match(meta.shortLabel, /^[a-z]{2}-[A-Z]{2}$/, `Invalid BCP 47 tag for ${meta.code}`);
      assert.ok(meta.nativeLabel.trim().length > 0);
      assert.ok(meta.dir === 'ltr' || meta.dir === 'rtl');
    }

    const ar = SUPPORTED_LOCALES.find((l) => l.code === 'ar');
    assert.equal(ar?.dir, 'rtl');
  });
});

describe('matchSupportedLocale', () => {
  it('resolves exact tags, regional aliases, base subtags, and rejects unknown tags', () => {
    assert.equal(matchSupportedLocale('en'), 'en');
    assert.equal(matchSupportedLocale('ja-JP'), 'ja');
    assert.equal(matchSupportedLocale('en_US'), 'en');
    assert.equal(matchSupportedLocale('zh-CN'), 'zh-hans');
    assert.equal(matchSupportedLocale('zh-SG'), 'zh-hans');
    assert.equal(matchSupportedLocale('zh-Hans'), 'zh-hans');
    assert.equal(matchSupportedLocale('zh-TW'), 'zh-hant');
    assert.equal(matchSupportedLocale('zh_HK'), 'zh-hant');
    assert.equal(matchSupportedLocale('zh-Hant'), 'zh-hant');
    assert.equal(matchSupportedLocale('in'), 'id');
    assert.equal(matchSupportedLocale('ar-SA'), 'ar');
    assert.equal(matchSupportedLocale('pt-PT'), 'pt');
    assert.equal(matchSupportedLocale('es-MX'), 'es');
    assert.equal(matchSupportedLocale('xx-YY'), null);
    assert.equal(matchSupportedLocale(''), null);
    assert.equal(matchSupportedLocale(null), null);
  });
});

describe('translate & translatePlural', () => {
  it('interpolates parameters and handles CLDR plural forms including Arabic 6 categories', () => {
    assert.equal(
      translate('importExport.importButton', { count: 5 }, 'ja'),
      '取り込む (5件)'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 1, undefined, 'en'),
      '1 chapter'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 4, undefined, 'en'),
      '4 chapters'
    );

    // French: 0 and 1 are singular, 2 is plural
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 0, undefined, 'fr'),
      '0 chapitre'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 1, undefined, 'fr'),
      '1 chapitre'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 2, undefined, 'fr'),
      '2 chapitres'
    );

    // Portuguese: 0 is plural ("0 capítulos"), 1 is singular ("1 capítulo")
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 0, undefined, 'pt'),
      '0 capítulos'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 1, undefined, 'pt'),
      '1 capítulo'
    );

    // Arabic 6 CLDR plural categories: zero, one, two, few (3-10), many (11-99), other (100+)
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 0, undefined, 'ar'),
      'لا توجد فصول'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 1, undefined, 'ar'),
      'فصل واحد'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 2, undefined, 'ar'),
      'فصلان'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 5, undefined, 'ar'),
      '5 فصول'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 15, undefined, 'ar'),
      '15 فصلًا'
    );
    assert.equal(
      translatePlural('importExport.detectedChaptersCount', 100, undefined, 'ar'),
      '100 فصل'
    );
  });
});

describe('11-locale dictionary integrity audit', () => {
  const enRaw = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  const enFlat = flattenLocale(enRaw);
  const enKeys = Object.keys(enFlat);

  for (const meta of SUPPORTED_LOCALES) {
    const loc: SupportedLocale = meta.code;
    it(`verifies key parity, placeholders, BiDi isolates, and clean copy for ${loc}`, () => {
      const rawText = fs.readFileSync(path.join(LOCALES_DIR, `${loc}.json`), 'utf8');
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const flat = flattenLocale(parsed);
      const locKeys = Object.keys(flat);

      const missing = enKeys.filter((k) => !(k in flat));
      const extra = locKeys.filter((k) => !(k in enFlat));
      assert.deepEqual(missing, [], `[${loc}] Missing keys: ${missing.join(', ')}`);
      assert.deepEqual(extra, [], `[${loc}] Extra keys: ${extra.join(', ')}`);

      // Ensure legacy Type A / Type B terminology is completely retired
      assert.doesNotMatch(
        rawText,
        /Type A|Type B|タイプA|タイプB|타입 A|타입 B|类型 A|类型 B|類型 A|類型 B|Tipo A|Tipo B|Typ A|Typ B|Tipe A|Tipe B/,
        `[${loc}] Contains obsolete Type A / Type B label`
      );

      for (const key of enKeys) {
        const enPlaceholders = extractPlaceholders(enFlat[key]);
        const locPlaceholders = extractPlaceholders(flat[key]);
        assert.deepEqual(
          locPlaceholders,
          enPlaceholders,
          `[${loc}] Placeholder mismatch at ${key}`
        );

        const val = flat[key];
        const strings =
          typeof val === 'string'
            ? [val]
            : Object.values(val as Record<string, string>);
        for (const s of strings) {
          assert.ok(s.length > 0, `[${loc}] Empty translation value at ${key}`);
          const lriCount = (s.match(/\u2066/g) || []).length;
          const pdiCount = (s.match(/\u2069/g) || []).length;
          assert.equal(
            lriCount,
            pdiCount,
            `[${loc}] Unbalanced BiDi isolate (U+2066/U+2069) at ${key}`
          );
          if (loc === 'pt') {
            assert.doesNotMatch(
              s,
              /\bde (a|o|os|as)\b/i,
              `[${loc}] Uncontracted Portuguese preposition at ${key}: ${s}`
            );
          }
        }
      }
    });
  }
});
