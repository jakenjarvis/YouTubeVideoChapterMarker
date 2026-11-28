import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, ExternalLink, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { HELP_COPY, type HelpCategory } from '../help/helpLocales';
import { renderScenarioDiagramSvg } from '../help/scenarioDiagrams';

interface WorkflowHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: readonly HelpCategory[] = ['basic', 'long', 'fix', 'try'];

export const WorkflowHelpModal: React.FC<WorkflowHelpModalProps> = ({ isOpen, onClose }) => {
  const { locale, t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<'all' | HelpCategory>('all');
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const copy = HELP_COPY[locale] ?? HELP_COPY.en;
  const helpPageHref = `/${locale}/help/`;

  const diagramSrcById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of copy.scenarios) {
      const svg = renderScenarioDiagramSvg(s.id, s.steps, `${s.num} ${s.title}: ${s.flow}`);
      map[s.id] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
    return map;
  }, [copy]);

  if (!isOpen) return null;

  const filteredScenarios =
    activeCategory === 'all'
      ? copy.scenarios
      : copy.scenarios.filter((s) => s.category === activeCategory);

  const handleJumpToScenario = (scenarioId: string) => {
    const el = cardRefs.current[scenarioId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-help-title"
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-[#14171C] border border-[#2C3340] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#222731] bg-[#111419] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-sky-400 shrink-0" />
            <h2
              id="workflow-help-title"
              className="text-sm sm:text-base font-semibold text-[#F3F5F8] truncate"
            >
              {copy.heroTitle}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={helpPageHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#94A0B2] hover:text-[#F8FAFC] bg-[#161A22] hover:bg-[#1E2430] border border-[#262C37] hover:border-[#3A4354] rounded-md transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t('header.openHelpNewTab')}</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="p-1.5 text-[#94A0B2] hover:text-[#F8FAFC] hover:bg-[#222834] rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sticky Category Filter Bar */}
        <div
          className="px-5 py-2.5 border-b border-[#222731] bg-[#111419]/95 flex flex-wrap items-center gap-1.5 shrink-0"
          role="toolbar"
          aria-label={copy.jumpLabel}
        >
          <button
            type="button"
            aria-pressed={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-[#1C232E] text-amber-300 border-amber-500/55'
                : 'bg-[#14171C] text-[#9AA6B8] border-[#222731] hover:text-[#F3F5F8] hover:border-[#2E3644]'
            }`}
          >
            {copy.filterAll}
          </button>
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1C232E] text-amber-300 border-amber-500/55'
                    : 'bg-[#14171C] text-[#9AA6B8] border-[#222731] hover:text-[#F3F5F8] hover:border-[#2E3644]'
                }`}
              >
                {copy.categories[cat]}
              </button>
            );
          })}
        </div>

        {/* Scrollable Visual Guide Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 bg-[#0D0F12]">
          <p className="text-xs sm:text-sm text-[#9AA6B8] leading-relaxed">{copy.heroSubtitle}</p>

          {/* Quick Scenario Jump Index */}
          <nav
            aria-label={copy.jumpLabel}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2"
          >
            {filteredScenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleJumpToScenario(s.id)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-[#14171C] hover:bg-[#171C24] border border-[#222731] hover:border-sky-500/55 text-xs text-[#CBD5E1] hover:text-[#F3F5F8] text-start transition-colors min-w-0 cursor-pointer"
              >
                <span
                  dir="ltr"
                  className="font-mono-tabular text-[11px] font-bold text-amber-400 shrink-0"
                >
                  {s.num}
                </span>
                <span className="truncate">{s.title}</span>
              </button>
            ))}
          </nav>

          {/* Visual Diagram Cards */}
          <div className="space-y-4">
            {filteredScenarios.map((s) => (
              <article
                key={s.id}
                ref={(el) => {
                  cardRefs.current[s.id] = el;
                }}
                className="bg-[#14171C] border border-[#222731] rounded-xl overflow-hidden scroll-mt-3"
              >
                <div className="px-4 py-3 border-b border-[#222731] flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="flex items-baseline gap-2.5 min-w-0">
                    <span
                      dir="ltr"
                      className="font-mono-tabular text-xs font-bold text-amber-400 shrink-0"
                    >
                      {s.num}
                    </span>
                    <h3 className="text-sm sm:text-[15px] font-semibold text-[#F3F5F8]">
                      {s.title}
                    </h3>
                  </div>
                  <p className="text-xs text-[#9AA6B8]">{s.flow}</p>
                </div>

                <div dir="ltr" className="bg-[#0F1217] p-3.5 overflow-x-auto">
                  <img
                    src={diagramSrcById[s.id]}
                    alt={`${s.num} ${s.title}: ${s.flow}`}
                    width={920}
                    height={200}
                    loading="lazy"
                    decoding="async"
                    className="block w-full min-w-[680px] h-auto select-none"
                  />
                </div>

                <div className="px-4 py-2.5 border-t border-[#222731] flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-[11px] font-semibold text-sky-400 whitespace-nowrap">
                    {copy.categories[s.category]}
                  </span>
                  <p className="text-[#9AA6B8] leading-relaxed">{s.tip}</p>
                </div>
              </article>
            ))}
          </div>

          <p className="pt-2 text-xs text-[#7D899B]">{copy.footerNote}</p>
        </div>
      </div>
    </div>
  );
};
