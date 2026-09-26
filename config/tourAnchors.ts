// Stable live-tour anchors; tests/tourAnchors.test.ts fails if a key stops being rendered.
// Separately, `data-pii` marks student faces, photos and free-form work, which tour recordings always blur.
export interface TourAnchorDef {
  label: string;
  /** One element per widget instance, scoped by `data-tour-widget`. */
  perWidget?: true;
  /** One element per widget type, scoped by `data-tour-widget-type`. */
  perWidgetType?: true;
  /** One element per schema field, scoped by `data-tour-field` plus widget type. Ref: `id:type#fieldKey`. */
  perField?: true;
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
  'settings.field': {
    label: 'A single settings field row, by widget type and field key',
    perField: true,
  },

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

  'projects.board-grid': {
    label: 'Projects step grid',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.class-picker': {
    label: 'Projects class picker',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.status-popover': {
    label: 'Projects step status menu',
    perWidget: true,
    panel: true,
  },
  'profile.close': { label: 'Close button in Profile & Settings', panel: true },
  'profile.mobile-back': {
    label: 'Back button in Profile & Settings on phones',
    panel: true,
  },
  'profile.tab-profile': {
    label: 'Profile tab in Profile & Settings',
    panel: true,
  },
  'profile.tab-appearance': {
    label: 'Appearance tab in Profile & Settings',
    panel: true,
  },
  'profile.tab-dock': { label: 'Dock tab in Profile & Settings', panel: true },
  'profile.tab-behavior': {
    label: 'Behavior tab in Profile & Settings',
    panel: true,
  },
  'profile.tab-widget-defaults': {
    label: 'Widget defaults tab in Profile & Settings',
    panel: true,
  },
  'profile.tab-language': {
    label: 'Language tab in Profile & Settings',
    panel: true,
  },
  'profile.buildings': {
    label: 'Building choices in the Profile tab',
    panel: true,
  },
  'profile.reset-grades': {
    label: 'Reset grades to building default',
    panel: true,
  },
  'profile.grades': { label: 'Grade choices in the Profile tab', panel: true },
  'profile.subjects': {
    label: 'Content area choices in the Profile tab',
    panel: true,
  },
  'appearance.font-toggle': { label: 'Change font button', panel: true },
  'appearance.font-selector': { label: 'Font picker', panel: true },
  'appearance.font-list': {
    label: 'Font choices in the font picker',
    panel: true,
  },
  'appearance.transparency-slider': {
    label: 'Window transparency slider',
    panel: true,
  },
  'appearance.corners': { label: 'Window corner style choices', panel: true },
  'appearance.primary-color': { label: 'Primary color picker', panel: true },
  'appearance.accent-color': { label: 'Accent color picker', panel: true },
  'appearance.title-color': { label: 'Window title color picker', panel: true },
  'appearance.reset-all-colors': {
    label: 'Reset all colors to default',
    panel: true,
    destructive: true,
  },
  'dock.position': { label: 'Dock position choices', panel: true },
  'dock.transparency-slider': {
    label: 'Dock transparency slider',
    panel: true,
  },
  'dock.corners': { label: 'Dock corner style choices', panel: true },
  'dock.text-color': { label: 'Dock text color picker', panel: true },
  'dock.text-shadow-toggle': { label: 'Dock text shadow button', panel: true },
  'behavior.close-warning-toggle': {
    label: 'Disable close warning switch',
    panel: true,
  },
  'behavior.remote-control-toggle': {
    label: 'Remote control switch',
    panel: true,
  },
  'language.options': { label: 'Language choices', panel: true },
  'widget-defaults.clear-type': {
    label: "Clear a widget's saved defaults",
    perWidgetType: true,
    panel: true,
    destructive: true,
  },
  'widget-defaults.remove-key': {
    label: 'Remove one saved widget default',
    perWidgetType: true,
    panel: true,
    destructive: true,
  },
  'classes.new-class': { label: 'New Class button in My Classes', panel: true },
  'classes.import-classlink': {
    label: 'ClassLink import button in My Classes',
    panel: true,
  },
  'classes.link-schoology': {
    label: 'Link Schoology sections button in My Classes',
    panel: true,
  },
  'classes.roster-list': { label: 'Roster list in My Classes', panel: true },
  'classes.classroom-unlink': {
    label: 'Unlink button in the Link to Google Classroom modal',
    panel: true,
    destructive: true,
  },
  'classes.classroom-cancel': {
    label: 'Cancel button in the Link to Google Classroom modal',
    panel: true,
  },
  'classes.classroom-confirm': {
    label: 'Link Class confirm button in the Link to Google Classroom modal',
    panel: true,
  },
  'classes.classroom-retry': {
    label: 'Try again button in the Link to Google Classroom modal',
    panel: true,
  },
  'plcs.new-plc': { label: 'New PLC button in My PLCs', panel: true },
  'plcs.invites': { label: 'Invites button in My PLCs', panel: true },
  'plcs.plc-list': { label: 'PLC list in My PLCs', panel: true },
  'plc-edit.name': {
    label: 'PLC name input in the PLC edit modal',
    panel: true,
  },
  'plc-edit.invite-email': {
    label: 'Invite email input in the PLC edit modal',
    panel: true,
  },
  'plc-edit.send-invite': {
    label: 'Invite button in the PLC edit modal',
    panel: true,
  },
  'plc-edit.cancel': {
    label: 'Cancel button in the PLC edit modal',
    panel: true,
  },
  'plc-edit.save': {
    label: 'Save/Create button in the PLC edit modal',
    panel: true,
  },
  'plc-invites.list': {
    label: 'Pending invites list in the PLC invites modal',
    panel: true,
  },
  'breathing.start-pause': {
    label: 'Start or pause button in Breathing',
    perWidget: true,
  },
  'breathing.reset': {
    label: 'Reset button in Breathing',
    perWidget: true,
    destructive: true,
  },
  'activity-wall.toggle-open': {
    label: 'Open/Closed toggle in Activity Wall',
    perWidget: true,
  },
  'activity-wall.moderate': {
    label: 'Moderate posts button in Activity Wall',
    perWidget: true,
  },
  'activity-wall.share': {
    label: 'Share button in Activity Wall',
    perWidget: true,
  },
  'activity-wall.library': {
    label: 'Open wall library button in Activity Wall',
    perWidget: true,
  },
  'time-tool.start-pause': {
    label: 'Start or pause button in Timer/Stopwatch',
    perWidget: true,
  },
  'time-tool.reset': {
    label: 'Reset button in Timer/Stopwatch',
    perWidget: true,
    destructive: true,
  },
  'dice.roll': { label: 'Roll Dice button', perWidget: true },
  'random.pick': {
    label: 'Randomize/Pick button in Random Picker',
    perWidget: true,
  },
  'random.reset': {
    label: 'Reset student pool button in Random Picker',
    perWidget: true,
    destructive: true,
  },
  'poll.next-question': {
    label: 'Next question button in Poll',
    perWidget: true,
  },
  'poll.reset': {
    label: 'Reset Poll button',
    perWidget: true,
    destructive: true,
  },
  'stations.shuffle': { label: 'Shuffle button in Stations', perWidget: true },
  'stations.rotate': { label: 'Rotate button in Stations', perWidget: true },
  'stations.reset-all': {
    label: 'Reset all button in Stations',
    perWidget: true,
    destructive: true,
  },
  'checklist.reset-checks': {
    label: 'Reset checked items button in Checklist',
    perWidget: true,
    destructive: true,
  },
  'checklist.remove-completed': {
    label: 'Remove completed items button in Checklist',
    perWidget: true,
    destructive: true,
  },
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

// Schema-rendered field rows: one tag in the shared renderer covers every field.
export const tourFieldAttr = (
  id: TourAnchorId,
  widgetType: string,
  fieldKey: string
) => ({
  'data-tour': id,
  'data-tour-widget-type': widgetType,
  'data-tour-field': fieldKey,
});

// A tour step's anchor ref: the registry id, plus `:<widgetType>` for per-type anchors
// and `#<fieldKey>` for a single field of that widget type.
export const tourAnchorRef = (
  id: TourAnchorId,
  widgetType?: string,
  fieldKey?: string
) =>
  fieldKey
    ? `${id}:${widgetType}#${fieldKey}`
    : widgetType
      ? `${id}:${widgetType}`
      : id;

export const parseTourAnchorRef = (
  ref: string
): { id: string; widgetType?: string; fieldKey?: string } => {
  const hash = ref.indexOf('#');
  const head = hash === -1 ? ref : ref.slice(0, hash);
  const fieldKey = hash === -1 ? undefined : ref.slice(hash + 1);
  const sep = head.indexOf(':');
  return sep === -1
    ? { id: head, fieldKey }
    : { id: head.slice(0, sep), widgetType: head.slice(sep + 1), fieldKey };
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
