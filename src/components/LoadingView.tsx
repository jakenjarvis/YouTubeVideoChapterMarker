import React, { useRef, useState } from 'react';
import { Film, Upload, Sparkles, AlertCircle, Loader2, ArrowRight, Youtube, Download } from 'lucide-react';
import type { AnalysisProgress, AppMode, VideoMetadata } from '../types/video';
import { formatFileSize, formatTimecodeHMS } from '../utils/timecode';
import { extractYouTubeVideoId } from '../utils/youtube';

interface LoadingViewProps {
  mode: Extract<AppMode, 'select' | 'loading'>;
  onSelectFile: (file: File) => void;
  onLoadYouTubeUrl: (url: string, autoImportChapters: boolean) => void;
  isYouTubeLoading: boolean;
  onGenerateSample: () => void;
  sampleGenProgress: number | null;
  errorMessage: string | null;
  metadata: VideoMetadata | null;
  progress: AnalysisProgress;
  onSkipToEdit: () => void;
}

export const LoadingView: React.FC<LoadingViewProps> = ({
  mode,
  onSelectFile,
  onLoadYouTubeUrl,
  isYouTubeLoading,
  onGenerateSample,
  sampleGenProgress,
  errorMessage,
  metadata,
  progress,
  onSkipToEdit,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
  const [autoImportChapters, setAutoImportChapters] = useState(true);
  const detectedYouTubeId = extractYouTubeVideoId(youtubeUrlInput);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    onSelectFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  if (mode === 'loading') {
    const remainingSec = Math.max(0, (3000 - progress.elapsedMs) / 1000);
    return (
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-2xl bg-[#14171C] border border-[#262B34] rounded-xl p-8">
          <div className="flex items-start justify-between gap-4 pb-6 border-b border-[#262B34]">
            <div>
              <p className="text-xs text-amber-400 font-medium mb-1">読み込みモード · ステップ 2 / 3</p>
              <h1 className="text-xl font-semibold text-[#F3F5F8] tracking-tight">
                動画メタデータとフレーム対応リストを解析しています
              </h1>
            </div>
            <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0 mt-1" />
          </div>

          <div className="py-6 space-y-6">
            {/* Step 2 Frame Correspondence List Progress */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm font-medium text-[#E2E8F0]">
                  フレーム対応リスト構築（VFR対応）
                </span>
                <span className="font-mono-tabular text-lg font-semibold text-amber-400">
                  {progress.frameIndexPercent}%
                </span>
              </div>
              <div className="h-2 w-full bg-[#1E232B] rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-[width] duration-150"
                  style={{ width: `${Math.max(4, progress.frameIndexPercent)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[#94A0B2] font-mono-tabular">
                <span>
                  解析済みフレーム: {progress.analyzedFrameCount.toLocaleString()} フレーム
                </span>
                <span>
                  解析済み範囲: {formatTimecodeHMS(progress.analyzedMaxTimeSec)}
                </span>
              </div>
            </div>

            {/* Extracted Metadata Preview */}
            {metadata && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-[#262B34]">
                <div>
                  <div className="text-xs text-[#647082] mb-1">形式 / コーデック</div>
                  <div className="text-sm font-medium text-[#F3F5F8] truncate" title={metadata.videoCodec}>
                    {metadata.containerFormat}
                  </div>
                  <div className="text-xs text-[#94A0B2] truncate">{metadata.videoCodec}</div>
                </div>
                <div>
                  <div className="text-xs text-[#647082] mb-1">フレームレート</div>
                  <div className="text-sm font-mono-tabular font-medium text-[#F3F5F8]">
                    {metadata.averageFps.toFixed(2)} fps
                  </div>
                  <div className="text-xs text-[#94A0B2]">
                    {metadata.isVfr
                      ? `VFR (${metadata.minFps.toFixed(1)}–${metadata.maxFps.toFixed(1)})`
                      : 'CFR（固定）'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#647082] mb-1">動画の長さ / 解像度</div>
                  <div className="text-sm font-mono-tabular font-medium text-[#F3F5F8]">
                    {formatTimecodeHMS(metadata.durationSec)}
                  </div>
                  <div className="text-xs text-[#94A0B2] font-mono-tabular">
                    {metadata.width} × {metadata.height}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#647082] mb-1">音声トラック</div>
                  <div className="text-sm font-medium text-[#F3F5F8]">
                    {metadata.audioTracks.length > 0
                      ? `${metadata.audioTracks.length} トラック`
                      : '検出なし'}
                  </div>
                  <div className="text-xs text-[#94A0B2] truncate">
                    {metadata.audioTracks[0]?.codec ?? '映像のみ'}
                  </div>
                </div>
              </div>
            )}

            {/* 3-second rule explanation */}
            <div className="pt-5 border-t border-[#262B34] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-[#94A0B2] leading-relaxed">
                3秒以上かかる解析は自動的にバックグラウンド処理へ切り替わり、解析済みの範囲から即座に編集モードで操作できます（あと{' '}
                <span className="font-mono-tabular text-[#F3F5F8] font-medium">
                  {remainingSec.toFixed(1)}秒
                </span>
                ）。
              </p>
              {metadata && (
                <button
                  type="button"
                  onClick={onSkipToEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  今すぐ編集へ進む
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 md:p-12">
      <div className="w-full max-w-4xl">
        {/* Clean Editorial Studio Intro */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#F3F5F8] tracking-tight text-balance">
            ローカル動画・YouTube動画から、精密にチャプターを作成・編集
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-[#94A0B2] max-w-2xl leading-relaxed">
            PC内の動画ファイルまたはYouTubeのURLを読み込み、フレーム対応リストを基準にシーク・マーキング。
            YouTube動画の概要欄にある既存チャプターの取り込みと、YouTube概要欄形式（
            <span className="font-mono-tabular text-[#E2E8F0]">00:00:00 タイトル</span>
            ）の生成に対応しています。
          </p>
        </div>

        {/* Step 1 File Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => sampleGenProgress === null && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && sampleGenProgress === null) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`group relative rounded-xl border border-dashed transition-colors p-10 sm:p-14 text-center cursor-pointer ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-[#313844] bg-[#14171C] hover:border-amber-500/60 hover:bg-[#171B22]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.mov,.webm,.mkv,.m4v,.avi,.ogv"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="mx-auto w-12 h-12 rounded-lg bg-[#1E232C] border border-[#2C3340] flex items-center justify-center mb-4 group-hover:border-amber-500/50 transition-colors">
            <Upload className="w-5 h-5 text-amber-400" />
          </div>

          <p className="text-base font-medium text-[#F3F5F8]">
            動画ファイルをここにドラッグ＆ドロップ、またはクリックして選択
          </p>
          <p className="mt-2 text-xs text-[#94A0B2]">
            MP4 · MOV · WebM · MKV · M4V などローカル動画ファイルに対応（ファイルは外部サーバーに送信されずブラウザ内で解析されます）
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#0D0F12] bg-amber-400 group-hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap">
              <Film className="w-4 h-4" />
              動画ファイルを選択
            </span>
          </div>
        </div>

        {/* Step 1B: YouTube URL Loader (Read-only playback + description chapter import) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!detectedYouTubeId || isYouTubeLoading) return;
            onLoadYouTubeUrl(youtubeUrlInput.trim(), autoImportChapters);
          }}
          className="mt-5 rounded-xl border border-[#262B34] bg-[#14171C] p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-sm font-semibold text-[#F3F5F8]">
                YouTube URLから読み込む（読み取り専用）
              </h2>
            </div>
            <span className="text-[11px] text-[#7D899B]">
              動画の再生と概要欄のチャプターリスト取得に対応
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={youtubeUrlInput}
              onChange={(e) => setYoutubeUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... または https://youtu.be/..."
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-[#0D0F12] border border-[#2C3340] focus:border-amber-400/70 rounded-md text-[#F8FAFC] placeholder:text-[#566071] focus:outline-none font-mono-tabular"
            />
            <button
              type="submit"
              disabled={!detectedYouTubeId || isYouTubeLoading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {isYouTubeLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  取得中...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  URLを読み込む
                </>
              )}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoImportChapters}
                onChange={(e) => setAutoImportChapters(e.target.checked)}
                className="accent-amber-400"
              />
              概要欄のチャプターリストをマーカー＆タイトルへ自動読み込みする
            </label>
            {youtubeUrlInput.trim().length > 0 && !detectedYouTubeId && (
              <span className="text-[11px] text-amber-400">
                有効なYouTubeのURLまたは11文字の動画IDを入力してください
              </span>
            )}
          </div>
        </form>

        {/* Error feedback */}
        {errorMessage && (
          <div className="mt-4 flex items-start gap-2.5 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Workflow Steps & Instant Sample Generator */}
        <div className="mt-8 pt-6 border-t border-[#222730] grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-xs font-mono-tabular text-[#647082] mb-1">01. フレーム対応リスト構築</div>
            <p className="text-xs text-[#94A0B2] leading-relaxed">
              コンテナのメタデータとフレーム間隔を解析し、VFR動画でも時間とフレーム番号を厳密に紐づけます。
            </p>
          </div>
          <div>
            <div className="text-xs font-mono-tabular text-[#647082] mb-1">02. バックグラウンドシーン検出</div>
            <p className="text-xs text-[#94A0B2] leading-relaxed">
              映像と音声の変化から内部シーンリストを自動抽出。マーキングとは独立した参考シーク軸として確認できます。
            </p>
          </div>
          <div>
            <div className="text-xs font-mono-tabular text-[#647082] mb-1">03. タイムライン照合＆出力</div>
            <p className="text-xs text-[#94A0B2] leading-relaxed">
              タイプA（タイトル一覧）・タイプB（タイムスタンプ付き）の入出力と、縦軸タイムライン上での自由な割当に対応。
            </p>
          </div>
        </div>

        {/* Optional quick synthetic sample video button */}
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 rounded-lg bg-[#14171C] border border-[#222730]">
          <div className="text-xs text-[#94A0B2]">
            手元に動画ファイルがない場合は、5シーン構成のテスト用ローカル動画（15秒・音声チャイム付き）をその場で生成して動作を確認できます。
          </div>
          <button
            type="button"
            disabled={sampleGenProgress !== null}
            onClick={(e) => {
              e.stopPropagation();
              onGenerateSample();
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-[#E2E8F0] bg-[#1E232C] hover:bg-[#272E3A] border border-[#323A48] rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
          >
            {sampleGenProgress !== null ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                サンプル動画生成中 {sampleGenProgress}%
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                サンプル動画で試す
              </>
            )}
          </button>
        </div>

        {metadata && (
          <div className="mt-3 text-xs text-[#647082] font-mono-tabular">
            前回の読み込み: {metadata.fileName}
            {metadata.sourceType === 'local' ? ` (${formatFileSize(metadata.fileSize)})` : ' (YouTube)'}
          </div>
        )}
      </div>
    </div>
  );
};
