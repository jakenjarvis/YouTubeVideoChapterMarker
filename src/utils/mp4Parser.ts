import type { AudioTrackInfo, FrameMapEntry, VideoMetadata } from '../types/video';
import { translate } from '../i18n';

interface Mp4BoxHeader {
  type: string;
  size: number;
  headerSize: number;
  offset: number;
}

interface ParsedSttsEntry {
  count: number;
  delta: number;
}

interface ParsedCttsEntry {
  count: number;
  offset: number;
}

interface ParsedMp4Container {
  containerFormat: string;
  videoCodec: string;
  videoTimescale: number;
  videoDurationUnits: number;
  width: number;
  height: number;
  stts: ParsedSttsEntry[];
  ctts: ParsedCttsEntry[];
  syncSamples: Set<number>;
  audioTracks: AudioTrackInfo[];
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i++) {
    const code = view.getUint8(offset + i);
    out += code >= 32 && code <= 126 ? String.fromCharCode(code) : '';
  }
  return out;
}

function readUint64AsNumber(view: DataView, offset: number): number {
  const high = view.getUint32(offset, false);
  const low = view.getUint32(offset + 4, false);
  return high * 4294967296 + low;
}

function formatCodecName(fourcc: string): string {
  const map: Record<string, string> = {
    avc1: 'H.264 / AVC (avc1)',
    avc3: 'H.264 / AVC (avc3)',
    hvc1: 'H.265 / HEVC (hvc1)',
    hev1: 'H.265 / HEVC (hev1)',
    vp08: 'VP8 (vp08)',
    vp09: 'VP9 (vp09)',
    av01: 'AV1 (av01)',
    mp4v: 'MPEG-4 Part 2 (mp4v)',
    apch: 'Apple ProRes 422 HQ',
    apcn: 'Apple ProRes 422',
    apcs: 'Apple ProRes 422 LT',
    ap4h: 'Apple ProRes 4444',
    mp4a: 'AAC (mp4a)',
    Opus: 'Opus',
    fLaC: 'FLAC',
    'ac-3': 'Dolby Digital (AC-3)',
    'ec-3': 'Dolby Digital Plus (E-AC-3)',
    lpcm: 'Linear PCM',
    sowt: 'PCM 16-bit LE',
    twos: 'PCM 16-bit BE',
    alac: 'Apple Lossless (ALAC)',
  };
  return map[fourcc] ?? (fourcc || translate('metadata.unknownCodec'));
}

function formatBrandName(brand: string): string {
  const clean = brand.trim();
  if (clean === 'qt') return 'QuickTime (MOV)';
  if (clean === 'M4V' || clean === 'M4A') return `MP4 / ${clean}`;
  if (clean.startsWith('isom') || clean.startsWith('mp4') || clean.startsWith('avc') || clean === 'iso2') {
    return `MP4 (${clean})`;
  }
  if (clean.startsWith('3gp')) return `3GPP (${clean})`;
  return clean ? `ISO BMFF (${clean})` : 'MP4';
}

function decodeIsoLanguage(packed: number): string | undefined {
  const c1 = ((packed >> 10) & 0x1f) + 0x60;
  const c2 = ((packed >> 5) & 0x1f) + 0x60;
  const c3 = (packed & 0x1f) + 0x60;
  const lang = String.fromCharCode(c1, c2, c3);
  if (/^[a-z]{3}$/.test(lang) && lang !== 'und') return lang;
  return undefined;
}

async function readFileSlice(file: File, start: number, end: number): Promise<ArrayBuffer> {
  const clampedStart = Math.max(0, Math.min(file.size, start));
  const clampedEnd = Math.max(clampedStart, Math.min(file.size, end));
  return await file.slice(clampedStart, clampedEnd).arrayBuffer();
}

/**
 * Scans top-level ISO BMFF boxes via File.slice() so multi-GB files parse without reading mdat.
 */
