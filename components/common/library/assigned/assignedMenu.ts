import { CheckCircle2, PowerOff, RotateCcw } from 'lucide-react';
import { tourTypeAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
import type { AssignedStatus } from '@/utils/assignedStatus';
import type { LibraryMenuAction } from '../types';

/** Kind menu items an Assigned row never shows: the row, its panel or the Library has them (R6, R8, R9). */
const NOT_ON_ASSIGNED = new Set([
  'monitor',
  'results',
  'share',
  'share-menu',
  'get-link',
  'share-with-peers',
  'share-with-plc',
  'stop-sharing-plc',
  'reopen',
  'reopen-all',
  'reopen-students',
  'reactivate',
  'deactivate',
  'end',
  'pause',
  'pause-resume',
  'archive',
  'unarchive',
  'published-results',
  'paper',
]);

/** Shown only while a class is Ready, Scheduled, Open or Paused (R6). */
const WHILE_LIVE = new Set([
  'settings',
  'edit-classes',
  'copy',
  'copy-url',
  'open',
  'student-view',
  'assign-to-classroom',
  'sync-assignment',
]);

/** Paper printing and importing, kept until the assignment is Finished (R6). */
const PAPER = new Set([
  'import-paper',
  'import-written',
  'import-copies',
  'reprint-paper',
  'reprint-written',
  'reprint-copies',
]);

export interface AssignedMenuOptions {
  status: AssignedStatus;
  viewOnly: boolean;
  /** The kind's own items, flat (no side menus). */
  items: readonly LibraryMenuAction[];
  /** Scores are published now; names the publish item (R9). */
  published: boolean;
  /** False hides Share results with PLC; null or absent when the host can't count responses. */
  hasResponses?: boolean | null;
  onCloseAll?: () => void;
  onMoveToDone?: () => void;
  /** Opens the Reopen chooser; a view-only share reopens directly. */
  onReopen?: () => void;
  /** Anchor for the Reopen item; defaults to the shared Assigned one. */
  reopenAnchor?: TourAnchorAttrs;
  tourWidgetType: string;
  busy?: boolean;
}

/** The Assigned row's actions that fit its state (R6 to R9); items with `chip` go in the row's chips, not its ⋯ menu. */
export function assignedMenu(o: AssignedMenuOptions): LibraryMenuAction[] {
  const { status, viewOnly } = o;
  const allClosed = status.classes.every((c) => c.status === 'closed');
  const anyClosed = status.classes.some((c) => c.status === 'closed');
  const finished = status.bucket === 'done';

  const keep = (m: LibraryMenuAction): boolean => {
    if (NOT_ON_ASSIGNED.has(m.id)) return false;
    // A view-only share keeps only Reopen and Delete; Copy link is its row button.
    if (viewOnly) return !!m.destructive;
    if (WHILE_LIVE.has(m.id)) return !allClosed;
    if (PAPER.has(m.id)) return !finished;
    if (m.id === 'publish-scores') return allClosed;
    if (m.id === 'unpublish-scores') return allClosed && o.published;
    if (m.id === 'share-plc-results') return o.hasResponses !== false;
    return true;
  };
  const kept = o.items.filter(keep).map((m) =>
    m.id === 'publish-scores'
      ? {
          ...m,
          label: o.published ? 'Publish settings' : 'Publish scores',
          submenu: undefined,
          chip: 'publish' as const,
          selected: o.published,
        }
      : m.id === 'unpublish-scores'
        ? { ...m, chip: 'publish' as const }
        : m
  );

  const lifecycle: LibraryMenuAction[] = [];
  if (o.onCloseAll && !viewOnly && !status.singleLine && !allClosed)
    lifecycle.push({
      id: 'assigned-close-all',
      label: 'Close for all classes',
      icon: PowerOff,
      chip: 'status',
      anchor: tourTypeAttr(
        'library-shell.assigned-close-all',
        o.tourWidgetType
      ),
      onClick: o.onCloseAll,
    });
  if (o.onReopen && (viewOnly ? allClosed : anyClosed))
    lifecycle.push({
      id: 'assigned-reopen',
      label: 'Reopen',
      icon: RotateCcw,
      chip: 'status',
      anchor:
        o.reopenAnchor ??
        tourTypeAttr('library-shell.assigned-reopen', o.tourWidgetType),
      onClick: o.onReopen,
    });
  if (o.onMoveToDone && !viewOnly && status.bucket === 'active')
    lifecycle.push({
      id: 'assigned-move-to-done',
      label: 'Move to Finished',
      icon: CheckCircle2,
      anchor: tourTypeAttr(
        'library-shell.assigned-move-to-done',
        o.tourWidgetType
      ),
      onClick: o.onMoveToDone,
    });
  for (const item of lifecycle) item.disabled = !!o.busy;

  // Menu labels carry no trailing ellipsis.
  return [
    ...kept.filter((m) => !m.destructive),
    ...lifecycle,
    ...kept.filter((m) => m.destructive),
  ].map((m) =>
    m.label.endsWith('…') ? { ...m, label: m.label.slice(0, -1).trimEnd() } : m
  );
}
