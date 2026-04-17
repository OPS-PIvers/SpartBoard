/**
 * GuidedLearningManager — composes the shared library primitives into the
 * Guided Learning widget's teacher surface.
 *
 * Three tabs from the shared LibraryShell:
 *   - Library   : personal (Drive-backed) sets and admin building sets, shown
 *                 in a single list. An admin-only "Source" toolbar filter
 *                 narrows the list to Personal or Building. Non-admin users
 *                 never see the filter (their building entries appear inline
 *                 as read-only cards with Play/Assign only).
 *   - In Progress : teacher's live assignments (status === 'active').
 *   - Archive   : archived assignments (status === 'archived').
 *
 * Persistence is owned by the Widget — the Manager is presentational. The
 * Widget passes callbacks (save is already split personal vs building at that
 * layer) so the card layer never branches on "personal vs building" itself.
 *
 * Reference: components/widgets/QuizWidget/components/QuizManager.tsx.
 */

import React, { useMemo } from 'react';
import {
  Plus,
  Play,
  Pencil,
  Trash2,
  Link2,
  BarChart2,
  Wand2,
  Building2,
  BookOpen,
  Loader2,
  Archive as ArchiveIcon,
  RotateCcw,
  Copy,
  ExternalLink,
} from 'lucide-react';
import type {
  GuidedLearningAssignment,
  GuidedLearningSet,
  GuidedLearningSetMetadata,
} from '@/types';
import { LibraryShell } from '@/components/common/library/LibraryShell';
import { LibraryToolbar } from '@/components/common/library/LibraryToolbar';
import { LibraryGrid } from '@/components/common/library/LibraryGrid';
import { LibraryItemCard } from '@/components/common/library/LibraryItemCard';
import { useLibraryView } from '@/components/common/library/useLibraryView';
import { useSortableReorder } from '@/components/common/library/useSortableReorder';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import type {
  LibraryBadge,
  LibraryFilter,
  LibraryMenuAction,
  LibrarySortOption,
  LibraryTab,
} from '@/components/common/library/types';

/* ─── Unified list item ───────────────────────────────────────────────────── */

/**
 * A single entry in the Library tab. Hides the personal/building split so the
 * card layer can stay generic. Everything the Manager needs to render + route
 * clicks back to the owner is captured here.
 */
interface LibraryEntry {
  id: string;
  source: 'personal' | 'building';
  title: string;
  description?: string;
  stepCount: number;
  mode: GuidedLearningSet['mode'];
  imageUrl?: string;
  updatedAt: number;
  createdAt: number;
  order?: number;
  /** Personal-only: the drive file id needed to load/delete the set. */
  driveFileId?: string;
  /** Building-only: the hydrated building set so callers can pass it through. */
  buildingSet?: GuidedLearningSet;
}

/* ─── Props ───────────────────────────────────────────────────────────────── */

export interface GuidedLearningManagerProps {
  /** Personal set metadata (Drive-backed). */
  sets: GuidedLearningSetMetadata[];
  /** Admin-authored building sets (Firestore-backed). */
  buildingSets: GuidedLearningSet[];
  /** Teacher's per-assignment archive. */
  assignments: GuidedLearningAssignment[];

  loading: boolean;
  buildingLoading: boolean;
  assignmentsLoading: boolean;
  isDriveConnected: boolean;
  isAdmin: boolean;

  /* ── Library tab ──────────────────────────────────────────────────────── */
  onPlay: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onEdit: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onAssign: (
    setId: string,
    driveFileId?: string,
    buildingSet?: GuidedLearningSet
  ) => void;
  onDeletePersonal: (setId: string, driveFileId: string) => void;
  onDeleteBuilding: (setId: string) => void;
  onCreateNewPersonal: () => void;
  onCreateNewBuilding: () => void;
  /** Admin-only — opens the standalone AI authoring dialog for building sets. */
  onOpenAIAuthoring: () => void;
  /**
   * Persist new personal-set ordering. Writes `order` to the metadata doc; the
   * Drive blob is untouched. Rejecting reverts the optimistic reorder.
   */
  onReorderPersonal: (orderedIds: string[]) => Promise<void>;
  /**
   * Optional Results action surfaced from recent session ids (Quiz-style).
   * When a set has a recent session, we expose "View Results" in the overflow
   * menu.
   */
  recentSessionIds: Record<string, string>;
  onViewResults: (sessionId: string) => void;

