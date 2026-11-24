import React from 'react';
import { Loader2, SkipBack, SkipForward, Compass } from 'lucide-react';
import type { AnalysisProgress, InternalScene } from '../types/video';
import { splitTimecodeParts } from '../utils/timecode';

interface InternalScenePanelProps {
  sourceType: 'local' | 'youtube';
  scenes: InternalScene[];
  progress: AnalysisProgress;
  currentFrameIndex: number;
  onSeekToFrame: (frameIndex: number) => void;
  onJumpPrevScene: () => void;
  onJumpNextScene: () => void;
}

const reasonLabelMap: Record<InternalScene['reason'], string> = {
  visual: '映像変化',
  audio: '音声変化',
  both: '映像＋音声',
};

export const InternalScenePanel: React.FC<InternalScenePanelProps> = ({
  sourceType,
  scenes,
  progress,
  currentFrameIndex,
  onSeekToFrame,
  onJumpPrevScene,
  onJumpNextScene,
}) => {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Explicit Separation Notice + Reference Axis Prev/Next Controls */}
      <div className="px-4 py-3 border-b border-[#222731] space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-[#94A0B2] flex items-center gap-2 font-mono-tabular">
            <span className="text-sky-400 font-medium">検出シーン {scenes.length}</span>
            <span aria-hidden="true" className="text-[#454E5E]">·</span>
            {progress.sceneDetectStatus === 'running' ? (
              <span className="inline-flex items-center gap-1 text-sky-300">
                <Loader2 className="w-3 h-3 animate-spin" />
                検出中 {progress.sceneDetectPercent}%
              </span>
            ) : (
              <span>解析 {progress.sceneDetectPercent}%</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onJumpPrevScene}
              disabled={scenes.length === 0}
              title="前の内部シーンへ移動 (Shift+P)"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 rounded disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              <SkipBack className="w-3 h-3" />
              前シーン
            </button>
            <button
              type="button"
              onClick={onJumpNextScene}
              disabled={scenes.length === 0}
              title="次の内部シーンへ移動 (Shift+N)"
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 rounded disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              次シーン
              <SkipForward className="w-3 h-3" />
            </button>
          </div>
        </div>

        <p className="text-[11px] text-[#7D899B] leading-relaxed">
          映像・音声の変化から自動抽出した参考用の別軸シークポイントです。クリックでそのフレームへ移動します（マーキングとは完全に独立しており、チャプター出力には影響しません）。
        </p>
      </div>

      {/* Reference Scene List */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-1">
        {scenes.length === 0 ? (
          <div className="py-10 px-4 text-center border border-dashed border-[#272D38] rounded-lg bg-[#111419]">
            <Compass className="w-6 h-6 text-[#647082] mx-auto mb-2.5" />
            <p className="text-sm font-medium text-[#E2E8F0]">
              {sourceType === 'youtube'
                ? 'YouTube動画では自動シーン検出は利用できません'
                : progress.sceneDetectStatus === 'running'
                  ? 'シーン変化を解析しています...'
                  : '内部シーンはまだ検出されていません'}
            </p>
            <p className="mt-1.5 text-xs text-[#94A0B2] leading-relaxed">
              {sourceType === 'youtube'
                ? 'ブラウザのセキュリティ仕様上、YouTube埋め込み動画の映像フレーム・音声波形への直接アクセスが制限されているため、ローカル動画読み込み時のみ利用できます。概要欄から読み込んだチャプターは「マーカー＆チャプター」タブで編集できます。'
                : 'バックグラウンドで映像フレーム差分と音声エネルギー変化を解析し、随時ここに追加されます。'}
            </p>
          </div>
        ) : (
          scenes.map((scene) => {
            const { hms, ms } = splitTimecodeParts(scene.timeSec);
            const isNearCurrent = Math.abs(scene.frameIndex - currentFrameIndex) <= 2;

            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSeekToFrame(scene.frameIndex)}
                className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                  isNearCurrent
                    ? 'bg-sky-500/12 border-sky-400/50'
                    : 'bg-[#14171D] border-[#222731] hover:border-sky-500/40 hover:bg-[#181C24]'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 font-mono-tabular">
                    <span className="text-xs text-sky-400 font-semibold">
                      S{String(scene.sceneNumber).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-bold text-[#F3F5F8]">
                      {hms}
                      <span className="text-xs font-normal text-[#647082]">.{ms}</span>
                    </span>
                    <span className="text-xs text-[#94A0B2]">#{scene.frameIndex}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#7D899B] flex items-center gap-2">
                    <span>{reasonLabelMap[scene.reason]}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">変化度 {Math.round(scene.score * 100)}%</span>
                  </div>
                </div>

                <span className="text-[11px] text-sky-400/90 font-medium whitespace-nowrap shrink-0">
                  シーク →
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
