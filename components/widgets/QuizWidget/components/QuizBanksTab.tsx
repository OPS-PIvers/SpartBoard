import React, { useCallback, useMemo, useState } from 'react';
import {
  CheckSquare,
  Edit2,
  Eye,
  FileUp,
  Library,
  Loader2,
  Plus,
  Trash2,
  Users2,
  UserMinus,
  FolderMinus,
} from 'lucide-react';
import type { Plc, QuestionBankMetadata } from '@/types';
import type { BankSource } from '@/hooks/useBankSources';
import {
  LibraryShell,
  LibraryToolbar,
  LibraryGrid,
  LibraryItemCard,
  FolderSidebar,
  FolderPickerPopover,
  LibraryDndContext,
  buildMoveToFolderAction,
  buildDuplicateAction,
  useFolderLibraryView,
  useLibrarySelection,
  useSortableReorder,
  BulkActionBar,
  type LibraryBadge,
  type LibraryMenuAction,
  type LibrarySortOption,
  type LibraryShellProps,
  LIBRARY_ITEM_NOUNS,
  useLibraryDeleteConfirm,
} from '@/components/common/library';
import { countItemsByFolder } from '@/components/common/library/folderFilters';
import { useFolders } from '@/hooks/useFolders';
import { useDialog } from '@/context/useDialog';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { useFolderViewSidebar } from '@/components/common/library/useFolderViewSidebar';
import type { FolderDeleteActions } from '@/components/common/library/FolderSidebar';
import { useLibraryFolderViewEnabled } from '@/components/common/library/useFolderLibraryView';
import { useSourceFolders } from '@/components/common/library/useSourceFolders';
import { isSourceFolderId } from '@/components/common/library/sourceFolders';
import { visibleTeammateBanks } from './teammateBankRows';
import { placementSourceKey } from '@/hooks/useLibraryPlacements';

export interface QuizBanksTabProps {
  userId?: string;
  banks: QuestionBankMetadata[];
  loading: boolean;
  /** Teammates' shared banks (kind 'plc'); own banks are excluded upstream. */
  sharedBankSources: BankSource[];
  plcs: readonly Plc[];
  shell: Pick<
    LibraryShellProps,
    | 'tab'
    | 'onTabChange'
    | 'counts'
    | 'tabLabels'
    | 'widgetLabel'
    | 'widgetType'
  >;
  onNewBank: () => void;
  /** Opens the CSV / Google Sheet import wizard for a new bank. */
  onImportBank?: () => void;
  onEditBank: (meta: QuestionBankMetadata) => void;
  onDuplicateBank: (meta: QuestionBankMetadata) => void | Promise<void>;
  onDeleteBank: (meta: QuestionBankMetadata) => void | Promise<void>;
  /** The widget's delete path for the folder delete dialog's "delete everything" choice. */
  folderDeleteActions?: FolderDeleteActions;
  onReorderBanks?: (orderedIds: string[]) => Promise<void> | void;
  /** Opens the widget's PLC picker for this bank. */
  onShareBankWithPlc?: (meta: QuestionBankMetadata) => void;
  onUnshareBankFromPlc?: (
    meta: QuestionBankMetadata,
    plcId: string
  ) => void | Promise<void>;
  onPreviewSharedBank?: (source: BankSource) => void;
  /** Surfaces a failed folder move (drag or bulk) as a toast. */
  onError?: (message: string) => void;
}

const SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'manual', label: 'Manual', defaultDir: 'asc' },
  { key: 'updated', label: 'Last updated', defaultDir: 'desc' },
  { key: 'created', label: 'Date created', defaultDir: 'desc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'questions', label: 'Question count', defaultDir: 'desc' },
];

const SEARCH_FIELDS = (b: QuestionBankMetadata): string =>
  b.searchText ? `${b.title} ${b.searchText}` : b.title;

const INITIAL_SORT = { key: 'updated', dir: 'desc' as const };

const GET_ID = (b: QuestionBankMetadata): string => b.id;
const BANK_NOUN = ['question bank', 'question banks'] as const;

const SORT_COMPARATORS: Record<
  string,
  (
    a: QuestionBankMetadata,
    b: QuestionBankMetadata,
    dir: 'asc' | 'desc'
  ) => number
