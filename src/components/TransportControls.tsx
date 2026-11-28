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
  Crosshair,
  X,
} from 'lucide-react';
import type {
  FocusedSearchRange,
  InternalScene,
  Marker,
  PlaybackMode,
} from '../types/video';
import { formatTimecodeHMS } from '../utils/timecode';
import { useI18n } from '../i18n';

interface TransportControlsProps {
  currentTimeSec: number;
  durationSec: number;
  analyzedMaxTimeSec: number;
  playbackMode: PlaybackMode;
  markers: Marker[];
  internalScenes: InternalScene[];
  focusedSearchRange?: FocusedSearchRange | null;
  onClearSearchRange?: () => void;
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
  focusedSearchRange = null,
  onClearSearchRange,
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
  const zoomedScrubberRef = useRef<HTMLDivElement>(null);
  const safeDuration = Math.max(0.01, durationSec);
  const playheadPct = Math.max(0, Math.min(100, (currentTimeSec / safeDuration) * 100));
  const analyzedPct = Math.max(0, Math.min(100, (analyzedMaxTimeSec / safeDuration) * 100));

  const showZoomedRange =
    Boolean(focusedSearchRange) &&
    focusedSearchRange!.isNarrowed &&
    focusedSearchRange!.endSec > focusedSearchRange!.startSec + 0.05;

  const zoomStartSec = showZoomedRange ? focusedSearchRange!.startSec : 0;
  const zoomEndSec = showZoomedRange ? focusedSearchRange!.endSec : safeDuration;
  const zoomSpanSec = Math.max(0.05, zoomEndSec - zoomStartSec);
  const zoomMidSec = zoomStartSec + zoomSpanSec / 2;

  const zoomStartPctOnMain = Math.max(0, Math.min(100, (zoomStartSec / safeDuration) * 100));
  const zoomWidthPctOnMain = Math.max(
    0.5,
    Math.min(100 - zoomStartPctOnMain, (zoomSpanSec / safeDuration) * 100)
  );

  const playheadInZoom =
    currentTimeSec >= zoomStartSec - 0.02 && currentTimeSec <= zoomEndSec + 0.02;
  const zoomedPlayheadPct = Math.max(
    0,
    Math.min(100, ((currentTimeSec - zoomStartSec) / zoomSpanSec) * 100)
  );

  const zoomedScenes = showZoomedRange
    ? internalScenes.filter(
        (sc) => sc.timeSec >= zoomStartSec && sc.timeSec <= zoomEndSec
      )
    : [];

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

  const handleZoomedScrubPointer = (clientX: number) => {
    const el = zoomedScrubberRef.current;
    if (!el || !showZoomedRange) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const rawTarget = zoomStartSec + ratio * zoomSpanSec;
    const clampedTarget = Math.min(analyzedMaxTimeSec, Math.max(zoomStartSec, Math.min(zoomEndSec, rawTarget)));
    onSeekToTime(clampedTarget);
  };

