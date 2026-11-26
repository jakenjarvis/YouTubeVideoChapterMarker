import React from 'react';
import { Loader2, SkipBack, SkipForward, Compass } from 'lucide-react';
import type { AnalysisProgress, InternalScene, PlaybackMode } from '../types/video';
import { splitTimecodeParts } from '../utils/timecode';
import { computePlayheadSlot, TimelinePlayheadGap } from './TimelinePlayheadSlot';
import { useI18n, type TranslationKey } from '../i18n';

interface InternalScenePanelProps {
  sourceType: 'local' | 'youtube';
  scenes: InternalScene[];
  progress: AnalysisProgress;
  currentFrameIndex: number;
  currentTimeSec: number;
  durationSec: number;
  playbackMode: PlaybackMode;
  lastSelectedSceneId: string | null;
  onSelectScene: (sceneId: string, frameIndex: number) => void;
  onJumpPrevScene: () => void;
  onJumpNextScene: () => void;
}

const reasonKeyMap: Record<InternalScene['reason'], TranslationKey> = {
  visual: 'scenes.reasonVisual',
  audio: 'scenes.reasonAudio',
  both: 'scenes.reasonBoth',
};

export const InternalScenePanel: React.FC<InternalScenePanelProps> = ({
  sourceType,
  scenes,
  progress,
  currentFrameIndex,
  currentTimeSec,
  durationSec,
  playbackMode,
  lastSelectedSceneId,
  onSelectScene,
  onJumpPrevScene,
  onJumpNextScene,
}) => {
  const { t } = useI18n();
  const playheadSlot = computePlayheadSlot(
    scenes,
    currentFrameIndex,
    currentTimeSec,
    durationSec,
    2
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Explicit Separation Notice + Reference Axis Prev/Next Controls */}
      <div className="px-4 py-3 border-b border-[#222731] space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-[#94A0B2] flex items-center gap-2 font-mono-tabular">
            <span className="text-sky-400 font-medium">
              {t('scenes.detectedCount', { count: scenes.length })}
            </span>
            <span aria-hidden="true" className="text-[#454E5E]">·</span>
            {progress.sceneDetectStatus === 'running' ? (
              <span className="inline-flex items-center gap-1 text-sky-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('scenes.detectingPercent', { percent: progress.sceneDetectPercent })}
              </span>
            ) : (
              <span>{t('scenes.analyzedPercent', { percent: progress.sceneDetectPercent })}</span>
            )}
          </div>

          <div dir="ltr" className="flex items-center gap-1">
            <button
              type="button"
              onClick={onJumpPrevScene}
              disabled={scenes.length === 0}
              title={t('scenes.prevSceneTitle')}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 rounded disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              <SkipBack className="w-3 h-3" />
              {t('scenes.prevSceneLabel')}
            </button>
            <button
              type="button"
              onClick={onJumpNextScene}
              disabled={scenes.length === 0}
              title={t('scenes.nextSceneTitle')}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 rounded disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              {t('scenes.nextSceneLabel')}
              <SkipForward className="w-3 h-3" />
            </button>
          </div>
        </div>

        <p className="text-[11px] text-[#7D899B] leading-relaxed">
          {t('scenes.separationNotice')}
        </p>
      </div>

      {/* Reference Scene List */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-1.5">
        {scenes.length === 0 ? (
          <div className="my-1.5 py-10 px-4 text-center border border-dashed border-[#272D38] rounded-lg bg-[#111419]">
            <Compass className="w-6 h-6 text-[#647082] mx-auto mb-2.5" />
            <p className="text-sm font-medium text-[#E2E8F0]">
              {sourceType === 'youtube'
                ? t('scenes.emptyYouTubeTitle')
                : progress.sceneDetectStatus === 'running'
                  ? t('scenes.emptyRunningTitle')
                  : t('scenes.emptyNoneTitle')}
            </p>
            <p className="mt-1.5 text-xs text-[#94A0B2] leading-relaxed">
              {sourceType === 'youtube'
                ? t('scenes.emptyYouTubeDesc')
                : t('scenes.emptyLocalDesc')}
            </p>
          </div>
        ) : (
          <>
            <TimelinePlayheadGap
              active={playheadSlot.kind === 'before-first'}
              progress={playheadSlot.kind === 'before-first' ? playheadSlot.progress : 0}
              currentTimeSec={currentTimeSec}
              playbackMode={playbackMode}
              accent="sky"
            />
            {scenes.map((scene, idx) => {
              const { hms, ms } = splitTimecodeParts(scene.timeSec);
              const isNearCurrent =
                playheadSlot.kind === 'on-item' && playheadSlot.index === idx;
              const isLastSelected = lastSelectedSceneId === scene.id;
              const isGapActiveAfter =
                (playheadSlot.kind === 'between' && playheadSlot.afterIndex === idx) ||
                (playheadSlot.kind === 'after-last' && idx === scenes.length - 1);
              const gapProgressAfter =
                playheadSlot.kind === 'between' && playheadSlot.afterIndex === idx
                  ? playheadSlot.progress
                  : playheadSlot.kind === 'after-last' && idx === scenes.length - 1
                    ? playheadSlot.progress
                    : 0;

              return (
                <React.Fragment key={scene.id}>
                  <button
                    type="button"
                    onClick={() => onSelectScene(scene.id, scene.frameIndex)}
                    className={`w-full text-start px-3 py-2.5 rounded-md border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                      isNearCurrent
                        ? 'bg-sky-500/[0.15] border-sky-400/80'
                        : isLastSelected
                          ? 'bg-sky-500/[0.08] border-dashed border-sky-400/80 hover:border-sky-400'
                          : 'bg-[#14171D] border-[#222731] hover:border-sky-500/40 hover:bg-[#181C24]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 font-mono-tabular flex-wrap">
                        <span dir="ltr" className="text-xs text-sky-400 font-semibold">
                          {t('scenes.sceneIndexBadge', {
                            number: String(scene.sceneNumber).padStart(2, '0'),
                          })}
                        </span>
                        <span
                          dir="ltr"
                          className={`text-sm font-bold ${
                            isNearCurrent
                              ? 'text-sky-300'
                              : isLastSelected
                                ? 'text-sky-200'
                                : 'text-[#F3F5F8]'
                          }`}
                        >
                          {hms}
                          <span className="text-xs font-normal text-[#647082]">.{ms}</span>
                        </span>
                        <span dir="ltr" className="text-xs text-[#94A0B2]">#{scene.frameIndex}</span>
                        {isLastSelected && !isNearCurrent && (
                          <span className="font-sans text-[10px] font-medium text-sky-300/90 whitespace-nowrap">
                            {t('scenes.selectedPosition')}
                          </span>
                        )}
                        {isNearCurrent && (
                          <span className="font-sans text-[10px] font-semibold text-sky-300 whitespace-nowrap">
                            {t('scenes.currentPosition')}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#7D899B] flex items-center gap-2">
                        <span>{t(reasonKeyMap[scene.reason])}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">
                          {t('scenes.changeScore', { score: Math.round(scene.score * 100) })}
                        </span>
                      </div>
                    </div>

                    <span className="text-[11px] text-sky-400/90 font-medium whitespace-nowrap shrink-0">
                      {t('scenes.seekAction')}
                    </span>
                  </button>
                  <TimelinePlayheadGap
                    active={isGapActiveAfter}
                    progress={gapProgressAfter}
                    currentTimeSec={currentTimeSec}
                    playbackMode={playbackMode}
                    accent="sky"
                  />
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
