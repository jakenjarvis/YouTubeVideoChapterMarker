import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportChapterText,
  findFrameIndexByTime,
  formatTimecodeByStyle,
  formatTimecodeHMS,
  parseChapterTextLines,
  parseTimestampToSeconds,
  splitTimecodeParts,
  validateYouTubeChapters,
} from '../src/utils/timecode.ts';
import type { ChapterTitle, FrameMapEntry, Marker } from '../src/types/video.ts';

describe('formatTimecodeHMS & splitTimecodeParts', () => {
  it('formats standard and boundary timestamps with strict ASCII digits', () => {
    assert.equal(formatTimecodeHMS(0), '00:00:00');
    assert.equal(formatTimecodeHMS(9.9999), '00:00:10');
    assert.equal(formatTimecodeHMS(296), '00:04:56');
    assert.equal(formatTimecodeHMS(6470), '01:47:50');
    assert.equal(formatTimecodeHMS(-5), '00:00:00');
    assert.equal(formatTimecodeHMS(Number.NaN), '00:00:00');
  });

  it('splits seconds into HH:MM:SS and 3-digit milliseconds', () => {
    const parts = splitTimecodeParts(3661.25);
    assert.equal(parts.hms, '01:01:01');
    assert.equal(parts.ms, '250');
    assert.equal(parts.totalSecondsFormatted, '3661.250');
  });
});

describe('formatTimecodeByStyle', () => {
  it('supports auto, m:ss, mm:ss, and hh:mm:ss styles', () => {
    assert.equal(formatTimecodeByStyle(0, 'auto', false), '00:00');
    assert.equal(formatTimecodeByStyle(296, 'auto', false), '04:56');
    assert.equal(formatTimecodeByStyle(296, 'auto', true), '00:04:56');
    assert.equal(formatTimecodeByStyle(6470, 'auto', false), '01:47:50');

    assert.equal(formatTimecodeByStyle(0, 'm:ss'), '0:00');
    assert.equal(formatTimecodeByStyle(296, 'm:ss'), '4:56');
    assert.equal(formatTimecodeByStyle(6470, 'm:ss'), '1:47:50');

    assert.equal(formatTimecodeByStyle(0, 'mm:ss'), '00:00');
    assert.equal(formatTimecodeByStyle(296, 'mm:ss'), '04:56');
    assert.equal(formatTimecodeByStyle(6470, 'mm:ss'), '01:47:50');

    assert.equal(formatTimecodeByStyle(0, 'hh:mm:ss'), '00:00:00');
    assert.equal(formatTimecodeByStyle(296, 'hh:mm:ss'), '00:04:56');
    assert.equal(formatTimecodeByStyle(6470, 'hh:mm:ss'), '01:47:50');
  });
});

describe('parseTimestampToSeconds', () => {
  it('parses MM:SS, HH:MM:SS, and optional fractional milliseconds', () => {
    assert.equal(parseTimestampToSeconds('0:00'), 0);
    assert.equal(parseTimestampToSeconds('00:00'), 0);
    assert.equal(parseTimestampToSeconds('04:56'), 296);
    assert.equal(parseTimestampToSeconds('35:41'), 2141);
    assert.equal(parseTimestampToSeconds('00:38:22'), 2302);
    assert.equal(parseTimestampToSeconds('01:47:50'), 6470);
    assert.equal(parseTimestampToSeconds('00:10:04.250'), 604.25);
  });

  it('rejects malformed tokens', () => {
    assert.equal(parseTimestampToSeconds(''), null);
    assert.equal(parseTimestampToSeconds('00:65'), null);
    assert.equal(parseTimestampToSeconds('1:60:00'), null);
    assert.equal(parseTimestampToSeconds('12'), null);
    assert.equal(parseTimestampToSeconds('abc:de'), null);
  });
});