  const handleZoomedPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleZoomedScrubPointer(e.clientX);
  };

  const handleZoomedPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    handleZoomedScrubPointer(e.clientX);
  };

  return (
    <div className="@container bg-[#14171C] border border-[#262B34] rounded-lg p-4 space-y-4">
      {/* Dual-Axis Interactive Scrubber */}
      <div className="space-y-2">
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

        {/* Full-Video Scrubber Track (strictly LTR time progression) */}
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
          {/* Narrowed Search Interval Highlight on Full-Video Bar */}
          {showZoomedRange && (
            <div
              className="absolute inset-y-0 bg-sky-500/20 border-x border-sky-400/75 pointer-events-none z-[5]"
              style={{
                left: `${zoomStartPctOnMain}%`,
                width: `${zoomWidthPctOnMain}%`,
              }}
            />
          )}
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

        {/* Zoomed Range Seekbar (only rendered when a narrowed search window is determined) */}
        {showZoomedRange && focusedSearchRange && (
          <div className="bg-[#0F131A] border border-sky-500/40 rounded-md px-3 py-2 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2 min-w-0">
                <Crosshair className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-sky-300 font-medium whitespace-nowrap">
                  {t('transport.zoomRangeLabel')}
                </span>
                {focusedSearchRange.targetTitle && (
                  <span
                    dir="auto"
                    className="text-[#E2E8F0] font-medium truncate max-w-[180px]"
                    title={focusedSearchRange.targetTitle}
                  >
                    {focusedSearchRange.targetTitle}
                  </span>
                )}
                <span aria-hidden="true" className="text-[#454E5E]">·</span>
                <span dir="ltr" className="font-mono-tabular text-sky-200/90 whitespace-nowrap">
                  {formatTimecodeHMS(zoomStartSec)} – {formatTimecodeHMS(zoomEndSec)}
                </span>
                <span dir="ltr" className="font-mono-tabular text-[#7D899B] whitespace-nowrap">
                  ({formatTimecodeHMS(zoomSpanSec)})
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onSeekToTime(zoomStartSec)}
                  className="px-2 py-0.5 text-[11px] font-medium text-[#CBD5E1] hover:text-sky-200 bg-[#171D27] hover:bg-[#1F2735] border border-[#283244] rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  {t('transport.zoomJumpStart')}
                </button>
                <button
                  type="button"
                  onClick={() => onSeekToTime(zoomMidSec)}
                  className="px-2 py-0.5 text-[11px] font-medium text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/35 rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  {t('transport.zoomJumpMid')}
                </button>
                {onClearSearchRange && (
                  <button
                    type="button"
                    onClick={onClearSearchRange}
                    title={t('transport.zoomCloseTitle')}
                    aria-label={t('transport.zoomCloseTitle')}
                    className="p-0.5 text-[#7D899B] hover:text-[#F8FAFC] hover:bg-[#1F2735] rounded transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 100%-Width Zoomed Scrubbing Track (strictly LTR) */}
            <div
              ref={zoomedScrubberRef}
              dir="ltr"
              onPointerDown={handleZoomedPointerDown}
              onPointerMove={handleZoomedPointerMove}
              role="slider"
              aria-label={t('transport.zoomSeekBarAriaLabel')}
              aria-valuemin={Math.round(zoomStartSec)}
              aria-valuemax={Math.round(zoomEndSec)}
              aria-valuenow={Math.round(
                Math.max(zoomStartSec, Math.min(zoomEndSec, currentTimeSec))
              )}
              tabIndex={0}
              className="relative h-9 bg-[#090C10] border border-sky-500/35 rounded cursor-ew-resize select-none overflow-hidden"
            >
              {/* Subtle quarter gridlines for visual precision */}
              <div className="absolute inset-y-0 left-1/4 w-px bg-[#1B2230] pointer-events-none" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-[#243044] pointer-events-none" />
              <div className="absolute inset-y-0 left-3/4 w-px bg-[#1B2230] pointer-events-none" />

              {/* Elapsed fill inside zoomed interval */}
              {playheadInZoom && (
                <div
                  className="absolute inset-y-0 left-0 bg-sky-500/15 pointer-events-none"
                  style={{ width: `${zoomedPlayheadPct}%` }}
                />
              )}

              {/* Internal scene ticks inside this narrowed interval */}
              {zoomedScenes.map((sc) => {
                const pct = Math.max(
                  0,
                  Math.min(100, ((sc.timeSec - zoomStartSec) / zoomSpanSec) * 100)
                );
                return (
                  <button
                    key={`z-${sc.id}`}
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
                    style={{ left: `${pct}%` }}
                    className="absolute bottom-0 -translate-x-1/2 w-2.5 h-5 flex items-end justify-center group cursor-pointer z-10"
                  >
                    <span className="w-0.5 h-3.5 bg-cyan-400/80 group-hover:bg-cyan-300 group-hover:h-4 transition-all block" />
                  </button>
                );
              })}

              {/* Playhead inside zoomed interval or edge indicator if currently outside */}
              {playheadInZoom ? (
                <div
                  className="absolute inset-y-0 w-0.5 bg-sky-400 pointer-events-none z-20"
                  style={{ left: `${zoomedPlayheadPct}%` }}
                >
                  <div className="w-2.5 h-1.5 bg-sky-400 -translate-x-[4px] rounded-b-xs" />
                </div>
              ) : (
                <div
                  className={`absolute inset-y-0 flex items-center px-1.5 text-[10px] font-mono-tabular text-sky-300/75 pointer-events-none z-20 ${
                    currentTimeSec < zoomStartSec ? 'left-0' : 'right-0'
                  }`}
                >
                  {currentTimeSec < zoomStartSec ? '◀' : '▶'}
                </div>
              )}
            </div>

            {/* Boundary Labels (Start Chapter ... End Chapter) */}
            {(focusedSearchRange.startLabel || focusedSearchRange.endLabel) && (
              <div className="flex items-center justify-between gap-4 text-[10px] text-[#7D899B]">
                <span dir="auto" className="truncate max-w-[45%]">
                  {focusedSearchRange.startLabel
                    ? `${formatTimecodeHMS(zoomStartSec)} ${focusedSearchRange.startLabel}`
                    : formatTimecodeHMS(zoomStartSec)}
                </span>
                <span dir="auto" className="truncate max-w-[45%] text-end">
                  {focusedSearchRange.endLabel
                    ? `${formatTimecodeHMS(zoomEndSec)} ${focusedSearchRange.endLabel}`
                    : formatTimecodeHMS(zoomEndSec)}
                </span>
              </div>
            )}
          </div>
        )}
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
