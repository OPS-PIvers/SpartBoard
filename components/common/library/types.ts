/**
 * Shared integration contract for the unified Library / Assign / Import / Archive
 * primitives used by Quiz, Video Activity, Guided Learning, and MiniApp widgets.
 *
 * This file is the single source of truth for the Wave 1 primitive APIs. The
 * four parallel implementation agents (LibraryShell, LibraryGrid, AssignModal,
 * ImportWizard) import from here; they MUST NOT change these shapes without
 * coordinated review — they are the integration contract for the Wave 2 widget
 * migrations.
 *
 * Design principles:
 *   1. Primitives are presentational + state-only. No Firestore/Drive calls.
 *      Consumers own persistence.
 *   2. Per-widget variation flows through `extraSlot` / `plcSlot` / adapters,
 *      not through conditional branches in the primitives.
 *   3. Generics preserve consumer types (e.g. TAssignment, TOptions, TItem)
 *      so callers keep full type safety without casts.
 */

import type React from 'react';
import type { ClassRoster } from '@/types';

/* ─── Shared enums / tokens ───────────────────────────────────────────────── */

/** Top-level library tabs. Mirrors Quiz's proven pattern. */
export type LibraryTab = 'library' | 'active' | 'archive';

/** View mode for item rendering. Grid is default; list is a density option. */
export type LibraryViewMode = 'grid' | 'list';

/** Sort direction for `LibraryToolbar` sort dropdown. */
export type LibrarySortDir = 'asc' | 'desc';

/**
 * Badge tone for status chips and info pills. Keep small — resist adding a
 * tone per semantic nuance. Consumers can override via custom badge slot
 * if needed.
 */
export type LibraryBadgeTone =
  | 'neutral'
  | 'info'
  | 'warn'
  | 'success'
  | 'danger';

/** Assignment lifecycle status. Mirrors `QuizAssignmentStatus` in `types.ts`. */
export type LibraryAssignmentStatus = 'active' | 'paused' | 'inactive';

/** Import source kinds. Adapters declare which they support. */
export type ImportSourceKind = 'sheet' | 'csv' | 'json' | 'html' | 'file';

/* ─── Generic value objects ───────────────────────────────────────────────── */

/** A clickable menu entry — used in overflow menus, secondary action lists. */
export interface LibraryMenuAction {
  id: string;
  label: string;
  icon?: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
  onClick: () => void;
  /** Renders with danger styling and (optionally) moves to the bottom. */
  destructive?: boolean;
  disabled?: boolean;
  /** Tooltip when hover-disabled. */
  disabledReason?: string;
}

/** Primary action on a card — always visible, never nested under overflow. */
export interface LibraryPrimaryAction {
  label: string;
  icon?: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Compact icon-only action rendered alongside (before) the primary action on
 * library cards. Used when a card has multiple equal-weight quick actions —
 * e.g. Mini App's view-only mode where Run and Share both deserve top-level
 * surface. The `label` doubles as the accessible name and tooltip.
 */
export interface LibraryIconAction {
  id: string;
  label: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
  onClick: () => void;
  /**
   * Visual weight. `'primary'` matches the brand-blue filled primary button;
   * `'secondary'` is a subtler outline/ghost style. Defaults to `'secondary'`.
   */
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  disabledReason?: string;
}

/** A badge chip shown on library cards. */
export interface LibraryBadge {
  label: string;
  tone: LibraryBadgeTone;
  /** Optional dot indicator (used for live/paused pulses on archive cards). */
  dot?: boolean;
}

/** A sort option surfaced in the toolbar sort dropdown. */
export interface LibrarySortOption {
  key: string;
  label: string;
  /** Default direction when the key is selected. */
  defaultDir?: LibrarySortDir;
}

/** A filter exposed in the toolbar. Current value lives in `useLibraryView`. */
export interface LibraryFilter {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** Optional: show only when predicate returns true (e.g. admin-only). */
  visible?: boolean;
}

/* ─── LibraryShell (3-tab chrome) ─────────────────────────────────────────── */

export interface LibraryShellTabCounts {
  library?: number;
  active?: number;
  archive?: number;
}

/**
 * Folder-panel display mode. `'auto'` resolves to full/rail/hidden based on
 * the widget's container width; the other values pin the panel to that mode.
 */
export type LibraryFolderPanelSetting = 'auto' | 'full' | 'rail' | 'hidden';

export interface LibraryShellProps {
  /** e.g. "Quiz", "Video Activity" — drives empty-state copy, aria labels. */
  widgetLabel: string;
  tab: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  /** Numeric badges on tabs. `undefined` hides the badge for that tab. */
  counts?: LibraryShellTabCounts;
  /**
   * Optional per-tab label overrides. Useful for callers that need to relabel
   * a tab in a context-specific way (e.g. "Shared" instead of "In Progress"
   * for view-only assignment modes). Missing keys fall back to the default.
   */
  tabLabels?: Partial<Record<LibraryTab, string>>;
  /** Header right-side primary CTA, e.g. "+ New Quiz". */
  primaryAction?: LibraryPrimaryAction;
  /** Header right-side secondary buttons, e.g. Import, Export. */
  secondaryActions?: LibraryPrimaryAction[];
  /** Rendered above the tab content — typically <LibraryToolbar />. */
  toolbarSlot?: React.ReactNode;
  /** Rendered as a left sidebar — used by Phase 4 folders. */
  filterSidebarSlot?: React.ReactNode;
  /**
   * Controls the folder-panel state machine. Defaults to `'auto'` (derived
   * from widget width). Passing an explicit value pins the panel open/closed.
   */
  folderPanelMode?: LibraryFolderPanelSetting;
  /** Called when the user toggles panel mode via the chevron. */
  onFolderPanelModeChange?: (mode: LibraryFolderPanelSetting) => void;
  /** Tab-specific content. Consumer decides what to render per tab. */
  children: React.ReactNode;
}

/* ─── LibraryToolbar (search / sort / filter / view-mode) ─────────────────── */

export interface LibraryToolbarProps {
  search: string;
  onSearchChange: (next: string) => void;
  searchPlaceholder?: string;

