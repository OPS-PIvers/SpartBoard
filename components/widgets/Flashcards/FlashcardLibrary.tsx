import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Copy,
  EyeOff,
  FileUp,
  Layers,
  Loader2,
  MonitorPlay,
  Pencil,
  Plus,
  PowerOff,
  RotateCcw,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import type { FlashcardAssignment, FlashcardSet } from '@/types';
import type { UseFoldersResult } from '@/hooks/useFolders';
import {
  AssignmentArchiveCard,
  FolderPickerPopover,
  FolderSidebar,
  LibraryGrid,
  LibraryItemCard,
  LibraryShell,
  LibraryToolbar,
  buildMoveToFolderAction,
  countItemsByFolder,
  filterByFolder,
  useLibraryView,
} from '@/components/common/library';
import type { LibraryTab } from '@/components/common/library';

interface FlashcardLibraryProps {
  sets: FlashcardSet[];
  loading: boolean;
  error: string | null;
  folders: UseFoldersResult;
  assignments: FlashcardAssignment[];
  assignmentsLoading: boolean;
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  onNew: () => void;
  onImport: () => void;
  onEdit: (set: FlashcardSet) => void;
  onPresent: (set: FlashcardSet) => void;
  onShare: (set: FlashcardSet) => void;
  onAssign: (set: FlashcardSet) => void;
  onDelete: (set: FlashcardSet) => void;
  onAssignmentResults: (assignment: FlashcardAssignment) => void;
  onAssignmentPublishScores: (assignment: FlashcardAssignment) => void;
  onAssignmentUnpublishScores: (assignment: FlashcardAssignment) => void;
  onAssignmentCopyLink: (assignment: FlashcardAssignment) => void;
  onAssignmentEnd: (assignment: FlashcardAssignment) => void;
  onAssignmentReopen: (assignment: FlashcardAssignment) => void;
  onAssignmentDelete: (assignment: FlashcardAssignment) => void;
}

const assignmentSubtitle = (assignment: FlashcardAssignment): string =>
  assignment.kind === 'check'
    ? `Check · ${assignment.checkMode ?? 'write'}`
    : 'Study';

const assignmentMeta = (assignment: FlashcardAssignment): string => {
  const parts = [(assignment.periodNames ?? []).join(', ')].filter(Boolean);
  if (assignment.dueAt) {
    parts.push(`Due ${new Date(assignment.dueAt).toLocaleDateString()}`);
  }
  if (assignment.closeAt) {
    parts.push(`Closes ${new Date(assignment.closeAt).toLocaleDateString()}`);
  }
  return parts.join(' · ');
};

const titleComparator = (
  a: FlashcardSet,
  b: FlashcardSet,
  direction: 'asc' | 'desc'
): number => {
  const result = a.title.localeCompare(b.title);
  return direction === 'asc' ? result : -result;
};

const updatedComparator = (
  a: FlashcardSet,
  b: FlashcardSet,
  direction: 'asc' | 'desc'
): number => {
  const result = a.updatedAt - b.updatedAt;
  return direction === 'asc' ? result : -result;
};

