/**
 * Vercel Serverless Function: Read-only YouTube metadata & description chapter extraction.
 * Endpoint: GET /api/youtube/info?url=<YouTube URL or 11-char Video ID>
 *
 * Self-contained with zero relative imports so it runs reliably under Vercel's Node ESM runtime
 * without cross-directory module resolution issues.
 */

export const config = {
  runtime: 'nodejs',
};

interface ParsedYouTubeChapter {
  timeSec: number;
  title: string;
}

type YouTubeApiErrorCode =
  | 'INVALID_YOUTUBE_URL'
  | 'YOUTUBE_VIDEO_NOT_FOUND'
  | 'YOUTUBE_LOAD_FAILED';

type YouTubeApiWarningCode =
  | 'YOUTUBE_RESTRICTED_WITH_REASON'
  | 'YOUTUBE_RESTRICTED_PRIVATE'
  | 'YOUTUBE_DESCRIPTION_FETCH_FAILED';

interface YouTubeVideoInfoResponse {
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

class YouTubeApiError extends Error {
  code: YouTubeApiErrorCode;

  constructor(code: YouTubeApiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function sanitizeYouTubeHl(raw: string): string {
  const trimmed = raw.trim();
  return /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(trimmed) ? trimmed : 'ja';
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

function extractYouTubeVideoId(rawInput: string): string | null {
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

function parseChaptersFromDescription(
  description: string,
  durationSec?: number
): ParsedYouTubeChapter[] {
  if (!description || !description.trim()) return [];

  const lines = description.split(/\r?\n/);
  const extracted: ParsedYouTubeChapter[] = [];
  const seenSeconds = new Set<number>();

  const leadingRe =
    /^(?:[•·・\-–—*▶►▷■□◆◇★☆●○]\s*)?(?:[\[(【『「]\s*)?(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?:\s*[\])】』」])?(?:[\s\u3000\-–—:：|｜/]+(.*))?$/;

  const trailingRe =
    /^(.+?)[\s\u3000\-–—|｜]+(?:[\[(【]\s*)?(\d{1,2}:[0-5]\d(?::[0-5]\d)?)(?:\s*[\])】])?$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
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

function extractJsonObjectAfterMarker(html: string, marker: string): unknown | null {
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;

  const startIdx = html.indexOf('{', markerIdx + marker.length);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = html.slice(startIdx, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function extractStructuredYouTubeChapters(data: unknown): ParsedYouTubeChapter[] {
  const results: ParsedYouTubeChapter[] = [];
  const seen = new Set<number>();

  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 24) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    const obj = node as Record<string, unknown>;
    if (obj.chapterRenderer && typeof obj.chapterRenderer === 'object') {
      const cr = obj.chapterRenderer as Record<string, unknown>;
      const startMsRaw = cr.timeRangeStartMillis;
      const startMs =
        typeof startMsRaw === 'number'
          ? startMsRaw
          : typeof startMsRaw === 'string'
            ? parseInt(startMsRaw, 10)
            : NaN;

      let title = '';
      if (cr.title && typeof cr.title === 'object') {
        const titleObj = cr.title as Record<string, unknown>;
        if (typeof titleObj.simpleText === 'string') {
          title = titleObj.simpleText.trim();
        } else if (Array.isArray(titleObj.runs)) {
          title = titleObj.runs
            .map((r) =>
              r && typeof r === 'object' && typeof (r as Record<string, unknown>).text === 'string'
                ? (r as Record<string, unknown>).text
                : ''
            )
            .join('')
            .trim();
        }
      }

      if (Number.isFinite(startMs) && startMs >= 0) {
        const timeSec = Math.floor(startMs / 1000);
        if (!seen.has(timeSec)) {
          seen.add(timeSec);
          results.push({ timeSec, title });
        }
      }
    }

    for (const key of Object.keys(obj)) {
      walk(obj[key], depth + 1);
    }
  };

  walk(data, 0);
  results.sort((a, b) => a.timeSec - b.timeSec);
  return results;
}

function extractDescriptionFromInitialData(data: unknown): string {
  let best = '';
  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 24) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    const attrDesc = obj.attributedDescription as Record<string, unknown> | undefined;
    if (attrDesc && typeof attrDesc.content === 'string' && attrDesc.content.length > best.length) {
      best = attrDesc.content;
    }
    const bodyText = obj.attributedDescriptionBodyText as Record<string, unknown> | undefined;
    if (bodyText && typeof bodyText.content === 'string' && bodyText.content.length > best.length) {
      best = bodyText.content;
    }
    for (const key of Object.keys(obj)) {
      walk(obj[key], depth + 1);
    }
  };
  walk(data, 0);
  return best;
}

function parseCodecLabel(mimeType: string | undefined, fallback: string): string {
  if (!mimeType) return fallback;
  const match = /codecs="([^"]+)"/i.exec(mimeType);
  if (!match) return fallback;
  const code = match[1].split(',')[0].trim();
  if (code.startsWith('avc1')) return `H.264 / AVC (${code.split('.')[0]})`;
  if (code.startsWith('vp9') || code.startsWith('vp09')) return 'VP9';
  if (code.startsWith('av01')) return 'AV1';
  if (code.startsWith('mp4a')) return 'AAC (mp4a)';
  if (code.toLowerCase().includes('opus')) return 'Opus';
  return code;
}

async function fetchYouTubeVideoInfo(videoId: string, hl = 'ja'): Promise<YouTubeVideoInfoResponse> {
  const safeHl = sanitizeYouTubeHl(hl);
  // Strictly hardcoded YouTube origin + pre-validated 11-char videoId (prevents SSRF)
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=${encodeURIComponent(safeHl)}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;

  let title = '';
  let author = '';
  let durationSec = 0;
  let width = 1920;
  let height = 1080;
  let fps = 30;
  let videoCodec = 'YouTube Stream';
  let audioCodec = 'AAC / Opus';
  let description = '';
  let chapters: ParsedYouTubeChapter[] = [];
  let chapterSource: YouTubeVideoInfoResponse['chapterSource'] = 'none';
  let warning: string | undefined;
  let warningCode: YouTubeApiWarningCode | undefined;
  let warningDetail: string | undefined;

  try {
    const resp = await fetch(watchUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(7000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': `${safeHl},en-US;q=0.9,en;q=0.8`,
        Cookie: 'CONSENT=YES+cb; SOCS=CAI',
      },
    });

    if (resp.ok) {
      const html = await resp.text();
      const safeHtml = html.length > 6_000_000 ? html.slice(0, 6_000_000) : html;

      const playerResp =
        (extractJsonObjectAfterMarker(safeHtml, 'var ytInitialPlayerResponse = ') as Record<string, unknown> | null) ||
        (extractJsonObjectAfterMarker(safeHtml, 'ytInitialPlayerResponse = ') as Record<string, unknown> | null);

      if (playerResp && typeof playerResp === 'object') {
        const playability = playerResp.playabilityStatus as Record<string, unknown> | undefined;
        const status = typeof playability?.status === 'string' ? playability.status : '';
        if (status === 'ERROR' || status === 'LOGIN_REQUIRED') {
          const reason = typeof playability?.reason === 'string' ? playability.reason : '';
          if (reason) {
            warningCode = 'YOUTUBE_RESTRICTED_WITH_REASON';
            warningDetail = reason;
            warning = `YouTubeの応答制限により一部の詳細を取得できませんでした（${reason}）`;
          } else {
            warningCode = 'YOUTUBE_RESTRICTED_PRIVATE';
            warning = 'この動画は非公開または年齢・ログイン制限により概要欄を取得できませんでした。';
          }
        }

        const details = playerResp.videoDetails as Record<string, unknown> | undefined;
        if (details) {
          if (typeof details.title === 'string') title = details.title;
          if (typeof details.author === 'string') author = details.author;
          if (typeof details.lengthSeconds === 'string' || typeof details.lengthSeconds === 'number') {
            const parsedDur = Number(details.lengthSeconds);
            if (Number.isFinite(parsedDur) && parsedDur > 0) durationSec = parsedDur;
          }
          if (typeof details.shortDescription === 'string') {
            description = details.shortDescription;
          }
        }

        const streaming = playerResp.streamingData as Record<string, unknown> | undefined;
        const adaptiveFormats = Array.isArray(streaming?.adaptiveFormats)
          ? (streaming.adaptiveFormats as Record<string, unknown>[])
          : [];
        const formats = Array.isArray(streaming?.formats)
          ? (streaming.formats as Record<string, unknown>[])
          : [];

        const allFormats = [...adaptiveFormats, ...formats];
        let bestVideoPixels = 0;
        for (const fmt of allFormats) {
          const mime = typeof fmt.mimeType === 'string' ? fmt.mimeType : '';
          if (mime.startsWith('video/')) {
            const w = typeof fmt.width === 'number' ? fmt.width : 0;
            const h = typeof fmt.height === 'number' ? fmt.height : 0;
            const f = typeof fmt.fps === 'number' ? fmt.fps : 0;
            if (w * h >= bestVideoPixels && w > 0 && h > 0) {
              bestVideoPixels = w * h;
              width = w;
              height = h;
              if (f > 0 && f <= 120) fps = f;
              videoCodec = parseCodecLabel(mime, 'YouTube Stream');
            }
          } else if (mime.startsWith('audio/') && audioCodec === 'AAC / Opus') {
            audioCodec = parseCodecLabel(mime, 'AAC / Opus');
          }
        }
      }

      const initialData =
        extractJsonObjectAfterMarker(safeHtml, 'var ytInitialData = ') ||
        extractJsonObjectAfterMarker(safeHtml, 'ytInitialData = ');

      if (!description && initialData) {
        description = extractDescriptionFromInitialData(initialData);
      }

      if (description) {
        const descChapters = parseChaptersFromDescription(description, durationSec || undefined);
        if (descChapters.length > 0) {
          chapters = descChapters;
          chapterSource = 'description';
        }
      }

      if (chapters.length === 0 && initialData) {
        const structured = extractStructuredYouTubeChapters(initialData);
        if (structured.length > 0) {
          chapters = structured;
          chapterSource = 'youtube-chapters';
        }
      }

      if (warning && (chapters.length > 0 || description.length > 0)) {
        warning = undefined;
        warningCode = undefined;
        warningDetail = undefined;
      }
    }
  } catch {
    warningCode = 'YOUTUBE_DESCRIPTION_FETCH_FAILED';
    warning = 'YouTubeページからの概要欄取得に失敗したため、基本情報のみで読み込みます。';
  }

