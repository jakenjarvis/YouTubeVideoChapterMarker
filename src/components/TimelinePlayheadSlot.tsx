import React from 'react';
import type { PlaybackMode } from '../types/video';
import { formatTimecodeHMS } from '../utils/timecode';

export type PlayheadSlot =
  | { kind: 'none' }
  | { kind: 'on-item'; index: number }
  | { kind: 'before-first'; progress: number }
  | { kind: 'between'; afterIndex: number; progress: number }
  | { kind: 'after-last'; progress: number };

interface TimelinePoint {
  frameIndex: number;
  timeSec: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Computes a single mutually-exclusive playhead slot relative to a sorted list of timeline points:
 * directly on an item, before the first item, between item[i] and item[i+1], or after the last item.
 */
export function computePlayheadSlot(
  items: readonly TimelinePoint[],
  currentFrameIndex: number,
  currentTimeSec: number,
  durationSec: number,
  toleranceFrames: number
): PlayheadSlot {
  if (items.length === 0) return { kind: 'none' };

  // 1. Check if playhead is directly on (closest to) an item within tolerance
  let closestIdx = -1;
  let closestDist = Infinity;
  for (let i = 0; i < items.length; i++) {
    const dist = Math.abs(items[i].frameIndex - currentFrameIndex);
    if (dist <= toleranceFrames && dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }
  if (closestIdx !== -1) {
    return { kind: 'on-item', index: closestIdx };
  }

  // 2. Before the first item
  if (currentFrameIndex < items[0].frameIndex) {
    const firstSec = items[0].timeSec;
    const progress = firstSec > 0 ? clamp01(currentTimeSec / firstSec) : 0;
    return { kind: 'before-first', progress };
  }

  // 3. Find the last item strictly before currentFrameIndex
  let afterIdx = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i].frameIndex < currentFrameIndex) {
      afterIdx = i;
    } else {
      break;
    }
  }

  // 4. Between item[afterIdx] and item[afterIdx + 1]
  if (afterIdx < items.length - 1) {
    const prevSec = items[afterIdx].timeSec;
    const nextSec = items[afterIdx + 1].timeSec;
    const span = nextSec - prevSec;
    const progress = span > 0 ? clamp01((currentTimeSec - prevSec) / span) : 0;
    return { kind: 'between', afterIndex: afterIdx, progress };
  }

  // 5. After the last item
  const lastSec = items[afterIdx].timeSec;
  const span = durationSec - lastSec;
  const progress = span > 0 ? clamp01((currentTimeSec - lastSec) / span) : 1;
  return { kind: 'after-last', progress };
}

interface TimelinePlayheadGapProps {
  active: boolean;
  progress: number;
  currentTimeSec: number;
  playbackMode: PlaybackMode;
  accent: 'amber' | 'sky';
}

/**
 * Fixed-height gap slot between timeline items.
 * When active, renders a live playhead bar with interval progress and timecode without any vertical layout shift.
 */
export const TimelinePlayheadGap: React.FC<TimelinePlayheadGapProps> = ({
  active,
  progress,
  currentTimeSec,
  playbackMode,
  accent,
}) => {
  if (!active) {
    return <div className="h-2.5 shrink-0" aria-hidden="true" />;
  }

  const pct = Math.max(2, Math.min(100, Math.round(progress * 100)));
  const modeGlyph =
    playbackMode === 'forward' ? '▶' : playbackMode === 'reverse' ? '◀' : '●';

  const isAmber = accent === 'amber';
  const diamondClass = isAmber
    ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.85)]'
    : 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.85)]';
  const railClass = isAmber ? 'bg-amber-500/20' : 'bg-sky-500/20';
  const fillClass = isAmber ? 'bg-amber-400/90' : 'bg-sky-400/90';
  const tipClass = isAmber ? 'bg-amber-200' : 'bg-sky-200';
  const labelClass = isAmber ? 'text-amber-300' : 'text-sky-300';

  return (
    <div
      className="h-2.5 shrink-0 relative flex items-center px-1 overflow-visible select-none"
      role="status"
      aria-label={`現在位置 ${formatTimecodeHMS(currentTimeSec)}`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rotate-45 shrink-0 ${diamondClass}`}
      />
      <div className={`relative flex-1 h-[2px] ml-1.5 rounded-full ${railClass}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-75 ${fillClass}`}
          style={{ width: `${pct}%` }}
        />
        <span
          aria-hidden="true"
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${tipClass}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <span
        className={`ml-2 font-mono-tabular text-[10px] font-semibold leading-none whitespace-nowrap shrink-0 ${labelClass}`}
      >
        {modeGlyph} {formatTimecodeHMS(currentTimeSec)}
      </span>
    </div>
  );
};
