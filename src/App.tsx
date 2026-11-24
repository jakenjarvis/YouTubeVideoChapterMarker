/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  FolderOpen,
  Keyboard,
  Volume2,
  VolumeX,
  Bookmark,
  Compass,
  Youtube,
  X,
} from 'lucide-react';
import type {
  AnalysisProgress,
  AppMode,
  ChapterTitle,
  FrameMapEntry,
  InternalScene,
  Marker,
  PlaybackMode,
  VideoMetadata,
} from './types/video';
import { analyzeVideoAndBuildFrameMap, buildUniformFrameMap } from './utils/mp4Parser';
import { detectInternalScenesInBackground } from './utils/sceneDetector';
import { generateSampleVideoFile } from './utils/sampleVideoGenerator';
import {
  createId,
  findFrameIndexByTime,
  type ParsedTypeBEntry,
} from './utils/timecode';
import {
  extractYouTubeVideoId,
  parseChaptersFromDescription,
  type YouTubeVideoInfoResponse,
} from './utils/youtube';
import { LoadingView } from './components/LoadingView';
import { MetadataBar } from './components/MetadataBar';
import { TimecodeDisplay } from './components/TimecodeDisplay';
import { TransportControls } from './components/TransportControls';
import { ChapterTimelinePanel } from './components/ChapterTimelinePanel';
import { InternalScenePanel } from './components/InternalScenePanel';
import { ImportExportModal } from './components/ImportExportModal';
import { ShortcutHelpModal } from './components/ShortcutHelpModal';
import {
  YouTubePlayerView,
  type YouTubePlayerController,
} from './components/YouTubePlayerView';
import { YouTubeUrlModal } from './components/YouTubeUrlModal';

const INITIAL_PROGRESS: AnalysisProgress = {
  frameIndexPercent: 0,
  frameIndexDone: false,
  analyzedMaxTimeSec: 0,
  analyzedFrameCount: 0,
  sceneDetectPercent: 0,
  sceneDetectDone: false,
  sceneDetectStatus: 'idle',
  elapsedMs: 0,
  switchedToBackground: false,
};

type RightPanelTab = 'chapters' | 'scenes';

const SIDEBAR_STORAGE_KEY = 'vcm_right_panel_width';
const DEFAULT_SIDEBAR_WIDTH = 480;
const MIN_SIDEBAR_WIDTH = 320;
const MIN_LEFT_PANEL_WIDTH = 380;

