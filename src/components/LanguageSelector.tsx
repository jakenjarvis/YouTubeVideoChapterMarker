import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useI18n, type SupportedLocale } from '../i18n';

/**
 * Compact dark-studio language selector dropdown for the header.
 * Uses logical CSS properties (end-0, text-start) and per-option lang/dir attributes
 * so future languages (including RTL scripts) render cleanly without structural changes.
 */
export const LanguageSelector: React.FC = () => {
  const { locale, localeMeta, supportedLocales, setLocale, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [isOpen, focusedIndex]);

  const openMenu = (initialIdx?: number) => {
    const activeIdx = supportedLocales.findIndex((item) => item.code === locale);
    setFocusedIndex(initialIdx ?? (activeIdx >= 0 ? activeIdx : 0));
    setIsOpen(true);
  };

  const handleSelect = (nextCode: SupportedLocale) => {
    setLocale(nextCode);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      if (!isOpen) {
        e.preventDefault();
        openMenu();
      }
    } else if (e.key === 'ArrowUp') {
      if (!isOpen) {
        e.preventDefault();
        openMenu(supportedLocales.length - 1);
      }
    }
  };

  const handleOptionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((idx + 1) % supportedLocales.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((idx - 1 + supportedLocales.length) % supportedLocales.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusedIndex(supportedLocales.length - 1);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('header.languageSwitcherAriaLabel')}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#CBD5E1] hover:text-[#F8FAFC] bg-[#181C23] hover:bg-[#202631] border border-[#2A313E] rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
      >
        <Globe className="w-3.5 h-3.5 text-[#94A0B2] shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline" lang={localeMeta.htmlLang}>
          {localeMeta.nativeLabel}
        </span>
        <span className="sm:hidden font-mono-tabular">{localeMeta.shortLabel}</span>
        <ChevronDown
          className={`w-3 h-3 text-[#7D899B] transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t('header.languageSwitcherAriaLabel')}
          className="absolute end-0 mt-1.5 min-w-[148px] py-1 bg-[#14171C] border border-[#2C3340] rounded-lg shadow-xl z-50"
        >
          {supportedLocales.map((opt, idx) => {
            const isSelected = opt.code === locale;
            return (
              <button
                key={opt.code}
                ref={(el) => {
                  optionRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                lang={opt.htmlLang}
                dir={opt.dir}
                onClick={() => handleSelect(opt.code)}
                onKeyDown={(e) => handleOptionKeyDown(e, idx)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-xs text-start transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:bg-[#202631] ${
                  isSelected
                    ? 'text-amber-300 bg-amber-500/10 font-medium'
                    : 'text-[#CBD5E1] hover:text-[#F8FAFC] hover:bg-[#1E232C]'
                }`}
              >
                <span className="truncate">{opt.nativeLabel}</span>
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  <span className="font-mono-tabular text-[10px] text-[#647082]">
                    {opt.shortLabel}
                  </span>
                  {isSelected ? (
                    <Check className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  ) : (
                    <span className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
