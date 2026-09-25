// Stable live-tour anchors; tests/tourAnchors.test.ts fails if a key stops being rendered.
// Separately, `data-pii` marks student faces, photos and free-form work, which tour recordings always blur.
export interface TourAnchorDef {
  label: string;
  /** One element per widget instance, scoped by `data-tour-widget`. */
  perWidget?: true;
  /** One element per widget type, scoped by `data-tour-widget-type`. */
  perWidgetType?: true;
  /** Autopilot never clicks it for the teacher by default. */
  destructive?: true;
  /** Shown only once a menu, the dock or another panel is open. */
  panel?: true;
  /** State the runner sets up before it looks for the anchor. */
  requires?: TourAnchorPrerequisite;
}

export const TOUR_ANCHOR_PREREQUISITES = [
  'dock-expanded',
  'widget-selected',
  'widget-restored',
  'in-view',
] as const;

export type TourAnchorPrerequisite = (typeof TOUR_ANCHOR_PREREQUISITES)[number];

export const TOUR_ANCHORS = {
  'dock.open-tools': { label: 'Open Tools button in the collapsed dock' },
  'dock.item': {
    label: 'Widget button in the dock',
    perWidgetType: true,
    panel: true,
    requires: 'dock-expanded',
  },
  'dock.more-widgets': {
    label: 'More button that opens the widget library',
    panel: true,
    requires: 'dock-expanded',
  },
  'library.root': { label: 'Widget library window', panel: true },
  'library.search': { label: 'Widget library search box', panel: true },
  'library.item': {
    label: 'Widget tile in the widget library',
    perWidgetType: true,
    panel: true,
    requires: 'in-view',
  },
  'library.edit': { label: 'Edit button in the widget library', panel: true },
  'library.close': { label: 'Close button in the widget library', panel: true },

  'widget.window': {
    label: 'Widget window',
    perWidget: true,
    requires: 'widget-restored',
  },
  'widget.toolbar': {
    label: 'Widget toolbar',
    perWidget: true,
    requires: 'widget-selected',
  },
  'widget.title': {
    label: 'Widget title in the toolbar',
    perWidget: true,
    requires: 'widget-selected',
  },
  'widget.settings-opener': {
    label: 'Widget settings button',
    perWidget: true,
    requires: 'widget-selected',
  },
  'widget.pin': {
    label: 'Pin widget button',
    perWidget: true,
    requires: 'widget-selected',
  },
  'widget.annotate': {
    label: 'Annotate widget button',
    perWidget: true,
    requires: 'widget-selected',
  },
  'widget.duplicate': {
    label: 'Duplicate widget button',
    perWidget: true,
    requires: 'widget-selected',
  },
  'widget.snap-layout': {
    label: 'Snap layout button',
    perWidget: true,
    requires: 'widget-selected',
  },
  'widget.close': {
    label: 'Close widget button',
    perWidget: true,
    destructive: true,
    requires: 'widget-selected',
  },
  'widget.more-actions': {
    label: 'More actions button on a maximized widget',
    perWidget: true,
  },
  'widget.restore': {
    label: 'Restore button on a maximized widget',
    perWidget: true,
  },

  'settings.root': { label: 'Widget settings panel', perWidget: true },
  'settings.help': { label: 'Widget help button in settings', perWidget: true },
  'settings.close': { label: 'Close settings button', perWidget: true },
  'settings.tab-settings': { label: 'Settings tab', perWidget: true },
  'settings.tab-style': { label: 'Style tab', perWidget: true },
  'settings.search': { label: 'Find a setting box', perWidget: true },

  'sidebar.open-menu': { label: 'Menu button in the top bar' },
  'sidebar.admin-settings': { label: 'Admin settings button in the top bar' },
  'sidebar.fullscreen': { label: 'Fullscreen button in the top bar' },
  'sidebar.annotate': { label: 'Annotate screen button in the top bar' },
  'sidebar.clear-board': {
    label: 'Clear board button in the top bar',
    destructive: true,
  },
  'sidebar.close-menu': { label: 'Close menu button', panel: true },
  'sidebar.boards': { label: 'Boards item in the menu', panel: true },
  'sidebar.backgrounds': { label: 'Backgrounds item in the menu', panel: true },
  'sidebar.assignments': { label: 'Assignments item in the menu', panel: true },
  'sidebar.classes': { label: 'My Classes item in the menu', panel: true },
  'sidebar.profile-settings': {
    label: 'Profile & Settings item in the menu',
    panel: true,
  },
  'sidebar.quick-access': {
    label: 'Quick Access item in the menu',
    panel: true,
  },
  'sidebar.whats-new': { label: "What's New item in the menu", panel: true },

  'board-nav.select-board': { label: 'Board name button that opens boards' },
  'board-nav.previous': { label: 'Previous board button' },
  'board-nav.next': { label: 'Next board button' },
  'board-nav.select-collection': { label: 'Collection picker button' },
  'board-nav.new-board': {
    label: 'New Board item in the boards menu',
    destructive: true,
    panel: true,
  },
  'board-nav.manage-boards': { label: 'Manage all boards item', panel: true },

  'board-actions.zoom': { label: 'Zoom level button' },
  'board-actions.zoom-reset': { label: 'Reset zoom button' },
  'board-actions.help': { label: 'Help button' },
} as const satisfies Record<string, TourAnchorDef>;

export type TourAnchorId = keyof typeof TOUR_ANCHORS;

export const isTourAnchorId = (id: string): id is TourAnchorId =>
  Object.prototype.hasOwnProperty.call(TOUR_ANCHORS, id);

// Widget-scoped anchors also carry the type, so a recording saves `id:type`.
export const tourAttr = (
  id: TourAnchorId,
  widgetId?: string,
  widgetType?: string
) => ({
  'data-tour': id,
  ...(widgetId ? { 'data-tour-widget': widgetId } : {}),
  ...(widgetType ? { 'data-tour-widget-type': widgetType } : {}),
});

export const tourTypeAttr = (id: TourAnchorId, widgetType: string) => ({
  'data-tour': id,
  'data-tour-widget-type': widgetType,
});

// A tour step's anchor ref: the registry id, plus `:<widgetType>` for per-type anchors.
export const tourAnchorRef = (id: TourAnchorId, widgetType?: string) =>
  widgetType ? `${id}:${widgetType}` : id;

export const parseTourAnchorRef = (
  ref: string
): { id: string; widgetType?: string } => {
  const sep = ref.indexOf(':');
  return sep === -1
    ? { id: ref }
    : { id: ref.slice(0, sep), widgetType: ref.slice(sep + 1) };
};

/** The state a step's anchor needs before it can be found, if any. */
export const anchorPrerequisite = (
  ref: string
): TourAnchorPrerequisite | undefined => {
  const { id } = parseTourAnchorRef(ref);
  if (!isTourAnchorId(id)) return undefined;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  return def.requires;
};

/** Whether a step's anchor ref points at an anchor registered as destructive. */
export const isDestructiveAnchor = (ref: string): boolean => {
  const { id } = parseTourAnchorRef(ref);
  if (!isTourAnchorId(id)) return false;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  return !!def.destructive;
};
