import React from 'react';
import { createPortal } from 'react-dom';
import { X, Keyboard, Hand } from 'lucide-react';

interface CheatSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

interface GestureRow {
  gesture: string;
  description: string;
}

const KEYBOARD_SHORTCUTS: ShortcutRow[] = [
  { keys: ['Ctrl', '/'], description: 'Open this cheat sheet' },
  { keys: ['Alt', '←/→'], description: 'Switch boards' },
  { keys: ['Alt', 'S'], description: 'Open / close widget settings' },
  { keys: ['Alt', 'D'], description: 'Toggle annotation draw mode' },
  { keys: ['Alt', 'M'], description: 'Maximize / restore widget' },
  { keys: ['Alt', 'R'], description: 'Reset widget to default size' },
  { keys: ['Esc'], description: 'Minimize focused widget' },
  { keys: ['Shift', 'Esc'], description: 'Minimize all widgets' },
  { keys: ['Delete'], description: 'Close focused widget' },
  { keys: ['Shift', 'Delete'], description: 'Clear entire board' },
];

const SMARTBOARD_GESTURES: GestureRow[] = [
  { gesture: '4-finger swipe left/right', description: 'Switch boards' },
  {
    gesture: '4-finger swipe down',
    description: 'Minimize all widgets to dock',
  },
  { gesture: '4-finger swipe up', description: 'Restore all widgets' },
  { gesture: '2-finger pinch', description: 'Zoom the board in/out' },
  {
    gesture: '3-finger swipe up',
    description: 'Toggle annotation on a widget',
  },
  { gesture: '3-finger swipe down', description: 'Screenshot a widget' },
  { gesture: '2-finger swipe down', description: 'Minimize a widget' },
];

const KeyBadge: React.FC<{ label: string }> = ({ label }) => (
  <kbd className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-700 border border-slate-600 text-slate-200 text-xs font-mono shadow-sm">
    {label}
  </kbd>
);

export const CheatSheetModal: React.FC<CheatSheetModalProps> = ({
  isOpen,
  onClose,
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    localStorage.setItem('spart_cheatsheet_opened', 'true');
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts and Gestures"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-white font-black uppercase tracking-widest text-sm">
            Shortcuts & Gestures
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — two columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10 max-h-[70vh] overflow-y-auto">
          {/* Keyboard Shortcuts */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Keyboard className="w-4 h-4 text-blue-400" />
              <h3 className="text-blue-400 font-bold uppercase tracking-wider text-xs">
                Keyboard
              </h3>
            </div>
            <ul className="space-y-3">
              {KEYBOARD_SHORTCUTS.map((row) => (
                <li
                  key={row.description}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-slate-300 text-xs leading-snug flex-1">
                    {row.description}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.keys.map((k, i) => (
                      <React.Fragment key={k}>
                        {i > 0 && (
                          <span className="text-slate-500 text-xs">+</span>
                        )}
                        <KeyBadge label={k} />
                      </React.Fragment>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Smartboard Gestures */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Hand className="w-4 h-4 text-emerald-400" />
              <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-xs">
                Smartboard Gestures
              </h3>
            </div>
            <ul className="space-y-3">
              {SMARTBOARD_GESTURES.map((row) => (
                <li key={row.description} className="flex items-start gap-3">
                  <span className="shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-900/50 border border-emerald-700/40 text-emerald-300 text-xs font-medium whitespace-nowrap">
                    {row.gesture}
                  </span>
                  <span className="text-slate-300 text-xs leading-snug">
                    {row.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 text-center">
          <p className="text-slate-500 text-xs">
            Press <KeyBadge label="Ctrl" />
            {' + '}
            <KeyBadge label="/" /> anytime to open this panel
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
