import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Download, Upload, FileText, AlertTriangle } from 'lucide-react';
import type { ChapterTitle, Marker } from '../types/video';
import {
  exportTypeBText,
  parseTypeAText,
  parseTypeBText,
  type ParsedTypeBEntry,
} from '../utils/timecode';

type ModalTab = 'importA' | 'importB' | 'exportB';

interface ImportExportModalProps {
  isOpen: boolean;
  initialTab?: ModalTab;
  markers: Marker[];
  titles: ChapterTitle[];
  fileName?: string;
  onClose: () => void;
  onImportTypeA: (titleLines: string[], replaceExisting: boolean, autoAssign: boolean) => void;
  onImportTypeB: (entries: ParsedTypeBEntry[], replaceExisting: boolean) => void;
}

const TYPE_A_PLACEHOLDER = `アジェンダ
イベントの主旨について
結局のところ？
最後に`;

const TYPE_B_PLACEHOLDER = `00:00:00 アジェンダ
00:10:04 イベントの主旨について
00:25:12 結局のところ？
00:32:05 最後に`;

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  initialTab = 'exportB',
  markers,
  titles,
  fileName,
  onClose,
  onImportTypeA,
  onImportTypeB,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>(initialTab);
  const [typeAInput, setTypeAInput] = useState('');
  const [typeAReplace, setTypeAReplace] = useState(false);
  const [typeAAutoAssign, setTypeAAutoAssign] = useState(true);

  const [typeBInput, setTypeBInput] = useState('');
  const [typeBReplace, setTypeBReplace] = useState(false);

  const [includeUntitled, setIncludeUntitled] = useState(false);
  const [copied, setCopied] = useState(false);

  const parsedA = useMemo(() => parseTypeAText(typeAInput), [typeAInput]);
  const parsedB = useMemo(() => parseTypeBText(typeBInput), [typeBInput]);
  const exportedText = useMemo(
    () => exportTypeBText(markers, titles, includeUntitled),
    [markers, titles, includeUntitled]
  );

  if (!isOpen) return null;

  const handleCopy = async () => {
    if (!exportedText) return;
    try {
      await navigator.clipboard.writeText(exportedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback via hidden textarea selection
      const ta = document.createElement('textarea');
      ta.value = exportedText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleDownloadTxt = () => {
    if (!exportedText) return;
    const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'youtube_chapters';
    const blob = new Blob([exportedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_chapters.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-export-title"
    >
      <div
        className="w-full max-w-2xl bg-[#14171C] border border-[#2C3340] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#222731] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-amber-400" />
            <h2 id="import-export-title" className="text-base font-semibold text-[#F3F5F8]">
              チャプターテキスト インポート / エクスポート
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1.5 text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#222834] rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Mode Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#0D0F12] border border-[#222731] rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('exportB')}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'exportB'
                  ? 'bg-[#222834] text-amber-300'
                  : 'text-[#94A0B2] hover:text-[#F3F5F8]'
              }`}
            >
              出力（タイプB）
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('importA')}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'importA'
                  ? 'bg-[#222834] text-amber-300'
                  : 'text-[#94A0B2] hover:text-[#F3F5F8]'
              }`}
            >
              読込（タイプA：タイトルのみ）
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('importB')}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'importB'
                  ? 'bg-[#222834] text-amber-300'
                  : 'text-[#94A0B2] hover:text-[#F3F5F8]'
              }`}
            >
              読込（タイプB：時刻付き）
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="p-6 space-y-4">
          {activeTab === 'exportB' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A0B2]">
                <span>YouTube概要欄形式（<span className="font-mono-tabular text-[#E2E8F0]">00:00:00 チャプター名</span>）</span>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none text-[#CBD5E1]">
                  <input
                    type="checkbox"
                    checked={includeUntitled}
                    onChange={(e) => setIncludeUntitled(e.target.checked)}
                    className="accent-amber-400 rounded"
                  />
                  タイトル未割当のマーカーも含める
                </label>
              </div>

              <textarea
                readOnly
                value={exportedText}
                rows={10}
                placeholder="マーカーにチャプタータイトルを割り当てると、ここにYouTube概要欄用のテキストが自動生成されます。"
                className="w-full p-4 font-mono-tabular text-sm leading-relaxed bg-[#0D0F12] border border-[#262C38] rounded-lg text-[#F3F5F8] placeholder:text-[#566071] focus:outline-none focus:border-amber-400/60 resize-y"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-xs font-mono-tabular text-[#94A0B2]">
                  出力行数: {exportedText ? exportedText.split('\n').length : 0} 行
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!exportedText}
                    onClick={handleDownloadTxt}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#E2E8F0] bg-[#1E232C] hover:bg-[#272E3A] border border-[#323A48] rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    .txt保存
                  </button>
                  <button
                    type="button"
                    disabled={!exportedText}
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        コピーしました
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        クリップボードにコピー
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'importA' && (
            <>
              <p className="text-xs text-[#94A0B2] leading-relaxed">
                1行につき1つのチャプタータイトルを入力・貼り付けしてください。読み込んだ各行はタイムライン上のマーカーへ自由にドラッグ＆ドロップや移動で割り当てられます。
              </p>

              <textarea
                value={typeAInput}
                onChange={(e) => setTypeAInput(e.target.value)}
                rows={9}
                placeholder={TYPE_A_PLACEHOLDER}
                className="w-full p-4 text-sm leading-relaxed bg-[#0D0F12] border border-[#262C38] rounded-lg text-[#F3F5F8] placeholder:text-[#4D5666] focus:outline-none focus:border-amber-400/60 resize-y"
              />

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#CBD5E1]">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={typeAAutoAssign}
                      onChange={(e) => setTypeAAutoAssign(e.target.checked)}
                      className="accent-amber-400"
                    />
                    空きマーカーへ上から自動割当
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={typeAReplace}
                      onChange={(e) => setTypeAReplace(e.target.checked)}
                      className="accent-amber-400"
                    />
                    既存のタイトルを置き換える
                  </label>
                </div>
                <span className="font-mono-tabular text-[#94A0B2]">
                  検出タイトル: {parsedA.length} 件
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222731]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#222834] rounded-md transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={parsedA.length === 0}
                  onClick={() => {
                    onImportTypeA(parsedA, typeAReplace, typeAAutoAssign);
                    setTypeAInput('');
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Upload className="w-3.5 h-3.5" />
                  タイプAを読み込む ({parsedA.length}件)
                </button>
              </div>
            </>
          )}

          {activeTab === 'importB' && (
            <>
              <p className="text-xs text-[#94A0B2] leading-relaxed">
                「<span className="font-mono-tabular text-[#E2E8F0]">00:00:00 タイトル</span>」形式（<span className="font-mono-tabular">MM:SS</span>形式も可）のテキストを貼り付けると、フレーム対応リストの該当フレームへマーカーとチャプタータイトルを同時登録します。
              </p>

              <textarea
                value={typeBInput}
                onChange={(e) => setTypeBInput(e.target.value)}
                rows={9}
                placeholder={TYPE_B_PLACEHOLDER}
                className="w-full p-4 font-mono-tabular text-sm leading-relaxed bg-[#0D0F12] border border-[#262C38] rounded-lg text-[#F3F5F8] placeholder:text-[#4D5666] focus:outline-none focus:border-amber-400/60 resize-y"
              />

              {parsedB.skippedLines.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    タイムスタンプ形式に一致しない行はスキップされます（行番号: {parsedB.skippedLines.join(', ')}）
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#CBD5E1]">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={typeBReplace}
                    onChange={(e) => setTypeBReplace(e.target.checked)}
                    className="accent-amber-400"
                  />
                  既存のマーカーとタイトルを置き換える
                </label>
                <span className="font-mono-tabular text-[#94A0B2]">
                  有効チャプター: {parsedB.entries.length} 件
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222731]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#222834] rounded-md transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={parsedB.entries.length === 0}
                  onClick={() => {
                    onImportTypeB(parsedB.entries, typeBReplace);
                    setTypeBInput('');
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Upload className="w-3.5 h-3.5" />
                  タイプBを読み込む ({parsedB.entries.length}件)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
