import type { GuidedLearningTourBinding, WidgetData } from '@/types';
import {
  anchorPrerequisite,
  isTourAnchorId,
  parseTourAnchorRef,
  TOUR_ANCHORS,
  type TourAnchorDef,
  type TourAnchorPrerequisite,
} from '@/config/tourAnchors';
import { findTourAnchor, type TourAnchorScope } from './resolveTourAnchor';

/** Window event the dock listens to; `detail.expanded` opens or collapses it. */
export const TOUR_DOCK_EVENT = 'spart-tour-dock';

export interface TourDockRequest {
  expanded: boolean;
}

const dockElement = () =>
  document.querySelector<HTMLElement>('[data-role="dock"][data-dock-expanded]');

export const isDockExpanded = (): boolean =>
  dockElement()?.getAttribute('data-dock-expanded') === 'true';

const requestDock = (expanded: boolean) =>
  window.dispatchEvent(
    new CustomEvent<TourDockRequest>(TOUR_DOCK_EVENT, { detail: { expanded } })
  );

type TourBinding = Pick<
  GuidedLearningTourBinding,
  'anchor' | 'fallback' | 'slot'
>;

export interface PrerequisiteContext {
  binding: TourBinding;
  scope: TourAnchorScope;
  /** The widget a widget-scoped anchor belongs to, when one is on the board. */
  widgetId: string | null;
  isMinimized: (id: string) => boolean;
  isSelected: (id: string) => boolean;
  select: (id: string | null) => void;
  /** Un-minimizes a widget for the rest of the tour, without saving it. */
  restore: (id: string) => void;
}

/** Puts a change back on teardown; `key` dedupes repeat calls within a tour. */
export interface PrerequisiteUndo {
  key: string;
  undo: () => void;
}

const restoreIfMinimized = (ctx: PrerequisiteContext, id: string) => {
  if (ctx.isMinimized(id)) ctx.restore(id);
};

const SATISFIERS: Record<
  TourAnchorPrerequisite,
  (ctx: PrerequisiteContext) => PrerequisiteUndo | null
> = {
  'dock-expanded': () => {
    if (!dockElement() || isDockExpanded()) return null;
    requestDock(true);
    // Collapse again only if the dock is still open, so a teacher's own toggle wins.
    return {
      key: 'dock',
      undo: () => {
        if (isDockExpanded()) requestDock(false);
      },
    };
  },
  'widget-selected': (ctx) => {
    const id = ctx.widgetId;
    if (!id) return null;
    restoreIfMinimized(ctx, id);
    if (ctx.isSelected(id)) return null;
    ctx.select(id);
    return {
      key: `select:${id}`,
      undo: () => {
        if (ctx.isSelected(id)) ctx.select(null);
      },
    };
  },
  'widget-restored': (ctx) => {
    if (ctx.widgetId) restoreIfMinimized(ctx, ctx.widgetId);
    return null;
  },
  'in-view': (ctx) => {
    findTourAnchor(ctx.binding, ctx.scope)?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
    return null;
  },
};

/** Sets up the state a step's anchor needs; idempotent, so it can run until found. */
export function satisfyPrerequisite(
  ctx: PrerequisiteContext
): PrerequisiteUndo | null {
  const requires = anchorPrerequisite(ctx.binding.anchor);
  return requires ? SATISFIERS[requires](ctx) : null;
}

/** The widget a per-widget step points at: its bound slot, a tour widget, then any of the type. */
export function prerequisiteWidgetId(
  binding: TourBinding,
  widgets: readonly Pick<WidgetData, 'id' | 'type'>[],
  scope: TourAnchorScope
): string | null {
  const { id, widgetType } = parseTourAnchorRef(binding.anchor);
  if (!isTourAnchorId(id)) return null;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  if (!def.perWidget) return null;
  const bound =
    binding.slot === undefined ? undefined : scope.slots?.[binding.slot];
  if (bound) return widgets.some((w) => w.id === bound) ? bound : null;
  const ofType = widgetType
    ? widgets.filter((w) => w.type === widgetType)
    : widgets;
  return (
    ofType.find((w) => scope.widgetIds?.includes(w.id))?.id ??
    ofType[0]?.id ??
    null
  );
}
