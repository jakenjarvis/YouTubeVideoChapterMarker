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

const ZERO_WIDTH_EDGE_RE = /^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/g;
const ZERO_WIDTH_ONLY_EDGE_RE = /^[\u200B-\u200D\u2060\uFEFF]+|[\u200B-\u200D\u2060\uFEFF]+$/g;

/**
 * Linear-time RFC 4180 single-line delimited row parser for TSV ('\t') and CSV (',').
 * Supports double-quoted fields with escaped quotes ("") and trims unquoted cell whitespace.
 * Returns null if quotes are malformed (unclosed or invalid characters after closing quote).
 */
export function parseDelimitedRow(line: string, delimiter: '\t' | ','): string[] | null {
  if (!line.includes(delimiter)) return null;

  const cells: string[] = [];
  let i = 0;
  const len = line.length;

  while (true) {
    // Skip leading ASCII spaces before a potentially quoted field (preserve tabs when delimiter is '\t')
    let cellStart = i;
    while (i < len && (line[i] === ' ' || line[i] === '\u3000')) {
      i++;
    }

    if (i < len && line[i] === '"') {
      // Quoted field
      i++; // consume opening quote
      let value = '';
      let closed = false;
      while (i < len) {
        const ch = line[i];
        if (ch === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            closed = true;
            i++;
            break;
          }
        } else {
          value += ch;
          i++;
        }
      }
      if (!closed) return null;

      // Only optional spaces allowed between closing quote and delimiter/EOL
      while (i < len && (line[i] === ' ' || line[i] === '\u3000')) {
        i++;
      }
      if (i < len && line[i] !== delimiter) {
        return null;
      }
      cells.push(value.replace(ZERO_WIDTH_EDGE_RE, ''));
    } else {
      // Unquoted field
      i = cellStart;
      let nextDelim = line.indexOf(delimiter, i);
      if (nextDelim === -1) nextDelim = len;
      const rawCell = line.slice(i, nextDelim);
      cells.push(rawCell.replace(ZERO_WIDTH_EDGE_RE, ''));
      i = nextDelim;
    }

    if (i < len && line[i] === delimiter) {
      i++; // consume delimiter and parse next cell (even if empty at EOL)
      continue;
    }
    break;
  }

  return cells;
}

/**
 * Parses a standalone table cell as a timestamp (optionally wrapped in matching brackets
 * or formatted as a time range like "00:00 - 01:30"). Returns null if not a pure timestamp cell.
 */
export function parseTimestampCell(rawCell: string): number | null {
  const cell = rawCell.replace(ZERO_WIDTH_EDGE_RE, '');
  if (!cell || cell.length > 48) return null;

  const unwrapBrackets = (token: string): string | null => {
    const first = token[0];
    const expectedClose = MATCHING_CLOSING_BRACKET[first];
    if (expectedClose) {
      if (token.endsWith(expectedClose)) {
        return token.slice(1, -1).trim();
      }
      return null;
    }
    return token;
  };

  const unwrapped = unwrapBrackets(cell);
  if (unwrapped === null) return null;

  const direct = parseTimestampToSeconds(unwrapped);
  if (direct !== null) return direct;

  // Support range inside a single timestamp cell: e.g. "00:00 - 01:30" or "[00:00] ~ [01:30]"
  const rangeMatch =
    /^([^\s\-–—~〜～]+(?:\s*[\])】』」])?)\s*[-–—~〜～]\s*([^\s\-–—~〜～]+(?:\s*[\])】』」])?)$/.exec(
      unwrapped
    );
  if (rangeMatch) {
    const startPart = unwrapBrackets(rangeMatch[1].trim());
    const endPart = unwrapBrackets(rangeMatch[2].trim());
    if (
      startPart !== null &&
      endPart !== null &&
      parseTimestampToSeconds(endPart) !== null
    ) {
      return parseTimestampToSeconds(startPart);
    }
  }

  return null;
}

