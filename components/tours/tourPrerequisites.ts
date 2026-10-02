import type { GuidedLearningTourBinding, WidgetData } from '@/types';
import {
  anchorPrerequisite,
  isTourAnchorId,
  parseTourAnchorRef,
  TOUR_ANCHORS,
  type TourAnchorDef,
  type TourAnchorPrerequisite,
} from '@/config/tourAnchors';
import type { SettingsTab } from '@/components/settings/schema/types';
import {
  findTourAnchor,
  quote,
  type TourAnchorScope,
} from './resolveTourAnchor';

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
  /** Whether a widget's settings drawer is open (the widget is flipped). */
  isSettingsOpen: (id: string) => boolean;
  /** Opens or closes a widget's settings drawer, as its gear button does. */
  setSettingsOpen: (id: string, open: boolean) => void;
  /** The drawer tab that renders a field; undefined while the widget's schema loads. */
  fieldTab?: (
    widgetType: string,
    fieldKey: string
  ) => SettingsTab | null | undefined;
}

/** Puts a change back on teardown; `key` dedupes repeat calls within a tour. */
export interface PrerequisiteUndo {
  key: string;
  undo: () => void;
}

const restoreIfMinimized = (ctx: PrerequisiteContext, id: string) => {
  if (ctx.isMinimized(id)) ctx.restore(id);
};

const scrollIntoView = (ctx: PrerequisiteContext): PrerequisiteUndo[] => {
  findTourAnchor(ctx.binding, ctx.scope)?.scrollIntoView?.({
    block: 'nearest',
    inline: 'nearest',
  });
  return [];
};

const selectWidget = (ctx: PrerequisiteContext): PrerequisiteUndo[] => {
  const id = ctx.widgetId;
  if (!id) return [];
  restoreIfMinimized(ctx, id);
  if (ctx.isSelected(id)) return [];
  ctx.select(id);
  return [
    {
      key: `select:${id}`,
      undo: () => {
        if (ctx.isSelected(id)) ctx.select(null);
      },
    },
  ];
};

// Drawer tabs are `role="tab"`; the legacy panel's are pressed buttons.
const isActiveTab = (el: Element) =>
  el.getAttribute('aria-selected') === 'true' ||
  el.getAttribute('aria-pressed') === 'true';

/** Switches an open drawer to the tab that renders the step's field. */
const showFieldTab = (ctx: PrerequisiteContext, widgetId: string) => {
  const { widgetType, fieldKey } = parseTourAnchorRef(ctx.binding.anchor);
  if (!widgetType || !fieldKey || !ctx.fieldTab) return;
  if (findTourAnchor(ctx.binding, ctx.scope)) return;
  const tab = ctx.fieldTab(widgetType, fieldKey);
  if (!tab) return;
  const tabEl = document.querySelector<HTMLElement>(
    `[data-tour=${quote(`settings.tab-${tab}`)}][data-tour-widget=${quote(widgetId)}]`
  );
  if (tabEl && !isActiveTab(tabEl)) tabEl.click();
};

/** Undo keys for drawers a tour opened; the runner closes them when a step leaves the drawer. */
export const settingsUndoKey = (widgetId: string) => `settings:${widgetId}`;

const SATISFIERS: Record<
  TourAnchorPrerequisite,
  (ctx: PrerequisiteContext) => PrerequisiteUndo[]
> = {
  'dock-expanded': (ctx) => {
    if (!dockElement()) return [];
    // Items far along the dock sit outside its scroller at laptop widths.
    if (isDockExpanded()) return scrollIntoView(ctx);
    requestDock(true);
    // Collapse again only if the dock is still open, so a teacher's own toggle wins.
    return [
      {
        key: 'dock',
        undo: () => {
          if (isDockExpanded()) requestDock(false);
        },
      },
    ];
  },
  'widget-selected': selectWidget,
  'widget-restored': (ctx) => {
    if (ctx.widgetId) restoreIfMinimized(ctx, ctx.widgetId);
    return [];
  },
  'in-view': scrollIntoView,
  'settings-open': (ctx) => {
    const id = ctx.widgetId;
    if (!id) return [];
    const undos = selectWidget(ctx);
    if (ctx.isSettingsOpen(id)) {
      showFieldTab(ctx, id);
      return undos;
    }
    ctx.setSettingsOpen(id, true);
    // Close only a drawer that is still open, so a teacher's own close wins.
    return [
      ...undos,
      {
        key: settingsUndoKey(id),
        undo: () => {
          if (ctx.isSettingsOpen(id)) ctx.setSettingsOpen(id, false);
        },
      },
    ];
  },
};

/** Sets up the state a step's anchor needs; idempotent, so it can run until found. */
export function satisfyPrerequisite(
  ctx: PrerequisiteContext
): PrerequisiteUndo[] {
  const requires = anchorPrerequisite(ctx.binding.anchor);
  return requires ? SATISFIERS[requires](ctx) : [];
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
  if (!def.perWidget && def.requires !== 'settings-open') return null;
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
