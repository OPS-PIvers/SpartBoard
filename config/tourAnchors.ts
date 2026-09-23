// Stable live-tour anchors; tests/tourAnchors.test.ts fails if a key stops being rendered.
export interface TourAnchorDef {
  label: string;
  /** One element per widget instance, scoped by `data-tour-widget`. */
  perWidget?: true;
  /** One element per widget type, scoped by `data-tour-widget-type`. */
  perWidgetType?: true;
}

export const TOUR_ANCHORS = {
  'dock.open-tools': { label: 'Open Tools button in the collapsed dock' },
  'dock.item': { label: 'Widget button in the dock', perWidgetType: true },
  'dock.more-widgets': { label: 'More button that opens the widget library' },
  'library.root': { label: 'Widget library window' },
  'library.search': { label: 'Widget library search box' },
  'library.item': {
    label: 'Widget tile in the widget library',
    perWidgetType: true,
  },
  'library.edit': { label: 'Edit button in the widget library' },
  'library.close': { label: 'Close button in the widget library' },

  'widget.window': { label: 'Widget window', perWidget: true },
  'widget.toolbar': { label: 'Widget toolbar', perWidget: true },
  'widget.title': { label: 'Widget title in the toolbar', perWidget: true },
  'widget.settings-opener': {
    label: 'Widget settings button',
    perWidget: true,
  },
  'widget.pin': { label: 'Pin widget button', perWidget: true },
  'widget.annotate': { label: 'Annotate widget button', perWidget: true },
  'widget.duplicate': { label: 'Duplicate widget button', perWidget: true },
  'widget.snap-layout': { label: 'Snap layout button', perWidget: true },
  'widget.close': { label: 'Close widget button', perWidget: true },
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
  'sidebar.clear-board': { label: 'Clear board button in the top bar' },
  'sidebar.close-menu': { label: 'Close menu button' },
  'sidebar.boards': { label: 'Boards item in the menu' },
  'sidebar.backgrounds': { label: 'Backgrounds item in the menu' },
  'sidebar.assignments': { label: 'Assignments item in the menu' },
  'sidebar.classes': { label: 'My Classes item in the menu' },
  'sidebar.profile-settings': { label: 'Profile & Settings item in the menu' },
  'sidebar.quick-access': { label: 'Quick Access item in the menu' },
  'sidebar.whats-new': { label: "What's New item in the menu" },

  'board-nav.select-board': { label: 'Board name button that opens boards' },
  'board-nav.previous': { label: 'Previous board button' },
  'board-nav.next': { label: 'Next board button' },
  'board-nav.select-collection': { label: 'Collection picker button' },
  'board-nav.new-board': { label: 'New Board item in the boards menu' },
  'board-nav.manage-boards': { label: 'Manage all boards item' },

  'board-actions.zoom': { label: 'Zoom level button' },
  'board-actions.zoom-reset': { label: 'Reset zoom button' },
  'board-actions.help': { label: 'Help button' },
} as const satisfies Record<string, TourAnchorDef>;

export type TourAnchorId = keyof typeof TOUR_ANCHORS;

export const isTourAnchorId = (id: string): id is TourAnchorId =>
  Object.prototype.hasOwnProperty.call(TOUR_ANCHORS, id);

export const tourAttr = (id: TourAnchorId, widgetId?: string) => ({
  'data-tour': id,
  ...(widgetId ? { 'data-tour-widget': widgetId } : {}),
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