/**
 * Attempts to interpret a 2-column cell pair as (time, title) or (title, time).
 * When allowSingleNonEmpty is true (e.g. TSV or CSV table context), a row with one empty cell
 * and one title cell is returned as 'title-only'.
 */
function interpretTwoColumnCells(
  colA: string,
  colB: string,
  lineNumber: number,
  allowSingleNonEmpty: boolean
): ParsedChapterLine | null {
  const timeA = parseTimestampCell(colA);
  if (timeA !== null) {
    const title = colB.trim();
    return {
      lineNumber,
      kind: title.length > 0 ? 'chapter' : 'marker-only',
      timeSec: timeA,
      title,
    };
  }

  const timeB = parseTimestampCell(colB);
  if (timeB !== null) {
    const title = colA.trim();
    return {
      lineNumber,
      kind: title.length > 0 ? 'chapter' : 'marker-only',
      timeSec: timeB,
      title,
    };
  }

  if (allowSingleNonEmpty) {
    const trimA = colA.trim();
    const trimB = colB.trim();
    if (trimA.length > 0 && trimB.length === 0) {
      return { lineNumber, kind: 'title-only', timeSec: null, title: trimA };
    }
    if (trimB.length > 0 && trimA.length === 0) {
      return { lineNumber, kind: 'title-only', timeSec: null, title: trimB };
    }
  }

  return null;
}

/**
 * Normalizes a delimited row to 2 columns by dropping trailing empty cells if more than 2 columns exist.
 */
function toTwoColumns(cells: string[] | null): [string, string] | null {
  if (!cells || cells.length < 2) return null;
  const trimmed = [...cells];
  while (trimmed.length > 2 && trimmed[trimmed.length - 1] === '') {
    trimmed.pop();
  }
  if (trimmed.length !== 2) return null;
  return [trimmed[0], trimmed[1]];
}

interface ParseLineOptions {
  csvTableContext?: boolean;
}

/**
 * Parses a single non-empty line into a timed chapter, marker-only timestamp, or title-only entry.
 * Supports 2-column tabular formats (TSV, RFC 4180 CSV, multi-space) as well as flexible freeform lines.
 * Uses linear-time boundary matching (ReDoS-safe) and preserves brackets inside titles (e.g. "(21)", "[J]").
 */
