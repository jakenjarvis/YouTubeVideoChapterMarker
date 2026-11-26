import type { ChapterTitle, FrameMapEntry, Marker } from '../types/video';
import { formatLocalizedNumber, translate } from '../i18n';

/**
 * Formats seconds as HH:MM:SS (YouTube chapter format).
 * Always uses strict ASCII Western digits (0-9) so YouTube's chapter parser accepts output in any UI locale.
 * Floors to whole seconds cleanly with tiny epsilon tolerance to avoid 9.9999 -> 00:00:09 drift.
 */
export function formatTimecodeHMS(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalSec = Math.floor(safe + 1e-4);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Splits a timestamp into HH:MM:SS and .mmm parts for prominent studio display.
 */
export function splitTimecodeParts(seconds: number): {
  hms: string;
  ms: string;
  totalSecondsFormatted: string;
} {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const roundedMs = Math.round(safe * 1000);
  const totalSec = Math.floor(roundedMs / 1000);
  const msPart = roundedMs % 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return {
    hms: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
    ms: String(msPart).padStart(3, '0'),
    totalSecondsFormatted: safe.toFixed(3),
  };
}

/**
 * Formats bytes into human-readable B / KB / MB / GB with locale-aware decimal formatting.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return translate('units.bytes', { value: formatLocalizedNumber(Math.round(bytes)) });
  }
  if (bytes < 1024 * 1024) {
    return translate('units.kilobytes', {
      value: formatLocalizedNumber(bytes / 1024, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    });
  }
  if (bytes < 1024 * 1024 * 1024) {
    return translate('units.megabytes', {
      value: formatLocalizedNumber(bytes / (1024 * 1024), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    });
  }
  return translate('units.gigabytes', {
    value: formatLocalizedNumber(bytes / (1024 * 1024 * 1024), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  });
}

/**
 * Binary search in the Frame Correspondence List to find the closest frame index for a given time.
 */
export function findFrameIndexByTime(frames: FrameMapEntry[], timeSec: number): number {
  const len = frames.length;
  if (len === 0) return 0;
  if (timeSec <= frames[0].timeSec) return 0;
  if (timeSec >= frames[len - 1].timeSec) return len - 1;

  let lo = 0;
  let hi = len - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const t = frames[mid].timeSec;
    if (t === timeSec) return mid;
    if (t < timeSec) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // hi is the greatest index with frames[hi].timeSec < timeSec
  // lo is the smallest index with frames[lo].timeSec > timeSec
  if (hi < 0) return 0;
  if (lo >= len) return len - 1;
  const diffHi = Math.abs(timeSec - frames[hi].timeSec);
  const diffLo = Math.abs(frames[lo].timeSec - timeSec);
  return diffHi <= diffLo ? hi : lo;
}

export type ExportTimeFormat = 'auto' | 'm:ss' | 'mm:ss' | 'hh:mm:ss';

export type ExportLineLayout =
  | 'time-space-title'
  | 'time-dash-title'
  | 'title-space-time'
  | 'title-dash-time';

export interface ChapterExportOptions {
  timeFormat: ExportTimeFormat;
  layout: ExportLineLayout;
  includeUntitledMarkers?: boolean;
  videoDurationSec?: number;
}

export type ParsedChapterLineKind = 'chapter' | 'marker-only' | 'title-only';

export interface ParsedChapterLine {
  lineNumber: number;
  kind: ParsedChapterLineKind;
  timeSec: number | null;
  title: string;
}

export interface UnifiedChapterImportParseResult {
  lines: ParsedChapterLine[];
  chapterCount: number;
  markerOnlyCount: number;
  titleOnlyCount: number;
}

export interface YouTubeChapterValidation {
  isTitleFirstLayout: boolean;
  chapterCount: number;
  startsAtZero: boolean;
  hasMinimumCount: boolean;
  hasMinimumIntervals: boolean;
  isValid: boolean;
}

/**
 * Formats seconds according to the selected export time format using strict ASCII digits (0-9).
 * When `useHours` is true (for 'auto' when video/max >= 1h) or when the timestamp itself >= 1h,
 * hours are always preserved so timestamps never overflow 59:59.
 */
export function formatTimecodeByStyle(
  seconds: number,
  style: ExportTimeFormat,
  useHoursForAuto = false
): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalSec = Math.floor(safe + 1e-4);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const hh = String(h).padStart(2, '0');

  if (style === 'hh:mm:ss') {
    return `${hh}:${mm}:${ss}`;
  }
  if (style === 'm:ss') {
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }
  if (style === 'mm:ss') {
    return h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  }
  // 'auto'
  return useHoursForAuto || h > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Parses a timestamp token such as "00:10:04", "0:10:04", "10:04", "0:00", or "00:10:04.250" into seconds.
 * Returns null if invalid.
 */
export function parseTimestampToSeconds(token: string): number | null {
  const trimmed = token.trim();
  const hmsMatch = /^(\d{1,2}):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseInt(hmsMatch[3], 10);
    const ms = hmsMatch[4] ? parseInt(hmsMatch[4].padEnd(3, '0'), 10) : 0;
    return h * 3600 + m * 60 + s + ms / 1000;
  }
  const msMatch = /^(\d{1,3}):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(trimmed);
  if (msMatch) {
    const m = parseInt(msMatch[1], 10);
    const s = parseInt(msMatch[2], 10);
    const ms = msMatch[3] ? parseInt(msMatch[3].padEnd(3, '0'), 10) : 0;
    return m * 60 + s + ms / 1000;
  }
  return null;
}

