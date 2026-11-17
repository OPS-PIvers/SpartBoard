// The Writing widget body: the Library of Writing assignments, and the ones In Progress and Completed.
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CheckSquare,
  Inbox,
  Loader2,
  NotebookPen,
  Play,
  Plus,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import type {
  StudentOverride,
  StudentTargetRef,
  WidgetData,
  WritingAssignmentDefinition,
  WritingAssignmentRecord,
  WritingConfig,
} from '@/types';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useWritingAssignmentLibrary } from '@/hooks/useWritingAssignmentLibrary';
import { useFolders } from '@/hooks/useFolders';
import { useWritingAssignmentSessions } from '@/hooks/useWritingAssignmentSessions';
import { buildMixedTargetsPayload } from '@/utils/assignTargets';
import { payloadRequiresCall } from '@/utils/studentTargetRef';
import { skippedTargetsToastMessage } from '@/utils/assignTargetingSkippedToast';
import type { WritingAssignSubmission } from '@/utils/writingAssign';
import {
  BulkActionBar,
  FolderPickerPopover,
  FolderSidebar,
  LibraryDndContext,
  LibraryGrid,
  LibraryItemCard,
  LibraryShell,
  LibraryToolbar,
  buildDuplicateAction,
  buildMoveToFolderAction,
  countItemsByFolder,
  useLibrarySelection,
  useFolderLibraryView,
  useSortableReorder,
  LIBRARY_ITEM_NOUNS,
  useLibraryDeleteConfirm,
} from '@/components/common/library';
import type {
  LibraryMenuAction,
  LibrarySortOption,
  LibraryTab,
} from '@/components/common/library/types';
import { useFolderViewSidebar } from '@/components/common/library/useFolderViewSidebar';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { tourAttr } from '@/config/tourAnchors';
import {
  MAX_WRITING_STIMULI,
  newWritingAssignment,
  writingGradingLabel,
} from '@/utils/writingAssignments';
import { WritingEditorModal } from './WritingEditorModal';
import { WritingAssignStepper } from './WritingAssignStepper';
import { WritingAssignmentRow } from './WritingAssignmentRow';

type Item = WritingAssignmentDefinition;

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'manual', label: 'Manual order', defaultDir: 'asc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'updatedAt', label: 'Last updated', defaultDir: 'desc' },
  { key: 'createdAt', label: 'Date created', defaultDir: 'desc' },
];

// Module scope keeps option identities stable for useLibraryView.
const LIBRARY_SEARCH_FIELDS = (a: Item): string[] => [a.title];
const LIBRARY_INITIAL_SORT = { key: 'manual', dir: 'asc' as const };
const signed = (diff: number, dir: 'asc' | 'desc'): number =>
  dir === 'asc' ? diff : -diff;
const LIBRARY_SORT_COMPARATORS = {
  manual: (a: Item, b: Item, dir: 'asc' | 'desc') =>
    signed(
      (a.order ?? Number.POSITIVE_INFINITY) -
        (b.order ?? Number.POSITIVE_INFINITY),
      dir
    ),
  title: (a: Item, b: Item, dir: 'asc' | 'desc') =>
    signed(a.title.localeCompare(b.title), dir),
  updatedAt: (a: Item, b: Item, dir: 'asc' | 'desc') =>
    signed(a.updatedAt - b.updatedAt, dir),
  createdAt: (a: Item, b: Item, dir: 'asc' | 'desc') =>
    signed(a.createdAt - b.createdAt, dir),
};

const GET_ID = (a: Item): string => a.id;
const RECENT_AT = (a: Item): number => a.updatedAt ?? a.createdAt ?? 0;
const ITEM_NOUN = ['writing assignment', 'writing assignments'] as const;
const NOUN = LIBRARY_ITEM_NOUNS.writing;

const plural = (n: number): string =>
  `${n} writing assignment${n === 1 ? '' : 's'}`;

const TAB_LABELS = { archive: 'Completed' };
const ASSIGNED_NOUN = { one: 'assignment', other: 'assignments' };

