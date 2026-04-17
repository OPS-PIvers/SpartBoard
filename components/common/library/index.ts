/**
 * Barrel export for the shared Library / Assign / Import / Archive primitives.
 *
 * Consumers (Quiz, Video Activity, Guided Learning, MiniApp) import everything
 * they need from `@/components/common/library`. The importer subdirectory
 * has its own barrel at `@/components/common/library/importer` for the
 * ImportWizard + adapter types.
 */

export { LibraryShell } from './LibraryShell';
export { LibraryToolbar } from './LibraryToolbar';
export { LibraryGrid } from './LibraryGrid';
export { LibraryItemCard } from './LibraryItemCard';
export { LibraryGridLockContext } from './LibraryGridLockContext';
export { useLibraryView } from './useLibraryView';
export { useSortableReorder } from './useSortableReorder';
export { AssignModal } from './AssignModal';
export { AssignmentArchiveCard } from './AssignmentArchiveCard';
export { PeriodSelector } from './PeriodSelector';
export { LibraryDndContext } from './LibraryDndContext';
export {
  folderDroppableId,
  FOLDER_DROPPABLE_PREFIX,
} from './folderDropTargets';
export type { FolderDropData } from './folderDropTargets';
export { FolderSidebar } from './FolderSidebar';
export type { FolderSidebarProps, FolderDeleteMode } from './FolderSidebar';
export { FolderTree } from './FolderTree';

export type {
  LibraryTab,
  LibraryViewMode,
  LibrarySortDir,
  LibraryBadgeTone,
  LibraryAssignmentStatus,
  AssignmentStatus,
  LibraryMenuAction,
  LibraryPrimaryAction,
  LibraryBadge,
  LibrarySortOption,
  LibraryFilter,
  LibraryShellTabCounts,
  LibraryShellProps,
  LibraryToolbarProps,
  LibraryItemCardProps,
  LibraryGridProps,
  UseLibraryViewOptions,
  UseLibraryViewResult,
  UseSortableReorderOptions,
  UseSortableReorderResult,
  AssignmentStatusBadge,
  AssignmentArchiveCardProps,
  AssignModeOption,
  AssignModalProps,
  PeriodSelectorProps,
  ImportSourceKind,
  ImportSourcePayload,
  ImportParseResult,
  ImportValidationResult,
  ImportAdapter,
  ImportWizardProps,
} from './types';