describe('findFrameIndexByTime', () => {
  const vfrFrames: FrameMapEntry[] = [
    { frameIndex: 0, timeSec: 0, durationSec: 0.033, isKeyFrame: true },
    { frameIndex: 1, timeSec: 0.033, durationSec: 0.05, isKeyFrame: false },
    { frameIndex: 2, timeSec: 0.083, durationSec: 0.017, isKeyFrame: false },
    { frameIndex: 3, timeSec: 0.1, durationSec: 0.033, isKeyFrame: true },
  ];

  it('clamps out-of-range times and picks nearest frame on VFR timelines', () => {
    assert.equal(findFrameIndexByTime([], 5), 0);
    assert.equal(findFrameIndexByTime(vfrFrames, -1), 0);
    assert.equal(findFrameIndexByTime(vfrFrames, 10), 3);
    assert.equal(findFrameIndexByTime(vfrFrames, 0.083), 2);
    assert.equal(findFrameIndexByTime(vfrFrames, 0.04), 1);
    assert.equal(findFrameIndexByTime(vfrFrames, 0.075), 2);
  });
});

describe('parseChapterTextLines', () => {
  it('parses mixed timed chapters, marker-only lines, and title-only lines while preserving title brackets', () => {
    const input = [
      '00:00 星々の幻境 ドットーレの地下室(21) プレイ[J]',
      '04:56 星々の幻境 Elemental Bastion TD プレイ[J]',
      ' デイリー[Q]',
      '35:41 呑星の鯨戦[JQ]',
      '00:38:22 ',
      '01:47:50 デイリー[J]',
    ].join('\n');

    const result = parseChapterTextLines(input);
    assert.equal(result.chapterCount, 4);
    assert.equal(result.markerOnlyCount, 1);
    assert.equal(result.titleOnlyCount, 1);
    assert.deepEqual(result.lines, [
      {
        lineNumber: 1,
        kind: 'chapter',
        timeSec: 0,
        title: '星々の幻境 ドットーレの地下室(21) プレイ[J]',
      },
      {
        lineNumber: 2,
        kind: 'chapter',
        timeSec: 296,
        title: '星々の幻境 Elemental Bastion TD プレイ[J]',
      },
      {
        lineNumber: 3,
        kind: 'title-only',
        timeSec: null,
        title: 'デイリー[Q]',
      },
      {
        lineNumber: 4,
        kind: 'chapter',
        timeSec: 2141,
        title: '呑星の鯨戦[JQ]',
      },
      {
        lineNumber: 5,
        kind: 'marker-only',
        timeSec: 2302,
        title: '',
      },
      {
        lineNumber: 6,
        kind: 'chapter',
        timeSec: 6470,
        title: 'デイリー[J]',
      },
    ]);
  });

  it('supports dashes, brackets, bullets, numbered lines, time ranges, and trailing timestamps', () => {
    const input = [
      '0:00 - オープニング',
      '[0:15] セクション1',
      '【01:00】セクション2',
      '1. 02:30 連番付き',
      '• 02:45 箇条書き',
      '03:00 - 04:00 範囲指定',
      'タイトル先行 05:00',
      'タイトル先行ハイフン - 06:00',
      'タイトル先行括弧 (07:30)',
      'タイトル先行角括弧 [08:15]',
    ].join('\n');

    const result = parseChapterTextLines(input);
    assert.equal(result.chapterCount, 10);
    assert.equal(result.markerOnlyCount, 0);
    assert.equal(result.titleOnlyCount, 0);
    assert.deepEqual(
      result.lines.map((l) => [l.timeSec, l.title]),
      [
        [0, 'オープニング'],
        [15, 'セクション1'],
        [60, 'セクション2'],
        [150, '連番付き'],
        [165, '箇条書き'],
        [180, '範囲指定'],
        [300, 'タイトル先行'],
        [360, 'タイトル先行ハイフン'],
        [450, 'タイトル先行括弧'],
        [495, 'タイトル先行角括弧'],
      ]
    );
  });

  it('avoids false positives on titles containing embedded times or URLs', () => {
    const input = [
      '12:00のニュース',
      'https://example.com:8080/watch',
      'Just a plain title',
      'Part 1, Part 2',
      '00:00 Hello, World',
    ].join('\n');

    const result = parseChapterTextLines(input);
    assert.equal(result.chapterCount, 1);
    assert.equal(result.markerOnlyCount, 0);
    assert.equal(result.titleOnlyCount, 4);
    assert.deepEqual(
      result.lines.map((l) => [l.kind, l.timeSec, l.title]),
      [
        ['title-only', null, '12:00のニュース'],
        ['title-only', null, 'https://example.com:8080/watch'],
        ['title-only', null, 'Just a plain title'],
        ['title-only', null, 'Part 1, Part 2'],
        ['chapter', 0, 'Hello, World'],
      ]
    );
  });

  it('parses 2-column TSV (Excel/Sheets copy-paste) including reversed columns, quotes, and partial empty cells', () => {
    const tsv = [
      '00:00\tオープニング',
      '本編スタート\t04:56',
      '[00:10:00]\t"Quoted ""Title"" Here"',
      '00:15:00 - 00:20:00\t範囲タイムスタンプセル',
      '\tデイリー[Q]',
      '未割当タイトル\t',
      '00:38:22\t',
      '\t00:45:00',
      '01:00:00\tエンディング\t',
    ].join('\n');

    const result = parseChapterTextLines(tsv);
    assert.equal(result.chapterCount, 5);
    assert.equal(result.markerOnlyCount, 2);
    assert.equal(result.titleOnlyCount, 2);
    assert.deepEqual(
      result.lines.map((l) => [l.kind, l.timeSec, l.title]),
      [
        ['chapter', 0, 'オープニング'],
        ['chapter', 296, '本編スタート'],
        ['chapter', 600, 'Quoted "Title" Here'],
        ['chapter', 900, '範囲タイムスタンプセル'],
        ['title-only', null, 'デイリー[Q]'],
        ['title-only', null, '未割当タイトル'],
        ['marker-only', 2302, ''],
        ['marker-only', 2700, ''],
        ['chapter', 3600, 'エンディング'],
      ]
    );
  });

  it('parses 2-column CSV (RFC 4180 quoted commas, reversed columns, and empty cells)', () => {
    const csv = [
      '00:00,オープニング',
      '04:56,"星々の幻境, パート1"',
      '"タイトル, 先行 (""引用"")",10:30',
      ',未割当タイトルA',
      '未割当タイトルB,',
      '00:38:22,',
      ',00:45:00',
      '"01:00:00","エンディング",',
    ].join('\n');

    const result = parseChapterTextLines(csv);
    assert.equal(result.chapterCount, 4);
    assert.equal(result.markerOnlyCount, 2);
    assert.equal(result.titleOnlyCount, 2);
    assert.deepEqual(
      result.lines.map((l) => [l.kind, l.timeSec, l.title]),
      [
        ['chapter', 0, 'オープニング'],
        ['chapter', 296, '星々の幻境, パート1'],
        ['chapter', 630, 'タイトル, 先行 ("引用")'],
        ['title-only', null, '未割当タイトルA'],
        ['title-only', null, '未割当タイトルB'],
        ['marker-only', 2302, ''],
        ['marker-only', 2700, ''],
        ['chapter', 3600, 'エンディング'],
      ]
    );
  });

  it('parses 2-column multi-space and full-width-space separated rows', () => {
    const spaced = [
      '00:00    オープニング',
      '星々の幻境 ドットーレの地下室(21)    00:04:56',
      '00:10:00\u3000\u3000セクション1',
      'まとめ\u3000\u300001:00:00',
    ].join('\n');

    const result = parseChapterTextLines(spaced);
    assert.equal(result.chapterCount, 4);
    assert.equal(result.markerOnlyCount, 0);
    assert.equal(result.titleOnlyCount, 0);
    assert.deepEqual(
      result.lines.map((l) => [l.timeSec, l.title]),
      [
        [0, 'オープニング'],
        [296, '星々の幻境 ドットーレの地下室(21)'],
        [600, 'セクション1'],
        [3600, 'まとめ'],
      ]
    );
  });
});