  if (!title) {
    try {
      const oembedResp = await fetch(oembedUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(2500),
      });
      if (oembedResp.ok) {
        const oembed = (await oembedResp.json()) as Record<string, unknown>;
        if (typeof oembed.title === 'string') title = oembed.title;
        if (typeof oembed.author_name === 'string') author = oembed.author_name;
      } else if (oembedResp.status === 404 || oembedResp.status === 400) {
        throw new YouTubeApiError(
          'YOUTUBE_VIDEO_NOT_FOUND',
          '指定されたYouTube動画が見つかりませんでした。URLをご確認ください。'
        );
      }
    } catch (err) {
      if (err instanceof YouTubeApiError) {
        throw err;
      }
    }
  }

  let isFallbackTitle = false;
  if (!title) {
    isFallbackTitle = true;
    title = `YouTube Video (${videoId})`;
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    author,
    durationSec,
    width,
    height,
    fps,
    videoCodec,
    audioCodec,
    description,
    chapters,
    chapterSource,
    warning,
    warningCode,
    warningDetail,
    isFallbackTitle,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url);
  const rawUrl = reqUrl.searchParams.get('url') ?? '';
  const rawHl = reqUrl.searchParams.get('hl') ?? 'ja';
  const videoId = extractYouTubeVideoId(rawUrl);

  if (!videoId) {
    return jsonResponse(
      {
        errorCode: 'INVALID_YOUTUBE_URL',
        error:
          '有効なYouTubeのURLまたは動画IDを入力してください（例: https://www.youtube.com/watch?v=...）。',
      },
      400
    );
  }

  try {
    const info = await fetchYouTubeVideoInfo(videoId, rawHl);
    return jsonResponse(info, 200);
  } catch (err) {
    const errorCode =
      err instanceof YouTubeApiError ? err.code : 'YOUTUBE_LOAD_FAILED';
    const message =
      err instanceof Error ? err.message : 'YouTube動画の読み込み中にエラーが発生しました。';
    return jsonResponse({ errorCode, error: message }, 502);
  }
}
