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
  LayoutGrid,
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
  const [isBoardsMenuOpen, setIsBoardsMenuOpen] = useState(false);
  const [isCollectionMenuOpen, setIsCollectionMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const boardsTriggerRef = useRef<HTMLButtonElement>(null);
  const collectionsTriggerRef = useRef<HTMLButtonElement>(null);
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

  const showCollectionsButton = collections.length >= 2;
  const showPrevNext = boardsInCollection.length >= 2;
  // Render the row whenever there's anything navigable. Without this guard the
  // single-board user would lose their only path to BoardsModal once the
  // always-on breadcrumb pill becomes transient.
  const showFabRow = dashboards.length > 1 || collections.length > 0;

  const closeBoardsMenu = useCallback((returnFocus = true) => {
    setIsBoardsMenuOpen(false);
    if (returnFocus) boardsTriggerRef.current?.focus();
  }, []);

  const handleClickOutside = useCallback(() => {
    setIsBoardsMenuOpen(false);
    setIsCollectionMenuOpen(false);
  }, []);

  useClickOutside(containerRef, handleClickOutside);

  // Seed focus to the active board (or first item) on first menu open. Tracks
  // "already focused this open cycle" via a ref so Firestore snapshots that
  // reorder dashboards don't yank focus from where the user navigated.
  const didFocusOnOpenRef = useRef(false);
  useEffect(() => {
    if (!isBoardsMenuOpen) {
      didFocusOnOpenRef.current = false;
      return;
    }
    if (didFocusOnOpenRef.current) return;
    didFocusOnOpenRef.current = true;
    const targetIdx = currentIndex >= 0 ? currentIndex : 0;
    itemRefs.current[targetIdx]?.focus();
  }, [isBoardsMenuOpen, currentIndex]);

  // Drop trailing ref slots when the dashboard list shrinks so we don't
  // dispatch focus to detached buttons after a board is deleted.
  useEffect(() => {
    itemRefs.current.length = boardsInCollection.length;
  }, [boardsInCollection.length]);

  if (!showFabRow) return null;

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
    const total = boardsInCollection.length;
    if (total === 0) return;
    const wrapped = ((idx % total) + total) % total;
    itemRefs.current[wrapped]?.focus();
  };

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const focusedIdx = itemRefs.current.findIndex(
      (el) => el === document.activeElement
    );
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeBoardsMenu();
        break;
      case 'ArrowDown':
        e.preventDefault();
        focusItem(focusedIdx < 0 ? 0 : focusedIdx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(
          focusedIdx < 0 ? boardsInCollection.length - 1 : focusedIdx - 1
        );
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(boardsInCollection.length - 1);
        break;
      case 'Tab':
        closeBoardsMenu(false);
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
          onClose={() => {
            setIsCollectionMenuOpen(false);
            requestAnimationFrame(() => collectionsTriggerRef.current?.focus());
          }}
        />
      )}

      {isBoardsMenuOpen && !isCollectionMenuOpen && (
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
          {boardsInCollection.map((db, idx) => {
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
                  closeBoardsMenu();
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
        {showPrevNext && (
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
        )}
        {showCollectionsButton && (
          <button
            ref={collectionsTriggerRef}
            type="button"
            onClick={() => {
              setIsBoardsMenuOpen(false);
              setIsCollectionMenuOpen((v) => !v);
            }}
            aria-label={t('boardNav.selectCollection', {
              defaultValue: 'Select collection',
            })}
            aria-haspopup="menu"
            aria-expanded={isCollectionMenuOpen}
            title={t('boardNav.selectCollection', {
              defaultValue: 'Select collection',
            })}
            className={FAB_BASE}
          >
            <Folder className="w-4 h-4" />
          </button>
        )}
        <button
          ref={boardsTriggerRef}
          type="button"
          onClick={() => {
            setIsCollectionMenuOpen(false);
            setIsBoardsMenuOpen((v) => !v);
          }}
          aria-label={t('boardNav.selectBoard', {
            defaultValue: 'Select board',
          })}
          aria-haspopup="menu"
          aria-expanded={isBoardsMenuOpen}
          title={activeName}
          className={FAB_BASE}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        {showPrevNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label={t('boardNav.next', { defaultValue: 'Next board' })}
            title={t('boardNav.next', { defaultValue: 'Next board' })}
            className={FAB_BASE}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