export function parseSingleChapterLine(
  rawLine: string,
  lineNumber: number,
  options?: ParseLineOptions
): ParsedChapterLine | null {
  const zwClean = rawLine.replace(ZERO_WIDTH_ONLY_EDGE_RE, '');
  if (!zwClean.trim()) return null;

  // 0a. Tab-separated 2-column table (Excel / Google Sheets copy-paste, including partial empty cells)
  if (zwClean.includes('\t')) {
    const tsvCols = toTwoColumns(parseDelimitedRow(zwClean, '\t'));
    if (tsvCols) {
      const interpreted = interpretTwoColumnCells(tsvCols[0], tsvCols[1], lineNumber, true);
      if (interpreted) return interpreted;
    }
  }

  const line = zwClean.replace(ZERO_WIDTH_EDGE_RE, '');
  if (!line) return null;

  // 0b. Comma-separated 2-column table (RFC 4180 CSV with quoted fields)
  if (line.includes(',')) {
    const csvCols = toTwoColumns(parseDelimitedRow(line, ','));
    if (csvCols) {
      const allowEmptyTitleCell = Boolean(options?.csvTableContext) || line.startsWith(',');
      const interpreted = interpretTwoColumnCells(
        csvCols[0],
        csvCols[1],
        lineNumber,
        allowEmptyTitleCell
      );
      if (interpreted) return interpreted;
    }
  }

  // 0c. Multi-space separated 2-column table (2+ ASCII spaces or 1+ full-width spaces around columns)
  const multiSpaceParts = line.split(/[ \t]{2,}|\u3000+/);
  if (multiSpaceParts.length === 2) {
    const interpreted = interpretTwoColumnCells(
      multiSpaceParts[0],
      multiSpaceParts[1],
      lineNumber,
      false
    );
    if (interpreted) return interpreted;
  }

  // 1. Leading timestamp: optional bullet/index, optional wrapping bracket, timestamp, optional range end, title
  const leadingRe =
    /^(?:(?:\d{1,3}[.)\]]\s+)|(?:[•·・\-–—*▶►▷■□◆◇★☆●○]\s*))?(?:([\[(【『「])[ \t\u3000]*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?(?:\.\d{1,3})?)(?:[ \t\u3000]*([\])】』」]))?(.*)$/;
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
          /^[\s\u3000]*[-–—~〜～][\s\u3000]*(?:([\[(【『「])[ \t\u3000]*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?(?:\.\d{1,3})?)(?:[ \t\u3000]*([\])】』」]))?(.*)$/.exec(
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

  // 2. Trailing timestamp (linear-time right-anchored extraction; immune to ReDoS backtracking)
  // e.g. "Intro 00:00", "Intro - 04:56", "Intro (01:47:50)", "Intro [00:30]"
  if (!/^https?:\/\//i.test(line)) {
    const tailWindowStart = Math.max(0, line.length - 48);
    const tailSlice = line.slice(tailWindowStart);
    const endTokenRe =
      /(?:([\[(【『「])[ \t\u3000]*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?(?:\.\d{1,3})?)(?:[ \t\u3000]*([\])】』」]))?$/;
    const endMatch = endTokenRe.exec(tailSlice);
    if (endMatch && endMatch.index > 0) {
      const tokenStartInLine = tailWindowStart + endMatch.index;
      const charBefore = line[tokenStartInLine - 1];
      const openBr = endMatch[1] ?? '';
      const timeToken = endMatch[2];
      const closeBr = endMatch[3] ?? '';
      const bracketsValid =
        (!openBr && !closeBr) ||
        (Boolean(openBr) && closeBr === MATCHING_CLOSING_BRACKET[openBr]);
      const sepValid =
        tokenStartInLine > 0 && /[\s\u3000\-–—|｜:：]/.test(charBefore);

      if (bracketsValid && sepValid) {
        const rawTitle = line.slice(0, tokenStartInLine);
        if (!/https?:\/\//i.test(rawTitle)) {
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
 * Handles mixed inputs containing timed chapters, timestamp-only markers, title-only lines,
 * and 2-column spreadsheet/CSV/TSV/multi-space tables.
 */
export function parseChapterTextLines(raw: string): UnifiedChapterImportParseResult {
  const rawLines = raw.split(/\r\n|\n|\r/);
  const lines: ParsedChapterLine[] = [];
  let chapterCount = 0;
  let markerOnlyCount = 0;
  let titleOnlyCount = 0;

  // Detect whether this batch contains at least one 2-column CSV timestamp row
  // so trailing-comma title-only rows like "Intro," in CSV tables strip the delimiter cleanly.
  const csvTableContext = rawLines.some((rawLine) => {
    const clean = rawLine.replace(ZERO_WIDTH_EDGE_RE, '');
    if (!clean.includes(',')) return false;
    const cols = toTwoColumns(parseDelimitedRow(clean, ','));
    if (!cols) return false;
    return parseTimestampCell(cols[0]) !== null || parseTimestampCell(cols[1]) !== null;
  });

  rawLines.forEach((rawLine, idx) => {
    const parsed = parseSingleChapterLine(rawLine, idx + 1, { csvTableContext });
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

const WINDOWS_RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Sanitizes a video filename into a safe cross-platform download base name.
 * Strips path separators, traversal dots, control characters, and Windows reserved device names.
 */
export function sanitizeExportBaseName(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const withoutExt = raw.replace(/\.[^./\\]+$/, '');
  const cleaned = withoutExt
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 120);
  if (!cleaned || /^_+$/.test(cleaned) || WINDOWS_RESERVED_NAME_RE.test(cleaned)) {
    return fallback;
  }
  return cleaned;
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
