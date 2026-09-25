import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderInput,
  LayoutGrid,
  Pencil,
  Pin,
  Plus,
  Settings,
  Star,
} from 'lucide-react';
import type { Dashboard } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useClickOutside } from '@/hooks/useClickOutside';
import { Z_INDEX } from '@/config/zIndex';
import { FAB_BASE } from './fabClasses';
import { BoardBreadcrumb } from './BoardBreadcrumb';
import { CollectionSwitcherMenu } from './CollectionSwitcherMenu';
import { MoveBoardMenu } from './MoveBoardMenu';
import {
  InlineNameInput,
  RowActionButton,
  RowDragHandle,
} from './boardNavMenuParts';
import {
  SortableList,
  type SortableListDragHandleProps,
} from '@/components/common/SortableList';
import { shiftId } from '@/utils/reorderIds';
import {
  MENU_HEADER_CLASS,
  MENU_PANEL_CLASS,
  ROW_ACTIONS_CLASS,
  moveFocusWithinRow,
  refocusIfLost,
} from './boardNavMenu';
import { BoardsModal } from '@/components/boardsModal/BoardsModal';
import { tourAttr } from '@/config/tourAnchors';

const getBoardId = (d: Dashboard) => d.id;

const boardItemSelector = (id: string) =>
  `[data-board-id="${id}"] [role="menuitem"]`;

