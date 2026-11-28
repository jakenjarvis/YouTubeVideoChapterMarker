import React, { useMemo, useState } from 'react';
import { X, Upload } from 'lucide-react';
import {
  parseChapterTextLines,
  type ParsedChapterLine,
} from '../utils/timecode';
import { useI18n } from '../i18n';

export interface UnifiedImportOptions {
  replaceExisting: boolean;
  replaceMode: 'all' | 'titles-only';
  autoAssignTitles: boolean;
}

interface ChapterImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportLines: (lines: ParsedChapterLine[], options: UnifiedImportOptions) => void;
}

export const ChapterImportModal: React.FC<ChapterImportModalProps> = ({
  isOpen,
  onClose,
  onImportLines,
}) => {
  const { t, tp } = useI18n();

  const [importInput, setImportInput] = useState('');
  const [includeTitleOnlyLines, setIncludeTitleOnlyLines] = useState(true);
  const [autoAssignOverride, setAutoAssignOverride] = useState<boolean | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const parsed = useMemo(() => parseChapterTextLines(importInput), [importInput]);
  const hasTimestampLines = parsed.chapterCount > 0 || parsed.markerOnlyCount > 0;
  const isMixedInput = hasTimestampLines && parsed.titleOnlyCount > 0;

  const effectiveLines = useMemo(() => {
    if (isMixedInput && !includeTitleOnlyLines) {
      return parsed.lines.filter((line) => line.kind !== 'title-only');
    }
    return parsed.lines;
  }, [isMixedInput, includeTitleOnlyLines, parsed.lines]);

  const effectiveTitleOnlyCount = useMemo(
    () => effectiveLines.filter((line) => line.kind === 'title-only').length,
    [effectiveLines]
  );

  // Pure title-only input defaults to auto-assigning to empty markers; mixed input defaults to keeping unassigned titles separate.
  const effectiveAutoAssign =
    autoAssignOverride !== null ? autoAssignOverride : !hasTimestampLines;

  if (!isOpen) return null;

  const detectedParts: string[] = [];
  if (parsed.chapterCount > 0) {
    detectedParts.push(tp('importExport.detectedChaptersCount', parsed.chapterCount));
  }
  if (parsed.markerOnlyCount > 0) {
    detectedParts.push(tp('importExport.detectedMarkersOnlyCount', parsed.markerOnlyCount));
  }
  if (parsed.titleOnlyCount > 0) {
    detectedParts.push(tp('importExport.detectedTitlesOnlyCount', parsed.titleOnlyCount));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chapter-import-title"
    >
      <div
        className="w-full max-w-2xl bg-[#14171C] border border-[#2C3340] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#222731] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Upload className="w-4 h-4 text-sky-400" />
            <h2 id="chapter-import-title" className="text-base font-semibold text-[#F3F5F8]">
              {t('importExport.importModalTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#222834] rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-[#94A0B2] leading-relaxed">
            {t('importExport.importDesc')}
          </p>

          <textarea
            dir="auto"
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            rows={10}
            placeholder={t('importExport.importPlaceholder')}
            className="w-full p-4 font-mono-tabular text-sm leading-relaxed bg-[#0D0F12] border border-[#262C38] rounded-lg text-[#F3F5F8] placeholder:text-[#4D5666] focus:outline-none focus:border-sky-400/60 resize-y"
          />

          {/* Live Line-by-Line Detection Summary */}
          {detectedParts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#CBD5E1] bg-[#0D0F12] border border-[#222731] rounded-md px-3 py-2 font-mono-tabular">
              <span className="text-[#7D899B]">{t('importExport.detectedSummaryPrefix')}</span>
              <span>{detectedParts.join(' · ')}</span>
            </div>
          )}

          <div className="space-y-2 text-xs text-[#CBD5E1]">
            {isMixedInput && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTitleOnlyLines}
                  onChange={(e) => setIncludeTitleOnlyLines(e.target.checked)}
                  className="accent-sky-400"
                />
                {t('importExport.includeTitleOnlyLinesLabel')}
              </label>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {effectiveTitleOnlyCount > 0 && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={effectiveAutoAssign}
                    onChange={(e) => setAutoAssignOverride(e.target.checked)}
                    className="accent-sky-400"
                  />
                  {t('importExport.autoAssignEmptyLabel')}
                </label>
              )}

              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="accent-sky-400"
                />
                {hasTimestampLines
                  ? t('importExport.replaceExistingAllLabel')
                  : t('importExport.replaceExistingTitlesLabel')}
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222731]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#222834] rounded-md transition-colors cursor-pointer"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={effectiveLines.length === 0}
              onClick={() => {
                onImportLines(effectiveLines, {
                  replaceExisting,
                  replaceMode: hasTimestampLines ? 'all' : 'titles-only',
                  autoAssignTitles: effectiveAutoAssign,
                });
                setImportInput('');
                setAutoAssignOverride(null);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-sky-400 hover:bg-sky-300 rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              {t('importExport.importButton', { count: effectiveLines.length })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
