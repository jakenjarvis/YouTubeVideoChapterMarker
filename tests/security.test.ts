import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  exportChapterText,
  parseChapterTextLines,
  sanitizeExportBaseName,
} from '../src/utils/timecode.ts';
import {
  extractYouTubeVideoId,
  parseChaptersFromDescription,
} from '../src/utils/youtube.ts';
import {
  getLocaleMeta,
  matchSupportedLocale,
  translate,
  translatePlural,
  type SupportedLocale,
  type TranslationKey,
  type TranslationParams,
} from '../src/i18n/index.tsx';
import type { ChapterTitle, Marker } from '../src/types/video.ts';

const ROOT_DIR = process.cwd();

function collectSourceFiles(dir: string, exts: Set<string>): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full, exts));
    } else if (exts.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

describe('Adversarial URL & outbound-request boundary validation (extractYouTubeVideoId)', () => {
  const hostileUrls: ReadonlyArray<[string, string]> = [
    ['loopback IPv4', 'http://127.0.0.1/watch?v=dQw4w9WgXcQ'],
    ['localhost', 'http://localhost:3000/watch?v=dQw4w9WgXcQ'],
    ['loopback IPv6', 'http://[::1]/watch?v=dQw4w9WgXcQ'],
    ['cloud metadata IP', 'http://169.254.169.254/latest/meta-data/?v=dQw4w9WgXcQ'],
    ['private RFC1918 10.x', 'http://10.0.0.1/watch?v=dQw4w9WgXcQ'],
    ['private RFC1918 192.168.x', 'http://192.168.1.1/watch?v=dQw4w9WgXcQ'],
    ['userinfo credential bypass', 'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['userinfo host spoof', 'https://www.youtube.com@evil.example/watch?v=dQw4w9WgXcQ'],
    ['non-standard HTTPS port', 'https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ'],
    ['non-standard SSH port', 'https://www.youtube.com:22/watch?v=dQw4w9WgXcQ'],
    ['suffix host spoof', 'https://evil-youtube.com/watch?v=dQw4w9WgXcQ'],
    ['subdomain host spoof', 'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'],
    ['youtu.be host spoof', 'https://youtu.be.evil.example/dQw4w9WgXcQ'],
    ['youtu.be multi-segment traversal', 'https://youtu.be/dQw4w9WgXcQ/../../admin'],
    ['javascript scheme', 'javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ'],
    ['data URI scheme', 'data:text/html,<script>alert(1)</script>'],
    ['file scheme', 'file:///etc/passwd'],
    ['ftp scheme', 'ftp://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['CRLF header injection', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ\r\nX-Injected: true'],
    ['null byte injection', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ\0evil'],
    ['oversized 4KB URL', `https://www.youtube.com/watch?v=dQw4w9WgXcQ&pad=${'a'.repeat(4096)}`],
    ['SQLi-like ID payload', "dQw4w9WgXc' OR '1'='1"],
    ['short 10-char ID', 'dQw4w9WgXc'],
    ['long 12-char ID', 'dQw4w9WgXcQQ'],
  ];

  for (const [label, payload] of hostileUrls) {
    it(`rejects ${label}`, () => {
      // Act
      const actual = extractYouTubeVideoId(payload);

      // Assert
      assert.equal(actual, null, `Expected hostile input (${label}) to be rejected`);
    });
  }

  it('still accepts explicit standard ports 80 and 443 on allowlisted hosts', () => {
    assert.equal(
      extractYouTubeVideoId('https://www.youtube.com:443/watch?v=dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.equal(
      extractYouTubeVideoId('http://www.youtube.com:80/watch?v=dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
  });
});

describe('ReDoS & pathological massive-input resilience', () => {
  const MAX_PARSE_MS = 200;

  const pathologicalLines: ReadonlyArray<[string, string]> = [
    ['50KB repeated dash-separated words without timestamp', 'a - '.repeat(12500) + 'end'],
    ['60KB repeated separators before trailing timestamp', ' - '.repeat(15000) + '00:00'],
    ['40KB repeated bullets', '• '.repeat(20000) + 'title'],
    ['40KB nested open/close parens around timestamp', '('.repeat(20000) + '00:00' + ')'.repeat(20000)],
    ['50KB colon noise', '12:34:56:78:90 '.repeat(3500)],
    ['50KB zero-width padding around valid line', '\u200B'.repeat(25000) + '01:23 Safe' + '\uFEFF'.repeat(25000)],
  ];

  for (const [label, payload] of pathologicalLines) {
    it(`parses ${label} in linear time (< ${MAX_PARSE_MS}ms) in both chapter parsers`, () => {
      // Act
      const t0 = performance.now();
      const textParsed = parseChapterTextLines(payload);
      const descParsed = parseChaptersFromDescription(payload);
      const elapsedMs = performance.now() - t0;

      // Assert
      assert.ok(
        elapsedMs < MAX_PARSE_MS,
        `Potential catastrophic backtracking on "${label}": took ${elapsedMs.toFixed(1)}ms`
      );
      assert.ok(Array.isArray(textParsed.lines));
      assert.ok(Array.isArray(descParsed));
    });
  }

  it('handles a 5,000-line mixed import and export batch swiftly without degrading', () => {
    // Arrange
    const lines: string[] = [];
    for (let i = 0; i < 5000; i++) {
      const mm = Math.floor(i / 60);
      const ss = i % 60;
      const ts = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      lines.push(i % 10 === 0 ? `Title only line ${i}` : `${ts} Chapter ${i}`);
    }
    const raw = lines.join('\n');

    // Act
    const t0 = performance.now();
    const parsed = parseChapterTextLines(raw);
    const markers: Marker[] = [];
    const titles: ChapterTitle[] = [];
    let idx = 0;
    for (const item of parsed.lines) {
      if (item.kind === 'chapter' && item.timeSec !== null) {
        const mId = `m${idx}`;
        markers.push({ id: mId, frameIndex: idx, timeSec: item.timeSec });
        titles.push({ id: `t${idx}`, text: item.title, assignedMarkerId: mId, unassignedOrder: 0 });
        idx++;
      }
    }
    const exported = exportChapterText(markers, titles, {
      timeFormat: 'auto',
      layout: 'time-space-title',
      videoDurationSec: 5000,
    });
    const elapsedMs = performance.now() - t0;

    // Assert
    assert.equal(parsed.chapterCount, 4500);
    assert.equal(parsed.titleOnlyCount, 500);
    assert.equal(exported.split('\n').length, 4500);
    assert.ok(elapsedMs < 500, `Expected 5,000-line round-trip < 500ms, took ${elapsedMs.toFixed(1)}ms`);
  });
});

describe('Prototype pollution & object-key injection defense (i18n)', () => {
  const poisonedKeys = [
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'valueOf',
    'hasOwnProperty',
    'constructor-foo',
    '__proto__-bar',
    'a'.repeat(10_000),
  ];

  it('rejects prototype keys and oversized strings in matchSupportedLocale', () => {
    for (const key of poisonedKeys) {
      assert.equal(
        matchSupportedLocale(key),
        null,
        `matchSupportedLocale should return null for "${key.slice(0, 32)}"`
      );
    }
  });

  it('never leaks Object.prototype methods or crashes on poisoned keys/locales/params', () => {
    // Act & Assert
    for (const key of ['__proto__', 'constructor', 'toString', 'constructor.prototype']) {
      const res = translate(key as unknown as TranslationKey, undefined, 'en');
      assert.equal(res, key);
      assert.equal(typeof res, 'string');
    }

    const fallbackMeta = getLocaleMeta('constructor' as unknown as SupportedLocale);
    assert.equal(fallbackMeta.code, 'en');

    const badLocaleTranslation = translate(
      'meta.title',
      undefined,
      '__proto__' as unknown as SupportedLocale
    );
    assert.equal(typeof badLocaleTranslation, 'string');
    assert.ok(badLocaleTranslation.length > 0);

    // Interpolation must not read inherited Object.prototype properties like toString
    const fakeParams = {} as TranslationParams;
    const interpolated = translate('meta.title', fakeParams, 'en');
    assert.ok(!interpolated.includes('[native code]'));

    // Non-finite plural counts must never throw
    for (const badCount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0]) {
      const pluralized = translatePlural(
        'importExport.detectedChaptersCount',
        badCount,
        undefined,
        'ar'
      );
      assert.equal(typeof pluralized, 'string');
      assert.ok(pluralized.length > 0);
    }

    // Ensure global Object.prototype was not mutated
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
});

describe('Download filename sanitization (sanitizeExportBaseName)', () => {
  const cases: ReadonlyArray<[string, string | null | undefined, (actual: string) => void]> = [
    [
      'strips Unix path traversal and extension',
      '../../etc/passwd.mp4',
      (out) => {
        assert.ok(!out.includes('..'));
        assert.ok(!out.includes('/'));
        assert.ok(!out.includes('\\'));
      },
    ],
    [
      'strips Windows path traversal and drive letters',
      'C:\\..\\..\\windows\\system32\\cmd.exe',
      (out) => {
        assert.ok(!out.includes('..'));
        assert.ok(!out.includes('\\'));
        assert.ok(!out.includes(':'));
      },
    ],
    [
      'removes null bytes and CRLF control characters',
      'my\x00video\r\nname\x1f.mov',
      (out) => {
        assert.ok(!/[\x00-\x1f\x7f]/.test(out));
        assert.equal(out, 'myvideoname');
      },
    ],
    [
      'neutralizes dotfiles and dot-only names',
      '....',
      (out) => {
        assert.equal(out, 'video');
      },
    ],
    [
      'neutralizes Windows reserved device names (CON, NUL, COM1, LPT9)',
      'CON.mp4',
      (out) => {
        assert.notEqual(out.toUpperCase(), 'CON');
        assert.equal(out, 'video');
      },
    ],
    [
      'neutralizes lowercase reserved device name nul.txt',
      'nul.txt',
      (out) => {
        assert.notEqual(out.toLowerCase(), 'nul');
      },
    ],
    [
      'caps absurdly long filenames at 120 characters',
      `${'a'.repeat(500)}.mp4`,
      (out) => {
        assert.ok(out.length <= 120);
        assert.ok(out.length > 0);
      },
    ],
    [
      'falls back cleanly on empty or whitespace-only names',
      '   ',
      (out) => {
        assert.equal(out, 'video');
      },
    ],
    [
      'preserves safe Unicode titles (Japanese/Arabic/Emoji)',
      '星の旅 2026 [HD].mp4',
      (out) => {
        assert.equal(out, '星の旅 2026 [HD]');
      },
    ],
  ];

  for (const [label, input, verify] of cases) {
    it(label, () => {
      const actual = sanitizeExportBaseName(input, 'video');
      verify(actual);
    });
  }
});

describe('XSS payload inert round-trip & static codebase security invariants', () => {
  it('treats HTML/JS/script payloads inside chapter titles as inert plain text', () => {
    // Arrange
    const payloads = [
      '00:00 <script>alert("xss")</script>',
      '00:15 "><img src=x onerror=alert(1)>',
      '00:30 javascript:alert(document.cookie)',
      '00:45 {{constructor.constructor("return this")()}}',
    ];

    // Act
    const parsed = parseChapterTextLines(payloads.join('\n'));
    const markers: Marker[] = parsed.lines.map((l, i) => ({
      id: `m${i}`,
      frameIndex: i * 10,
      timeSec: l.timeSec ?? 0,
    }));
    const titles: ChapterTitle[] = parsed.lines.map((l, i) => ({
      id: `t${i}`,
      text: l.title,
      assignedMarkerId: `m${i}`,
      unassignedOrder: 0,
    }));
    const exported = exportChapterText(markers, titles, {
      timeFormat: 'mm:ss',
      layout: 'time-space-title',
    });

    // Assert
    assert.equal(parsed.chapterCount, 4);
    assert.equal(exported, payloads.join('\n'));
  });

  it('contains zero dangerous DOM/code execution sinks and zero hardcoded secret tokens in production code', () => {
    // Arrange
    const sourceDirs = [
      path.join(ROOT_DIR, 'src'),
      path.join(ROOT_DIR, 'api'),
    ];
    const files = [
      ...sourceDirs.flatMap((d) => collectSourceFiles(d, new Set(['.ts', '.tsx', '.js', '.jsx']))),
      path.join(ROOT_DIR, 'server.ts'),
      path.join(ROOT_DIR, 'vite.config.ts'),
    ].filter((f) => fs.existsSync(f));

    const forbiddenPatterns: ReadonlyArray<[string, RegExp]> = [
      ['dangerouslySetInnerHTML', /\bdangerouslySetInnerHTML\b/],
      ['outerHTML', /\.outerHTML\b/],
      ['document.write', /\bdocument\.write\s*\(/],
      ['eval()', /\beval\s*\(/],
      ['new Function', /\bnew\s+Function\s*\(/],
      ['window.alert', /\bwindow\.alert\s*\(/],
      ['window.open', /\bwindow\.open\s*\(/],
      ['Google API key literal', /AIza[0-9A-Za-z_-]{35}/],
      ['GitHub token literal', /gh[pousr]_[A-Za-z0-9]{36}/],
      ['OpenAI-style secret literal', /\bsk-[A-Za-z0-9]{20,}\b/],
    ];

    // Act & Assert
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(ROOT_DIR, file);
      for (const [label, pattern] of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `Forbidden security pattern "${label}" found in ${rel}`
        );
      }
    }
  });
});
