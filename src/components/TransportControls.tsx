import React, { useRef } from 'react';
import {
  Play,
  Pause,
  Rewind,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { InternalScene, Marker, PlaybackMode } from '../types/video';
import { formatTimecodeHMS } from '../utils/timecode';
import { useI18n } from '../i18n';

interface TransportControlsProps {
  currentTimeSec: number;
  durationSec: number;
  analyzedMaxTimeSec: number;
  playbackMode: PlaybackMode;
  markers: Marker[];
  internalScenes: InternalScene[];
  onPlayForward: () => void;
  onPlayReverse: () => void;
  onPause: () => void;
  onStepFrames: (deltaFrames: number) => void;
  onStepSeconds: (deltaSeconds: number) => void;
  onSeekToTime: (timeSec: number) => void;
  onSeekToFrame: (frameIndex: number) => void;
  onAddMarkerAtCurrent: () => void;
  onJumpPrevMarker: () => void;
  onJumpNextMarker: () => void;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

export const TransportControls: React.FC<TransportControlsProps> = ({
  currentTimeSec,
  durationSec,
  analyzedMaxTimeSec,
  playbackMode,
  markers,
  internalScenes,
  onPlayForward,
  onPlayReverse,
  onPause,
  onStepFrames,
  onStepSeconds,
  onSeekToTime,
  onSeekToFrame,
  onAddMarkerAtCurrent,
  onJumpPrevMarker,
  onJumpNextMarker,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
}) => {
  const { t, tp } = useI18n();
  const effectiveVolume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
  const volumePercent = Math.round(effectiveVolume * 100);
  const VolumeIcon =
    volumePercent === 0 ? VolumeX : volumePercent <= 50 ? Volume1 : Volume2;
  const scrubberRef = useRef<HTMLDivElement>(null);
  const safeDuration = Math.max(0.01, durationSec);
  const playheadPct = Math.max(0, Math.min(100, (currentTimeSec / safeDuration) * 100));
  const analyzedPct = Math.max(0, Math.min(100, (analyzedMaxTimeSec / safeDuration) * 100));

  const handleScrubPointer = (clientX: number) => {
    const el = scrubberRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const targetSec = Math.min(analyzedMaxTimeSec, ratio * safeDuration);
    onSeekToTime(targetSec);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleScrubPointer(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    handleScrubPointer(e.clientX);
  };

  return (
    <div className="@container bg-[#14171C] border border-[#262B34] rounded-lg p-4 space-y-4">
      {/* Dual-Axis Interactive Scrubber */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-[#94A0B2]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 bg-amber-400 inline-block rounded-[1px]" aria-hidden="true" />
              {t('transport.markersLegend', { count: markers.length })}
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 bg-sky-400 inline-block rounded-[1px]" aria-hidden="true" />
              {t('transport.internalScenesLegend', { count: internalScenes.length })}
            </span>
          </div>
          <span className="font-mono-tabular text-[#647082]">
            {t('transport.playableRange', { timecode: formatTimecodeHMS(analyzedMaxTimeSec) })}
          </span>
        </div>

        {/* Scrubber Track (strictly LTR time progression) */}
        <div
          ref={scrubberRef}
          dir="ltr"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          role="slider"
          aria-label={t('transport.seekBarAriaLabel')}
          aria-valuemin={0}
          aria-valuemax={Math.round(durationSec)}
          aria-valuenow={Math.round(currentTimeSec)}
          tabIndex={0}
          className="relative h-12 bg-[#0D0F12] border border-[#242933] rounded-md cursor-ew-resize select-none overflow-hidden"
        >
          {/* Analyzed range background */}
          <div
            className="absolute inset-y-0 left-0 bg-[#181C24]"
            style={{ width: `${analyzedPct}%` }}
          />
          {/* Elapsed fill on main upper lane */}
          <div
            className="absolute top-0 bottom-4 left-0 bg-amber-500/15 pointer-events-none"
            style={{ width: `${playheadPct}%` }}
          />

          {/* Horizontal lane divider between Marker Lane (top) and Internal Scene Reference Lane (bottom) */}
          <div className="absolute inset-x-0 bottom-4 h-px bg-[#222732] pointer-events-none" />

          {/* User Marker Pins (Primary Axis - Upper Lane) */}
          {markers.map((m) => {
            const leftPct = Math.max(0, Math.min(100, (m.timeSec / safeDuration) * 100));
            return (
              <button
                key={m.id}
                type="button"
                title={t('transport.markerPinTitle', {
                  timecode: formatTimecodeHMS(m.timeSec),
                  frame: m.frameIndex,
                })}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSeekToFrame(m.frameIndex);
                }}
                style={{ left: `${leftPct}%` }}
                className="absolute top-0.5 -translate-x-1/2 w-2.5 h-6 flex flex-col items-center group cursor-pointer z-10"
              >
                <span className="w-2 h-2 bg-amber-400 rotate-45 block group-hover:scale-125 transition-transform" />
                <span className="w-0.5 flex-1 bg-amber-400/80 block" />
              </button>
            );
          })}

          {/* Internal Scene Reference Ticks (Strictly Separate Axis - Bottom Lane) */}
          {internalScenes.map((sc) => {
            const leftPct = Math.max(0, Math.min(100, (sc.timeSec / safeDuration) * 100));
            return (
              <button
                key={sc.id}
                type="button"
                title={t('transport.sceneTickTitle', {
                  sceneNumber: sc.sceneNumber,
                  timecode: formatTimecodeHMS(sc.timeSec),
                  frame: sc.frameIndex,
                })}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSeekToFrame(sc.frameIndex);
                }}
                style={{ left: `${leftPct}%` }}
                className="absolute bottom-0 -translate-x-1/2 w-2 h-4 flex items-end justify-center group cursor-pointer z-10"
              >
                <span className="w-0.5 h-3 bg-sky-400/75 group-hover:bg-sky-300 group-hover:h-3.5 transition-all block" />
              </button>
            );
          })}

          {/* Active Playhead */}
          <div
            className="absolute inset-y-0 w-0.5 bg-amber-400 pointer-events-none z-20"
            style={{ left: `${playheadPct}%` }}
          >
            <div className="w-2.5 h-1.5 bg-amber-400 -translate-x-[4px] rounded-b-xs" />
          </div>
        </div>
      </div>

      {/* Row 1: Primary Playback Transport + Add Marker CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div dir="ltr" className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onPlayReverse}
            title={t('transport.reverseTitle')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              playbackMode === 'reverse'
                ? 'bg-sky-500/20 text-sky-300 border-sky-400/60'
                : 'bg-[#1B1F27] text-[#E2E8F0] border-[#2C3340] hover:bg-[#232934]'
            }`}
          >
            <Rewind className="w-3.5 h-3.5" />
            {t('transport.reverseLabel')}
            <kbd className="text-[10px] font-mono-tabular text-[#647082] ml-0.5">J</kbd>
          </button>

          <button
            type="button"
            onClick={playbackMode === 'paused' ? onPlayForward : onPause}
            title={t('transport.playPauseTitle')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              playbackMode === 'paused'
                ? 'bg-[#232934] text-[#F8FAFC] border-[#384152] hover:bg-[#2C3342]'
                : 'bg-[#1B1F27] text-[#E2E8F0] border-[#2C3340] hover:bg-[#232934]'
            }`}
          >
            {playbackMode === 'paused' ? (
              <>
                <Play className="w-3.5 h-3.5" />
                {t('transport.pausedLabel')}
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                {t('transport.stopLabel')}
              </>
            )}
            <kbd className="text-[10px] font-mono-tabular text-[#647082] ml-0.5">K</kbd>
          </button>

          <button
            type="button"
            onClick={onPlayForward}
            title={t('transport.forwardTitle')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              playbackMode === 'forward'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/60'
                : 'bg-[#1B1F27] text-[#E2E8F0] border-[#2C3340] hover:bg-[#232934]'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            {t('transport.forwardLabel')}
            <kbd className="text-[10px] font-mono-tabular text-[#647082] ml-0.5">L</kbd>
          </button>

          <div className="h-5 w-px bg-[#262B34] mx-1 hidden sm:block" />

          {/* Prev / Next Marker Navigation */}
          <button
            type="button"
            onClick={onJumpPrevMarker}
            disabled={markers.length === 0}
            title={t('transport.prevMarkerTitle')}
            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-md bg-[#1B1F27] text-[#CBD5E1] border border-[#2C3340] hover:bg-[#232934] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <SkipBack className="w-3.5 h-3.5" />
            {t('transport.prevMarkerLabel')}
          </button>
          <button
            type="button"
            onClick={onJumpNextMarker}
            disabled={markers.length === 0}
            title={t('transport.nextMarkerTitle')}
            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-md bg-[#1B1F27] text-[#CBD5E1] border border-[#2C3340] hover:bg-[#232934] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            {t('transport.nextMarkerLabel')}
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Audio Volume / Mute Control + Primary Add Marker CTA */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            dir="ltr"
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#101318] border border-[#242933] shrink-0"
          >
            <button
              type="button"
              onClick={onToggleMute}
              title={volumePercent === 0 ? t('transport.unmuteTitle') : t('transport.muteTitle')}
              aria-label={
                volumePercent === 0 ? t('transport.unmuteTitle') : t('transport.muteTitle')
              }
              aria-pressed={volumePercent === 0}
              className={`p-0.5 rounded transition-colors cursor-pointer ${
                volumePercent === 0
                  ? 'text-red-400 hover:text-red-300'
                  : 'text-[#CBD5E1] hover:text-amber-300'
              }`}
            >
              <VolumeIcon className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volumePercent}
              onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
              aria-label={t('transport.volumeSliderAriaLabel')}
              aria-valuetext={t('transport.volumePercentLabel', { percent: volumePercent })}
              title={t('transport.volumePercentLabel', { percent: volumePercent })}
              className="w-20 h-1.5 accent-amber-400 cursor-pointer"
            />
            <span className="font-mono-tabular text-[11px] text-[#94A0B2] w-8 text-right select-none">
              {volumePercent}%
            </span>
          </div>

          <button
            type="button"
            onClick={onAddMarkerAtCurrent}
            title={t('transport.addMarkerTitle')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookmarkPlus className="w-4 h-4" />
            {t('transport.addMarkerLabel')}
            <kbd className="text-[10px] font-mono-tabular px-1 py-0.5 rounded bg-black/15 text-[#0D0F12]">M</kbd>
          </button>
        </div>
      </div>

      {/* Row 2: Precision Frame Skip (1, 10, 30) & Second Skip (1, 10, 15) */}
      <div className="pt-3 border-t border-[#222731] grid grid-cols-1 @[780px]:grid-cols-2 gap-3">
        {/* Frame Stepping / Skipping */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#101318] border border-[#212630] rounded-md px-3 py-2">
          <span className="text-[11px] font-medium text-[#94A0B2] whitespace-nowrap shrink-0">
            {t('transport.frameMoveLabel')}
          </span>
          <div dir="ltr" className="flex items-center gap-1">
            {[-30, -10, -1, 1, 10, 30].map((delta) => {
              const isSingle = Math.abs(delta) === 1;
              const signedDelta = delta > 0 ? `+${delta}` : String(delta);
              return (
                <button
                  key={delta}
                  type="button"
                  onClick={() => onStepFrames(delta)}
                  title={tp('transport.frameMoveButtonTitle', Math.abs(delta), {
                    delta: signedDelta,
                  })}
                  className={`inline-flex items-center justify-center gap-0.5 px-2.5 py-1.5 text-xs font-mono-tabular rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSingle
                      ? 'bg-[#242B37] text-[#F8FAFC] hover:bg-amber-500/25 hover:text-amber-200 font-semibold'
                      : 'bg-[#191E26] text-[#CBD5E1] hover:bg-[#252C38]'
                  }`}
                >
                  {delta === -1 && <ChevronLeft className="w-3 h-3" />}
                  <span>
                    {t('transport.frameDeltaButton', { delta: signedDelta })}
                  </span>
                  {delta === 1 && <ChevronRight className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Second Skipping */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#101318] border border-[#212630] rounded-md px-3 py-2">
          <span className="text-[11px] font-medium text-[#94A0B2] whitespace-nowrap shrink-0">
            {t('transport.secondSkipLabel')}
          </span>
          <div dir="ltr" className="flex items-center gap-1">
            {[-15, -10, -1, 1, 10, 15].map((delta) => {
              const isSingle = Math.abs(delta) === 1;
              const signedDelta = delta > 0 ? `+${delta}` : String(delta);
              return (
                <button
                  key={delta}
                  type="button"
                  onClick={() => onStepSeconds(delta)}
                  title={tp('transport.secondSkipButtonTitle', Math.abs(delta), {
                    delta: signedDelta,
                  })}
                  className={`inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-mono-tabular rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSingle
                      ? 'bg-[#242B37] text-[#F8FAFC] hover:bg-amber-500/25 hover:text-amber-200 font-semibold'
                      : 'bg-[#191E26] text-[#CBD5E1] hover:bg-[#252C38]'
                  }`}
                >
                  {t('transport.secondDeltaButton', { delta: signedDelta })}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
