import type { FrameMapEntry, InternalScene, SceneReason } from '../types/video';
import { createId, findFrameIndexByTime } from './timecode';
import { translate } from '../i18n';

interface AudioEnvelope {
  windowSec: number;
  rms: Float32Array;
  maxRms: number;
}

/**
 * Decodes audio track (for files <= 200MB) and extracts an RMS energy envelope
 * to detect silence-to-speech transitions and sudden audio energy shifts.
 */
async function extractAudioEnvelope(
  file: File,
  signal: AbortSignal
): Promise<AudioEnvelope | null> {
  if (file.size > 200 * 1024 * 1024) {
    return null;
  }
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let ctx: AudioContext | null = null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (signal.aborted) return null;

    ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (signal.aborted) return null;

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSec = 0.25;
    const samplesPerWindow = Math.max(1, Math.floor(sampleRate * windowSec));
    const windowCount = Math.ceil(channelData.length / samplesPerWindow);
    const rms = new Float32Array(windowCount);
    let maxRms = 1e-6;

    for (let w = 0; w < windowCount; w++) {
      const start = w * samplesPerWindow;
      const end = Math.min(channelData.length, start + samplesPerWindow);
      let sumSq = 0;
      // Subsample step 4 for speed on long tracks
      const step = 4;
      let count = 0;
      for (let i = start; i < end; i += step) {
        const s = channelData[i];
        sumSq += s * s;
        count++;
      }
      const val = count > 0 ? Math.sqrt(sumSq / count) : 0;
      rms[w] = val;
      if (val > maxRms) maxRms = val;
    }

    return { windowSec, rms, maxRms };
  } catch {
    // Video might have no audio track or unsupported codec for WebAudio decode
    return null;
  } finally {
    if (ctx) {
      ctx.close().catch(() => {});
    }
  }
}

/**
 * Computes normalized audio transition delta at a given timestamp.
 * Detects silence-to-sound onsets and abrupt loudness jumps.
 */
function computeAudioChangeScore(envelope: AudioEnvelope | null, timeSec: number): number {
  if (!envelope || envelope.rms.length < 4) return 0;
  const idx = Math.floor(timeSec / envelope.windowSec);
  if (idx < 2 || idx >= envelope.rms.length - 1) return 0;

  const norm = envelope.maxRms;
  const prevAvg = (envelope.rms[idx - 2] + envelope.rms[idx - 1]) * 0.5 / norm;
  const currAvg = (envelope.rms[idx] + envelope.rms[idx + 1]) * 0.5 / norm;

  const absDiff = Math.abs(currAvg - prevAvg);
  // Silence-to-speech onset bonus
  const onsetBonus = prevAvg < 0.06 && currAvg > 0.18 ? 0.25 : 0;
  return Math.min(1, absDiff * 1.4 + onsetBonus);
}

function seekVideoOnce(video: HTMLVideoElement, targetSec: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const clamped = Math.max(0, Math.min(Math.max(0, video.duration - 0.01), targetSec));
    if (Math.abs(video.currentTime - clamped) < 0.002 && video.readyState >= 2) {
      resolve(true);
      return;
    }

    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve(ok);
    };

    const onSeeked = () => finish(true);
    const onError = () => finish(false);
    const timeoutId = window.setTimeout(() => finish(false), 1800);

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });

    try {
      video.currentTime = clamped;
    } catch {
      finish(false);
    }
  });
}

interface FrameVisualSignature {
  lumaGrid: Uint8Array;
  colorHist: Float32Array; // 24-bin normalized RGB histogram (8 bins per channel)
}

function captureVisualSignature(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): FrameVisualSignature {
  ctx.drawImage(video, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height).data;
  const pixelCount = width * height;
  const lumaGrid = new Uint8Array(pixelCount);
  const colorHist = new Float32Array(24);

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    const r = img[i];
    const g = img[i + 1];
    const b = img[i + 2];
    lumaGrid[p] = (r * 77 + g * 150 + b * 29) >> 8;
    colorHist[r >> 5] += 1;
    colorHist[8 + (g >> 5)] += 1;
    colorHist[16 + (b >> 5)] += 1;
  }

  const inv = 1 / (pixelCount * 3);
  for (let h = 0; h < 24; h++) {
    colorHist[h] *= inv;
  }

  return { lumaGrid, colorHist };
}