async function scanMp4Container(file: File): Promise<ParsedMp4Container | null> {
  let offset = 0;
  let ftypBrand = '';
  let moovBuffer: ArrayBuffer | null = null;
  let safetyCounter = 0;

  while (offset + 8 <= file.size && safetyCounter < 512) {
    safetyCounter++;
    const headerBuf = await readFileSlice(file, offset, offset + 16);
    if (headerBuf.byteLength < 8) break;
    const hv = new DataView(headerBuf);
    let size = hv.getUint32(0, false);
    const type = readAscii(hv, 4, 4);
    let headerSize = 8;

    if (size === 1 && headerBuf.byteLength >= 16) {
      size = readUint64AsNumber(hv, 8);
      headerSize = 16;
    } else if (size === 0) {
      size = file.size - offset;
    }

    if (size < headerSize || !/^[\x20-\x7e]{4}$/.test(type)) {
      break;
    }

    if (type === 'ftyp') {
      const ftypBuf = await readFileSlice(file, offset + headerSize, offset + Math.min(size, 64));
      if (ftypBuf.byteLength >= 4) {
        ftypBrand = readAscii(new DataView(ftypBuf), 0, 4);
      }
    } else if (type === 'moov') {
      // Guard against absurdly huge moov (> 64MB)
      if (size <= 64 * 1024 * 1024) {
        moovBuffer = await readFileSlice(file, offset + headerSize, offset + size);
      }
      if (ftypBrand) break;
    }

    offset += size;
  }

  if (!moovBuffer) {
    return null;
  }

  const moovView = new DataView(moovBuffer);
  const traks = findChildBoxes(moovView, 0, moovView.byteLength, 'trak');

  let videoCodec = '';
  let videoTimescale = 0;
  let videoDurationUnits = 0;
  let width = 0;
  let height = 0;
  let stts: ParsedSttsEntry[] = [];
  let ctts: ParsedCttsEntry[] = [];
  const syncSamples = new Set<number>();
  const audioTracks: AudioTrackInfo[] = [];

  for (const trak of traks) {
    const mdia = findFirstChildBox(moovView, trak.offset + trak.headerSize, trak.offset + trak.size, 'mdia');
    if (!mdia) continue;

    const mdiaStart = mdia.offset + mdia.headerSize;
    const mdiaEnd = mdia.offset + mdia.size;

    const hdlr = findFirstChildBox(moovView, mdiaStart, mdiaEnd, 'hdlr');
    if (!hdlr || hdlr.size < hdlr.headerSize + 12) continue;
    const handlerType = readAscii(moovView, hdlr.offset + hdlr.headerSize + 8, 4);

    const mdhd = findFirstChildBox(moovView, mdiaStart, mdiaEnd, 'mdhd');
    let timescale = 0;
    let durationUnits = 0;
    let language: string | undefined;
    if (mdhd && mdhd.size >= mdhd.headerSize + 20) {
      const p = mdhd.offset + mdhd.headerSize;
      const version = moovView.getUint8(p);
      if (version === 1 && mdhd.size >= mdhd.headerSize + 32) {
        timescale = moovView.getUint32(p + 20, false);
        durationUnits = readUint64AsNumber(moovView, p + 24);
        if (mdhd.size >= mdhd.headerSize + 34) {
          language = decodeIsoLanguage(moovView.getUint16(p + 32, false));
        }
      } else {
        timescale = moovView.getUint32(p + 12, false);
        durationUnits = moovView.getUint32(p + 16, false);
        if (mdhd.size >= mdhd.headerSize + 22) {
          language = decodeIsoLanguage(moovView.getUint16(p + 20, false));
        }
      }
    }

    const minf = findFirstChildBox(moovView, mdiaStart, mdiaEnd, 'minf');
    if (!minf) continue;
    const stbl = findFirstChildBox(moovView, minf.offset + minf.headerSize, minf.offset + minf.size, 'stbl');
    if (!stbl) continue;

    const stblStart = stbl.offset + stbl.headerSize;
    const stblEnd = stbl.offset + stbl.size;

    if (handlerType === 'vide' && stts.length === 0) {
      videoTimescale = timescale;
      videoDurationUnits = durationUnits;

      // Parse stsd for video codec + dimensions
      const stsd = findFirstChildBox(moovView, stblStart, stblEnd, 'stsd');
      if (stsd && stsd.size >= stsd.headerSize + 16) {
        const entryOffset = stsd.offset + stsd.headerSize + 8;
        if (entryOffset + 8 <= stsd.offset + stsd.size) {
          const fourcc = readAscii(moovView, entryOffset + 4, 4);
          videoCodec = formatCodecName(fourcc);
          if (entryOffset + 36 <= stsd.offset + stsd.size) {
            width = moovView.getUint16(entryOffset + 32, false);
            height = moovView.getUint16(entryOffset + 34, false);
          }
        }
      }

      // Parse stts (Time-to-Sample)
      const sttsBox = findFirstChildBox(moovView, stblStart, stblEnd, 'stts');
      if (sttsBox && sttsBox.size >= sttsBox.headerSize + 8) {
        const p = sttsBox.offset + sttsBox.headerSize;
        const entryCount = moovView.getUint32(p + 4, false);
        const parsed: ParsedSttsEntry[] = [];
        for (let i = 0; i < entryCount; i++) {
          const ep = p + 8 + i * 8;
          if (ep + 8 > sttsBox.offset + sttsBox.size) break;
          const count = moovView.getUint32(ep, false);
          const delta = moovView.getUint32(ep + 4, false);
          parsed.push({ count, delta });
        }
        stts = parsed;
      }

      // Parse ctts (Composition Time Offset, handles B-frame reordering)
      const cttsBox = findFirstChildBox(moovView, stblStart, stblEnd, 'ctts');
      if (cttsBox && cttsBox.size >= cttsBox.headerSize + 8) {
        const p = cttsBox.offset + cttsBox.headerSize;
        const version = moovView.getUint8(p);
        const entryCount = moovView.getUint32(p + 4, false);
        const parsedCtts: ParsedCttsEntry[] = [];
        for (let i = 0; i < entryCount; i++) {
          const ep = p + 8 + i * 8;
          if (ep + 8 > cttsBox.offset + cttsBox.size) break;
          const count = moovView.getUint32(ep, false);
          const sampleOffset =
            version === 1 ? moovView.getInt32(ep + 4, false) : moovView.getUint32(ep + 4, false);
          parsedCtts.push({ count, offset: sampleOffset });
        }
        ctts = parsedCtts;
      }

      // Parse stss (Sync Sample / Keyframes, 1-based sample indices)
      const stssBox = findFirstChildBox(moovView, stblStart, stblEnd, 'stss');
      if (stssBox && stssBox.size >= stssBox.headerSize + 8) {
        const p = stssBox.offset + stssBox.headerSize;
        const entryCount = moovView.getUint32(p + 4, false);
        for (let i = 0; i < entryCount; i++) {
          const ep = p + 8 + i * 4;
          if (ep + 4 > stssBox.offset + stssBox.size) break;
          syncSamples.add(moovView.getUint32(ep, false) - 1);
        }
      }
    } else if (handlerType === 'soun') {
      const stsd = findFirstChildBox(moovView, stblStart, stblEnd, 'stsd');
      let codec = translate('metadata.audioGeneric');
      let channels: number | undefined;
      let sampleRate: number | undefined;

      if (stsd && stsd.size >= stsd.headerSize + 16) {
        const entryOffset = stsd.offset + stsd.headerSize + 8;
        if (entryOffset + 8 <= stsd.offset + stsd.size) {
          const fourcc = readAscii(moovView, entryOffset + 4, 4);
          codec = formatCodecName(fourcc);
          if (entryOffset + 36 <= stsd.offset + stsd.size) {
            channels = moovView.getUint16(entryOffset + 24, false);
            sampleRate = moovView.getUint16(entryOffset + 32, false);
          }
        }
      }
      audioTracks.push({
        index: audioTracks.length + 1,
        codec,
        channels: channels && channels > 0 ? channels : undefined,
        sampleRate: sampleRate && sampleRate > 0 ? sampleRate : timescale || undefined,
        language,
      });
    }
  }

  return {
    containerFormat: formatBrandName(ftypBrand),
    videoCodec: videoCodec || translate('metadata.unknownCodec'),
    videoTimescale,
    videoDurationUnits,
    width,
    height,
    stts,
    ctts,
    syncSamples,
    audioTracks,
  };
}

