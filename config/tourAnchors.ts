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
  /** Its effect outlives the tour: assigns, shares, publishes, starts a live session or changes account settings. */
  persists?: true;
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
  'settings-open',
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

  'settings.root': {
    label: 'Widget settings panel',
    perWidget: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.help': {
    label: 'Widget help button in settings',
    perWidget: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.close': {
    label: 'Close settings button',
    perWidget: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.tab-settings': {
    label: 'Settings tab',
    perWidget: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.tab-style': {
    label: 'Style tab',
    perWidget: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.search': {
    label: 'Find a setting box',
    perWidget: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.field': {
    label: 'A single settings field row, by widget type and field key',
    perField: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.toggle': {
    label:
      'The on/off switch of a settings field, by widget type and field key',
    perField: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.group': {
    label: 'A settings section heading, by widget type and group id',
    perField: true,
    panel: true,
    requires: 'settings-open',
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
  'sidebar.plcs': { label: 'My Teams item in the menu', panel: true },

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

  'board.whole': { label: 'The whole board, for opening and closing steps' },
  'board-actions.zoom': { label: 'Zoom level button' },
  'board-actions.zoom-reset': { label: 'Reset zoom button' },
  'board-actions.help': { label: 'Help button' },

  'boards.share-board': {
    label: 'Share button on a board card',
    panel: true,
  },
  'boards.sub-share-copy-link': {
    label: 'Copy link button on an active sub share',
    panel: true,
  },
  'share-link.share-with-sub': {
    label: 'Share with a sub option in the share dialog',
    panel: true,
  },
  'sub-share.building': {
    label: 'Building picker in the sub share dialog',
    panel: true,
  },
  'sub-share.email-input': {
    label: 'Sub email box in the sub share dialog',
    panel: true,
  },
  'sub-share.add-email': {
    label: 'Add sub button in the sub share dialog',
    panel: true,
  },
  'sub-share.save': {
    label: 'Share button that creates or updates the sub share',
    persists: true,
    destructive: true,
    panel: true,
  },
  'sub-share.done': {
    label: 'Done button after the sub share is saved',
    panel: true,
  },

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
  'profile.tab-connected-apps': {
    label: 'Connected apps tab in Profile & Settings',
    panel: true,
  },
  'profile.buildings': {
    label: 'Building choices in the Profile tab',
    persists: true,
    panel: true,
  },
  'profile.reset-grades': {
    label: 'Reset grades to building default',
    persists: true,
    panel: true,
  },
  'profile.grades': {
    label: 'Grade choices in the Profile tab',
    persists: true,
    panel: true,
  },
  'profile.subjects': {
    label: 'Content area choices in the Profile tab',
    persists: true,
    panel: true,
  },
  'appearance.font-toggle': { label: 'Change font button', panel: true },
  'appearance.font-selector': { label: 'Font picker', panel: true },
  'appearance.font-list': {
    label: 'Font choices in the font picker',
    persists: true,
    panel: true,
  },
  'appearance.transparency-slider': {
    label: 'Window transparency slider',
    persists: true,
    panel: true,
  },
  'appearance.corners': {
    label: 'Window corner style choices',
    persists: true,
    panel: true,
  },
  'appearance.primary-color': {
    label: 'Primary color picker',
    persists: true,
    panel: true,
  },
  'appearance.accent-color': {
    label: 'Accent color picker',
    persists: true,
    panel: true,
  },
  'appearance.title-color': {
    label: 'Window title color picker',
    persists: true,
    panel: true,
  },
  'appearance.reset-all-colors': {
    label: 'Reset all colors to default',
    panel: true,
    destructive: true,
  },
  'dock.position': {
    label: 'Dock position choices',
    persists: true,
    panel: true,
  },
  'dock.transparency-slider': {
    label: 'Dock transparency slider',
    persists: true,
    panel: true,
  },
  'dock.corners': {
    label: 'Dock corner style choices',
    persists: true,
    panel: true,
  },
  'dock.text-color': {
    label: 'Dock text color picker',
    persists: true,
    panel: true,
  },
  'dock.text-shadow-toggle': {
    label: 'Dock text shadow button',
    persists: true,
    panel: true,
  },
  'behavior.close-warning-toggle': {
    label: 'Disable close warning switch',
    persists: true,
    panel: true,
  },
  'behavior.remote-control-toggle': {
    label: 'Remote control switch',
    persists: true,
    panel: true,
  },
  'language.options': {
    label: 'Language choices',
    persists: true,
    panel: true,
  },
  'widget-defaults.clear-type': {
    label: "Clear a widget's saved defaults",
    perWidgetType: true,
    panel: true,
    destructive: true,
  },
  'widget-defaults.remove-key': {
    label: 'Remove one saved widget default',
    perField: true,
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
    persists: true,
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
    persists: true,
    panel: true,
  },
  'plc-edit.cancel': {
    label: 'Cancel button in the PLC edit modal',
    panel: true,
  },
  'plc-edit.save': {
    label: 'Save/Create button in the PLC edit modal',
    persists: true,
    panel: true,
  },
  'connected-apps.google-tasks-sync': {
    label: 'Google Tasks sync switch in Connected apps',
    persists: true,
    panel: true,
  },
  'plc-notes.action-text': {
    label: 'New action item text box in PLC notes',
    panel: true,
  },
  'plc-notes.add-action': {
    label: 'Add action item button in PLC notes',
    panel: true,
  },
  'plc-notes.show-actions': {
    label: 'Show action items button in PLC notes',
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
    persists: true,
    perWidget: true,
  },
  'activity-wall.moderate': {
    label: 'Moderate posts button in Activity Wall',
    perWidget: true,
  },
  'activity-wall.share': {
    label: 'Share button in Activity Wall',
    persists: true,
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
  'random.mode': {
    label: 'Mode button in Random Picker (Pick One, Shuffle, Groups, Jigsaw)',
    perWidget: true,
  },
  'random.group-size': {
    label: 'Group size stepper (minus and plus) in Random Picker Groups mode',
    perWidget: true,
  },
  'random.class-context': {
    label: 'Active class button in the Randomizer header',
    perWidget: true,
  },
  'random.mark-absent': {
    label: 'Mark absent students item in the Randomizer class menu',
    panel: true,
  },
  'random.reset': {
    label: 'Reset student pool button in Random Picker',
    perWidget: true,
    destructive: true,
  },
  'random.group-color': {
    label: 'Color button on a Randomizer group header, by group number',
    perField: true,
  },
  'random.group-color-swatch': {
    label:
      'Swatch in the Randomizer group color picker, by color (e.g. indigo-500)',
    perField: true,
    panel: true,
  },
  'schedule.start-timer': {
    label:
      'Start timer button on a Schedule row, by row (active = the Now row)',
    perField: true,
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
  'arts-letters-agenda.reset-checks': {
    label: 'Reset checks button in Arts & Letters Agenda',
    perWidget: true,
    destructive: true,
  },
  'checklist.remove-completed': {
    label: 'Remove completed items button in Checklist',
    perWidget: true,
    destructive: true,
  },
  'quiz.start': {
    label: 'Start quiz session button in Quiz',
    persists: true,
    perWidget: true,
  },
  'quiz.next-question': {
    label: 'Next/Finish question button in Quiz',
    persists: true,
    perWidget: true,
  },
  'quiz.pause-resume': {
    label: 'Pause or resume button in the Quiz monitor',
    persists: true,
    perWidget: true,
  },
  'quiz.end-quiz': {
    label: 'Close all button in the Quiz monitor',
    perWidget: true,
    destructive: true,
  },
  'quiz.more-actions': {
    label: 'More actions button in the Quiz monitor',
    perWidget: true,
  },
  'quiz.reveal-answer': {
    label: 'Reveal/hide answer to class item in the Quiz monitor menu',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'quiz.personal-targets': {
    label: 'My learning targets button in the Quiz library',
    perWidget: true,
  },
  'quiz.select-mode': {
    label: 'Select mode toggle in the Quiz library',
    perWidget: true,
  },
  'assign-destination.spartboard': {
    label: 'SpartBoard Only option in the Assign quiz dialog',
    panel: true,
  },
  'assign-destination.classroom': {
    label: 'Google Classroom option in the Assign quiz dialog',
    panel: true,
  },
  'assign-destination.schoology': {
    label: 'Schoology option in the Assign quiz dialog',
    panel: true,
  },
  'assign-step.classes': {
    label: 'Classes step header in the Assign dialog',
    panel: true,
  },
  'assign-step.when': {
    label: 'When step header in the Assign dialog',
    panel: true,
  },
  'assign-step.attempts': {
    label: 'Attempts step header in the Assign dialog',
    panel: true,
  },
  'assign-step.integrity': {
    label: 'Integrity step header in the Assign dialog',
    panel: true,
  },
  'assign-step.feedback': {
    label: 'Feedback step header in the Assign dialog',
    panel: true,
  },
  'assign-step.check': {
    label: 'Check step header in the Assign dialog',
    panel: true,
  },
  'assign-step.sharing': {
    label: 'Sharing step header in the Assign dialog',
    panel: true,
  },
  'assign-step.continue': {
    label: 'Continue button on the open step in the Assign dialog',
    panel: true,
  },
  'assign-stepper.cancel': {
    label: 'Cancel button in the Assign dialog',
    panel: true,
  },
  'assign-stepper.submit': {
    label: 'Assign button at the bottom of the Assign dialog',
    persists: true,
    panel: true,
  },
  'review-start.mode-paced': {
    label: 'Teacher-paced card in the Start review dialog',
    panel: true,
  },
  'review-start.mode-game': {
    label: 'Self-paced game card in the Start review dialog',
    panel: true,
  },
  'review-start.game-length': {
    label: 'Game length row in the Start review dialog',
    panel: true,
  },
  'review-start.auto-advance': {
    label: 'Advance automatically toggle in the Start review dialog',
    panel: true,
  },
  'review-start.rank-limit': {
    label: 'Leaderboard on board picker in the Start review dialog',
    panel: true,
  },
  'review-start.confirm': {
    label: 'Start button in the Start review dialog',
    persists: true,
    panel: true,
  },
  'review-game.board': {
    label: 'Game board in the Review monitor',
    perWidget: true,
  },
  'review-game.start': {
    label: 'Start game button in the Review monitor',
    persists: true,
    perWidget: true,
  },
  'review-game.pause': {
    label: 'Pause or resume game button in the Review monitor',
    persists: true,
    perWidget: true,
  },
  'review-game.add-minute': {
    label: 'Add a minute button in the Review monitor',
    persists: true,
    perWidget: true,
  },
  'review-game.names': {
    label: 'Names on or off button in the Review monitor',
    persists: true,
    perWidget: true,
  },
  'editor.title': {
    label: 'Title box in an editor dialog',
    perWidgetType: true,
    panel: true,
  },
  'editor.close': {
    label: 'Close or Cancel button in an editor dialog footer',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.add-question': {
    label: 'Add question button in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.add-menu': {
    label: 'More ways to add arrow in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.prompt': {
    label: 'Question prompt box in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.type': {
    label: 'Question type list in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.option': {
    label: 'Answer option box in the Quiz editor, by letter',
    perField: true,
    panel: true,
  },
  'quiz-editor.correct': {
    label: 'Mark-correct button beside an answer option, by letter',
    perField: true,
    panel: true,
  },
  'quiz-settings.widget-label': {
    label: 'Widget label input in Quiz settings',
    perWidget: true,
    panel: true,
  },
  'quiz-settings.assignment-archive': {
    label: 'Assignment archive button in Quiz settings',
    perWidget: true,
    panel: true,
  },
  'quiz-settings.manager-view': {
    label: 'Manager view button in Quiz settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.blooms.category': {
    label: 'Category checkboxes in Blooms Taxonomy settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.calendar.building-sync': {
    label: 'Building sync toggle in Calendar settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.calendar.instructions': {
    label: 'Instructions help button in Calendar settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.calendar.connect-google': {
    label: 'Connect Google button in Calendar settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.calendar.add-calendar': {
    label: 'Add calendar button in Calendar settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.checklist.paste': {
    label: 'Add pasted tasks button in Checklist settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.checklist.import-routine': {
    label: 'Import routine button in Checklist settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.checklist.import-text': {
    label: 'Import text button in Checklist settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.concept-web.clear-all': {
    label: 'Clear all button in Concept Web settings',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.custom-widget.save-settings': {
    label: 'Save settings button in Custom Widget settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.expectations.sound-sync': {
    label: 'Sync with Sound widget toggle in Expectations settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.graphic-organizer.template': {
    label: 'Template selector in Graphic Organizer settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.guided-learning.library': {
    label: 'Go to library button in Guided Learning settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.hotspot-image.upload': {
    label: 'Upload/replace image button in Hotspot Image settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.hotspot-image.save-library': {
    label: 'Save to library button in Hotspot Image settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.instructional-routines.switch-routine': {
    label: 'Switch routine button in Instructional Routines settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.materials.title': {
    label: 'Title input in Materials settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.materials.add-material': {
    label: 'Add material button in Materials settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.materials.toggle-all': {
    label: 'Select/deselect all button in Materials settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.materials.show-hidden': {
    label: 'Show hidden materials button in Materials settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.music.sync-time-tool': {
    label: 'Sync with Time Tool toggle in Music settings',
    perWidget: true,
    panel: true,
  },
  'scoreboard.add-point': {
    label: 'Add a point for a team in Scoreboard',
    perField: true,
  },
  'scoreboard.remove-point': {
    label: 'Remove a point for a team in Scoreboard',
    perField: true,
  },
  'widget-settings.pdf.switch-document': {
    label: 'Switch document button in PDF settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.projects.library': {
    label: 'Go to library button in Projects settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.qr.url': {
    label: 'Destination URL input in QR settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.qr.sync-text': {
    label: 'Sync with Text widget toggle in QR settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.recess-gear.linked-weather': {
    label: 'Linked Weather widget select in Recess Gear settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.import-roster': {
    label: 'Import from roster button in Poll settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.ai-draft': {
    label: 'AI draft section in Poll settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.delete-question': {
    label: 'Delete question button in Poll settings',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.poll.add-question': {
    label: 'Add question button in Poll settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.select-question': {
    label: 'Question chip list in Poll settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.question-text': {
    label: 'Question text input in Poll settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.add-option': {
    label: 'Add option button in Poll settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.reset': {
    label: 'Reset poll button in Poll settings',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.poll.export-csv': {
    label: 'Export CSV button in Poll settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.copy-link': {
    label: 'Copy link button in Poll settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.stop-voting': {
    label: 'Stop voting button in Poll settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.start-voting': {
    label: 'Start voting button in Poll settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.resume': {
    label: 'Resume voting button in Poll settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.poll.start-fresh': {
    label: 'Start fresh button in Poll settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.reveal-grid.save-drive': {
    label: 'Save to Drive button in Reveal Grid settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.reveal-grid.share': {
    label: 'Share URL button in Reveal Grid settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.reveal-grid.load-set': {
    label: 'Load existing set select in Reveal Grid settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.reveal-grid.paste': {
    label: 'Paste from sheet button in Reveal Grid settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.reveal-grid.upload-csv': {
    label: 'Upload CSV button in Reveal Grid settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.reveal-grid.generator': {
    label: 'Generator button in Reveal Grid settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.reveal-grid.add-pasted': {
    label: 'Add pasted cards button in Reveal Grid settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.reveal-grid.add-card': {
    label: 'Add card button in Reveal Grid settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.import-calendar': {
    label: "Import today's events button in Schedule settings",
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.add-schedule': {
    label: 'Add schedule button in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.select-schedule': {
    label: 'Schedule tab list in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.schedule-name': {
    label: 'Schedule name input in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.new-schedule': {
    label: 'New schedule button in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.delete-schedule': {
    label: 'Delete schedule button in Schedule settings',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.schedule.select-day': {
    label: 'Day picker in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.sort-events': {
    label: 'Sort events button in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.add-event': {
    label: 'Add event button in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.add-event-today': {
    label: 'Add today-only event button in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.schedule.building-schedules': {
    label: 'Building schedules toggle in Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.scoreboard.layout': {
    label: 'Layout choice in Scoreboard settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.scoreboard.import-random-groups': {
    label: 'Import random groups button in Scoreboard settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.scoreboard.use-group-names': {
    label: 'Use group names checkbox in Scoreboard settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.scoreboard.import-class-groups': {
    label: 'Import class groups button in Scoreboard settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.scoreboard.resync-members': {
    label: 'Resync members button in Scoreboard settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.scoreboard.add-team': {
    label: 'Add team button in Scoreboard settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.scoreboard.reset-scores': {
    label: 'Reset all scores button in Scoreboard settings',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.seating-chart.clear-assignments': {
    label: 'Clear assignments button in Seating Chart settings',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.seating-chart.clear-furniture': {
    label: 'Clear furniture button in Seating Chart settings',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.specialist-schedule.cancel-edit': {
    label: 'Cancel edit button in Specialist Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.specialist-schedule.activity-input': {
    label: 'Activity text input in Specialist Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.specialist-schedule.start-time': {
    label: 'Start time input in Specialist Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.specialist-schedule.end-time': {
    label: 'End time input in Specialist Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.specialist-schedule.save-item': {
    label: 'Save item button in Specialist Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.specialist-schedule.add-item': {
    label: 'Add item button in Specialist Schedule settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.starter-pack.pack-name': {
    label: 'Pack name input in Starter Pack settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.starter-pack.save-personal': {
    label: 'Save personal pack button in Starter Pack settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.starter-pack.save-global': {
    label: 'Save global pack button in Starter Pack settings',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'widget-settings.stations.add-station': {
    label: 'Add station button in Stations settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.stations.import-class-groups': {
    label: 'Import class groups button in Stations settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.syntax-framer.content': {
    label: 'Content textarea in Syntax Framer settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.time-tool.mode': {
    label: 'Timer/stopwatch mode picker in Time Tool settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.time-tool.voice-level': {
    label: 'Voice level picker in Time Tool settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.time-tool.traffic-color': {
    label: 'Traffic color picker in Time Tool settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.weather.show-feels-like': {
    label: 'Show feels-like toggle in Weather settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.weather.sync-station': {
    label: 'Sync station button in Weather settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.weather.sync-city': {
    label: 'Sync city button in Weather settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.random.group-count': {
    label: 'Group count slider in Random Picker settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.random.import-class': {
    label: 'Import class button in Random Picker settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.random.clear-names': {
    label: 'Clear names button in Random Picker settings',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.random.send-stations': {
    label: 'Send to Stations button in Random Picker settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.random.send-projects': {
    label: 'Send to Projects button in Random Picker settings',
    perWidget: true,
    panel: true,
  },
  'annotate.pen-color': {
    label: 'Pen color preset swatch in the pen color picker',
    perField: true,
    panel: true,
  },
  'roster-editor.name': {
    label: 'Class name input in the roster editor',
    panel: true,
  },
  'roster-editor.add-student': {
    label: 'Add Student button in the roster editor',
    panel: true,
  },
  'roster-editor.save': {
    label: 'Save button in the roster editor',
    persists: true,
    panel: true,
  },
  'roster-editor.row': {
    label: 'A student row in the roster editor',
    perField: true,
    panel: true,
  },
  'roster-editor.remove-student': {
    label: 'Remove student button on a roster editor row',
    perField: true,
    panel: true,
    destructive: true,
  },
  'classlink-import.class-row': {
    label: 'A ClassLink class row in the ClassLink import dialog',
    perField: true,
    panel: true,
  },
  'classlink-import.import': {
    label: 'Import/Merge button on a ClassLink class row',
    persists: true,
    perField: true,
    panel: true,
  },
  'schoology-link.section-row': {
    label: 'A Schoology section row in the Link Schoology dialog',
    perField: true,
    panel: true,
  },
  'schoology-link.link': {
    label: 'Link button on a Schoology section row',
    persists: true,
    perField: true,
    panel: true,
  },
  'schoology-link.cancel': {
    label: 'Done/close button in the Link Schoology dialog',
    panel: true,
  },
  'widget-settings.poll.delete-option': {
    label: 'Delete an option in Poll settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.reveal-grid.toggle-card': {
    label: 'Expand/collapse a card row in Reveal Grid settings',
    perField: true,
    panel: true,
  },
  'widget-settings.reveal-grid.delete-card': {
    label: 'Delete a card in Reveal Grid settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.reveal-grid.front': {
    label: 'Front content input for a card in Reveal Grid settings',
    perField: true,
    panel: true,
  },
  'widget-settings.reveal-grid.back': {
    label: 'Back content input for a card in Reveal Grid settings',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.copy-building-schedule': {
    label: 'Copy a building schedule to my schedules in Schedule settings',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.delete-event': {
    label: 'Delete an event row in Schedule settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.scoreboard.team-name': {
    label: 'Team name input in Scoreboard settings',
    perField: true,
    panel: true,
  },
  'widget-settings.scoreboard.delete-team': {
    label: 'Delete a team in Scoreboard settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.specialist-schedule.select-activity': {
    label: 'Preset activity chip in Specialist Schedule settings',
    perField: true,
    panel: true,
  },
  'widget-settings.specialist-schedule.select-cycle-day': {
    label: 'Cycle day picker button in Specialist Schedule settings',
    perField: true,
    panel: true,
  },
  'widget-settings.specialist-schedule.edit-item': {
    label: 'Edit an item row in Specialist Schedule settings',
    perField: true,
    panel: true,
  },
  'widget-settings.specialist-schedule.delete-item': {
    label: 'Delete an item row in Specialist Schedule settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.stations.move-up': {
    label: 'Move a station up in Stations settings',
    perField: true,
    panel: true,
  },
  'widget-settings.stations.move-down': {
    label: 'Move a station down in Stations settings',
    perField: true,
    panel: true,
  },
  'widget-settings.stations.edit-station': {
    label: 'Expand/collapse a station editor in Stations settings',
    perField: true,
    panel: true,
  },
  'widget-settings.stations.delete-station': {
    label: 'Delete a station in Stations settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.stations.load-preset': {
    label: 'Load a saved station preset in Stations settings',
    perField: true,
    panel: true,
  },
  'widget-settings.stations.toggle-lock-group': {
    label: 'Keep a class group together checkbox in Stations settings',
    perField: true,
    panel: true,
  },
  'widget-settings.soundboard.toggle-sound': {
    label: 'Toggle a sound on or off in Soundboard settings',
    perField: true,
    panel: true,
  },
  'activity-wall-editor.layout-picker': {
    label: 'Layout picker in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.submission-types': {
    label: 'Submission types group in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.appearance': {
    label: 'Appearance picker in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.moderation': {
    label: 'Require moderation toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.guests': {
    label: 'Allow guests toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.show-names': {
    label: 'Show names toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.student-view': {
    label: 'Students can see posts toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.likes': {
    label: 'Allow likes toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.comments': {
    label: 'Allow comments toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.replies': {
    label: 'Allow comment replies toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.max-posts': {
    label: 'Max posts per student group in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.allow-edit': {
    label: 'Students may edit their posts toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.allow-delete': {
    label: 'Students may delete their posts toggle in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.save': {
    label: 'Save wall button in the Activity Wall editor',
    persists: true,
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.cancel': {
    label: 'Cancel button in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'library-shell.new': {
    label: 'Primary create/import button in a library shell header',
    perWidgetType: true,
  },
  'library-shell.secondary-action': {
    label: 'Secondary header action button in a library shell',
    perField: true,
  },
  'library-shell.search': {
    label: 'Search box in a library toolbar',
    perWidgetType: true,
  },
  'library-shell.sort': {
    label: 'Sort dropdown trigger in a library toolbar',
    perWidgetType: true,
  },
  'library-shell.filter': {
    label: 'Filter dropdown in a library toolbar',
    perField: true,
  },
  'library-shell.card-open': {
    label: 'Library item card body (open)',
    perField: true,
  },
  'library-shell.card-primary-action': {
    label: 'Primary action button on a library item card',
    persists: true,
    perField: true,
  },
  'library-shell.card-secondary-action': {
    label: 'Secondary primary action button on a library item card',
    persists: true,
    perField: true,
  },
  'library-shell.card-icon-action': {
    label: 'Icon-only quick action button on a library item card',
    persists: true,
    perField: true,
  },
  'library-shell.card-menu': {
    label: 'Kebab menu button on a library item card',
    perField: true,
  },
  'library-shell.card-menu-item': {
    label: 'Item inside a library item card kebab menu',
    persists: true,
    perField: true,
    panel: true,
  },
  'library-shell.archive-primary-action': {
    label: 'Primary action button on an assignment archive row',
    persists: true,
    perField: true,
  },
  'library-shell.archive-menu': {
    label: 'Kebab menu button on an assignment archive row',
    perField: true,
  },
  'library-shell.archive-menu-item': {
    label: 'Item inside an assignment archive row kebab menu',
    persists: true,
    perField: true,
    panel: true,
  },
  'widget-settings.calendar.remove-calendar': {
    label: 'Remove a personal calendar in Calendar settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.hotspot-image.load-library-item': {
    label: 'Load a saved hotspot set from the library',
    perField: true,
    panel: true,
  },
  'widget-settings.hotspot-image.delete-library-item': {
    label: 'Delete a saved hotspot set from the library',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.hotspot-image.delete-hotspot': {
    label: 'Delete a hotspot pin in Hotspot Image settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.hotspot-image.pin-title': {
    label: 'Pin title input for a hotspot in Hotspot Image settings',
    perField: true,
    panel: true,
  },
  'widget-settings.hotspot-image.detail-text': {
    label: 'Detail text input for a hotspot in Hotspot Image settings',
    perField: true,
    panel: true,
  },
  'widget-settings.hotspot-image.icon': {
    label: 'Icon radio group for a hotspot in Hotspot Image settings',
    perField: true,
    panel: true,
  },
  'widget-settings.materials.title-font': {
    label: 'Title font option in Materials settings',
    perField: true,
    panel: true,
  },
  'widget-settings.materials.select-item': {
    label: 'Select a material in Materials settings',
    perField: true,
    panel: true,
  },
  'widget-settings.materials.edit-item': {
    label: 'Edit a teacher-created material in Materials settings',
    perField: true,
    panel: true,
  },
  'widget-settings.materials.hide-item': {
    label: 'Hide a material in Materials settings',
    perField: true,
    panel: true,
  },
  'widget-settings.materials.unhide-item': {
    label: 'Show a hidden material again in Materials settings',
    perField: true,
    panel: true,
  },
  'widget-settings.music.source': {
    label: 'Source option (curated or Spotify) in Music settings',
    perField: true,
    panel: true,
  },
  'widget-settings.music.station': {
    label: 'Station choice in Music settings',
    perField: true,
    panel: true,
  },
  'widget-settings.custom-widget.definition-input': {
    label: 'One admin-defined setting input in Custom Widget settings',
    perField: true,
    panel: true,
  },
  'widget-settings.random.locked-group': {
    label: 'Locked-group checkbox in Random Picker settings',
    perField: true,
    panel: true,
  },
  'classes.set-active': {
    label: 'Set active class star in My Classes',
    persists: true,
    perField: true,
    panel: true,
  },
  'classes.edit-roster': {
    label: 'Edit class button in My Classes',
    perField: true,
    panel: true,
  },
  'classes.sync-classlink': {
    label: 'Sync with ClassLink button in My Classes',
    persists: true,
    perField: true,
    panel: true,
  },
  'classes.link-classroom': {
    label: 'Link to Google Classroom button in My Classes',
    perField: true,
    panel: true,
  },
  'classes.delete-roster': {
    label: 'Delete class button in My Classes',
    perField: true,
    panel: true,
    destructive: true,
  },
  'classes.classroom-course-row': {
    label: 'Course row in the Link to Google Classroom modal',
    perField: true,
    panel: true,
  },
  'plcs.open-plc': {
    label: 'Open a PLC card in My PLCs',
    perField: true,
    panel: true,
  },
  'plcs.actions-menu': {
    label: 'PLC actions kebab in My PLCs',
    perField: true,
    panel: true,
  },
  'plcs.edit-plc': {
    label: 'Edit/View PLC action in the PLC actions menu',
    perField: true,
    panel: true,
  },
  'plcs.delete-plc': {
    label: 'Delete PLC action in the PLC actions menu',
    perField: true,
    panel: true,
    destructive: true,
  },
  'plcs.leave-plc': {
    label: 'Leave PLC action in the PLC actions menu',
    perField: true,
    panel: true,
    destructive: true,
  },
  'plc-edit.remove-member': {
    label: 'Remove member button in the PLC edit modal',
    perField: true,
    panel: true,
    destructive: true,
  },
  'plc-edit.revoke-invite': {
    label: 'Revoke invite button in the PLC edit modal',
    perField: true,
    panel: true,
    destructive: true,
  },
  'plc-invites.accept': {
    label: 'Accept button in the PLC invites modal',
    persists: true,
    perField: true,
    panel: true,
  },
  'plc-invites.decline': {
    label: 'Decline button in the PLC invites modal',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget.close-confirm.cancel': {
    label: 'Cancel button in the close-widget confirm',
    perWidget: true,
    panel: true,
  },
  'widget.close-confirm.confirm': {
    label: 'Close button in the close-widget confirm',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget.annotate-toolbar.eraser': {
    label: 'Eraser button in the widget annotate toolbar',
    perWidget: true,
    panel: true,
  },
  'widget.annotate-toolbar.undo': {
    label: 'Undo button in the widget annotate toolbar',
    perWidget: true,
    panel: true,
  },
  'widget.annotate-toolbar.clear-all': {
    label: 'Clear all button in the widget annotate toolbar',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'widget.annotate-toolbar.done': {
    label: 'Done button in the widget annotate toolbar',
    perWidget: true,
    panel: true,
  },
  'widget.max-menu.screenshot': {
    label: 'Screenshot button in the maximized widget menu',
    perWidget: true,
    panel: true,
  },
  'widget.max-menu.annotate': {
    label: 'Annotate button in the maximized widget menu',
    perWidget: true,
    panel: true,
  },
  'widget.max-menu.record': {
    label: 'Record screen button in the maximized widget menu',
    perWidget: true,
    panel: true,
  },
  'widget.title-input': { label: 'Widget title rename input', perWidget: true },
  'widget.screenshot': {
    label: 'Screenshot button in the widget toolbar',
    perWidget: true,
  },
  'widget.ungroup': {
    label: 'Ungroup button in the widget toolbar',
    perWidget: true,
  },
  'widget.group-with': {
    label: 'Group with button in the widget toolbar',
    perWidget: true,
  },
  'widget.snap-layout.option': {
    label: 'Snap zone option in the widget snap layout popover',
    perField: true,
    panel: true,
  },
  'widget.snap-layout.custom-grid': {
    label: 'Custom-size drag grid in the widget snap layout popover',
    perWidget: true,
    panel: true,
  },
  'widget.maximize': {
    label: 'Maximize/restore button in the widget toolbar',
    perWidget: true,
  },
  'widget.minimize': {
    label: 'Minimize button in the widget toolbar',
    perWidget: true,
  },
  'modal.close': { label: 'Close button in a dialog header', panel: true },
  'library-shell.tab': {
    label: 'Tab in a library shell header',
    perField: true,
    panel: true,
  },
  'library-shell.new-menu-item': {
    label: 'Item in the library shell primary button menu',
    perField: true,
    panel: true,
  },
  'settings.help-menu.show-live': {
    label: 'Show me live in the widget help menu',
    perWidget: true,
    panel: true,
  },
  'settings.help-menu.open-guides': {
    label: 'Open guides in the widget help menu',
    perWidget: true,
    panel: true,
  },
  'help-center.search': { label: 'Search box in the Help Center', panel: true },
  'help-center.close': {
    label: 'Close button in the Help Center',
    panel: true,
  },
  'help-center.tab': {
    label: 'Shortcuts/Guides tab in the Help Center',
    perField: true,
    panel: true,
  },
  'help-center.tab-select': {
    label: 'Mobile tab select in the Help Center',
    panel: true,
  },
  'help-center.guides.category': {
    label: 'Category button in the Guides tab',
    perField: true,
    panel: true,
  },
  'help-center.guides.category-select': {
    label: 'Category select (mobile) in the Guides tab',
    panel: true,
  },
  'help-center.guides.kind-filter': {
    label: 'Kind filter chip in the Guides tab',
    perField: true,
    panel: true,
  },
  'help-center.guides.clear-widget-filter': {
    label: 'Clear widget filter button in the Guides tab',
    panel: true,
  },
  'help-center.guides.item': {
    label: 'Guide card in the Guides tab',
    perField: true,
    panel: true,
  },
  'help-center.shortcuts.gestures': {
    label: 'Touchscreen gestures heading in the Shortcuts tab',
    panel: true,
  },
  'help-center.viewer.show-live': {
    label: 'Show me live button in the resource viewer',
    panel: true,
  },
  'help-center.viewer.back': {
    label: 'Back button in the resource viewer',
    panel: true,
  },
  'help-center.viewer.fullscreen': {
    label: 'Fullscreen toggle button in the resource viewer',
    panel: true,
  },
  // Admin Settings (thread: tour anchors admin settings)
  'admin.settings.tab': {
    label: 'Section tab in Admin Settings',
    perField: true,
    panel: true,
  },
  'admin.settings.mobile-back': {
    label: 'Back to menu button in Admin Settings (phone)',
    panel: true,
  },
  'admin.settings.close': {
    label: 'Close button in Admin Settings',
    panel: true,
  },
  'admin.help-center.add-item': {
    label: 'Add item button in Help Center admin',
    panel: true,
  },
  'admin.help-center.sort-by-opens': {
    label: 'Sort by opens button in Help Center admin',
    panel: true,
  },
  'admin.help-center.item-toggle': {
    label: 'Visible switch on a Help Center admin item',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.help-center.item-edit': {
    label: 'Edit button on a Help Center admin item',
    perField: true,
    panel: true,
  },
  'admin.help-center.item-delete': {
    label: 'Delete button on a Help Center admin item',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.help-center.category-toggle': {
    label: 'Category collapse button in Help Center admin',
    perField: true,
    panel: true,
  },
  'admin.help-center.category-name': {
    label: 'New category name box in Help Center admin',
    panel: true,
  },
  'admin.help-center.category-add': {
    label: 'Add category button in Help Center admin',
    persists: true,
    panel: true,
  },
  'admin.help-center.category-delete': {
    label: 'Delete button on a Help Center admin category',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.help-center.tour-health-toggle': {
    label: 'Tour health section button in Help Center admin',
    panel: true,
  },
  'admin.help-center.record-tour': {
    label: 'Record tour button in Help Center admin',
    panel: true,
  },
  'admin.help-center.check-live': {
    label: 'Check live button in Help Center admin',
    panel: true,
  },
  'admin.help-center.edit-step': {
    label: 'Edit step button in the tour health table',
    perField: true,
    panel: true,
  },
  'admin.help-center.unmapped-copy': {
    label: 'Copy all button for unmapped anchors',
    panel: true,
  },
  'admin.help-center.unmapped-rebind': {
    label: 'Rebind button for an unmapped anchor',
    persists: true,
    panel: true,
  },
  'admin.help-center.keep-all-in-help': {
    label: 'Keep all in Help button for linked library sets',
    persists: true,
    panel: true,
  },
  'admin.help-center.keep-in-help': {
    label: 'Keep in Help button for a linked library set',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.help-center.form-visible': {
    label: 'Visible to teachers switch in the Help item form',
    persists: true,
    panel: true,
  },
  'admin.help-center.form-title': {
    label: 'Title box in the Help item form',
    panel: true,
  },
  'admin.help-center.form-category': {
    label: 'Category select in the Help item form',
    panel: true,
  },
  'admin.help-center.form-description': {
    label: 'Description box in the Help item form',
    panel: true,
  },
  'admin.help-center.form-cancel': {
    label: 'Cancel button in the Help item form',
    panel: true,
  },
  'admin.help-center.form-save': {
    label: 'Save button in the Help item form',
    persists: true,
    panel: true,
  },
  'admin.help-center.gl-open-editor': {
    label: 'Open editor button for the chosen activity',
    panel: true,
  },
  'admin.help-center.gl-change': {
    label: 'Change button for the chosen activity',
    panel: true,
  },
  'admin.help-center.gl-choose': {
    label: 'Choose activity button in the Help item form',
    panel: true,
  },
  'admin.help-center.gl-new': {
    label: 'New activity button in the Help item form',
    panel: true,
  },
  'admin.help-center.gl-search': {
    label: 'Search box in the activity menu',
    panel: true,
  },
  'admin.help-center.gl-option': {
    label: 'Activity row in the activity menu',
    perField: true,
    panel: true,
  },
  'admin.announcements.activation-type': {
    label: 'Activation type option in the announcement form',
    perField: true,
    panel: true,
  },
  'admin.announcements.auto-deactivate': {
    label: 'Auto-deactivate switch in the announcement form',
    persists: true,
    panel: true,
  },
  'admin.announcements.delete': {
    label: 'Delete button on an announcement row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.announcements.remove-cancel': {
    label: 'Cancel delete button on an announcement row',
    perField: true,
    panel: true,
  },
  'admin.announcements.delete-confirm': {
    label: 'Confirm delete button on an announcement row',
    perField: true,
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.announcements.dismissal-duration': {
    label: 'Dismissal duration field in the announcement form',
    panel: true,
  },
  'admin.announcements.dismissal-time': {
    label: 'Dismissal time field in the announcement form',
    panel: true,
  },
  'admin.announcements.dismissal-type': {
    label: 'Dismissal type option in the announcement form',
    perField: true,
    panel: true,
  },
  'admin.announcements.dismissal-unit': {
    label: 'Dismissal duration unit select in the announcement form',
    panel: true,
  },
  'admin.announcements.duplicate': {
    label: 'Duplicate button on an announcement row',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.announcements.edit': {
    label: 'Edit button on an announcement row',
    perField: true,
    panel: true,
  },
  'admin.announcements.embed-autoplay': {
    label: 'Auto-play video switch in the announcement embed editor',
    persists: true,
    panel: true,
  },
  'admin.announcements.embed-copy-url': {
    label: 'Copy embed URL button in the announcement embed editor',
    panel: true,
  },
  'admin.announcements.embed-html': {
    label: 'Custom embed code field in the announcement embed editor',
    panel: true,
  },
  'admin.announcements.embed-live-url': {
    label: 'YouTube Live URL field in the announcement embed editor',
    panel: true,
  },
  'admin.announcements.embed-record-again': {
    label: 'Record again button in the announcement embed editor',
    panel: true,
  },
  'admin.announcements.embed-start-minutes': {
    label: 'Start-at minutes field in the announcement embed editor',
    panel: true,
  },
  'admin.announcements.embed-start-recording': {
    label: 'Start screen recording button in the announcement embed editor',
    persists: true,
    panel: true,
  },
  'admin.announcements.embed-start-seconds': {
    label: 'Start-at seconds field in the announcement embed editor',
    panel: true,
  },
  'admin.announcements.embed-stop-recording': {
    label: 'Stop and upload recording button in the announcement embed editor',
    panel: true,
  },
  'admin.announcements.embed-tab': {
    label: 'Embed source tab in the announcement embed editor',
    perField: true,
    panel: true,
  },
  'admin.announcements.embed-url': {
    label: 'Embed URL field in the announcement embed editor',
    panel: true,
  },
  'admin.announcements.embed-video-upload': {
    label: 'Video upload input in the announcement embed editor',
    persists: true,
    panel: true,
  },
  'admin.announcements.end-date': {
    label: 'End date field in the announcement form',
    panel: true,
  },
  'admin.announcements.end-time': {
    label: 'End time field in the announcement form',
    panel: true,
  },
  'admin.announcements.form-cancel': {
    label: 'Cancel button on the announcement form',
    panel: true,
  },
  'admin.announcements.form-close': {
    label: 'Close button on the announcement form',
    panel: true,
  },
  'admin.announcements.form-save': {
    label: 'Save or create button on the announcement form',
    persists: true,
    panel: true,
  },
  'admin.announcements.height': {
    label: 'Height field in the announcement form',
    panel: true,
  },
  'admin.announcements.interaction-mode': {
    label: 'Interaction mode select in the announcement expectations editor',
    panel: true,
  },
  'admin.announcements.json-config': {
    label: 'Widget config JSON field in the announcement form',
    panel: true,
  },
  'admin.announcements.json-reset': {
    label: 'Reset to defaults button in the announcement JSON config editor',
    panel: true,
  },
  'admin.announcements.maximize': {
    label: 'Maximize switch in the announcement form',
    persists: true,
    panel: true,
  },
  'admin.announcements.name': {
    label: 'Announcement name field',
    panel: true,
  },
  'admin.announcements.new': {
    label: 'New announcement button in Announcements',
    panel: true,
  },
  'admin.announcements.poll-export-csv': {
    label: 'Export CSV button on the poll results panel',
    panel: true,
  },
  'admin.announcements.poll-results': {
    label: 'View poll results button on an announcement row',
    perField: true,
    panel: true,
  },
  'admin.announcements.poll-results-close': {
    label: 'Close button on the poll results panel',
    panel: true,
  },
  'admin.announcements.qr-url': {
    label: 'QR code URL field in the announcement form',
    panel: true,
  },
  'admin.announcements.section-toggle': {
    label: 'Collapsible section header in the announcement form',
    perField: true,
    panel: true,
  },
  'admin.announcements.start-date': {
    label: 'Start date field in the announcement form',
    panel: true,
  },
  'admin.announcements.start-time': {
    label: 'Start time field in the announcement form',
    panel: true,
  },
  'admin.announcements.target-add': {
    label: 'Add target user button in the announcement form',
    panel: true,
  },
  'admin.announcements.target-building': {
    label: 'Target building switch in the announcement form',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.announcements.target-email': {
    label: 'Target user email field in the announcement form',
    panel: true,
  },
  'admin.announcements.target-remove': {
    label: 'Remove target user button in the announcement form',
    destructive: true,
    panel: true,
  },
  'admin.announcements.text-bg-color': {
    label: 'Background color picker in the text announcement editor',
    panel: true,
  },
  'admin.announcements.text-content': {
    label: 'Message content field in the text announcement editor',
    panel: true,
  },
  'admin.announcements.text-font-size': {
    label: 'Font size field in the text announcement editor',
    panel: true,
  },
  'admin.announcements.toggle-active': {
    label: 'Activate or deactivate button on an announcement row',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.announcements.voice-level': {
    label: 'Voice level button in the announcement expectations editor',
    perField: true,
    panel: true,
  },
  'admin.announcements.widget-type': {
    label: 'Widget type select in the announcement form',
    panel: true,
  },
  'admin.announcements.width': {
    label: 'Width field in the announcement form',
    panel: true,
  },
  'admin.announcements.work-mode': {
    label: 'Work mode select in the announcement expectations editor',
    panel: true,
  },
  'admin.backgrounds.access-level': {
    label: 'Access level button on a background',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.active-toggle': {
    label: 'Active switch on a background',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.beta-user-add': {
    label: 'Add beta user button on a background',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.beta-user-input': {
    label: 'Beta user email field on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.beta-user-remove': {
    label: 'Remove beta user button on a background',
    perField: true,
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.building-toggle': {
    label: 'Building assignment button on a background',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.category-cancel': {
    label: 'Cancel category button on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.category-edit': {
    label: 'Edit category button on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.category-input': {
    label: 'Category field on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.category-name-input': {
    label: 'New category name field in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.category-note': {
    label: 'Note category button in Backgrounds',
    persists: true,
    panel: true,
  },
  'admin.backgrounds.category-save': {
    label: 'Save category button on a background',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.delete-preset': {
    label: 'Delete button on a background',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.backgrounds.drive-picker-close': {
    label: 'Close button in the Google Drive picker',
    panel: true,
  },
  'admin.backgrounds.drive-picker-file': {
    label: 'Image option in the Google Drive picker',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.featured-toggle': {
    label: 'Featured star button on a background',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.filter-active': {
    label: 'Active filter button in Backgrounds',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.filter-availability': {
    label: 'Availability filter button in Backgrounds',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.filter-building': {
    label: 'Building filter button in Backgrounds',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.filter-category': {
    label: 'Category filter button in Backgrounds',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.filters-toggle': {
    label: 'Mobile filters toggle in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.google-drive': {
    label: 'Google Drive button in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.manage-categories': {
    label: 'Manage categories button in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.media-type': {
    label: 'Media type button in Backgrounds',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.rename-cancel': {
    label: 'Cancel rename button on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.rename-edit': {
    label: 'Rename button on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.rename-input': {
    label: 'Rename field on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.rename-save': {
    label: 'Save name button on a background',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.restore-defaults': {
    label: 'Restore defaults button in Backgrounds',
    persists: true,
    panel: true,
  },
  'admin.backgrounds.stock-load-more': {
    label: 'Load more button in the stock photo picker',
    panel: true,
  },
  'admin.backgrounds.stock-photo': {
    label: 'Stock photo result in the stock photo picker',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.backgrounds.stock-photos': {
    label: 'Stock photos button in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.stock-search': {
    label: 'Stock photo search field in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.tag-input': {
    label: 'Tag field on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.tag-remove': {
    label: 'Remove tag button on a background',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.backgrounds.tag-suggestion': {
    label: 'Suggested tag button on a background',
    perField: true,
    panel: true,
  },
  'admin.backgrounds.upload': {
    label: 'Upload new button in Backgrounds',
    persists: true,
    panel: true,
  },
  'admin.backgrounds.upload-input': {
    label: 'File upload input in Backgrounds',
    persists: true,
    panel: true,
  },
  'admin.backgrounds.view-grid': {
    label: 'Grid view button in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.view-list': {
    label: 'List view button in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.youtube-add': {
    label: 'Add video button in Backgrounds',
    persists: true,
    panel: true,
  },
  'admin.backgrounds.youtube-label': {
    label: 'YouTube video label field in Backgrounds',
    panel: true,
  },
  'admin.backgrounds.youtube-url': {
    label: 'YouTube URL field in Backgrounds',
    panel: true,
  },
} as const satisfies Record<string, TourAnchorDef>;

export type TourAnchorId = keyof typeof TOUR_ANCHORS;

/** Opening and closing steps of a tour-mode set observe the board itself. */
export const WHOLE_BOARD_ANCHOR: TourAnchorId = 'board.whole';

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
  fieldKey && widgetType
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

/** Whether a step's anchor ref points at an anchor registered as persists. */
export const isPersistsAnchor = (ref: string): boolean => {
  const { id } = parseTourAnchorRef(ref);
  if (!isTourAnchorId(id)) return false;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  return !!def.persists;
};
