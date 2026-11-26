import React, { useState } from 'react';
import { X, Youtube, Loader2, FileText, Download, AlertCircle } from 'lucide-react';
import { extractYouTubeVideoId, parseChaptersFromDescription } from '../utils/youtube';
import { formatTimecodeHMS } from '../utils/timecode';
import { useI18n } from '../i18n';

interface YouTubeUrlModalProps {
  isOpen: boolean;
  initialTab?: 'load' | 'description';
  isLoading: boolean;
  errorMessage: string | null;
  currentYouTubeUrl?: string;
  currentTitle?: string;
  currentDescription?: string;
  onClose: () => void;
  onSubmitUrl: (url: string, autoImportChapters: boolean) => void;
  onReimportFromDescription?: (replaceExisting: boolean) => void;
}

export const YouTubeUrlModal: React.FC<YouTubeUrlModalProps> = ({
  isOpen,
  initialTab = 'load',
  isLoading,
  errorMessage,
  currentYouTubeUrl,
  currentTitle,
  currentDescription,
  onClose,
  onSubmitUrl,
  onReimportFromDescription,
}) => {
  const { t, tp } = useI18n();
  const [urlInput, setUrlInput] = useState(currentYouTubeUrl ?? '');
  const [autoImport, setAutoImport] = useState(true);
  const [activeTab, setActiveTab] = useState<'load' | 'description'>(initialTab);
  const [replaceOnReimport, setReplaceOnReimport] = useState(false);

  if (!isOpen) return null;

  const detectedId = extractYouTubeVideoId(urlInput);
  const hasCurrentDescription = Boolean(currentDescription && currentDescription.trim().length > 0);
  const extractedFromCurrent = hasCurrentDescription
    ? parseChaptersFromDescription(currentDescription!)
    : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detectedId || isLoading) return;
    onSubmitUrl(urlInput.trim(), autoImport);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="youtube-modal-title"
    >
      <div
        className="w-full max-w-2xl bg-[#14171C] border border-[#2C3340] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#222731] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Youtube className="w-4 h-4 text-amber-400" />
            <h2 id="youtube-modal-title" className="text-base font-semibold text-[#F3F5F8]">
              {t('youtubeModal.modalTitle')}
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

        {/* Optional tab switcher when a YouTube video is already loaded */}
        {currentYouTubeUrl && (
          <div className="px-6 pt-4">
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0D0F12] border border-[#222731] rounded-lg">
              <button
                type="button"
                onClick={() => setActiveTab('load')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'load'
                    ? 'bg-[#222834] text-amber-300'
                    : 'text-[#94A0B2] hover:text-[#F3F5F8]'
                }`}
              >
                {t('youtubeModal.tabLoadAnother')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('description')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'description'
                    ? 'bg-[#222834] text-amber-300'
                    : 'text-[#94A0B2] hover:text-[#F3F5F8]'
                }`}
              >
                {tp('youtubeModal.tabInspectDescription', extractedFromCurrent.length)}
              </button>
            </div>
          </div>
        )}

        <div className="p-6">
          {activeTab === 'load' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-[#94A0B2] leading-relaxed">
                {t('youtubeModal.loadDesc')}
              </p>

              <div className="space-y-1.5">
                <label htmlFor="yt-modal-url" className="block text-xs font-medium text-[#CBD5E1]">
                  {t('youtubeModal.urlInputLabel')}
                </label>
                <input
                  id="yt-modal-url"
                  type="text"
                  dir="ltr"
                  value={urlInput}
                  autoFocus
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={t('youtubeModal.urlInputPlaceholder')}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#0D0F12] border border-[#2C3340] focus:border-amber-400/70 rounded-lg text-[#F8FAFC] placeholder:text-[#566071] focus:outline-none font-mono-tabular"
                />
                {urlInput.trim().length > 0 && !detectedId && (
                  <p className="text-[11px] text-amber-400">
                    {t('youtubeModal.invalidUrlError')}
                  </p>
                )}
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoImport}
                  onChange={(e) => setAutoImport(e.target.checked)}
                  className="accent-amber-400"
                />
                {t('youtubeModal.autoImportLabel')}
              </label>

              {errorMessage && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222731]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#222834] rounded-md transition-colors cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!detectedId || isLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t('youtubeModal.fetching')}
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      {t('youtubeModal.loadButton')}
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 text-xs text-[#94A0B2]">
                <span className="truncate font-medium text-[#E2E8F0]" title={currentTitle}>
                  {currentTitle}
                </span>
                <span className="font-mono-tabular whitespace-nowrap shrink-0">
                  {tp('youtubeModal.detectedChaptersCount', extractedFromCurrent.length)}
                </span>
              </div>

              {extractedFromCurrent.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-lg bg-[#0D0F12] border border-[#242933] p-3 space-y-1">
                  {extractedFromCurrent.map((ch, idx) => (
                    <div
                      key={`${ch.timeSec}-${idx}`}
                      className="flex items-baseline gap-2.5 text-xs font-mono-tabular"
                    >
                      <span dir="ltr" className="text-amber-400 shrink-0">
                        {formatTimecodeHMS(ch.timeSec)}
                      </span>
                      <span dir="auto" className="text-[#E2E8F0] font-sans truncate">
                        {ch.title || t('youtubeModal.untitledChapter')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="flex items-center gap-1.5 text-xs text-[#94A0B2] mb-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{t('youtubeModal.descriptionHeading')}</span>
                </div>
                <textarea
                  readOnly
                  dir="auto"
                  rows={8}
                  value={currentDescription || t('youtubeModal.descriptionUnavailable')}
                  className="w-full p-3 text-xs leading-relaxed bg-[#0D0F12] border border-[#242933] rounded-lg text-[#CBD5E1] focus:outline-none resize-y"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#222731]">
                <label className="inline-flex items-center gap-2 text-xs text-[#CBD5E1] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={replaceOnReimport}
                    onChange={(e) => setReplaceOnReimport(e.target.checked)}
                    className="accent-amber-400"
                  />
                  {t('youtubeModal.replaceOnReimportLabel')}
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium text-[#CBD5E1] hover:bg-[#222834] rounded-md transition-colors cursor-pointer"
                  >
                    {t('common.close')}
                  </button>
                  {onReimportFromDescription && extractedFromCurrent.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onReimportFromDescription(replaceOnReimport);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#0D0F12] bg-amber-400 hover:bg-amber-300 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {tp('youtubeModal.reapplyChaptersButton', extractedFromCurrent.length)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