function findChildBoxes(view: DataView, start: number, end: number, targetType: string): Mp4BoxHeader[] {
  const results: Mp4BoxHeader[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset, false);
    const type = readAscii(view, offset + 4, 4);
    let headerSize = 8;
    if (size === 1 && offset + 16 <= end) {
      size = readUint64AsNumber(view, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end + 8) break;
    if (type === targetType) {
      results.push({ type, size: Math.min(size, end - offset), headerSize, offset });
    }
    offset += size;
  }
  return results;
}

function findFirstChildBox(view: DataView, start: number, end: number, targetType: string): Mp4BoxHeader | null {
  const boxes = findChildBoxes(view, start, end, targetType);
  return boxes.length > 0 ? boxes[0] : null;
}

/**
 * Sniffs WebM / Matroska EBML header to detect format & codecs cleanly.
 */
async function sniffWebmOrContainer(file: File): Promise<{
  containerFormat: string;
  videoCodec: string;
  audioTracks: AudioTrackInfo[];
  isEbml: boolean;
}> {
  const headBuf = await readFileSlice(file, 0, Math.min(file.size, 256 * 1024));
  const bytes = new Uint8Array(headBuf);
  const isEbml =
    bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;

  const ext = file.name.split('.').pop()?.toUpperCase() || '';
  if (!isEbml) {
    let container = ext || file.type || translate('metadata.videoGeneric');
    if (bytes.length >= 12) {
      const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (riff === 'RIFF') container = 'AVI (RIFF)';
      else if (riff === 'OggS') container = 'Ogg Media';
    }
    return {
      containerFormat: container,
      videoCodec: translate('metadata.browserDecoded'),
      audioTracks: [],
      isEbml: false,
    };
  }

  // Decode ASCII strings inside the first 256KB EBML header for DocType and CodecIDs
  let ascii = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    ascii += c >= 32 && c <= 126 ? String.fromCharCode(c) : ' ';
  }

  const containerFormat = ascii.includes('webm')
    ? 'WebM (EBML)'
    : ascii.includes('matroska')
      ? 'Matroska / MKV'
      : ext || translate('metadata.ebmlVideo');

  let videoCodec = translate('metadata.unknownCodec');
  if (ascii.includes('V_VP9')) videoCodec = 'VP9 (V_VP9)';
  else if (ascii.includes('V_VP8')) videoCodec = 'VP8 (V_VP8)';
  else if (ascii.includes('V_AV1')) videoCodec = 'AV1 (V_AV1)';
  else if (ascii.includes('V_MPEG4/ISO/AVC')) videoCodec = 'H.264 / AVC';
  else if (ascii.includes('V_MPEGH/ISO/HEVC')) videoCodec = 'H.265 / HEVC';

  const audioTracks: AudioTrackInfo[] = [];
  if (ascii.includes('A_OPUS')) audioTracks.push({ index: 1, codec: 'Opus' });
  else if (ascii.includes('A_VORBIS')) audioTracks.push({ index: 1, codec: 'Vorbis' });
  else if (ascii.includes('A_AAC')) audioTracks.push({ index: 1, codec: 'AAC' });
  else if (ascii.includes('A_FLAC')) audioTracks.push({ index: 1, codec: 'FLAC' });
  else if (ascii.includes('A_MPEG/L3')) audioTracks.push({ index: 1, codec: 'MP3' });

  return { containerFormat, videoCodec, audioTracks, isEbml: true };
}

