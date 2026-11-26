import React, { useMemo, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import type { ChapterTitle, Marker } from '../types/video';
import {
  exportChapterText,
  parseChapterTextLines,
  validateYouTubeChapters,
  type ExportLineLayout,
  type ExportTimeFormat,
  type ParsedChapterLine,
} from '../utils/timecode';
import { useI18n } from '../i18n';

export type ImportExportModalTab = 'export' | 'import';

export interface UnifiedImportOptions {
  replaceExisting: boolean;
  replaceMode: 'all' | 'titles-only';
  autoAssignTitles: boolean;
}

interface ImportExportModalProps {
  isOpen: boolean;
  initialTab?: ImportExportModalTab;
  markers: Marker[];
  titles: ChapterTitle[];
  fileName?: string;
  videoDurationSec?: number;
  onClose: () => void;
  onImportLines: (lines: ParsedChapterLine[], options: UnifiedImportOptions) => void;
}

const STORAGE_TIME_FORMAT_KEY = 'vcm_export_time_format';
const STORAGE_LAYOUT_KEY = 'vcm_export_layout';

function readStoredTimeFormat(): ExportTimeFormat {
  try {
    const v = window.localStorage.getItem(STORAGE_TIME_FORMAT_KEY);
    if (v === 'auto' || v === 'm:ss' || v === 'mm:ss' || v === 'hh:mm:ss') return v;
  } catch {
    // Ignore storage access errors
  }
  return 'auto';
}

function readStoredLayout(): ExportLineLayout {
  try {
    const v = window.localStorage.getItem(STORAGE_LAYOUT_KEY);
    if (
      v === 'time-space-title' ||
      v === 'time-dash-title' ||
      v === 'title-space-time' ||
      v === 'title-dash-time'
    ) {
      return v;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'time-space-title';
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  initialTab = 'export',
  markers,
  titles,
  fileName,
  videoDurationSec,
  onClose,
  onImportLines,
}) => {
  const { t, tp } = useI18n();
  const [activeTab, setActiveTab] = useState<ImportExportModalTab>(initialTab);

  // Export state
  const [timeFormat, setTimeFormat] = useState<ExportTimeFormat>(() => readStoredTimeFormat());
  const [layout, setLayout] = useState<ExportLineLayout>(() => readStoredLayout());
  const [includeUntitled, setIncludeUntitled] = useState(false);
  const [copied, setCopied] = useState(false);

  // Unified Import state
  const [importInput, setImportInput] = useState('');
  const [includeTitleOnlyLines, setIncludeTitleOnlyLines] = useState(true);
  const [autoAssignOverride, setAutoAssignOverride] = useState<boolean | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const exportOptions = useMemo(
    () => ({
      timeFormat,
      layout,
      includeUntitledMarkers: includeUntitled,
      videoDurationSec,
    }),
    [timeFormat, layout, includeUntitled, videoDurationSec]
  );

  const exportedText = useMemo(
    () => exportChapterText(markers, titles, exportOptions),
    [markers, titles, exportOptions]
  );

  const ytValidation = useMemo(
    () => validateYouTubeChapters(markers, titles, exportOptions),
    [markers, titles, exportOptions]
  );

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

  const handleSelectTimeFormat = (next: ExportTimeFormat) => {
    setTimeFormat(next);
    try {
      window.localStorage.setItem(STORAGE_TIME_FORMAT_KEY, next);
    } catch {
      // Ignore storage access errors
    }
  };

  const handleSelectLayout = (next: ExportLineLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(STORAGE_LAYOUT_KEY, next);
    } catch {
      // Ignore storage access errors
    }
  };

  const handleCopy = async () => {
    if (!exportedText) return;
    const textToCopy = exportedText.endsWith('\n') ? exportedText : `${exportedText}\n`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = textToCopy;
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
    const rawBase = fileName
      ? fileName.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim()
      : '';
    const baseName = rawBase || t('importExport.defaultExportBaseName');
    const blob = new Blob([exportedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('importExport.exportFileName', { baseName });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const ytIssues: string[] = [];
  if (ytValidation.chapterCount > 0 && !ytValidation.isTitleFirstLayout) {
    if (!ytValidation.startsAtZero) ytIssues.push(t('importExport.ytCheckNeedsZero'));
    if (!ytValidation.hasMinimumCount) ytIssues.push(t('importExport.ytCheckNeedsThree'));
    if (!ytValidation.hasMinimumIntervals) ytIssues.push(t('importExport.ytCheckNeedsTenSec'));
  }

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

  const timeFormatOptions: Array<{ value: ExportTimeFormat; label: string; ltr?: boolean }> = [
    { value: 'auto', label: t('importExport.timeFormatAuto') },
    { value: 'm:ss', label: '0:00', ltr: true },
    { value: 'mm:ss', label: '00:00', ltr: true },
    { value: 'hh:mm:ss', label: '00:00:00', ltr: true },
  ];

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
              {t('importExport.modalTitle')}
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

        {/* 2-Tab Switcher: Export / Import */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#0D0F12] border border-[#222731] rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'export'
                  ? 'bg-[#222834] text-amber-300'
                  : 'text-[#94A0B2] hover:text-[#F3F5F8]'
              }`}
            >
              {t('importExport.tabExport')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'import'
                  ? 'bg-[#222834] text-amber-300'
                  : 'text-[#94A0B2] hover:text-[#F3F5F8]'
              }`}
            >
              {t('importExport.tabImport')}
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="p-6 space-y-4">
          {activeTab === 'export' && (
            <>
              {/* Format Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-[#0D0F12] border border-[#222731] rounded-lg">
                <div>
                  <div className="text-[11px] font-medium text-[#7D899B] mb-1.5">
                    {t('importExport.timeFormatLabel')}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {timeFormatOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        dir={opt.ltr ? 'ltr' : undefined}
                        onClick={() => handleSelectTimeFormat(opt.value)}
                        className={`px-2 py-1.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
                          opt.ltr ? 'font-mono-tabular' : ''
                        } ${
                          timeFormat === opt.value
                            ? 'bg-[#222834] border-amber-400/50 text-amber-300'
                            : 'bg-[#14171C] border-[#262C38] text-[#94A0B2] hover:text-[#F3F5F8]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="export-layout-select"
                    className="block text-[11px] font-medium text-[#7D899B] mb-1.5"
                  >
                    {t('importExport.layoutLabel')}
                  </label>
                  <select
                    id="export-layout-select"
                    value={layout}
                    onChange={(e) => handleSelectLayout(e.target.value as ExportLineLayout)}
                    className="w-full px-2.5 py-1.5 text-xs bg-[#14171C] border border-[#2C3340] focus:border-amber-400/70 rounded text-[#F3F5F8] focus:outline-none cursor-pointer"
                  >
                    <option value="time-space-title">{t('importExport.layoutTimeSpaceTitle')}</option>
                    <option value="time-dash-title">{t('importExport.layoutTimeDashTitle')}</option>
                    <option value="title-space-time">{t('importExport.layoutTitleSpaceTime')}</option>
                    <option value="title-dash-time">{t('importExport.layoutTitleDashTime')}</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A0B2]">
                <span className="text-[11px] text-[#7D899B]">
                  {timeFormat === 'auto' ? t('importExport.timeFormatAutoHint') : ''}
                </span>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none text-[#CBD5E1]">
                  <input
                    type="checkbox"
                    checked={includeUntitled}
                    onChange={(e) => setIncludeUntitled(e.target.checked)}
                    className="accent-amber-400 rounded"
                  />
                  {t('importExport.includeUntitledLabel')}
                </label>
              </div>

              {ytValidation.isTitleFirstLayout && (
                <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-md px-3 py-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{t('importExport.layoutNonYouTubeChapterNote')}</span>
                </div>
              )}

              <textarea
                readOnly
                dir={exportedText ? 'ltr' : undefined}
                value={exportedText}
                rows={9}
                placeholder={t('importExport.exportPlaceholder')}
                className="w-full p-4 font-mono-tabular text-sm leading-relaxed bg-[#0D0F12] border border-[#262C38] rounded-lg text-[#F3F5F8] placeholder:text-[#566071] focus:outline-none focus:border-amber-400/60 resize-y"
              />

              {/* YouTube Chapter Readiness Indicator */}
              {exportedText && !ytValidation.isTitleFirstLayout && (
                <div
                  className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 border ${
                    ytValidation.isValid
                      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25'
                      : 'text-amber-300 bg-amber-500/10 border-amber-500/25'
                  }`}
                >
                  {ytValidation.isValid ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{t('importExport.ytCheckReady')}</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{ytIssues.join(' · ')}</span>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-xs font-mono-tabular text-[#94A0B2]">
                  {tp(
                    'importExport.outputLineCount',
                    exportedText ? exportedText.split('\n').length : 0
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!exportedText}
                    onClick={handleDownloadTxt}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#E2E8F0] bg-[#1E232C] hover:bg-[#272E3A] border border-[#323A48] rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('importExport.downloadTxt')}
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
                        {t('importExport.copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        {t('importExport.copyToClipboard')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'import' && (
            <>
              <p className="text-xs text-[#94A0B2] leading-relaxed">
                {t('importExport.importDesc')}
              </p>

              <textarea
                dir="auto"
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                rows={10}
                placeholder={t('importExport.importPlaceholder')}
                className="w-full p-4 font-mono-tabular text-sm leading-relaxed bg-[#0D0F12] border border-[#262C38] rounded-lg text-[#F3F5F8] placeholder:text-[#4D5666] focus:outline-none focus:border-amber-400/60 resize-y"
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
                      className="accent-amber-400"
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
                        className="accent-amber-400"
                      />
                      {t('importExport.autoAssignEmptyLabel')}
                    </label>
                  )}

                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                      className="accent-amber-400"
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {t('importExport.importButton', { count: effectiveLines.length })}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