function readInitialSidebarWidth(): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= MIN_SIDEBAR_WIDTH) {
        return parsed;
      }
    }
  } catch {
    // ignore storage access errors
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('select');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sampleGenProgress, setSampleGenProgress] = useState<number | null>(null);

  const [progress, setProgress] = useState<AnalysisProgress>(INITIAL_PROGRESS);
  const [internalScenes, setInternalScenes] = useState<InternalScene[]>([]);

  // Playback & Frame Correspondence state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeControllerRef = useRef<YouTubePlayerController | null>(null);
  const sourceTypeRef = useRef<'local' | 'youtube'>('local');
  const frameMapRef = useRef<FrameMapEntry[]>([]);
  const analyzedMaxTimeRef = useRef<number>(0);
  const playbackModeRef = useRef<PlaybackMode>('paused');
  const reverseVirtualTimeRef = useRef<number>(0);
  const lastRafTimeRef = useRef<number>(0);
  const lastYtReverseSeekMsRef = useRef<number>(0);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('paused');
  const [isMuted, setIsMuted] = useState(false);

  // YouTube loading & notification state
  const [isYouTubeLoading, setIsYouTubeLoading] = useState(false);
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);
  const [youTubeModalInitialTab, setYouTubeModalInitialTab] = useState<'load' | 'description'>('load');
  const [youTubeModalError, setYouTubeModalError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Markers & Chapter Titles (1-to-1 optional; supports untitled markers & unassigned titles)
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [titles, setTitles] = useState<ChapterTitle[]>([]);

  // Right Panel Tab, Resizable Width & Modals
  const [rightTab, setRightTab] = useState<RightPanelTab>('chapters');
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(readInitialSidebarWidth);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const workspaceRef = useRef<HTMLElement | null>(null);

  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importExportInitialTab, setImportExportInitialTab] = useState<'importA' | 'importB' | 'exportB'>('exportB');
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);

  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    sourceTypeRef.current = metadata?.sourceType ?? 'local';
  }, [metadata?.sourceType]);

  // Keep layout mode & sidebar width safely clamped when the browser window resizes
  useEffect(() => {
    const handleWindowResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktopLayout(desktop);
      if (desktop && workspaceRef.current) {
        const maxAllowed = Math.max(
          MIN_SIDEBAR_WIDTH,
          workspaceRef.current.getBoundingClientRect().width - MIN_LEFT_PANEL_WIDTH
        );
        setRightPanelWidth((prev) => Math.min(prev, maxAllowed));
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Mouse / Pointer drag resize for the vertical boundary line
  const handleSplitterPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsResizingSidebar(true);

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let latestWidth = rightPanelWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      const container = workspaceRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, rect.width - MIN_LEFT_PANEL_WIDTH);
      const nextWidth = Math.round(
        Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, rect.right - moveEvent.clientX))
      );
      latestWidth = nextWidth;
      setRightPanelWidth(nextWidth);
    };

    const handleEnd = () => {
      setIsResizingSidebar(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(latestWidth));
      } catch {
        // ignore storage errors
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  }, [rightPanelWidth]);

  const handleSplitterDoubleClick = useCallback(() => {
    const container = workspaceRef.current;
    const maxWidth = container
      ? Math.max(MIN_SIDEBAR_WIDTH, container.getBoundingClientRect().width - MIN_LEFT_PANEL_WIDTH)
      : DEFAULT_SIDEBAR_WIDTH;
    const resetWidth = Math.min(DEFAULT_SIDEBAR_WIDTH, maxWidth);
    setRightPanelWidth(resetWidth);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(resetWidth));
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleSplitterKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? 48 : 16;
    const delta = e.key === 'ArrowLeft' ? step : -step;
    const container = workspaceRef.current;
    const maxWidth = container
      ? Math.max(MIN_SIDEBAR_WIDTH, container.getBoundingClientRect().width - MIN_LEFT_PANEL_WIDTH)
      : 900;
    setRightPanelWidth((prev) => {
      const next = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, prev + delta));
      try {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Sync ref with state
  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  useEffect(() => {
    analyzedMaxTimeRef.current = progress.analyzedMaxTimeSec;
  }, [progress.analyzedMaxTimeSec]);

  // Cleanup URL & background tasks on unmount
  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

  const pausePlayback = useCallback(() => {
    if (sourceTypeRef.current === 'youtube') {
      youtubeControllerRef.current?.pause();
    } else {
      const v = videoRef.current;
      if (v && !v.paused) {
        v.pause();
      }
    }
    playbackModeRef.current = 'paused';
    setPlaybackMode('paused');
  }, []);

  /**
   * Seeks strictly to an entry in the Frame Correspondence List (clamped to analyzed range).
   */
  const seekToFrameIndex = useCallback((rawIndex: number, keepPlaying = false) => {
    const frames = frameMapRef.current;
    if (frames.length === 0) return;

    const clampedIdx = Math.max(0, Math.min(frames.length - 1, Math.round(rawIndex)));
    const entry = frames[clampedIdx];
    if (!entry) return;

    if (!keepPlaying) {
      if (sourceTypeRef.current === 'youtube') {
        youtubeControllerRef.current?.pause();
      } else {
        const v = videoRef.current;
        if (v && !v.paused) v.pause();
      }
      playbackModeRef.current = 'paused';
      setPlaybackMode('paused');
    }

    setCurrentFrameIndex(entry.frameIndex);
    setCurrentTimeSec(entry.timeSec);
    reverseVirtualTimeRef.current = entry.timeSec;

    if (sourceTypeRef.current === 'youtube') {
      youtubeControllerRef.current?.seekTo(entry.timeSec, true);
    } else {
      const v = videoRef.current;
      if (v) {
        try {
          v.currentTime = entry.timeSec;
        } catch {
          // Video element may not be ready yet; loadeddata listener will sync
        }
      }
    }
  }, []);

  /**
   * Seeks to a target timestamp snapped strictly onto the Frame Correspondence List.
   */
  const seekToTime = useCallback(
    (targetSec: number) => {
      const frames = frameMapRef.current;
      if (frames.length === 0) return;
      const maxAllowed = Math.max(0, analyzedMaxTimeRef.current || frames[frames.length - 1].timeSec);
      const clampedSec = Math.max(0, Math.min(maxAllowed, targetSec));
      const idx = findFrameIndexByTime(frames, clampedSec);
      seekToFrameIndex(idx, false);
    },
    [seekToFrameIndex]
  );

  const playForward = useCallback(() => {
    const frames = frameMapRef.current;
    if (frames.length === 0) return;
    const maxAllowed = analyzedMaxTimeRef.current || frames[frames.length - 1].timeSec;

    if (sourceTypeRef.current === 'youtube') {
      const yt = youtubeControllerRef.current;
      if (!yt || !yt.isReady()) return;
      if (yt.getCurrentTime() >= maxAllowed - 0.15) {
        seekToFrameIndex(0, true);
      }
      yt.setMuted(isMuted);
      playbackModeRef.current = 'forward';
      setPlaybackMode('forward');
      yt.play();
      return;
    }

    const v = videoRef.current;
    if (!v) return;

    if (v.currentTime >= maxAllowed - 0.04) {
      seekToFrameIndex(0, true);
    }

    v.muted = isMuted;
    playbackModeRef.current = 'forward';
    setPlaybackMode('forward');
    v.play().catch(() => {
      playbackModeRef.current = 'paused';
      setPlaybackMode('paused');
    });
  }, [isMuted, seekToFrameIndex]);

  const playReverse = useCallback(() => {
    const frames = frameMapRef.current;
    if (frames.length === 0) return;

    if (sourceTypeRef.current === 'youtube') {
      const yt = youtubeControllerRef.current;
      if (!yt || !yt.isReady()) return;
      yt.pause();
      if (currentFrameIndex <= 0) {
        const lastIdx = frames.length - 1;
        seekToFrameIndex(lastIdx, true);
        reverseVirtualTimeRef.current = frames[lastIdx].timeSec;
      } else {
        reverseVirtualTimeRef.current = frames[currentFrameIndex]?.timeSec ?? yt.getCurrentTime();
      }
      lastRafTimeRef.current = performance.now();
      lastYtReverseSeekMsRef.current = 0;
      playbackModeRef.current = 'reverse';
      setPlaybackMode('reverse');
      return;
    }

    const v = videoRef.current;
    if (!v) return;

    if (!v.paused) v.pause();

    if (currentFrameIndex <= 0) {
      const lastIdx = frames.length - 1;
      seekToFrameIndex(lastIdx, true);
      reverseVirtualTimeRef.current = frames[lastIdx].timeSec;
    } else {
      reverseVirtualTimeRef.current = frames[currentFrameIndex]?.timeSec ?? v.currentTime;
    }

    lastRafTimeRef.current = performance.now();
    playbackModeRef.current = 'reverse';
    setPlaybackMode('reverse');
  }, [currentFrameIndex, seekToFrameIndex]);

  const togglePlayPause = useCallback(() => {
    if (playbackModeRef.current === 'paused') {
      playForward();
    } else {
      pausePlayback();
    }
  }, [pausePlayback, playForward]);

  const stepFrames = useCallback(
    (deltaFrames: number) => {
      pausePlayback();
      seekToFrameIndex(currentFrameIndex + deltaFrames, false);
    },
    [currentFrameIndex, pausePlayback, seekToFrameIndex]
  );

  const stepSeconds = useCallback(
    (deltaSeconds: number) => {
      pausePlayback();
      const frames = frameMapRef.current;
      const curTime = frames[currentFrameIndex]?.timeSec ?? currentTimeSec;
      seekToTime(curTime + deltaSeconds);
    },
    [currentFrameIndex, currentTimeSec, pausePlayback, seekToTime]
  );

  // 60fps Animation loop for exact forward tracking & smooth reverse playback (local & YouTube)
  useEffect(() => {
    if (appMode !== 'edit') return;

    let rafId = 0;
    const tick = (now: number) => {
      const mode = playbackModeRef.current;
      const frames = frameMapRef.current;

      if (frames.length > 0) {
        if (sourceTypeRef.current === 'youtube') {
          const yt = youtubeControllerRef.current;
          if (yt && yt.isReady()) {
            if (mode === 'forward') {
              const curT = yt.getCurrentTime();
              const maxAllowed = analyzedMaxTimeRef.current || frames[frames.length - 1].timeSec;
              if (curT >= maxAllowed - 0.05 && maxAllowed > 0) {
                yt.pause();
                const endIdx = findFrameIndexByTime(frames, maxAllowed);
                const endEntry = frames[endIdx];
                if (endEntry) {
                  setCurrentFrameIndex(endEntry.frameIndex);
                  setCurrentTimeSec(endEntry.timeSec);
                }
                playbackModeRef.current = 'paused';
                setPlaybackMode('paused');
              } else {
                const idx = findFrameIndexByTime(frames, curT);
                const entry = frames[idx];
                if (entry) {
                  setCurrentFrameIndex(entry.frameIndex);
                  setCurrentTimeSec(entry.timeSec);
                }
              }
            } else if (mode === 'reverse') {
              const dtSec = Math.min(0.1, Math.max(0, (now - lastRafTimeRef.current) / 1000));
              lastRafTimeRef.current = now;
              const nextTime = Math.max(0, reverseVirtualTimeRef.current - dtSec);
              reverseVirtualTimeRef.current = nextTime;

              const idx = findFrameIndexByTime(frames, nextTime);
              const entry = frames[idx];
              if (entry) {
                setCurrentFrameIndex(entry.frameIndex);
                setCurrentTimeSec(entry.timeSec);
                // Throttle YouTube iframe seeks cleanly so buffer stays smooth
                if (now - lastYtReverseSeekMsRef.current >= 140) {
                  lastYtReverseSeekMsRef.current = now;
                  yt.seekTo(entry.timeSec, true);
                }
              }

              if (nextTime <= 0.0005 || idx <= 0) {
                yt.seekTo(frames[0].timeSec, true);
                setCurrentFrameIndex(0);
                setCurrentTimeSec(frames[0].timeSec);
                playbackModeRef.current = 'paused';
                setPlaybackMode('paused');
              }
            }
          }
        } else {
          const v = videoRef.current;
          if (v) {
            if (mode === 'forward') {
              const maxAllowed = analyzedMaxTimeRef.current || frames[frames.length - 1].timeSec;
              if (v.ended || v.currentTime >= maxAllowed - 0.005) {
                v.pause();
                const endIdx = findFrameIndexByTime(frames, maxAllowed);
                const endEntry = frames[endIdx];
                if (endEntry) {
                  setCurrentFrameIndex(endEntry.frameIndex);
                  setCurrentTimeSec(endEntry.timeSec);
                }
                playbackModeRef.current = 'paused';
                setPlaybackMode('paused');
              } else {
                const idx = findFrameIndexByTime(frames, v.currentTime);
                const entry = frames[idx];
                if (entry) {
                  setCurrentFrameIndex(entry.frameIndex);
                  setCurrentTimeSec(entry.timeSec);
                }
              }
            } else if (mode === 'reverse') {
              const dtSec = Math.min(0.1, Math.max(0, (now - lastRafTimeRef.current) / 1000));
              lastRafTimeRef.current = now;
              const nextTime = Math.max(0, reverseVirtualTimeRef.current - dtSec);
              reverseVirtualTimeRef.current = nextTime;

              const idx = findFrameIndexByTime(frames, nextTime);
              const entry = frames[idx];
              if (entry) {
                setCurrentFrameIndex(entry.frameIndex);
                setCurrentTimeSec(entry.timeSec);
                // Update video frame smoothly without saturating decoder while seeking
                if (!v.seeking && Math.abs(v.currentTime - entry.timeSec) > 0.012) {
                  try {
                    v.currentTime = entry.timeSec;
                  } catch {
                    // ignore transient seek errors
                  }
                }
              }

              if (nextTime <= 0.0005 || idx <= 0) {
                try {
                  v.currentTime = frames[0].timeSec;
                } catch {
                  // ignore
                }
                setCurrentFrameIndex(0);
                setCurrentTimeSec(frames[0].timeSec);
                playbackModeRef.current = 'paused';
                setPlaybackMode('paused');
              }
            }
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [appMode]);

  // Step 1 -> Step 2 -> Step 3 -> Step 4 Pipeline (Local Video File)
  const handleSelectFile = useCallback((file: File) => {
    // Abort any prior pipeline
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;

    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
    }
    const newUrl = URL.createObjectURL(file);
    currentUrlRef.current = newUrl;

    // Reset state cleanly for the new video
    sourceTypeRef.current = 'local';
    setErrorMessage(null);
    setStatusNotice(null);
    setVideoUrl(newUrl);
    setMetadata(null);
    frameMapRef.current = [];
    analyzedMaxTimeRef.current = 0;
    setInternalScenes([]);
    setMarkers([]);
    setTitles([]);
    setCurrentFrameIndex(0);
    setCurrentTimeSec(0);
    setPlaybackMode('paused');
    playbackModeRef.current = 'paused';
    setProgress(INITIAL_PROGRESS);
    setAppMode('loading');

    const startTimeMs = performance.now();
    let hasSwitchedToEdit = false;
    let sceneDetectionStarted = false;

    const enterEditMode = (switchedBecause3Sec: boolean) => {
      if (hasSwitchedToEdit || controller.signal.aborted) return;
      hasSwitchedToEdit = true;
      setProgress((prev) => ({
        ...prev,
        switchedToBackground: prev.switchedToBackground || switchedBecause3Sec,
      }));
      setAppMode('edit');
    };

    // Track elapsed ms cleanly during loading mode
    const elapsedTimer = window.setInterval(() => {
      if (controller.signal.aborted) {
        clearInterval(elapsedTimer);
        return;
      }
      const elapsed = performance.now() - startTimeMs;
      setProgress((prev) => ({ ...prev, elapsedMs: elapsed }));
      // Strict 3-second rule: switch to Edit Mode after 3s while background indexing continues!
      if (elapsed >= 3000 && !hasSwitchedToEdit && frameMapRef.current.length > 0) {
        enterEditMode(true);
        clearInterval(elapsedTimer);
      }
    }, 100);

    const startBackgroundSceneDetection = (meta: VideoMetadata) => {
      if (sceneDetectionStarted || controller.signal.aborted) return;
      sceneDetectionStarted = true;
      setProgress((prev) => ({ ...prev, sceneDetectStatus: 'running', sceneDetectPercent: 1 }));

      detectInternalScenesInBackground(
        file,
        newUrl,
        () => frameMapRef.current,
        meta.durationSec,
        {
          onProgress: (pct, scenesSnapshot) => {
            if (controller.signal.aborted) return;
            setInternalScenes(scenesSnapshot);
            setProgress((prev) => ({
              ...prev,
              sceneDetectPercent: pct,
              sceneDetectStatus: 'running',
            }));
          },
          onComplete: (finalScenes) => {
            if (controller.signal.aborted) return;
            setInternalScenes(finalScenes);
            setProgress((prev) => ({
              ...prev,
              sceneDetectPercent: 100,
              sceneDetectDone: true,
              sceneDetectStatus: 'done',
            }));
          },
          onError: () => {
            if (controller.signal.aborted) return;
            setProgress((prev) => ({
              ...prev,
              sceneDetectStatus: 'error',
            }));
          },
        },
        controller.signal
      );
    };

    analyzeVideoAndBuildFrameMap(
      file,
      newUrl,
      {
        onMetadataReady: (meta) => {
          if (controller.signal.aborted) return;
          setMetadata(meta);
        },
        onChunk: (framesSnapshot, pct, maxTimeSec) => {
          if (controller.signal.aborted) return;
          frameMapRef.current = framesSnapshot;
          analyzedMaxTimeRef.current = maxTimeSec;
          setProgress((prev) => ({
            ...prev,
            frameIndexPercent: pct,
            analyzedMaxTimeSec: maxTimeSec,
            analyzedFrameCount: framesSnapshot.length,
          }));
          if (!hasSwitchedToEdit && performance.now() - startTimeMs >= 3000 && framesSnapshot.length > 0) {
            enterEditMode(true);
            clearInterval(elapsedTimer);
          }
        },
        onComplete: (finalFrames, finalMeta) => {
          if (controller.signal.aborted) return;
          clearInterval(elapsedTimer);
          frameMapRef.current = finalFrames;
          analyzedMaxTimeRef.current = finalMeta.durationSec;
          setMetadata(finalMeta);
          setProgress((prev) => ({
            ...prev,
            frameIndexPercent: 100,
            frameIndexDone: true,
            analyzedMaxTimeSec: finalMeta.durationSec,
            analyzedFrameCount: finalFrames.length,
            elapsedMs: performance.now() - startTimeMs,
          }));
          enterEditMode(false);
          startBackgroundSceneDetection(finalMeta);
        },
      },
      controller.signal
    ).catch((err) => {
      clearInterval(elapsedTimer);
      if (controller.signal.aborted) return;
      setErrorMessage(
        err instanceof Error
          ? err.message
          : '動画ファイルの解析に失敗しました。別のファイルでお試しください。'
      );
      setAppMode('select');
    });
  }, []);

  const handleGenerateSample = useCallback(async () => {
    setErrorMessage(null);
    setSampleGenProgress(0);
    try {
      const sampleFile = await generateSampleVideoFile((pct) => setSampleGenProgress(pct));
      setSampleGenProgress(null);
      handleSelectFile(sampleFile);
    } catch (err) {
      setSampleGenProgress(null);
      setErrorMessage(
        err instanceof Error ? err.message : 'サンプル動画の生成に失敗しました。'
      );
    }
  }, [handleSelectFile]);

  // Load YouTube Video URL + Read-Only Description Chapter List
  const handleLoadYouTubeUrl = useCallback(
    async (url: string, autoImportChapters: boolean) => {
      setErrorMessage(null);
      setYouTubeModalError(null);
      setIsYouTubeLoading(true);

      try {
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
          throw new Error(
            '有効なYouTubeのURLまたは動画IDを入力してください（例: https://www.youtube.com/watch?v=...）。'
          );
        }

        let payload: YouTubeVideoInfoResponse | null = null;
        try {
          const resp = await fetch(`/api/youtube/info?url=${encodeURIComponent(url)}`);
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.toLowerCase().includes('application/json')) {
            const json = (await resp.json()) as YouTubeVideoInfoResponse & { error?: string };
            if (!resp.ok || !json.videoId) {
              throw new Error(json.error || 'YouTube動画情報の取得に失敗しました。');
            }
            payload = json;
          }
        } catch (fetchErr) {
          // Re-throw explicit API errors returned by our backend; fall back on static hosts (404/network)
          if (
            fetchErr instanceof Error &&
            fetchErr.name !== 'TypeError' &&
            fetchErr.name !== 'SyntaxError'
          ) {
            throw fetchErr;
          }
        }

        if (!payload) {
          payload = {
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: `YouTube (${videoId})`,
            author: '',
            durationSec: 0,
            width: 1920,
            height: 1080,
            fps: 30,
            videoCodec: 'YouTube Stream',
            audioCodec: 'AAC / Opus',
            description: '',
            chapters: [],
            chapterSource: 'none',
            warning:
              '静的サイト環境のため、YouTube概要欄の自動取得は利用できません。動画再生・マーキングはそのまま利用でき、概要欄のチャプターはコピーして「テキスト入出力」→「入力（タイプB）」から取り込めます。',
          };
        }

        // Abort any previous local file analysis
        analysisAbortRef.current?.abort();
        const controller = new AbortController();
        analysisAbortRef.current = controller;

        if (currentUrlRef.current) {
          URL.revokeObjectURL(currentUrlRef.current);
          currentUrlRef.current = null;
        }

        sourceTypeRef.current = 'youtube';
        setVideoUrl(null);
        setInternalScenes([]);
        setCurrentFrameIndex(0);
        setCurrentTimeSec(0);
        setPlaybackMode('paused');
        playbackModeRef.current = 'paused';

        const fps = payload.fps > 0 && payload.fps <= 120 ? payload.fps : 30;
        const maxChapterSec = payload.chapters.reduce((acc, ch) => Math.max(acc, ch.timeSec), 0);
        const durationSec = Math.max(
          1,
          payload.durationSec > 0 ? payload.durationSec : maxChapterSec > 0 ? maxChapterSec + 60 : 1
        );
        const estimatedTotalFrames = Math.max(1, Math.round(durationSec * fps));

        const ytMetadata: VideoMetadata = {
          sourceType: 'youtube',
          fileName: payload.title,
          fileSize: 0,
          mimeType: 'video/youtube',
          containerFormat: 'YouTube',
          videoCodec: payload.videoCodec || 'YouTube Stream',
          width: payload.width || 1920,
          height: payload.height || 1080,
          durationSec,
          averageFps: fps,
          minFps: fps,
          maxFps: fps,
          isVfr: false,
          estimatedTotalFrames,
          audioTracks: [{ index: 1, codec: payload.audioCodec || 'AAC / Opus' }],
          parseMethod: 'youtube-stream',
          youtubeVideoId: payload.videoId,
          youtubeUrl: payload.url,
          youtubeAuthor: payload.author,
          youtubeDescription: payload.description,
          youtubeChapterSource: payload.chapterSource,
        };

        setMetadata(ytMetadata);
        setProgress({
          ...INITIAL_PROGRESS,
          frameIndexPercent: 0,
          analyzedMaxTimeSec: 0,
          analyzedFrameCount: 0,
          sceneDetectDone: true,
          sceneDetectPercent: 100,
          sceneDetectStatus: 'done',
        });

        const frames = await buildUniformFrameMap(
          durationSec,
          fps,
          (framesSnapshot, pct, maxTimeSec) => {
            if (controller.signal.aborted) return;
            frameMapRef.current = framesSnapshot;
            analyzedMaxTimeRef.current = maxTimeSec;
            setProgress((prev) => ({
              ...prev,
              frameIndexPercent: pct,
              analyzedMaxTimeSec: maxTimeSec,
              analyzedFrameCount: framesSnapshot.length,
            }));
          },
          controller.signal
        );

        if (controller.signal.aborted) return;

        frameMapRef.current = frames;
        analyzedMaxTimeRef.current = durationSec;
        setProgress((prev) => ({
          ...prev,
          frameIndexPercent: 100,
          frameIndexDone: true,
          analyzedMaxTimeSec: durationSec,
          analyzedFrameCount: frames.length,
        }));

        // Populate markers & titles from YouTube description chapter list when enabled
        const loadedMarkers: Marker[] = [];
        const loadedTitles: ChapterTitle[] = [];
        if (autoImportChapters && payload.chapters.length > 0) {
          for (const ch of payload.chapters) {
            const clampedSec = Math.max(0, Math.min(durationSec, ch.timeSec));
            const idx = findFrameIndexByTime(frames, clampedSec);
            const entry = frames[idx];
            const mk: Marker = {
              id: createId('mk'),
              frameIndex: entry ? entry.frameIndex : idx,
              timeSec: entry ? entry.timeSec : clampedSec,
            };
            loadedMarkers.push(mk);
            if (ch.title.trim().length > 0) {
              loadedTitles.push({
                id: createId('ch'),
                text: ch.title.trim(),
                assignedMarkerId: mk.id,
                unassignedOrder: 0,
              });
            }
          }
        }

        setMarkers(loadedMarkers);
        setTitles(loadedTitles);
        setRightTab('chapters');
        setIsYouTubeModalOpen(false);
        setAppMode('edit');

        if (payload.warning) {
          setStatusNotice(payload.warning);
        } else if (autoImportChapters && loadedMarkers.length > 0) {
          const sourceLabel =
            payload.chapterSource === 'description' ? '概要欄' : 'YouTubeチャプター';
          setStatusNotice(`${sourceLabel}から ${loadedMarkers.length} 件のチャプターを読み込みました。`);
        } else if (autoImportChapters) {
          setStatusNotice('YouTube動画を読み込みました（概要欄にタイムスタンプ形式のチャプターは見つかりませんでした）。');
        } else {
          setStatusNotice('YouTube動画を読み込みました。');
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'YouTube動画の読み込みに失敗しました。';
        setErrorMessage(msg);
        setYouTubeModalError(msg);
      } finally {
        setIsYouTubeLoading(false);
      }
    },
    []
  );

  // Sync exact YouTube duration & title/author from IFrame Player and re-snap markers cleanly
  const handleYouTubePlayerReady = useCallback(
    async (playerDurationSec: number, info?: { title?: string; author?: string }) => {
      if (sourceTypeRef.current !== 'youtube') return;

      const trimmedTitle = info?.title?.trim();
      const trimmedAuthor = info?.author?.trim();
      if (trimmedTitle || trimmedAuthor) {
        setMetadata((prev) => {
          if (!prev || prev.sourceType !== 'youtube') return prev;
          const shouldReplaceTitle =
            Boolean(trimmedTitle) &&
            (!prev.fileName || prev.fileName.startsWith('YouTube ('));
          return {
            ...prev,
            fileName: shouldReplaceTitle && trimmedTitle ? trimmedTitle : prev.fileName,
            youtubeAuthor: prev.youtubeAuthor || trimmedAuthor || prev.youtubeAuthor,
          };
        });
      }

      if (!Number.isFinite(playerDurationSec) || playerDurationSec <= 0) return;

      const currentDuration = metadata?.durationSec ?? 0;
      if (Math.abs(currentDuration - playerDurationSec) > 1.0 || frameMapRef.current.length <= 60) {
        const fps = metadata?.averageFps || 30;
        const controller = new AbortController();
        const frames = await buildUniformFrameMap(
          playerDurationSec,
          fps,
          () => {},
          controller.signal
        );
        frameMapRef.current = frames;
        analyzedMaxTimeRef.current = playerDurationSec;
        setMetadata((prev) =>
          prev
            ? {
                ...prev,
                durationSec: playerDurationSec,
                estimatedTotalFrames: frames.length,
              }
            : prev
        );
        setProgress((prev) => ({
          ...prev,
          frameIndexPercent: 100,
          frameIndexDone: true,
          analyzedMaxTimeSec: playerDurationSec,
          analyzedFrameCount: frames.length,
        }));
        setMarkers((prev) =>
          prev.map((m) => {
            const clampedSec = Math.max(0, Math.min(playerDurationSec, m.timeSec));
            const idx = findFrameIndexByTime(frames, clampedSec);
            const entry = frames[idx];
            return entry
              ? { ...m, frameIndex: entry.frameIndex, timeSec: entry.timeSec }
              : m;
          })
        );
      }
    },
    [metadata?.averageFps, metadata?.durationSec]
  );

  const handleYouTubePlaybackStateChange = useCallback((state: 'playing' | 'paused' | 'ended') => {
    if (playbackModeRef.current === 'reverse') return;
    if (state === 'playing') {
      playbackModeRef.current = 'forward';
      setPlaybackMode('forward');
    } else {
      playbackModeRef.current = 'paused';
      setPlaybackMode('paused');
    }
  }, []);

  // --- Marker & Chapter Title Operations ---
  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => a.timeSec - b.timeSec || a.frameIndex - b.frameIndex),
    [markers]
  );

  const addMarkerAtCurrent = useCallback(() => {
    const frames = frameMapRef.current;
    const entry = frames[currentFrameIndex];
    const frameIndex = entry ? entry.frameIndex : currentFrameIndex;
    const timeSec = entry ? entry.timeSec : currentTimeSec;

    setMarkers((prev) => {
      // Avoid duplicate marker on the exact same frame
      if (prev.some((m) => m.frameIndex === frameIndex)) {
        return prev;
      }
      return [...prev, { id: createId('mk'), frameIndex, timeSec }];
    });
  }, [currentFrameIndex, currentTimeSec]);

  const deleteMarker = useCallback((markerId: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== markerId));
    // Detach any title assigned to this marker so user's text isn't silently destroyed
    setTitles((prev) => {
      const maxOrder = prev.reduce((acc, t) => Math.max(acc, t.unassignedOrder), 0);
      let nextOrder = maxOrder + 1;
      return prev.map((t) =>
        t.assignedMarkerId === markerId
          ? { ...t, assignedMarkerId: null, unassignedOrder: nextOrder++ }
          : t
      );
    });
  }, []);

  const addTitleForMarker = useCallback((markerId: string, text: string) => {
    setTitles((prev) => {
      const existing = prev.find((t) => t.assignedMarkerId === markerId);
      if (existing) {
        return prev.map((t) => (t.id === existing.id ? { ...t, text } : t));
      }
      return [
        ...prev,
        {
          id: createId('ch'),
          text,
          assignedMarkerId: markerId,
          unassignedOrder: 0,
        },
      ];
    });
  }, []);

  const addUnassignedTitle = useCallback((text: string) => {
    setTitles((prev) => {
      const maxOrder = prev.reduce((acc, t) => Math.max(acc, t.unassignedOrder), 0);
      return [
        ...prev,
        {
          id: createId('ch'),
          text,
          assignedMarkerId: null,
          unassignedOrder: maxOrder + 1,
        },
      ];
    });
  }, []);

  const updateTitleText = useCallback((titleId: string, text: string) => {
    setTitles((prev) => prev.map((t) => (t.id === titleId ? { ...t, text } : t)));
  }, []);

  const deleteTitle = useCallback((titleId: string) => {
    setTitles((prev) => prev.filter((t) => t.id !== titleId));
  }, []);

  const unassignTitle = useCallback((titleId: string) => {
    setTitles((prev) => {
      const maxOrder = prev.reduce((acc, t) => Math.max(acc, t.unassignedOrder), 0);
      return prev.map((t) =>
        t.id === titleId
          ? { ...t, assignedMarkerId: null, unassignedOrder: maxOrder + 1 }
          : t
      );
    });
  }, []);

  /**
   * Moves a title to targetMarkerId. If targetMarkerId already holds another title, cleanly SWAPS them!
   */
  const moveOrSwapTitleToMarker = useCallback((titleId: string, targetMarkerId: string) => {
    setTitles((prev) => {
      const source = prev.find((t) => t.id === titleId);
      if (!source || source.assignedMarkerId === targetMarkerId) return prev;

      const occupant = prev.find((t) => t.assignedMarkerId === targetMarkerId);
      const maxOrder = prev.reduce((acc, t) => Math.max(acc, t.unassignedOrder), 0);

      return prev.map((t) => {
        if (t.id === source.id) {
          return { ...t, assignedMarkerId: targetMarkerId };
        }
        if (occupant && t.id === occupant.id) {
          // Swap: occupant takes source's old marker, or goes to unassigned pool if source was unassigned
          return {
            ...t,
            assignedMarkerId: source.assignedMarkerId,
            unassignedOrder: source.assignedMarkerId === null ? source.unassignedOrder : maxOrder + 1,
          };
        }
        return t;
      });
    });
  }, []);

  /**
   * Moves an assigned title up (-1) or down (+1) by one marker row (swapping if adjacent is occupied).
   */
  const stepTitleOnTimeline = useCallback(
    (titleId: string, direction: -1 | 1) => {
      const title = titles.find((t) => t.id === titleId);
      if (!title || !title.assignedMarkerId) return;
      const curIdx = sortedMarkers.findIndex((m) => m.id === title.assignedMarkerId);
      if (curIdx < 0) return;
      const targetIdx = curIdx + direction;
      if (targetIdx < 0 || targetIdx >= sortedMarkers.length) return;
      moveOrSwapTitleToMarker(titleId, sortedMarkers[targetIdx].id);
    },
    [moveOrSwapTitleToMarker, sortedMarkers, titles]
  );

  /**
   * Cascade-shifts all titles from `startMarkerIndex` downward by 1 marker slot.
   * Any title pushed past the last marker moves safely into the unassigned pool.
   */
  const shiftTitlesDownFromMarker = useCallback(
    (startMarkerIndex: number) => {
      setTitles((prev) => {
        const markerIds = sortedMarkers.map((m) => m.id);
        const indexById = new Map<string, number>();
        markerIds.forEach((id, i) => indexById.set(id, i));
        const maxOrder = prev.reduce((acc, t) => Math.max(acc, t.unassignedOrder), 0);
        let overflowOrder = maxOrder + 1;

        return prev.map((t) => {
          if (!t.assignedMarkerId) return t;
          const idx = indexById.get(t.assignedMarkerId);
          if (idx === undefined || idx < startMarkerIndex) return t;
          const nextIdx = idx + 1;
          if (nextIdx < markerIds.length) {
            return { ...t, assignedMarkerId: markerIds[nextIdx] };
          }
          return { ...t, assignedMarkerId: null, unassignedOrder: overflowOrder++ };
        });
      });
    },
    [sortedMarkers]
  );

  const reorderUnassignedTitle = useCallback((titleId: string, direction: -1 | 1) => {
    setTitles((prev) => {
      const unassigned = prev
        .filter((t) => t.assignedMarkerId === null)
        .sort((a, b) => a.unassignedOrder - b.unassignedOrder);
      const idx = unassigned.findIndex((t) => t.id === titleId);
      const targetIdx = idx + direction;
      if (idx < 0 || targetIdx < 0 || targetIdx >= unassigned.length) return prev;

      const copy = [...unassigned];
      const [moved] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, moved);

      const newOrderMap = new Map<string, number>();
      copy.forEach((t, i) => newOrderMap.set(t.id, i + 1));

      return prev.map((t) =>
        t.assignedMarkerId === null && newOrderMap.has(t.id)
          ? { ...t, unassignedOrder: newOrderMap.get(t.id)! }
          : t
      );
    });
  }, []);

  const autoAssignUnassigned = useCallback(() => {
    setTitles((prev) => {
      const occupied = new Set(prev.filter((t) => t.assignedMarkerId).map((t) => t.assignedMarkerId!));
      const emptyMarkers = sortedMarkers.filter((m) => !occupied.has(m.id));
      if (emptyMarkers.length === 0) return prev;

      const unassignedIds = prev
        .filter((t) => t.assignedMarkerId === null)
        .sort((a, b) => a.unassignedOrder - b.unassignedOrder)
        .map((t) => t.id);

      const assignMap = new Map<string, string>();
      const count = Math.min(emptyMarkers.length, unassignedIds.length);
      for (let i = 0; i < count; i++) {
        assignMap.set(unassignedIds[i], emptyMarkers[i].id);
      }

      return prev.map((t) =>
        assignMap.has(t.id) ? { ...t, assignedMarkerId: assignMap.get(t.id)! } : t
      );
    });
  }, [sortedMarkers]);

  // --- Type A & Type B Text Import Handlers ---
  const handleImportTypeA = useCallback(
    (titleLines: string[], replaceExisting: boolean, autoAssign: boolean) => {
      setTitles((prev) => {
        const base = replaceExisting ? [] : prev;
        const occupied = new Set(
          base.filter((t) => t.assignedMarkerId !== null).map((t) => t.assignedMarkerId!)
        );
        const emptyMarkers = autoAssign
          ? sortedMarkers.filter((m) => !occupied.has(m.id))
          : [];
        let emptyCursor = 0;
        let nextOrder = base.reduce((acc, t) => Math.max(acc, t.unassignedOrder), 0) + 1;

        const added: ChapterTitle[] = titleLines.map((text) => {
          if (emptyCursor < emptyMarkers.length) {
            const targetMarker = emptyMarkers[emptyCursor++];
            return {
              id: createId('ch'),
              text,
              assignedMarkerId: targetMarker.id,
              unassignedOrder: 0,
            };
          }
          return {
            id: createId('ch'),
            text,
            assignedMarkerId: null,
            unassignedOrder: nextOrder++,
          };
        });

        return [...base, ...added];
      });
      setRightTab('chapters');
    },
    [sortedMarkers]
  );

  const handleImportTypeB = useCallback(
    (entries: ParsedTypeBEntry[], replaceExisting: boolean) => {
      const frames = frameMapRef.current;
      const duration = metadata?.durationSec ?? 0;

      const nextMarkers: Marker[] = replaceExisting ? [] : [...markers];
      const nextTitles: ChapterTitle[] = replaceExisting ? [] : [...titles];

      for (const entry of entries) {
        const clampedSec = duration > 0 ? Math.max(0, Math.min(duration, entry.timeSec)) : Math.max(0, entry.timeSec);
        const snappedIdx =
          frames.length > 0 ? findFrameIndexByTime(frames, clampedSec) : Math.round(clampedSec * 30);
        const frameEntry = frames[snappedIdx];
        const finalFrameIdx = frameEntry ? frameEntry.frameIndex : snappedIdx;
        const finalTimeSec = frameEntry ? frameEntry.timeSec : clampedSec;

        // Reuse existing marker if within 0.5s or exact frame
        let marker = nextMarkers.find(
          (m) => m.frameIndex === finalFrameIdx || Math.abs(m.timeSec - finalTimeSec) < 0.35
        );
        if (!marker) {
          marker = {
            id: createId('mk'),
            frameIndex: finalFrameIdx,
            timeSec: finalTimeSec,
          };
          nextMarkers.push(marker);
        }

        if (entry.title.length > 0) {
          const existingTitleIdx = nextTitles.findIndex((t) => t.assignedMarkerId === marker!.id);
          if (existingTitleIdx >= 0) {
            nextTitles[existingTitleIdx] = {
              ...nextTitles[existingTitleIdx],
              text: entry.title,
            };
          } else {
            nextTitles.push({
              id: createId('ch'),
              text: entry.title,
              assignedMarkerId: marker.id,
              unassignedOrder: 0,
            });
          }
        }
      }

      setMarkers(nextMarkers);
      setTitles(nextTitles);
      setRightTab('chapters');
    },
    [markers, metadata?.durationSec, titles]
  );

  const handleReimportFromYouTubeDescription = useCallback(
    (replaceExisting: boolean) => {
      const desc = metadata?.youtubeDescription;
      if (!desc) return;
      const chapters = parseChaptersFromDescription(desc, metadata?.durationSec || undefined);
      if (chapters.length === 0) return;
      handleImportTypeB(chapters, replaceExisting);
      setStatusNotice(`概要欄から ${chapters.length} 件のチャプターを再読み込みしました。`);
    },
    [handleImportTypeB, metadata?.durationSec, metadata?.youtubeDescription]
  );

  // --- Separate Axis Jump Navigation ---
  const jumpPrevMarker = useCallback(() => {
    if (sortedMarkers.length === 0) return;
    const prev = [...sortedMarkers]
      .reverse()
      .find((m) => m.frameIndex < currentFrameIndex - 1);
    seekToFrameIndex(prev ? prev.frameIndex : sortedMarkers[0].frameIndex, false);
  }, [currentFrameIndex, seekToFrameIndex, sortedMarkers]);

  const jumpNextMarker = useCallback(() => {
    if (sortedMarkers.length === 0) return;
    const next = sortedMarkers.find((m) => m.frameIndex > currentFrameIndex + 1);
    seekToFrameIndex(
      next ? next.frameIndex : sortedMarkers[sortedMarkers.length - 1].frameIndex,
      false
    );
  }, [currentFrameIndex, seekToFrameIndex, sortedMarkers]);

  const jumpPrevScene = useCallback(() => {
    if (internalScenes.length === 0) return;
    const prev = [...internalScenes]
      .reverse()
      .find((s) => s.frameIndex < currentFrameIndex - 1);
    seekToFrameIndex(prev ? prev.frameIndex : internalScenes[0].frameIndex, false);
  }, [currentFrameIndex, internalScenes, seekToFrameIndex]);

  const jumpNextScene = useCallback(() => {
    if (internalScenes.length === 0) return;
    const next = internalScenes.find((s) => s.frameIndex > currentFrameIndex + 1);
    seekToFrameIndex(
      next ? next.frameIndex : internalScenes[internalScenes.length - 1].frameIndex,
      false
    );
  }, [currentFrameIndex, internalScenes, seekToFrameIndex]);

  // --- Global Keyboard Transport & Editing Bindings ---
  useEffect(() => {
    if (appMode !== 'edit') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isImportExportOpen || isShortcutHelpOpen || isYouTubeModalOpen) {
        if (e.key === 'Escape') {
          setIsImportExportOpen(false);
          setIsShortcutHelpOpen(false);
          setIsYouTubeModalOpen(false);
        }
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key;
      const lower = key.toLowerCase();

      if (key === ' ' || lower === 'k') {
        e.preventDefault();
        togglePlayPause();
      } else if (lower === 'l') {
        e.preventDefault();
        playForward();
      } else if (lower === 'j') {
        e.preventDefault();
        playReverse();
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) stepFrames(-30);
        else if (e.shiftKey) stepFrames(-10);
        else stepFrames(-1);
      } else if (key === 'ArrowRight') {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) stepFrames(30);
        else if (e.shiftKey) stepFrames(10);
        else stepFrames(1);
      } else if (key === ',') {
        e.preventDefault();
        stepFrames(-1);
      } else if (key === '.') {
        e.preventDefault();
        stepFrames(1);
      } else if (lower === 'a') {
        e.preventDefault();
        stepSeconds(e.shiftKey ? -10 : -1);
      } else if (lower === 'd') {
        e.preventDefault();
        stepSeconds(e.shiftKey ? 10 : 1);
      } else if (key === '[') {
        e.preventDefault();
        stepSeconds(-15);
      } else if (key === ']') {
        e.preventDefault();
        stepSeconds(15);
      } else if (lower === 'm') {
        e.preventDefault();
        addMarkerAtCurrent();
      } else if (lower === 'p') {
        e.preventDefault();
        if (e.shiftKey) jumpPrevScene();
        else jumpPrevMarker();
      } else if (lower === 'n') {
        e.preventDefault();
        if (e.shiftKey) jumpNextScene();
        else jumpNextMarker();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    addMarkerAtCurrent,
    appMode,
    isImportExportOpen,
    isShortcutHelpOpen,
    isYouTubeModalOpen,
    jumpNextMarker,
    jumpNextScene,
    jumpPrevMarker,
    jumpPrevScene,
    playForward,
    playReverse,
    stepFrames,
    stepSeconds,
    togglePlayPause,
  ]);

  const currentFrameEntry = frameMapRef.current[currentFrameIndex] ?? null;
  const totalFrames = Math.max(
    frameMapRef.current.length,
    metadata?.estimatedTotalFrames ?? 0
  );
  const isOnMarker = useMemo(
    () => markers.some((m) => Math.abs(m.frameIndex - currentFrameIndex) <= 1),
    [currentFrameIndex, markers]
  );

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#0D0F12] text-[#F3F5F8] overflow-hidden">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="h-14 shrink-0 flex items-center justify-between gap-8 px-5 border-b border-[#222731] bg-[#111419]">
        {/* Zone 1: Single-line Brand Title */}
        <button
          type="button"
          onClick={() => {
            if (appMode === 'edit') return;
            setAppMode('select');
          }}
          className="text-base font-bold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
        >
          YouTube Video Chapter Marker
        </button>

        {/* Zone 2: Clean Single-Line Text Navigation Actions */}
        <nav className="flex items-center gap-6 text-xs font-medium text-[#94A0B2]">
          {appMode === 'edit' && (
            <>
              <button
                type="button"
                onClick={() => hiddenFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                別の動画を開く
              </button>
              <button
                type="button"
                onClick={() => {
                  setYouTubeModalError(null);
                  setYouTubeModalInitialTab('load');
                  setIsYouTubeModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Youtube className="w-3.5 h-3.5" />
                YouTube読込
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportExportInitialTab('importA');
                  setIsImportExportOpen(true);
                }}
                className="hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                タイトル読込
              </button>
              <button
                type="button"
                onClick={() => setIsShortcutHelpOpen(true)}
                className="inline-flex items-center gap-1.5 hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Keyboard className="w-3.5 h-3.5" />
                ショートカット
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center shrink-0">
          {appMode === 'edit' ? (
            <button
              type="button"
              onClick={() => {
                setImportExportInitialTab('exportB');
                setIsImportExportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              テキスト入出力
            </button>
          ) : (
            <button
              type="button"
              onClick={() => hiddenFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              動画を開く
            </button>
          )}
        </div>

        <input
          ref={hiddenFileInputRef}
          type="file"
          accept="video/*,.mp4,.mov,.webm,.mkv,.m4v,.avi,.ogv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleSelectFile(f);
            e.target.value = '';
          }}
        />
      </header>

      {/* Mode Switch: Loading Mode vs Edit Mode */}
      {appMode === 'select' || appMode === 'loading' ? (
        <div className="flex-1 overflow-y-auto flex flex-col">
          <LoadingView
            mode={appMode}
            onSelectFile={handleSelectFile}
            onLoadYouTubeUrl={handleLoadYouTubeUrl}
            isYouTubeLoading={isYouTubeLoading}
            onGenerateSample={handleGenerateSample}
            sampleGenProgress={sampleGenProgress}
            errorMessage={errorMessage}
            metadata={metadata}
            progress={progress}
            onSkipToEdit={() => setAppMode('edit')}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Metadata & Background Analysis Progress Bar */}
          {metadata && (
            <MetadataBar
              metadata={metadata}
              progress={progress}
              onInspectYouTubeDescription={
                metadata.sourceType === 'youtube'
                  ? () => {
                      setYouTubeModalError(null);
                      setYouTubeModalInitialTab('description');
                      setIsYouTubeModalOpen(true);
                    }
                  : undefined
              }
            />
          )}

          {/* Main 2-Column Studio Edit Workspace */}
          <main
            ref={workspaceRef}
            className={`flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden ${
              isResizingSidebar ? 'select-none' : ''
            }`}
          >
            {/* Left Primary Monitor + Huge Timecode + Transport Column */}
            <div className="flex-1 flex flex-col gap-3 p-4 min-w-0 lg:overflow-y-auto">
              {/* Video Reference Monitor (Local Video or YouTube IFrame Player) */}
              <div
                className={`relative bg-black rounded-lg border border-[#242933] overflow-hidden flex items-center justify-center min-h-[240px] max-h-[50vh] xl:max-h-[54vh] aspect-video mx-auto w-full ${
                  isResizingSidebar ? 'pointer-events-none' : ''
                }`}
              >
                {metadata?.sourceType === 'youtube' && metadata.youtubeVideoId ? (
                  <YouTubePlayerView
                    key={metadata.youtubeVideoId}
                    videoId={metadata.youtubeVideoId}
                    isMuted={isMuted}
                    controllerRef={youtubeControllerRef}
                    onReady={handleYouTubePlayerReady}
                    onPlaybackStateChange={handleYouTubePlaybackStateChange}
                  />
                ) : (
                  <>
                    {videoUrl && (
                      <video
                        ref={videoRef}
                        src={videoUrl}
                        muted={isMuted}
                        playsInline
                        preload="auto"
                        onClick={togglePlayPause}
                        onLoadedData={() => {
                          const v = videoRef.current;
                          if (v && currentTimeSec > 0) {
                            v.currentTime = currentTimeSec;
                          }
                        }}
                        className="w-full h-full object-contain cursor-pointer"
                      />
                    )}

                    {/* Minimal mute control inside local monitor corner */}
                    <button
                      type="button"
                      onClick={() => {
                        const nextMuted = !isMuted;
                        setIsMuted(nextMuted);
                        if (videoRef.current) videoRef.current.muted = nextMuted;
                      }}
                      title={isMuted ? 'ミュート解除' : 'ミュート'}
                      className="absolute bottom-3 right-3 p-2 rounded-md bg-black/65 hover:bg-black/85 text-[#E2E8F0] border border-white/10 transition-colors cursor-pointer"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </>
                )}
              </div>

              {/* HERO: Prominent Large Timecode / Frame Number / Seconds Readout */}
              <TimecodeDisplay
                currentFrame={currentFrameEntry}
                currentFrameIndex={currentFrameIndex}
                totalFrames={totalFrames}
                currentTimeSec={currentTimeSec}
                durationSec={metadata?.durationSec ?? 0}
                playbackMode={playbackMode}
                metadata={metadata}
                isOnMarker={isOnMarker}
              />

              {/* Dual-Axis Scrubber & Keyboard-Linked Transport Controls */}
              <TransportControls
                currentTimeSec={currentTimeSec}
                durationSec={metadata?.durationSec ?? 0}
                analyzedMaxTimeSec={progress.analyzedMaxTimeSec}
                playbackMode={playbackMode}
                markers={sortedMarkers}
                internalScenes={internalScenes}
                onPlayForward={playForward}
                onPlayReverse={playReverse}
                onPause={pausePlayback}
                onStepFrames={stepFrames}
                onStepSeconds={stepSeconds}
                onSeekToTime={seekToTime}
                onSeekToFrame={(idx) => seekToFrameIndex(idx, false)}
                onAddMarkerAtCurrent={addMarkerAtCurrent}
                onJumpPrevMarker={jumpPrevMarker}
                onJumpNextMarker={jumpNextMarker}
              />
            </div>

            {/* Draggable Vertical Boundary Line (Desktop) */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="左右パネルの境界線をドラッグして幅を調整"
              aria-valuenow={rightPanelWidth}
              aria-valuemin={MIN_SIDEBAR_WIDTH}
              tabIndex={0}
              title="左右にドラッグしてパネル幅を調整（ダブルクリックで初期幅にリセット）"
              onPointerDown={handleSplitterPointerDown}
              onDoubleClick={handleSplitterDoubleClick}
              onKeyDown={handleSplitterKeyDown}
              className="hidden lg:flex relative w-2 -mx-0.5 shrink-0 cursor-col-resize items-center justify-center group z-20 touch-none focus:outline-none"
            >
              <div
                className={`h-full transition-colors ${
                  isResizingSidebar
                    ? 'w-[2px] bg-amber-400'
                    : 'w-px bg-[#222731] group-hover:w-[2px] group-hover:bg-amber-400/80 group-focus-visible:w-[2px] group-focus-visible:bg-amber-400'
                }`}
              />
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-1 h-10 rounded-full transition-opacity pointer-events-none ${
                  isResizingSidebar
                    ? 'bg-amber-400 opacity-100'
                    : 'bg-amber-400/80 opacity-0 group-hover:opacity-100'
                }`}
              />
            </div>

            {/* Right Column: Vertical Marker/Chapter Matching & Strictly Separate Internal Scene Axis */}
            <aside
              style={isDesktopLayout ? { width: `${rightPanelWidth}px` } : undefined}
              className="w-full lg:w-auto shrink-0 flex flex-col border-t lg:border-t-0 bg-[#13161B] min-h-[480px] lg:min-h-0"
            >
              {/* Axis Switcher: User Markers/Chapters vs Separate Reference Internal Scenes */}
              <div className="p-2.5 border-b border-[#222731] bg-[#101318] shrink-0">
                <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0D10] border border-[#222731] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setRightTab('chapters')}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      rightTab === 'chapters'
                        ? 'bg-[#202530] text-amber-300'
                        : 'text-[#94A0B2] hover:text-[#F3F5F8]'
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    マーカー＆チャプター ({sortedMarkers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightTab('scenes')}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      rightTab === 'scenes'
                        ? 'bg-[#202530] text-sky-300'
                        : 'text-[#94A0B2] hover:text-[#F3F5F8]'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    内部シーン参考 ({internalScenes.length})
                  </button>
                </div>
              </div>

              {/* Optional dismissible YouTube chapter import notice */}
              {statusNotice && (
                <div className="px-3.5 py-2 border-b border-[#222731] bg-amber-500/10 flex items-center justify-between gap-2 text-xs text-amber-200 shrink-0">
                  <span className="leading-snug">{statusNotice}</span>
                  <button
                    type="button"
                    onClick={() => setStatusNotice(null)}
                    aria-label="通知を閉じる"
                    className="p-0.5 text-amber-300/80 hover:text-amber-100 shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex-1 min-h-0 flex flex-col">
                {rightTab === 'chapters' ? (
                  <ChapterTimelinePanel
                    markers={sortedMarkers}
                    titles={titles}
                    currentFrameIndex={currentFrameIndex}
                    onSeekToFrame={(idx) => seekToFrameIndex(idx, false)}
                    onAddMarkerAtCurrent={addMarkerAtCurrent}
                    onDeleteMarker={deleteMarker}
                    onAddTitleForMarker={addTitleForMarker}
                    onAddUnassignedTitle={addUnassignedTitle}
                    onUpdateTitleText={updateTitleText}
                    onDeleteTitle={deleteTitle}
                    onUnassignTitle={unassignTitle}
                    onMoveOrSwapTitleToMarker={moveOrSwapTitleToMarker}
                    onStepTitleOnTimeline={stepTitleOnTimeline}
                    onShiftTitlesDownFromMarker={shiftTitlesDownFromMarker}
                    onReorderUnassignedTitle={reorderUnassignedTitle}
                    onAutoAssignUnassigned={autoAssignUnassigned}
                  />
                ) : (
                  <InternalScenePanel
                    sourceType={metadata?.sourceType ?? 'local'}
                    scenes={internalScenes}
                    progress={progress}
                    currentFrameIndex={currentFrameIndex}
                    onSeekToFrame={(idx) => seekToFrameIndex(idx, false)}
                    onJumpPrevScene={jumpPrevScene}
                    onJumpNextScene={jumpNextScene}
                  />
                )}
              </div>
            </aside>
          </main>
        </div>
      )}

      {/* Copy-Paste Text Import (Type A / Type B) & Export (Type B) Popup */}
      <ImportExportModal
        key={`${isImportExportOpen}-${importExportInitialTab}`}
        isOpen={isImportExportOpen}
        initialTab={importExportInitialTab}
        markers={sortedMarkers}
        titles={titles}
        fileName={metadata?.fileName}
        onClose={() => setIsImportExportOpen(false)}
        onImportTypeA={handleImportTypeA}
        onImportTypeB={handleImportTypeB}
      />

      {/* YouTube URL Loader & Read-Only Description Viewer Popup */}
      <YouTubeUrlModal
        key={`${isYouTubeModalOpen}-${youTubeModalInitialTab}-${metadata?.youtubeVideoId ?? ''}`}
        isOpen={isYouTubeModalOpen}
        initialTab={youTubeModalInitialTab}
        isLoading={isYouTubeLoading}
        errorMessage={youTubeModalError}
        currentYouTubeUrl={metadata?.youtubeUrl}
        currentTitle={metadata?.fileName}
        currentDescription={metadata?.youtubeDescription}
        onClose={() => setIsYouTubeModalOpen(false)}
        onSubmitUrl={handleLoadYouTubeUrl}
        onReimportFromDescription={handleReimportFromYouTubeDescription}
      />

      {/* Keyboard Shortcuts Reference Popup */}
      <ShortcutHelpModal
        isOpen={isShortcutHelpOpen}
        onClose={() => setIsShortcutHelpOpen(false)}
      />
    </div>
  );
}