/**
 * Loads basic metadata via a temporary detached HTMLVideoElement (duration, width, height, audio presence).
 */
export function probeBrowserVideoMetadata(objectUrl: string): Promise<{
  durationSec: number;
  width: number;
  height: number;
  hasAudioHint: boolean;
}> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;

    const cleanup = () => {
      v.removeAttribute('src');
      v.load();
    };

    v.onloadedmetadata = () => {
      // Handle WebM streams recorded without duration metadata (duration === Infinity)
      if (!Number.isFinite(v.duration) || v.duration === Infinity) {
        const handleSeeked = () => {
          v.removeEventListener('seeked', handleSeeked);
          const resolvedDuration = Number.isFinite(v.duration) ? v.duration : v.currentTime || 0;
          const anyV = v as unknown as {
            mozHasAudio?: boolean;
            webkitAudioDecodedByteCount?: number;
            audioTracks?: { length: number };
          };
          const hasAudioHint = Boolean(
            anyV.mozHasAudio ||
              (anyV.audioTracks && anyV.audioTracks.length > 0) ||
              (anyV.webkitAudioDecodedByteCount && anyV.webkitAudioDecodedByteCount > 0)
          );
          const width = v.videoWidth;
          const height = v.videoHeight;
          cleanup();
          resolve({ durationSec: resolvedDuration, width, height, hasAudioHint });
        };
        v.addEventListener('seeked', handleSeeked);
        v.currentTime = 1e7;
        return;
      }

      const anyV = v as unknown as {
        mozHasAudio?: boolean;
        webkitAudioDecodedByteCount?: number;
        audioTracks?: { length: number };
      };
      const hasAudioHint = Boolean(
        anyV.mozHasAudio ||
          (anyV.audioTracks && anyV.audioTracks.length > 0) ||
          (anyV.webkitAudioDecodedByteCount && anyV.webkitAudioDecodedByteCount > 0)
      );
      const res = {
        durationSec: v.duration || 0,
        width: v.videoWidth,
        height: v.videoHeight,
        hasAudioHint,
      };
      cleanup();
      resolve(res);
    };

    v.onerror = () => {
      cleanup();
      reject(new Error(translate('errors.videoPlayParseFailed')));
    };

    v.src = objectUrl;
  });
}

