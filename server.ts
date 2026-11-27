import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractYouTubeVideoId,
  parseChaptersFromDescription,
  type ParsedYouTubeChapter,
  type YouTubeVideoInfoResponse,
} from './src/utils/youtube.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Extracts a balanced JSON object starting right after a given marker in HTML/JS text.
 * Handles string literals and escape sequences cleanly so nested braces never truncate JSON.
 */
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

/**
 * Recursively locates YouTube's structured chapterRenderer entries inside ytInitialData
 * as a fallback when description text has no explicit timestamp lines.
 */
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
            .map((r) => (r && typeof r === 'object' && typeof (r as Record<string, unknown>).text === 'string' ? (r as Record<string, unknown>).text : ''))
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

/**
 * Extracts the full video description text from ytInitialData (works even when ytInitialPlayerResponse is gated).
 */
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

class YouTubeApiError extends Error {
  code: 'INVALID_YOUTUBE_URL' | 'YOUTUBE_VIDEO_NOT_FOUND' | 'YOUTUBE_LOAD_FAILED';

  constructor(
    code: 'INVALID_YOUTUBE_URL' | 'YOUTUBE_VIDEO_NOT_FOUND' | 'YOUTUBE_LOAD_FAILED',
    message: string
  ) {
    super(message);
    this.code = code;
  }
}

function sanitizeYouTubeHl(raw: string): string {
  const trimmed = raw.trim();
  return /^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(trimmed) ? trimmed : 'ja';
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
  let warningCode: YouTubeVideoInfoResponse['warningCode'];
  let warningDetail: string | undefined;

  try {
    const resp = await fetch(watchUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': `${safeHl},en-US;q=0.9,en;q=0.8`,
        Cookie: 'CONSENT=YES+cb; SOCS=CAI',
      },
    });

    if (resp.ok) {
      const html = await resp.text();
      // Guard against oversized responses
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

        // Inspect streamingData for real resolution, fps, and codecs
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

      // If ytInitialPlayerResponse lacked description (e.g. cloud IP login gate), extract from ytInitialData
      if (!description && initialData) {
        description = extractDescriptionFromInitialData(initialData);
      }

      // Extract chapters from description first (primary requested source)
      if (description) {
        const descChapters = parseChaptersFromDescription(description, durationSec || undefined);
        if (descChapters.length > 0) {
          chapters = descChapters;
          chapterSource = 'description';
        }
      }

      // Fallback: check ytInitialData structured chapters if description had none
      if (chapters.length === 0 && initialData) {
        const structured = extractStructuredYouTubeChapters(initialData);
        if (structured.length > 0) {
          chapters = structured;
          chapterSource = 'youtube-chapters';
        }
      }

      // Clear non-actionable gate warning when we successfully obtained description or chapters
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

  // Fallback to official oEmbed API for title & author if watch page parsing was blocked
  if (!title) {
    try {
      const oembedResp = await fetch(oembedUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
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

async function startServer() {
  const app = express();
  app.disable('x-powered-by');

  // Read-only YouTube metadata & description chapter extraction endpoint
  app.get('/api/youtube/info', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const rawHl = typeof req.query.hl === 'string' ? req.query.hl : 'ja';
    const videoId = extractYouTubeVideoId(rawUrl);
    if (!videoId) {
      res.status(400).json({
        errorCode: 'INVALID_YOUTUBE_URL',
        error: '有効なYouTubeのURLまたは動画IDを入力してください（例: https://www.youtube.com/watch?v=...）。',
      });
      return;
    }

    try {
      const info = await fetchYouTubeVideoInfo(videoId, rawHl);
      res.json(info);
    } catch (err) {
      const errorCode =
        err instanceof YouTubeApiError ? err.code : 'YOUTUBE_LOAD_FAILED';
      const message =
        err instanceof YouTubeApiError
          ? err.message
          : 'YouTube動画の読み込み中にエラーが発生しました。';
      res.status(502).json({ errorCode, error: message });
    }
  });

  const httpServer = http.createServer(app);

  if (!IS_PROD) {
    // Serve static SEO & public assets (favicon.svg, og-image.png, robots.txt, sitemap.xml)
    // because vite.config.ts sets publicDir: false.
    const publicDir = path.resolve(__dirname, 'public');
    if (fs.existsSync(publicDir)) {
      app.use(express.static(publicDir));
    }

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      const localeMatch = /^\/([a-z]{2}(?:-[a-z]{2,4})?)(?:\/|$)/i.exec(req.path);
      if (localeMatch) {
        const localeIndex = path.resolve(distDir, localeMatch[1].toLowerCase(), 'index.html');
        if (localeIndex.startsWith(distDir + path.sep) && fs.existsSync(localeIndex)) {
          res.sendFile(localeIndex);
          return;
        }
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`YouTube Video Chapter Marker server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