  sort: { key: string; dir: LibrarySortDir };
  sortOptions: LibrarySortOption[];
  onSortChange: (next: { key: string; dir: LibrarySortDir }) => void;

  filters?: LibraryFilter[];
  /** Current filter selection, keyed by filter id. */
  filterValues?: Record<string, string>;
  onFilterChange?: (id: string, value: string) => void;

  viewMode?: LibraryViewMode;
  onViewModeChange?: (next: LibraryViewMode) => void;

  /** Optional right-aligned extras (e.g. "5 of 20 items"). */
  rightSlot?: React.ReactNode;
}

/* ─── LibraryItemCard (sortable card) ─────────────────────────────────────── */

export interface LibraryItemCardProps<TMeta = unknown> {
  /** Stable id — used by dnd-kit and by consumer for navigation. */
  id: string;
  title: string;
  /** e.g. "12 questions · Updated Apr 12". */
  subtitle?: React.ReactNode;
  /** Visual preview, usually an <img> or icon. */
  thumbnail?: React.ReactNode;
  badges?: LibraryBadge[];
  /**
   * Headline labelled action (e.g. "Assign"). Optional: cards can rely solely
   * on `iconActions` when no single label dominates (e.g. view-only Mini App
   * where Run + Share share equal weight).
   */
  primaryAction?: LibraryPrimaryAction;
  /**
   * Compact icon-only buttons rendered before `primaryAction`. Used for
   * equal-weight quick actions where the label would consume too much row
   * width. Tooltip is each action's `label`.
   */
  iconActions?: LibraryIconAction[];
  /** Overflow-menu actions (Edit, Duplicate, Share, Delete...). */
  secondaryActions?: LibraryMenuAction[];
  /** Default click handler for the card body. Typically opens the editor. */
  onClick?: () => void;
  /** Default true. Disabled via `LibraryGrid.dragDisabled` for read-only views. */
  sortable?: boolean;
  /** Passthrough for consumer — typed via the generic. */
  meta?: TMeta;
  /** View mode influences density — passed down from `LibraryGrid`. */
  viewMode?: LibraryViewMode;
  /** Hidden from screen readers when this card is the drag overlay. */
  isDragOverlay?: boolean;
  /**
   * When true, renders a left-edge checkbox and suppresses the default card
   * click → the row toggles selection instead of opening the editor.
   */
  selectionMode?: boolean;
  /** Current selection state — only meaningful when `selectionMode` is true. */
  selected?: boolean;
  /** Fired when the user toggles the card's checkbox (or clicks the row in selection mode). */
  onSelectionToggle?: () => void;
}

/* ─── LibraryGrid (dnd-kit SortableContext wrapper) ───────────────────────── */

export interface LibraryGridProps<TItem> {
  items: TItem[];
  /** Stable id extractor — used by dnd-kit. Must return unique strings. */
  getId: (item: TItem) => string;
  /** One card per item. Consumer composes <LibraryItemCard /> inside. */
  renderCard: (item: TItem, index: number) => React.ReactElement;
  /**
   * Called with the new full ordering of ids after a drag ends. Consumer
   * persists (e.g. Firestore `order` field writes). Reject → revert.
   */
  onReorder?: (nextOrderedIds: string[]) => Promise<void> | void;
  /**
   * Force-disable drag. Also auto-disabled when search is non-empty or
   * sort.key !== 'manual' — the toolbar state is passed in via `reorderLocked`.
   */
  dragDisabled?: boolean;
  /**
   * When true, shows a tooltip on drag handles explaining why they're disabled
   * (e.g. "Clear search to reorder"). Distinct from `dragDisabled` so the
   * consumer can show the handles at reduced opacity rather than hidden.
   */
  reorderLocked?: boolean;
  reorderLockedReason?: string;
  layout?: LibraryViewMode;
  /** Rendered when `items.length === 0`. */
  emptyState?: React.ReactNode;
}

/* ─── useLibraryView (toolbar state + derived filtering) ──────────────────── */

export interface UseLibraryViewOptions<TItem> {
  items: TItem[];
  /** Initial toolbar state. Consumers can persist/restore via these. */
  initialSearch?: string;
  initialSort?: { key: string; dir: LibrarySortDir };
  initialViewMode?: LibraryViewMode;
  initialFilterValues?: Record<string, string>;
  /**
   * Fields to search across. Return a string (or array of strings) per item;
   * the hook lowercases + substring-matches against `search`.
   */
  searchFields: (item: TItem) => string | string[];
  /**
   * Comparator registry keyed by sort key. `'manual'` must be one of the
   * registered keys — used to signal drag-reorder is the active ordering.
   */
  sortComparators: Record<
    string,
    (a: TItem, b: TItem, dir: LibrarySortDir) => number
  >;
  /**
   * Filter predicate registry keyed by filter id. Returns true to keep the
   * item. Missing filter id = no-op (all pass).
   */
  filterPredicates?: Record<string, (item: TItem, value: string) => boolean>;
  /**
   * Optional side-effect fired when the teacher toggles grid/list. Lets the
   * consumer persist the choice (e.g. to widget config).
   */
  onViewModeChange?: (viewMode: LibraryViewMode) => void;
}

export interface UseLibraryViewResult<TItem> {
  /** Fully filtered + sorted items. Feed into <LibraryGrid items={...} />. */
  visibleItems: TItem[];
  /** Bound props for <LibraryToolbar />. */
  toolbarProps: Omit<LibraryToolbarProps, 'sortOptions' | 'filters'>;
  /** True when manual-drag reorder should be locked (search or non-manual sort). */
  reorderLocked: boolean;
  reorderLockedReason: string | undefined;
  /** Raw state (for consumers that want to persist across mounts). */
  state: {
    search: string;
    sort: { key: string; dir: LibrarySortDir };
    viewMode: LibraryViewMode;
    filterValues: Record<string, string>;
  };
}

/* ─── useSortableReorder (dnd-kit → persistence helper) ───────────────────── */

export interface UseSortableReorderOptions<TItem> {
  items: TItem[];
  getId: (item: TItem) => string;
  /**
   * Commit the new ordering. May persist over the network; if it rejects,
   * the hook reverts the optimistic local reorder.
   */
  onCommit: (nextOrderedIds: string[]) => Promise<void> | void;
}

export interface UseSortableReorderResult<TItem> {
  /** Optimistically-reordered items. Feed into <LibraryGrid items={...} />. */
  orderedItems: TItem[];
  /** Wire this into <LibraryGrid onReorder={...} />. */
  handleReorder: (nextOrderedIds: string[]) => Promise<void>;
  /** True while the commit is in-flight. */
  isCommitting: boolean;
  /** Last commit error, if any. Cleared on successful commit. */
  error: Error | null;
}

/* ─── AssignmentArchiveCard (generalized QuizAssignmentArchive) ───────────── */

/** Status badge resolved for an assignment (consumer computes from its status). */
export interface AssignmentStatusBadge {
  label: string; // e.g. "Live" | "Paused" | "Ended"
  tone: LibraryBadgeTone; // success | warn | neutral
  dot?: boolean;
}

export interface AssignmentArchiveCardProps<TAssignment> {
  assignment: TAssignment;
  /** Controls styling + available actions. */
  mode: 'active' | 'archive';
  status: AssignmentStatusBadge;
  /**
   * Optional headline action (e.g. "Copy link"). Omit on archived view-only
   * cards where the link is dead and a Copy button would be misleading; the
   * overflow menu still surfaces remaining actions (Reactivate, Delete).
   */
  primaryAction?: LibraryPrimaryAction;
  secondaryActions?: LibraryMenuAction[];
  /** Optional metadata line(s) — e.g. due date, student count, response count. */
  meta?: React.ReactNode;
  /** Card title — consumer usually passes `assignment.quizTitle` etc. */
  title: string;
  /** Optional small-text subtitle, e.g. className, period name. */
  subtitle?: React.ReactNode;
}

/* ─── AssignModal (shared assign chrome + widget slots) ───────────────────── */

/** Session-mode option (Quiz uses teacher/auto/student). */
export interface AssignModeOption {
  id: string;
  label: string;
  description: string;
  icon?: React.ComponentType<{
    size?: number;
    className?: string;
    style?: React.CSSProperties;
  }>;
  /** Lock the mode selector (e.g. assignment is already live). */
  disabled?: boolean;
}

export interface AssignModalProps<TOptions> {
  isOpen: boolean;
  onClose: () => void;
  /** The thing being assigned (e.g. quiz title). Shown in header. */
  itemTitle: string;
  /** Optional mode selector. Omit for widgets that don't have modes (MiniApp). */
  modes?: AssignModeOption[];
  selectedMode?: string;
  onModeChange?: (id: string) => void;
  /** Widget-specific options object. Primitive is agnostic to its shape. */
  options: TOptions;
  onOptionsChange: (next: TOptions) => void;
  /** Widget-specific toggles/inputs. Rendered in the body. */
  extraSlot?: React.ReactNode;
  /** PLC / period selection slot. Rendered below extraSlot. */
  plcSlot?: React.ReactNode;
  /** Assignment name (e.g. "Period 2"). Primitive owns the input. */
  assignmentName?: string;
  onAssignmentNameChange?: (next: string) => void;
  /** Called with the committed mode + options on confirm. */
  onAssign: (payload: {
    mode: string | undefined;
    options: TOptions;
    assignmentName: string | undefined;
  }) => Promise<void> | void;
  /** Override confirm button label (default: "Assign"). */
  confirmLabel?: string;
  /** Inline disabled reason (e.g. missing required field). */
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
}

/* ─── PeriodSelector (extracted from QuizPeriodSelector) ──────────────────── */

export interface PeriodSelectorProps {
  rosters: ClassRoster[];
  selectedPeriodNames: string[];
  /**
   * Period names that have students who've already joined. These cannot be
   * unchecked. Consumer computes this from responses/submissions.
   */
  lockedPeriodNames?: string[];
  onSave: (periodNames: string[]) => void;
  onClose: () => void;
}

/* ─── ImportWizard (shared chrome) + ImportAdapter<TData> (contract) ──────── */

/** Payload wrapper passed to the adapter's parse function. */
export type ImportSourcePayload =
  | { kind: 'sheet'; url: string }
  | { kind: 'csv'; text: string; fileName?: string }
  | { kind: 'json'; text: string; fileName?: string }
  | { kind: 'html'; text: string; fileName?: string }
  | { kind: 'file'; file: File };

/** Parser result — `warnings` surface non-fatal issues in the preview. */
export interface ImportParseResult<TData> {
  data: TData;
  warnings: string[];
}

/** Validation result — `errors` block Save; empty array = pass. */
export interface ImportValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Per-widget adapter. The wizard drives through these methods sequentially.
 * Adapters are pure — no UI state inside them.
 */
export interface ImportAdapter<TData> {
  /** e.g. "Quiz", used for wizard copy. */
  widgetLabel: string;
  supportedSources: ImportSourceKind[];
  /** Optional helper for Google Sheets template creation. */
  templateHelper?: {
    createTemplate: () => Promise<{ url: string }>;
    instructions: React.ReactNode;
  };
  parse: (source: ImportSourcePayload) => Promise<ImportParseResult<TData>>;
  validate: (data: TData) => ImportValidationResult;
  renderPreview: (data: TData) => React.ReactNode;
  /**
   * Optional — given the parsed data, return a suggested title. The wizard
   * auto-populates its title input with this value when the input is empty,
   * so callers shouldn't have to retype an already-extracted title (e.g. a
   * `<title>` tag from an uploaded HTML file).
   */
  suggestTitle?: (data: TData) => string | undefined;
  /** Persist to the widget's library. Consumer owns Firestore/Drive writes. */
  save: (data: TData, title: string) => Promise<void>;
  /** Optional AI-assist path (e.g. Quiz's Gemini generator). */
  aiAssist?: {
    promptPlaceholder: string;
    generate: (ctx: { prompt: string }) => Promise<TData>;
  };
}

export interface ImportWizardProps<TData> {
  isOpen: boolean;
  onClose: () => void;
  adapter: ImportAdapter<TData>;
  /** Prefill the title input (e.g. from a filename). */
  defaultTitle?: string;
  /** Called after a successful save closes the wizard. */
  onSaved?: (title: string) => void;
}

/* ─── Re-exports ──────────────────────────────────────────────────────────── */

/**
 * Convenience alias — widgets defining per-assignment types (`QuizAssignment`,
 * `VideoActivityAssignment`, etc.) can import `LibraryAssignmentStatus` as
 * `AssignmentStatus` without polluting the root types.ts namespace.
 */
export type { LibraryAssignmentStatus as AssignmentStatus };