const MATCHING_CLOSING_BRACKET: Record<string, string> = {
  '[': ']',
  '(': ')',
  '【': '】',
  '『': '』',
  '「': '」',
};

/**
 * Parses a single non-empty line into a timed chapter, marker-only timestamp, or title-only entry.
 * Preserves brackets/parentheses inside titles (e.g. "ドットーレの地下室(21) プレイ[J]").
 */
export function parseSingleChapterLine(
  rawLine: string,
  lineNumber: number
): ParsedChapterLine | null {
  const line = rawLine.trim();
  if (!line) return null;

  // 1. Leading timestamp: optional bullet/index, optional wrapping bracket, timestamp, optional range end, title
  const leadingRe =
    /^(?:(?:\d{1,3}[.)\]]\s+)|(?:[•·・\-–—*▶►▷■□◆◇★☆●○]\s*))?(?:([\[(【『「])\s*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?(?:\.\d{1,3})?)(?:\s*([\])】』」]))?(.*)$/;
  const leadMatch = leadingRe.exec(line);
  if (leadMatch) {
    const openBr = leadMatch[1] ?? '';
    const timeToken = leadMatch[2];
    const closeBr = leadMatch[3] ?? '';
    let rest = leadMatch[4] ?? '';

    const bracketsValid =
      (!openBr && !closeBr) ||
      (Boolean(openBr) && closeBr === MATCHING_CLOSING_BRACKET[openBr]);

    // If unbracketed, require end-of-line or explicit separator so e.g. "12:00のニュース" stays title-only
    const hasValidBoundary =
      Boolean(openBr) ||
      rest.length === 0 ||
      /^[\s\u3000\-–—:：|｜/・•·>＞~〜～]/.test(rest);

    if (bracketsValid && hasValidBoundary) {
      const timeSec = parseTimestampToSeconds(timeToken);
      if (timeSec !== null) {
        // Handle optional range end timestamp: e.g. "00:00 - 01:30 Title" -> take start time
        const rangeMatch =
          /^[\s\u3000]*[-–—~〜～][\s\u3000]*(?:([\[(【『「])\s*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?(?:\.\d{1,3})?)(?:\s*([\])】』」]))?(.*)$/.exec(
            rest
          );
        if (rangeMatch) {
          const rOpen = rangeMatch[1] ?? '';
          const rClose = rangeMatch[3] ?? '';
          const rRest = rangeMatch[4] ?? '';
          const rBracketsValid =
            (!rOpen && !rClose) ||
            (Boolean(rOpen) && rClose === MATCHING_CLOSING_BRACKET[rOpen]);
          const rBoundaryValid =
            Boolean(rOpen) ||
            rRest.length === 0 ||
            /^[\s\u3000\-–—:：|｜/・•·>＞]/.test(rRest);
          if (rBracketsValid && rBoundaryValid && parseTimestampToSeconds(rangeMatch[2]) !== null) {
            rest = rRest;
          }
        }

        const title = rest.replace(/^[\s\u3000\-–—:：|｜/・•·>＞]+/, '').trim();
        return {
          lineNumber,
          kind: title.length > 0 ? 'chapter' : 'marker-only',
          timeSec,
          title,
        };
      }
    }
  }

  // 2. Trailing timestamp: e.g. "Intro 00:00", "Intro - 04:56", "Intro (01:47:50)", "Intro [00:30]"
  if (!/^https?:\/\//i.test(line)) {
    const trailingRe =
      /^(.+?)[\s\u3000\-–—|｜:：]+(?:([\[(【『「])\s*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?(?:\.\d{1,3})?)(?:\s*([\])】』」]))?$/;
    const trailMatch = trailingRe.exec(line);
    if (trailMatch && !/https?:\/\//i.test(trailMatch[1])) {
      const rawTitle = trailMatch[1];
      const openBr = trailMatch[2] ?? '';
      const timeToken = trailMatch[3];
      const closeBr = trailMatch[4] ?? '';
      const bracketsValid =
        (!openBr && !closeBr) ||
        (Boolean(openBr) && closeBr === MATCHING_CLOSING_BRACKET[openBr]);
      if (bracketsValid) {
        const timeSec = parseTimestampToSeconds(timeToken);
        if (timeSec !== null) {
          const title = rawTitle.replace(/[\s\u3000\-–—:：|｜]+$/, '').trim();
          if (title.length > 0) {
            return {
              lineNumber,
              kind: 'chapter',
              timeSec,
              title,
            };
          }
        }
      }
    }
  }

  // 3. Title-only line (no timestamp)
  return {
    lineNumber,
    kind: 'title-only',
    timeSec: null,
    title: line,
  };
}

