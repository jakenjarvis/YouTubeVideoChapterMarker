import React, { useMemo, useState } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import type { ChapterTitle, Marker } from '../types/video';
import {
  exportChapterText,
  sanitizeExportBaseName,
  validateYouTubeChapters,
  type ExportLineLayout,
  type ExportTimeFormat,
} from '../utils/timecode';
import { useI18n } from '../i18n';

interface ChapterExportModalProps {
  isOpen: boolean;
  markers: Marker[];
  titles: ChapterTitle[];
  untimedTitleCount?: number;
  fileName?: string;
  videoDurationSec?: number;
  onClose: () => void;
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
      v === 'title-dash-time' ||
      v === 'title-only'
    ) {
      return v;
    }
  } catch {
    // Ignore storage access errors
  }
  return 'time-space-title';
}

export const ChapterExportModal: React.FC<ChapterExportModalProps> = ({
  isOpen,
  markers,
  titles,
  untimedTitleCount = 0,
  fileName,
  videoDurationSec,
  onClose,
}) => {
  const { t, tp } = useI18n();

  const [timeFormat, setTimeFormat] = useState<ExportTimeFormat>(() => readStoredTimeFormat());
  const [layout, setLayout] = useState<ExportLineLayout>(() => readStoredLayout());
  const [includeUntitled, setIncludeUntitled] = useState(false);
  const [copied, setCopied] = useState(false);

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
    const baseName = sanitizeExportBaseName(fileName, t('importExport.defaultExportBaseName'));
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

  const isTitleOnly = layout === 'title-only';
  const ytIssues: string[] = [];
  if (ytValidation.chapterCount > 0 && !ytValidation.isTitleFirstLayout && !ytValidation.isTitleOnlyLayout) {
    if (!ytValidation.startsAtZero) ytIssues.push(t('importExport.ytCheckNeedsZero'));
    if (!ytValidation.hasMinimumCount) ytIssues.push(t('importExport.ytCheckNeedsThree'));
    if (!ytValidation.hasMinimumIntervals) ytIssues.push(t('importExport.ytCheckNeedsTenSec'));
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
      aria-labelledby="chapter-export-title"
    >
      <div
        className="w-full max-w-2xl bg-[#14171C] border border-[#2C3340] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#222731] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-amber-400" />
            <h2 id="chapter-export-title" className="text-base font-semibold text-[#F3F5F8]">
              {t('importExport.exportModalTitle')}
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
                    disabled={isTitleOnly}
                    dir={opt.ltr ? 'ltr' : undefined}
                    onClick={() => handleSelectTimeFormat(opt.value)}
                    className={`px-2 py-1.5 text-[11px] font-medium rounded border transition-colors whitespace-nowrap ${
                      opt.ltr ? 'font-mono-tabular' : ''
                    } ${
                      isTitleOnly
                        ? 'opacity-40 cursor-not-allowed bg-[#14171C] border-[#262C38] text-[#647082]'
                        : timeFormat === opt.value
                          ? 'cursor-pointer bg-[#222834] border-amber-400/50 text-amber-300'
                          : 'cursor-pointer bg-[#14171C] border-[#262C38] text-[#94A0B2] hover:text-[#F3F5F8]'
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
                <option value="title-only">{t('importExport.layoutTitleOnly')}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A0B2]">
            <span className="text-[11px] text-[#7D899B]">
              {!isTitleOnly && timeFormat === 'auto' ? t('importExport.timeFormatAutoHint') : ''}
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

          {isTitleOnly && (
            <div className="flex items-start gap-2 text-xs text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-md px-3 py-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{t('importExport.layoutTitleOnlyNote')}</span>
            </div>
          )}

          {untimedTitleCount > 0 && (
            <div className="flex items-start gap-2 text-xs text-sky-300 bg-sky-500/10 border border-sky-500/25 rounded-md px-3 py-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{t('importExport.untimedTitlesExcludedNote', { count: untimedTitleCount })}</span>
            </div>
          )}

          <textarea
            readOnly
            dir={isTitleOnly ? 'auto' : exportedText ? 'ltr' : undefined}
            value={exportedText}
            rows={9}
            placeholder={t('importExport.exportPlaceholder')}
            className="w-full p-4 font-mono-tabular text-sm leading-relaxed bg-[#0D0F12] border border-[#262C38] rounded-lg text-[#F3F5F8] placeholder:text-[#566071] focus:outline-none focus:border-amber-400/60 resize-y"
          />

          {/* YouTube Chapter Readiness Indicator */}
          {exportedText && !ytValidation.isTitleFirstLayout && !ytValidation.isTitleOnlyLayout && (
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
        </div>
      </div>
    </div>
  );
};
