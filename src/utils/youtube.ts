export interface ParsedYouTubeChapter {
  timeSec: number;
  title: string;
}

export type YouTubeApiErrorCode =
  | 'INVALID_YOUTUBE_URL'
  | 'YOUTUBE_VIDEO_NOT_FOUND'
  | 'YOUTUBE_LOAD_FAILED';

export type YouTubeApiWarningCode =
  | 'YOUTUBE_RESTRICTED_WITH_REASON'
  | 'YOUTUBE_RESTRICTED_PRIVATE'
  | 'YOUTUBE_DESCRIPTION_FETCH_FAILED'
  | 'STATIC_SITE_YOUTUBE_FALLBACK';

export interface YouTubeVideoInfoResponse {
  videoId: string;
  url: string;
  title: string;
  author: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  description: string;
  chapters: ParsedYouTubeChapter[];
  chapterSource: 'description' | 'youtube-chapters' | 'none';
  warning?: string;
  warningCode?: YouTubeApiWarningCode;
  warningDetail?: string;
  isFallbackTitle?: boolean;
}

const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const MAX_YOUTUBE_INPUT_LENGTH = 2048;

/**
 * Strictly extracts and validates an 11-character YouTube Video ID from a URL or raw ID.
 * Rejects non-YouTube hosts, embedded credentials, non-standard ports, control characters, and oversized inputs.
 */
export function extractYouTubeVideoId(rawInput: string): string | null {
  if (!rawInput || typeof rawInput !== 'string' || rawInput.length > MAX_YOUTUBE_INPUT_LENGTH) {
    return null;
  }
  if (/[\x00-\x1f\x7f]/.test(rawInput)) {
    return null;
  }
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(withScheme);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  if (parsed.port && parsed.port !== '443' && parsed.port !== '80') {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(hostname)) {
    return null;
  }

  let candidate: string | null = null;

  if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    candidate = segments.length === 1 ? segments[0] : null;
  } else {
    const vParam = parsed.searchParams.get('v');
    if (vParam) {
      candidate = vParam;
    } else {
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (
        segments.length >= 2 &&
        (segments[0] === 'embed' ||
          segments[0] === 'shorts' ||
          segments[0] === 'live' ||
          segments[0] === 'v')
      ) {
        candidate = segments[1];
      }
    }
  }

  if (candidate && VIDEO_ID_REGEX.test(candidate)) {
    return candidate;
  }
  return null;
}

function parseTimestampToken(token: string): number | null {
  const clean = token.trim();
  const hms = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(clean);
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
  }
  const ms = /^(\d{1,3}):([0-5]\d)$/.exec(clean);
  if (ms) {
    return parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10);
  }
  return null;
}

const MATCHING_BRACKET_END: Record<string, string> = {
  '[': ']',
  '(': ')',
  '【': '】',
  '『': '』',
  '「': '」',
};

const ZERO_WIDTH_EDGE_RE = /^[\s\u200B-\u200D\u2060\uFEFF]+|[\s\u200B-\u200D\u2060\uFEFF]+$/g;

/**
 * Extracts timestamped chapter entries from a YouTube video description.
 * Linear-time (ReDoS-safe) parser supporting leading timestamps ("00:00:00 Title", "0:00 - Title",
 * "1. 0:00 Title", "0:00 - 1:30 Title", "[00:00] Title", "【00:00】Title") and trailing timestamps
 * ("Title 00:00", "Title - 00:00", "Title (00:00)").
 */