> = {
  manual: (a, b) => (a.order ?? 0) - (b.order ?? 0),
  updated: (a, b, dir) => {
    const av = a.updatedAt || a.createdAt;
    const bv = b.updatedAt || b.createdAt;
    return dir === 'asc' ? av - bv : bv - av;
  },
  created: (a, b, dir) =>
    dir === 'asc' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt,
  title: (a, b, dir) => {
    const cmp = a.title.localeCompare(b.title);
    return dir === 'asc' ? cmp : -cmp;
  },
  questions: (a, b, dir) =>
    dir === 'asc'
      ? a.questionCount - b.questionCount
      : b.questionCount - a.questionCount,
};

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? '' : 's'}`;

export const QuizBanksTab: React.FC<QuizBanksTabProps> = ({
  userId,
  banks,
  loading,
  sharedBankSources,
  plcs,
  shell,
  onNewBank,
  onImportBank,
  onEditBank,
  onDuplicateBank,
  onDeleteBank,
  folderDeleteActions,
  onReorderBanks,
  onShareBankWithPlc,
  onUnshareBankFromPlc,
  onPreviewSharedBank,
  onError,
}) => {
  const { showConfirm } = useDialog();
  const confirmDelete = useLibraryDeleteConfirm();
  const plcNameById = useMemo(
    () => new Map(plcs.map((p) => [p.id, p.name])),
    [plcs]
  );

  // ─── Folders ─────────────────────────────────────────────────────────────
  const folderState = useFolders(userId, 'question_bank');
  const [folderPickerTarget, setFolderPickerTarget] =
    useState<QuestionBankMetadata | null>(null);
  const folderItemCounts = useMemo(() => countItemsByFolder(banks), [banks]);

  // Teammates' banks live in "From your PLCs" until filed (D21-D24).
  const folderViewEnabled = useLibraryFolderViewEnabled();
  const teammateBanks = useMemo(
    () =>
      sharedBankSources.flatMap((source) =>
        source.plcId
          ? [
              {
                source,
                key: placementSourceKey('plcbank', source.plcId, source.bankId),
              },
            ]
          : []
      ),
    [sharedBankSources]
  );
  const teammateKeys = useMemo(
    () => teammateBanks.map((t) => t.key),
    [teammateBanks]
  );
  const sourceFolders = useSourceFolders({
    userId,
    widget: 'question_bank',
    enabled: folderViewEnabled,
    sourceKeys: teammateKeys,
    ownFolders: folderState.folders,
  });
  const { folderIdOf, move: moveSource } = sourceFolders;
  const teammateFolderIds = useMemo(
    () => (folderViewEnabled ? teammateKeys.map(folderIdOf) : undefined),
    [folderViewEnabled, teammateKeys, folderIdOf]
  );
  const [sharedPickerTarget, setSharedPickerTarget] = useState<{
    key: string;
    title: string;
    folderId: string | null;
  } | null>(null);
  const fileTeammateBank = useCallback(
    async (key: string, folderId: string | null): Promise<void> => {
      try {
        await moveSource(key, folderId);
      } catch {
        onError?.('That question bank could not be moved.');
      }
    },
    [moveSource, onError]
  );

  const folderView = useFolderViewSidebar({
    setFolderColor: folderState.setFolderColor,
    noun: { one: 'question bank', many: 'question banks' },
    items: banks,
    placed: sourceFolders.placed,
    ...folderDeleteActions,
  });

  // ─── Selection / view / reorder ───────────────────────────────────────────
  const selection = useLibrarySelection();
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const libraryView = useFolderLibraryView<QuestionBankMetadata>({
    items: banks,
    folderView: {
      library: 'question_bank',
      userId,
      folders: sourceFolders.folders,
      foldersLoading: folderState.loading,
      getId: GET_ID,
      itemNoun: BANK_NOUN,
      extraItemFolderIds: teammateFolderIds,
    },
    initialSort: INITIAL_SORT,
    initialViewMode: 'list',
    searchFields: SEARCH_FIELDS,
    sortComparators: SORT_COMPARATORS,
  });
  const onReorderCommit = useCallback(
    async (orderedIds: string[]) => {
      if (onReorderBanks) await onReorderBanks(orderedIds);
    },
    [onReorderBanks]
  );
  const reorder = useSortableReorder<QuestionBankMetadata>({
    items: libraryView.visibleItems,
    getId: GET_ID,
    onCommit: onReorderCommit,
  });

  const { moveItem } = folderState;
  const handleDropOnFolder = useCallback(
    async (itemId: string, folderId: string | null): Promise<void> => {
      if (!userId || isSourceFolderId(folderId)) return;
      try {
        await moveItem(itemId, folderId);
      } catch {
        onError?.('That question bank could not be moved.');
      }
    },
    [userId, moveItem, onError]
  );
  const handleReorderDrop = useCallback(
    async (nextOrderedIds: string[]): Promise<void> => {
      if (!onReorderBanks || !libraryView.prepareReorder()) return;
      await reorder.handleReorder(nextOrderedIds);
    },
    [libraryView, onReorderBanks, reorder]
  );

  const handleBulkMove = useCallback(
    async (folderId: string | null): Promise<void> => {
      if (!userId || selection.count === 0) return;
      const ids = Array.from(selection.selectedIds);
      setBulkBusy(true);
      try {
        const results = await Promise.allSettled(
          ids.map((id) => moveItem(id, folderId))
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          onError?.(`${failed} bank${failed === 1 ? '' : 's'} failed to move.`);
        }
        selection.clear();
        setSelectionMode(false);
      } finally {
        setBulkBusy(false);
      }
    },
    [userId, selection, moveItem, onError]
  );

  const handleBulkDelete = useCallback(async (): Promise<void> => {
    const targets = banks.filter((b) => selection.selectedIds.has(b.id));
    if (targets.length === 0) return;
    const ok = await confirmDelete({
      titles: targets.map((b) => b.title),
      noun: LIBRARY_ITEM_NOUNS.bank,
      detail:
        targets.length === 1
          ? 'Quizzes that draw from it will stop resolving.'
          : 'Quizzes that draw from them will stop resolving.',
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        targets.map(async (b) => onDeleteBank(b))
      );
      results.forEach((r, i) => {
        if (r.status === 'rejected')
          console.error(
            '[QuizBanksTab] bulk delete failed for',
            targets[i]?.id,
            r.reason
          );
      });
      selection.clear();
      setSelectionMode(false);
    } finally {
      setBulkBusy(false);
    }
  }, [banks, selection, confirmDelete, onDeleteBank]);

  // ─── Card content ─────────────────────────────────────────────────────────
  const renderSubtitle = (bank: QuestionBankMetadata): React.ReactNode => (
    <span>
      {plural(bank.questionCount, 'question')} ·{' '}
      {plural(bank.targetIds?.length ?? 0, 'target')} · updated{' '}
      {new Date(bank.updatedAt || bank.createdAt).toLocaleDateString()}
    </span>
  );

  const buildBadges = (bank: QuestionBankMetadata): LibraryBadge[] =>
    (bank.sync?.plcIds ?? []).map((plcId) => ({
      label: `Shared · ${plcNameById.get(plcId) ?? 'PLC'}`,
      tone: 'info' as const,
    }));

  const buildSecondaryActions = (
    bank: QuestionBankMetadata
  ): LibraryMenuAction[] => {
    const actions: LibraryMenuAction[] = [
      {
        id: 'edit',
        label: 'Edit',
        icon: Edit2,
        onClick: () => onEditBank(bank),
      },
      buildDuplicateAction(bank, () => void onDuplicateBank(bank)),
    ];
    if (onShareBankWithPlc && plcs.length > 0) {
      actions.push({
        id: 'share-with-plc',
        label: 'Share with PLC…',
        icon: Users2,
        onClick: () => onShareBankWithPlc(bank),
      });
    }
    if (onUnshareBankFromPlc) {
      for (const plcId of bank.sync?.plcIds ?? []) {
        actions.push({
          id: `unshare-${plcId}`,
          label: `Stop sharing (${plcNameById.get(plcId) ?? 'PLC'})`,
          icon: UserMinus,
          onClick: async () => {
            const ok = await showConfirm(
              `Stop sharing "${bank.title}" with ${plcNameById.get(plcId) ?? 'this PLC'}? Teammates' quizzes that draw from it will stop resolving.`,
              {
                title: 'Stop Sharing',
                variant: 'warning',
                confirmLabel: 'Stop Sharing',
              }
            );
            if (ok) await onUnshareBankFromPlc(bank, plcId);
          },
        });
      }
    }
    actions.push(
      buildMoveToFolderAction({
        onOpenPicker: () => setFolderPickerTarget(bank),
        disabled: !userId,
      })
    );
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      onClick: async () => {
        const ok = await confirmDelete({
          titles: [bank.title],
          noun: LIBRARY_ITEM_NOUNS.bank,
          detail: 'Quizzes that draw from it will stop resolving.',
        });
        if (ok) await onDeleteBank(bank);
      },
    });
    return actions;
  };

  const renderSharedRow = (
    source: BankSource,
    key: string
  ): React.ReactElement => {
    const chip = sourceFolders.placedChip(key);
    const actions: LibraryMenuAction[] = [
      buildMoveToFolderAction({
        onOpenPicker: () =>
          setSharedPickerTarget({
            key,
            title: source.title,
            folderId: chip ? folderIdOf(key) : null,
          }),
        disabled: !userId,
      }),
    ];
    if (chip) {
      actions.push({
        id: 'remove-from-folder',
        label: 'Remove from folder',
        icon: FolderMinus,
        onClick: () => void fileTeammateBank(key, null),
      });
    }
    return (
      <LibraryItemCard<BankSource>
        key={key}
        id={key}
        title={source.title}
        subtitle={
          <span>
            {plural(source.questionCount, 'question')} · Shared by{' '}
            {source.sharedByName?.trim() ? source.sharedByName : 'a teammate'}
            {source.plcName ? ` · ${source.plcName}` : ''}
          </span>
        }
        badges={chip ? [{ label: chip, tone: 'neutral' }] : undefined}
        primaryAction={
          onPreviewSharedBank
            ? {
                label: 'Preview',
                icon: Eye,
                onClick: () => onPreviewSharedBank(source),
              }
            : undefined
        }
        secondaryActions={actions}
        onDoubleClick={
          onPreviewSharedBank ? () => onPreviewSharedBank(source) : undefined
        }
        viewMode="list"
        sortable={false}
        meta={source}
      />
    );
  };

  const renderCard = (
    bank: QuestionBankMetadata,
    overlay = false,
    index?: number
  ): React.ReactElement => (
    <LibraryItemCard<QuestionBankMetadata>
      key={bank.id}
      id={bank.id}
      title={bank.title}
      subtitle={renderSubtitle(bank)}
      badges={buildBadges(bank)}
      primaryAction={{
        label: 'Edit',
        icon: Edit2,
        onClick: () => onEditBank(bank),
      }}
      secondaryActions={buildSecondaryActions(bank)}
      onDoubleClick={() => onEditBank(bank)}
      viewMode="list"
      sortable={!overlay && enableCardDrag}
      isDragOverlay={overlay}
      meta={bank}
      selectionMode={!overlay && selectionMode}
      selected={!overlay && selection.isSelected(bank.id)}
      onSelectionToggle={() => selection.toggle(bank.id)}
      tourIndex={index}
      tourWidgetType="quiz"
    />
  );

  const enableCardDrag =
    Boolean(userId) && (!selectionMode || libraryView.folderView != null);
  const orderedIds = reorder.orderedItems.map(GET_ID);

  // ─── Shell slots ──────────────────────────────────────────────────────────
  const folderSidebarSlot = userId ? (
    <FolderSidebar
      widget="question_bank"
      folders={sourceFolders.folders}
      loading={folderState.loading}
      error={folderState.error}
      selectedFolderId={libraryView.selectedFolderId}
      onSelectFolder={libraryView.onSelectFolder}
      folderView={libraryView.folderView}
      itemCounts={folderItemCounts}
      onCreateFolder={folderState.createFolder}
      onRenameFolder={folderState.renameFolder}
      onMoveFolder={folderState.moveFolder}
      onDeleteFolder={folderState.deleteFolder}
      {...folderView}
      enableDrop
    />
  ) : undefined;

  const toolbar = (
    <LibraryToolbar
      {...libraryView.toolbarProps}
      searchPlaceholder="Search banks…"
      sortOptions={SORT_OPTIONS}
      widgetType="quiz"
      rightSlot={
        userId ? (
          <button
            type="button"
            onClick={() => {
              if (selectionMode) {
                selection.clear();
                setSelectionMode(false);
              } else {
                setSelectionMode(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
              selectionMode
                ? 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
                : 'bg-white/70 text-slate-600 hover:bg-white hover:text-slate-800'
            }`}
            aria-pressed={selectionMode}
            title={
              selectionMode ? 'Exit selection mode' : 'Enter selection mode'
            }
          >
            <CheckSquare className="h-3.5 w-3.5" />
            {selectionMode ? 'Cancel' : 'Select'}
          </button>
        ) : undefined
      }
    />
  );

  const emptyState =
    banks.length === 0 ? (
      <ScaledEmptyState
        icon={Library}
        title="No Question Banks Yet"
        subtitle="Build a bank of tagged questions, then draw from it in any quiz."
        iconClassName="text-brand-blue-primary"
        titleClassName="text-brand-blue-primary"
        subtitleClassName="text-brand-blue-primary/60"
        action={
          <button
            type="button"
            onClick={onNewBank}
            className="flex items-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-2xl transition-all shadow-md active:scale-95 px-5 py-2.5 text-sm"
          >
            <Plus className="w-4 h-4" />
            New bank
          </button>
        }
      />
    ) : (
      <div className="text-sm font-medium text-slate-500 py-8 text-center">
        No banks match your search.
      </div>
    );

  // Legacy view lists teammates' banks below the library; the folder view files them as rows.
  const showSharedBanks = !libraryView.folderView;
  const sharedRows = visibleTeammateBanks(
    teammateBanks.map((t) => ({ ...t, title: t.source.title })),
    libraryView.folderView,
    libraryView.state.search,
    folderIdOf
  ).map(({ source, key }) => renderSharedRow(source, key));

  const body = loading ? (
    <div className="flex flex-col items-center justify-center h-full text-brand-blue-primary gap-3 py-10">
      <Loader2 className="w-8 h-8 animate-spin" />
      <span className="text-sm font-medium">Loading banks…</span>
    </div>
  ) : (
    <div className="flex flex-col gap-5">
      {selectionMode && selection.count > 0 && (
        <BulkActionBar
          count={selection.count}
          onClear={() => selection.clear()}
          actions={[]}
          folders={folderState.folders}
          onMove={handleBulkMove}
          onDelete={handleBulkDelete}
          busy={bulkBusy}
        />
      )}
      <LibraryGrid<QuestionBankMetadata>
        items={reorder.orderedItems}
        getId={GET_ID}
        dragDisabled={!enableCardDrag}
        reorderLocked={enableCardDrag ? false : libraryView.reorderLocked}
        reorderLockedReason={
          enableCardDrag ? undefined : libraryView.reorderLockedReason
        }
        layout="list"
        emptyState={emptyState}
        trailingRows={sharedRows}
        useExternalDndContext={enableCardDrag}
        renderCard={(bank, index) => renderCard(bank, false, index)}
      />
      {sharedBankSources.length > 0 && showSharedBanks && (
        <section
          aria-label="Banks shared with me"
          className="flex flex-col gap-2"
        >
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Shared with me ({sharedBankSources.length})
          </h4>
          <ul className="flex flex-col divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {sharedBankSources.map((source) => (
              <li
                key={source.key}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <Library
                  className="h-4 w-4 shrink-0 text-brand-blue-primary"
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-slate-800">
                    {source.title}
                  </span>
                  <span className="truncate text-xs text-slate-500">
                    {plural(source.questionCount, 'question')} · Shared by{' '}
                    {source.sharedByName?.trim()
                      ? source.sharedByName
                      : 'a teammate'}
                    {source.plcName ? ` · ${source.plcName}` : ''}
                  </span>
                </span>
                {onPreviewSharedBank && (
                  <button
                    type="button"
                    onClick={() => onPreviewSharedBank(source)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    Preview
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  const shellEl = (
    <LibraryShell
      {...shell}
      widgetType="quiz"
      primaryAction={{ label: 'New bank', icon: Plus, onClick: onNewBank }}
      secondaryActions={
        onImportBank
          ? [{ label: 'Import', icon: FileUp, onClick: onImportBank }]
          : undefined
      }
      toolbarSlot={toolbar}
      filterSidebarSlot={folderSidebarSlot}
      folderView={libraryView.folderView}
      folderViewMode="list"
    >
      {body}
    </LibraryShell>
  );

  return (
    <>
      {userId ? (
        <LibraryDndContext
          folderView={libraryView.folderView}
          selectedIds={selection.selectedIds}
          folderActions={folderState}
          itemIds={orderedIds}
          onReorder={onReorderBanks ? handleReorderDrop : undefined}
          onDropOnFolder={handleDropOnFolder}
          renderOverlay={(activeId) => {
            const bank = reorder.orderedItems.find((b) => b.id === activeId);
            return bank ? renderCard(bank, true) : null;
          }}
        >
          {shellEl}
        </LibraryDndContext>
      ) : (
        shellEl
      )}
      {sharedPickerTarget && (
        <FolderPickerPopover
          variant="dialog"
          folders={folderState.folders}
          selectedFolderId={sharedPickerTarget.folderId}
          onSelect={(folderId) => {
            void fileTeammateBank(sharedPickerTarget.key, folderId);
          }}
          onClose={() => setSharedPickerTarget(null)}
          title={`Move "${sharedPickerTarget.title}" to…`}
        />
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
    </>
  );
};
