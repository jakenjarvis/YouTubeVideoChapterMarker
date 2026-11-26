import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeVideoId,
  parseChaptersFromDescription,
} from '../src/utils/youtube.ts';

describe('extractYouTubeVideoId', () => {
  const ID = 'dQw4w9WgXcQ';

  it('extracts valid 11-character video IDs from standard YouTube URL formats', () => {
    assert.equal(extractYouTubeVideoId(ID), ID);
    assert.equal(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}`), ID);
    assert.equal(extractYouTubeVideoId(`https://youtube.com/watch?v=${ID}&t=42s&list=PL123`), ID);
    assert.equal(extractYouTubeVideoId(`https://m.youtube.com/watch?v=${ID}`), ID);
    assert.equal(extractYouTubeVideoId(`https://music.youtube.com/watch?v=${ID}`), ID);
    assert.equal(extractYouTubeVideoId(`https://youtu.be/${ID}?si=abcdef`), ID);
    assert.equal(extractYouTubeVideoId(`youtu.be/${ID}`), ID);
    assert.equal(extractYouTubeVideoId(`https://www.youtube.com/embed/${ID}`), ID);
    assert.equal(extractYouTubeVideoId(`https://www.youtube-nocookie.com/embed/${ID}`), ID);
    assert.equal(extractYouTubeVideoId(`https://www.youtube.com/shorts/${ID}`), ID);
    assert.equal(extractYouTubeVideoId(`https://www.youtube.com/live/${ID}`), ID);
  });

  it('rejects non-YouTube hosts, dangerous schemes, and malformed IDs (SSRF guard)', () => {
    assert.equal(extractYouTubeVideoId(''), null);
    assert.equal(extractYouTubeVideoId('shortid'), null);
    assert.equal(extractYouTubeVideoId('toolongid12345'), null);
    assert.equal(extractYouTubeVideoId(`https://evil.com/watch?v=${ID}`), null);
    assert.equal(extractYouTubeVideoId(`https://youtube.com.evil.com/watch?v=${ID}`), null);
    assert.equal(extractYouTubeVideoId(`https://notyoutube.com/watch?v=${ID}`), null);
    assert.equal(extractYouTubeVideoId(`javascript:alert(1)`), null);
    assert.equal(extractYouTubeVideoId(`file:///etc/passwd`), null);
    assert.equal(extractYouTubeVideoId('http://127.0.0.1:3000/api'), null);
  });
});

describe('parseChaptersFromDescription', () => {
  it('extracts chapters from a realistic YouTube description while skipping prose and URLs', () => {
    const description = [
      'ご視聴ありがとうございます！',
      '詳細はこちら: https://example.com/guide',
      '',
      '▼ 目次',
      '00:00 星々の幻境 ドットーレの地下室(21) プレイ[J]',
      '04:56 - 星々の幻境 Elemental Bastion TD プレイ[J]',
      '1. 12:30 番号付きセクション',
      '15:00 - 18:00 範囲指定セクション',
      'エンディング (25:10)',
      '',
      '#YouTube #Chapter',
    ].join('\n');

    const chapters = parseChaptersFromDescription(description, 2000);
    assert.deepEqual(chapters, [
      { timeSec: 0, title: '星々の幻境 ドットーレの地下室(21) プレイ[J]' },
      { timeSec: 296, title: '星々の幻境 Elemental Bastion TD プレイ[J]' },
      { timeSec: 750, title: '番号付きセクション' },
      { timeSec: 900, title: '範囲指定セクション' },
      { timeSec: 1510, title: 'エンディング' },
    ]);
  });

  it('deduplicates timestamps, filters past duration, and sorts chronologically', () => {
    const description = [
      '02:00 Second',
      '00:00 First',
      '02:00 Duplicate Second',
      '99:00 Beyond Duration',
    ].join('\n');

    const chapters = parseChaptersFromDescription(description, 300);
    assert.deepEqual(chapters, [
      { timeSec: 0, title: 'First' },
      { timeSec: 120, title: 'Second' },
    ]);
  });
});
