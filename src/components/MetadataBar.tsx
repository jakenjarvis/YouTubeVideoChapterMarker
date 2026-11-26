import React from 'react';
import { Loader2, Check } from 'lucide-react';
import type { AnalysisProgress, VideoMetadata } from '../types/video';
import { formatFileSize, formatTimecodeHMS } from '../utils/timecode';
import { useI18n } from '../i18n';

interface MetadataBarProps {
  metadata: VideoMetadata;
  progress: AnalysisProgress;
  onInspectYouTubeDescription?: () => void;
}

export const MetadataBar: React.FC<MetadataBarProps> = ({
  metadata,
  progress,
  onInspectYouTubeDescription,
}) => {
  const { t, formatNumber } = useI18n();
  const isBgProcessing = !progress.frameIndexDone || progress.sceneDetectStatus === 'running';
  const isYouTube = metadata.sourceType === 'youtube';

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-2.5 bg-[#12151A] border-b border-[#222731] text-xs">
      {/* Unboxed Clean Technical Metadata with Typographic Separators */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[#94A0B2] min-w-0">
        <span className="font-medium text-[#F3F5F8] truncate max-w-[280px]" title={metadata.fileName}>
          {metadata.fileName}
        </span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span>{metadata.containerFormat}</span>
        {isYouTube && metadata.youtubeAuthor && (
          <>
            <span aria-hidden="true" className="text-[#454E5E]">·</span>
            <span className="truncate max-w-[160px]" title={metadata.youtubeAuthor}>
              {metadata.youtubeAuthor}
            </span>
          </>
        )}
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span>{metadata.videoCodec}</span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span dir="ltr" className="font-mono-tabular">
          {metadata.width}×{metadata.height}
        </span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span dir="ltr" className="font-mono-tabular text-[#CBD5E1]">
          {t('metadata.fpsWithMode', {
            fps: metadata.averageFps.toFixed(2),
            mode: metadata.isVfr ? t('metadata.vfrShort') : t('metadata.cfrShort'),
          })}
        </span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span dir="ltr" className="font-mono-tabular">{formatTimecodeHMS(metadata.durationSec)}</span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span>
          {t('metadataBar.audioPrefix')}{' '}
          {metadata.audioTracks.length > 0
            ? metadata.audioTracks.map((tr) => tr.codec).join(', ')
            : t('metadataBar.audioNone')}
        </span>
        {!isYouTube && (
          <>
            <span aria-hidden="true" className="text-[#454E5E]">·</span>
            <span className="font-mono-tabular text-[#647082]">
              {formatFileSize(metadata.fileSize)}
            </span>
          </>
        )}
        {isYouTube && onInspectYouTubeDescription && (
          <>
            <span aria-hidden="true" className="text-[#454E5E]">·</span>
            <button
              type="button"
              onClick={onInspectYouTubeDescription}
              className="text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors whitespace-nowrap cursor-pointer"
            >
              {t('metadataBar.inspectYouTubeDescription')}
            </button>
          </>
        )}
      </div>

      {/* Live Background Processing Progress % (Step 2 / Step 3 / Step 4 requirement) */}
      <div className="flex items-center gap-4 shrink-0 font-mono-tabular">
        {!progress.frameIndexDone ? (
          <div className="flex items-center gap-2 text-amber-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t('metadataBar.frameAnalysisProgress', { percent: progress.frameIndexPercent })}</span>
            <div className="w-20 h-1.5 bg-[#222731] rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-[width] duration-150"
                style={{ width: `${progress.frameIndexPercent}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-[#647082]">
            {t('metadataBar.frameMapCount', { count: formatNumber(progress.analyzedFrameCount) })}
          </span>
        )}

        {isYouTube ? (
          <div className="flex items-center gap-1.5 text-[#94A0B2]">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('metadataBar.youtubeLoaded')}</span>
          </div>
        ) : progress.sceneDetectStatus === 'running' ? (
          <div className="flex items-center gap-2 text-sky-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{t('metadataBar.bgSceneDetectProgress', { percent: progress.sceneDetectPercent })}</span>
            <div className="w-24 h-1.5 bg-[#222731] rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-[width] duration-150"
                style={{ width: `${progress.sceneDetectPercent}%` }}
              />
            </div>
          </div>
        ) : progress.sceneDetectDone ? (
          <div className="flex items-center gap-1.5 text-[#94A0B2]">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('metadataBar.analysisDone')}</span>
          </div>
        ) : !isBgProcessing && progress.sceneDetectStatus === 'error' ? (
          <span className="text-red-400">{t('metadataBar.sceneDetectAborted')}</span>
        ) : null}
      </div>
    </div>
  );
};
