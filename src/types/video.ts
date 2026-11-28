export type AppMode = 'select' | 'loading' | 'edit';

export type PlaybackMode = 'paused' | 'forward' | 'reverse';

export interface AudioTrackInfo {
  index: number;
  codec: string;
  channels?: number;
  sampleRate?: number;
  language?: string;
}

export interface VideoMetadata {
  sourceType: 'local' | 'youtube';
  fileName: string;
  fileSize: number;
  mimeType: string;
  containerFormat: string;
  videoCodec: string;
  width: number;
  height: number;
  durationSec: number;
  averageFps: number;
  minFps: number;
  maxFps: number;
  isVfr: boolean;
  estimatedTotalFrames: number;
  audioTracks: AudioTrackInfo[];
  parseMethod: 'mp4-stts' | 'webm-ebml' | 'browser-fallback' | 'youtube-stream';
  youtubeVideoId?: string;
  youtubeUrl?: string;
  youtubeAuthor?: string;
  youtubeDescription?: string;
  youtubeChapterSource?: 'description' | 'youtube-chapters' | 'none';
  youtubeTitleIsFallback?: boolean;
}

export interface FrameMapEntry {
  /** 0-based sequential frame index in presentation order */
  frameIndex: number;
  /** Exact presentation timestamp in seconds */
  timeSec: number;
  /** Frame duration in seconds (varies per frame for VFR) */
  durationSec: number;
  /** Whether this frame is a sync/keyframe when container metadata provides it */
  isKeyFrame?: boolean;
}

export type SceneReason = 'visual' | 'audio' | 'both';

export interface InternalScene {
  id: string;
  sceneNumber: number;
  frameIndex: number;
  timeSec: number;
  reason: SceneReason;
  /** Normalized strength 0..1 */
  score: number;
  visualDelta: number;
  audioDelta: number;
}

export interface Marker {
  id: string;
  frameIndex: number;
  timeSec: number;
}

export interface ChapterTitle {
  id: string;
  text: string;
  /** Assigned Marker ID, or null if currently in the unassigned queue */
  assignedMarkerId: string | null;
  /** Explicit order for unassigned titles */
  unassignedOrder: number;
}

export interface AnalysisProgress {
  frameIndexPercent: number; // 0..100
  frameIndexDone: boolean;
  analyzedMaxTimeSec: number;
  analyzedFrameCount: number;
  sceneDetectPercent: number; // 0..100
  sceneDetectDone: boolean;
  sceneDetectStatus: 'idle' | 'running' | 'done' | 'error';
  elapsedMs: number;
  switchedToBackground: boolean;
}

/**
 * Unified order-preserving chapter row.
 * Supports:
 *  - Timed chapter (timeSec !== null, title.length > 0)
 *  - Untitled marker (timeSec !== null, title === '')
 *  - Untimed title row (timeSec === null, title.length > 0) preserving narrative order between timed rows
 */
export interface ChapterEntry {
  id: string;
  timeSec: number | null;
  frameIndex: number | null;
  title: string;
}

/**
 * Narrowed video interval inferred from neighboring timed chapters around an untimed row
 * (e.g. A..D when B and C are untimed between A and D).
 */
export interface FocusedSearchRange {
  targetKey: string;
  targetTitle: string;
  startSec: number;
  endSec: number;
  startLabel: string | null;
  endLabel: string | null;
  isNarrowed: boolean;
}

export type WorkspaceView = 'timeline' | 'spreadsheet';
export type SpreadsheetSyncMode = 'off' | 'seek' | 'preview10s';
export type SheetTheme = 'dark' | 'light';
export type SheetFontSize = 'sm' | 'md' | 'lg' | 'xl';

/** Sparse map of non-empty cells in columns C+ (colIndex >= 2) keyed by 0-based row index */
export type ScratchpadCells = Record<number, Record<number, string>>;

