/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  FolderOpen,
  Keyboard,
  Bookmark,
  Compass,
  Upload,
  Youtube,
  X,
  Table2,
} from 'lucide-react';
import type {
  AnalysisProgress,
  AppMode,
  ChapterEntry,
  FocusedSearchRange,
  FrameMapEntry,
  InternalScene,
  PlaybackMode,
  ScratchpadCells,
  VideoMetadata,
  WorkspaceView,
} from './types/video';
import { analyzeVideoAndBuildFrameMap, buildUniformFrameMap } from './utils/mp4Parser';
import { detectInternalScenesInBackground } from './utils/sceneDetector';
import { generateSampleVideoFile } from './utils/sampleVideoGenerator';
import {
  createId,
  findFrameIndexByTime,
  type ParsedChapterLine,
} from './utils/timecode';
import {
  assignTimeToEntry,
  autoAssignUntimedToEmptyMarkers,
  computeSearchRangeForEntry,
  deleteMarkerFromEntry,
  deleteTitleFromEntry,
  deriveMarkersAndTitles,
  importParsedLinesIntoEntries,
  insertMarkerAtTime,
  insertUntimedTitleAt,
  moveOrSwapTitleBetweenEntries,
  shiftTitlesDownFromEntry,
  stepEntryTitle,
  unlinkTimeFromEntry,
  updateEntryTitle,
} from './utils/chapterSequence';
import type { SheetConversionResult } from './utils/spreadsheetEngine';
import {
  extractYouTubeVideoId,
  parseChaptersFromDescription,
  type YouTubeApiErrorCode,
  type YouTubeApiWarningCode,
  type YouTubeVideoInfoResponse,
} from './utils/youtube';
import { LoadingView } from './components/LoadingView';
import { MetadataBar } from './components/MetadataBar';
import { TimecodeDisplay } from './components/TimecodeDisplay';
import { TransportControls } from './components/TransportControls';
import { ChapterTimelinePanel } from './components/ChapterTimelinePanel';
import { ChapterSpreadsheetPanel } from './components/ChapterSpreadsheetPanel';
import { InternalScenePanel } from './components/InternalScenePanel';
import {
  ChapterImportModal,
  type UnifiedImportOptions,
} from './components/ChapterImportModal';
import { ChapterExportModal } from './components/ChapterExportModal';
import { ShortcutHelpModal } from './components/ShortcutHelpModal';
import {
  YouTubePlayerView,
  type YouTubePlayerController,
} from './components/YouTubePlayerView';
import { YouTubeUrlModal } from './components/YouTubeUrlModal';
import { LanguageSelector } from './components/LanguageSelector';
import { getActiveLocale, translate, translatePlural, useI18n } from './i18n';

function translateYouTubeApiError(code?: YouTubeApiErrorCode, fallback?: string): string {
  switch (code) {
    case 'INVALID_YOUTUBE_URL':
      return translate('errors.invalidYouTubeUrl');
    case 'YOUTUBE_VIDEO_NOT_FOUND':
      return translate('errors.youtubeVideoNotFound');
    case 'YOUTUBE_LOAD_FAILED':
      return translate('errors.youtubeLoadGenericError');
    default:
      return fallback || translate('errors.youtubeInfoFetchFailed');
  }
}

function translateYouTubeApiWarning(
  code?: YouTubeApiWarningCode,
  detail?: string,
  fallback?: string
): string | null {
  switch (code) {
    case 'YOUTUBE_RESTRICTED_WITH_REASON':
      return translate('notices.youtubeRestrictedWithReason', { reason: detail ?? '' });
    case 'YOUTUBE_RESTRICTED_PRIVATE':
      return translate('notices.youtubeRestrictedPrivate');
    case 'YOUTUBE_DESCRIPTION_FETCH_FAILED':
      return translate('notices.youtubeDescriptionFetchFailed');
    case 'STATIC_SITE_YOUTUBE_FALLBACK':
      return translate('errors.staticSiteYouTubeWarning');
    default:
      return fallback ?? null;
  }
}

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
const SPREADSHEET_WIDTH_STORAGE_KEY = 'vcm_spreadsheet_panel_width';
const VOLUME_STORAGE_KEY = 'vcm_volume';
const MUTED_STORAGE_KEY = 'vcm_muted';
const DEFAULT_SIDEBAR_WIDTH = 480;
const MIN_SIDEBAR_WIDTH = 320;
const MIN_SPREADSHEET_WIDTH = 460;
const MIN_LEFT_PANEL_WIDTH = 360;

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

function readInitialSpreadsheetWidth(): number {
  const defaultSheetW =
    typeof window !== 'undefined'
      ? Math.max(MIN_SPREADSHEET_WIDTH, Math.round(window.innerWidth * 0.62))
      : 860;
  try {
    const raw = window.localStorage.getItem(SPREADSHEET_WIDTH_STORAGE_KEY);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= MIN_SPREADSHEET_WIDTH) {
        return parsed;
      }
    }
  } catch {
    // ignore storage access errors
  }
  return defaultSheetW;
}

function readInitialVolume(): number {
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw !== null) {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
  } catch {
    // ignore storage access errors
  }
  return 1;
}

function readInitialMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export default function App() {
  const { t } = useI18n();
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
  const previewLoopRangeRef = useRef<{ startSec: number; endSec: number } | null>(null);
  const lastLoopWrapMsRef = useRef<number>(0);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const currentTimeSecRef = useRef<number>(0);
  currentTimeSecRef.current = currentTimeSec;
  const getCurrentTimeSec = useCallback(() => currentTimeSecRef.current, []);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('paused');
  const [volume, setVolume] = useState<number>(readInitialVolume);
  const [isMuted, setIsMuted] = useState<boolean>(readInitialMuted);
  const lastNonZeroVolumeRef = useRef<number>(volume > 0 ? volume : 1);

  // YouTube loading & notification state
  const [isYouTubeLoading, setIsYouTubeLoading] = useState(false);
  const [isYouTubeModalOpen, setIsYouTubeModalOpen] = useState(false);
  const [youTubeModalInitialTab, setYouTubeModalInitialTab] = useState<'load' | 'description'>('load');
  const [youTubeModalError, setYouTubeModalError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Unified Order-Preserving Chapters (supports timed chapters, untitled markers, & untimed title rows in order)
  const [entries, setEntries] = useState<ChapterEntry[]>([]);
  const [sessionScratchpad, setSessionScratchpad] = useState<ScratchpadCells>({});
  const [lastSelectedMarkerId, setLastSelectedMarkerId] = useState<string | null>(null);
  const [focusedUntimedEntryId, setFocusedUntimedEntryId] = useState<string | null>(null);
  const [spreadsheetSearchRange, setSpreadsheetSearchRange] = useState<FocusedSearchRange | null>(null);
  const [lastSelectedSceneId, setLastSelectedSceneId] = useState<string | null>(null);

  // Workspace View Mode (Timeline vs Spreadsheet), Resizable Widths & Modals
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('timeline');
  const [isSpreadsheetDirty, setIsSpreadsheetDirty] = useState(false);
  const [spreadsheetCancelRequest, setSpreadsheetCancelRequest] = useState(0);
  const [rightTab, setRightTab] = useState<RightPanelTab>('chapters');
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(readInitialSidebarWidth);
  const [spreadsheetPanelWidth, setSpreadsheetPanelWidth] = useState<number>(
    readInitialSpreadsheetWidth
  );
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const workspaceRef = useRef<HTMLElement | null>(null);

  const [isTextImportOpen, setIsTextImportOpen] = useState(false);
  const [isTextExportOpen, setIsTextExportOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);

  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    sourceTypeRef.current = metadata?.sourceType ?? 'local';
  }, [metadata?.sourceType]);

  // Keep local <video> audio level and mute state synchronized & persisted
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = Math.max(0, Math.min(1, volume));
      v.muted = isMuted || volume <= 0;
    }
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
      window.localStorage.setItem(MUTED_STORAGE_KEY, String(isMuted));
    } catch {
      // ignore storage errors
    }
  }, [volume, isMuted, videoUrl, appMode]);

  const handleVolumeChange = useCallback((nextRaw: number) => {
    const clamped = Math.round(Math.max(0, Math.min(1, nextRaw)) * 100) / 100;
    if (clamped > 0) {
      lastNonZeroVolumeRef.current = clamped;
      setVolume(clamped);
      setIsMuted(false);
    } else {
      setVolume(0);
      setIsMuted(true);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    if (isMuted || volume <= 0) {
      const restored = lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 1;
      if (volume <= 0) {
        setVolume(restored);
      }
      setIsMuted(false);
    } else {
      if (volume > 0) {
        lastNonZeroVolumeRef.current = volume;
      }
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const adjustVolumeBy = useCallback(
    (delta: number) => {
      const base = isMuted ? 0 : volume;
      handleVolumeChange(base + delta);
    },
    [handleVolumeChange, isMuted, volume]
  );

  const activeRightPanelWidth =
    workspaceView === 'spreadsheet' ? spreadsheetPanelWidth : rightPanelWidth;

  // Keep layout mode & sidebar widths safely clamped when the browser window resizes
  useEffect(() => {
    const handleWindowResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktopLayout(desktop);
      if (desktop && workspaceRef.current) {
        const containerW = workspaceRef.current.getBoundingClientRect().width;
        const maxTimeline = Math.max(MIN_SIDEBAR_WIDTH, containerW - MIN_LEFT_PANEL_WIDTH);
        const maxSheet = Math.max(MIN_SPREADSHEET_WIDTH, containerW - MIN_LEFT_PANEL_WIDTH);
        setRightPanelWidth((prev) => Math.min(prev, maxTimeline));
        setSpreadsheetPanelWidth((prev) => Math.min(prev, maxSheet));
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Mouse / Pointer drag resize for the vertical boundary line (independent width per mode)
  const handleSplitterPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setIsResizingSidebar(true);

      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const isSheet = workspaceView === 'spreadsheet';
      const minW = isSheet ? MIN_SPREADSHEET_WIDTH : MIN_SIDEBAR_WIDTH;
      const storageKey = isSheet ? SPREADSHEET_WIDTH_STORAGE_KEY : SIDEBAR_STORAGE_KEY;
      let latestWidth = activeRightPanelWidth;

      const handleMove = (moveEvent: PointerEvent) => {
        const container = workspaceRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const isRtl = document.documentElement.dir === 'rtl';
        const maxWidth = Math.max(minW, rect.width - MIN_LEFT_PANEL_WIDTH);
        const rawWidth = isRtl ? moveEvent.clientX - rect.left : rect.right - moveEvent.clientX;
        const nextWidth = Math.round(Math.max(minW, Math.min(maxWidth, rawWidth)));
        latestWidth = nextWidth;
        if (isSheet) {
          setSpreadsheetPanelWidth(nextWidth);
        } else {
          setRightPanelWidth(nextWidth);
        }
      };

      const handleEnd = () => {
        setIsResizingSidebar(false);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleEnd);
        window.removeEventListener('pointercancel', handleEnd);
        try {
          window.localStorage.setItem(storageKey, String(latestWidth));
        } catch {
          // ignore storage errors
        }
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleEnd);
      window.addEventListener('pointercancel', handleEnd);
    },
    [activeRightPanelWidth, workspaceView]
  );

  const handleSplitterDoubleClick = useCallback(() => {
    const container = workspaceRef.current;
    const isSheet = workspaceView === 'spreadsheet';
    const minW = isSheet ? MIN_SPREADSHEET_WIDTH : MIN_SIDEBAR_WIDTH;
    const containerW = container?.getBoundingClientRect().width ?? 1400;
    const maxWidth = Math.max(minW, containerW - MIN_LEFT_PANEL_WIDTH);
    const defaultW = isSheet
      ? Math.max(MIN_SPREADSHEET_WIDTH, Math.round(containerW * 0.62))
      : DEFAULT_SIDEBAR_WIDTH;
    const resetWidth = Math.min(defaultW, maxWidth);
    if (isSheet) {
      setSpreadsheetPanelWidth(resetWidth);
    } else {
      setRightPanelWidth(resetWidth);
    }
    try {
      window.localStorage.setItem(
        isSheet ? SPREADSHEET_WIDTH_STORAGE_KEY : SIDEBAR_STORAGE_KEY,
        String(resetWidth)
      );
    } catch {
      // ignore storage errors
    }
  }, [workspaceView]);

  const handleSplitterKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const step = e.shiftKey ? 48 : 16;
      const isRtl = document.documentElement.dir === 'rtl';
      const delta =
        e.key === 'ArrowLeft' ? (isRtl ? -step : step) : isRtl ? step : -step;
      const container = workspaceRef.current;
      const isSheet = workspaceView === 'spreadsheet';
      const minW = isSheet ? MIN_SPREADSHEET_WIDTH : MIN_SIDEBAR_WIDTH;
      const maxWidth = container
        ? Math.max(minW, container.getBoundingClientRect().width - MIN_LEFT_PANEL_WIDTH)
        : 1000;
      const setter = isSheet ? setSpreadsheetPanelWidth : setRightPanelWidth;
      const storageKey = isSheet ? SPREADSHEET_WIDTH_STORAGE_KEY : SIDEBAR_STORAGE_KEY;
      setter((prev) => {
        const next = Math.max(minW, Math.min(maxWidth, prev + delta));
        try {
          window.localStorage.setItem(storageKey, String(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [workspaceView]
  );

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
    previewLoopRangeRef.current = null;
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
      previewLoopRangeRef.current = null;
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
    previewLoopRangeRef.current = null;
    const frames = frameMapRef.current;
    if (frames.length === 0) return;
    const maxAllowed = analyzedMaxTimeRef.current || frames[frames.length - 1].timeSec;

    if (sourceTypeRef.current === 'youtube') {
      const yt = youtubeControllerRef.current;
      if (!yt || !yt.isReady()) return;
      if (yt.getCurrentTime() >= maxAllowed - 0.15) {
        seekToFrameIndex(0, true);
      }
      yt.setVolume(volume);
      yt.setMuted(isMuted || volume <= 0);
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

    v.volume = Math.max(0, Math.min(1, volume));
    v.muted = isMuted || volume <= 0;
    playbackModeRef.current = 'forward';
    setPlaybackMode('forward');
    v.play().catch(() => {
      playbackModeRef.current = 'paused';
      setPlaybackMode('paused');
    });
  }, [isMuted, seekToFrameIndex, volume]);

  /**
   * Seeks to `targetSec` and loops forward for `previewDurationSec` (default 10s) until stopped or moved.
   */
  const previewAtTime = useCallback(
    (targetSec: number, previewDurationSec = 10) => {
      const frames = frameMapRef.current;
      if (frames.length === 0) return;
      const maxAllowed = Math.max(0, analyzedMaxTimeRef.current || frames[frames.length - 1].timeSec);
      const clampedSec = Math.max(0, Math.min(maxAllowed, targetSec));
      const idx = findFrameIndexByTime(frames, clampedSec);
      const snappedStart = frames[idx]?.timeSec ?? clampedSec;
      seekToFrameIndex(idx, true);

      const stopAt = Math.min(maxAllowed, snappedStart + Math.max(1, previewDurationSec));
      previewLoopRangeRef.current =
        stopAt > snappedStart + 0.08 ? { startSec: snappedStart, endSec: stopAt } : null;
      lastLoopWrapMsRef.current = performance.now();

      if (sourceTypeRef.current === 'youtube') {
        const yt = youtubeControllerRef.current;
        if (!yt || !yt.isReady()) return;
        yt.setVolume(volume);
        yt.setMuted(isMuted || volume <= 0);
        playbackModeRef.current = 'forward';
        setPlaybackMode('forward');
        yt.play();
        return;
      }

      const v = videoRef.current;
      if (!v) return;
      v.volume = Math.max(0, Math.min(1, volume));
      v.muted = isMuted || volume <= 0;
      playbackModeRef.current = 'forward';
      setPlaybackMode('forward');
      v.play().catch(() => {
        previewLoopRangeRef.current = null;
        playbackModeRef.current = 'paused';
        setPlaybackMode('paused');
      });
    },
    [isMuted, seekToFrameIndex, volume]
  );

  const playReverse = useCallback(() => {
    previewLoopRangeRef.current = null;
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
              const previewLoop = previewLoopRangeRef.current;
              if (previewLoop !== null && curT >= previewLoop.endSec - 0.05) {
                if (now - lastLoopWrapMsRef.current >= 450) {
                  lastLoopWrapMsRef.current = now;
                  const loopIdx = findFrameIndexByTime(frames, previewLoop.startSec);
                  const loopEntry = frames[loopIdx];
                  yt.seekTo(previewLoop.startSec, true);
                  yt.play();
                  if (loopEntry) {
                    setCurrentFrameIndex(loopEntry.frameIndex);
                    setCurrentTimeSec(loopEntry.timeSec);
                  }
                }
              } else if (curT >= maxAllowed - 0.05 && maxAllowed > 0) {
                previewLoopRangeRef.current = null;
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
              const previewLoop = previewLoopRangeRef.current;
              if (previewLoop !== null && (v.ended || v.currentTime >= previewLoop.endSec - 0.02)) {
                try {
                  v.currentTime = previewLoop.startSec;
                } catch {
                  // ignore transient seek errors
                }
                if (v.paused || v.ended) {
                  v.play().catch(() => {
                    previewLoopRangeRef.current = null;
                    playbackModeRef.current = 'paused';
                    setPlaybackMode('paused');
                  });
                }
                const loopIdx = findFrameIndexByTime(frames, previewLoop.startSec);
                const loopEntry = frames[loopIdx];
                if (loopEntry) {
                  setCurrentFrameIndex(loopEntry.frameIndex);
                  setCurrentTimeSec(loopEntry.timeSec);
                }
              } else if (v.ended || v.currentTime >= maxAllowed - 0.005) {
                previewLoopRangeRef.current = null;
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
    setEntries([]);
    setSessionScratchpad({});
    setWorkspaceView('timeline');
    setIsSpreadsheetDirty(false);
    setFocusedUntimedEntryId(null);
    setSpreadsheetSearchRange(null);
    setLastSelectedMarkerId(null);
    setLastSelectedSceneId(null);
    previewLoopRangeRef.current = null;
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
          : translate('errors.videoAnalysisFailed')
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
        err instanceof Error ? err.message : translate('errors.sampleGenFailed')
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
          throw new Error(translate('errors.invalidYouTubeUrl'));
        }

        let payload: YouTubeVideoInfoResponse | null = null;
        try {
          const hl = getActiveLocale();
          const resp = await fetch(
            `/api/youtube/info?url=${encodeURIComponent(url)}&hl=${encodeURIComponent(hl)}`
          );
          const contentType = resp.headers.get('content-type') || '';
          if (contentType.toLowerCase().includes('application/json')) {
            const json = (await resp.json()) as YouTubeVideoInfoResponse & {
              error?: string;
              errorCode?: YouTubeApiErrorCode;
            };
            if (!resp.ok || !json.videoId) {
              throw new Error(translateYouTubeApiError(json.errorCode, json.error));
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
            title: translate('metadata.youtubeFallbackTitle', { videoId }),
            author: '',
            durationSec: 0,
            width: 1920,
            height: 1080,
            fps: 30,
            videoCodec: translate('metadata.youtubeStream'),
            audioCodec: 'AAC / Opus',
            description: '',
            chapters: [],
            chapterSource: 'none',
            warningCode: 'STATIC_SITE_YOUTUBE_FALLBACK',
            warning: translate('errors.staticSiteYouTubeWarning'),
            isFallbackTitle: true,
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

        const resolvedTitle = payload.isFallbackTitle
          ? payload.warningCode === 'STATIC_SITE_YOUTUBE_FALLBACK'
            ? translate('metadata.youtubeFallbackTitle', { videoId: payload.videoId })
            : translate('metadata.youtubeVideoFallbackTitle', { videoId: payload.videoId })
          : payload.title;

        const ytMetadata: VideoMetadata = {
          sourceType: 'youtube',
          fileName: resolvedTitle,
          fileSize: 0,
          mimeType: 'video/youtube',
          containerFormat: translate('metadata.youtubeSourceTag'),
          videoCodec:
            !payload.videoCodec || payload.videoCodec === 'YouTube Stream'
              ? translate('metadata.youtubeStream')
              : payload.videoCodec,
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
          youtubeTitleIsFallback: Boolean(payload.isFallbackTitle),
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

        // Populate unified entries from YouTube description chapter list when enabled
        const loadedEntries: ChapterEntry[] = [];
        if (autoImportChapters && payload.chapters.length > 0) {
          for (const ch of payload.chapters) {
            const clampedSec = Math.max(0, Math.min(durationSec, ch.timeSec));
            const idx = findFrameIndexByTime(frames, clampedSec);
            const entry = frames[idx];
            loadedEntries.push({
              id: createId('mk'),
              frameIndex: entry ? entry.frameIndex : idx,
              timeSec: entry ? entry.timeSec : clampedSec,
              title: ch.title.trim(),
            });
          }
        }

        setEntries(loadedEntries);
        setSessionScratchpad({});
        setWorkspaceView('timeline');
        setIsSpreadsheetDirty(false);
        setFocusedUntimedEntryId(null);
        setSpreadsheetSearchRange(null);
        previewLoopRangeRef.current = null;
        setLastSelectedMarkerId(null);
        setLastSelectedSceneId(null);
        setRightTab('chapters');
        setIsYouTubeModalOpen(false);
        setAppMode('edit');

        const localizedWarning = translateYouTubeApiWarning(
          payload.warningCode,
          payload.warningDetail,
          payload.warning
        );
        if (localizedWarning) {
          setStatusNotice(localizedWarning);
        } else if (autoImportChapters && loadedEntries.length > 0) {
          const sourceLabel =
            payload.chapterSource === 'description'
              ? translate('notices.chapterSourceDescription')
              : translate('notices.chapterSourceYouTube');
          setStatusNotice(
            translatePlural('notices.youtubeChaptersLoaded', loadedEntries.length, {
              source: sourceLabel,
              count: loadedEntries.length,
            })
          );
        } else if (autoImportChapters) {
          setStatusNotice(translate('notices.youtubeLoadedNoChapters'));
        } else {
          setStatusNotice(translate('notices.youtubeLoaded'));
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : translate('errors.youtubeLoadFailed');
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
            (!prev.fileName || Boolean(prev.youtubeTitleIsFallback));
          return {
            ...prev,
            fileName: shouldReplaceTitle && trimmedTitle ? trimmedTitle : prev.fileName,
            youtubeTitleIsFallback: shouldReplaceTitle ? false : prev.youtubeTitleIsFallback,
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
        setEntries((prev) =>
          prev.map((item) => {
            if (item.timeSec === null) return item;
            const clampedSec = Math.max(0, Math.min(playerDurationSec, item.timeSec));
            const idx = findFrameIndexByTime(frames, clampedSec);
            const entry = frames[idx];
            return entry
              ? { ...item, frameIndex: entry.frameIndex, timeSec: entry.timeSec }
              : item;
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

  // --- Unified Order-Preserving Marker & Chapter Operations ---
  const { markers: sortedMarkers, titles } = useMemo(
    () => deriveMarkersAndTitles(entries),
    [entries]
  );

  const untimedTitleCount = useMemo(
    () => entries.filter((e) => e.timeSec === null && e.title.trim().length > 0).length,
    [entries]
  );

  const focusedSearchRange = useMemo<FocusedSearchRange | null>(() => {
    if (workspaceView === 'spreadsheet') {
      return spreadsheetSearchRange;
    }
    if (!focusedUntimedEntryId) return null;
    return computeSearchRangeForEntry(
      entries,
      focusedUntimedEntryId,
      metadata?.durationSec ?? 0
    );
  }, [
    entries,
    focusedUntimedEntryId,
    metadata?.durationSec,
    spreadsheetSearchRange,
    workspaceView,
  ]);

  const addMarkerAtCurrent = useCallback(() => {
    const frames = frameMapRef.current;
    const entry = frames[currentFrameIndex];
    const frameIndex = entry ? entry.frameIndex : currentFrameIndex;
    const timeSec = entry ? entry.timeSec : currentTimeSec;

    setEntries((prev) => {
      const res = insertMarkerAtTime(prev, frameIndex, timeSec);
      setLastSelectedMarkerId(res.markerId);
      return res.entries;
    });
  }, [currentFrameIndex, currentTimeSec]);

  const assignCurrentTimeToEntry = useCallback(
    (entryId: string) => {
      const frames = frameMapRef.current;
      const frameEntry = frames[currentFrameIndex];
      const frameIndex = frameEntry ? frameEntry.frameIndex : currentFrameIndex;
      const timeSec = frameEntry ? frameEntry.timeSec : currentTimeSec;

      setEntries((prev) => {
        const res = assignTimeToEntry(prev, entryId, frameIndex, timeSec);
        setLastSelectedMarkerId(res.targetId);
        // If another untimed row remains right next to it, keep search flow snappy or clear focus
        const nextUntimed = res.entries.find(
          (e) => e.timeSec === null && e.title.trim().length > 0
        );
        setFocusedUntimedEntryId(nextUntimed ? nextUntimed.id : null);
        return res.entries;
      });
    },
    [currentFrameIndex, currentTimeSec]
  );

  const deleteMarker = useCallback((entryId: string) => {
    setEntries((prev) => deleteMarkerFromEntry(prev, entryId));
    setLastSelectedMarkerId((prev) => (prev === entryId ? null : prev));
  }, []);

  const addTitleForMarker = useCallback((entryId: string, text: string) => {
    setEntries((prev) => updateEntryTitle(prev, entryId, text));
  }, []);

  const handleInsertUntimedTitleAt = useCallback((text: string, insertIndex?: number) => {
    setEntries((prev) => {
      const res = insertUntimedTitleAt(prev, text, insertIndex);
      setFocusedUntimedEntryId(res.addedId);
      return res.entries;
    });
  }, []);

  const updateTitleText = useCallback((entryId: string, text: string) => {
    setEntries((prev) => updateEntryTitle(prev, entryId, text));
  }, []);

  const deleteTitle = useCallback((entryId: string) => {
    setEntries((prev) => deleteTitleFromEntry(prev, entryId));
    setFocusedUntimedEntryId((prev) => (prev === entryId ? null : prev));
  }, []);

  const unassignTitle = useCallback((entryId: string) => {
    setEntries((prev) => unlinkTimeFromEntry(prev, entryId));
    setLastSelectedMarkerId((prev) => (prev === entryId ? null : prev));
    setFocusedUntimedEntryId(entryId);
  }, []);

  const handleMoveOrSwapTitleBetweenEntries = useCallback(
    (sourceId: string, targetId: string) => {
      setEntries((prev) => moveOrSwapTitleBetweenEntries(prev, sourceId, targetId));
    },
    []
  );

  const handleStepEntryTitle = useCallback((entryId: string, direction: -1 | 1) => {
    setEntries((prev) => stepEntryTitle(prev, entryId, direction));
  }, []);

  const handleShiftTitlesDownFromEntry = useCallback((startEntryId: string) => {
    setEntries((prev) => shiftTitlesDownFromEntry(prev, startEntryId));
  }, []);

  const autoAssignUnassigned = useCallback(() => {
    setEntries((prev) => autoAssignUntimedToEmptyMarkers(prev));
    setFocusedUntimedEntryId(null);
  }, []);

  // --- Unified Line-by-Line Chapter / Title / Marker Import Handler (Order-Preserving!) ---
  const handleImportUnifiedLines = useCallback(
    (lines: ParsedChapterLine[], options: UnifiedImportOptions) => {
      const frames = frameMapRef.current;
      const duration = metadata?.durationSec ?? 0;

      setEntries((prev) =>
        importParsedLinesIntoEntries(prev, lines, options, frames, duration)
      );
      if (options.replaceExisting && options.replaceMode === 'all') {
        setLastSelectedMarkerId(null);
        setFocusedUntimedEntryId(null);
      }
      setRightTab('chapters');
      setWorkspaceView('timeline');
    },
    [metadata?.durationSec]
  );

  // --- Spreadsheet Save / Cancel / Toggle Handlers ---
  const handleSaveSpreadsheet = useCallback(
    (
      nextEntries: ChapterEntry[],
      nextScratchpad: ScratchpadCells,
      summary: SheetConversionResult['summary']
    ) => {
      previewLoopRangeRef.current = null;
      setEntries(nextEntries);
      setSessionScratchpad(nextScratchpad);
      setSpreadsheetSearchRange(null);
      setFocusedUntimedEntryId(null);
      setIsSpreadsheetDirty(false);
      setRightTab('chapters');
      setWorkspaceView('timeline');
      setStatusNotice(
        translate('spreadsheet.savedStatusNotice', {
          timed: summary.timedCount,
          markers: summary.markerOnlyCount,
          untimed: summary.untimedCount,
        })
      );
    },
    []
  );

  const handleCancelSpreadsheet = useCallback(() => {
    previewLoopRangeRef.current = null;
    setSpreadsheetSearchRange(null);
    setIsSpreadsheetDirty(false);
    setWorkspaceView('timeline');
  }, []);

  const handleToggleSpreadsheetView = useCallback(() => {
    if (workspaceView === 'spreadsheet') {
      if (!isSpreadsheetDirty) {
        handleCancelSpreadsheet();
      } else {
        setSpreadsheetCancelRequest((prev) => prev + 1);
      }
      return;
    }
    setFocusedUntimedEntryId(null);
    setWorkspaceView('spreadsheet');
  }, [handleCancelSpreadsheet, isSpreadsheetDirty, workspaceView]);

  const handleReimportFromYouTubeDescription = useCallback(
    (replaceExisting: boolean) => {
      const desc = metadata?.youtubeDescription;
      if (!desc) return;
      const chapters = parseChaptersFromDescription(desc, metadata?.durationSec || undefined);
      if (chapters.length === 0) return;
      const parsedLines: ParsedChapterLine[] = chapters.map((ch, idx) => ({
        lineNumber: idx + 1,
        kind: ch.title.length > 0 ? 'chapter' : 'marker-only',
        timeSec: ch.timeSec,
        title: ch.title,
      }));
      handleImportUnifiedLines(parsedLines, {
        replaceExisting,
        replaceMode: 'all',
        autoAssignTitles: false,
      });
      setStatusNotice(
        translatePlural('notices.youtubeChaptersReimported', chapters.length)
      );
    },
    [handleImportUnifiedLines, metadata?.durationSec, metadata?.youtubeDescription]
  );

  // --- Separate Axis Selection & Jump Navigation ---
  const handleSelectMarker = useCallback(
    (markerId: string, frameIndex: number) => {
      setLastSelectedMarkerId(markerId);
      seekToFrameIndex(frameIndex, false);
    },
    [seekToFrameIndex]
  );

  const handleSelectScene = useCallback(
    (sceneId: string, frameIndex: number) => {
      setLastSelectedSceneId(sceneId);
      seekToFrameIndex(frameIndex, false);
    },
    [seekToFrameIndex]
  );

  const jumpPrevMarker = useCallback(() => {
    if (sortedMarkers.length === 0) return;
    const prev = [...sortedMarkers]
      .reverse()
      .find((m) => m.frameIndex < currentFrameIndex - 1);
    const target = prev ?? sortedMarkers[0];
    setLastSelectedMarkerId(target.id);
    seekToFrameIndex(target.frameIndex, false);
  }, [currentFrameIndex, seekToFrameIndex, sortedMarkers]);

  const jumpNextMarker = useCallback(() => {
    if (sortedMarkers.length === 0) return;
    const next = sortedMarkers.find((m) => m.frameIndex > currentFrameIndex + 1);
    const target = next ?? sortedMarkers[sortedMarkers.length - 1];
    setLastSelectedMarkerId(target.id);
    seekToFrameIndex(target.frameIndex, false);
  }, [currentFrameIndex, seekToFrameIndex, sortedMarkers]);

  const jumpPrevScene = useCallback(() => {
    if (internalScenes.length === 0) return;
    const prev = [...internalScenes]
      .reverse()
      .find((s) => s.frameIndex < currentFrameIndex - 1);
    const target = prev ?? internalScenes[0];
    setLastSelectedSceneId(target.id);
    seekToFrameIndex(target.frameIndex, false);
  }, [currentFrameIndex, internalScenes, seekToFrameIndex]);

  const jumpNextScene = useCallback(() => {
    if (internalScenes.length === 0) return;
    const next = internalScenes.find((s) => s.frameIndex > currentFrameIndex + 1);
    const target = next ?? internalScenes[internalScenes.length - 1];
    setLastSelectedSceneId(target.id);
    seekToFrameIndex(target.frameIndex, false);
  }, [currentFrameIndex, internalScenes, seekToFrameIndex]);

  // --- Global Keyboard Transport & Editing Bindings (ref-backed so 60fps playback never churns window listeners) ---
  const globalKeyDownHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  globalKeyDownHandlerRef.current = (e: KeyboardEvent) => {
    // Never intercept keys while an IME (Japanese, Chinese, Korean, Vietnamese, etc.) is composing
    if (e.isComposing || e.keyCode === 229) return;

    if (isTextImportOpen || isTextExportOpen || isShortcutHelpOpen || isYouTubeModalOpen) {
      if (e.key === 'Escape') {
        setIsTextImportOpen(false);
        setIsTextExportOpen(false);
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
        target.isContentEditable ||
        target.closest('[data-spreadsheet-panel="true"]'))
    ) {
      return;
    }

    if (e.altKey) return;

    const key = e.key;
    const lower = key.toLowerCase();
    const code = e.code;
    const hasPrimaryMod = e.ctrlKey || e.metaKey;

    if (key === 'ArrowLeft') {
      e.preventDefault();
      if (hasPrimaryMod) stepFrames(-30);
      else if (e.shiftKey) stepFrames(-10);
      else stepFrames(-1);
      return;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      if (hasPrimaryMod) stepFrames(30);
      else if (e.shiftKey) stepFrames(10);
      else stepFrames(1);
      return;
    }

    if (key === 'ArrowUp' && e.shiftKey && !hasPrimaryMod) {
      e.preventDefault();
      adjustVolumeBy(0.1);
      return;
    }
    if (key === 'ArrowDown' && e.shiftKey && !hasPrimaryMod) {
      e.preventDefault();
      adjustVolumeBy(-0.1);
      return;
    }

    // Do not hijack browser shortcuts (Ctrl/Cmd + C, R, M, N, P, etc.)
    if (hasPrimaryMod) return;

    // Support both logical key and physical e.code so non-Latin keyboard layouts (IME, Arabic, Cyrillic, Greek) work ergonomics-first
    if (key === ' ' || code === 'Space' || lower === 'k' || code === 'KeyK') {
      e.preventDefault();
      togglePlayPause();
    } else if (lower === 'l' || code === 'KeyL') {
      e.preventDefault();
      playForward();
    } else if (lower === 'j' || code === 'KeyJ') {
      e.preventDefault();
      playReverse();
    } else if (key === ',' || code === 'Comma') {
      e.preventDefault();
      stepFrames(-1);
    } else if (key === '.' || code === 'Period') {
      e.preventDefault();
      stepFrames(1);
    } else if (lower === 'a' || code === 'KeyA') {
      e.preventDefault();
      stepSeconds(e.shiftKey ? -10 : -1);
    } else if (lower === 'd' || code === 'KeyD') {
      e.preventDefault();
      stepSeconds(e.shiftKey ? 10 : 1);
    } else if (key === '[' || code === 'BracketLeft') {
      e.preventDefault();
      stepSeconds(-15);
    } else if (key === ']' || code === 'BracketRight') {
      e.preventDefault();
      stepSeconds(15);
    } else if (lower === 'm' || code === 'KeyM') {
      e.preventDefault();
      if (e.shiftKey) handleToggleMute();
      else addMarkerAtCurrent();
    } else if (lower === 'p' || code === 'KeyP') {
      e.preventDefault();
      if (e.shiftKey) jumpPrevScene();
      else jumpPrevMarker();
    } else if (lower === 'n' || code === 'KeyN') {
      e.preventDefault();
      if (e.shiftKey) jumpNextScene();
      else jumpNextMarker();
    }
  };

  useEffect(() => {
    if (appMode !== 'edit') return;
    const listener = (e: KeyboardEvent) => globalKeyDownHandlerRef.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [appMode]);

  const currentFrameEntry = frameMapRef.current[currentFrameIndex] ?? null;
  const totalFrames = Math.max(
    frameMapRef.current.length,
    metadata?.estimatedTotalFrames ?? 0
  );
  const isOnMarker = useMemo(
    () => sortedMarkers.some((m) => Math.abs(m.frameIndex - currentFrameIndex) <= 1),
    [currentFrameIndex, sortedMarkers]
  );

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#0D0F12] text-[#F3F5F8] overflow-hidden">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="h-14 shrink-0 flex items-center justify-between gap-4 xl:gap-8 px-5 border-b border-[#222731] bg-[#111419]">
        {/* Zone 1: Single-line Brand Title + GitHub OSS Link */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (appMode === 'edit') return;
              setAppMode('select');
            }}
            className="inline-flex items-baseline gap-2 text-base font-bold tracking-tight text-[#F8FAFC] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{t('header.brandTitle')}</span>
            <span dir="ltr" className="font-mono-tabular text-xs font-medium text-[#94A0B2]">
              {t('header.versionLabel', { version: __APP_VERSION__ })}
            </span>
          </button>
          <a
            href="https://github.com/jakenjarvis/YouTubeVideoChapterMarker"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('header.githubRepoAriaLabel')}
            title={t('header.githubRepoTitle')}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-[#94A0B2] hover:text-[#F8FAFC] bg-[#161A22] hover:bg-[#1E2430] border border-[#262C37] hover:border-[#3A4354] rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <svg
              className="w-3.5 h-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            <span dir="ltr" className="hidden sm:inline font-mono-tabular">
              {t('header.githubRepoLabel')}
            </span>
          </a>
        </div>

        {/* Zone 2: Framed Utility Action Buttons */}
        <nav className="flex items-center gap-2 text-xs font-medium min-w-0">
          {appMode === 'edit' && (
            <>
              <button
                type="button"
                onClick={() => hiddenFileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[#CBD5E1] hover:text-[#F8FAFC] bg-[#161A22] hover:bg-[#1E2430] border border-[#2C3444] hover:border-[#424E63] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {t('header.openAnotherVideo')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setYouTubeModalError(null);
                  setYouTubeModalInitialTab('load');
                  setIsYouTubeModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[#CBD5E1] hover:text-[#F8FAFC] bg-[#161A22] hover:bg-[#1E2430] border border-[#2C3444] hover:border-[#424E63] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Youtube className="w-3.5 h-3.5" />
                {t('header.loadYouTube')}
              </button>
              <button
                type="button"
                onClick={() => setIsShortcutHelpOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[#CBD5E1] hover:text-[#F8FAFC] bg-[#161A22] hover:bg-[#1E2430] border border-[#2C3444] hover:border-[#424E63] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Keyboard className="w-3.5 h-3.5" />
                {t('header.shortcuts')}
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: Language Selector + Spreadsheet Edit + Primary Text Import & Export Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <LanguageSelector />
          {appMode === 'edit' ? (
            <>
              <button
                type="button"
                onClick={handleToggleSpreadsheetView}
                aria-pressed={workspaceView === 'spreadsheet'}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  workspaceView === 'spreadsheet'
                    ? 'text-[#0D0F12] bg-emerald-300 ring-2 ring-emerald-400/60'
                    : 'text-[#0D0F12] bg-emerald-400 hover:bg-emerald-300'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                {t('header.editAsSpreadsheet')}
              </button>
              <button
                type="button"
                onClick={() => setIsTextImportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0D0F12] bg-sky-400 hover:bg-sky-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {t('header.importTitles')}
              </button>
              <button
                type="button"
                onClick={() => setIsTextExportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                {t('header.importExportText')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => hiddenFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {t('header.openVideo')}
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
                    volume={volume}
                    controllerRef={youtubeControllerRef}
                    onReady={handleYouTubePlayerReady}
                    onPlaybackStateChange={handleYouTubePlaybackStateChange}
                  />
                ) : (
                  videoUrl && (
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      muted={isMuted || volume <= 0}
                      playsInline
                      preload="auto"
                      onClick={togglePlayPause}
                      onLoadedData={() => {
                        const v = videoRef.current;
                        if (v) {
                          v.volume = Math.max(0, Math.min(1, volume));
                          v.muted = isMuted || volume <= 0;
                          if (currentTimeSec > 0) {
                            v.currentTime = currentTimeSec;
                          }
                        }
                      }}
                      className="w-full h-full object-contain cursor-pointer"
                    />
                  )
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

              {/* Dual-Axis Scrubber, Conditional Zoomed Range Bar & Keyboard-Linked Transport Controls */}
              <TransportControls
                currentTimeSec={currentTimeSec}
                durationSec={metadata?.durationSec ?? 0}
                analyzedMaxTimeSec={progress.analyzedMaxTimeSec}
                playbackMode={playbackMode}
                markers={sortedMarkers}
                internalScenes={internalScenes}
                focusedSearchRange={focusedSearchRange}
                onClearSearchRange={() => {
                  setFocusedUntimedEntryId(null);
                  setSpreadsheetSearchRange(null);
                }}
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
                volume={volume}
                isMuted={isMuted}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
              />
            </div>

            {/* Draggable Vertical Boundary Line (Desktop) */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('workspace.splitterAriaLabel')}
              aria-valuenow={activeRightPanelWidth}
              aria-valuemin={
                workspaceView === 'spreadsheet' ? MIN_SPREADSHEET_WIDTH : MIN_SIDEBAR_WIDTH
              }
              tabIndex={0}
              title={t('workspace.splitterTitle')}
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

            {/* Right Column: Switches seamlessly between Timeline/Scenes and 2-Pane Spreadsheet Editor */}
            <aside
              style={isDesktopLayout ? { width: `${activeRightPanelWidth}px` } : undefined}
              className="w-full lg:w-auto shrink-0 flex flex-col border-t lg:border-t-0 bg-[#13161B] min-h-[520px] lg:min-h-0"
            >
              {workspaceView === 'spreadsheet' ? (
                <ChapterSpreadsheetPanel
                  entries={entries}
                  scratchpad={sessionScratchpad}
                  frames={frameMapRef.current}
                  durationSec={metadata?.durationSec ?? 0}
                  getCurrentTimeSec={getCurrentTimeSec}
                  onSeekToTime={seekToTime}
                  onPreviewAtTime={previewAtTime}
                  onSearchRangeChange={setSpreadsheetSearchRange}
                  onSave={handleSaveSpreadsheet}
                  onCancel={handleCancelSpreadsheet}
                  onDirtyChange={setIsSpreadsheetDirty}
                  cancelRequestToken={spreadsheetCancelRequest}
                />
              ) : (
                <>
                  {/* Axis Switcher: User Markers/Chapters vs Separate Reference Internal Scenes */}
                  <div className="p-2.5 border-b border-[#222731] bg-[#101318] shrink-0">
                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0D10] border border-[#222731] rounded-lg">
                      <button
                        type="button"
                        onClick={() => setRightTab('chapters')}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors min-w-0 cursor-pointer ${
                          rightTab === 'chapters'
                            ? 'bg-[#202530] text-amber-300'
                            : 'text-[#94A0B2] hover:text-[#F3F5F8]'
                        }`}
                      >
                        <Bookmark className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {t('workspace.tabMarkersChapters', { count: entries.length })}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRightTab('scenes')}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors min-w-0 cursor-pointer ${
                          rightTab === 'scenes'
                            ? 'bg-[#202530] text-sky-300'
                            : 'text-[#94A0B2] hover:text-[#F3F5F8]'
                        }`}
                      >
                        <Compass className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {t('workspace.tabInternalScenes', { count: internalScenes.length })}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Optional dismissible status notice */}
                  {statusNotice && (
                    <div className="px-3.5 py-2 border-b border-[#222731] bg-amber-500/10 flex items-center justify-between gap-2 text-xs text-amber-200 shrink-0">
                      <span className="leading-snug">{statusNotice}</span>
                      <button
                        type="button"
                        onClick={() => setStatusNotice(null)}
                        aria-label={t('workspace.dismissNotice')}
                        className="p-0.5 text-amber-300/80 hover:text-amber-100 shrink-0 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="flex-1 min-h-0 flex flex-col">
                    {rightTab === 'chapters' ? (
                      <ChapterTimelinePanel
                        entries={entries}
                        currentFrameIndex={currentFrameIndex}
                        currentTimeSec={currentTimeSec}
                        durationSec={metadata?.durationSec ?? 0}
                        playbackMode={playbackMode}
                        lastSelectedMarkerId={lastSelectedMarkerId}
                        focusedUntimedEntryId={focusedUntimedEntryId}
                        onSelectMarker={handleSelectMarker}
                        onFocusUntimedEntry={setFocusedUntimedEntryId}
                        onSeekToTime={seekToTime}
                        onAddMarkerAtCurrent={addMarkerAtCurrent}
                        onAssignCurrentTimeToEntry={assignCurrentTimeToEntry}
                        onDeleteMarker={deleteMarker}
                        onAddTitleForMarker={addTitleForMarker}
                        onInsertUntimedTitleAt={handleInsertUntimedTitleAt}
                        onUpdateTitleText={updateTitleText}
                        onDeleteTitle={deleteTitle}
                        onUnassignTitle={unassignTitle}
                        onMoveOrSwapTitleBetweenEntries={handleMoveOrSwapTitleBetweenEntries}
                        onStepEntryTitle={handleStepEntryTitle}
                        onShiftTitlesDownFromEntry={handleShiftTitlesDownFromEntry}
                        onAutoAssignUnassigned={autoAssignUnassigned}
                      />
                    ) : (
                      <InternalScenePanel
                        sourceType={metadata?.sourceType ?? 'local'}
                        scenes={internalScenes}
                        progress={progress}
                        currentFrameIndex={currentFrameIndex}
                        currentTimeSec={currentTimeSec}
                        durationSec={metadata?.durationSec ?? 0}
                        playbackMode={playbackMode}
                        lastSelectedSceneId={lastSelectedSceneId}
                        onSelectScene={handleSelectScene}
                        onJumpPrevScene={jumpPrevScene}
                        onJumpNextScene={jumpNextScene}
                      />
                    )}
                  </div>
                </>
              )}
            </aside>
          </main>
        </div>
      )}

      {/* Dedicated Chapter Text Import Popup */}
      <ChapterImportModal
        key={`import-${isTextImportOpen}`}
        isOpen={isTextImportOpen}
        onClose={() => setIsTextImportOpen(false)}
        onImportLines={handleImportUnifiedLines}
      />

      {/* Dedicated Chapter Text Export Popup */}
      <ChapterExportModal
        key={`export-${isTextExportOpen}`}
        isOpen={isTextExportOpen}
        markers={sortedMarkers}
        titles={titles}
        untimedTitleCount={untimedTitleCount}
        fileName={metadata?.fileName}
        videoDurationSec={metadata?.durationSec}
        onClose={() => setIsTextExportOpen(false)}
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