/**
 * Line-by-line unified chapter text parser.
 * Handles mixed inputs containing timed chapters, timestamp-only markers, and title-only lines.
 */
export function parseChapterTextLines(raw: string): UnifiedChapterImportParseResult {
  const rawLines = raw.split(/\r?\n/);
  const lines: ParsedChapterLine[] = [];
  let chapterCount = 0;
  let markerOnlyCount = 0;
  let titleOnlyCount = 0;

  rawLines.forEach((rawLine, idx) => {
    const parsed = parseSingleChapterLine(rawLine, idx + 1);
    if (!parsed) return;
    lines.push(parsed);
    if (parsed.kind === 'chapter') chapterCount++;
    else if (parsed.kind === 'marker-only') markerOnlyCount++;
    else titleOnlyCount++;
  });

  return { lines, chapterCount, markerOnlyCount, titleOnlyCount };
}

/**
 * Formats assigned (and optionally untitled) markers into chapter text using the chosen style & layout.
 */
export function exportChapterText(
  markers: Marker[],
  titles: ChapterTitle[],
  options: ChapterExportOptions
): string {
  const sortedMarkers = [...markers].sort((a, b) => a.timeSec - b.timeSec || a.frameIndex - b.frameIndex);
  const titleByMarkerId = new Map<string, ChapterTitle>();
  for (const t of titles) {
    if (t.assignedMarkerId) {
      titleByMarkerId.set(t.assignedMarkerId, t);
    }
  }

  const items: Array<{ timeSec: number; title: string }> = [];
  for (const marker of sortedMarkers) {
    const assigned = titleByMarkerId.get(marker.id);
    const cleanTitle = assigned ? assigned.text.trim() : '';
    if (cleanTitle.length > 0) {
      items.push({ timeSec: marker.timeSec, title: cleanTitle });
    } else if (options.includeUntitledMarkers) {
      items.push({ timeSec: marker.timeSec, title: '' });
    }
  }

  if (items.length === 0) return '';

  const maxItemSec = items.reduce((acc, item) => Math.max(acc, item.timeSec), 0);
  const maxReferenceSec = Math.max(options.videoDurationSec ?? 0, maxItemSec);
  const useHoursForAuto = maxReferenceSec >= 3600;

  return items
    .map(({ timeSec, title }) => {
      const tc = formatTimecodeByStyle(timeSec, options.timeFormat, useHoursForAuto);
      if (!title) {
        return tc;
      }
      switch (options.layout) {
        case 'time-dash-title':
          return `${tc} - ${title}`;
        case 'title-space-time':
          return `${title} ${tc}`;
        case 'title-dash-time':
          return `${title} - ${tc}`;
        case 'time-space-title':
        default:
          return `${tc} ${title}`;
      }
    })
    .join('\n');
}

/**
 * Checks whether the current exported chapter list satisfies YouTube's official Video Chapters rules.
 */
export function validateYouTubeChapters(
  markers: Marker[],
  titles: ChapterTitle[],
  options: ChapterExportOptions
): YouTubeChapterValidation {
  const isTitleFirstLayout =
    options.layout === 'title-space-time' || options.layout === 'title-dash-time';

  const sortedMarkers = [...markers].sort((a, b) => a.timeSec - b.timeSec || a.frameIndex - b.frameIndex);
  const titleByMarkerId = new Map<string, ChapterTitle>();
  for (const t of titles) {
    if (t.assignedMarkerId) {
      titleByMarkerId.set(t.assignedMarkerId, t);
    }
  }

  const secondsList: number[] = [];
  for (const marker of sortedMarkers) {
    const assigned = titleByMarkerId.get(marker.id);
    const hasTitle = Boolean(assigned && assigned.text.trim().length > 0);
    if (hasTitle || options.includeUntitledMarkers) {
      secondsList.push(Math.floor(Math.max(0, marker.timeSec) + 1e-4));
    }
  }

  const chapterCount = secondsList.length;
  const startsAtZero = chapterCount > 0 && secondsList[0] === 0;
  const hasMinimumCount = chapterCount >= 3;
  let hasMinimumIntervals = chapterCount > 0;
  for (let i = 1; i < secondsList.length; i++) {
    if (secondsList[i] - secondsList[i - 1] < 10) {
      hasMinimumIntervals = false;
      break;
    }
  }

  return {
    isTitleFirstLayout,
    chapterCount,
    startsAtZero,
    hasMinimumCount,
    hasMinimumIntervals,
    isValid: !isTitleFirstLayout && startsAtZero && hasMinimumCount && hasMinimumIntervals,
  };
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