  /* ── Assignment tabs (In Progress + Archive) ──────────────────────────── */
  onAssignmentCopyLink: (assignment: GuidedLearningAssignment) => void;
  onAssignmentOpenResults: (assignment: GuidedLearningAssignment) => void;
  onAssignmentArchive: (assignment: GuidedLearningAssignment) => void;
  onAssignmentUnarchive: (assignment: GuidedLearningAssignment) => void;
  onAssignmentDelete: (assignment: GuidedLearningAssignment) => void;
}

/* ─── Sort / filter config ────────────────────────────────────────────────── */

const SORT_OPTIONS: LibrarySortOption[] = [
  { key: 'manual', label: 'Manual order', defaultDir: 'asc' },
  { key: 'title', label: 'Title', defaultDir: 'asc' },
  { key: 'updatedAt', label: 'Last updated', defaultDir: 'desc' },
  { key: 'createdAt', label: 'Date created', defaultDir: 'desc' },
];

const MODE_LABELS: Record<GuidedLearningSet['mode'], string> = {
  structured: 'Structured',
  guided: 'Guided',
  explore: 'Explore',
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const buildLibraryEntries = (
  sets: GuidedLearningSetMetadata[],
  buildingSets: GuidedLearningSet[],
  isAdmin: boolean
): LibraryEntry[] => {
  const personal: LibraryEntry[] = sets.map((meta) => ({
    id: `personal:${meta.id}`,
    source: 'personal',
    title: meta.title,
    description: meta.description,
    stepCount: meta.stepCount,
    mode: meta.mode,
    imageUrl: meta.imageUrl,
    updatedAt: meta.updatedAt,
    createdAt: meta.createdAt,
    // `order` is optional on GuidedLearningSetMetadata today — read as unknown
    // to stay forward-compatible when the field is added.
    order: (meta as GuidedLearningSetMetadata & { order?: number }).order,
    driveFileId: meta.driveFileId,
  }));

  const building: LibraryEntry[] = buildingSets.map((set) => ({
    id: `building:${set.id}`,
    source: 'building',
    title: set.title,
    description: set.description,
    stepCount: set.steps.length,
    mode: set.mode,
    imageUrl: set.imageUrls[0],
    updatedAt: set.updatedAt,
    createdAt: set.createdAt,
    buildingSet: set,
  }));

  // Non-admins still see building sets (they're shared with the whole
  // building), so we always concatenate; only the filter affordance is
  // admin-gated.
  void isAdmin;
  return [...personal, ...building];
};

const formatDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

/* ─── Component ───────────────────────────────────────────────────────────── */

export const GuidedLearningManager: React.FC<GuidedLearningManagerProps> = ({
  sets,
  buildingSets,
  assignments,
  loading,
  buildingLoading,
  assignmentsLoading,
  isDriveConnected,
  isAdmin,
  onPlay,
  onEdit,
  onAssign,
  onDeletePersonal,
  onDeleteBuilding,
  onCreateNewPersonal,
  onCreateNewBuilding,
  onOpenAIAuthoring,
  onReorderPersonal,
  recentSessionIds,
  onViewResults,
  onAssignmentCopyLink,
  onAssignmentOpenResults,
  onAssignmentArchive,
  onAssignmentUnarchive,
  onAssignmentDelete,
}) => {
  const [tab, setTab] = React.useState<LibraryTab>('library');

  const allEntries = useMemo(
    () => buildLibraryEntries(sets, buildingSets, isAdmin),
    [sets, buildingSets, isAdmin]
  );

  // ─── Toolbar state (search/sort/filter) via useLibraryView ────────────────
  const sourceFilter: LibraryFilter = {
    id: 'source',
    label: 'Source',
    options: [
      { value: 'personal', label: 'Personal' },
      { value: 'building', label: 'Building' },
    ],
    // Building filter is admin-gated. Non-admins never see this control.
    visible: isAdmin,
  };

  const view = useLibraryView<LibraryEntry>({
    items: allEntries,
    initialSort: { key: 'manual', dir: 'asc' },
    searchFields: (e) => [e.title, e.description ?? ''],
    sortComparators: {
      manual: (a, b, dir) => {
        const av = a.order ?? Number.POSITIVE_INFINITY;
        const bv = b.order ?? Number.POSITIVE_INFINITY;
        const diff = av - bv;
        return dir === 'asc' ? diff : -diff;
      },
      title: (a, b, dir) => {
        const diff = a.title.localeCompare(b.title);
        return dir === 'asc' ? diff : -diff;
      },
      updatedAt: (a, b, dir) => {
        const diff = a.updatedAt - b.updatedAt;
        return dir === 'asc' ? diff : -diff;
      },
      createdAt: (a, b, dir) => {
        const diff = a.createdAt - b.createdAt;
        return dir === 'asc' ? diff : -diff;
      },
    },
    filterPredicates: {
      source: (item, value) => (value === '' ? true : item.source === value),
    },
  });

  const activeSourceFilter = view.state.filterValues.source ?? '';
  const isBuildingFiltered = activeSourceFilter === 'building';

  // ─── Drag-reorder only when viewing personal manually (no search, manual
  // sort, source filter === 'personal' so every card is actually reorderable).
  const personalEntries = useMemo(
    () => view.visibleItems.filter((e) => e.source === 'personal'),
    [view.visibleItems]
  );

  const reorder = useSortableReorder<LibraryEntry>({
    items: view.visibleItems,
    getId: (e) => e.id,
    onCommit: async (orderedIds) => {
      // Strip the `personal:` prefix and ignore building entries — the Widget
      // only accepts personal set ids.
      const personalIds = orderedIds
        .filter((id) => id.startsWith('personal:'))
        .map((id) => id.slice('personal:'.length));
      await onReorderPersonal(personalIds);
    },
  });

  const dragDisabled =
    view.reorderLocked ||
    activeSourceFilter !== 'personal' ||
    personalEntries.length < 2;

  // ─── Counts for tabs ──────────────────────────────────────────────────────
  const activeAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'active'),
    [assignments]
  );
  const archivedAssignments = useMemo(
    () => assignments.filter((a) => a.status === 'archived'),
    [assignments]
  );

  // ─── Header actions ───────────────────────────────────────────────────────
  const primaryAction = isBuildingFiltered
    ? {
        label: 'New Building Set',
        icon: Plus,
        onClick: onCreateNewBuilding,
      }
    : {
        label: 'New Set',
        icon: Plus,
        onClick: onCreateNewPersonal,
      };

  const secondaryActions =
    isAdmin && isBuildingFiltered
      ? [
          {
            label: 'AI',
            icon: Wand2,
            onClick: onOpenAIAuthoring,
          },
        ]
      : undefined;

  // ─── Drive disconnected banner ────────────────────────────────────────────
  const showDriveBanner =
    tab === 'library' && !isDriveConnected && activeSourceFilter !== 'building';

  /* ─── Rendering helpers ─────────────────────────────────────────────────── */

  const renderLibraryCard = (entry: LibraryEntry): React.ReactElement => {
    const badges: LibraryBadge[] = [
      { label: MODE_LABELS[entry.mode], tone: 'info' },
    ];
    if (entry.source === 'building') {
      badges.push({ label: 'Building', tone: 'warn' });
    }

    const isBuildingEntry = entry.source === 'building';
    const canEdit = isBuildingEntry ? isAdmin : true;
    const canDelete = isBuildingEntry ? isAdmin : true;

    const secondary: LibraryMenuAction[] = [
      {
        id: 'play',
        label: 'Play (teacher mode)',
        icon: Play,
        onClick: () =>
          onPlay(
            entry.source === 'personal'
              ? entry.id.slice('personal:'.length)
              : entry.id.slice('building:'.length),
            entry.driveFileId,
            entry.buildingSet
          ),
      },
    ];

    if (canEdit) {
      secondary.push({
        id: 'edit',
        label: 'Edit',
        icon: Pencil,
        onClick: () =>
          onEdit(
            entry.source === 'personal'
              ? entry.id.slice('personal:'.length)
              : entry.id.slice('building:'.length),
            entry.driveFileId,
            entry.buildingSet
          ),
      });
    }

    const rawId =
      entry.source === 'personal'
        ? entry.id.slice('personal:'.length)
        : entry.id.slice('building:'.length);

    const recentSessionId = recentSessionIds[rawId];
    if (recentSessionId) {
      secondary.push({
        id: 'results',
        label: 'View Results',
        icon: BarChart2,
        onClick: () => onViewResults(recentSessionId),
      });
    }

    if (canDelete) {
      secondary.push({
        id: 'delete',
        label: 'Delete',
        icon: Trash2,
        destructive: true,
        onClick: () => {
          if (entry.source === 'personal' && entry.driveFileId) {
            onDeletePersonal(rawId, entry.driveFileId);
          } else if (entry.source === 'building') {
            onDeleteBuilding(rawId);
          }
        },
      });
    }

    const subtitle = (
      <span>
        {entry.stepCount} step{entry.stepCount === 1 ? '' : 's'}
        {' · Updated '}
        {formatDate(entry.updatedAt)}
      </span>
    );

    const thumbnail = entry.imageUrl ? (
      <img
        src={entry.imageUrl}
        alt=""
        aria-hidden="true"
        className="h-full w-full object-cover"
      />
    ) : (
      <BookOpen className="h-5 w-5 text-slate-400" aria-hidden="true" />
    );

    return (
      <LibraryItemCard<LibraryEntry>
        key={entry.id}
        id={entry.id}
        title={entry.title}
        subtitle={subtitle}
        thumbnail={thumbnail}
        badges={badges}
        primaryAction={{
          label: 'Assign',
          icon: Link2,
          onClick: () => onAssign(rawId, entry.driveFileId, entry.buildingSet),
        }}
        secondaryActions={secondary}
        onClick={
          canEdit
            ? () => onEdit(rawId, entry.driveFileId, entry.buildingSet)
            : undefined
        }
        sortable={entry.source === 'personal'}
        viewMode={view.state.viewMode}
        meta={entry}
      />
    );
  };

  /* ─── Assignment cards (used in active + archive tabs) ──────────────────── */

  const renderAssignmentCard = (
    a: GuidedLearningAssignment,
    mode: 'active' | 'archive'
  ): React.ReactElement => {
    const studentLink = `${window.location.origin}/guided-learning?session=${a.sessionId}`;

    const badges: LibraryBadge[] =
      mode === 'active'
        ? [{ label: 'Live', tone: 'success', dot: true }]
        : [{ label: 'Archived', tone: 'neutral' }];

    if (a.source === 'building') {
      badges.push({ label: 'Building', tone: 'warn' });
    }

    const subtitle = (
      <span>
        {mode === 'active' ? 'Assigned ' : 'Archived '}
        {formatDate(
          mode === 'active' ? a.createdAt : (a.archivedAt ?? a.updatedAt)
        )}
      </span>
    );

    const secondary: LibraryMenuAction[] = [
      {
        id: 'copy',
        label: 'Copy student link',
        icon: Copy,
        onClick: () => onAssignmentCopyLink(a),
      },
      {
        id: 'open',
        label: 'Open student link',
        icon: ExternalLink,
        onClick: () => window.open(studentLink, '_blank', 'noopener'),
      },
    ];

    if (mode === 'active') {
      secondary.push({
        id: 'archive',
        label: 'Archive',
        icon: ArchiveIcon,
        onClick: () => onAssignmentArchive(a),
      });
    } else {
      secondary.push({
        id: 'unarchive',
        label: 'Move to In Progress',
        icon: RotateCcw,
        onClick: () => onAssignmentUnarchive(a),
      });
    }

    secondary.push({
      id: 'delete',
      label: 'Delete permanently',
      icon: Trash2,
      destructive: true,
      onClick: () => onAssignmentDelete(a),
    });

    return (
      <LibraryItemCard<GuidedLearningAssignment>
        key={a.id}
        id={a.id}
        title={a.setTitle}
        subtitle={subtitle}
        badges={badges}
        primaryAction={{
          label: 'View Results',
          icon: BarChart2,
          onClick: () => onAssignmentOpenResults(a),
        }}
        secondaryActions={secondary}
        sortable={false}
        viewMode="list"
        onClick={() => onAssignmentOpenResults(a)}
      />
    );
  };

  /* ─── Tab bodies ─────────────────────────────────────────────────────────── */

  const renderLibraryTab = () => {
    if (loading || buildingLoading) {
      return (
        <div className="flex h-40 items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      );
    }

    return (
      <>
        {showDriveBanner && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Your personal sets are saved to Google Drive. Sign out and sign back
            in to grant Drive access. Building sets are still available below.
          </div>
        )}

        <LibraryGrid<LibraryEntry>
          items={reorder.orderedItems}
          getId={(e) => e.id}
          renderCard={renderLibraryCard}
          onReorder={reorder.handleReorder}
          dragDisabled={dragDisabled}
          reorderLocked={view.reorderLocked}
          reorderLockedReason={view.reorderLockedReason}
          layout={view.state.viewMode}
          emptyState={
            <ScaledEmptyState
              icon={BookOpen}
              title="No sets yet"
              subtitle={
                isBuildingFiltered
                  ? isAdmin
                    ? 'Use "New Building Set" or "AI" to add a building-level experience.'
                    : 'No building sets have been created yet.'
                  : 'Click "New Set" to create your first guided experience.'
              }
            />
          }
        />
      </>
    );
  };

  const renderAssignmentTab = (mode: 'active' | 'archive') => {
    if (assignmentsLoading) {
      return (
        <div className="flex h-40 items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      );
    }
    const list = mode === 'active' ? activeAssignments : archivedAssignments;
    if (list.length === 0) {
      return (
        <ScaledEmptyState
          icon={mode === 'active' ? Play : ArchiveIcon}
          title={
            mode === 'active'
              ? 'No live assignments'
              : 'No archived assignments'
          }
          subtitle={
            mode === 'active'
              ? 'Assign a set from the Library tab to get started.'
              : 'Archived assignments will appear here.'
          }
        />
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {list.map((a) => renderAssignmentCard(a, mode))}
      </div>
    );
  };

  /* ─── Render ─────────────────────────────────────────────────────────────── */

  return (
    <LibraryShell
      widgetLabel="Guided Learning"
      tab={tab}
      onTabChange={setTab}
      counts={{
        library: allEntries.length,
        active: activeAssignments.length,
        archive: archivedAssignments.length,
      }}
      primaryAction={tab === 'library' ? primaryAction : undefined}
      secondaryActions={tab === 'library' ? secondaryActions : undefined}
      toolbarSlot={
        tab === 'library' ? (
          <LibraryToolbar
            {...view.toolbarProps}
            sortOptions={SORT_OPTIONS}
            filters={[sourceFilter]}
            searchPlaceholder="Search sets…"
            rightSlot={
              isBuildingFiltered ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                  <Building2 size={12} />
                  Building library
                </span>
              ) : null
            }
          />
        ) : undefined
      }
    >
      {tab === 'library' && renderLibraryTab()}
      {tab === 'active' && renderAssignmentTab('active')}
      {tab === 'archive' && renderAssignmentTab('archive')}
    </LibraryShell>
  );
};
