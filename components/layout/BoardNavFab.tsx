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
  Pin,
  Settings,
  Star,
} from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';
import { useClickOutside } from '@/hooks/useClickOutside';
import { FAB_BASE } from './fabClasses';
import { BoardBreadcrumb } from './BoardBreadcrumb';
import { CollectionSwitcherMenu } from './CollectionSwitcherMenu';
import { BoardsModal } from '@/components/boardsModal/BoardsModal';

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
  const [isBoardsModalOpen, setIsBoardsModalOpen] = useState(false);
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

  // Pinned section sits at the top of the Boards menu — surfaces every
  // pinned board from OTHER Collections so a teacher can jump to a
  // frequently-used board without remembering which Collection it lives in.
  // Pinned boards inside the current Collection are excluded here: they'd
  // already appear in the in-collection list below and showing them twice
  // is just noise. Sorted alphabetically for predictability (pin order
  // isn't meaningful when the source set is "boards from anywhere").
  const pinnedBoards = useMemo(
    () =>
      dashboards
        .filter(
          (d) => d.isPinned && (d.collectionId ?? null) !== activeCollectionId
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dashboards, activeCollectionId]
  );

  const currentIndex = useMemo(() => {
    if (!activeDashboard) return -1;
    return boardsInCollection.findIndex((d) => d.id === activeDashboard.id);
  }, [boardsInCollection, activeDashboard]);

  // Slot layout in itemRefs:
  //   [0 .. pinnedBoards.length - 1]                              pinned items
  //   [pinnedBoards.length .. pinnedBoards.length + n - 1]         in-collection items
  //   [pinnedBoards.length + n]                                    "Manage all boards…"
  // Keep this offset in one named constant so the render, keyboard nav,
  // and focus-on-open all agree.
  const collectionSlotStart = pinnedBoards.length;
  const manageSlot = pinnedBoards.length + boardsInCollection.length;
  const totalMenuItems = manageSlot + 1;

  const showCollectionsButton = collections.length >= 1;
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
    // Offset into the collection section since pinned items occupy the
    // leading slots. Falls back to the first menu item (pinned or
    // in-collection) when the active board isn't represented.
    const targetIdx =
      currentIndex >= 0 ? collectionSlotStart + currentIndex : 0;
    itemRefs.current[targetIdx]?.focus();
  }, [isBoardsMenuOpen, currentIndex, collectionSlotStart]);

  // Drop trailing ref slots when the dashboard list shrinks so we don't
  // dispatch focus to detached buttons after a board is deleted.
  useEffect(() => {
    itemRefs.current.length = totalMenuItems;
  }, [totalMenuItems]);

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
    const wrapped = ((idx % totalMenuItems) + totalMenuItems) % totalMenuItems;
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
        focusItem(focusedIdx < 0 ? manageSlot : focusedIdx - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(manageSlot);
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
          // Fall back to an inline aria-label when the in-collection section
          // (which owns the labeled header) isn't rendered — otherwise
          // aria-labelledby would point at a non-existent element and
          // screen readers would announce no accessible name for the menu.
          {...(boardsInCollection.length > 0
            ? { 'aria-labelledby': headerId }
            : {
                'aria-label': t('boardNav.boardList', {
                  defaultValue: 'All boards',
                }),
              })}
          onKeyDown={handleMenuKeyDown}
          className="absolute bottom-full left-0 mb-2 w-64 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {pinnedBoards.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white/40">
                {t('boardNav.pinned', { defaultValue: 'Pinned' })}
              </div>
              {pinnedBoards.map((db, idx) => {
                const isActive = activeDashboard?.id === db.id;
                return (
                  <button
                    key={`pinned-${db.id}`}
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
                    <Pin
                      className={`w-3 h-3 flex-shrink-0 ${
                        isActive
                          ? 'fill-white text-white'
                          : 'fill-amber-400 text-amber-400'
                      }`}
                    />
                    <span className="truncate">{db.name}</span>
                  </button>
                );
              })}
              {boardsInCollection.length > 0 && (
                <div className="my-1 border-t border-white/10" />
              )}
            </>
          )}

          {boardsInCollection.length > 0 && (
            <div
              id={headerId}
              className="px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-white/40"
            >
              {boardListLabel}
            </div>
          )}
          {boardsInCollection.map((db, idx) => {
            const isActive = activeDashboard?.id === db.id;
            const slot = collectionSlotStart + idx;
            return (
              <button
                key={db.id}
                ref={(el) => {
                  itemRefs.current[slot] = el;
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
          <button
            ref={(el) => {
              itemRefs.current[manageSlot] = el;
            }}
            role="menuitem"
            onClick={() => {
              setIsBoardsModalOpen(true);
              closeBoardsMenu(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-left text-sm text-white/80 hover:bg-white/10 border-t border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
          >
            <Settings className="w-3.5 h-3.5 flex-shrink-0" />
            {t('boardNav.manageAllBoards', {
              defaultValue: 'Manage all boards…',
            })}
          </button>
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
      {isBoardsModalOpen && (
        <BoardsModal
          onClose={() => {
            setIsBoardsModalOpen(false);
            boardsTriggerRef.current?.focus();
          }}
        />
      )}
    </div>
  );
};