export interface FrameBuildCallbacks {
  onMetadataReady: (metadata: VideoMetadata) => void;
  onChunk: (frames: FrameMapEntry[], progressPercent: number, analyzedMaxTimeSec: number) => void;
  onComplete: (frames: FrameMapEntry[], finalMetadata: VideoMetadata) => void;
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Step 2: Parses container & browser metadata and constructs the exact Frame Correspondence List
 * asynchronously in non-blocking chunks (supporting VFR accurately and allowing background continuation after 3s).
 */
export async function analyzeVideoAndBuildFrameMap(
  file: File,
  objectUrl: string,
  callbacks: FrameBuildCallbacks,
  signal: AbortSignal
): Promise<void> {
  const [browserProbe, mp4Parsed] = await Promise.all([
    probeBrowserVideoMetadata(objectUrl),
    scanMp4Container(file).catch(() => null),
  ]);

  if (signal.aborted) return;

  // Case 1: MP4 / MOV with exact STTS (True VFR + CFR Frame Correspondence List)
  if (mp4Parsed && mp4Parsed.stts.length > 0 && mp4Parsed.videoTimescale > 0) {
    const timescale = mp4Parsed.videoTimescale;
    let totalSamples = 0;
    let totalDeltaUnits = 0;
    let minDelta = Infinity;
    let maxDelta = 0;

    for (const entry of mp4Parsed.stts) {
      totalSamples += entry.count;
      totalDeltaUnits += entry.count * entry.delta;
      if (entry.delta > 0) {
        if (entry.delta < minDelta) minDelta = entry.delta;
        if (entry.delta > maxDelta) maxDelta = entry.delta;
      }
    }

    const durationSec =
      browserProbe.durationSec > 0
        ? browserProbe.durationSec
        : totalDeltaUnits / timescale;

    const avgFps = durationSec > 0 && totalSamples > 0 ? totalSamples / durationSec : 30;
    const maxFps = minDelta < Infinity && minDelta > 0 ? timescale / minDelta : avgFps;
    const minFps = maxDelta > 0 ? timescale / maxDelta : avgFps;
    // Detect VFR when frame delta spread exceeds 2%
    const isVfr = minDelta < Infinity && maxDelta > 0 && (maxDelta - minDelta) / Math.max(1, minDelta) > 0.02;

    const audioTracks: AudioTrackInfo[] =
      mp4Parsed.audioTracks.length > 0
        ? mp4Parsed.audioTracks
        : browserProbe.hasAudioHint
          ? [{ index: 1, codec: translate('metadata.audioTrackFallback') }]
          : [];

    const metadata: VideoMetadata = {
      sourceType: 'local',
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'video/mp4',
      containerFormat: mp4Parsed.containerFormat,
      videoCodec: mp4Parsed.videoCodec,
      width: browserProbe.width || mp4Parsed.width,
      height: browserProbe.height || mp4Parsed.height,
      durationSec,
      averageFps: avgFps,
      minFps,
      maxFps,
      isVfr,
      estimatedTotalFrames: totalSamples,
      audioTracks,
      parseMethod: 'mp4-stts',
    };

    callbacks.onMetadataReady(metadata);

    // Build FrameMapEntry[] in chunks so large files never stall the UI thread
    // and smoothly transition to background mode if > 3s elapsed
    const frames: FrameMapEntry[] = [];
    let dtsUnits = 0;
    let sampleIdx = 0;

    // Expand CTTS cursor lazily
    let cttsIdx = 0;
    let cttsConsumed = 0;
    const hasCtts = mp4Parsed.ctts.length > 0;
    let minPtsOffset = 0;
    if (hasCtts) {
      // Find first few ctts offsets to normalize presentation start to 0
      minPtsOffset = mp4Parsed.ctts[0]?.offset ?? 0;
      for (let i = 0; i < Math.min(mp4Parsed.ctts.length, 32); i++) {
        if (mp4Parsed.ctts[i].offset < minPtsOffset) {
          minPtsOffset = mp4Parsed.ctts[i].offset;
        }
      }
    }

    const CHUNK_SIZE = 20000;
    let chunkCounter = 0;

    for (const entry of mp4Parsed.stts) {
      for (let c = 0; c < entry.count; c++) {
        let ptsOffset = 0;
        if (hasCtts && cttsIdx < mp4Parsed.ctts.length) {
          ptsOffset = mp4Parsed.ctts[cttsIdx].offset - minPtsOffset;
          cttsConsumed++;
          if (cttsConsumed >= mp4Parsed.ctts[cttsIdx].count) {
            cttsIdx++;
            cttsConsumed = 0;
          }
        }

        const ptsSec = Math.max(0, (dtsUnits + ptsOffset) / timescale);
        const durSec = Math.max(1e-4, entry.delta / timescale);
        frames.push({
          frameIndex: sampleIdx,
          timeSec: ptsSec,
          durationSec: durSec,
          isKeyFrame: mp4Parsed.syncSamples.size === 0 ? true : mp4Parsed.syncSamples.has(sampleIdx),
        });

        dtsUnits += entry.delta;
        sampleIdx++;
        chunkCounter++;

        if (chunkCounter >= CHUNK_SIZE) {
          chunkCounter = 0;
          if (signal.aborted) return;
          const pct = Math.min(99, Math.round((sampleIdx / Math.max(1, totalSamples)) * 100));
          const maxTime = frames[frames.length - 1]?.timeSec ?? 0;
          callbacks.onChunk(frames.slice(), pct, maxTime);
          await nextTick();
        }
      }
    }

    if (signal.aborted) return;

    // Sort by presentation timestamp if B-frame CTTS reordering exists, then re-assign sequential presentation frameIndex
    if (hasCtts) {
      frames.sort((a, b) => a.timeSec - b.timeSec);
      for (let i = 0; i < frames.length; i++) {
        frames[i].frameIndex = i;
        if (i < frames.length - 1) {
          const nextDelta = frames[i + 1].timeSec - frames[i].timeSec;
          if (nextDelta > 1e-4) {
            frames[i].durationSec = nextDelta;
          }
        }
      }
    }

    const finalMetadata: VideoMetadata = {
      ...metadata,
      estimatedTotalFrames: frames.length,
    };

    callbacks.onChunk(frames, 100, durationSec);
    callbacks.onComplete(frames, finalMetadata);
    return;
  }

  // Case 2: WebM / MKV / Other container formats
  const sniffed = await sniffWebmOrContainer(file);
  if (signal.aborted) return;

  // Estimate real FPS by sampling a few frames via requestVideoFrameCallback when supported
  const measured = await measureFallbackFps(objectUrl, browserProbe.durationSec, signal);
  if (signal.aborted) return;

  const durationSec = Math.max(0.05, browserProbe.durationSec);
  const fps = measured.averageFps;
  const totalFrames = Math.max(1, Math.round(durationSec * fps));

  const audioTracks: AudioTrackInfo[] =
    sniffed.audioTracks.length > 0
      ? sniffed.audioTracks
      : browserProbe.hasAudioHint
        ? [{ index: 1, codec: translate('metadata.audioTrackFallback') }]
        : [];

  const metadata: VideoMetadata = {
    sourceType: 'local',
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'video/*',
    containerFormat: sniffed.containerFormat,
    videoCodec: sniffed.videoCodec,
    width: browserProbe.width,
    height: browserProbe.height,
    durationSec,
    averageFps: fps,
    minFps: measured.minFps,
    maxFps: measured.maxFps,
    isVfr: measured.isVfr,
    estimatedTotalFrames: totalFrames,
    audioTracks,
    parseMethod: sniffed.isEbml ? 'webm-ebml' : 'browser-fallback',
  };

  callbacks.onMetadataReady(metadata);

  // Build progressive Frame Correspondence List in chunks
  const frames: FrameMapEntry[] = [];
  const frameDur = 1 / fps;
  const CHUNK_SIZE = 15000;

  for (let i = 0; i < totalFrames; i++) {
    const t = Math.min(durationSec, i * frameDur);
    frames.push({
      frameIndex: i,
      timeSec: t,
      durationSec: frameDur,
      isKeyFrame: i % Math.max(1, Math.round(fps)) === 0,
    });

    if (i === 299 || (i + 1) % CHUNK_SIZE === 0) {
      if (signal.aborted) return;
      const pct = Math.min(99, Math.round(((i + 1) / totalFrames) * 100));
      callbacks.onChunk(frames.slice(), pct, t);
      await nextTick();
    }
  }

  if (signal.aborted) return;
  callbacks.onChunk(frames, 100, durationSec);
  callbacks.onComplete(frames, { ...metadata, estimatedTotalFrames: frames.length });
}

/**
 * Builds a uniform Frame Correspondence List in non-blocking chunks (used for YouTube streams).
 */
export async function buildUniformFrameMap(
  durationSec: number,
  fps: number,
  onChunk: (frames: FrameMapEntry[], progressPercent: number, analyzedMaxTimeSec: number) => void,
  signal: AbortSignal
): Promise<FrameMapEntry[]> {
  const safeDuration = Math.max(1, durationSec);
  const safeFps = fps > 0 && fps <= 120 ? fps : 30;
  const totalFrames = Math.max(1, Math.round(safeDuration * safeFps));
  const frameDur = 1 / safeFps;
  const frames: FrameMapEntry[] = [];
  const CHUNK_SIZE = 25000;

  for (let i = 0; i < totalFrames; i++) {
    const t = Math.min(safeDuration, i * frameDur);
    frames.push({
      frameIndex: i,
      timeSec: t,
      durationSec: frameDur,
      isKeyFrame: i % Math.max(1, Math.round(safeFps)) === 0,
    });

    if (i === 299 || (i + 1) % CHUNK_SIZE === 0) {
      if (signal.aborted) return frames;
      const pct = Math.min(99, Math.round(((i + 1) / totalFrames) * 100));
      onChunk(frames.slice(), pct, t);
      await nextTick();
    }
  }

  if (!signal.aborted) {
    onChunk(frames, 100, safeDuration);
  }
  return frames;
}

/**
 * Samples initial playback frames with requestVideoFrameCallback to measure true FPS & VFR for non-MP4 files.
 */
function measureFallbackFps(
  objectUrl: string,
  durationSec: number,
  signal: AbortSignal
): Promise<{ averageFps: number; minFps: number; maxFps: number; isVfr: boolean }> {
  return new Promise((resolve) => {
    const fallback = { averageFps: 30, minFps: 30, maxFps: 30, isVfr: false };
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';

    const rvfc = (v as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void
      ) => number;
    }).requestVideoFrameCallback;

    if (!rvfc || durationSec < 0.25) {
      resolve(fallback);
      return;
    }

    let settled = false;
    const mediaTimes: number[] = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      v.pause();
      v.removeAttribute('src');
      v.load();

      if (mediaTimes.length >= 4) {
        const deltas: number[] = [];
        for (let i = 1; i < mediaTimes.length; i++) {
          const d = mediaTimes[i] - mediaTimes[i - 1];
          if (d > 0.004 && d < 0.25) deltas.push(d);
        }
        if (deltas.length >= 3) {
          const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          const minDelta = Math.min(...deltas);
          const maxDelta = Math.max(...deltas);
          const rawFps = 1 / avgDelta;
          // Snap very close to standard rates if CFR
          const standardRates = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
          const spread = (maxDelta - minDelta) / Math.max(0.001, avgDelta);
          const isVfr = spread > 0.12;
          let averageFps = rawFps;
          if (!isVfr) {
            for (const rate of standardRates) {
              if (Math.abs(rawFps - rate) / rate < 0.025) {
                averageFps = rate;
                break;
              }
            }
          }
          resolve({
            averageFps,
            minFps: Math.min(averageFps, 1 / maxDelta),
            maxFps: Math.max(averageFps, 1 / minDelta),
            isVfr,
          });
          return;
        }
      }
      resolve(fallback);
    };

    const timer = window.setTimeout(finish, 700);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        finish();
      },
      { once: true }
    );

    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      if (settled) return;
      if (mediaTimes.length === 0 || meta.mediaTime > mediaTimes[mediaTimes.length - 1] + 0.001) {
        mediaTimes.push(meta.mediaTime);
      }
      if (mediaTimes.length >= 12) {
        clearTimeout(timer);
        finish();
      } else {
        rvfc.call(v, onFrame);
      }
    };

    v.onloadeddata = () => {
      rvfc.call(v, onFrame);
      v.play().catch(() => {
        clearTimeout(timer);
        finish();
      });
    };

    v.onerror = () => {
      clearTimeout(timer);
      finish();
    };

    v.src = objectUrl;
  });
}