export const FlashcardLibrary: React.FC<FlashcardLibraryProps> = ({
  sets,
  loading,
  error,
  folders,
  assignments,
  assignmentsLoading,
  tab,
  onTabChange,
  onNew,
  onImport,
  onEdit,
  onPresent,
  onShare,
  onAssign,
  onDelete,
  onAssignmentResults,
  onAssignmentPublishScores,
  onAssignmentUnpublishScores,
  onAssignmentCopyLink,
  onAssignmentEnd,
  onAssignmentReopen,
  onAssignmentDelete,
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderTarget, setFolderTarget] = useState<FlashcardSet | null>(null);

  const folderFilteredSets = useMemo(
    () => filterByFolder(sets, selectedFolderId),
    [selectedFolderId, sets]
  );
  const view = useLibraryView({
    items: folderFilteredSets,
    initialSort: { key: 'updated', dir: 'desc' },
    searchFields: (set) => [
      set.title,
      set.description ?? '',
      ...set.cards.flatMap((card) => [card.term, card.definition]),
    ],
    sortComparators: {
      updated: updatedComparator,
      title: titleComparator,
    },
  });
  const folderCounts = useMemo(() => countItemsByFolder(sets), [sets]);
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'active'),
    [assignments]
  );
  const endedAssignments = useMemo(
    () => assignments.filter((a) => a.status !== 'active'),
    [assignments]
  );
  const tabAssignments =
    tab === 'archive' ? endedAssignments : activeAssignments;

  const assignmentsContent = assignmentsLoading ? (
    <div
      className="flex items-center justify-center text-slate-400"
      style={{ padding: 'min(48px, 12cqmin)' }}
    >
      <Loader2
        className="animate-spin"
        style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
      />
    </div>
  ) : tabAssignments.length === 0 ? (
    <div
      className="flex h-full flex-col items-center justify-center text-center"
      style={{ gap: 'min(10px, 2.5cqmin)', padding: 'min(36px, 9cqmin)' }}
    >
      <Send
        className="text-rose-300"
        style={{ width: 'min(52px, 14cqmin)', height: 'min(52px, 14cqmin)' }}
      />
      <h3
        className="font-black text-slate-800"
        style={{ fontSize: 'min(18px, 5.5cqmin)' }}
      >
        {tab === 'archive' ? 'Nothing ended yet' : 'Nothing assigned yet'}
      </h3>
      <p
        className="max-w-md text-slate-500"
        style={{ fontSize: 'min(12px, 3.8cqmin)' }}
      >
        {tab === 'archive'
          ? 'Assignments you end show up here, so you can reopen or delete them.'
          : 'Assign a set to a ClassLink class and it appears here until you end it.'}
      </p>
    </div>
  ) : (
    <div className="flex flex-col">
      {tabAssignments.map((assignment) => (
        <AssignmentArchiveCard<FlashcardAssignment>
          key={assignment.id}
          assignment={assignment}
          mode={tab === 'archive' ? 'archive' : 'active'}
          status={
            tab === 'archive'
              ? { label: 'Ended', tone: 'neutral' }
              : { label: 'Open', tone: 'success', dot: true }
          }
          title={assignment.setTitle || 'Untitled set'}
          subtitle={assignmentSubtitle(assignment)}
          meta={assignmentMeta(assignment)}
          primaryAction={{
            label: 'Results',
            icon: BarChart3,
            onClick: () => onAssignmentResults(assignment),
          }}
          secondaryActions={[
            ...(tab === 'archive'
              ? []
              : [
                  {
                    id: 'copy-link',
                    label: 'Copy link',
                    icon: Copy,
                    onClick: () => onAssignmentCopyLink(assignment),
                  },
                ]),
            ...(assignment.kind === 'check'
              ? [
                  assignment.scoreVisibility &&
                  assignment.scoreVisibility !== 'none'
                    ? {
                        id: 'unpublish-scores',
                        label: 'Hide scores',
                        icon: EyeOff,
                        onClick: () => onAssignmentUnpublishScores(assignment),
                      }
                    : {
                        id: 'publish-scores',
                        label: 'Publish scores',
                        icon: Send,
                        onClick: () => onAssignmentPublishScores(assignment),
                      },
                ]
              : []),
            tab === 'archive'
              ? {
                  id: 'reopen',
                  label: 'Reopen',
                  icon: RotateCcw,
                  onClick: () => onAssignmentReopen(assignment),
                }
              : {
                  id: 'end',
                  label: 'End assignment',
                  icon: PowerOff,
                  destructive: true,
                  onClick: () => onAssignmentEnd(assignment),
                },
            {
              id: 'delete',
              label: 'Delete',
              icon: Trash2,
              destructive: true,
              onClick: () => onAssignmentDelete(assignment),
            },
          ]}
        />
      ))}
    </div>
  );

  const folderSidebar = (
    <FolderSidebar
      widget="flashcards"
      folders={folders.folders}
      selectedFolderId={selectedFolderId}
      onSelectFolder={setSelectedFolderId}
      itemCounts={folderCounts}
      onCreateFolder={folders.createFolder}
      onRenameFolder={folders.renameFolder}
      onMoveFolder={folders.moveFolder}
      onDeleteFolder={folders.deleteFolder}
      loading={folders.loading}
      error={folders.error}
    />
  );

  return (
    <>
      <LibraryShell
        widgetLabel="Flashcards"
        tab={tab}
        onTabChange={onTabChange}
        visibleTabs={['library', 'active', 'archive']}
        counts={{
          library: sets.length,
          active: activeAssignments.length,
          archive: endedAssignments.length,
        }}
        primaryAction={{ label: 'New set', icon: Plus, onClick: onNew }}
        secondaryActions={[
          { label: 'Import', icon: FileUp, onClick: onImport },
        ]}
        toolbarSlot={
          tab !== 'library' ? undefined : (
            <LibraryToolbar
              {...view.toolbarProps}
              searchPlaceholder="Search flashcard sets…"
              sortOptions={[
                { key: 'updated', label: 'Last updated', defaultDir: 'desc' },
                { key: 'title', label: 'Title', defaultDir: 'asc' },
              ]}
              rightSlot={
                <span
                  className="font-bold text-slate-400"
                  style={{ fontSize: 'min(11px, 3.5cqmin)' }}
                >
                  {view.visibleItems.length} of {sets.length}
                </span>
              }
            />
          )
        }
        filterSidebarSlot={tab === 'library' ? folderSidebar : undefined}
      >
        {tab !== 'library' ? (
          assignmentsContent
        ) : loading ? (
          <div
            className="flex h-full flex-col items-center justify-center text-rose-600"
            style={{ gap: 'min(10px, 2.5cqmin)' }}
          >
            <Loader2
              className="animate-spin"
              style={{
                width: 'min(30px, 8cqmin)',
                height: 'min(30px, 8cqmin)',
              }}
            />
            <span
              className="font-bold"
              style={{ fontSize: 'min(13px, 4cqmin)' }}
            >
              Loading flashcards…
            </span>
          </div>
        ) : error ? (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 font-bold text-rose-700"
            style={{
              padding: 'min(14px, 3.5cqmin)',
              fontSize: 'min(12px, 3.8cqmin)',
            }}
          >
            {error}
          </div>
        ) : (
          <LibraryGrid
            items={view.visibleItems}
            getId={(set) => set.id}
            dragDisabled
            layout={view.state.viewMode}
            emptyState={
              <div
                className="flex h-full flex-col items-center justify-center text-center"
                style={{
                  gap: 'min(10px, 2.5cqmin)',
                  padding: 'min(36px, 9cqmin)',
                }}
              >
                <BookOpen
                  className="text-rose-300"
                  style={{
                    width: 'min(52px, 14cqmin)',
                    height: 'min(52px, 14cqmin)',
                  }}
                />
                <h3
                  className="font-black text-slate-800"
                  style={{ fontSize: 'min(18px, 5.5cqmin)' }}
                >
                  {sets.length === 0
                    ? 'Build your first set'
                    : 'No matching sets'}
                </h3>
                <p
                  className="max-w-md text-slate-500"
                  style={{ fontSize: 'min(12px, 3.8cqmin)' }}
                >
                  {sets.length === 0
                    ? 'Create a set from scratch, paste a Quizlet export, or import a CSV or Google Sheet.'
                    : 'Try a different search or folder.'}
                </p>
              </div>
            }
            renderCard={(set) => (
              <LibraryItemCard<FlashcardSet>
                id={set.id}
                title={set.title || 'Untitled set'}
                subtitle={`${set.cards.length} card${set.cards.length === 1 ? '' : 's'} · Updated ${new Date(set.updatedAt).toLocaleDateString()}`}
                thumbnail={
                  <div className="flex h-full w-full items-center justify-center bg-rose-50 text-rose-600">
                    <Layers
                      style={{
                        width: 'min(38px, 10cqmin)',
                        height: 'min(38px, 10cqmin)',
                      }}
                    />
                  </div>
                }
                primaryAction={{
                  label: 'Edit',
                  icon: Pencil,
                  onClick: () => onEdit(set),
                }}
                secondaryActions={[
                  {
                    id: 'present',
                    label: 'Present',
                    icon: MonitorPlay,
                    onClick: () => onPresent(set),
                  },
                  {
                    id: 'assign',
                    label: 'Assign',
                    icon: Send,
                    onClick: () => onAssign(set),
                  },
                  {
                    id: 'share',
                    label: set.publicShareId
                      ? 'Manage public link'
                      : 'Share link',
                    icon: Share2,
                    onClick: () => onShare(set),
                  },
                  buildMoveToFolderAction({
                    onOpenPicker: () => setFolderTarget(set),
                  }),
                  {
                    id: 'delete',
                    label: 'Delete',
                    icon: Trash2,
                    destructive: true,
                    onClick: () => onDelete(set),
                  },
                ]}
                onClick={() => onEdit(set)}
                viewMode={view.state.viewMode}
                sortable={false}
                meta={set}
              />
            )}
          />
        )}
      </LibraryShell>

      {folderTarget && (
        <FolderPickerPopover
          variant="dialog"
          folders={folders.folders}
          selectedFolderId={folderTarget.folderId ?? null}
          title={`Move “${folderTarget.title}” to…`}
          onClose={() => setFolderTarget(null)}
          onSelect={(folderId) => {
            void folders.moveItem(folderTarget.id, folderId);
            setFolderTarget(null);
          }}
        />
      )}
    </>
  );
};
