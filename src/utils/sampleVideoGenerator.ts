import { getActiveLocaleMeta, translate } from '../i18n';

/**
 * Draws text onto a Canvas 2D context with automatic line wrapping so longer languages
 * (English, German, French, etc.) and CJK strings never clip off the 960x540 slide canvas.
 */
function drawWrappedCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const words = text.split(' ');
  const lines: string[] = [];

  if (words.length > 1) {
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${currentLine} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);
  } else {
    // Character-based fallback for CJK/Thai/long compound words without spaces
    let currentLine = '';
    for (const ch of Array.from(text)) {
      const candidate = currentLine + ch;
      if (currentLine.length > 0 && ctx.measureText(candidate).width > maxWidth) {
        lines.push(currentLine);
        currentLine = ch;
      } else {
        currentLine = candidate;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  const clamped = lines.slice(0, maxLines);
  clamped.forEach((line, idx) => {
    ctx.fillText(line, x, y + idx * lineHeight, maxWidth);
  });
  return y + clamped.length * lineHeight;
}

/**
 * Generates a real local multi-scene sample video (WebM with visual slide cuts + WebAudio chimes)
 * in the browser so users can immediately test the entire analysis, scene detection, and chaptering workflow
 * even if they don't have a video file at hand.
 * Automatically renders slides using the active locale's language, font stack, and text direction.
 */
export async function generateSampleVideoFile(
  onProgress?: (percent: number) => void
): Promise<File> {
  const width = 960;
  const height = 540;
  const fps = 30;
  const durationSec = 15; // 5 distinct 3-second chapters

  const localeMeta = getActiveLocaleMeta();
  const isRtl = localeMeta.dir === 'rtl';
  const textAnchorX = isRtl ? width - 64 : 64;
  const maxTextWidth = width - 128;

  const scenes = [
    { start: 0, end: 3, bg: '#101828', accent: '#F59E0B', title: translate('sampleVideo.scene1Title'), sub: translate('sampleVideo.scene1Sub'), freq: 440 },
    { start: 3, end: 6, bg: '#1E1B2E', accent: '#38BDF8', title: translate('sampleVideo.scene2Title'), sub: translate('sampleVideo.scene2Sub'), freq: 523.25 },
    { start: 6, end: 9, bg: '#0F2622', accent: '#34D399', title: translate('sampleVideo.scene3Title'), sub: translate('sampleVideo.scene3Sub'), freq: 587.33 },
    { start: 9, end: 12, bg: '#2A1815', accent: '#FB7185', title: translate('sampleVideo.scene4Title'), sub: translate('sampleVideo.scene4Sub'), freq: 659.25 },
    { start: 12, end: 15, bg: '#151C2C', accent: '#A78BFA', title: translate('sampleVideo.scene5Title'), sub: translate('sampleVideo.scene5Sub'), freq: 783.99 },
  ];

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(translate('errors.canvasUnavailable'));

  const canvasStream = canvas.captureStream(fps);

  // Add subtle synthesized audio chimes at every scene change so audio scene detection can pick them up too
  let audioCtx: AudioContext | null = null;
  const combinedStream = new MediaStream();
  canvasStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));

  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      const dest = audioCtx.createMediaStreamDestination();
      const baseTime = audioCtx.currentTime + 0.05;

      scenes.forEach((sc) => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(sc.freq, baseTime + sc.start);
        gain.gain.setValueAtTime(0.0001, baseTime + sc.start);
        gain.gain.exponentialRampToValueAtTime(0.18, baseTime + sc.start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, baseTime + sc.start + 0.65);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(baseTime + sc.start);
        osc.stop(baseTime + sc.start + 0.7);
      });

      dest.stream.getAudioTracks().forEach((t) => combinedStream.addTrack(t));
    }
  } catch {
    // Proceed video-only if audio capture is unavailable
  }

  const mimeCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  const selectedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

  const recorder = new MediaRecorder(
    combinedStream,
    selectedMime ? { mimeType: selectedMime, videoBitsPerSecond: 2_500_000 } : undefined
  );

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const recordingDone = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: selectedMime || 'video/webm' }));
    recorder.onerror = () => reject(new Error(translate('errors.sampleGenFailedShort')));
  });

  recorder.start(200);

  const startMs = performance.now();
  let frameNum = 0;

  await new Promise<void>((resolve) => {
    const renderLoop = () => {
      const elapsedSec = (performance.now() - startMs) / 1000;
      if (elapsedSec >= durationSec) {
        onProgress?.(100);
        resolve();
        return;
      }

      onProgress?.(Math.min(99, Math.round((elapsedSec / durationSec) * 100)));

      const scene = scenes.find((s) => elapsedSec >= s.start && elapsedSec < s.end) ?? scenes[scenes.length - 1];
      const localProgress = (elapsedSec - scene.start) / (scene.end - scene.start);

      // Background
      ctx.fillStyle = scene.bg;
      ctx.fillRect(0, 0, width, height);

      // Geometric accent panels (high visual contrast between scenes)
      ctx.fillStyle = scene.accent;
      ctx.globalAlpha = 0.14;
      const barOffset = (scenes.indexOf(scene) % 2 === 0) ? 0 : width - 280;
      ctx.fillRect(barOffset, 0, 280, height);
      ctx.globalAlpha = 1;

      // Top accent line
      ctx.fillStyle = scene.accent;
      ctx.fillRect(isRtl ? width - 64 - 96 : 64, 72, 96, 6);

      // Locale-aware heading & subheading with automatic wrap protection
      ctx.direction = localeMeta.dir;
      ctx.textAlign = isRtl ? 'right' : 'left';

      ctx.fillStyle = '#F8FAFC';
      ctx.font = `bold 48px ${localeMeta.canvasFontFamily}`;
      const afterTitleY = drawWrappedCanvasText(
        ctx,
        scene.title,
        textAnchorX,
        182,
        maxTextWidth,
        58,
        2
      );

      ctx.fillStyle = '#CBD5E1';
      ctx.font = `25px ${localeMeta.canvasFontFamily}`;
      drawWrappedCanvasText(
        ctx,
        scene.sub,
        textAnchorX,
        afterTitleY + 12,
        maxTextWidth,
        34,
        2
      );

      // Animated progress strip inside current scene (always LTR time progression)
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(64, 344, width - 128, 8);
      ctx.fillStyle = scene.accent;
      ctx.fillRect(64, 344, (width - 128) * Math.max(0, Math.min(1, localProgress)), 8);

      // Burned-in reference timecode & frame number (strictly LTR)
      const secWhole = Math.floor(elapsedSec);
      const msPart = Math.floor((elapsedSec - secWhole) * 1000);
      const tc = `00:00:${String(secWhole).padStart(2, '0')}.${String(msPart).padStart(3, '0')}`;
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 28px "JetBrains Mono", monospace';
      ctx.fillText(
        translate('sampleVideo.overlayTimecode', {
          timecode: tc,
          frame: String(frameNum).padStart(4, '0'),
        }),
        64,
        height - 64
      );

      frameNum++;
      requestAnimationFrame(renderLoop);
    };

    requestAnimationFrame(renderLoop);
  });

  recorder.stop();
  const blob = await recordingDone;
  if (audioCtx) {
    audioCtx.close().catch(() => {});
  }
  combinedStream.getTracks().forEach((t) => t.stop());

  const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
  return new File([blob], translate('sampleVideo.defaultFileName', { ext }), {
    type: selectedMime || 'video/webm',
  });
}
