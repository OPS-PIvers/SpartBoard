import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Keyboard, Hand } from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { useTranslation, Trans } from 'react-i18next';

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

const KeyBadge: React.FC<{ label: string }> = ({ label }) => (
  <kbd className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-700 border border-slate-600 text-slate-200 text-xs font-mono shadow-sm">
    {label}
  </kbd>
);

// Track open modals for nested scroll-lock, matching the shared Modal pattern
let openCheatSheetCount = 0;

export const CheatSheetModal: React.FC<CheatSheetModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

  const keyboardShortcuts: ShortcutRow[] = useMemo(
    () => [
      {
        keys: ['Ctrl/⌘', '/'],
        description: t('widgets.cheatSheet.shortcuts.openCheatSheet'),
      },
      {
        keys: ['Alt', '←/→'],
        description: t('widgets.cheatSheet.shortcuts.switchBoards'),
      },
      {
        keys: ['Alt', 'S'],
        description: t('widgets.cheatSheet.shortcuts.widgetSettings'),
      },
      {
        keys: ['Alt', 'D'],
        description: t('widgets.cheatSheet.shortcuts.annotate'),
      },
      {
        keys: ['Alt', 'M'],
        description: t('widgets.cheatSheet.shortcuts.maximize'),
      },
      {
        keys: ['Alt', 'R'],
        description: t('widgets.cheatSheet.shortcuts.resetSize'),
      },
      {
        keys: ['Esc'],
        description: t('widgets.cheatSheet.shortcuts.minimizeFocused'),
      },
      {
        keys: ['Shift', 'Esc'],
        description: t('widgets.cheatSheet.shortcuts.minimizeAll'),
      },
      {
        keys: ['Delete'],
        description: t('widgets.cheatSheet.shortcuts.closeFocused'),
      },
      {
        keys: ['Shift', 'Delete'],
        description: t('widgets.cheatSheet.shortcuts.clearBoard'),
      },
    ],
    [t]
  );

  const boardGestures: GestureRow[] = useMemo(
    () => [
      {
        gesture: t('widgets.cheatSheet.gestureNames.twoFingerSwipeDown'),
        description: t('widgets.cheatSheet.gestures.minimizeAll'),
      },
      {
        gesture: t('widgets.cheatSheet.gestureNames.twoFingerSwipeUp'),
        description: t('widgets.cheatSheet.gestures.restoreAll'),
      },
      {
        gesture: t('widgets.cheatSheet.gestureNames.oneFingerDrag'),
        description: t('widgets.cheatSheet.gestures.panBoard'),
      },
      {
        gesture: t('widgets.cheatSheet.gestureNames.oneFingerSwipeEdge'),
        description: t('widgets.cheatSheet.gestures.openSidebar'),
      },
      {
        gesture: t('widgets.cheatSheet.gestureNames.oneFingerDoubleTap'),
        description: t('widgets.cheatSheet.gestures.fullscreen'),
      },
    ],
    [t]
  );

  const widgetGestures: GestureRow[] = useMemo(
    () => [
      {
        gesture: t('widgets.cheatSheet.gestureNames.widgetTwoFingerSwipeDown'),
        description: t('widgets.cheatSheet.gestures.minimizeWidget'),
      },
      {
        gesture: t('widgets.cheatSheet.gestureNames.widgetTwoFingerSwipeUp'),
        description: t('widgets.cheatSheet.gestures.maximizeWidget'),
      },
      {
        gesture: t('widgets.cheatSheet.gestureNames.twoFingerLongPress'),
        description: t('widgets.cheatSheet.gestures.toggleAnnotation'),
      },
      {
        gesture: t('widgets.cheatSheet.gestureNames.oneFingerLongPress'),
        description: t('widgets.cheatSheet.gestures.screenshot'),
      },
    ],
    [t]
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    // Notify the onboarding widget (same-tab, storage event won't fire)
    try {
      localStorage.setItem('spart_cheatsheet_opened', 'true');
    } catch {
      // Ignore storage errors so the cheat sheet can still open
    }
    window.dispatchEvent(new Event('spart:cheatsheet-opened'));

    // Body scroll lock (matching shared Modal behaviour)
    if (openCheatSheetCount === 0) {
      document.body.style.overflow = 'hidden';
    }
    openCheatSheetCount++;

    // Use capture phase so Escape is intercepted before DashboardView's
    // global keydown handler (which also handles Escape for widget actions).
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape, { capture: true });

    return () => {
      openCheatSheetCount--;
      if (openCheatSheetCount === 0) {
        document.body.style.overflow = 'unset';
      }
      window.removeEventListener('keydown', handleEscape, { capture: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.modal }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('widgets.cheatSheet.title')}
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
            {t('widgets.cheatSheet.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            aria-label={t('common.close')}
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
                {t('widgets.cheatSheet.keyboard')}
              </h3>
            </div>
            <ul className="space-y-3">
              {keyboardShortcuts.map((row) => (
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

          {/* Touchscreen Gestures */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Hand className="w-4 h-4 text-emerald-400" />
              <h3 className="text-emerald-400 font-bold uppercase tracking-wider text-xs">
                {t('widgets.cheatSheet.touchscreenGestures')}
              </h3>
            </div>

            <div className="space-y-6">
              {/* Board Context */}
              <section>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="h-px bg-slate-800 flex-1" />
                  {t('widgets.cheatSheet.boardGestures')}
                  <span className="h-px bg-slate-800 flex-1" />
                </h4>
                <ul className="space-y-3">
                  {boardGestures.map((row) => (
                    <li
                      key={row.description}
                      className="flex items-start gap-3"
                    >
                      <span className="shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-900/50 border border-emerald-700/40 text-emerald-300 text-xs font-medium whitespace-nowrap">
                        {row.gesture}
                      </span>
                      <span className="text-slate-300 text-xs leading-snug">
                        {row.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Widget Context */}
              <section>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="h-px bg-slate-800 flex-1" />
                  {t('widgets.cheatSheet.widgetGestures')}
                  <span className="h-px bg-slate-800 flex-1" />
                </h4>
                <ul className="space-y-3">
                  {widgetGestures.map((row) => (
                    <li
                      key={row.description}
                      className="flex items-start gap-3"
                    >
                      <span className="shrink-0 mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-900/50 border border-emerald-700/40 text-emerald-300 text-xs font-medium whitespace-nowrap">
                        {row.gesture}
                      </span>
                      <span className="text-slate-300 text-xs leading-snug">
                        {row.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 text-center">
          <p className="text-slate-500 text-xs">
            <Trans
              i18nKey="widgets.cheatSheet.footer"
              components={{ kbd: <kbd /> }}
            />
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