describe('exportChapterText & validateYouTubeChapters', () => {
  const markers: Marker[] = [
    { id: 'm3', frameIndex: 300, timeSec: 6470 },
    { id: 'm1', frameIndex: 0, timeSec: 0 },
    { id: 'm2', frameIndex: 100, timeSec: 296 },
    { id: 'm4', frameIndex: 200, timeSec: 1200 },
  ];

  const titles: ChapterTitle[] = [
    { id: 't1', text: 'Intro', assignedMarkerId: 'm1', unassignedOrder: 0 },
    { id: 't2', text: 'Main', assignedMarkerId: 'm2', unassignedOrder: 0 },
    { id: 't3', text: 'Outro', assignedMarkerId: 'm3', unassignedOrder: 0 },
  ];

  it('sorts chronologically and formats according to selected timeFormat and layout', () => {
    assert.equal(
      exportChapterText(markers, titles, {
        timeFormat: 'auto',
        layout: 'time-space-title',
        videoDurationSec: 7000,
      }),
      '00:00:00 Intro\n00:04:56 Main\n01:47:50 Outro'
    );

    assert.equal(
      exportChapterText(markers.slice(1, 3), titles.slice(0, 2), {
        timeFormat: 'auto',
        layout: 'time-space-title',
        videoDurationSec: 600,
      }),
      '00:00 Intro\n04:56 Main'
    );

    assert.equal(
      exportChapterText(markers, titles, {
        timeFormat: 'm:ss',
        layout: 'time-dash-title',
      }),
      '0:00 - Intro\n4:56 - Main\n1:47:50 - Outro'
    );

    assert.equal(
      exportChapterText(markers, titles, {
        timeFormat: 'mm:ss',
        layout: 'title-space-time',
      }),
      'Intro 00:00\nMain 04:56\nOutro 01:47:50'
    );

    assert.equal(
      exportChapterText(markers, titles, {
        timeFormat: 'hh:mm:ss',
        layout: 'title-dash-time',
        includeUntitledMarkers: true,
      }),
      'Intro - 00:00:00\nMain - 00:04:56\n00:20:00\nOutro - 01:47:50'
    );
  });

  it('validates YouTube chapter requirements accurately', () => {
    const valid = validateYouTubeChapters(markers, titles, {
      timeFormat: 'auto',
      layout: 'time-space-title',
    });
    assert.equal(valid.isValid, true);
    assert.equal(valid.startsAtZero, true);
    assert.equal(valid.hasMinimumCount, true);
    assert.equal(valid.hasMinimumIntervals, true);
    assert.equal(valid.isTitleFirstLayout, false);

    // Title-first layout is incompatible with YouTube seekbar chapters
    const titleFirst = validateYouTubeChapters(markers, titles, {
      timeFormat: 'auto',
      layout: 'title-dash-time',
    });
    assert.equal(titleFirst.isTitleFirstLayout, true);
    assert.equal(titleFirst.isValid, false);

    // Short interval (< 10s) and missing 0:00 start
    const invalidMarkers: Marker[] = [
      { id: 'a', frameIndex: 10, timeSec: 5 },
      { id: 'b', frameIndex: 20, timeSec: 12 },
    ];
    const invalidTitles: ChapterTitle[] = [
      { id: 'ta', text: 'A', assignedMarkerId: 'a', unassignedOrder: 0 },
      { id: 'tb', text: 'B', assignedMarkerId: 'b', unassignedOrder: 0 },
    ];
    const invalid = validateYouTubeChapters(invalidMarkers, invalidTitles, {
      timeFormat: 'auto',
      layout: 'time-space-title',
    });
    assert.equal(invalid.startsAtZero, false);
    assert.equal(invalid.hasMinimumCount, false);
    assert.equal(invalid.hasMinimumIntervals, false);
    assert.equal(invalid.isValid, false);
  });

  it('handles edge cases: zero-width chars, CR/CRLF endings, mismatched brackets, non-finite values, and exact 10s intervals', () => {
    // Zero-width BOM/ZWSP edges & mixed CR / CRLF line endings
    const messyInput =
      '\uFEFF00:00 Intro\u200B\r\n' +
      '\u200B00:10 Main\r' +
      '[00:20) Mismatched Brackets Should Be Title Only\r\n' +
      '00:30:00\u2060';
    const parsed = parseChapterTextLines(messyInput);
    assert.equal(parsed.chapterCount, 2);
    assert.equal(parsed.titleOnlyCount, 1);
    assert.equal(parsed.markerOnlyCount, 1);
    assert.equal(parsed.lines[0].title, 'Intro');
    assert.equal(parsed.lines[1].title, 'Main');
    assert.equal(parsed.lines[2].kind, 'title-only');
    assert.equal(parsed.lines[3].timeSec, 1800);

    // Non-finite inputs must always produce strict ASCII 00:00:00 / 00:00
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, -999]) {
      assert.equal(formatTimecodeHMS(bad), '00:00:00');
      assert.equal(formatTimecodeByStyle(bad, 'mm:ss'), '00:00');
      assert.match(formatTimecodeByStyle(bad, 'hh:mm:ss'), /^[0-9:]+$/);
    }

    // Exact 10-second intervals (0s, 10s, 20s) are valid for YouTube
    const exact10Markers: Marker[] = [
      { id: 'e1', frameIndex: 0, timeSec: 0 },
      { id: 'e2', frameIndex: 10, timeSec: 10 },
      { id: 'e3', frameIndex: 20, timeSec: 20 },
    ];
    const exact10Titles: ChapterTitle[] = [
      { id: 'et1', text: 'One', assignedMarkerId: 'e1', unassignedOrder: 0 },
      { id: 'et2', text: 'Two', assignedMarkerId: 'e2', unassignedOrder: 0 },
      { id: 'et3', text: 'Three', assignedMarkerId: 'e3', unassignedOrder: 0 },
    ];
    const exactCheck = validateYouTubeChapters(exact10Markers, exact10Titles, {
      timeFormat: 'mm:ss',
      layout: 'time-space-title',
    });
    assert.equal(exactCheck.isValid, true);
    assert.equal(exactCheck.hasMinimumIntervals, true);

    // 9-second interval (0s, 9s, 20s) fails minimum interval rule
    const nineSecMarkers: Marker[] = [
      { id: 'n1', frameIndex: 0, timeSec: 0 },
      { id: 'n2', frameIndex: 9, timeSec: 9 },
      { id: 'n3', frameIndex: 20, timeSec: 20 },
    ];
    const nineSecTitles: ChapterTitle[] = [
      { id: 'nt1', text: 'One', assignedMarkerId: 'n1', unassignedOrder: 0 },
      { id: 'nt2', text: 'Two', assignedMarkerId: 'n2', unassignedOrder: 0 },
      { id: 'nt3', text: 'Three', assignedMarkerId: 'n3', unassignedOrder: 0 },
    ];
    const nineCheck = validateYouTubeChapters(nineSecMarkers, nineSecTitles, {
      timeFormat: 'mm:ss',
      layout: 'time-space-title',
    });
    assert.equal(nineCheck.hasMinimumIntervals, false);
    assert.equal(nineCheck.isValid, false);

    // Empty markers export safely to empty string
    assert.equal(
      exportChapterText([], [], { timeFormat: 'auto', layout: 'time-space-title' }),
      ''
    );
  });
});


