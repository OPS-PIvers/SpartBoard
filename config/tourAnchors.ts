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
  // Teams pages: Notes & Docs, Updates, shell, building, mentoring, data, department and admin defaults.
  'teams.actions.add': {
    label: 'Add action item box in a note',
  },
  'teams.actions.check': {
    label: 'Complete circle for a note action item',
    perField: true,
    persists: true,
  },
  'teams.actions.due-date': {
    label: 'Due date button for a note action item',
    perField: true,
  },
  'teams.actions.owner': {
    label: 'Owner select for a note action item',
    perField: true,
  },
  'teams.actions.remove': {
    label: 'Remove button for a note action item',
    perField: true,
    destructive: true,
  },
  'teams.actions.text': {
    label: 'Text box for a note action item',
    perField: true,
  },
  'teams.add-doc.cancel': {
    label: 'Cancel button in the Add a doc dialog',
    panel: true,
  },
  'teams.add-doc.link': {
    label: 'Link box in the Add a doc dialog',
    panel: true,
  },
  'teams.add-doc.save': {
    label: 'Save button in the Add a doc dialog',
    panel: true,
    persists: true,
  },
  'teams.add-doc.title': {
    label: 'Title box in the Add a doc dialog',
    panel: true,
  },
  'teams.admin-defaults.add-category': {
    label: 'Add category button in the team type defaults',
  },
  'teams.admin-defaults.add-criterion': {
    label: 'Add criterion button in the goal coach rubric defaults',
  },
  'teams.admin-defaults.add-section': {
    label: 'Add section button in the team type defaults template',
  },
  'teams.admin-defaults.category': {
    label: 'Category name box in the team type defaults',
    perField: true,
  },
  'teams.admin-defaults.criterion': {
    label: 'Criterion box in the goal coach rubric defaults',
    perField: true,
  },
  'teams.admin-defaults.discard': {
    label: 'Discard changes button in the team type defaults',
    destructive: true,
  },
  'teams.admin-defaults.hero-rule': {
    label: 'Hero default select in the team type defaults',
  },
  'teams.admin-defaults.remove-category': {
    label: 'Remove category button in the team type defaults',
    perField: true,
    destructive: true,
  },
  'teams.admin-defaults.remove-criterion': {
    label: 'Remove criterion button in the goal coach rubric defaults',
    perField: true,
    destructive: true,
  },
  'teams.admin-defaults.remove-section': {
    label: 'Remove section button in the team type defaults template',
    perField: true,
    destructive: true,
  },
  'teams.admin-defaults.restore-rubric': {
    label: 'Restore default button in the goal coach rubric defaults',
    destructive: true,
  },
  'teams.admin-defaults.save': {
    label: 'Save defaults button in the team type defaults',
    persists: true,
  },
  'teams.admin-defaults.section-heading': {
    label: 'Section heading box in the team type defaults template',
    perField: true,
  },
  'teams.admin-defaults.section-kind': {
    label: 'Block type select in the team type defaults template',
    perField: true,
  },
  'teams.building.all-resources': {
    label: 'All resources button in the team Resources card',
  },
  'teams.building.edit-links': {
    label: 'Edit links button in the team landing page',
  },
  'teams.building.open-calendar': {
    label: 'Google Calendar button in the team calendar',
  },
  'teams.building.quick-link': {
    label: 'Quick link in the team landing page',
    perField: true,
  },
  'teams.building.resource': {
    label: 'Resource link in the team Resources card',
    perField: true,
  },
  'teams.calendar-settings.remove': {
    label: 'Remove button in the team calendar settings',
    destructive: true,
  },
  'teams.calendar-settings.save': {
    label: 'Save button in the team calendar settings',
    persists: true,
  },
  'teams.calendar-settings.url': {
    label: 'Google Calendar link box in the team settings',
  },
  'teams.check-in.body': {
    label: 'Note text box in the check-in dialog',
    panel: true,
  },
  'teams.check-in.cancel': {
    label: 'Cancel button in the check-in dialog',
    panel: true,
  },
  'teams.check-in.save': {
    label: 'Save button in the check-in dialog',
    panel: true,
    persists: true,
  },
  'teams.check-in.title': {
    label: 'Title box in the check-in dialog',
    panel: true,
  },
  'teams.data.all-assessments': {
    label: 'All assessments button in the team data recent assessments',
  },
  'teams.data.manage-targets': {
    label: 'Manage targets button in the team data mastery card',
  },
  'teams.data.open-next-note': {
    label: 'Open note button in the team data meeting strip',
  },
  'teams.data.open-results': {
    label: 'Open results button in the team data hero',
  },
  'teams.data.recent-assessment': {
    label: 'Assessment title button in the team data recent assessments',
    perField: true,
  },
  'teams.data.show-all-questions': {
    label: 'Show all questions button in the team data item analysis',
  },
  'teams.data.tag-questions': {
    label: 'Tag questions button in the team data overview',
  },
  'teams.data.view-open-items': {
    label: 'View button for open items in the team data meeting strip',
  },
  'teams.department.agenda-add': {
    label: 'Add button for agenda items in the department hub',
    persists: true,
  },
  'teams.department.agenda-text': {
    label: 'Agenda item box in the department hub',
  },
  'teams.department.all-notes': {
    label: 'Notes & Docs button in the department hub',
  },
  'teams.department.all-resources': {
    label: 'Resources button in the department hub',
  },
  'teams.department.decision-open': {
    label: 'Open decision row in the department hub',
    perField: true,
  },
  'teams.department.doc-open': {
    label: 'Recent doc row in the department hub',
    perField: true,
  },
  'teams.department.item-check': {
    label: 'Complete circle for an open item in the department hub',
    perField: true,
    persists: true,
  },
  'teams.department.item-open': {
    label: 'Open item button in the department hub',
    perField: true,
  },
  'teams.department.material-copy': {
    label: 'Copy to my library button in the department hub',
    perField: true,
    persists: true,
  },
  'teams.department.material-open': {
    label: 'Shared material row in the department hub',
    perField: true,
  },
  'teams.department.new-meeting-note': {
    label: 'New meeting note button in the department hub',
  },
  'teams.department.open-hero-doc': {
    label: 'Open in Docs link in the department hub',
  },
  'teams.department.open-meeting-note': {
    label: 'Open note button in the department hub meeting',
  },
  'teams.doc-embed.close': {
    label: 'Close button in the working doc dialog',
    panel: true,
  },
  'teams.doc-embed.open-docs': {
    label: 'Open in Docs link in the working doc dialog',
    panel: true,
  },
  'teams.drawer.close': {
    label: "Close button in the team What's new drawer",
    panel: true,
  },
  'teams.drawer.mark-all-seen': {
    label: "Mark all seen button in the team What's new drawer",
    panel: true,
    persists: true,
  },
  'teams.goal.add': {
    label: 'Add goal item in the goal options menu',
    panel: true,
  },
  'teams.goal.check': {
    label: 'Check this goal button in the team goal card',
  },
  'teams.goal.edit': {
    label: 'Edit item in the goal options menu',
    panel: true,
  },
  'teams.goal.options': {
    label: 'Goal options button in the team goal card',
  },
  'teams.hero.change': {
    label: 'Change button in a team hero',
  },
  'teams.hero.keep-pinned': {
    label: 'Keep pinned button under a pinned team hero',
  },
  'teams.hero.open-note': {
    label: 'Open note button in the team note hero',
  },
  'teams.hero.show-latest': {
    label: 'Show latest button under a pinned team hero',
    persists: true,
  },
  'teams.layout.cancel': {
    label: 'Cancel button in the team layout editor',
    panel: true,
  },
  'teams.layout.close': {
    label: 'Close button in the team layout editor',
    panel: true,
  },
  'teams.layout.follow-latest': {
    label: 'Follow latest button in the team layout editor',
    panel: true,
  },
  'teams.layout.landing-select': {
    label: 'Landing page select in the team layout editor',
    panel: true,
  },
  'teams.layout.pinned-item-select': {
    label: 'Pinned item select in the team layout editor',
    panel: true,
  },
  'teams.layout.reset-cancel': {
    label: 'Cancel button in the team layout reset confirm',
    panel: true,
  },
  'teams.layout.reset-confirm': {
    label: 'Reset button in the team layout reset confirm',
    panel: true,
    destructive: true,
  },
  'teams.layout.reset-to-default': {
    label: 'Reset to district default button in the team layout editor',
    panel: true,
  },
  'teams.layout.save': {
    label: 'Save button in the team layout editor',
    panel: true,
    persists: true,
  },
  'teams.meeting.join': {
    label: 'Join button in the live meeting banner',
  },
  'teams.members.manage': {
    label: 'Manage button in the team members popover',
    panel: true,
  },
  'teams.mentoring.open-tracker': {
    label: 'Open tracker button in the mentoring program',
  },
  'teams.mentoring.open-workspace': {
    label: 'Open in workspace button in the mentoring program',
  },
  'teams.mentoring.post-task': {
    label: 'Post a task button in the mentoring program',
  },
  'teams.menu.edit-layout': {
    label: 'Edit layout item in the team menu',
    panel: true,
  },
  'teams.menu.members': {
    label: 'Members item in the team menu',
    panel: true,
  },
  'teams.menu.settings': {
    label: 'Settings item in the team menu',
    panel: true,
  },
  'teams.my-items.check': {
    label: 'Complete circle for an item in the team My items drawer',
    perField: true,
    panel: true,
    persists: true,
  },
  'teams.note-block.assessment-picker': {
    label: 'Assessment select in a note data block',
    perField: true,
  },
  'teams.note-block.clear-revisit': {
    label: 'Clear revisit date button in a note decision block',
    perField: true,
    destructive: true,
  },
  'teams.note-block.decision-status': {
    label: 'Mark decided button in a note decision block',
    perField: true,
  },
  'teams.note-block.decision-text': {
    label: 'Decision text box in a note decision block',
    perField: true,
  },
  'teams.note-block.link-picker': {
    label: 'Link select in a note decision block',
    perField: true,
  },
  'teams.note-block.open-data': {
    label: 'Open in Data overview button in a note data block',
    perField: true,
  },
  'teams.note-block.open-link': {
    label: 'Linked item button in a note decision block',
    perField: true,
  },
  'teams.note-block.remove-agenda': {
    label: 'Remove agenda item button in a note',
    perField: true,
    destructive: true,
  },
  'teams.note-block.remove-data': {
    label: 'Remove block button in a note data block',
    perField: true,
    destructive: true,
  },
  'teams.note-block.remove-decision': {
    label: 'Remove block button in a note decision block',
    perField: true,
    destructive: true,
  },
  'teams.note-block.revisit-date': {
    label: 'Revisit date button in a note decision block',
    perField: true,
  },
  'teams.notes.add-block': {
    label: 'Add block button in the open note',
  },
  'teams.notes.add-block-item': {
    label: 'Menu item in the Add block menu',
    perField: true,
    panel: true,
  },
  'teams.notes.delete-note': {
    label: 'Delete note item in the note options menu',
    panel: true,
    destructive: true,
  },
  'teams.notes.doc-open': {
    label: 'Open in Docs link in the Google Doc view',
  },
  'teams.notes.doc-remove': {
    label: 'Remove doc button in the Google Doc view',
    destructive: true,
  },
  'teams.notes.list-entry': {
    label: 'Note or doc entry in the Notes & Docs list',
    perField: true,
  },
  'teams.notes.new-meeting-note': {
    label: 'New meeting note button in the Notes & Docs list',
    persists: true,
  },
  'teams.notes.new-menu': {
    label: 'Other new items button in the Notes & Docs list',
  },
  'teams.notes.new-menu-item': {
    label: 'Menu item in the Other new items menu',
    perField: true,
    panel: true,
    persists: true,
  },
  'teams.notes.open-in-docs': {
    label: 'Open in Docs item in the note options menu',
    panel: true,
    persists: true,
  },
  'teams.notes.options': {
    label: 'Note options button in the open note',
  },
  'teams.notes.section-body': {
    label: 'Section text box in the open note',
    perField: true,
  },
  'teams.notes.title': {
    label: 'Note title box in the open note',
  },
  'teams.pairing.add': {
    label: 'Add pair button in the mentoring pairings settings',
    persists: true,
  },
  'teams.pairing.member-role': {
    label: 'Role select for a member in the mentoring pairings settings',
    perField: true,
    persists: true,
  },
  'teams.pairing.mentee-select': {
    label: 'Mentee select in the mentoring pairings settings',
  },
  'teams.pairing.mentor-select': {
    label: 'Mentor select in the mentoring pairings settings',
  },
  'teams.pairing.remove': {
    label: 'Remove button for a pair in the mentoring pairings settings',
    perField: true,
    destructive: true,
  },
  'teams.post-task.cancel': {
    label: 'Cancel button in the Post a task dialog',
    panel: true,
  },
  'teams.post-task.choose-template': {
    label: 'Choose from Drive button in the Post a task dialog',
    panel: true,
  },
  'teams.post-task.due-date': {
    label: 'Due date box in the Post a task dialog',
    panel: true,
  },
  'teams.post-task.instructions': {
    label: 'Instructions box in the Post a task dialog',
    panel: true,
  },
  'teams.post-task.post': {
    label: 'Post button in the Post a task dialog',
    panel: true,
    persists: true,
  },
  'teams.post-task.remove-template': {
    label: 'Remove template button in the Post a task dialog',
    panel: true,
    destructive: true,
  },
  'teams.post-task.submitter': {
    label: 'Submits select in the Post a task dialog',
    panel: true,
  },
  'teams.post-task.title': {
    label: 'Title box in the Post a task dialog',
    panel: true,
  },
  'teams.shell.close': {
    label: 'Close button in the team header',
  },
  'teams.shell.my-items': {
    label: 'My items button in the team header',
  },
  'teams.shell.search': {
    label: 'Search button in the team header',
  },
  'teams.shell.team-menu': {
    label: 'Team menu button in the team header',
  },
  'teams.shell.whats-new': {
    label: "What's new button in the team header",
  },
  'teams.targets.add': {
    label: 'Add button in the Manage targets dialog',
    panel: true,
  },
  'teams.targets.add-target': {
    label: 'Add target button in the Manage targets dialog',
    panel: true,
  },
  'teams.targets.archive': {
    label: 'Remove target button in the Manage targets dialog',
    perField: true,
    panel: true,
    destructive: true,
  },
  'teams.targets.cancel': {
    label: 'Cancel button in the Manage targets dialog',
    panel: true,
  },
  'teams.targets.code': {
    label: 'Code box in the Manage targets dialog',
    panel: true,
  },
  'teams.targets.cutoff': {
    label: 'Cutoff percent box in the Manage targets dialog',
    perField: true,
    panel: true,
  },
  'teams.targets.label': {
    label: 'Target box in the Manage targets dialog',
    panel: true,
  },
  'teams.targets.save': {
    label: 'Save button in the Manage targets dialog',
    panel: true,
    persists: true,
  },
  'teams.targets.show-all': {
    label: 'Show all button in the Manage targets dialog',
    panel: true,
  },
  'teams.template.add': {
    label: 'Add section button in the meeting-note template editor',
    panel: true,
  },
  'teams.template.cancel': {
    label: 'Cancel button in the meeting-note template editor',
    panel: true,
  },
  'teams.template.heading': {
    label: 'Section heading box in the meeting-note template editor',
    perField: true,
    panel: true,
  },
  'teams.template.kind': {
    label: 'Block type select in the meeting-note template editor',
    perField: true,
    panel: true,
  },
  'teams.template.remove': {
    label: 'Remove section button in the meeting-note template editor',
    perField: true,
    panel: true,
    destructive: true,
  },
  'teams.template.restore': {
    label: 'Restore default button in the meeting-note template editor',
    panel: true,
    destructive: true,
  },
  'teams.template.save': {
    label: 'Save button in the meeting-note template editor',
    panel: true,
    persists: true,
  },
  'teams.tracker.open-submission': {
    label: 'Open submission button in the mentoring task tracker',
    perField: true,
  },
  'teams.tracker.open-workspace': {
    label: 'Open workspace button in the mentoring task tracker',
    perField: true,
  },
  'teams.tracker.task': {
    label: 'Task select in the mentoring task tracker',
  },
  'teams.update-composer.add-link': {
    label: 'Add a link button in the update composer',
  },
  'teams.update-composer.attach': {
    label: 'Attach a file button in the update composer',
  },
  'teams.update-composer.cancel': {
    label: 'Cancel button in the update composer',
  },
  'teams.update-composer.link-input': {
    label: 'Link box in the update composer',
  },
  'teams.update-composer.remove-attachment': {
    label: 'Remove attachment button in the update composer',
    destructive: true,
  },
  'teams.update-composer.require-ack': {
    label: 'Require acknowledgement toggle in the update composer',
  },
  'teams.update-composer.submit': {
    label: 'Post button in the update composer',
    persists: true,
  },
  'teams.update-composer.text': {
    label: 'Update text box in the update composer',
  },
  'teams.update-composer.weekly-email': {
    label: 'Include in weekly email toggle in the update composer',
  },
  'teams.update.acknowledge': {
    label: 'Acknowledge button on a team update',
    perField: true,
    persists: true,
  },
  'teams.update.delete': {
    label: 'Delete item in the update options menu',
    perField: true,
    panel: true,
    destructive: true,
  },
  'teams.update.edit': {
    label: 'Edit item in the update options menu',
    perField: true,
    panel: true,
  },
  'teams.update.open-attachment': {
    label: 'Attachment link in a team update',
    perField: true,
  },
  'teams.update.open-link': {
    label: 'Link in a team update',
    perField: true,
  },
  'teams.update.options': {
    label: 'Update options button on a team update',
    perField: true,
  },
  'teams.update.pin': {
    label: 'Pin item in the update options menu',
    perField: true,
    panel: true,
    persists: true,
  },
  'teams.update.react': {
    label: 'Reaction button on a team update',
    perField: true,
    persists: true,
  },
  'teams.update.roster-show-all': {
    label: 'Show all button in an update acknowledgement list',
    perField: true,
  },
  'teams.update.see-who': {
    label: 'See who button on a team update',
    perField: true,
  },
  'teams.updates.all-updates': {
    label: 'All updates button in the Latest updates card',
  },
  'teams.updates.latest-item': {
    label: 'Update title button in the Latest updates card',
    perField: true,
  },
  'teams.workspace.action-check': {
    label: 'Complete circle for an action item in a mentoring workspace',
    perField: true,
    persists: true,
  },
  'teams.workspace.action-due': {
    label: 'Due date box for an action item in a mentoring workspace',
  },
  'teams.workspace.action-owner': {
    label: 'Owner select for an action item in a mentoring workspace',
  },
  'teams.workspace.action-submit': {
    label: 'Add button for a new action item in a mentoring workspace',
    persists: true,
  },
  'teams.workspace.action-text': {
    label: 'Action item box in a mentoring workspace',
  },
  'teams.workspace.add-action-item': {
    label: 'Add button for action items in a mentoring workspace',
  },
  'teams.workspace.add-doc': {
    label: 'Add a doc button in a mentoring workspace',
  },
  'teams.workspace.back': {
    label: 'Workspaces back button in a mentoring workspace',
  },
  'teams.workspace.new-check-in': {
    label: 'New check-in button in a mentoring workspace',
  },
  'teams.workspace.open-check-in': {
    label: 'Check-in row in a mentoring workspace',
    perField: true,
  },
  'teams.workspace.open-doc': {
    label: 'Working doc row in a mentoring workspace',
    perField: true,
  },
  'teams.workspace.open-task-doc': {
    label: 'Open doc button for a task in a mentoring workspace',
    perField: true,
  },
  'teams.workspace.submit-task': {
    label: 'Submit button for a task in a mentoring workspace',
    perField: true,
    persists: true,
  },
  'teams.workspace.view-submission': {
    label: 'View button for a task in a mentoring workspace',
    perField: true,
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
  // Dashboard shell and classroom-tool anchors.
  'dock.live-session': { label: 'Live session button in the dock' },
  'dock.live-popover-close': {
    label: 'Close button in the live session popover',
    panel: true,
  },
  'dock.restore-custom': {
    label: 'Minimized custom widget button in the dock',
  },
  'dock.quick-access-1': { label: 'First quick access button in the dock' },
  'dock.quick-access-2': { label: 'Second quick access button in the dock' },
  'dock.saved-item': {
    label: 'Saved widget button in the dock',
    perField: true,
  },
  'dock.saved-remove': {
    label: 'Remove from dock button on a saved widget',
    perField: true,
    panel: true,
  },
  'dock.saved-delete': {
    label: 'Delete button on a saved widget in the dock',
    perField: true,
    panel: true,
    destructive: true,
  },
  'dock.folder-open': {
    label: 'Folder button in the dock',
    perField: true,
  },
  'dock.folder-delete': {
    label: 'Delete folder button on a dock folder',
    perField: true,
    panel: true,
    destructive: true,
  },
  'dock.folder-rename': {
    label: 'Rename button in a dock folder',
    perField: true,
    panel: true,
  },
  'dock.folder-item': {
    label: 'Widget button inside a dock folder',
    perWidgetType: true,
    panel: true,
  },
  'dock.folder-widget-remove': {
    label: 'Remove button on a widget inside a dock folder',
    perWidgetType: true,
    panel: true,
  },
  'dock.minimized-restore': {
    label: 'Restore row in the minimized widgets popover',
    perWidgetType: true,
    panel: true,
  },
  'dock.minimized-close': {
    label: 'Close widget button in the minimized widgets popover',
    perWidgetType: true,
    panel: true,
    destructive: true,
  },
  'dock.minimized-create': {
    label: 'Create button in the minimized widgets popover',
    perWidgetType: true,
    panel: true,
  },
  'dock.minimized-clear': {
    label: 'Clear button in the minimized widgets popover',
    perWidgetType: true,
    panel: true,
    destructive: true,
  },
  'dock.item-remove': {
    label: 'Remove from dock button in dock edit mode',
    perWidgetType: true,
    panel: true,
  },
  'dock.magic-layout-input': {
    label: 'Description box in the Magic Layout dialog',
    panel: true,
  },
  'dock.magic-layout-suggestion': {
    label: 'Suggestion chip in the Magic Layout dialog',
    perField: true,
    panel: true,
  },
  'dock.magic-layout-cancel': {
    label: 'Cancel button in the Magic Layout dialog',
    panel: true,
  },
  'dock.magic-layout-apply': {
    label: 'Draft with AI button in the Magic Layout dialog',
    panel: true,
    persists: true,
  },
  'dock.rename-folder-input': {
    label: 'Name box in the rename folder dialog',
    panel: true,
  },
  'dock.rename-folder-cancel': {
    label: 'Cancel button in the rename folder dialog',
    panel: true,
  },
  'dock.rename-folder-save': {
    label: 'Save button in the rename folder dialog',
    panel: true,
    persists: true,
  },
  'dock.smart-paste-close': {
    label: 'Close button in the paste text dialog',
    panel: true,
  },
  'dock.smart-paste-text': {
    label: 'Text Widget choice in the paste text dialog',
    panel: true,
    persists: true,
  },
  'dock.smart-paste-checklist': {
    label: 'Checklist choice in the paste text dialog',
    panel: true,
    persists: true,
  },
  'dock.image-paste-close': {
    label: 'Close button in the paste image dialog',
    panel: true,
  },
  'dock.image-paste-sticker': {
    label: 'Sticker choice in the paste image dialog',
    panel: true,
    persists: true,
  },
  'dock.image-paste-full': {
    label: 'Full Image choice in the paste image dialog',
    panel: true,
    persists: true,
  },
  'dock.url-picker-back': {
    label: 'Back button in the paste link dialog',
    panel: true,
  },
  'dock.url-picker-close': {
    label: 'Close button in the paste link dialog',
    panel: true,
  },
  'dock.url-picker-links': {
    label: 'Links Widget choice in the paste link dialog',
    panel: true,
  },
  'dock.url-picker-qr': {
    label: 'QR Code choice in the paste link dialog',
    panel: true,
    persists: true,
  },
  'dock.url-picker-title': {
    label: 'Title box in the paste link dialog',
    panel: true,
  },
  'dock.url-picker-icon': {
    label: 'Icon button in the paste link dialog',
    perField: true,
    panel: true,
  },
  'dock.url-picker-confirm': {
    label: 'Add Link button in the paste link dialog',
    panel: true,
    persists: true,
  },
  'library.add-folder': {
    label: 'Add Folder button in the widget library',
    panel: true,
  },
  'library.done-editing': {
    label: 'Done button in the widget library',
    panel: true,
  },
  'library.filter-category': {
    label: 'Category filter in the widget library',
    panel: true,
  },
  'library.filter-grade': {
    label: 'Grade level filter in the widget library',
    panel: true,
  },
  'library.sort': { label: 'Sort menu in the widget library', panel: true },
  'library.item-hide': {
    label: 'Hide or unhide button on a widget tile in the library',
    perWidgetType: true,
    panel: true,
  },
  'library.saved-pin': {
    label: 'Pin to dock button on a saved widget in the library',
    perField: true,
    panel: true,
    persists: true,
  },
  'library.saved-delete': {
    label: 'Delete button on a saved widget in the library',
    perField: true,
    panel: true,
    destructive: true,
  },
  'library.saved-item': {
    label: 'Saved widget tile in the widget library',
    perField: true,
    panel: true,
  },
  'library.custom-item': {
    label: 'Custom widget tile in the widget library',
    perField: true,
    panel: true,
  },
  'library.show-hidden': {
    label: 'Hidden widgets section toggle in the widget library',
    panel: true,
  },
  'library.show-other-grades': {
    label: 'Other grade levels section toggle in the widget library',
    panel: true,
  },
  'library.reset-dock': {
    label: 'Reset Dock to Defaults button in the widget library',
    panel: true,
    destructive: true,
    persists: true,
  },
  'sidebar.quick-link': { label: 'Shorten URL button in the top bar' },
  'sidebar.back': { label: 'Back button in the menu', panel: true },
  'sidebar.gradebook': { label: 'Gradebook item in the menu', panel: true },
  'sidebar.google-drive': {
    label: 'Google Drive item in the menu',
    panel: true,
  },
  'sidebar.sign-out': {
    label: 'Sign out button in the menu',
    panel: true,
    persists: true,
  },
  'sidebar.board-item': {
    label: 'Board button in the menu boards list',
    perField: true,
    panel: true,
  },
  'sidebar.manage-boards': {
    label: 'Manage all boards button in the menu',
    panel: true,
  },
  'sidebar.drive-refresh': {
    label: 'Refresh Google Drive button in the menu',
    panel: true,
  },
  'sidebar.drive-disconnect': {
    label: 'Disconnect Google Drive button in the menu',
    panel: true,
    persists: true,
  },
  'sidebar.drive-connect': {
    label: 'Connect Google Drive button in the menu',
    panel: true,
    persists: true,
  },
  'classes.new-class-empty': {
    label: 'Create New Class button in the empty My Classes list',
    panel: true,
  },
  'classes.roster-menu-item': {
    label: 'Class row in the dock class menu',
    perField: true,
    panel: true,
  },
  'classes.open-full-editor': {
    label: 'Open Full Editor button in the dock class menu',
    panel: true,
  },
  'plcs.new-plc-empty': {
    label: 'Create button in the empty My Teams list',
    panel: true,
  },
  'board-nav.breadcrumb': { label: 'Collection breadcrumb button' },
  'board-nav.board-item': {
    label: 'Board row in the boards menu',
    perField: true,
    panel: true,
  },
  'board-nav.rename-board': {
    label: 'Rename button on a board row',
    perField: true,
    panel: true,
  },
  'board-nav.move-board': {
    label: 'Move to collection button on a board row',
    perField: true,
    panel: true,
  },
  'board-nav.name-input': {
    label: 'Name box in the boards and collections menus',
    panel: true,
  },
  'board-nav.collection-row': {
    label: 'Collection row in the collection menu',
    perField: true,
    panel: true,
  },
  'board-nav.collection-edit': {
    label: 'Rename button on a collection row',
    perField: true,
    panel: true,
  },
  'board-nav.collection-root': {
    label: 'No Collection item in the collection menu',
    panel: true,
  },
  'board-nav.new-collection': {
    label: 'New Collection item in the collection menu',
    panel: true,
  },
  'board-nav.move-back': {
    label: 'Back button in the move board menu',
    panel: true,
  },
  'board-nav.move-to-root': {
    label: 'No Collection choice in the move board menu',
    panel: true,
    persists: true,
  },
  'board-nav.move-target': {
    label: 'Collection choice in the move board menu',
    perField: true,
    panel: true,
    persists: true,
  },
  'board-nav.move-new-collection': {
    label: 'New Collection item in the move board menu',
    panel: true,
  },
  'remote-control.enable': {
    label: 'Enable Remote switch in the remote control menu',
    panel: true,
    persists: true,
  },
  'remote-control.copy-link': {
    label: 'Copy Remote Link button in the remote control menu',
    panel: true,
  },
  'remote-control.open-view': {
    label: 'Open Remote View button in the remote control menu',
    panel: true,
  },
  'boards-modal.close': {
    label: 'Close button in the Manage Boards dialog',
    panel: true,
  },
  'boards-modal.search': {
    label: 'Search box in the Manage Boards dialog',
    panel: true,
  },
  'boards-modal.create-from-template': {
    label: 'Create from template button in the Manage Boards dialog',
    panel: true,
  },
  'boards-modal.new-collection': {
    label: 'New Collection button in the Manage Boards dialog',
    panel: true,
  },
  'boards-modal.new-board': {
    label: 'New Board button in the Manage Boards dialog',
    panel: true,
  },
  'boards-modal.clear-selection': {
    label: 'Clear selection button in the Manage Boards bulk bar',
    panel: true,
  },
  'boards-modal.bulk-pin': {
    label: 'Pin selected boards button in the Manage Boards bulk bar',
    panel: true,
    persists: true,
  },
  'boards-modal.bulk-unpin': {
    label: 'Unpin selected boards button in the Manage Boards bulk bar',
    panel: true,
    persists: true,
  },
  'boards-modal.bulk-move': {
    label: 'Move selected boards button in the Manage Boards bulk bar',
    panel: true,
  },
  'boards-modal.bulk-delete': {
    label: 'Delete selected boards button in the Manage Boards bulk bar',
    panel: true,
    destructive: true,
  },
  'boards-modal.board-open': {
    label: 'Board card in the Manage Boards dialog',
    panel: true,
  },
  'boards-modal.board-select': {
    label: 'Select checkbox on a board card',
    panel: true,
  },
  'boards-modal.board-edit': {
    label: 'Edit button on a board card',
    panel: true,
  },
  'boards-modal.board-duplicate': {
    label: 'Duplicate button on a board card',
    panel: true,
    persists: true,
  },
  'boards-modal.board-pin': {
    label: 'Pin button on a board card',
    panel: true,
    persists: true,
  },
  'boards-modal.board-delete': {
    label: 'Delete item in the board card menu',
    panel: true,
    destructive: true,
  },
  'boards-modal.collection-open': {
    label: 'Collection card in the Manage Boards dialog',
    panel: true,
  },
  'boards-modal.collection-select': {
    label: 'Select checkbox on a collection card',
    panel: true,
  },
  'boards-modal.collection-edit': {
    label: 'Edit button on a collection card',
    panel: true,
  },
  'boards-modal.collection-share': {
    label: 'Share button on a collection card',
    panel: true,
  },
  'boards-modal.collection-duplicate': {
    label: 'Duplicate button on a collection card',
    panel: true,
    persists: true,
  },
  'boards-modal.collection-delete': {
    label: 'Delete item in the collection card menu',
    panel: true,
    destructive: true,
  },
  'boards-modal.pinned-open': {
    label: 'Pinned board row in the Manage Boards sidebar',
    panel: true,
  },
  'boards-modal.pinned-unpin': {
    label: 'Unpin button on a pinned board row',
    panel: true,
    persists: true,
  },
  'boards-modal.tree-all-boards': {
    label: 'All Boards row in the collection tree',
    panel: true,
  },
  'boards-modal.tree-collection': {
    label: 'Collection row in the collection tree',
    panel: true,
  },
  'boards-modal.tree-expand': {
    label: 'Expand arrow on a collection tree row',
    panel: true,
  },
  'boards-modal.template-pick': {
    label: 'Template name in the create from template dialog',
    panel: true,
  },
  'boards-modal.move-close': {
    label: 'Close button in the move to collection dialog',
    panel: true,
  },
  'boards-modal.move-to-root': {
    label: 'Root option in the move to collection dialog',
    panel: true,
  },
  'boards-modal.move-target': {
    label: 'Collection option in the move to collection dialog',
    panel: true,
  },
  'boards-modal.color-close': {
    label: 'Close button in the collection color dialog',
    panel: true,
  },
  'boards-modal.color-swatch': {
    label: 'Color swatch in the collection color dialog',
    panel: true,
  },
  'boards-modal.color-custom': {
    label: 'Custom color picker in the collection color dialog',
    panel: true,
  },
  'boards-modal.color-apply-custom': {
    label: 'Apply custom color button in the collection color dialog',
    panel: true,
  },
  'boards-modal.color-done': {
    label: 'Done button in the collection color dialog',
    panel: true,
  },
  'board-actions.zoom-slider': {
    label: 'Zoom level slider in the board actions menu',
    panel: true,
  },
  'board-actions.zoom-preset': {
    label: 'Zoom preset button in the board actions menu',
    panel: true,
  },
  'board-actions.zoom-panel-reset': {
    label: 'Reset to 100% button in the zoom menu',
    panel: true,
  },
  'dashboard.group-cancel': {
    label: 'Cancel button on the widget group bar',
    panel: true,
  },
  'dashboard.group-widgets': {
    label: 'Group button on the widget group bar',
    panel: true,
  },
  'dashboard.bg-sound-toggle': {
    label: 'Background video sound toggle',
  },
  'settings.clear-filter': {
    label: 'Clear search button in widget settings',
    perWidget: true,
    panel: true,
    requires: 'settings-open',
  },
  'settings.style-defaults-save': {
    perWidget: true,
    label: 'Save as my default button on the Style tab',
    panel: true,
    persists: true,
    requires: 'settings-open',
  },
  'settings.style-defaults-reset': {
    perWidget: true,
    label: 'Reset to my default button on the Style tab',
    panel: true,
    persists: true,
    requires: 'settings-open',
  },
  'settings.partner-add': {
    perField: true,
    label: 'Add partner widget button in widget settings',
    panel: true,
    requires: 'settings-open',
  },
  'share-link.mode-synced': {
    label: 'Synced option in the share dialog',
    panel: true,
  },
  'share-link.mode-view-only': {
    label: 'View-Only option in the share dialog',
    panel: true,
  },
  'share-link.mode-copy': {
    label: 'Make a copy option in the share dialog',
    panel: true,
  },
  'share-link.mode-substitute': {
    label: 'Substitute option in the share dialog',
    panel: true,
  },
  'share-link.close': {
    label: 'Close button in the share dialog',
    panel: true,
  },
  'share-link.url': {
    label: 'Share link box in the share dialog',
    panel: true,
  },
  'share-link.copy': {
    label: 'Copy button for the share link',
    panel: true,
  },
  'share-link.done': {
    label: 'Done button in the share dialog',
    panel: true,
  },
  'share-link.sub-expires': {
    label: 'Expiry date box for a sub share in the share dialog',
    panel: true,
  },
  'share-link.sub-building': {
    label: 'Building picker for a sub share in the share dialog',
    panel: true,
  },
  'share-link.sub-preset-email': {
    label: 'Saved sub email button in the share dialog',
    panel: true,
  },
  'share-link.sub-remove-email': {
    label: 'Remove sub email button in the share dialog',
    panel: true,
  },
  'share-link.sub-email-input': {
    label: 'Sub email box in the share dialog',
    panel: true,
  },
  'share-link.add-sub-email': {
    label: 'Add sub email button in the share dialog',
    panel: true,
  },
  'share-link.plc-scope': {
    label: 'Also share with a PLC picker in the share dialog',
    panel: true,
  },
  'share-link.create': {
    label: 'Create link button in the share dialog',
    panel: true,
    persists: true,
  },
  'sub-share.expires': {
    label: 'Expiry date box in the sub share dialog',
    panel: true,
  },
  'sub-share.email-chip': {
    label: 'Saved sub email button in the sub share dialog',
    panel: true,
  },
  'sub-share.remove-email': {
    label: 'Remove sub email button in the sub share dialog',
    panel: true,
  },
  'sub-share.cancel': {
    label: 'Cancel button in the sub share dialog',
    panel: true,
  },
  'sub-share.url': {
    label: 'Sub share link box',
    panel: true,
  },
  'sub-share.copy-link': {
    label: 'Copy button for the sub share link',
    panel: true,
  },
  'share-collection.share-with-sub': {
    label: 'Share with a sub option in the collection share dialog',
    panel: true,
  },
  'share-collection.mode-copy': {
    label: 'Copy mode in the collection share dialog',
    panel: true,
  },
  'share-collection.mode-substitute': {
    label: 'Substitute mode in the collection share dialog',
    panel: true,
  },
  'share-collection.ttl': {
    label: 'Expires in button in the collection share dialog',
    panel: true,
  },
  'share-collection.building': {
    label: 'Building picker in the collection share dialog',
    panel: true,
  },
  'share-collection.preset-email': {
    label: 'Saved sub email button in the collection share dialog',
    panel: true,
  },
  'share-collection.remove-email': {
    label: 'Remove sub email button in the collection share dialog',
    panel: true,
  },
  'share-collection.email-input': {
    label: 'Sub email box in the collection share dialog',
    panel: true,
  },
  'share-collection.add-email': {
    label: 'Add sub email button in the collection share dialog',
    panel: true,
  },
  'share-collection.cancel': {
    label: 'Cancel button in the collection share dialog',
    panel: true,
  },
  'share-collection.create': {
    label: 'Create link button in the collection share dialog',
    panel: true,
    persists: true,
  },
  'share-collection.url': {
    label: 'Collection share link box',
    panel: true,
  },
  'share-collection.copy-link': {
    label: 'Copy button for the collection share link',
    panel: true,
  },
  'share-collection.done': {
    label: 'Done button in the collection share dialog',
    panel: true,
  },
  'share-import.close': {
    label: 'Close button in the import shared board dialog',
    panel: true,
  },
  'share-import.cancel': {
    label: 'Cancel button in the import shared board dialog',
    panel: true,
  },
  'share-import.confirm': {
    label: 'Import button in the import shared board dialog',
    panel: true,
    persists: true,
  },
  'share-import.mode-synced': {
    label: 'Synced option in the import shared board dialog',
    panel: true,
    persists: true,
  },
  'share-import.mode-view-only': {
    label: 'View-Only option in the import shared board dialog',
    panel: true,
    persists: true,
  },
  'share-import.mode-copy': {
    label: 'Make a copy option in the import shared board dialog',
    panel: true,
    persists: true,
  },
  'import-shared-collection.cancel': {
    label: 'Cancel button in the import shared collection dialog',
    panel: true,
  },
  'import-shared-collection.import': {
    label: 'Import Collection button in the import shared collection dialog',
    panel: true,
    persists: true,
  },
  'share-status.chip': {
    label: 'Share status chip at the top right of the board',
  },
  'share-status.close': {
    label: 'Close button in the share status popover',
    panel: true,
  },
  'share-status.stop': {
    label: 'Stop sharing or leave button in the share status popover',
    panel: true,
    persists: true,
    destructive: true,
  },
  'library-shell.folder-panel-toggle': {
    label: 'Folder panel toggle in a library shell',
    perWidgetType: true,
  },
  'library-shell.show-folders': {
    label: 'Show folders button in a library shell',
    perWidgetType: true,
  },
  'library-shell.sort-direction': {
    label: 'Sort direction button in a library toolbar',
    perWidgetType: true,
  },
  'library-shell.sort-option': {
    label: 'Option in a library sort dropdown',
    perField: true,
    panel: true,
  },
  'library-shell.select-item': {
    label: 'Select checkbox on a library item card',
    perField: true,
    panel: true,
  },
  'library-shell.card-badge': {
    label: 'Status badge button on a library item card',
  },
  'library-shell.new-folder': {
    label: 'New folder button in the library folder panel',
    panel: true,
  },
  'library-shell.new-folder-input': {
    label: 'New folder name box in the library folder panel',
    panel: true,
  },
  'library-shell.folder-root': {
    label: 'All items or Library row in the library folder panel',
    panel: true,
  },
  'library-shell.folder-view-all': {
    label: 'All items row in the library folder panel',
    panel: true,
  },
  'library-shell.folder-view-recent': {
    label: 'Recent row in the library folder panel',
    panel: true,
  },
  'library-shell.folder-tree-item': {
    label: 'Folder row in the library folder panel',
    panel: true,
  },
  'library-shell.folder-tree-expand': {
    label: 'Expand arrow on a library folder row',
    panel: true,
  },
  'library-shell.folder-rename-input': {
    label: 'Rename box on a library folder row',
    panel: true,
  },
  'library-shell.folder-menu': {
    label: 'Actions button on a library folder row',
    panel: true,
  },
  'library-shell.folder-menu-rename': {
    label: 'Rename item in the library folder menu',
    panel: true,
  },
  'library-shell.folder-menu-new-subfolder': {
    label: 'New subfolder item in the library folder menu',
    panel: true,
  },
  'library-shell.folder-menu-move-to-root': {
    label: 'Move to root item in the library folder menu',
    panel: true,
  },
  'library-shell.folder-menu-delete': {
    label: 'Delete item in the library folder menu',
    panel: true,
    destructive: true,
  },
  'library-shell.folder-dialog-close': {
    label: 'Close button in the delete folder dialog',
    panel: true,
  },
  'library-shell.folder-dialog-move-contents': {
    label: 'Move contents to parent button in the delete folder dialog',
    panel: true,
    persists: true,
  },
  'library-shell.folder-dialog-delete-all': {
    label: 'Delete folder and subfolders button in the delete folder dialog',
    panel: true,
    destructive: true,
  },
  'library-shell.folder-dialog-cancel': {
    label: 'Cancel button in the delete folder dialog',
    panel: true,
  },
  'library-shell.folder-crumb': {
    label: 'Folder path link above the library list',
  },
  'library-shell.folder-row': {
    label: 'Folder row in the library list',
  },
  'library-shell.folder-name': {
    label: 'Folder name box while renaming a folder row',
  },
  'library-shell.folder-search-scope': {
    label: 'Search scope toggle above the library list',
  },
  'library-shell.bulk-action': {
    label: 'Action button in the library bulk action bar',
    panel: true,
    persists: true,
    destructive: true,
  },
  'library-shell.bulk-move': {
    label: 'Move button in the library bulk action bar',
    panel: true,
  },
  'library-shell.bulk-delete': {
    label: 'Delete button in the library bulk action bar',
    panel: true,
    destructive: true,
  },
  'library-shell.bulk-clear': {
    label: 'Clear selection button in the library bulk action bar',
    panel: true,
  },
  'publish-scores.close': {
    label: 'Close button in the publish scores dialog',
    panel: true,
  },
  'publish-scores.level': {
    label: 'Score visibility option in the publish scores dialog',
    panel: true,
  },
  'publish-scores.written-mode': {
    label: 'Written answers option in the publish scores dialog',
    panel: true,
  },
  'publish-scores.unpublish': {
    label: 'Unpublish button in the publish scores dialog',
    panel: true,
    persists: true,
  },
  'publish-scores.cancel': {
    label: 'Cancel button in the publish scores dialog',
    panel: true,
  },
  'publish-scores.confirm': {
    label: 'Publish or Update button in the publish scores dialog',
    panel: true,
    persists: true,
  },
  'override-row.toggle': {
    label: 'Student row header in the override editor',
    panel: true,
  },
  'override-row.copy-source': {
    label: 'Copy overrides from picker in the override editor',
    panel: true,
  },
  'override-row.copy': {
    label: 'Copy button in the override editor',
    panel: true,
  },
  'override-row.read-aloud': {
    label: 'Read aloud checkbox in the override editor',
    panel: true,
  },
  'override-row.language': {
    label: 'Language picker in the override editor',
    panel: true,
  },
  'override-row.tab-warning': {
    label: 'Tab-warning threshold box in the override editor',
    panel: true,
  },
  'override-row.tab-warning-off': {
    label: 'Tab-warning off checkbox in the override editor',
    panel: true,
  },
  'override-row.tab-away': {
    label: 'Time allowed away box in the override editor',
    panel: true,
  },
  'override-row.tab-away-off': {
    label: 'No auto-submit checkbox in the override editor',
    panel: true,
  },
  'override-row.window-open': {
    label: 'Window opens box in the override editor',
    panel: true,
  },
  'override-row.window-close': {
    label: 'Window closes box in the override editor',
    panel: true,
  },
  'override-row.question': {
    label: 'Question subset checkbox in the override editor',
    panel: true,
  },
  'override-row.hidden-option': {
    label: 'Hide answer option checkbox in the override editor',
    panel: true,
  },
  'override-row.rubric': {
    label: 'Rubric swap picker in the override editor',
    panel: true,
  },
  'time-tool.field-minutes': {
    label: 'Minutes field in the Timer keypad',
    perWidget: true,
  },
  'time-tool.field-seconds': {
    label: 'Seconds field in the Timer keypad',
    perWidget: true,
  },
  'time-tool.preset': {
    label: 'Preset duration button in the Timer keypad',
    perField: true,
  },
  'time-tool.keypad-digit': {
    label: 'Digit button in the Timer keypad',
    perField: true,
  },
  'time-tool.keypad-backspace': {
    label: 'Backspace button in the Timer keypad',
    perWidget: true,
  },
  'time-tool.keypad-zero': {
    label: 'Zero button in the Timer keypad',
    perWidget: true,
  },
  'time-tool.confirm': {
    label: 'Confirm time button in the Timer keypad',
    perWidget: true,
  },
  'time-tool.cancel-edit': {
    label: 'Cancel button in the Timer keypad',
    perWidget: true,
  },
  'time-tool.edit-time': {
    label: 'Time display that opens the Timer keypad',
    perWidget: true,
  },
  'time-tool.subtract-time': {
    label: 'Subtract time button in Timer',
    perWidget: true,
  },
  'time-tool.add-time': {
    label: 'Add time button in Timer',
    perWidget: true,
  },
  'traffic-light.light': {
    label: 'Light button in Traffic Light',
    perField: true,
  },
  'next-up.reset-queue': {
    label: 'Reset queue button in Next Up',
    perWidget: true,
    destructive: true,
  },
  'next-up.next-student': {
    label: 'Next student button in Next Up',
    perWidget: true,
  },
  'need-do-put-then.toggle-need': {
    label: 'Need panel toggle in Need Do Put Then',
    perWidget: true,
  },
  'need-do-put-then.toggle-then': {
    label: 'Then panel toggle in Need Do Put Then',
    perWidget: true,
  },
  'need-do-put-then.toggle-put': {
    label: 'Put panel toggle in Need Do Put Then',
    perWidget: true,
  },
  'webcam.retry-camera': {
    label: 'Retry camera button in Webcam',
    perWidget: true,
  },
  'webcam.take-photo': {
    label: 'Take photo button in Webcam',
    perWidget: true,
  },
  'webcam.extract-text': {
    label: 'Extract text button in Webcam',
    perWidget: true,
  },
  'webcam.mirror': {
    label: 'Mirror button in Webcam',
    perWidget: true,
  },
  'webcam.switch-camera': {
    label: 'Switch camera button in Webcam',
    perWidget: true,
  },
  'webcam.exit-remote': {
    label: 'Exit remote mode button in Webcam',
    perWidget: true,
  },
  'webcam.open-gallery': {
    label: 'View gallery button in Webcam',
    perWidget: true,
  },
  'webcam.text-close': {
    label: 'Close extracted text button in Webcam',
    perWidget: true,
    panel: true,
  },
  'webcam.send-to-notes': {
    label: 'Send extracted text to Notes button in Webcam',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'webcam.copy-text': {
    label: 'Copy extracted text button in Webcam',
    perWidget: true,
    panel: true,
  },
  'webcam.clear-gallery': {
    label: 'Clear all photos button in the Webcam gallery',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'webcam.gallery-close': {
    label: 'Close gallery button in Webcam',
    perWidget: true,
    panel: true,
  },
  'classes-widget.manage': {
    label: 'Manage classes button in Classes',
    perWidget: true,
  },
  'classes-widget.clear-active': {
    label: 'Clear active class star button in Classes',
    perWidget: true,
  },
  'classes-widget.roster-row': {
    label: 'Class to switch to in Classes',
    perField: true,
  },
  'url.open-link': {
    label: 'Link button in Links',
    perField: true,
  },
  'url.shape': {
    label: 'Link shape button in the link picker',
    perField: true,
    panel: true,
  },
  'url.background-tab': {
    label: 'Color or image tab in the link picker',
    perField: true,
    panel: true,
  },
  'url.color': {
    label: 'Background color swatch in the link picker',
    perField: true,
    panel: true,
  },
  'url.upload-image': {
    label: 'Upload image button in the link picker',
    perField: true,
    panel: true,
  },
  'url.remove-image': {
    label: 'Remove image button in the link picker',
    perField: true,
    panel: true,
    destructive: true,
  },
  'first5.open-link': {
    label: 'Open in new tab button in First 5',
    perWidget: true,
  },
  'talking-tool.category': {
    label: 'Category tab in Talking Tool',
    perField: true,
  },
  'work-symbols.symbol': {
    label: 'Symbol button in Work Symbols',
    perField: true,
  },
  'number-line.add-marker': {
    label: 'Tick mark that adds a marker in Number Line',
    perField: true,
  },
  'lunch-count.open-report': {
    label: 'Submit report button in Lunch Count',
    perWidget: true,
  },
  'lunch-count.refresh-menu': {
    label: 'Refresh menu button in Lunch Count',
    perWidget: true,
  },
  'lunch-count.reset-assignments': {
    label: 'Reset assignments button in Lunch Count',
    perWidget: true,
    destructive: true,
  },
  'lunch-count.photo-close': {
    label: 'Close photo button in Lunch Count',
    perWidget: true,
    panel: true,
  },
  'lunch-count.report-close': {
    label: 'Close button in the Lunch Count report dialog',
    perWidgetType: true,
    panel: true,
  },
  'lunch-count.report-cancel': {
    label: 'Cancel button in the Lunch Count report dialog',
    perWidgetType: true,
    panel: true,
  },
  'lunch-count.report-confirm': {
    label: 'Confirm and send button in the Lunch Count report dialog',
    perWidgetType: true,
    panel: true,
    persists: true,
  },
  'embed.zoom-out': {
    label: 'Zoom out button in Embed',
    perWidget: true,
    panel: true,
  },
  'embed.zoom-level': {
    label: 'Zoom level button in Embed',
    perWidget: true,
    panel: true,
  },
  'embed.zoom-in': {
    label: 'Zoom in button in Embed',
    perWidget: true,
    panel: true,
  },
  'embed.zoom-reset': {
    label: 'Reset zoom button in Embed',
    perWidget: true,
    panel: true,
  },
  'embed.generate-mini-app': {
    label: 'Generate Mini App button in Embed',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'embed.reload': {
    label: 'Reload button in Embed',
    perWidget: true,
    panel: true,
  },
  'embed.open-link': {
    label: 'Open in new tab button in Embed',
    perWidget: true,
    panel: true,
  },
  'embed.open-blocked': {
    label: 'Open in new tab button on the blocked Embed page',
    perWidget: true,
  },
  'widget-settings.lunch-count.school-site': {
    label: 'School site select in Lunch Count settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.lunch-count.time-hour': {
    label: 'Lunch time hour input in Lunch Count settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.lunch-count.time-minute': {
    label: 'Lunch time minute input in Lunch Count settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.embed.mode-url': {
    label: 'Website mode toggle in Embed settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.embed.mode-code': {
    label: 'Code mode toggle in Embed settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.embed.url': {
    label: 'Website address input in Embed settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.embed.html': {
    label: 'Code box in Embed settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.embed.verify': {
    label: 'Verify button in Embed settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.text.template': {
    label: 'Template button in Text settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.next-up.new-queue': {
    label: 'New queue button in Next Up settings',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'widget-settings.next-up.load-existing': {
    label: 'Load existing queue select in Next Up settings',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'widget-settings.next-up.copy-link': {
    label: 'Copy student link button in Next Up settings',
    perWidget: true,
    panel: true,
  },
  'widget-settings.next-up.import-class': {
    label: 'Import active class button in Next Up settings',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'widget-settings.next-up.end-and-save': {
    label: 'End and save button in Next Up settings',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'widget-settings.next-up.discard': {
    label: 'Discard queue button in Next Up settings',
    perWidget: true,
    panel: true,
    persists: true,
    destructive: true,
  },
  'widget-settings.next-up.theme-color': {
    label: 'Theme color swatch in Next Up settings',
    perField: true,
    panel: true,
  },
  'widget-settings.need-do-put-then.restore-defaults': {
    label: 'Restore defaults button in Need Do Put Then settings',
    perField: true,
    panel: true,
    destructive: true,
  },
  'widget-settings.need-do-put-then.add-item': {
    label: 'Add item button in Need Do Put Then settings',
    perField: true,
    panel: true,
  },
  'random.group-size-down': {
    label:
      'Minus button on a group-count stepper in Random Picker, by stepper (size, home, expert)',
    perField: true,
  },
  'random.group-size-up': {
    label:
      'Plus button on a group-count stepper in Random Picker, by stepper (size, home, expert)',
    perField: true,
  },
  'random.group-size-mode': {
    label:
      'Label button that switches the Groups stepper between number of groups and students per group',
    perField: true,
  },
  'random.jigsaw-view': {
    label:
      'Expert or Home view button in the Random Picker Jigsaw footer, by view',
    perField: true,
  },
  'random.rotate': {
    label: 'Rotate groups button in Random Picker',
    perWidget: true,
  },
  'random.send-to-scoreboard': {
    label:
      'Send groups to Scoreboard button in Random Picker (replaces the Scoreboard teams)',
    perWidget: true,
    destructive: true,
  },
  'random.show-absent': {
    label:
      'Mark absent students button on the Random Picker everyone-absent screen',
    perWidget: true,
  },
  'random.group-rename': {
    label: 'Rename pencil on a Randomizer group header, by group number',
    perField: true,
  },
  'random.chip-lock': {
    label: 'Lock button on a student chip in Random Picker',
    perWidgetType: true,
  },
  'random.chip-done': {
    label: 'Done check button on a student chip in Random Picker Shuffle mode',
    perWidgetType: true,
  },
  'random.class-option': {
    label: 'Class choice in the Randomizer class menu',
    perWidgetType: true,
    panel: true,
  },
  'catalyst.set': {
    label: 'Set button in Catalyst',
    perWidget: true,
  },
  'catalyst.back': {
    label: 'Back to sets button in Catalyst',
    perWidget: true,
  },
  'catalyst.routine': {
    label: 'Routine button in Catalyst',
    perWidget: true,
  },
  'catalyst.picker-set': {
    label: 'Set tile in the Catalyst dock picker',
    perWidgetType: true,
    panel: true,
  },
  'catalyst.picker-routine': {
    label: 'Routine icon in the Catalyst dock picker',
    perWidgetType: true,
    panel: true,
  },
  'drawing.tool': {
    label:
      'Tool button in the Drawing toolbar, by tool (select, pen, highlighter, eraser, text, shape)',
    perField: true,
  },
  'drawing.undo': {
    label: 'Undo button in Drawing',
    perWidget: true,
  },
  'drawing.redo': {
    label: 'Redo button in Drawing',
    perWidget: true,
  },
  'drawing.clear': {
    label: 'Clear All button in Drawing',
    perWidget: true,
    destructive: true,
  },
  'drawing.insert-image': {
    label: 'Insert image button in Drawing',
    perWidget: true,
    persists: true,
  },
  'drawing.export': {
    label: 'Export button in Drawing',
    perWidget: true,
  },
  'drawing.export-png-page': {
    label: 'Export PNG (this page) item in the Drawing export menu',
    perWidgetType: true,
    panel: true,
    persists: true,
  },
  'drawing.export-png-all': {
    label: 'Export PNG (all pages) item in the Drawing export menu',
    perWidgetType: true,
    panel: true,
    persists: true,
  },
  'drawing.export-pdf': {
    label: 'Export PDF item in the Drawing export menu',
    perWidgetType: true,
    panel: true,
    persists: true,
  },
  'drawing.extract-text': {
    label: 'Extract Text (AI) button in Drawing',
    perWidget: true,
    persists: true,
  },
  'drawing.eraser-mode': {
    label:
      'Eraser mode button in the Drawing tool options, by mode (stroke, object, lasso)',
    perField: true,
    panel: true,
  },
  'drawing.stroke-width': {
    label: 'Stroke width slider in the Drawing tool options',
    perWidgetType: true,
    panel: true,
  },
  'drawing.page-prev': {
    label: 'Previous page button in Drawing',
    perWidgetType: true,
  },
  'drawing.page-next': {
    label: 'Next page button in Drawing',
    perWidgetType: true,
  },
  'drawing.page-manage': {
    label: 'Manage pages button in Drawing',
    perWidgetType: true,
  },
  'drawing.page-title': {
    label: 'Page title button that renames the current Drawing page',
    perWidgetType: true,
  },
  'drawing.add-page': {
    label: 'Add page button in Drawing (single-page view)',
    perWidgetType: true,
  },
  'drawing.page-menu-add': {
    label: 'Add page button in the Drawing pages menu',
    perWidgetType: true,
    panel: true,
  },
  'drawing.page-item': {
    label: 'Page row in the Drawing pages menu, by page number',
    perField: true,
    panel: true,
  },
  'drawing.page-rename': {
    label:
      'Rename pencil on a page row in the Drawing pages menu, by page number',
    perField: true,
    panel: true,
  },
  'drawing.page-remove': {
    label:
      'Remove page button on a page row in the Drawing pages menu, by page number',
    perField: true,
    panel: true,
    destructive: true,
  },
  'seating.mode': {
    label: 'Mode button in Seating Chart (Interact, Assign, Setup)',
    perField: true,
  },
  'seating.pick-random': {
    label: 'Pick Random button in Seating Chart',
    perWidget: true,
  },
  'seating.rotate-selected-left': {
    label: 'Rotate all selected furniture left button in Seating Chart',
    perWidget: true,
  },
  'seating.rotate-selected-right': {
    label: 'Rotate all selected furniture right button in Seating Chart',
    perWidget: true,
  },
  'seating.remove-selected': {
    label: 'Remove all selected furniture button in Seating Chart',
    perWidget: true,
    destructive: true,
  },
  'seating.template': {
    label: 'Layout template button in Seating Chart Setup, by template',
    perField: true,
  },
  'seating.template-columns': {
    label: 'Number of columns input in Seating Chart Setup',
    perWidget: true,
  },
  'seating.apply-layout': {
    label:
      'Apply Layout button in Seating Chart Setup (replaces the furniture)',
    perWidget: true,
    destructive: true,
  },
  'seating.add-furniture': {
    label: 'Add furniture button in Seating Chart Setup, by furniture type',
    perField: true,
  },
  'seating.reset-canvas': {
    label: 'Reset Canvas button in Seating Chart Setup',
    perWidget: true,
    destructive: true,
  },
  'seating.add-all-random': {
    label: 'Add All Random button in Seating Chart Assign mode',
    perWidget: true,
  },
  'seating.unseated-student': {
    label: 'Unseated student card in Seating Chart Assign mode',
    perWidget: true,
  },
  'seating.rotate-item-left': {
    label: 'Rotate left button on the selected Seating Chart furniture',
    perWidget: true,
  },
  'seating.rotate-item-right': {
    label: 'Rotate right button on the selected Seating Chart furniture',
    perWidget: true,
  },
  'seating.duplicate-item': {
    label: 'Duplicate button on the selected Seating Chart furniture',
    perWidget: true,
  },
  'seating.remove-item': {
    label: 'Remove button on the selected Seating Chart furniture',
    perWidget: true,
    destructive: true,
  },
  'seating.unseat-student': {
    label:
      'Remove-from-seat button on an assigned student in Seating Chart Assign mode',
    perWidget: true,
  },
  'music.play-pause': {
    label: 'Play or pause button on the Music widget',
    perWidget: true,
  },
  'music.spotify-shuffle': {
    label: 'Shuffle button in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-previous': {
    label: 'Previous button in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-play-pause': {
    label: 'Play or pause button in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-next': {
    label: 'Next button in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-repeat': {
    label: 'Repeat button in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-tab': {
    label: 'Library or Now Playing pill in the Music Spotify player, by view',
    perField: true,
  },
  'music.spotify-search-open': {
    label: 'Search pill in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-search': {
    label: 'Search Spotify input in Music',
    perWidgetType: true,
  },
  'music.spotify-search-close': {
    label: 'Close search button in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-result': {
    label: 'Track, album or playlist row in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-refresh': {
    label: 'Refresh library button in the Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-open-library': {
    label: 'Open library button on the empty Music Spotify player',
    perWidgetType: true,
  },
  'music.spotify-reconnect': {
    label: 'Reconnect Spotify button in the Music Spotify player',
    perWidgetType: true,
    persists: true,
  },
  'widget-settings.music.spotify-connect': {
    label: 'Connect Spotify button in Music settings',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'widget-settings.music.spotify-disconnect': {
    label: 'Disconnect Spotify button in Music settings',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'widget-settings.music.spotify-retry': {
    label:
      'Try again button after a Spotify connection error in Music settings',
    perWidget: true,
    panel: true,
    persists: true,
  },
  'math-tools.grade-filter': {
    label: 'Grade filter dropdown in Math Tools',
    perWidget: true,
  },
  'math-tools.tab': {
    label: 'Section tab in Math Tools, by section',
    perField: true,
  },
  'math-tools.tool': {
    label: 'Tool button in Math Tools, by tool',
    perField: true,
  },
  'math-tools.piece': {
    label: 'Piece button in Math Tools, by tool and piece',
    perField: true,
  },
  'math-tool.rotate': {
    label: 'Rotation grip on a Math Tool',
    perWidgetType: true,
  },
  'smart-notebook.view-mode': {
    label: 'Cards or List view button in the Smart Notebook library, by mode',
    perField: true,
  },
  'smart-notebook.import': {
    label: 'Import button in the Smart Notebook library',
    perWidgetType: true,
    persists: true,
  },
  'smart-notebook.open': {
    label: 'Notebook card in the Smart Notebook library',
    perWidgetType: true,
  },
  'smart-notebook.rename-notebook': {
    label: 'Rename notebook button in the Smart Notebook library',
    perWidgetType: true,
  },
  'smart-notebook.share-notebook': {
    label: 'Share notebook button in Smart Notebook',
    perWidgetType: true,
    persists: true,
  },
  'smart-notebook.delete-notebook': {
    label: 'Delete notebook button in the Smart Notebook library',
    perWidgetType: true,
    destructive: true,
  },
  'smart-notebook.lesson-jump': {
    label: 'Jump to lesson dropdown in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.add-page': {
    label: 'Add blank page button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.toggle-hidden-page': {
    label: 'Hide or show page when presenting button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.remove-page': {
    label: 'Remove page button in Smart Notebook',
    perWidgetType: true,
    destructive: true,
  },
  'smart-notebook.edit-page': {
    label: 'Edit page button in the Smart Notebook viewer',
    perWidgetType: true,
  },
  'smart-notebook.toggle-assets': {
    label: 'Toggle assets button in the Smart Notebook viewer',
    perWidgetType: true,
  },
  'smart-notebook.present': {
    label: 'Present button in the Smart Notebook editor',
    perWidgetType: true,
  },
  'smart-notebook.close-notebook': {
    label: 'Close notebook button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.page-prev': {
    label: 'Previous page button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.page-next': {
    label: 'Next page button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.page-jump': {
    label: 'Jump to page button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.page-thumb': {
    label: 'Page thumbnail in the Smart Notebook jump menu, by page number',
    perField: true,
    panel: true,
  },
  'smart-notebook.zoom-in': {
    label: 'Zoom in button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.zoom-out': {
    label: 'Zoom out button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.zoom-reset': {
    label: 'Reset zoom button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.move-page-earlier': {
    label: 'Move page earlier button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.move-page-later': {
    label: 'Move page later button in Smart Notebook',
    perWidgetType: true,
  },
  'smart-notebook.link-hotspot': {
    label: 'Page link hotspot in Smart Notebook present mode',
    perWidgetType: true,
  },
  'smart-notebook.remove-asset': {
    label: 'Remove placed asset button in Smart Notebook',
    perWidgetType: true,
    destructive: true,
  },
  'smart-notebook.tool': {
    label: 'Tool button in the Smart Notebook editor toolbar, by tool',
    perField: true,
  },
  'smart-notebook.shape': {
    label: 'Shape button in the Smart Notebook shapes options, by shape',
    perField: true,
    panel: true,
  },
  'smart-notebook.layer-order': {
    label:
      'Layer order button in the Smart Notebook editor, by direction (front, forward, backward, back)',
    perField: true,
  },
  'smart-notebook.background': {
    label: 'Page background button in the Smart Notebook editor',
    perWidgetType: true,
  },
  'smart-notebook.pen-color': {
    label: 'Color swatch in the Smart Notebook tool options',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.pen-color-custom': {
    label: 'Custom color picker in the Smart Notebook tool options',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.pen-size': {
    label: 'Size slider in the Smart Notebook tool options',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.background-mode': {
    label:
      'Color, Pattern or Image tab in the Smart Notebook page background dialog, by tab',
    perField: true,
    panel: true,
  },
  'smart-notebook.background-color': {
    label: 'Base color swatch in the Smart Notebook page background dialog',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.background-color-custom': {
    label: 'Custom color picker in the Smart Notebook page background dialog',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.background-pattern': {
    label:
      'Pattern button in the Smart Notebook page background dialog, by pattern',
    perField: true,
    panel: true,
  },
  'smart-notebook.background-image': {
    label: 'Choose image button in the Smart Notebook page background dialog',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.background-apply': {
    label: 'Apply button in the Smart Notebook page background dialog',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.background-cancel': {
    label: 'Cancel button in the Smart Notebook page background dialog',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.background-close': {
    label: 'Close button in the Smart Notebook page background dialog',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.link-page': {
    label: 'Page choice in the Smart Notebook link picker, by page number',
    perField: true,
    panel: true,
  },
  'smart-notebook.link-go': {
    label: 'Go to linked page button in the Smart Notebook link picker',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.link-remove': {
    label: 'Remove link button in the Smart Notebook link picker',
    perWidgetType: true,
    panel: true,
  },
  'smart-notebook.link-close': {
    label: 'Close button in the Smart Notebook link picker',
    perWidgetType: true,
    panel: true,
  },
  'stickers.sticker': {
    label: 'Sticker tile in the Sticker Book',
    perWidgetType: true,
  },
  'stickers.favorite': {
    label: 'Favorite heart on a sticker in the Sticker Book',
    perWidgetType: true,
  },
  'stickers.remove-custom': {
    label: 'Remove button on a custom sticker in the Sticker Book',
    perWidgetType: true,
    destructive: true,
  },
  'stickers.clear-all': {
    label: 'Clear all stickers button in the Sticker Book',
    perWidget: true,
    destructive: true,
  },
  'stickers.upload': {
    label: 'Upload button in the Sticker Book',
    perWidget: true,
    persists: true,
  },
  'stickers.upload-zone': {
    label: 'Upload drop zone in the Sticker Book',
    perWidget: true,
    persists: true,
  },
  'stickers.filter': {
    label:
      'Filter button in the Sticker Book, by filter (all, favorites, mine)',
    perField: true,
  },
  'sticker.options': {
    label: 'Options menu button on a sticker',
    perWidget: true,
  },
  'sticker.bring-forward': {
    label: 'Bring Forward item in the sticker options menu',
    perWidget: true,
    panel: true,
  },
  'sticker.send-backward': {
    label: 'Send Backward item in the sticker options menu',
    perWidget: true,
    panel: true,
  },
  'sticker.remove': {
    label: 'Delete item in the sticker options menu',
    perWidget: true,
    panel: true,
    destructive: true,
  },
  'sticker.rotate-handle': {
    label: 'Rotate handle on a selected sticker',
    perWidget: true,
  },
  'sticker.resize-handle': {
    label: 'Resize handle on a selected sticker',
    perWidget: true,
  },
  'schedule.toggle-item': {
    label:
      'Row button that marks a Schedule row done, by row (active = the Now row)',
    perField: true,
  },
  'widget-settings.schedule.event-name': {
    label: 'Event name input in Schedule settings, by event row',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.event-start-time': {
    label: 'Event start time input in Schedule settings, by event row',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.event-end-time': {
    label: 'Event end time input in Schedule settings, by event row',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.event-timer-minutes': {
    label:
      'Timer minutes input for an event in Schedule settings, by event row',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.event-timer-seconds': {
    label:
      'Timer seconds input for an event in Schedule settings, by event row',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.event-mode': {
    label:
      'Clock or timer mode toggle for an event in Schedule settings, by event row',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.event-auto-launch': {
    label:
      'Auto-launch widget toggle for an event in Schedule settings, by event row',
    perField: true,
    panel: true,
  },
  'widget-settings.schedule.event-auto-launch-widget': {
    label:
      'Widget choice in an event auto-launch list in Schedule settings, by event row and widget',
    perField: true,
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

/** Attrs a shared component spreads onto its control; accepts `tourAttr`, `tourTypeAttr` and `tourFieldAttr` output. */
export type TourAnchorAttrs = Partial<
  Record<
    | 'data-tour'
    | 'data-tour-widget'
    | 'data-tour-widget-type'
    | 'data-tour-field',
    string
  >
>;

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
