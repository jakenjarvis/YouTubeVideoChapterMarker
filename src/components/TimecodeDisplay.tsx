import React from 'react';
import type { FrameMapEntry, PlaybackMode, VideoMetadata } from '../types/video';
import { splitTimecodeParts } from '../utils/timecode';

interface TimecodeDisplayProps {
  currentFrame: FrameMapEntry | null;
  currentFrameIndex: number;
  totalFrames: number;
  currentTimeSec: number;
  durationSec: number;
  playbackMode: PlaybackMode;
  metadata: VideoMetadata | null;
  isOnMarker: boolean;
}

export const TimecodeDisplay: React.FC<TimecodeDisplayProps> = ({
  currentFrame,
  currentFrameIndex,
  totalFrames,
  currentTimeSec,
  durationSec,
  playbackMode,
  metadata,
  isOnMarker,
}) => {
  const { hms, ms, totalSecondsFormatted } = splitTimecodeParts(currentTimeSec);
  const frameDigits = Math.max(5, String(Math.max(1, totalFrames)).length);
  const paddedFrame = String(currentFrameIndex).padStart(frameDigits, '0');
  const paddedTotal = String(Math.max(0, totalFrames - 1)).padStart(frameDigits, '0');

  const instantaneousFps =
    currentFrame && currentFrame.durationSec > 0
      ? 1 / currentFrame.durationSec
      : metadata?.averageFps ?? 30;

  const playbackLabel =
    playbackMode === 'forward'
      ? '順再生'
      : playbackMode === 'reverse'
        ? '逆再生'
        : '停止中';

  return (
    <section
      aria-label="現在のシーク位置"
      className="@container bg-[#111419] border border-[#262B34] rounded-lg px-5 py-4"
    >
      <div className="grid grid-cols-1 @[780px]:grid-cols-12 gap-4 items-end">
        {/* Primary Large Timecode HH:MM:SS.mmm */}
        <div className="@[780px]:col-span-5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-[#94A0B2] mb-1">
            <span>シーク位置（タイムコード）</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                playbackMode === 'forward'
                  ? 'text-emerald-400 font-medium'
                  : playbackMode === 'reverse'
                    ? 'text-sky-400 font-medium'
                    : 'text-[#94A0B2]'
              }
            >
              {playbackLabel}
            </span>
            {isOnMarker && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400 font-medium">マーク位置</span>
              </>
            )}
          </div>
          <div className="flex items-baseline gap-1 font-mono-tabular leading-none tracking-tight">
            <span className="text-4xl @[520px]:text-5xl font-bold text-[#F8FAFC]">{hms}</span>
            <span className="text-xl @[520px]:text-2xl font-medium text-[#647082]">.{ms}</span>
          </div>
        </div>

        {/* Large Exact Frame Number */}
        <div className="@[780px]:col-span-4 @[780px]:border-l @[780px]:border-[#242933] @[780px]:pl-5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-[#94A0B2] mb-1">
            <span>フレーム番号</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {instantaneousFps.toFixed(2)} fps{metadata?.isVfr ? ' (VFR)' : ''}
            </span>
          </div>
          <div className="flex items-baseline gap-2 font-mono-tabular leading-none tracking-tight flex-wrap">
            <span className="text-3xl @[520px]:text-4xl font-bold text-amber-400">#{paddedFrame}</span>
            <span className="text-sm @[520px]:text-base text-[#647082]">/ {paddedTotal}</span>
          </div>
        </div>

        {/* Large Exact Seconds */}
        <div className="@[780px]:col-span-3 @[780px]:border-l @[780px]:border-[#242933] @[780px]:pl-5 min-w-0">
          <div className="flex items-center gap-2 text-xs text-[#94A0B2] mb-1">
            <span>経過秒数</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">/ {durationSec.toFixed(2)} s</span>
          </div>
          <div className="flex items-baseline gap-1.5 font-mono-tabular leading-none tracking-tight">
            <span className="text-3xl @[520px]:text-4xl font-bold text-[#E2E8F0]">
              {totalSecondsFormatted}
            </span>
            <span className="text-base font-medium text-[#647082]">s</span>
          </div>
        </div>
      </div>
    </section>
  );
};
