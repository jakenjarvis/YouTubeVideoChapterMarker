import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: '再生・停止',
    items: [
      { keys: 'Space / K', desc: '再生 / 停止（トグル）' },
      { keys: 'L', desc: '順方向再生' },
      { keys: 'J', desc: '逆方向再生' },
    ],
  },
  {
    title: 'フレーム送り・スキップ',
    items: [
      { keys: '← / → または , / .', desc: '1フレーム逆送り / 順送り' },
      { keys: 'Shift + ← / →', desc: '10フレームスキップ' },
      { keys: 'Ctrl (Cmd) + ← / →', desc: '30フレームスキップ' },
    ],
  },
  {
    title: '秒スキップ',
    items: [
      { keys: 'A / D', desc: '1秒スキップ（-1s / +1s）' },
      { keys: 'Shift + A / D', desc: '10秒スキップ（-10s / +10s）' },
      { keys: '[ / ]', desc: '15秒スキップ（-15s / +15s）' },
    ],
  },
  {
    title: 'マーキング・シーク移動',
    items: [
      { keys: 'M', desc: '現在フレームにマーカー追加' },
      { keys: 'P / N', desc: '前 / 次のマーカーへ移動' },
      { keys: 'Shift + P / N', desc: '前 / 次の内部シーン（参考）へ移動' },
    ],
  },
];

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ isOpen, onClose }) => {
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
              キーボードショートカット一覧
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

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="space-y-2.5">
              <h3 className="text-xs font-semibold text-amber-400">{group.title}</h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between gap-2 text-xs border-b border-[#1E232C] pb-1.5"
                  >
                    <span className="text-[#CBD5E1]">{item.desc}</span>
                    <kbd className="font-mono-tabular text-[11px] px-1.5 py-0.5 rounded bg-[#0D0F12] border border-[#2C3340] text-[#F3F5F8] whitespace-nowrap shrink-0">
                      {item.keys}
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
