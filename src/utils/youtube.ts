export interface ParsedYouTubeChapter {
  timeSec: number;
  title: string;
}

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

/**
 * Strictly extracts and validates an 11-character YouTube Video ID from a URL or raw ID.
 * Returns null for any non-YouTube host or invalid format.
 */
export function extractYouTubeVideoId(rawInput: string): string | null {
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

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(hostname)) {
    return null;
  }

  let candidate: string | null = null;

  if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
    const seg = parsed.pathname.split('/').filter(Boolean)[0];
    candidate = seg ?? null;
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

function cleanChapterTitle(raw: string): string {
  return raw
    .replace(/^[\s\u3000\-–—:：|｜/・•·>＞]+/, '')
    .replace(/[\s\u3000\-–—:：|｜]+$/, '')
    .trim();
}

/**
 * Extracts timestamped chapter entries from a YouTube video description.
 * Supports leading timestamps ("00:00:00 Title", "0:00 - Title", "[00:00] Title", "【00:00】Title")
 * as well as trailing timestamps ("Title 00:00", "Title (00:00)").
 */
export function parseChaptersFromDescription(
  description: string,
  durationSec?: number
): ParsedYouTubeChapter[] {
  if (!description || !description.trim()) return [];

  const lines = description.split(/\r?\n/);
  const extracted: ParsedYouTubeChapter[] = [];
  const seenSeconds = new Set<number>();

  // Leading timestamp pattern: optional bracket/bullet, HH:MM:SS or MM:SS, optional closing bracket, title
  const leadingRe =
    /^(?:[•·・\-–—*▶►▷■□◆◇★☆●○]\s*)?(?:[\[(【『「]\s*)?(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?:\s*[\])】』」])?(?:[\s\u3000\-–—:：|｜/]+(.*))?$/;

  // Trailing timestamp pattern: "Title 00:10" or "Title (00:10:05)"
  const trailingRe =
    /^(.+?)[\s\u3000\-–—|｜]+(?:[\[(【]\s*)?(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?:\s*[\])】])?$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Skip pure URL lines
    if (/^https?:\/\//i.test(line)) continue;

    let timeSec: number | null = null;
    let title = '';

    const leadMatch = leadingRe.exec(line);
    if (leadMatch) {
      timeSec = parseTimestampToken(leadMatch[1]);
      title = cleanChapterTitle(leadMatch[2] ?? '');
    } else {
      const trailMatch = trailingRe.exec(line);
      if (trailMatch && !/https?:\/\//i.test(trailMatch[1])) {
        timeSec = parseTimestampToken(trailMatch[2]);
        title = cleanChapterTitle(trailMatch[1]);
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
