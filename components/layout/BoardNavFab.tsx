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
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  MoreVertical,
  Star,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useClickOutside } from '@/hooks/useClickOutside';
import { FAB_BASE } from './fabClasses';
import { BoardBreadcrumb } from './BoardBreadcrumb';
import { CollectionSwitcherMenu } from './CollectionSwitcherMenu';

export const BoardNavFab: FC = () => {
  const { t } = useTranslation();
  const {
    dashboards,
    activeDashboard,
    loadDashboard,
    setActiveCollectionId,
    collectionsApi: { collections },
  } = useDashboard();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isCollectionMenuOpen, setIsCollectionMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const headerId = useId();

  const activeCollectionId = activeDashboard?.collectionId ?? null;
  const boardsInCollection = useMemo(
    () =>
      dashboards
        .filter((d) => (d.collectionId ?? null) === activeCollectionId)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [dashboards, activeCollectionId]
  );

  const currentIndex = useMemo(() => {
    if (!activeDashboard) return -1;
    return boardsInCollection.findIndex((d) => d.id === activeDashboard.id);
  }, [boardsInCollection, activeDashboard]);

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

  // Move focus into the menu the first time it opens; default to the active
  // board. Tracks "already focused this open-cycle" via a ref so a Firestore
  // snapshot reordering dashboards (which bumps currentIndex) doesn't yank
  // focus from wherever the keyboard user has navigated since.
  const didFocusOnOpenRef = useRef(false);
  useEffect(() => {
    if (!isPickerOpen) {
      didFocusOnOpenRef.current = false;
      return;
    }
    if (didFocusOnOpenRef.current) return;
    didFocusOnOpenRef.current = true;
    const switchSlot = collections.length > 0 ? 1 : 0;
    const targetIdx =
      currentIndex >= 0 ? currentIndex + switchSlot : switchSlot;
    itemRefs.current[targetIdx]?.focus();
  }, [isPickerOpen, currentIndex, collections.length]);

  // Drop trailing ref slots when the dashboard list shrinks so we don't
  // dispatch focus to detached buttons after a board is deleted.
  useEffect(() => {
    const switchSlot = collections.length > 0 ? 1 : 0;
    itemRefs.current.length = switchSlot + boardsInCollection.length;
  }, [boardsInCollection.length, collections.length]);

  if (boardsInCollection.length <= 1) return null;

  const goPrev = () => {
    if (currentIndex < 0) return;
    const next =
      (currentIndex - 1 + boardsInCollection.length) %
      boardsInCollection.length;
    loadDashboard(boardsInCollection[next].id);
  };

  const goNext = () => {
    if (currentIndex < 0) return;
    const next = (currentIndex + 1) % boardsInCollection.length;
    loadDashboard(boardsInCollection[next].id);
  };

  const focusItem = (idx: number) => {
    const switchSlot = collections.length > 0 ? 1 : 0;
    const totalItems = switchSlot + boardsInCollection.length;
    if (totalItems === 0) return;
    const wrapped = ((idx % totalItems) + totalItems) % totalItems;
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
        focusItem(
          focusedIdx < 0
            ? (collections.length > 0 ? 1 : 0) + boardsInCollection.length - 1
            : focusedIdx - 1
        );
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(
          (collections.length > 0 ? 1 : 0) + boardsInCollection.length - 1
        );
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
      {isCollectionMenuOpen && (
        <CollectionSwitcherMenu
          collections={collections}
          activeCollectionId={activeCollectionId}
          onSelect={(id) => setActiveCollectionId(id)}
          onClose={() => setIsCollectionMenuOpen(false)}
        />
      )}

      {isPickerOpen && !isCollectionMenuOpen && (
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
          {collections.length > 0 && (
            <button
              ref={(el) => {
                itemRefs.current[0] = el;
              }}
              role="menuitem"
              onClick={() => {
                setIsPickerOpen(false);
                setIsCollectionMenuOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 border-b border-white/10 mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
            >
              <Folder className="w-3.5 h-3.5 flex-shrink-0" />
              {t('boardNav.switchCollection', {
                defaultValue: 'Switch Collection…',
              })}
            </button>
          )}
          {boardsInCollection.map((db, idx) => {
            const isActive = activeDashboard?.id === db.id;
            // Offset board indices by 1 when the Switch Collection item occupies
            // itemRefs[0]. Keeps Arrow-key navigation inclusive of both the
            // collection switcher and every board in the active collection.
            const refIdx = collections.length > 0 ? idx + 1 : idx;
            return (
              <button
                key={db.id}
                ref={(el) => {
                  itemRefs.current[refIdx] = el;
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

      <div className="absolute bottom-full left-0 mb-1.5 flex items-center">
        <BoardBreadcrumb />
      </div>

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
          aria-expanded={isPickerOpen || isCollectionMenuOpen}
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