// Mirrors functions/src/studentAssignmentTargets.ts input/result shapes.
interface SetAssignmentTargetsCallableInput {
  assignmentId: string;
  kind: 'writing';
  sessionId: string;
  add: StudentTargetRef[];
  remove: StudentTargetRef[];
  overridesBySourcedId: Record<string, StudentOverride | null>;
  excludedTargets?: StudentTargetRef[];
  window: {
    openAt?: number | null;
    closeAt?: number | null;
    dueAt?: number | null;
  };
  targetMode?: 'class' | 'students';
  studentTargetClassIds?: string[];
}
interface SetAssignmentTargetsCallableResult {
  skipped?: { ref: StudentTargetRef; reason: string }[];
  skippedExclusions?: { ref: StudentTargetRef; reason: string }[];
}

export const WritingManager: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as WritingConfig;
  const { updateWidget, addToast, rosters } = useDashboard();
  const { user } = useAuth();
  const confirmDelete = useLibraryDeleteConfirm();
  const userId = user?.uid;

  const {
    assignments,
    loading,
    error,
    saveAssignment,
    deleteAssignment,
    duplicateAssignment,
    reorderAssignments,
  } = useWritingAssignmentLibrary(userId);
  const folderState = useFolders(userId, 'writing');
  const sessions = useWritingAssignmentSessions(userId);

  const tab: LibraryTab = config.managerTab ?? 'library';
  const update = useCallback(
    (updates: Partial<WritingConfig>) =>
      updateWidget(widget.id, { config: { ...config, ...updates } }),
    [config, updateWidget, widget.id]
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [folderPickerTarget, setFolderPickerTarget] = useState<Item | null>(
    null
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const selection = useLibrarySelection();

  const setTab = (next: LibraryTab): void => {
    if (next !== 'library' && selectionMode) {
      setSelectionMode(false);
      selection.clear();
    }
    update({
      managerTab: next === 'active' || next === 'archive' ? next : 'library',
    });
  };

  const byId = useMemo(
    () => new Map(assignments.map((a) => [a.id, a])),
    [assignments]
  );
  const byIdRef = useRef(byId);
  useLayoutEffect(() => {
    byIdRef.current = byId;
  }, [byId]);
  // Archived items stay out of the Library; nothing archives them any more.
  const libraryItems = useMemo(
    () => assignments.filter((a) => !a.archivedAt),
    [assignments]
  );
  const activeRecords = useMemo(
    () => sessions.records.filter((r) => r.status !== 'ended'),
    [sessions.records]
  );
  const endedRecords = useMemo(
    () => sessions.records.filter((r) => r.status === 'ended'),
    [sessions.records]
  );

  const folderItemCounts = useMemo(
    () => countItemsByFolder(libraryItems),
    [libraryItems]
  );
  const folderView = useFolderViewSidebar({
    setFolderColor: folderState.setFolderColor,
    reorderSiblings: folderState.reorderSiblings,
    noun: { one: NOUN.one, many: NOUN.other },
    items: libraryItems,
    deleteItems: async (ids) => {
      for (const id of ids) await deleteAssignment(id);
    },
  });

  const view = useFolderLibraryView<Item>({
    items: libraryItems,
    folderView: {
      library: 'writing',
      userId,
      folders: folderState.folders,
      foldersLoading: folderState.loading,
      reorderSiblings: folderState.reorderSiblings,
      getId: GET_ID,
      getRecentAt: RECENT_AT,
      itemNoun: ITEM_NOUN,
    },
    initialSort: LIBRARY_INITIAL_SORT,
    initialViewMode: config.libraryViewMode ?? 'list',
    searchFields: LIBRARY_SEARCH_FIELDS,
    sortComparators: LIBRARY_SORT_COMPARATORS,
    onViewModeChange: (libraryViewMode) => update({ libraryViewMode }),
  });

  const reorder = useSortableReorder<Item>({
    items: view.visibleItems,
    getId: GET_ID,
    onCommit: reorderAssignments,
  });

  const { moveItem } = folderState;
  const handleDropOnFolder = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!userId) return;
      try {
        await moveItem(itemId, folderId);
      } catch {
        addToast('That writing assignment could not be moved.', 'error');
      }
    },
    [addToast, moveItem, userId]
  );

  const reorderDragActive =
    !view.reorderLocked && view.visibleItems.length >= 2;
  const handleReorderDrop = useCallback(
    (orderedIds: string[]) => {
      if (!reorderDragActive || !view.prepareReorder()) return;
      void reorder.handleReorder(orderedIds);
    },
    [reorder, reorderDragActive, view]
  );

  const handleCreate = async (): Promise<void> => {
    const next = newWritingAssignment(
      crypto.randomUUID(),
      'New writing assignment',
      view.selectedFolderId,
      Date.now()
    );
    try {
      await saveAssignment(next);
      setEditingId(next.id);
    } catch {
      addToast('That writing assignment could not be created.', 'error');
    }
  };

  const handleSave = useCallback(
    async (next: Item): Promise<void> => {
      // Deleted elsewhere: an editor save must not bring it back.
      const current = byIdRef.current.get(next.id);
      if (!current) return;
      try {
        await saveAssignment({
          ...next,
          archivedAt: current.archivedAt ?? null,
          order: current.order,
        });
      } catch {
        addToast('That writing assignment could not be saved.', 'error');
        throw new Error('save failed');
      }
    },
    [addToast, saveAssignment]
  );

  const handleDelete = async (item: Item): Promise<void> => {
    const ok = await confirmDelete({ titles: [item.title], noun: NOUN });
    if (!ok) return;
    try {
      await deleteAssignment(item.id);
    } catch {
      addToast('That writing assignment could not be deleted.', 'error');
    }
  };

  const performAssign = async ({
    input,
    expandedTargeting,
    studentTargetClassIds,
  }: WritingAssignSubmission): Promise<boolean> => {
    let sessionId: string;
    try {
      sessionId = await sessions.assign(input);
    } catch {
      addToast('That writing assignment could not be assigned.', 'error');
      return false;
    }
    const payload = buildMixedTargetsPayload(undefined, {
      targeting: expandedTargeting,
      studentTargetClassIds,
    });
    if (payloadRequiresCall(payload)) {
      try {
        const res = await httpsCallable<
          SetAssignmentTargetsCallableInput,
          SetAssignmentTargetsCallableResult
        >(
          functions,
          'setAssignmentTargetsV1'
        )({ assignmentId: sessionId, kind: 'writing', sessionId, ...payload });
        const skipped = res.data.skipped?.length ?? 0;
        if (skipped > 0)
          addToast(
            skippedTargetsToastMessage(
              skipped,
              res.data.skippedExclusions?.length ?? 0
            ),
            'error'
          );
      } catch {
        addToast(
          'Could not apply individual targeting. Try editing the assignment again.',
          'error'
        );
      }
    }
    setAssigningId(null);
    update({ managerTab: 'active' });
    addToast('Assigned.', 'success');
    return true;
  };

  const handleEnd = async (record: WritingAssignmentRecord): Promise<void> => {
    try {
      await sessions.end(record.id);
    } catch {
      addToast('That assignment could not be ended.', 'error');
    }
  };

  const handleDeleteRecord = async (
    record: WritingAssignmentRecord
  ): Promise<void> => {
    const ok = await confirmDelete({
      titles: [record.title],
      noun: ASSIGNED_NOUN,
      detail: "Students' writing is deleted with it.",
    });
    if (!ok) return;
    try {
      await sessions.remove(record.id);
    } catch {
      addToast('That assignment could not be deleted.', 'error');
    }
  };

  const exitSelection = (): void => {
    selection.clear();
    setSelectionMode(false);
  };

  const handleBulkMove = async (folderId: string | null): Promise<void> => {
    if (!userId || selection.count === 0) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selection.selectedIds).map((id) => moveItem(id, folderId))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) addToast(`${plural(failed)} failed to move.`, 'error');
      exitSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async (): Promise<void> => {
    if (selection.count === 0) return;
    const ids = Array.from(selection.selectedIds);
    const ok = await confirmDelete({
      titles: ids.map((id) => byId.get(id)?.title ?? ''),
      noun: NOUN,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(ids.map(deleteAssignment));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) addToast(`${plural(failed)} failed to delete.`, 'error');
      exitSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const subtitleFor = (item: Item): React.ReactElement => (
    <span>
      {writingGradingLabel(item.grading)}
      {' · Updated '}
      {formatDate(item.updatedAt)}
    </span>
  );

  const renderLibraryCard = (item: Item, index?: number) => {
    const secondary: LibraryMenuAction[] = [
      {
        id: 'edit',
        label: 'Edit',
        icon: SquarePen,
        onClick: () => setEditingId(item.id),
      },
      buildDuplicateAction(item, async () => {
        try {
          const copy = await duplicateAssignment(item);
          addToast(`Duplicated as "${copy.title}".`, 'success');
        } catch {
          addToast('That writing assignment could not be duplicated.', 'error');
        }
      }),
      buildMoveToFolderAction({
        onOpenPicker: () => setFolderPickerTarget(item),
        disabled: !userId,
      }),
      {
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: () => void handleDelete(item),
      },
    ];
    return (
      <LibraryItemCard<Item>
        key={item.id}
        id={item.id}
        title={item.title}
        subtitle={subtitleFor(item)}
        primaryAction={{
          label: 'Assign',
          icon: Play,
          onClick: () => setAssigningId(item.id),
        }}
        secondaryActions={secondary}
        viewMode={view.state.viewMode}
        meta={item}
        selectionMode={selectionMode}
        selected={selection.isSelected(item.id)}
        onSelectionToggle={() => selection.toggle(item.id)}
        onClick={() => setEditingId(item.id)}
        onDoubleClick={() => setEditingId(item.id)}
        tourIndex={index}
        tourWidgetType="writing"
      />
    );
  };

  const editing = editingId ? byId.get(editingId) : undefined;
  const assigning = assigningId ? byId.get(assigningId) : undefined;

  const renderRecords = (
    records: WritingAssignmentRecord[],
    mode: 'active' | 'archive'
  ) =>
    sessions.loading ? (
      <LoadingRow />
    ) : records.length === 0 ? (
      <ScaledEmptyState
        icon={Inbox}
        title={
          mode === 'active'
            ? 'No writing assignments in progress'
            : 'No completed assignments'
        }
        subtitle={
          mode === 'active'
            ? 'Assign one from the Library tab.'
            : 'Ended assignments appear here.'
        }
      />
    ) : (
      <div className="flex flex-col">
        {records.map((record, index) => (
          <WritingAssignmentRow
            key={record.id}
            record={record}
            mode={mode}
            tourIndex={index}
            onEnd={(r) => void handleEnd(r)}
            onDelete={(r) => void handleDeleteRecord(r)}
          />
        ))}
      </div>
    );

  const folderSidebarSlot =
    tab === 'library' && userId ? (
      <FolderSidebar
        widget="writing"
        folders={folderState.folders}
        loading={folderState.loading}
        error={folderState.error}
        selectedFolderId={view.selectedFolderId}
        onSelectFolder={view.onSelectFolder}
        folderView={view.folderView}
        itemCounts={folderItemCounts}
        onCreateFolder={folderState.createFolder}
        onRenameFolder={folderState.renameFolder}
        onMoveFolder={folderState.moveFolder}
        onDeleteFolder={folderState.deleteFolder}
        {...folderView}
        enableDrop
      />
    ) : undefined;

  const selectButton = userId ? (
    <button
      type="button"
      {...tourAttr('writing.selection-mode', widget.id, 'writing')}
      onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
      className={`inline-flex items-center rounded-lg font-bold uppercase tracking-wider transition-colors ${
        selectionMode
          ? 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
          : 'bg-white/70 text-slate-600 hover:bg-white hover:text-slate-800'
      }`}
      style={{
        gap: 'min(6px, 1.5cqmin)',
        paddingInline: 'min(10px, 2.5cqmin)',
        paddingBlock: 'min(6px, 1.5cqmin)',
        fontSize: 'min(12px, 4cqmin)',
      }}
      aria-pressed={selectionMode}
      title={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
    >
      <CheckSquare
        style={{ width: 'min(14px, 3.5cqmin)', height: 'min(14px, 3.5cqmin)' }}
      />
      {selectionMode ? 'Cancel' : 'Select'}
    </button>
  ) : undefined;

  const shell = (
    <LibraryShell
      widgetLabel="Writing"
      widgetType="writing"
      tab={tab}
      onTabChange={setTab}
      counts={{
        library: libraryItems.length,
        active: activeRecords.length,
        archive: endedRecords.length,
      }}
      tabLabels={TAB_LABELS}
      visibleTabs={['library', 'active', 'archive']}
      primaryAction={
        tab === 'library'
          ? {
              label: 'New writing assignment',
              icon: Plus,
              onClick: () => void handleCreate(),
            }
          : undefined
      }
      folderPanelMode={config.folderPanelMode}
      onFolderPanelModeChange={(folderPanelMode) => update({ folderPanelMode })}
      filterSidebarSlot={folderSidebarSlot}
      folderView={view.folderView}
      folderViewMode={view.state.viewMode}
      toolbarSlot={
        tab === 'library' ? (
          <LibraryToolbar
            {...view.toolbarProps}
            sortOptions={SORT_OPTIONS}
            searchPlaceholder="Search writing assignments…"
            widgetType="writing"
            rightSlot={selectButton}
          />
        ) : undefined
      }
    >
      {loading ? (
        <LoadingRow />
      ) : tab === 'library' ? (
        <div className="flex flex-col">
          {error && (
            <p
              role="status"
              className="mb-3 rounded-xl bg-red-50 px-3 py-2 font-semibold text-brand-red-primary"
              style={{ fontSize: 'min(12px, 4.5cqmin)' }}
            >
              {error}
            </p>
          )}
          {selectionMode && selection.count > 0 && (
            <div style={{ marginBottom: 'min(12px, 3cqmin)' }}>
              <BulkActionBar
                count={selection.count}
                onClear={exitSelection}
                folders={folderState.folders}
                onMove={handleBulkMove}
                onDelete={handleBulkDelete}
                busy={bulkBusy}
                anchors={{
                  move: tourAttr('writing.bulk-move'),
                  delete: tourAttr('writing.bulk-delete'),
                  clear: tourAttr('writing.bulk-clear'),
                }}
              />
            </div>
          )}
          <LibraryGrid<Item>
            items={reorder.orderedItems}
            getId={GET_ID}
            renderCard={renderLibraryCard}
            onReorder={handleReorderDrop}
            dragDisabled={!userId}
            reorderLocked={reorderDragActive ? view.reorderLocked : false}
            reorderLockedReason={
              reorderDragActive ? view.reorderLockedReason : undefined
            }
            layout={view.state.viewMode}
            useExternalDndContext={Boolean(userId)}
            emptyState={
              <ScaledEmptyState
                icon={NotebookPen}
                title={
                  libraryItems.length === 0
                    ? 'No writing assignments yet'
                    : 'Nothing matches'
                }
                subtitle={
                  libraryItems.length === 0
                    ? 'Click "New writing assignment" to start one.'
                    : 'Try a different search, folder, or filter.'
                }
              />
            }
          />
        </div>
      ) : tab === 'active' ? (
        renderRecords(activeRecords, 'active')
      ) : (
        renderRecords(endedRecords, 'archive')
      )}
    </LibraryShell>
  );

  return (
    <>
      {userId && tab === 'library' ? (
        <LibraryDndContext
          folderView={view.folderView}
          selectedIds={selection.selectedIds}
          folderActions={folderState}
          itemIds={reorder.orderedItems.map(GET_ID)}
          onReorder={handleReorderDrop}
          onDropOnFolder={handleDropOnFolder}
          renderOverlay={(activeId) => {
            const item = reorder.orderedItems.find((a) => a.id === activeId);
            return item ? renderLibraryCard(item) : null;
          }}
        >
          {shell}
        </LibraryDndContext>
      ) : (
        shell
      )}

      {folderPickerTarget && (
        <FolderPickerPopover
          variant="dialog"
          folders={folderState.folders}
          selectedFolderId={folderPickerTarget.folderId ?? null}
          onSelect={(folderId) => {
            void handleDropOnFolder(folderPickerTarget.id, folderId);
          }}
          onClose={() => setFolderPickerTarget(null)}
          title={`Move "${folderPickerTarget.title}" to…`}
        />
      )}

      {assigning && (
        <WritingAssignStepper
          isOpen
          item={assigning}
          rosters={rosters}
          onClose={() => setAssigningId(null)}
          onAssign={performAssign}
        />
      )}

      {editing && (
        <WritingEditorModal
          isOpen
          assignment={editing}
          folders={folderState.folders}
          teacherUid={userId ?? ''}
          onSave={handleSave}
          onClose={() => setEditingId(null)}
          onStimulusLimit={() =>
            addToast(`Up to ${MAX_WRITING_STIMULI} stimuli.`, 'info')
          }
        />
      )}
    </>
  );
};

const LoadingRow: React.FC = () => (
  <div
    className="flex items-center justify-center text-brand-blue-primary"
    style={{ gap: 'min(12px, 3cqmin)', height: 'min(160px, 40cqmin)' }}
  >
    <Loader2
      className="animate-spin"
      aria-label="Loading"
      style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
    />
  </div>
);