/**
 * Computes combined visual cut delta (0..1) using spatial luminance L1 + RGB histogram distance.
 */
function compareVisualSignatures(a: FrameVisualSignature, b: FrameVisualSignature): number {
  let lumaDiffSum = 0;
  const len = a.lumaGrid.length;
  for (let i = 0; i < len; i++) {
    lumaDiffSum += Math.abs(a.lumaGrid[i] - b.lumaGrid[i]);
  }
  const lumaScore = lumaDiffSum / (len * 255);

  let histDiffSum = 0;
  for (let h = 0; h < 24; h++) {
    histDiffSum += Math.abs(a.colorHist[h] - b.colorHist[h]);
  }
  // Max L1 distance of normalized 3-channel histogram is 2.0
  const histScore = histDiffSum * 0.5;

  return Math.min(1, lumaScore * 0.55 + histScore * 0.65);
}

export interface SceneDetectCallbacks {
  onProgress: (percent: number, scenes: InternalScene[]) => void;
  onComplete: (scenes: InternalScene[]) => void;
  onError: (message: string) => void;
}

/**
 * Step 3: Background visual + audio scene change detection.
 * Snaps every discovered scene strictly onto the Frame Correspondence List and refines cuts to exact frames.
 */
export async function detectInternalScenesInBackground(
  file: File,
  objectUrl: string,
  getFrameMap: () => FrameMapEntry[],
  durationSec: number,
  callbacks: SceneDetectCallbacks,
  signal: AbortSignal
): Promise<void> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const cleanup = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  };

  try {
    // Load hidden video element for frame sampling
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('aborted'));
        return;
      }
      const onLoaded = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onErr);
        resolve();
      };
      const onErr = () => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('error', onErr);
        reject(new Error(translate('errors.sceneVideoLoadFailed')));
      };
      video.addEventListener('loadeddata', onLoaded, { once: true });
      video.addEventListener('error', onErr, { once: true });
      video.src = objectUrl;
    });

    if (signal.aborted) {
      cleanup();
      return;
    }

    // Start audio envelope extraction alongside setup
    const audioEnvelope = await extractAudioEnvelope(file, signal);
    if (signal.aborted) {
      cleanup();
      return;
    }

    const sampleW = 64;
    const sampleH = 36;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error(translate('errors.sceneCanvasInitFailed'));
    }

    const effectiveDuration = Math.max(0.1, durationSec || video.duration || 0);
    // Adaptive sample step: fine granularity on short/medium videos, bounded total seeks on multi-hour videos
    let stepSec = 0.4;
    if (effectiveDuration > 3600) stepSec = effectiveDuration / 450;
    else if (effectiveDuration > 900) stepSec = effectiveDuration / 360;
    else if (effectiveDuration > 180) stepSec = 1.0;
    else if (effectiveDuration > 45) stepSec = 0.6;
    else if (effectiveDuration < 12) stepSec = 0.25;

    const sampleTimes: number[] = [];
    for (let t = 0; t < effectiveDuration - 0.05; t += stepSec) {
      sampleTimes.push(t);
    }
    if (sampleTimes.length === 0) sampleTimes.push(0);

    const discovered: InternalScene[] = [];
    const minSceneGapSec = Math.max(1.2, Math.min(3.0, stepSec * 2.2));
    const visualThreshold = 0.22;
    const audioThreshold = 0.46;

    // Always register initial scene at Frame 0
    const initialFrames = getFrameMap();
    const firstFrame = initialFrames[0] ?? { frameIndex: 0, timeSec: 0, durationSec: 1 / 30 };
    discovered.push({
      id: createId('scene'),
      sceneNumber: 1,
      frameIndex: firstFrame.frameIndex,
      timeSec: firstFrame.timeSec,
      reason: 'visual',
      score: 1,
      visualDelta: 1,
      audioDelta: 0,
    });
    callbacks.onProgress(2, discovered.slice());

    let prevSig: FrameVisualSignature | null = null;
    let prevTime = 0;

    for (let i = 0; i < sampleTimes.length; i++) {
      if (signal.aborted) {
        cleanup();
        return;
      }

      const targetTime = sampleTimes[i];
      const ok = await seekVideoOnce(video, targetTime, signal);
      if (signal.aborted) {
        cleanup();
        return;
      }
      if (!ok) continue;

      const sig = captureVisualSignature(video, ctx, sampleW, sampleH);

      if (prevSig !== null) {
        const visualDelta = compareVisualSignatures(prevSig, sig);
        const audioDelta = computeAudioChangeScore(audioEnvelope, targetTime);

        const isVisualHit = visualDelta >= visualThreshold;
        const isAudioHit = audioDelta >= audioThreshold;

        if (isVisualHit || isAudioHit) {
          let exactTime = targetTime;

          // Binary-search refine visual cut down to the exact frame in the Frame Correspondence List!
          if (isVisualHit && targetTime - prevTime > 0.08) {
            let loT = prevTime;
            let hiT = targetTime;
            let loSig = prevSig;
            for (let iter = 0; iter < 3; iter++) {
              const midT = (loT + hiT) * 0.5;
              const seekOk = await seekVideoOnce(video, midT, signal);
              if (signal.aborted) {
                cleanup();
                return;
              }
              if (!seekOk) break;
              const midSig = captureVisualSignature(video, ctx, sampleW, sampleH);
              const dLeft = compareVisualSignatures(loSig, midSig);
              const dRight = compareVisualSignatures(midSig, sig);
              if (dLeft >= dRight) {
                hiT = midT;
              } else {
                loT = midT;
                loSig = midSig;
              }
            }
            exactTime = hiT;
          }

          const currentFrames = getFrameMap();
          const snappedIdx =
            currentFrames.length > 0 ? findFrameIndexByTime(currentFrames, exactTime) : Math.round(exactTime * 30);
          const snappedEntry = currentFrames[snappedIdx];
          const finalTime = snappedEntry ? snappedEntry.timeSec : exactTime;
          const finalFrameIdx = snappedEntry ? snappedEntry.frameIndex : snappedIdx;

          const lastScene = discovered[discovered.length - 1];
          if (!lastScene || finalTime - lastScene.timeSec >= minSceneGapSec) {
            const reason: SceneReason =
              isVisualHit && isAudioHit ? 'both' : isVisualHit ? 'visual' : 'audio';
            const score = Math.min(1, Math.max(visualDelta, audioDelta));

            discovered.push({
              id: createId('scene'),
              sceneNumber: discovered.length + 1,
              frameIndex: finalFrameIdx,
              timeSec: finalTime,
              reason,
              score,
              visualDelta,
              audioDelta,
            });
          } else if (lastScene && Math.max(visualDelta, audioDelta) > lastScene.score) {
            // If a stronger cut occurred inside the minimum gap window, update to the sharper peak
            lastScene.frameIndex = finalFrameIdx;
            lastScene.timeSec = finalTime;
            lastScene.score = Math.min(1, Math.max(visualDelta, audioDelta));
            lastScene.visualDelta = Math.max(lastScene.visualDelta, visualDelta);
            lastScene.audioDelta = Math.max(lastScene.audioDelta, audioDelta);
            lastScene.reason =
              lastScene.visualDelta >= visualThreshold && lastScene.audioDelta >= audioThreshold
                ? 'both'
                : lastScene.visualDelta >= visualThreshold
                  ? 'visual'
                  : 'audio';
          }
        }
      }

      prevSig = sig;
      prevTime = targetTime;

      const percent = Math.min(99, Math.max(2, Math.round(((i + 1) / sampleTimes.length) * 100)));
      if (i % 2 === 0 || i === sampleTimes.length - 1) {
        callbacks.onProgress(percent, discovered.slice());
      }

      // Yield briefly to keep playback and editing responsive at 60fps
      await new Promise<void>((r) => setTimeout(r, 8));
    }

    if (signal.aborted) {
      cleanup();
      return;
    }

    // Re-number chronologically just in case
    discovered.sort((a, b) => a.timeSec - b.timeSec);
    discovered.forEach((s, idx) => {
      s.sceneNumber = idx + 1;
    });

    callbacks.onProgress(100, discovered.slice());
    callbacks.onComplete(discovered);
    cleanup();
  } catch (err) {
    cleanup();
    if (!signal.aborted) {
      callbacks.onError(err instanceof Error ? err.message : translate('errors.sceneDetectGenericError'));
    }
  }
}
