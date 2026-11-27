import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../api/youtube/info.ts';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function buildRequest(query: string): Request {
  return new Request(`https://example.test/api/youtube/info${query}`, { method: 'GET' });
}

describe('GET /api/youtube/info — adversarial boundary & SSRF isolation tests', () => {
  const rejectedQueries: ReadonlyArray<[string, string]> = [
    ['missing url param', ''],
    ['empty url param', '?url='],
    ['loopback IPv4', '?url=http%3A%2F%2F127.0.0.1%2Fwatch%3Fv%3DdQw4w9WgXcQ'],
    ['AWS/GCP metadata endpoint', '?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data%2F'],
    ['credential userinfo spoof', '?url=https%3A%2F%2Fuser%3Apass%40www.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ'],
    ['non-standard port', '?url=https%3A%2F%2Fwww.youtube.com%3A8443%2Fwatch%3Fv%3DdQw4w9WgXcQ'],
    ['spoofed domain', '?url=https%3A%2F%2Fyoutube.com.evil.test%2Fwatch%3Fv%3DdQw4w9WgXcQ'],
    ['path traversal on youtu.be', '?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ%2F..%2F..%2Fadmin'],
    ['CRLF in url param', '?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ%0d%0aX-Test%3A1'],
    ['oversized url param', `?url=${'a'.repeat(2500)}`],
  ];

  for (const [label, query] of rejectedQueries) {
    it(`returns 400 INVALID_YOUTUBE_URL and makes ZERO outbound fetch calls for ${label}`, async () => {
      // Arrange
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls++;
        throw new Error('fetch should never be called for invalid URLs');
      }) as typeof fetch;

      // Act
      const res = await GET(buildRequest(query));
      const body = (await res.json()) as Record<string, unknown>;

      // Assert
      assert.equal(res.status, 400);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.equal(body.errorCode, 'INVALID_YOUTUBE_URL');
      assert.equal(fetchCalls, 0, 'Must never perform outbound network requests for invalid URLs');
    });
  }

  it('sanitizes hostile hl parameters to prevent header/query injection', async () => {
    // Arrange
    const capturedRequests: Array<{ url: string; acceptLanguage: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      capturedRequests.push({
        url,
        acceptLanguage: headers.get('Accept-Language') ?? '',
      });
      if (url.includes('/oembed')) {
        return new Response(JSON.stringify({ title: 'Mock Title', author_name: 'Mock Author' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('<html></html>', { status: 200 });
    }) as typeof fetch;

    const hostileHlValues = [
      'en%0d%0aX-Injected%3A%201',
      'ja%26evil%3D1',
      '..%2F..%2Fetc%2Fpasswd',
      'not-a-valid-locale-tag-12345',
    ];

    // Act & Assert
    for (const badHl of hostileHlValues) {
      capturedRequests.length = 0;
      const res = await GET(buildRequest(`?url=dQw4w9WgXcQ&hl=${badHl}`));
      assert.equal(res.status, 200);
      const watchCall = capturedRequests[0];
      assert.ok(watchCall, 'Expected watch fetch call');
      assert.equal(watchCall.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&hl=ja');
      assert.ok(!/[\r\n]/.test(watchCall.acceptLanguage));
      assert.ok(watchCall.acceptLanguage.startsWith('ja,'));
    }
  });
});

describe('GET /api/youtube/info — hostile upstream HTML & failure resilience', () => {
  it('parses valid watch page with mixed chapter formats and keeps XSS payloads inert in JSON', async () => {
    // Arrange
    const mockPlayerResponse = {
      videoDetails: {
        title: '<script>alert(1)</script> Demo Video',
        author: 'Channel "A"',
        lengthSeconds: '600',
        shortDescription: [
          '1. 0:00 - Intro <img src=x onerror=alert(1)>',
          '01:30 - 02:00 Range Chapter',
          'Trailing Title (04:00)',
        ].join('\n'),
      },
      streamingData: {
        adaptiveFormats: [
          { mimeType: 'video/mp4; codecs="avc1.640028"', width: 1920, height: 1080, fps: 60 },
          { mimeType: 'audio/mp4; codecs="mp4a.40.2"' },
        ],
      },
    };
    const html = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(mockPlayerResponse)};</script></html>`;

    globalThis.fetch = (async () => new Response(html, { status: 200 })) as typeof fetch;

    // Act
    const res = await GET(
      buildRequest('?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&hl=en')
    );
    const data = (await res.json()) as Record<string, unknown>;

    // Assert
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(data.videoId, 'dQw4w9WgXcQ');
    assert.equal(data.title, '<script>alert(1)</script> Demo Video');
    assert.equal(data.durationSec, 600);
    assert.equal(data.width, 1920);
    assert.equal(data.height, 1080);
    assert.equal(data.fps, 60);
    assert.equal(data.chapterSource, 'description');
    assert.deepEqual(data.chapters, [
      { timeSec: 0, title: 'Intro <img src=x onerror=alert(1)>' },
      { timeSec: 90, title: 'Range Chapter' },
      { timeSec: 240, title: 'Trailing Title' },
    ]);
  });

  it('survives truncated/malformed JSON, deeply nested ytInitialData, and >6MB HTML without crashing', async () => {
    // Arrange: deeply nested object (depth 40) inside >6MB response + broken ytInitialPlayerResponse
    let deep: Record<string, unknown> = {
      attributedDescription: { content: '0:00 Should be skipped by depth guard' },
    };
    for (let i = 0; i < 40; i++) {
      deep = { child: deep };
    }
    const hostileHtml =
      'var ytInitialPlayerResponse = {"videoDetails": {"title": "unclosed' +
      ' '.repeat(100) +
      `var ytInitialData = ${JSON.stringify(deep)};` +
      'x'.repeat(6_200_000);

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oembed')) {
        return new Response(JSON.stringify({ title: 'Recovered via oEmbed', author_name: 'Author' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(hostileHtml, { status: 200 });
    }) as typeof fetch;

    // Act
    const res = await GET(buildRequest('?url=dQw4w9WgXcQ'));
    const data = (await res.json()) as Record<string, unknown>;

    // Assert
    assert.equal(res.status, 200);
    assert.equal(data.title, 'Recovered via oEmbed');
    assert.deepEqual(data.chapters, []);
  });

  it('returns 502 YOUTUBE_VIDEO_NOT_FOUND when watch page yields no metadata and oEmbed returns 404', async () => {
    // Arrange
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/oembed')) {
        return new Response('Not Found', { status: 404 });
      }
      return new Response('<html><body>unavailable</body></html>', { status: 200 });
    }) as typeof fetch;

    // Act
    const res = await GET(buildRequest('?url=dQw4w9WgXcQ'));
    const data = (await res.json()) as Record<string, unknown>;

    // Assert
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(data.errorCode, 'YOUTUBE_VIDEO_NOT_FOUND');
  });

  it('degrades gracefully with warningCode when upstream fetch throws a network error', async () => {
    // Arrange
    globalThis.fetch = (async () => {
      throw new TypeError('Simulated ECONNRESET secret internal socket detail');
    }) as typeof fetch;

    // Act
    const res = await GET(buildRequest('?url=dQw4w9WgXcQ'));
    const data = (await res.json()) as Record<string, unknown>;

    // Assert
    assert.equal(res.status, 200);
    assert.equal(data.isFallbackTitle, true);
    assert.equal(data.warningCode, 'YOUTUBE_DESCRIPTION_FETCH_FAILED');
    assert.ok(
      !JSON.stringify(data).includes('secret internal socket detail'),
      'Internal error details must never be leaked to API consumers'
    );
  });
});
