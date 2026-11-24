import {
  Eye,
  EyeOff,
  Pause,
  Play,
  PowerOff,
  RotateCcw,
  Settings2,
} from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { AssignedStatus } from '@/utils/assignedStatus';
import type { LibraryMenuAction } from '../types';
import type { AssignedChipOption } from './AssignedChip';
import type { ClassActionKind } from './assignedWording';

type RowState = 'open' | 'paused' | 'ready' | 'scheduled' | 'closed';
const ROW_STATES: RowState[] = ['open', 'paused', 'ready', 'scheduled'];

interface ChipInputs {
  status: AssignedStatus;
  menuActions: LibraryMenuAction[];
  onClassAction: (kind: ClassActionKind, classKey: string | null) => void;
  classControls: boolean;
  canPause: boolean;
  /** `row-N`, for each option's tour anchor. */
  rowKey: string;
  tourWidgetType: string;
}

/** The status chip's choices: the row's state and the ones it can move to. */
export function statusChipOptions(o: ChipInputs): AssignedChipOption[] {
  const { status, onClassAction } = o;
  const state: RowState =
    ROW_STATES.find((st) => status.classes.some((c) => c.status === st)) ??
    'closed';
  const item = (id: string) =>
    o.menuActions.find((m) => m.chip === 'status' && m.id === id);
  const reopen = item('assigned-reopen');
  const closeAll = item('assigned-close-all');
  const anchor = (id: string) =>
    tourFieldAttr(
      'library-shell.assigned-status-option',
      o.tourWidgetType,
      `${o.rowKey}-${id}`
    );
  // Acts on the classes the status word names, or the whole run when it has one line.
  const each = (kind: ClassActionKind, from: RowState) => () => {
    if (status.singleLine) return onClassAction(kind, null);
    for (const c of status.classes)
      if (c.status === from) onClassAction(kind, c.key);
  };
  const close =
    closeAll?.onClick ??
    (status.singleLine && o.classControls
      ? () => onClassAction('close', null)
      : undefined);
  const word: Record<RowState, string> = {
    open: 'Open',
    paused: 'Paused',
    ready: 'Ready',
    scheduled: 'Scheduled',
    closed: 'Closed',
  };
  const opts: AssignedChipOption[] = [];
  if (state === 'ready' || state === 'scheduled')
    opts.push({ id: state, label: word[state], selected: true });
  if (state === 'closed')
    opts.push({
      id: 'reopen',
      label: 'Reopen',
      icon: RotateCcw,
      iconClass: 'text-emerald-600',
      onSelect: reopen?.onClick,
      anchor: reopen?.anchor,
    });
  else
    opts.push({
      id: 'open',
      label: 'Open',
      icon: Play,
      iconClass: 'text-emerald-600',
      selected: state === 'open',
      onSelect: !o.classControls
        ? undefined
        : state === 'paused'
          ? each('resume', 'paused')
          : state !== 'open' && status.singleLine
            ? () => onClassAction('open', null)
            : undefined,
      anchor: anchor('open'),
    });
  if (state === 'open' || state === 'paused')
    opts.push({
      id: 'paused',
      label: 'Paused',
      icon: Pause,
      iconClass: 'text-amber-600',
      selected: state === 'paused',
      onSelect:
        state === 'open' && o.classControls && o.canPause
          ? each('pause', 'open')
          : undefined,
      anchor: anchor('paused'),
    });
  opts.push({
    id: 'closed',
    label: 'Closed',
    icon: PowerOff,
    iconClass: 'text-slate-500',
    selected: state === 'closed',
    onSelect: state === 'closed' ? undefined : close,
    anchor: state === 'closed' ? anchor('closed') : closeAll?.anchor,
  });
  return opts.filter((x) => !!x.selected || !!x.onSelect);
}

/** The publish chip's choices, from the row's Publish and Unpublish items. */
export function publishChipOptions(
  menuActions: LibraryMenuAction[],
  rowKey: string,
  tourWidgetType: string
): {
  published: boolean;
  options: AssignedChipOption[];
  footer?: AssignedChipOption;
} | null {
  const publish = menuActions.find(
    (m) => m.chip === 'publish' && m.id === 'publish-scores'
  );
  if (!publish) return null;
  const unpublish = menuActions.find(
    (m) => m.chip === 'publish' && m.id === 'unpublish-scores'
  );
  const published = !!publish.selected;
  const anchor = (id: string) =>
    tourFieldAttr(
      'library-shell.assigned-publish-option',
      tourWidgetType,
      `${rowKey}-${id}`
    );
  return {
    published,
    options: [
      {
        id: 'not-published',
        label: 'Not published',
        icon: EyeOff,
        selected: !published,
        // Without its own Unpublish item, the Publish dialog has one.
        onSelect: published
          ? (unpublish?.onClick ?? publish.onClick)
          : undefined,
        anchor: published ? unpublish?.anchor : anchor('not-published'),
      },
      {
        id: 'published',
        label: 'Published',
        icon: Eye,
        selected: published,
        onSelect: published ? undefined : publish.onClick,
        anchor: published ? anchor('published') : publish.anchor,
      },
    ],
    footer: published
      ? {
          id: 'settings',
          label: 'Publish settings',
          icon: Settings2,
          onSelect: publish.onClick,
          anchor: publish.anchor,
        }
      : undefined,
  };
}
