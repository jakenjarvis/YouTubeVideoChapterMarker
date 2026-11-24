import React from 'react';
import { Loader2, Check } from 'lucide-react';
import type { AnalysisProgress, VideoMetadata } from '../types/video';
import { formatFileSize, formatTimecodeHMS } from '../utils/timecode';

interface MetadataBarProps {
  metadata: VideoMetadata;
  progress: AnalysisProgress;
}

export const MetadataBar: React.FC<MetadataBarProps> = ({ metadata, progress }) => {
  const isBgProcessing = !progress.frameIndexDone || progress.sceneDetectStatus === 'running';

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-2.5 bg-[#12151A] border-b border-[#222731] text-xs">
      {/* Unboxed Clean Technical Metadata with Typographic Separators */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[#94A0B2] min-w-0">
        <span className="font-medium text-[#F3F5F8] truncate max-w-[240px]" title={metadata.fileName}>
          {metadata.fileName}
        </span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span>{metadata.containerFormat}</span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span>{metadata.videoCodec}</span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span className="font-mono-tabular">
          {metadata.width}×{metadata.height}
        </span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span className="font-mono-tabular text-[#CBD5E1]">
          {metadata.averageFps.toFixed(2)} fps ({metadata.isVfr ? 'VFR' : 'CFR'})
        </span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span className="font-mono-tabular">{formatTimecodeHMS(metadata.durationSec)}</span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span>
          音声:{' '}
          {metadata.audioTracks.length > 0
            ? metadata.audioTracks.map((t) => t.codec).join(', ')
            : 'なし'}
        </span>
        <span aria-hidden="true" className="text-[#454E5E]">·</span>
        <span className="font-mono-tabular text-[#647082]">{formatFileSize(metadata.fileSize)}</span>
      </div>

      {/* Live Background Processing Progress % (Step 2 / Step 3 / Step 4 requirement) */}
      <div className="flex items-center gap-4 shrink-0 font-mono-tabular">
        {!progress.frameIndexDone ? (
          <div className="flex items-center gap-2 text-amber-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>フレーム解析 {progress.frameIndexPercent}%</span>
            <div className="w-20 h-1.5 bg-[#222731] rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-[width] duration-150"
                style={{ width: `${progress.frameIndexPercent}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="text-[#647082]">
            フレーム対応表 {progress.analyzedFrameCount.toLocaleString()}f
          </span>
        )}

        {progress.sceneDetectStatus === 'running' ? (
          <div className="flex items-center gap-2 text-sky-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>バックグラウンドシーン検出 {progress.sceneDetectPercent}%</span>
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
            <span>解析完了 100%</span>
          </div>
        ) : !isBgProcessing && progress.sceneDetectStatus === 'error' ? (
          <span className="text-red-400">シーン検出中断</span>
        ) : null}
      </div>
    </div>
  );
};
