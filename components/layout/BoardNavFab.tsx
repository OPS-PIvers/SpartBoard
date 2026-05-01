import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, MoreVertical, Star } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useClickOutside } from '@/hooks/useClickOutside';

const FAB_BASE =
  'w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white/60 hover:text-white/90 flex items-center justify-center transition-colors backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:opacity-40 disabled:cursor-not-allowed';

export const BoardNavFab: FC = () => {
  const { t } = useTranslation();
  const { dashboards, activeDashboard, loadDashboard } = useDashboard();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const headerId = useId();

  const currentIndex = useMemo(() => {
    if (!activeDashboard) return -1;
    return dashboards.findIndex((d) => d.id === activeDashboard.id);
  }, [dashboards, activeDashboard]);

  const closePicker = useCallback(
    (returnFocus = true) => {
      setIsPickerOpen(false);
      if (returnFocus) triggerRef.current?.focus();
    },
    [setIsPickerOpen]
  );

  const handleClickOutside = useCallback(() => {
    closePicker(false);
  }, [closePicker]);

  useClickOutside(containerRef, handleClickOutside);

  // Move focus into the menu when it opens; default to the active board.
  useEffect(() => {
    if (!isPickerOpen) return;
    const targetIdx = currentIndex >= 0 ? currentIndex : 0;
    itemRefs.current[targetIdx]?.focus();
  }, [isPickerOpen, currentIndex]);

  // Drop trailing ref slots when the dashboard list shrinks so we don't
  // dispatch focus to detached buttons after a board is deleted.
  useEffect(() => {
    itemRefs.current.length = dashboards.length;
  }, [dashboards.length]);

  if (dashboards.length <= 1) return null;

  const goPrev = () => {
    if (currentIndex < 0) return;
    const next = (currentIndex - 1 + dashboards.length) % dashboards.length;
    loadDashboard(dashboards[next].id);
  };

  const goNext = () => {
    if (currentIndex < 0) return;
    const next = (currentIndex + 1) % dashboards.length;
    loadDashboard(dashboards[next].id);
  };

  const focusItem = (idx: number) => {
    const len = dashboards.length;
    const wrapped = ((idx % len) + len) % len;
    itemRefs.current[wrapped]?.focus();
  };

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const focusedIdx = itemRefs.current.findIndex(
      (el) => el === document.activeElement
    );
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closePicker();
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusItem(focusedIdx < 0 ? 0 : focusedIdx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(focusedIdx < 0 ? dashboards.length - 1 : focusedIdx - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(dashboards.length - 1);
        break;
      case 'Tab':
        // Tab takes focus out of the menu — close to keep state consistent.
        closePicker(false);
        break;
    }
  };

  const activeName = activeDashboard?.name ?? '';
  const boardListLabel = t('boardNav.boardList', {
    defaultValue: 'All boards',
  });

  return (
    <div
      ref={containerRef}
      data-screenshot="exclude"
      className="fixed bottom-6 left-4 z-dock"
    >
      {isPickerOpen && (
        <div
          role="menu"
          aria-labelledby={headerId}
          onKeyDown={handleMenuKeyDown}
          className="absolute bottom-full left-0 mb-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div
            id={headerId}
            className="px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white/40"
          >
            {boardListLabel}
          </div>
          {dashboards.map((db, idx) => {
            const isActive = activeDashboard?.id === db.id;
            return (
              <button
                key={db.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                role="menuitem"
                onClick={() => {
                  loadDashboard(db.id);
                  closePicker();
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50 ${
                  isActive
                    ? 'bg-brand-blue-primary text-white'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                {db.isDefault && (
                  <Star
                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                      isActive
                        ? 'fill-white text-white'
                        : 'fill-amber-400 text-amber-400'
                    }`}
                  />
                )}
                <span className="truncate">{db.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={goPrev}
          aria-label={t('boardNav.previous', {
            defaultValue: 'Previous board',
          })}
          title={t('boardNav.previous', { defaultValue: 'Previous board' })}
          className={FAB_BASE}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsPickerOpen((v) => !v)}
          aria-label={t('boardNav.selectBoard', {
            defaultValue: 'Select board',
          })}
          aria-haspopup="menu"
          aria-expanded={isPickerOpen}
          title={activeName}
          className={FAB_BASE}
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label={t('boardNav.next', { defaultValue: 'Next board' })}
          title={t('boardNav.next', { defaultValue: 'Next board' })}
          className={FAB_BASE}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