export function parseChaptersFromDescription(
  description: string,
  durationSec?: number
): ParsedYouTubeChapter[] {
  if (!description || !description.trim()) return [];

  const lines = description.split(/\r\n|\n|\r/);
  const extracted: ParsedYouTubeChapter[] = [];
  const seenSeconds = new Set<number>();

  const leadingRe =
    /^(?:(?:\d{1,3}[.)\]]\s+)|(?:[•·・\-–—*▶►▷■□◆◇★☆●○]\s*))?(?:([\[(【『「])[ \t\u3000]*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?)(?:[ \t\u3000]*([\])】』」]))?(.*)$/;

  const endTokenRe =
    /(?:([\[(【『「])[ \t\u3000]*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?)(?:[ \t\u3000]*([\])】』」]))?$/;

  for (const rawLine of lines) {
    const line = rawLine.replace(ZERO_WIDTH_EDGE_RE, '');
    if (!line) continue;
    if (/^https?:\/\//i.test(line)) continue;

    let timeSec: number | null = null;
    let title = '';

    const leadMatch = leadingRe.exec(line);
    if (leadMatch) {
      const openBr = leadMatch[1] ?? '';
      const closeBr = leadMatch[3] ?? '';
      let rest = leadMatch[4] ?? '';
      const bracketsValid =
        (!openBr && !closeBr) ||
        (Boolean(openBr) && closeBr === MATCHING_BRACKET_END[openBr]);
      const hasValidBoundary =
        Boolean(openBr) ||
        rest.length === 0 ||
        /^[\s\u3000\-–—:：|｜/・•·>＞~〜～]/.test(rest);

      if (bracketsValid && hasValidBoundary) {
        const parsed = parseTimestampToken(leadMatch[2]);
        if (parsed !== null) {
          const rangeMatch =
            /^[\s\u3000]*[-–—~〜～][\s\u3000]*(?:([\[(【『「])[ \t\u3000]*)?(\d{1,3}:[0-5]\d(?::[0-5]\d)?)(?:[ \t\u3000]*([\])】』」]))?(.*)$/.exec(
              rest
            );
          if (rangeMatch) {
            const rOpen = rangeMatch[1] ?? '';
            const rClose = rangeMatch[3] ?? '';
            const rRest = rangeMatch[4] ?? '';
            const rBracketsValid =
              (!rOpen && !rClose) ||
              (Boolean(rOpen) && rClose === MATCHING_BRACKET_END[rOpen]);
            const rBoundaryValid =
              Boolean(rOpen) ||
              rRest.length === 0 ||
              /^[\s\u3000\-–—:：|｜/・•·>＞]/.test(rRest);
            if (rBracketsValid && rBoundaryValid && parseTimestampToken(rangeMatch[2]) !== null) {
              rest = rRest;
            }
          }
          timeSec = parsed;
          title = rest.replace(/^[\s\u3000\-–—:：|｜/・•·>＞]+/, '').trim();
        }
      }
    }

    if (timeSec === null) {
      const tailWindowStart = Math.max(0, line.length - 48);
      const tailSlice = line.slice(tailWindowStart);
      const endMatch = endTokenRe.exec(tailSlice);
      if (endMatch && endMatch.index > 0) {
        const tokenStartInLine = tailWindowStart + endMatch.index;
        const charBefore = line[tokenStartInLine - 1];
        const openBr = endMatch[1] ?? '';
        const closeBr = endMatch[3] ?? '';
        const bracketsValid =
          (!openBr && !closeBr) ||
          (Boolean(openBr) && closeBr === MATCHING_BRACKET_END[openBr]);
        const sepValid = tokenStartInLine > 0 && /[\s\u3000\-–—|｜:：]/.test(charBefore);
        if (bracketsValid && sepValid) {
          const rawTitle = line.slice(0, tokenStartInLine);
          if (!/https?:\/\//i.test(rawTitle)) {
            const parsed = parseTimestampToken(endMatch[2]);
            if (parsed !== null) {
              timeSec = parsed;
              title = rawTitle.replace(/[\s\u3000\-–—:：|｜]+$/, '').trim();
            }
          }
        }
      }
    }

    if (timeSec === null) continue;
    if (durationSec && durationSec > 0 && timeSec > durationSec + 1) continue;
    if (seenSeconds.has(timeSec)) continue;

    seenSeconds.add(timeSec);
    extracted.push({ timeSec, title });
  }

  extracted.sort((a, b) => a.timeSec - b.timeSec);
  return extracted;
}
