import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { useI18n, type TranslationKey } from '../i18n';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItemDef {
  keysKey: TranslationKey;
  descKey: TranslationKey;
}

interface ShortcutGroupDef {
  titleKey: TranslationKey;
  items: ShortcutItemDef[];
}

const SHORTCUT_GROUPS: ShortcutGroupDef[] = [
  {
    titleKey: 'shortcuts.groupPlayback',
    items: [
      { keysKey: 'shortcuts.keySpaceOrK', descKey: 'shortcuts.playPauseToggle' },
      { keysKey: 'shortcuts.keyL', descKey: 'shortcuts.playForward' },
      { keysKey: 'shortcuts.keyJ', descKey: 'shortcuts.playReverse' },
      { keysKey: 'shortcuts.keyShiftM', descKey: 'shortcuts.muteToggleDesc' },
      { keysKey: 'shortcuts.keyShiftUpDown', descKey: 'shortcuts.volumeAdjustDesc' },
    ],
  },
  {
    titleKey: 'shortcuts.groupFrameStep',
    items: [
      { keysKey: 'shortcuts.step1FrameKeys', descKey: 'shortcuts.step1FrameDesc' },
      { keysKey: 'shortcuts.keyShiftArrows', descKey: 'shortcuts.step10FramesDesc' },
      { keysKey: 'shortcuts.keyCtrlCmdArrows', descKey: 'shortcuts.step30FramesDesc' },
    ],
  },
  {
    titleKey: 'shortcuts.groupSecondSkip',
    items: [
      { keysKey: 'shortcuts.keyAD', descKey: 'shortcuts.skip1SecDesc' },
      { keysKey: 'shortcuts.keyShiftAD', descKey: 'shortcuts.skip10SecDesc' },
      { keysKey: 'shortcuts.keyBrackets', descKey: 'shortcuts.skip15SecDesc' },
    ],
  },
  {
    titleKey: 'shortcuts.groupMarking',
    items: [
      { keysKey: 'shortcuts.keyM', descKey: 'shortcuts.addMarkerDesc' },
      { keysKey: 'shortcuts.keyPN', descKey: 'shortcuts.jumpMarkerDesc' },
      { keysKey: 'shortcuts.keyShiftPN', descKey: 'shortcuts.jumpSceneDesc' },
    ],
  },
];

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ isOpen, onClose }) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-help-title"
    >
      <div
        className="w-full max-w-xl bg-[#14171C] border border-[#2C3340] rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#222731] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-4 h-4 text-amber-400" />
            <h2 id="shortcut-help-title" className="text-base font-semibold text-[#F3F5F8]">
              {t('shortcuts.modalTitle')}
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

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.titleKey} className="space-y-2.5">
              <h3 className="text-xs font-semibold text-amber-400">{t(group.titleKey)}</h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                    <div
                      key={item.descKey}
                      className="flex items-center justify-between gap-2 text-xs border-b border-[#1E232C] pb-1.5"
                    >
                      <span className="text-[#CBD5E1]">{t(item.descKey)}</span>
                      <kbd
                        dir="ltr"
                        className="font-mono-tabular text-[11px] px-1.5 py-0.5 rounded bg-[#0D0F12] border border-[#2C3340] text-[#F3F5F8] whitespace-nowrap shrink-0"
                      >
                        {t(item.keysKey)}
                      </kbd>
                    </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
