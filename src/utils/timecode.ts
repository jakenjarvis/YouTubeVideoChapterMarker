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

/**
 * Parses a timestamp token such as "00:10:04", "0:10:04", "10:04", or "00:10:04.250" into seconds.
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

/**
 * Type A parser: Chapter titles list (one title per non-empty line).
 */
export function parseTypeAText(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface ParsedTypeBEntry {
  timeSec: number;
  title: string;
}

/**
 * Type B parser: Timestamped chapter titles list ("00:00:00 アジェンダ" or "10:04 タイトル").
 */
export function parseTypeBText(raw: string): {
  entries: ParsedTypeBEntry[];
  skippedLines: number[];
} {
  const lines = raw.split(/\r?\n/);
  const entries: ParsedTypeBEntry[] = [];
  const skippedLines: number[] = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) return;
    // Match leading timestamp separated by whitespace, full-width space, tab, or hyphen
    const match = /^(\d{1,3}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)(?:[\s\u3000\-\–\—]+(.*))?$/.exec(line);
    if (!match) {
      skippedLines.push(idx + 1);
      return;
    }
    const timeSec = parseTimestampToSeconds(match[1]);
    if (timeSec === null) {
      skippedLines.push(idx + 1);
      return;
    }
    const title = (match[2] ?? '').trim();
    entries.push({ timeSec, title });
  });

  return { entries, skippedLines };
}

/**
 * Type B exporter: Generates YouTube chapter format "00:00:00 {ChapterName}" sorted chronologically.
 * Includes only markers that have a non-empty assigned chapter title.
 */
export function exportTypeBText(
  markers: Marker[],
  titles: ChapterTitle[],
  includeUntitleMarkers = false
): string {
  const sortedMarkers = [...markers].sort((a, b) => a.timeSec - b.timeSec || a.frameIndex - b.frameIndex);
  const titleByMarkerId = new Map<string, ChapterTitle>();
  for (const t of titles) {
    if (t.assignedMarkerId) {
      titleByMarkerId.set(t.assignedMarkerId, t);
    }
  }

  const rows: string[] = [];
  for (const marker of sortedMarkers) {
    const assigned = titleByMarkerId.get(marker.id);
    if (assigned && assigned.text.trim().length > 0) {
      rows.push(`${formatTimecodeHMS(marker.timeSec)} ${assigned.text.trim()}`);
    } else if (includeUntitleMarkers) {
      rows.push(`${formatTimecodeHMS(marker.timeSec)} `);
    }
  }
  return rows.join('\n');
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