export const BoardNavFab: FC = () => {
  const { t } = useTranslation();
  const {
    dashboards,
    activeDashboard,
    loadDashboard,
    setActiveCollectionId,
    createNewDashboard,
    renameDashboard,
    moveBoardToCollection,
    reorderDashboards,
    addToast,
    annotationActive,
    annotationState,
    collectionsApi: {
      collections,
      createCollection,
      renameCollection,
      reorderSiblings,
    },
  } = useDashboard();
  // A pen/shape tool is armed: ink, not this FAB, owns the pointer.
  const inkingOwnsPointer =
    annotationActive && annotationState?.activeTool !== 'select';
  const [isBoardsMenuOpen, setIsBoardsMenuOpen] = useState(false);
  const [isCollectionMenuOpen, setIsCollectionMenuOpen] = useState(false);
  const [isBoardsModalOpen, setIsBoardsModalOpen] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [movingBoardId, setMovingBoardId] = useState<string | null>(null);
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
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
  //   [pinnedBoards.length + n]                                    "New Board"
  //   [pinnedBoards.length + n + 1]                                "Manage all boards"
  // Keep this offset in one named constant so the render, keyboard nav,
  // and focus-on-open all agree.
  const collectionSlotStart = pinnedBoards.length;
  const newBoardSlot = pinnedBoards.length + boardsInCollection.length;
  const manageSlot = newBoardSlot + 1;
  const totalMenuItems = manageSlot + 1;

  const showCollectionsButton = collections.length >= 1;
  const showPrevNext = boardsInCollection.length >= 2;
  // Render the row whenever there's anything navigable. Without this guard the
  // single-board user would lose their only path to BoardsModal once the
  // always-on breadcrumb pill becomes transient.
  const showFabRow = dashboards.length > 1 || collections.length > 0;

  const resetBoardsMenuModes = useCallback(() => {
    setEditingBoardId(null);
    setMovingBoardId(null);
    setIsCreatingBoard(false);
  }, []);

  const closeBoardsMenu = useCallback(
    (returnFocus = true) => {
      setIsBoardsMenuOpen(false);
      resetBoardsMenuModes();
      if (returnFocus) boardsTriggerRef.current?.focus();
    },
    [resetBoardsMenuModes]
  );

  const handleClickOutside = useCallback(() => {
    setIsBoardsMenuOpen(false);
    setIsCollectionMenuOpen(false);
    resetBoardsMenuModes();
  }, [resetBoardsMenuModes]);

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

  const handleCreateBoard = async (name: string) => {
    closeBoardsMenu();
    // createNewDashboard switches to the new board and toasts on failure.
    try {
      await createNewDashboard(name, undefined, {
        collectionId: activeCollectionId,
      });
    } catch {
      /* already toasted */
    }
  };

  const handleMoveBoard = async (
    board: Dashboard,
    collectionId: string | null,
    collectionName: string
  ) => {
    setMovingBoardId(null);
    refocusIfLost(containerRef.current, boardItemSelector(board.id));
    if ((board.collectionId ?? null) === collectionId) return;
    try {
      await moveBoardToCollection(board.id, collectionId);
      addToast(
        t('boardNav.movedTo', {
          name: collectionName,
          defaultValue: 'Moved to “{{name}}”',
        })
      );
    } catch {
      /* moveBoardToCollection rolls back and toasts */
    }
  };

  const handleCreateCollectionAndMove = async (
    board: Dashboard,
    name: string
  ) => {
    let newId: string;
    try {
      newId = await createCollection(name, null);
    } catch {
      addToast(
        t('boardsModal.createCollectionFailed', {
          defaultValue: 'Failed to create Collection',
        }),
        'error'
      );
      return;
    }
    await handleMoveBoard(board, newId, name);
  };

  const reorderBoards = (ids: string[]) => {
    // reorderDashboards toasts and rolls back on failure.
    reorderDashboards(ids).catch(() => undefined);
  };

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const active = document.activeElement;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      // Alt+Arrow moves the focused in-collection board; pinned rows aren't reorderable.
      const row = active?.closest<HTMLElement>('[data-reorderable-board-id]');
      const id = row?.getAttribute('data-reorderable-board-id');
      if (!id) return;
      e.preventDefault();
      const next = shiftId(
        boardsInCollection.map((d) => d.id),
        id,
        e.key === 'ArrowUp' ? -1 : 1
      );
      if (next) reorderBoards(next);
      return;
    }
    // Row action buttons count as their row's slot for up/down navigation.
    const focusedIdx = itemRefs.current.findIndex(
      (el, i) =>
        i < totalMenuItems &&
        !!el &&
        (el === active ||
          (!!active && !!el.closest('[data-menu-row]')?.contains(active)))
    );
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        // Stop the bubble to DashboardView's global Escape handler, which would otherwise minimize an unrelated widget.
        e.stopPropagation();
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
      case 'ArrowRight':
        moveFocusWithinRow(e, 1);
        break;
      case 'ArrowLeft':
        moveFocusWithinRow(e, -1);
        break;
      case 'F2': {
        const id = active
          ?.closest<HTMLElement>('[data-board-id]')
          ?.getAttribute('data-board-id');
        if (id) {
          e.preventDefault();
          setEditingBoardId(id);
        }
        break;
      }
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

  const renderBoardRow = (
    db: Dashboard,
    slot: number,
    leadingIcon: ReactNode,
    keyPrefix = '',
    dragHandle?: SortableListDragHandleProps
  ) => {
    const isActive = activeDashboard?.id === db.id;
    if (editingBoardId === db.id) {
      return (
        <InlineNameInput
          key={`${keyPrefix}${db.id}`}
          initialValue={db.name}
          placeholder={t('boardsModal.newBoardPrompt', {
            defaultValue: 'Board name',
          })}
          ariaLabel={t('boardNav.renameBoard', {
            defaultValue: 'Rename board',
          })}
          commitOnBlur
          onCommit={(name) => {
            setEditingBoardId(null);
            void renameDashboard(db.id, name);
            refocusIfLost(containerRef.current, boardItemSelector(db.id));
          }}
          onCancel={() => {
            setEditingBoardId(null);
            refocusIfLost(containerRef.current, boardItemSelector(db.id));
          }}
        />
      );
    }
    return (
      <div
        key={`${keyPrefix}${db.id}`}
        data-menu-row
        data-board-id={db.id}
        data-reorderable-board-id={dragHandle ? db.id : undefined}
        className={`group flex items-center transition-colors ${
          isActive
            ? 'bg-brand-blue-primary text-white'
            : 'text-white/80 hover:bg-white/10'
        }`}
      >
        <button
          ref={(el) => {
            itemRefs.current[slot] = el;
          }}
          role="menuitem"
          onClick={() => {
            loadDashboard(db.id);
            closeBoardsMenu();
          }}
          className="min-w-0 flex-1 flex items-center gap-2 pl-3 pr-1 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
        >
          {leadingIcon}
          <span className="truncate">{db.name}</span>
        </button>
        <div className={ROW_ACTIONS_CLASS}>
          <RowActionButton
            icon={Pencil}
            label={t('boardNav.renameBoard', { defaultValue: 'Rename board' })}
            onClick={() => setEditingBoardId(db.id)}
          />
          <RowActionButton
            icon={FolderInput}
            label={t('boardsModal.moveTitle', {
              defaultValue: 'Move to Collection',
            })}
            onClick={() => setMovingBoardId(db.id)}
          />
          {dragHandle && (
            <RowDragHandle
              label={t('boardNav.dragToReorder', {
                defaultValue: 'Drag to reorder (Alt+Arrow keys)',
              })}
              handle={dragHandle}
            />
          )}
        </div>
      </div>
    );
  };

  const favoriteIconClass = (db: Dashboard) =>
    activeDashboard?.id === db.id
      ? 'fill-white text-white'
      : 'fill-amber-400 text-amber-400';

  const movingBoard = movingBoardId
    ? (dashboards.find((d) => d.id === movingBoardId) ?? null)
    : null;

  const boardListLabel = t('boardNav.boardList', {
    defaultValue: 'All boards',
  });

  return (
    <div
      ref={containerRef}
      data-screenshot="exclude"
      data-tour-obstacle=""
      // inert (not aria-disabled on a div) so the faded FAB is unreachable by
      // keyboard too while the pen owns the pointer.
      inert={inkingOwnsPointer}
      className={`fixed bottom-6 left-4 z-dock transition-opacity ${
        inkingOwnsPointer ? 'pointer-events-none opacity-40' : ''
      }`}
      style={{
        // Above #dashboard-ink-layer so the FAB stays clickable in Select mode.
        zIndex: annotationActive ? Z_INDEX.annotationChromeLift : undefined,
      }}
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
          onRename={(id, name) => {
            renameCollection(id, name).catch(() =>
              addToast(
                t('collectionSwitcher.renameFailed', {
                  defaultValue: 'Failed to rename Collection',
                }),
                'error'
              )
            );
          }}
          onReorder={(parentId, ids) => {
            reorderSiblings(parentId, ids).catch(() =>
              addToast(
                t('collectionSwitcher.reorderFailed', {
                  defaultValue: 'Failed to save the new Collection order',
                }),
                'error'
              )
            );
          }}
          onCreate={(name) => {
            createCollection(name, null).catch(() =>
              addToast(
                t('boardsModal.createCollectionFailed', {
                  defaultValue: 'Failed to create Collection',
                }),
                'error'
              )
            );
          }}
        />
      )}

      {isBoardsMenuOpen && !isCollectionMenuOpen && movingBoard && (
        <MoveBoardMenu
          boardName={movingBoard.name}
          currentCollectionId={movingBoard.collectionId ?? null}
          collections={collections}
          onMove={(collectionId, collectionName) => {
            void handleMoveBoard(movingBoard, collectionId, collectionName);
          }}
          onCreateCollection={(name) => {
            void handleCreateCollectionAndMove(movingBoard, name);
          }}
          onBack={() => {
            setMovingBoardId(null);
            refocusIfLost(
              containerRef.current,
              boardItemSelector(movingBoard.id)
            );
          }}
        />
      )}

      {isBoardsMenuOpen && !isCollectionMenuOpen && !movingBoard && (
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
          className={MENU_PANEL_CLASS}
        >
          {pinnedBoards.length > 0 && (
            <>
              <div className={MENU_HEADER_CLASS}>
                {t('boardNav.pinned', { defaultValue: 'Pinned' })}
              </div>
              {pinnedBoards.map((db, idx) =>
                renderBoardRow(
                  db,
                  idx,
                  <Pin
                    className={`w-3 h-3 flex-shrink-0 ${favoriteIconClass(db)}`}
                  />,
                  'pinned-'
                )
              )}
              {boardsInCollection.length > 0 && (
                <div className="my-1 border-t border-white/10" />
              )}
            </>
          )}

          {boardsInCollection.length > 0 && (
            <div id={headerId} className={MENU_HEADER_CLASS}>
              {boardListLabel}
            </div>
          )}
          <SortableList
            items={boardsInCollection}
            getId={getBoardId}
            onReorder={(next) => reorderBoards(next.map(getBoardId))}
            renderItem={(db, handle, idx) =>
              renderBoardRow(
                db,
                collectionSlotStart + idx,
                db.isDefault ? (
                  <Star
                    className={`w-3.5 h-3.5 flex-shrink-0 ${favoriteIconClass(db)}`}
                  />
                ) : null,
                '',
                boardsInCollection.length > 1 ? handle : undefined
              )
            }
          />
          <div className="mt-1 border-t border-white/10 pt-1">
            {isCreatingBoard ? (
              <InlineNameInput
                placeholder={t('boardsModal.newBoardPrompt', {
                  defaultValue: 'Board name',
                })}
                ariaLabel={t('boardsModal.newBoard', {
                  defaultValue: 'New Board',
                })}
                commitOnBlur={false}
                onCommit={(name) => {
                  setIsCreatingBoard(false);
                  void handleCreateBoard(name);
                }}
                onCancel={() => {
                  setIsCreatingBoard(false);
                  refocusIfLost(containerRef.current, '[data-new-board]');
                }}
              />
            ) : (
              <button
                {...tourAttr('board-nav.new-board')}
                ref={(el) => {
                  itemRefs.current[newBoardSlot] = el;
                }}
                role="menuitem"
                data-new-board
                onClick={() => setIsCreatingBoard(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
              >
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                {t('boardsModal.newBoard', { defaultValue: 'New Board' })}
              </button>
            )}
            <button
              {...tourAttr('board-nav.manage-boards')}
              ref={(el) => {
                itemRefs.current[manageSlot] = el;
              }}
              role="menuitem"
              onClick={() => {
                setIsBoardsModalOpen(true);
                closeBoardsMenu(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/50"
            >
              <Settings className="w-3.5 h-3.5 flex-shrink-0" />
              {t('boardNav.manageAllBoards', {
                defaultValue: 'Manage all boards',
              })}
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-full left-0 mb-1.5 flex items-center">
        <BoardBreadcrumb />
      </div>

      <div className="flex items-center gap-1">
        {showPrevNext && (
          <button
            {...tourAttr('board-nav.previous')}
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
            {...tourAttr('board-nav.select-collection')}
            ref={collectionsTriggerRef}
            type="button"
            onClick={() => {
              setIsBoardsMenuOpen(false);
              resetBoardsMenuModes();
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
          {...tourAttr('board-nav.select-board')}
          ref={boardsTriggerRef}
          type="button"
          onClick={() => {
            setIsCollectionMenuOpen(false);
            resetBoardsMenuModes();
            setIsBoardsMenuOpen((v) => !v);
          }}
          aria-label={t('boardNav.selectBoard', {
            defaultValue: 'Select board',
          })}
          aria-haspopup="menu"
          aria-expanded={isBoardsMenuOpen}
          title={t('boardNav.selectBoard', {
            defaultValue: 'Select board',
          })}
          className={FAB_BASE}
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        {showPrevNext && (
          <button
            {...tourAttr('board-nav.next')}
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
