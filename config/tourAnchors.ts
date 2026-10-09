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
  'quiz-editor.add-answer-key': {
    label: 'Add answer key in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.bank-notice-dismiss': {
    label: 'Dismiss bank notice (×) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.bulk-tag': {
    label: 'Tag (bulk, selected questions) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.bulk-save-bank': {
    label: 'Save to bank… (bulk) in the Quiz editor',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-editor.bulk-delete': {
    label: 'Delete (bulk) in the Quiz editor',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-editor.bulk-clear': {
    label: 'Clear (selection) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.draft-ai': {
    label: 'Draft with AI (list header) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.add-blank': {
    label: 'Add-menu item: Blank question in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.add-section': {
    label: 'Add-menu item: Section in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.add-from-bank': {
    label: 'Add-menu item: From question bank… in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.question-row': {
    label: 'Question row (click to select; clickable div) in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.question-drag': {
    label: 'Drag handle, question row in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.question-select': {
    label: 'Select question checkbox in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.question-duplicate': {
    label: 'Duplicate question in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.question-delete': {
    label: 'Delete question in the Quiz editor',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-editor.prompt-blank': {
    label: 'Blank (insert ___ in FIB prompt) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.targets-edit': {
    label: 'Learning targets Add/Edit in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.time-limit': {
    label: 'Time limit input in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.points': {
    label: 'Points input in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.printed-number': {
    label: 'Printed number input in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.partial-credit': {
    label: 'Partial credit checkbox (matching, ordering) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.placeholder': {
    label: 'Placeholder input (FRQ) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.rubric-edit': {
    label: 'Rubric: Edit in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.rubric-detach': {
    label: 'Rubric: Detach in the Quiz editor',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-editor.rubric-attach': {
    label: 'Attach rubric in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.fib-answer': {
    label: 'Correct answer input (FIB / short answer) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.distractor': {
    label: 'Distractor input, per index in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.distractor-remove': {
    label: 'Remove distractor (×) in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.distractor-add': {
    label: 'Add choice in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.ai-prompt': {
    label: 'AI describe-your-quiz textarea in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.ai-count-dec': {
    label: 'AI question count – in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.ai-count-inc': {
    label: 'AI question count + in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.footer-draft-ai': {
    label: 'Draft with AI (modal footer) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.bank-targets-add': {
    label: 'Bank targets: Add in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.tab-questions': {
    label: 'Questions editor tab in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.tab-stimuli': {
    label: 'Stimuli editor tab in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.tab-settings': {
    label: 'Settings editor tab in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.tab-languages': {
    label: 'Languages editor tab in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.option-remove': {
    label: 'Remove option (×) in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.option-add': {
    label: 'Add option in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.multi-correct': {
    label: 'Multiple correct answers checkbox in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.choice-partial-credit': {
    label: 'Partial credit checkbox (multi-answer) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.fib-blank': {
    label: 'Blank N answer input in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.fib-alternate': {
    label: 'Also-accept input in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.fib-alternate-remove': {
    label: 'Remove also-accept (×) in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.fib-alternate-add': {
    label: 'Add also-accept in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.multi-answer-item': {
    label: 'Answer item input (shared, per index) in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.multi-answer-remove': {
    label: 'Remove answer item in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.multi-answer-add': {
    label: 'Add answer item in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.match-drag': {
    label: 'Drag to reorder (matching pair) in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.match-term': {
    label: 'Matching term input in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.match-definition': {
    label: 'Matching definition input in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.match-remove': {
    label: 'Remove pair in the Quiz editor',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-editor.match-add': {
    label: 'Add pair in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.match-distractor': {
    label: 'Distractor input in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.match-distractor-remove': {
    label: 'Remove distractor in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.match-distractor-add': {
    label: 'Add distractor in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.order-drag': {
    label: 'Drag to reorder (ordering item) in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.order-item': {
    label: 'Ordering item input in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.order-up': {
    label: 'Move item up in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.order-down': {
    label: 'Move item down in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.order-remove': {
    label: 'Remove ordering item in the Quiz editor',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-editor.order-add': {
    label: 'Add ordering item in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.recording-prep': {
    label: 'Prep seconds input (spoken response) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.recording-limit': {
    label: 'Time limit seconds input (spoken response) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.recording-limit-clamp': {
    label: 'Clamp-to-ceiling link (shown when clamped) in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.recording-expiry': {
    label: 'Prep expiry option buttons (per option) in the Quiz editor',
    perField: true,
    panel: true,
  },
  'quiz-editor.word-min': {
    label: 'Minimum words input in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.word-max': {
    label: 'Maximum words input in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.word-enforce': {
    label: 'Enforce limit toggle in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.section-drag': {
    label: 'Drag handle, section in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.section-title': {
    label: 'Section title input in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.section-directions': {
    label: 'Section directions textarea in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.section-choose-count': {
    label: '"Students answer … of these N" select in the Quiz editor',
    perWidgetType: true,
    panel: true,
  },
  'quiz-editor.section-remove': {
    label: 'Remove section in the Quiz editor',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-banks.picker-source': {
    label:
      'Bank source row (My banks or Shared with me) in Quiz banks, by item',
    perField: true,
    panel: true,
  },
  'quiz-banks.picker-mode': {
    label: 'Mode tabs - Pick questions or Random draw in Quiz banks, by item',
    perField: true,
    panel: true,
  },
  'quiz-banks.picker-back': {
    label: 'Back to banks in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.picker-close': {
    label: 'Close in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.picker-search': {
    label: 'Search banks input in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.picker-question-search': {
    label: 'Search questions input in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.picker-select-all': {
    label: 'Select all or Clear questions in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.picker-question-check': {
    label: 'Question checkbox in Quiz banks, by item',
    perField: true,
    panel: true,
  },
  'quiz-banks.picker-count': {
    label: 'Questions per attempt input in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.picker-points': {
    label: 'Points each input in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.picker-cancel': {
    label: 'Cancel in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.picker-submit': {
    label: 'Add questions or Add random draw in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.slot-select': {
    label:
      'Slot row click (selects slot; clickable div) in Quiz banks, by item',
    perField: true,
    panel: true,
  },
  'quiz-banks.slot-drag': {
    label: 'Drag handle in Quiz banks, by item',
    perField: true,
    panel: true,
  },
  'quiz-banks.slot-remove-icon': {
    label: 'Remove bank slot in Quiz banks, by item',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-banks.slot-count': {
    label: 'Questions per attempt input in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.slot-points': {
    label: 'Points input in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.slot-remove': {
    label: 'Remove slot in Quiz banks',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-banks.target-filter-tag': {
    label: 'Target filter tag chips in Quiz banks, by item',
    perField: true,
    panel: true,
  },
  'quiz-banks.target-filter-clear': {
    label: 'Clear target filter in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.cartridge-close': {
    label: 'Close in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.cartridge-folder-name': {
    label: 'Folder name input in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.cartridge-select-all': {
    label: 'Select all in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.cartridge-select-none': {
    label: 'Select none in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.cartridge-row-check': {
    label: 'Bank row checkbox in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.cartridge-row-expand': {
    label: 'Show or hide questions in a bank in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.cartridge-share-pictures': {
    label: 'Share pictures checkbox in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.cartridge-cancel': {
    label: 'Cancel or Done in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.cartridge-import': {
    label: 'Import N in Quiz import',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-import.cartridge-retry': {
    label: 'Retry failed in Quiz import',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-import.paper-close': {
    label: 'Close in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-batch': {
    label: 'Batch select in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-assignment': {
    label: 'Assignment select (new administration or existing) in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-resume': {
    label: 'Resume review in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-discard': {
    label: 'Discard it in Quiz import',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-import.paper-upload': {
    label: 'Upload scan in Quiz import',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-import.paper-drive': {
    label: 'Pick scan from Drive in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-key-select': {
    label: 'Answer key select in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.paper-key-confirm': {
    label: 'Key confirmed checkbox in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-tag-all': {
    label: 'Tag all questions in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-tag-question': {
    label: 'Tag or Edit in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.paper-seat-student': {
    label: 'Student-for-seat select in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.paper-answer-letter': {
    label: 'Answer letter buttons in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.paper-answer-blank': {
    label: 'Blank answer in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.paper-retry-upload': {
    label: 'Retry failed uploads in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-replace-seat': {
    label: 'Replace seat checkbox in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.paper-replace-submit': {
    label: 'Replace selected in Quiz import',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-import.paper-back': {
    label: 'Back in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-import': {
    label: 'Import N sheets in Quiz import',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-import.paper-done': {
    label: 'Done in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-text-close': {
    label: 'Close in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-text-upload': {
    label: 'Upload file dropzone in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-text-drive': {
    label: 'Pick from Drive in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-text-apply': {
    label: 'Apply-question checkbox in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.paper-text-draft': {
    label: 'Question text textarea in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.paper-text-back': {
    label: 'Back (key-fill step) in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-text-save-key': {
    label: 'Save key fill in Quiz import',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-import.paper-text-back-review': {
    label: 'Back (review step) in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-text-apply-submit': {
    label: 'Apply to N questions in Quiz import',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-import.paper-text-cancel': {
    label: 'Cancel in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.select-mode': {
    label: 'Select or Cancel selection-mode toggle in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.empty-new-bank': {
    label: 'New bank empty-state button in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.shared-preview': {
    label: 'Preview on a shared bank row in Quiz banks, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.review-only-flagged': {
    label: 'Show only flagged rows in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.review-include': {
    label: 'Include question checkbox in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.review-question-text': {
    label: 'Question text textarea in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.review-choice-correct': {
    label: 'Correct-choice checkbox in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.review-answer-radio': {
    label: 'Correct-answer radio in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.review-remove-picture': {
    label: 'Remove linked picture in Quiz import, by item',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-import.review-link-picture': {
    label: 'Link picture select in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.key-standards-add-all': {
    label: 'Add N standards (all key standards) in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.key-standard-add': {
    label: 'Add standard in Quiz import, by item',
    perField: true,
    panel: true,
  },
  'quiz-import.targets-add-all': {
    label: 'Add all suggested targets in Quiz import',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-import.targets-destination': {
    label: 'New targets go in destination select in Quiz import',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.targets-add-one': {
    label: 'Add or Create target in Quiz import, by item',
    perField: true,
    persists: true,
    panel: true,
  },
  'quiz-banks.save-close': {
    label: 'Close in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.save-target': {
    label: 'Target bank select in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.save-title': {
    label: 'New bank title input in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.save-cancel': {
    label: 'Cancel in Quiz banks',
    perWidgetType: true,
    panel: true,
  },
  'quiz-banks.save-submit': {
    label: 'Save to bank in Quiz banks',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-library.back-translate': {
    label: 'Back-translate in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.empty-import': {
    label: 'Empty-state Import (No quizzes yet) in the Quiz widget',
    perWidgetType: true,
  },
  'quiz-library.language-generate': {
    label: 'Generate translations in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.language-locale': {
    label: 'Locale chip in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-library.language-question': {
    label: 'Question selector in translation list in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-library.language-read-aloud-select': {
    label: 'Read-aloud language select in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.language-regenerate-stale': {
    label: 'Regenerate stale in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.language-reviewed': {
    label: 'Reviewed checkbox in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-library.language-save': {
    label: 'Save translations in the Quiz widget',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-library.language-tag-input': {
    label: 'Other language tag input in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.language-translated-text': {
    label: 'Translated text textarea in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-library.preview-back': {
    label: 'Back arrow (header) in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.preview-blank-input': {
    label: 'Fill-in-the-blank input in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-library.preview-check-answer': {
    label: 'Check Answer (multi-answer) in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.preview-dot': {
    label: 'Question dot navigation, per question in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-library.preview-go-back': {
    label: 'Go Back (empty state) in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.preview-mc-option': {
    label: 'Multiple-choice option in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-library.preview-multi-option': {
    label: 'Multi-answer option (checkbox role) in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-library.preview-next': {
    label: 'NEXT in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.preview-prev': {
    label: 'PREV in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.preview-reset': {
    label: 'Reset question in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.preview-reveal-fib': {
    label: 'Reveal Correct Answer (fill-in) in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.preview-reveal-sequence': {
    label: 'Reveal Sequence in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.cancel': {
    label: 'Print sheets Cancel in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.close': {
    label: 'Print sheets close (×) in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.import-remove': {
    label: 'Remove imported test document in the Quiz widget',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-print.include-key-sheet': {
    label: 'Include answer key sheet toggle in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.include-question-text': {
    label: 'Include question text toggle in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.pdf-page-add': {
    label: 'PDF page Add page in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.pdf-page-cancel': {
    label: 'PDF page picker Cancel in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.pdf-page-number': {
    label: 'PDF page number input in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.print': {
    label: 'Print response sheets in the Quiz widget',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-print.print-test-paper': {
    label: 'Print test paper in the Quiz widget',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-print.results-cancel': {
    label: 'Print results Cancel in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.results-close': {
    label: 'Print results close (×) in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.results-key-mode': {
    label: 'Show the key radios in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.results-layout': {
    label: 'Layout radios in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.results-more-options': {
    label: 'More print options disclosure in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.results-option-toggle': {
    label: 'Option toggles from TOGGLES map in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.results-preset': {
    label: 'Preset chips (radio group) in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.results-print': {
    label: 'Print results Print in the Quiz widget',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-print.results-report-choice': {
    label: 'Report choice cards (radio group) in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.results-select-all': {
    label: 'Select all / Select none in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.results-student-select': {
    label: 'Per-student checkbox in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.results-written-mode': {
    label: 'Written answers mode radios in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.roster-expand': {
    label: 'Roster expand/collapse in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.roster-select': {
    label: 'Roster select-all checkbox in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.share-and-print': {
    label: 'Share and print in the Quiz widget',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-print.share-print-only': {
    label: 'Print without sharing in the Quiz widget',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-print.sheet-stimuli-drive': {
    label: 'Drive image (icon) in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.sheet-stimuli-from-quiz': {
    label: 'From this quiz picker toggle in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.sheet-stimuli-quiz-image': {
    label: 'Quiz image choice in picker in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.sheet-stimuli-template': {
    label: 'Template picker toggle in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.sheet-stimuli-template-choice': {
    label: 'Template choice in picker in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.sheet-stimuli-toggle': {
    label: 'Section disclosure in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.sheet-stimuli-upload': {
    label: 'Upload image (icon) in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.sheet-stimulus-caption': {
    label: 'Caption input in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.sheet-stimulus-move-down': {
    label: 'Move stimulus down in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.sheet-stimulus-move-up': {
    label: 'Move stimulus up in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.sheet-stimulus-number': {
    label: 'Template number field (Lowest/Highest) in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.sheet-stimulus-pages': {
    label: 'Pages select in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.sheet-stimulus-quadrants': {
    label: 'Quadrants select in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.sheet-stimulus-remove': {
    label: 'Remove stimulus in the Quiz widget',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-print.sheet-stimulus-template-field': {
    label: 'Template field checkbox-or-number input in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.sheets-done': {
    label: 'Printed batch Done in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.spare-count': {
    label: 'Spare sheets count input in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.stub-choice-count': {
    label: 'Stub Choices per question select in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.stub-question-count': {
    label: 'Stub Questions count input in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.stub-title': {
    label: 'Stub paper Title input in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.student-select': {
    label: 'Per-student checkbox in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.written-add': {
    label: 'Written answers Add in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.written-box-size': {
    label: 'Written box size select in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.written-number': {
    label: 'Written answers question-number input in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.written-points': {
    label: 'Written points input in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-print.written-remove': {
    label: 'Remove written question (×) in the Quiz widget',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-stimuli.add-passage': {
    label: 'Add a passage in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-stimuli.attach-all-questions': {
    label: 'All questions attach checkbox in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-stimuli.attach-bank-slot': {
    label: 'Per-bank-slot attach checkbox in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-stimuli.attach-question': {
    label: 'Per-question attach checkbox in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-stimuli.attach-stimulus': {
    label: 'Per-stimulus attach checkbox in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-stimuli.attach-toggle': {
    label: 'Attach section Stimuli disclosure in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-stimuli.card-delete': {
    label: 'Delete stimulus in the Quiz widget',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-stimuli.card-expand': {
    label: 'Stimulus card expand/collapse in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-stimuli.card-label': {
    label: 'Stimulus label input in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-stimuli.choose-drive': {
    label: 'Choose from Drive in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-stimuli.choose-file': {
    label: 'Choose file in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-stimuli.passage-text': {
    label: 'Passage textarea in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-stimuli.play-limit': {
    label: 'Play limit input in the Quiz widget',
    perField: true,
    panel: true,
  },
  'quiz-stimuli.read-aloud-clear': {
    label: 'Read-aloud Clear in the Quiz widget',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-stimuli.read-aloud-extract': {
    label: 'Extract text in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-stimuli.read-aloud-text': {
    label: 'Read-aloud text textarea in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-stimuli.read-aloud-toggle': {
    label: 'Read-aloud text disclosure in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-stimuli.url-add': {
    label: 'URL Add in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-stimuli.url-input': {
    label: 'Paste a link input in the Quiz widget',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.back': {
    label: 'Back button in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.print': {
    label: 'Print results button in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.hide-names': {
    label: 'Hide student names toggle in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.sheet-recovery': {
    label: 'Export to my own sheet button in Quiz results',
    perWidgetType: true,
    persists: true,
  },
  'quiz-results.period-filter': {
    label: 'Period filter chip in Quiz results, by period',
    perField: true,
  },
  'quiz-results.drill-questions': {
    label: 'Questions drill row in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.drill-targets': {
    label: 'Targets drill row in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.drill-students': {
    label: 'Students drill row in Quiz results',
    perWidgetType: true,
  },
  'quiz-grading.open': {
    label: 'Grade button in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.push-grades': {
    label: 'Push Grades in Quiz results',
    perWidgetType: true,
    persists: true,
  },
  'quiz-results.push-schoology': {
    label: 'Push to Schoology in Quiz results',
    perWidgetType: true,
    persists: true,
  },
  'quiz-results.scoreboard': {
    label: 'Send to Scoreboard in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.sheet-refresh': {
    label: 'Refresh linked sheet in Quiz results',
    perWidgetType: true,
    persists: true,
  },
  'quiz-results.export-sheets': {
    label: 'Export to Sheets in Quiz results',
    perWidgetType: true,
    persists: true,
  },
  'quiz-results.scoreboard-names': {
    label: 'Student Names option in the Scoreboard prompt in Quiz results',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-results.scoreboard-pins': {
    label: 'PINs Only option in the Scoreboard prompt in Quiz results',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-results.select-students': {
    label: 'Select these students button in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.outcome-row': {
    label: 'Distribution row toggle in Quiz results, by position',
    perField: true,
  },
  'quiz-results.question-sort': {
    label: 'Question sort chip in Quiz results, by option',
    perField: true,
  },
  'quiz-results.question-toggle': {
    label: 'Question row expand toggle in Quiz results, by position',
    perField: true,
  },
  'quiz-results.student-print-answers': {
    label:
      'Include correct answers checkbox in a student report in Quiz results',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.student-print': {
    label: 'Print report button in a student report in Quiz results',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.students-select-all': {
    label: 'Select all students checkbox in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.students-sort': {
    label: 'Sort students option in Quiz results, by option',
    perField: true,
  },
  'quiz-results.students-score-display': {
    label: 'Show scores as option in Quiz results, by option',
    perField: true,
  },
  'quiz-results.student-delete-confirm': {
    label: 'Yes button in the delete submission confirm in Quiz results',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-results.student-delete-cancel': {
    label: 'Cancel button in the delete submission confirm in Quiz results',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.student-select': {
    label: 'Select student row checkbox in Quiz results, by position',
    perField: true,
  },
  'quiz-results.student-toggle': {
    label: 'Student row expand button in Quiz results, by row',
    perField: true,
  },
  'quiz-results.student-unlock': {
    label: 'Unlock results in Quiz results, by position',
    perField: true,
    persists: true,
  },
  'quiz-results.student-delete': {
    label: 'Delete this submission in Quiz results, by position',
    perField: true,
    destructive: true,
  },
  'quiz-results.student-results-menu': {
    label: 'Results options menu button in Quiz results, by student',
    perField: true,
    persists: true,
  },
  'quiz-results.student-show': {
    label: 'Show results button for a student in Quiz results, by student',
    perField: true,
    persists: true,
    panel: true,
  },
  'quiz-results.student-hide': {
    label: 'Hide button for a student in Quiz results, by student',
    perField: true,
    persists: true,
    panel: true,
  },
  'quiz-results.student-follow-class': {
    label: 'Follow class button for a student in Quiz results, by student',
    perField: true,
    persists: true,
    panel: true,
  },
  'quiz-results.bulk-show': {
    label: 'Show results… in Quiz results',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-results.bulk-hide': {
    label: 'Hide results in Quiz results',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-results.bulk-follow-class': {
    label: 'Follow class in Quiz results',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-results.bulk-copy-names': {
    label: 'Copy names in Quiz results',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.bulk-print': {
    label: 'Print selected in Quiz results',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.bulk-reopen': {
    label: 'Reopen in Quiz results',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-results.bulk-clear': {
    label: 'Clear selection in Quiz results',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.show-results-level': {
    label: 'What they see option in the Show results dialog, by level',
    perField: true,
    panel: true,
  },
  'quiz-results.show-results-expiry': {
    label: 'Stop showing option in the Show results dialog, by option',
    perField: true,
    panel: true,
  },
  'quiz-results.show-results-cancel': {
    label: 'Cancel button in the Show results dialog',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.show-results-confirm': {
    label: 'Show results button in the Show results dialog',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-grading.answer-grade': {
    label:
      'Grade button beside a question in a student report in Quiz results, by question',
    perField: true,
  },
  'quiz-results.drilldown-open-student': {
    label: 'Student name button in Quiz results, by student',
    perField: true,
  },
  'quiz-results.target-row-toggle': {
    label: 'Target mastery row expand in Quiz results, by target',
    perField: true,
  },
  'quiz-results.targets-export-csv': {
    label: 'Export CSV in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.targets-sort-student': {
    label: 'Sort by Student in Quiz results',
    perWidgetType: true,
  },
  'quiz-results.targets-sort-target': {
    label: 'Sort by target column in Quiz results, by column',
    perField: true,
  },
  'quiz-grading.annotate-text': {
    label: 'Annotatable response text in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.annotate-color': {
    label: 'Highlight colour swatch in the Quiz grader, by colour',
    perField: true,
    panel: true,
  },
  'quiz-grading.annotate-delete': {
    label: 'Delete annotation in the Quiz grader',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-grading.annotate-close': {
    label: 'Close annotation editor in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.annotate-comment': {
    label: 'Margin comment textarea in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.audio-retry': {
    label: 'Retry load in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.audio-play': {
    label: 'Play / pause in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.audio-skip-silence': {
    label: 'Skip to speech in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.audio-scrubber': {
    label: 'Recording scrubber in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.audio-add-comment': {
    label: 'Add comment at playhead in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.audio-note-seek': {
    label: 'Seek to timestamp in the Quiz grader, by comment',
    perField: true,
    panel: true,
  },
  'quiz-grading.audio-note-remove': {
    label: 'Remove comment in the Quiz grader, by comment',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-grading.audio-note-comment': {
    label: 'Comment textarea in the Quiz grader, by comment',
    perField: true,
    panel: true,
  },
  'quiz-grading.empty-close': {
    label: 'Close button in the empty Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.retry-save': {
    label: 'Retry failed saves in the Quiz grader',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-grading.mode-toggle': {
    label: 'Question / Student mode toggle in the Quiz grader, by position',
    perField: true,
    panel: true,
  },
  'quiz-grading.auto-advance': {
    label: 'Auto-advance switch in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.advance-prev': {
    label: 'Previous response in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.advance-next': {
    label: 'Next response in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.rail-expand': {
    label: 'Expand student list in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.rail-collapse': {
    label: 'Collapse student list in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.student-prev': {
    label: 'Previous student in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.student-next': {
    label: 'Next student in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.student-select': {
    label: 'Student row in queue in the Quiz grader, by student',
    perField: true,
    panel: true,
  },
  'quiz-grading.question-prev': {
    label: 'Previous question in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.question-next': {
    label: 'Next question in the Quiz grader',
    perWidgetType: true,
    panel: true,
  },
  'quiz-grading.slot-tab': {
    label: 'Media slot tab in the Quiz grader, by slot',
    perField: true,
    panel: true,
  },
  'quiz-grading.unavailable-choice': {
    label: 'Unavailable recording choice in the Quiz grader, by choice',
    perField: true,
    panel: true,
  },
  'quiz-grading.points': {
    label: 'Points input in the Quiz grader',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-grading.comment': {
    label: 'Teacher comment box in the Quiz grader',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-grading.take-pin': {
    label: 'Take pin button in the Quiz grader, by take',
    perField: true,
    panel: true,
  },
  'quiz-grading.undo-excuse': {
    label: 'Undo excuse in the Quiz grader',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-grading.highlight-select': {
    label: 'Highlight list item in the Quiz grader, by position',
    perField: true,
    panel: true,
  },
  'quiz-grading.rubric-jump-tagged': {
    label: 'Tagged-count jump in the Quiz grader, by criterion',
    perField: true,
    panel: true,
  },
  'quiz-grading.rubric-note-toggle': {
    label: 'Add / hide note toggle in the Quiz grader, by criterion',
    perField: true,
    panel: true,
  },
  'quiz-grading.rubric-level': {
    label: 'Rubric level radio in the Quiz grader, by level',
    perField: true,
    panel: true,
  },
  'quiz-grading.rubric-note': {
    label: 'Criterion note textarea in the Quiz grader, by position',
    perField: true,
    panel: true,
  },
  'quiz-grading.strand-chip': {
    label: 'Strand tag chip in the Quiz grader, by criterion',
    perField: true,
    panel: true,
  },
  'quiz-grading.strand-chip-orphan': {
    label: 'Orphaned strand chip in the Quiz grader, by criterion',
    perField: true,
    panel: true,
  },
  'quiz-rubric.builder-resize': {
    label: 'Resize handle on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.builder-close': {
    label: 'Close button on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.builder-library': {
    label: 'Library select on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.builder-import-code': {
    label: 'Share code or link input on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.builder-import': {
    label: 'Import shared rubric on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.builder-title': {
    label: 'Rubric title input on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.criterion-name': {
    label: 'Criterion name input on the Quiz rubric builder, by criterion',
    perField: true,
    panel: true,
  },
  'quiz-rubric.criterion-up': {
    label: 'Move criterion up on the Quiz rubric builder, by position',
    perField: true,
    panel: true,
  },
  'quiz-rubric.criterion-down': {
    label: 'Move criterion down on the Quiz rubric builder, by position',
    perField: true,
    panel: true,
  },
  'quiz-rubric.criterion-remove': {
    label: 'Remove criterion on the Quiz rubric builder, by position',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-rubric.level-label': {
    label: 'Level label textarea on the Quiz rubric builder, by level',
    perField: true,
    panel: true,
  },
  'quiz-rubric.level-points': {
    label: 'Level points input on the Quiz rubric builder, by level',
    perField: true,
    panel: true,
  },
  'quiz-rubric.level-description': {
    label: 'Level description textarea on the Quiz rubric builder, by level',
    perField: true,
    panel: true,
  },
  'quiz-rubric.level-remove': {
    label: 'Remove level on the Quiz rubric builder, by level',
    perField: true,
    destructive: true,
    panel: true,
  },
  'quiz-rubric.level-add': {
    label: 'Add level on the Quiz rubric builder, by criterion',
    perField: true,
    panel: true,
  },
  'quiz-rubric.criterion-add': {
    label: 'Add criterion on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.csv-import': {
    label: 'Import CSV on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.csv-export': {
    label: 'Export CSV on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.share': {
    label: 'Share rubric on the Quiz rubric builder',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-rubric.share-link': {
    label: 'Rubric share link field on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.share-copy': {
    label: 'Copy rubric share link on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.save-library': {
    label: 'Save to library on the Quiz rubric builder',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-rubric.attach': {
    label: 'Attach rubric to question on the Quiz rubric builder',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-rubric.detach': {
    label: 'Detach rubric on the Quiz rubric builder',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-rubric.csv-help-close': {
    label: 'Close button on the CSV import help in the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.csv-template': {
    label: 'Download template CSV on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-rubric.csv-drop': {
    label: 'CSV drop zone on the Quiz rubric builder',
    perWidgetType: true,
    panel: true,
  },
  'quiz-monitor.back': {
    label: 'Back button in the Quiz monitor',
    perWidget: true,
  },
  'quiz-monitor.period-filter': {
    label: 'Class filter chip in the Quiz monitor',
    perField: true,
  },
  'quiz-monitor.menu-present': {
    label: 'Present to class item in the Quiz monitor menu',
    perWidget: true,
    panel: true,
  },
  'quiz-monitor.menu-mute-sounds': {
    label: 'Mute or unmute sounds item in the Quiz monitor menu',
    perWidget: true,
    panel: true,
  },
  'quiz-monitor.menu-show-join-code': {
    label: 'Join code button in the Quiz monitor',
    perWidget: true,
  },
  'quiz-monitor.menu-question-results': {
    label: 'Question results button in the Quiz monitor',
    perWidget: true,
  },
  'quiz-monitor.menu-settings': {
    label: 'Quiz settings button in the Quiz monitor',
    perWidget: true,
  },
  'quiz-monitor.roster-row-actions': {
    label: 'Student actions button in the Quiz monitor roster',
    perField: true,
  },
  'quiz-monitor.student-let-in': {
    label: 'Let in now item in the Quiz monitor student menu',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-monitor.student-unlock-attempt': {
    label: 'Unlock attempt item in the Quiz monitor student menu',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-monitor.student-unlock-results': {
    label: 'Unlock results item in the Quiz monitor student menu',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'quiz-monitor.student-remove': {
    label: 'Remove student item in the Quiz monitor student menu',
    perWidgetType: true,
    destructive: true,
    panel: true,
  },
  'quiz-monitor.roster-sort': {
    label: 'Sort students select in the Quiz monitor roster',
    perWidgetType: true,
  },
  'quiz-monitor.roster-filter': {
    label: 'Filter students select in the Quiz monitor roster',
    perWidgetType: true,
  },
  'quiz-monitor.clear-hand': {
    label: 'Clear raised hand button in the Quiz monitor roster',
    perField: true,
  },
  'quiz-monitor.period-class-picker': {
    label: 'Class picker select in the Quiz monitor',
    perWidgetType: true,
  },
  'quiz-monitor.period-more-time': {
    label: 'More time button in the Quiz monitor',
    perWidgetType: true,
  },
  'quiz-monitor.period-chip': {
    label: 'Class start or pause chip in the Quiz monitor',
    perField: true,
    persists: true,
  },
  'quiz-monitor.period-time-left': {
    label: 'Class time-left button in the Quiz monitor',
    perField: true,
  },
  'quiz-monitor.period-extend-option': {
    label: 'Extend time option in the Quiz monitor class menu',
    perField: true,
    persists: true,
    panel: true,
  },
  'quiz-monitor.settings-scoreboard-display': {
    label: 'Scoreboard display select in the Quiz monitor settings',
    perWidgetType: true,
  },
  'quiz-monitor.settings-scoreboard-scoring': {
    label: 'Scoreboard scoring select in the Quiz monitor settings',
    perWidgetType: true,
  },
  'quiz-monitor.status-bucket': {
    label: 'Student status bucket button in the Quiz monitor',
    perField: true,
  },
  'quiz-monitor.question-result': {
    label: 'Question result row in the Quiz monitor',
    perField: true,
  },
  'quiz-monitor.copy-join-link': {
    label: 'Copy join link button in the Quiz monitor',
    perWidgetType: true,
  },
  'quiz-monitor.open-join-link': {
    label: 'Preview join link in the Quiz monitor',
    perWidgetType: true,
  },
  'quiz-present.names': {
    label: 'Names toggle in the Quiz presentation controls',
    perWidgetType: true,
  },
  'quiz-present.play-media': {
    label: 'Play media button in the Quiz presentation controls',
    perWidgetType: true,
  },
  'quiz-present.pause-media': {
    label: 'Pause media button in the Quiz presentation controls',
    perWidgetType: true,
  },
  'quiz-present.close': {
    label: 'Close presentation button in the Quiz presentation controls',
    perWidgetType: true,
  },
  'quiz-present.pause-message': {
    label: 'Pause message input in the Quiz presentation controls',
    perWidgetType: true,
  },
  'quiz-monitor.roster-scores': {
    label: 'Scores toggle chip in the Quiz monitor roster',
    perWidgetType: true,
  },
  'quiz-monitor.roster-tab-warnings': {
    label: 'Tab warnings toggle chip in the Quiz monitor roster',
    perWidgetType: true,
  },
  'quiz-monitor.roster-proficiency': {
    label: 'Proficiency colors toggle chip in the Quiz monitor roster',
    perWidgetType: true,
  },
  'quiz-monitor.settings-board-view': {
    label: 'Board view switch in the Quiz monitor settings',
    perWidgetType: true,
  },
  'quiz-monitor.settings-tab-warnings': {
    label: 'Tab warnings switch in the Quiz monitor settings',
    perWidgetType: true,
  },
  'quiz-monitor.settings-podium': {
    label: 'Podium between questions switch in the Quiz monitor settings',
    perWidgetType: true,
  },
  'quiz-monitor.settings-answer-reveal': {
    label: 'Answer reveal on board switch in the Quiz monitor settings',
    perWidgetType: true,
  },
  'quiz-monitor.settings-scoreboard-sync': {
    label: 'Sync to scoreboard widget switch in the Quiz monitor settings',
    perWidgetType: true,
  },
  'quiz-monitor.period-start': {
    label: 'Start button for the picked class in the Quiz monitor',
    perWidgetType: true,
    persists: true,
  },
  'quiz-monitor.period-pause': {
    label: 'Pause button for the picked class in the Quiz monitor',
    perWidgetType: true,
    persists: true,
  },
  'quiz-monitor.period-extend': {
    label: 'Extend time option in the Quiz monitor More time menu',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'review-start.gamification': {
    label: 'Gamification section header in the Start review dialog',
    panel: true,
  },
  'quiz-library.bulk-merge': {
    label: 'Merge button in the Quiz library bulk action bar',
    perWidgetType: true,
    persists: true,
  },
  'quiz-library.bulk-share-plc': {
    label: 'Share with PLC button in the Quiz library bulk action bar',
    perWidgetType: true,
    persists: true,
  },
  'quiz-print.import-ai-toggle': {
    label: 'AI reader toggle in the Quiz print import dialog',
    perWidgetType: true,
    panel: true,
  },
  'quiz-import.paper-text-ai-toggle': {
    label: 'AI reader toggle in the Quiz paper question text dialog',
    perWidgetType: true,
    panel: true,
  },
  'quiz-results.student-view-as': {
    label: 'View as student button on a student row in the Quiz results',
    perField: true,
  },
  'quiz-library.preview-open-editor': {
    label: 'Open editor button in the Quiz library preview pane',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.preview-check-answers': {
    label: 'Check answers button in the Quiz library preview pane',
    perWidgetType: true,
    panel: true,
  },
  'quiz-library.language-preview-voice': {
    label: 'Preview voice button in the Quiz language settings',
    perWidgetType: true,
    panel: true,
  },
  'quiz-print.import-questions': {
    label: 'Import questions uploader in the Quiz print dialog',
    perWidgetType: true,
    panel: true,
  },
  'quiz-settings.focus-mode': {
    label: 'Focus mode toggle in the Quiz assignment settings',
    perWidgetType: true,
    panel: true,
  },
  'quiz-settings.block-copy-paste': {
    label: 'Block copy and paste toggle in the Quiz assignment settings',
    perWidgetType: true,
    panel: true,
  },
  'quiz-settings.shuffle-questions': {
    label: 'Shuffle questions toggle in the Quiz assignment settings',
    perWidgetType: true,
    panel: true,
  },
  'quiz-settings.shuffle-answers': {
    label: 'Shuffle answer options toggle in the Quiz assignment settings',
    perWidgetType: true,
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
  // PLC pages, modals and admin tools
  'admin-plc.group-new': {
    label: 'Group new button in the PLC admin tools',
    persists: true,
  },
  'admin-plc.group-field': {
    label: 'Group field field in the PLC admin tools',
    perField: true,
    panel: true,
  },
  'admin-plc.group-reset': {
    label: 'Group reset button in the PLC admin tools',
    panel: true,
    destructive: true,
  },
  'admin-plc.group-create': {
    label: 'Group create button in the PLC admin tools',
    persists: true,
    panel: true,
  },
  'admin-plc.group-rename-input': {
    label: 'Group rename input field in the PLC admin tools',
    perField: true,
    panel: true,
  },
  'admin-plc.group-rename-save': {
    label: 'Group rename save button in the PLC admin tools',
    persists: true,
    perField: true,
    panel: true,
  },
  'admin-plc.group-rename-cancel': {
    label: 'Group rename cancel button in the PLC admin tools',
    perField: true,
    panel: true,
  },
  'admin-plc.group-auto-roster': {
    label: 'Group auto roster field in the PLC admin tools',
    persists: true,
    perField: true,
  },
  'admin-plc.group-sync': {
    label: 'Group sync button in the PLC admin tools',
    persists: true,
    perField: true,
  },
  'admin-plc.group-rename': {
    label: 'Group rename button in the PLC admin tools',
    persists: true,
    perField: true,
  },
  'admin-plc.group-members': {
    label: 'Group members button in the PLC admin tools',
    perField: true,
  },
  'admin-plc.group-delete': {
    label: 'Group delete button in the PLC admin tools',
    perField: true,
    destructive: true,
  },
  'admin-plc.member-role': {
    label: 'Member role select in the PLC admin tools',
    persists: true,
    perField: true,
  },
  'admin-plc.member-remove': {
    label: 'Member remove button in the PLC admin tools',
    perField: true,
    destructive: true,
  },
  'admin-plc.member-add-person': {
    label: 'Member add person select in the PLC admin tools',
  },
  'admin-plc.member-add-role': {
    label: 'Member add role select in the PLC admin tools',
    persists: true,
  },
  'admin-plc.member-add': {
    label: 'Member add button in the PLC admin tools',
    persists: true,
  },
  'admin-plc.recovery-members': {
    label: 'Recovery members button in the PLC admin tools',
    perField: true,
  },
  'admin-plc.recovery-reassign': {
    label: 'Recovery reassign button in the PLC admin tools',
    perField: true,
  },
  'admin-plc.recovery-dissolve': {
    label: 'Recovery dissolve button in the PLC admin tools',
    perField: true,
    destructive: true,
  },
  'admin-plc.recovery-new-lead': {
    label: 'Recovery new lead select in the PLC admin tools',
    panel: true,
  },
  'admin-plc.recovery-reassign-confirm': {
    label: 'Recovery reassign confirm button in the PLC admin tools',
    persists: true,
    panel: true,
  },
  'admin-plc.recovery-reassign-cancel': {
    label: 'Recovery reassign cancel button in the PLC admin tools',
    panel: true,
  },
  'admin-plc.resource-new': {
    label: 'Resource new button in the PLC admin tools',
    persists: true,
  },
  'admin-plc.resource-close': {
    label: 'Resource close button in the PLC admin tools',
    panel: true,
  },
  'admin-plc.resource-field': {
    label: 'Resource field field in the PLC admin tools',
    perField: true,
    panel: true,
  },
  'admin-plc.resource-save': {
    label: 'Resource save button in the PLC admin tools',
    persists: true,
    panel: true,
  },
  'admin-plc.resource-cancel': {
    label: 'Resource cancel button in the PLC admin tools',
    panel: true,
  },
  'admin-plc.resource-edit': {
    label: 'Resource edit button in the PLC admin tools',
    perField: true,
  },
  'admin-plc.resource-delete': {
    label: 'Resource delete button in the PLC admin tools',
    perField: true,
    destructive: true,
  },
  'admin-plc.target-scope': {
    label: 'Target scope field in the PLC admin tools',
    perField: true,
  },
  'admin-plc.target-plc': {
    label: 'Target plc checkbox in the PLC admin tools',
    perField: true,
  },
  'help-center.guides.copy-link': {
    label: 'Copy link button on a Help Center guide row',
  },
  'help-center.viewer.copy-link': {
    label: 'Copy link button in the Help Center guide viewer',
  },
  'plc-edit.group-type': {
    label: 'Group type select in the PLC edit modal',
  },
  'plcs.empty-create': {
    label: 'Create PLC button in the empty My PLCs list',
    persists: true,
  },
  'plc-import.close': {
    label: 'Close button in the PLC import dialog',
    panel: true,
  },
  'plc-dashboard.back': {
    label: 'Back button in the PLC dashboard',
  },
  'plc-dashboard.close': {
    label: 'Close button in the PLC dashboard',
  },
  'plc-dashboard.section-row': {
    label: 'Section row button in the PLC dashboard',
    perField: true,
  },
  'plc-dashboard.section-tab': {
    label: 'Section tab button in the PLC dashboard',
    perField: true,
  },
  'plc-import.mode': {
    label: 'Mode button in the PLC import dialog',
    persists: true,
    perField: true,
    panel: true,
  },
  'plc-index.close': {
    label: 'Close button in the PLC list page',
  },
  'plc-index.open-plc': {
    label: 'Open plc button in the PLC list page',
    perField: true,
  },
  'plc-assign.teacher-name': {
    label: 'Teacher name field in the PLC assign dialog',
    panel: true,
  },
  'plc-assign.sheet-url': {
    label: 'Sheet url field in the PLC assign dialog',
    panel: true,
  },
  'plc-assign.close': {
    label: 'Close button in the PLC assign dialog',
    panel: true,
  },
  'plc-assign.due-date': {
    label: 'Due date field in the PLC assign dialog',
    panel: true,
  },
  'plc-assign.cancel': {
    label: 'Cancel button in the PLC assign dialog',
    panel: true,
  },
  'plc-assign.submit': {
    label: 'Submit button in the PLC assign dialog',
    persists: true,
    panel: true,
  },
  'plc-dashboard.home': {
    label: 'Home button in the PLC dashboard',
  },
  'plc-share.close': {
    label: 'Close button in the PLC share dialog',
    panel: true,
  },
  'plc-share.search': {
    label: 'Search field in the PLC share dialog',
    panel: true,
  },
  'plc-share.pick-item': {
    label: 'Pick item button in the PLC share dialog',
    perField: true,
    persists: true,
    panel: true,
  },
  'plc-share.target': {
    label: 'Target field in the PLC share dialog',
    perField: true,
    panel: true,
  },
  'plc-share.cancel': {
    label: 'Cancel button in the PLC share dialog',
    panel: true,
  },
  'plc-share.submit': {
    label: 'Submit button in the PLC share dialog',
    persists: true,
    panel: true,
  },
  'plc-print.teammate': {
    label: 'Teammate button in the teammate print dialog',
    perField: true,
    panel: true,
  },
  'plc-print.roster-checkbox': {
    label: 'Roster checkbox checkbox in the teammate print dialog',
    perField: true,
    panel: true,
  },
  'plc-print.roster-expand': {
    label: 'Roster expand button in the teammate print dialog',
    perField: true,
    panel: true,
  },
  'plc-print.student-checkbox': {
    label: 'Student checkbox checkbox in the teammate print dialog',
    perField: true,
    panel: true,
  },
  'plc-print.spares': {
    label: 'Spares field in the teammate print dialog',
    panel: true,
  },
  'plc-print.withdraw': {
    label: 'Withdraw button in the teammate print dialog',
    panel: true,
    destructive: true,
  },
  'plc-print.close': {
    label: 'Close button in the teammate print dialog',
    panel: true,
  },
  'plc-print.test-print': {
    label: 'Test print button in the teammate print dialog',
    persists: true,
    panel: true,
  },
  'plc-print.back': {
    label: 'Back button in the teammate print dialog',
    panel: true,
  },
  'plc-print.print': {
    label: 'Print button in the teammate print dialog',
    persists: true,
    panel: true,
  },
  'plc-assessments.detail-expand': {
    label: 'Detail expand button in the PLC assessments tab',
    perField: true,
  },
  'plc-assessments.detail-back': {
    label: 'Detail back button in the PLC assessments tab',
  },
  'plc-assessments.detail-sort': {
    label: 'Detail sort button in the PLC assessments tab',
    perField: true,
  },
  'plc-assessments.open': {
    label: 'Open button in the PLC assessments tab',
    perField: true,
  },
  'plc-assessments.assign': {
    label: 'Assign button in the PLC assessments tab',
    persists: true,
    perField: true,
  },
  'plc-assessments.menu': {
    label: 'Menu button in the PLC assessments tab',
    perField: true,
    panel: true,
  },
  'plc-assessments.menu-item': {
    label: 'Menu item button in the PLC assessments tab',
    perField: true,
    panel: true,
  },
  'plc-assessments.menu-folder': {
    label: 'Menu folder button in the PLC assessments tab',
    perField: true,
    panel: true,
  },
  'plc-assessments.menu-archive': {
    label: 'Menu archive button in the PLC assessments tab',
    perField: true,
    panel: true,
    destructive: true,
  },
  'plc-assessments.share': {
    label: 'Share button in the PLC assessments tab',
    persists: true,
  },
  'plc-assessments.library-assign': {
    label: 'Library assign button in the PLC assessments tab',
    persists: true,
  },
  'plc-assessments.filter': {
    label: 'Filter button in the PLC assessments tab',
    perField: true,
  },
  'plc-assessments.search': {
    label: 'Search field in the PLC assessments tab',
  },
  'plc-assessments.target-filter': {
    label: 'Target filter select in the PLC assessments tab',
  },
  'plc-assessments.suggested-folder': {
    label: 'Suggested folder button in the PLC assessments tab',
    perField: true,
  },
  'plc-assign.quiz-mode': {
    label: 'Quiz mode button in the PLC assign dialog',
    perField: true,
    panel: true,
  },
  'plc-members.role': {
    label: 'Role select in the PLC members tab',
    persists: true,
    perField: true,
  },
  'plc-members.transfer-lead': {
    label: 'Transfer lead button in the PLC members tab',
    perField: true,
    destructive: true,
  },
  'plc-members.remove': {
    label: 'Remove button in the PLC members tab',
    perField: true,
    destructive: true,
  },
  'plc-members.send-invite': {
    label: 'Send invite button in the PLC members tab',
    persists: true,
  },
  'plc-members.revoke-invite': {
    label: 'Revoke invite button in the PLC members tab',
    perField: true,
    destructive: true,
  },
  'plc-members.leave': {
    label: 'Leave button in the PLC members tab',
    destructive: true,
  },
  'plc-notes.new-note': {
    label: 'New note button in the PLC notes tab',
    persists: true,
    perField: true,
  },
  'plc-notes.new-menu': {
    label: 'New menu button in the PLC notes tab',
  },
  'plc-notes.new-menu-item': {
    label: 'New menu item button in the PLC notes tab',
    perField: true,
    panel: true,
  },
  'plc-notes.doc-select': {
    label: 'Doc select button in the PLC notes tab',
    perField: true,
  },
  'plc-notes.note-select': {
    label: 'Note select button in the PLC notes tab',
    perField: true,
  },
  'plc-notes.open-in-docs': {
    label: 'Open in docs button in the PLC notes tab',
    persists: true,
  },
  'plc-notes.doc-link': {
    label: 'Doc link link in the PLC notes tab',
  },
  'plc-notes.doc-delete': {
    label: 'Doc delete button in the PLC notes tab',
    destructive: true,
  },
  'plc-notes.title': {
    label: 'Title field in the PLC notes tab',
  },
  'plc-notes.body-mode': {
    label: 'Body mode button in the PLC notes tab',
  },
  'plc-notes.note-delete': {
    label: 'Note delete button in the PLC notes tab',
    destructive: true,
  },
  'plc-notes.body': {
    label: 'Body text box in the PLC notes tab',
  },
  'plc-notes.rollup-toggle': {
    label: 'Rollup toggle button in the PLC notes tab',
  },
  'plc-notes.docs-tab': {
    label: 'Docs tab button in the PLC notes tab',
    perField: true,
  },
  'plc-notes.docs-import': {
    label: 'Docs import button in the PLC notes tab',
  },
  'plc-assessments.tab': {
    label: 'Tab button in the PLC assessments tab',
    perField: true,
  },
  'plc-flashcards.set-expand': {
    label: 'Set expand button in the PLC flashcards tab',
  },
  'plc-flashcards.import': {
    label: 'Import button in the PLC flashcards tab',
    persists: true,
  },
  'plc-flashcards.unshare': {
    label: 'Unshare button in the PLC flashcards tab',
    persists: true,
    destructive: true,
  },
  'plc-flashcards.share': {
    label: 'Share button in the PLC flashcards tab',
    persists: true,
  },
  'plc-notes.rich-tool': {
    label: 'Rich tool button in the PLC notes tab',
    perField: true,
  },
  'plc-banks.share': {
    label: 'Share button in the PLC question banks tab',
    persists: true,
  },
  'plc-banks.import': {
    label: 'Import button in the PLC question banks tab',
    persists: true,
    perField: true,
  },
  'plc-banks.unshare': {
    label: 'Unshare button in the PLC question banks tab',
    persists: true,
    perField: true,
    destructive: true,
  },
  'plc-rubrics.share': {
    label: 'Share button in the PLC rubrics tab',
    persists: true,
  },
  'plc-rubrics.import': {
    label: 'Import button in the PLC rubrics tab',
    persists: true,
    perField: true,
  },
  'plc-rubrics.unshare': {
    label: 'Unshare button in the PLC rubrics tab',
    persists: true,
    perField: true,
    destructive: true,
  },
  'plc-boards.open-board': {
    label: 'Open board link in the PLC shared boards tab',
    perField: true,
  },
  'plc-video.share': {
    label: 'Share button in the PLC video activities tab',
    persists: true,
  },
  'plc-video.import': {
    label: 'Import button in the PLC video activities tab',
    persists: true,
    perField: true,
  },
  'plc-video.edit': {
    label: 'Edit button in the PLC video activities tab',
    perField: true,
  },
  'plc-video.version-history': {
    label: 'Version history button in the PLC video activities tab',
    perField: true,
  },
  'plc-video.unshare': {
    label: 'Unshare button in the PLC video activities tab',
    persists: true,
    perField: true,
    destructive: true,
  },
  'plc-video.tab': {
    label: 'Tab button in the PLC video activities tab',
    perField: true,
  },
  'plc-video.cta': {
    label: 'Cta button in the PLC video activities tab',
    persists: true,
  },
  'plc-comments.delete': {
    label: 'Delete button in the PLC comments thread',
    perField: true,
    destructive: true,
  },
  'plc-comments.input': {
    label: 'Input text box in the PLC comments thread',
  },
  'plc-comments.post': {
    label: 'Post button in the PLC comments thread',
    persists: true,
  },
  'plc-comments.mention': {
    label: 'Mention button in the PLC comments thread',
    perField: true,
  },
  'plc-docs.add-close': {
    label: 'Add close button in the PLC docs tab',
    panel: true,
  },
  'plc-docs.add-title': {
    label: 'Add title field in the PLC docs tab',
    panel: true,
  },
  'plc-docs.add-url': {
    label: 'Add url field in the PLC docs tab',
    panel: true,
  },
  'plc-docs.add-cancel': {
    label: 'Add cancel button in the PLC docs tab',
    panel: true,
  },
  'plc-docs.add-submit': {
    label: 'Add submit button in the PLC docs tab',
    persists: true,
    panel: true,
  },
  'plc-docs.rename-input': {
    label: 'Rename input field in the PLC docs tab',
  },
  'plc-docs.rename-confirm': {
    label: 'Rename confirm button in the PLC docs tab',
    persists: true,
    perField: true,
  },
  'plc-docs.rename-cancel': {
    label: 'Rename cancel button in the PLC docs tab',
    perField: true,
  },
  'plc-docs.rename': {
    label: 'Rename button in the PLC docs tab',
    persists: true,
    perField: true,
  },
  'plc-docs.remove': {
    label: 'Remove button in the PLC docs tab',
    perField: true,
    destructive: true,
  },
  'plc-docs.new-title': {
    label: 'New title field in the PLC docs tab',
  },
  'plc-docs.new-url': {
    label: 'New url field in the PLC docs tab',
  },
  'plc-docs.new-add': {
    label: 'New add button in the PLC docs tab',
    persists: true,
  },
  'plc-docs.add-doc': {
    label: 'Add doc button in the PLC docs tab',
    persists: true,
    panel: true,
  },
  'plc-docs.open-doc': {
    label: 'Open doc link in the PLC docs tab',
  },
  'plc-goals.delete': {
    label: 'Delete button in the PLC goal editor',
    panel: true,
    destructive: true,
  },
  'plc-goals.cancel': {
    label: 'Cancel button in the PLC goal editor',
    panel: true,
  },
  'plc-goals.save': {
    label: 'Save button in the PLC goal editor',
    persists: true,
    panel: true,
  },
  'plc-goals.field': {
    label: 'Field field in the PLC goal editor',
    perField: true,
    panel: true,
  },
  'plc-goals.practice-text': {
    label: 'Practice text field in the PLC goal editor',
    perField: true,
    panel: true,
  },
  'plc-goals.practice-remove': {
    label: 'Practice remove button in the PLC goal editor',
    perField: true,
    panel: true,
    destructive: true,
  },
  'plc-goals.practice-add': {
    label: 'Practice add button in the PLC goal editor',
    persists: true,
    panel: true,
  },
  'plc-goals.routine-select': {
    label: 'Routine select select in the PLC goal editor',
    panel: true,
  },
  'plc-goals.routine-grades': {
    label: 'Routine grades select in the PLC goal editor',
    panel: true,
  },
  'plc-home.members-avatars': {
    label: 'Members avatars button in the PLC home',
  },
  'plc-home.remove-tile': {
    label: 'Remove tile button in the PLC home',
    perField: true,
    destructive: true,
  },
  'plc-home.add-tile-menu': {
    label: 'Add tile menu button in the PLC home',
  },
  'plc-home.add-tile-option': {
    label: 'Add tile option button in the PLC home',
    perField: true,
    panel: true,
  },
  'plc-home.spotlight': {
    label: 'Spotlight button in the PLC home',
    perField: true,
  },
  'plc-home.customize-done': {
    label: 'Customize done button in the PLC home',
    persists: true,
  },
  'plc-home.customize-open': {
    label: 'Customize open button in the PLC home',
  },
  'plc-home.customize-clear': {
    label: 'Customize clear button in the PLC home',
    destructive: true,
  },
  'plc-home.card-link': {
    label: 'Card link button in the PLC home',
    perField: true,
  },
  'plc-home.members-manage': {
    label: 'Members manage button in the PLC home',
  },
  'plc-home.quick-create': {
    label: 'Quick create button in the PLC home',
    persists: true,
    perField: true,
  },
  'plc-home.action-toggle': {
    label: 'Action toggle checkbox in the PLC home',
    persists: true,
    perField: true,
  },
  'plc-home.action-done': {
    label: 'Action done button in the PLC home',
    persists: true,
  },
  'plc-home.doc-open': {
    label: 'Doc open button in the PLC home',
    perField: true,
  },
  'plc-home.goal-add': {
    label: 'Goal add button in the PLC home',
    persists: true,
  },
  'plc-home.goal-edit': {
    label: 'Goal edit button in the PLC home',
    perField: true,
  },
  'plc-home.routine-info': {
    label: 'Routine info button in the PLC home',
  },
  'plc-home.meeting-move-date': {
    label: 'Meeting move date field in the PLC home',
    panel: true,
  },
  'plc-home.meeting-move-save': {
    label: 'Meeting move save button in the PLC home',
    persists: true,
    panel: true,
  },
  'plc-home.meeting-move-cancel': {
    label: 'Meeting move cancel button in the PLC home',
    panel: true,
  },
  'plc-home.meeting-move': {
    label: 'Meeting move button in the PLC home',
  },
  'plc-home.meeting-skip': {
    label: 'Meeting skip button in the PLC home',
    persists: true,
  },
  'plc-home.meeting-open': {
    label: 'Meeting open button in the PLC home',
  },
  'plc-home.results-targets': {
    label: 'Results targets button in the PLC home',
  },
  'plc-home.results-meeting': {
    label: 'Results meeting button in the PLC home',
  },
  'plc-home.tile-link': {
    label: 'Tile link button in the PLC home',
  },
  'plc-meeting.home': {
    label: 'Home button in the PLC meeting mode',
  },
  'plc-meeting.back': {
    label: 'Back button in the PLC meeting mode',
  },
  'plc-meeting.save': {
    label: 'Save button in the PLC meeting mode',
    persists: true,
  },
  'plc-meeting.next': {
    label: 'Next button in the PLC meeting mode',
  },
  'plc-meeting.view-record': {
    label: 'View record button in the PLC meeting mode',
  },
  'plc-meeting.start-over': {
    label: 'Start over button in the PLC meeting mode',
  },
  'plc-meeting.export': {
    label: 'Export button in the PLC meeting mode',
    persists: true,
    perField: true,
  },
  'plc-meeting.go-live': {
    label: 'Go live button in the PLC meeting mode',
  },
  'plc-meeting.discuss': {
    label: 'Discuss button in the PLC meeting mode',
    perField: true,
  },
  'plc-meeting.discuss-question': {
    label: 'Discuss question button in the PLC meeting mode',
    perField: true,
  },
  'plc-meeting.step': {
    label: 'Step button in the PLC meeting mode',
    perField: true,
  },
  'plc-meeting.review-toggle': {
    label: 'Review toggle button in the PLC meeting mode',
    perField: true,
  },
  'plc-meeting.decision-input': {
    label: 'Decision input text box in the PLC meeting mode',
  },
  'plc-meeting.decision-add': {
    label: 'Decision add button in the PLC meeting mode',
    persists: true,
  },
  'plc-meeting.decision-remove': {
    label: 'Decision remove button in the PLC meeting mode',
    perField: true,
    destructive: true,
  },
  'plc-meeting.action-input': {
    label: 'Action input field in the PLC meeting mode',
  },
  'plc-meeting.action-owner': {
    label: 'Action assignee select in the PLC meeting mode',
  },
  'plc-meeting.action-due': {
    label: 'Action due field in the PLC meeting mode',
  },
  'plc-meeting.action-add': {
    label: 'Action add button in the PLC meeting mode',
    persists: true,
  },
  'plc-meeting.action-remove': {
    label: 'Action remove button in the PLC meeting mode',
    perField: true,
    destructive: true,
  },
  'plc-norming.flag-toggle': {
    label: 'Flag toggle button in the PLC norming controls',
  },
  'plc-norming.flag-level': {
    label: 'Flag level button in the PLC norming controls',
    persists: true,
    perField: true,
  },
  'plc-norming.level-label': {
    label: 'Level label field in the PLC norming controls',
    perField: true,
  },
  'plc-norming.levels-save': {
    label: 'Levels save button in the PLC norming controls',
    persists: true,
  },
  'plc-norming.levels-reset': {
    label: 'Levels reset button in the PLC norming controls',
    destructive: true,
  },
  'plc-norming.load': {
    label: 'Load button in the PLC norming controls',
    persists: true,
  },
  'plc-norming.remove': {
    label: 'Remove button in the PLC norming controls',
    destructive: true,
  },
  'plc-notes.action-due-open': {
    label: 'Action due open button in the PLC notes tab',
    panel: true,
  },
  'plc-notes.action-check': {
    label: 'Action check checkbox in the PLC notes tab',
    persists: true,
    perField: true,
    panel: true,
  },
  'plc-notes.action-edit': {
    label: 'Action edit field in the PLC notes tab',
    perField: true,
    panel: true,
  },
  'plc-notes.action-owner': {
    label: 'Action assignee select in the PLC notes tab',
    perField: true,
    panel: true,
  },
  'plc-notes.action-due': {
    label: 'Action due field in the PLC notes tab',
    perField: true,
    panel: true,
  },
  'plc-notes.action-remove': {
    label: 'Action remove button in the PLC notes tab',
    perField: true,
    panel: true,
    destructive: true,
  },
  'plc-notes.toolbar-menu': {
    label: 'Toolbar menu button in the PLC notes tab',
    perField: true,
  },
  'plc-notes.toolbar-option': {
    label: 'Toolbar option button in the PLC notes tab',
    perField: true,
    panel: true,
  },
  'plc-notes.toolbar-reset': {
    label: 'Toolbar reset button in the PLC notes tab',
    persists: true,
    destructive: true,
  },
  'plc-notes.toolbar-select': {
    label: 'Toolbar select select in the PLC notes tab',
    perField: true,
  },
  'plc-notes.panel-open': {
    label: 'Panel open button in the PLC notes tab',
  },
  'plc-notes.panel-select': {
    label: 'Panel select button in the PLC notes tab',
    perField: true,
  },
  'plc-notes.panel-close': {
    label: 'Panel close button in the PLC notes tab',
  },
  'plc-notes.review-insert': {
    label: 'Review insert button in the PLC notes tab',
    persists: true,
    panel: true,
  },
  'plc-notes.review-replace': {
    label: 'Review replace button in the PLC notes tab',
    panel: true,
    destructive: true,
  },
  'plc-notes.review-regenerate': {
    label: 'Review regenerate button in the PLC notes tab',
    persists: true,
    panel: true,
  },
  'plc-notes.review-dismiss': {
    label: 'Review dismiss button in the PLC notes tab',
    panel: true,
    destructive: true,
  },
  'plc-notes.review-owner': {
    label: 'Review owner select in the PLC notes tab',
    perField: true,
    panel: true,
  },
  'plc-notes.review-open': {
    label: 'Review open button in the PLC notes tab',
    panel: true,
  },
  'plc-notes.request-notes': {
    label: 'Request notes button in the PLC notes tab',
    persists: true,
  },
  'plc-notes.transcript-toggle': {
    label: 'Transcript toggle button in the PLC notes tab',
  },
  'plc-recording.resume': {
    label: 'Resume button in the PLC recording controls',
  },
  'plc-recording.pause': {
    label: 'Pause button in the PLC recording controls',
    persists: true,
  },
  'plc-recording.stop': {
    label: 'Stop button in the PLC recording controls',
    persists: true,
  },
  'plc-recording.start': {
    label: 'Start button in the PLC recording controls',
    persists: true,
  },
  'plc-recording.mic-menu': {
    label: 'Mic menu button in the PLC recording controls',
  },
  'plc-recording.mic-device': {
    label: 'Mic device button in the PLC recording controls',
    perField: true,
    panel: true,
  },
  'plc-recording.play': {
    label: 'Play button in the PLC recording controls',
  },
  'plc-recording.seek': {
    label: 'Seek field in the PLC recording controls',
  },
  'plc-recording.download': {
    label: 'Download button in the PLC recording controls',
    persists: true,
  },
  'plc-recording.delete': {
    label: 'Delete button in the PLC recording controls',
    destructive: true,
  },
  'plc-resources.add-link': {
    label: 'Add link button in the PLC resources tab',
  },
  'plc-resources.link-field': {
    label: 'Link field field in the PLC resources tab',
    perField: true,
    panel: true,
  },
  'plc-resources.link-cancel': {
    label: 'Link cancel button in the PLC resources tab',
    panel: true,
  },
  'plc-resources.link-save': {
    label: 'Link save button in the PLC resources tab',
    persists: true,
    panel: true,
  },
  'plc-resources.link-open': {
    label: 'Link open link in the PLC resources tab',
    perField: true,
  },
  'plc-resources.link-remove': {
    label: 'Link remove button in the PLC resources tab',
    perField: true,
    destructive: true,
  },
  'plc-resources.use': {
    label: 'Use button in the PLC resources tab',
    persists: true,
    perField: true,
  },
  'plc-search.input': {
    label: 'Input field in the PLC search box',
  },
  'plc-search.clear': {
    label: 'Clear button in the PLC search box',
    destructive: true,
  },
  'plc-search.result': {
    label: 'Result button in the PLC search box',
    perField: true,
  },
  'plc-settings.target-chip-remove': {
    label: 'Target chip remove button in the PLC settings tab',
    perField: true,
    destructive: true,
  },
  'plc-settings.target-picker-open': {
    label: 'Target picker open button in the PLC settings tab',
  },
  'plc-settings.target-restore': {
    label: 'Target restore button in the PLC settings tab',
    persists: true,
    perField: true,
  },
  'plc-settings.target-archived-toggle': {
    label: 'Target archived toggle button in the PLC settings tab',
  },
  'plc-settings.target-archive': {
    label: 'Target archive button in the PLC settings tab',
    perField: true,
    destructive: true,
  },
  'plc-settings.target-add-panel': {
    label: 'Target add panel button in the PLC settings tab',
  },
  'plc-settings.target-paste-panel': {
    label: 'Target paste panel button in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-csv-panel': {
    label: 'Target csv panel button in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-code': {
    label: 'Target code field in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-label': {
    label: 'Target label field in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-grade': {
    label: 'Target grade button in the PLC settings tab',
    perField: true,
    panel: true,
  },
  'plc-settings.target-subject': {
    label: 'Target subject select in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-add-save': {
    label: 'Target add save button in the PLC settings tab',
    persists: true,
    panel: true,
  },
  'plc-settings.target-paste-text': {
    label: 'Target paste text text box in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-paste-import': {
    label: 'Target paste import button in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-csv-template': {
    label: 'Target csv template button in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-csv-file': {
    label: 'Target csv file field in the PLC settings tab',
    panel: true,
  },
  'plc-settings.target-csv-import': {
    label: 'Target csv import button in the PLC settings tab',
    panel: true,
  },
  'plc-settings.cutoff-input': {
    label: 'Cutoff input field in the PLC settings tab',
    perField: true,
    panel: true,
  },
  'plc-settings.cutoff-save': {
    label: 'Cutoff save button in the PLC settings tab',
    persists: true,
    panel: true,
  },
  'plc-settings.gradebook-stop-sharing': {
    label: 'Gradebook stop sharing button in the PLC settings tab',
    destructive: true,
  },
  'plc-settings.gradebook-stop-confirm': {
    label: 'Gradebook stop confirm button in the PLC settings tab',
    destructive: true,
  },
  'plc-settings.gradebook-stop-cancel': {
    label: 'Gradebook stop cancel button in the PLC settings tab',
  },
  'plc-settings.gradebook-share': {
    label: 'Gradebook share button in the PLC settings tab',
    persists: true,
  },
  'plc-settings.cadence-frequency': {
    label: 'Cadence frequency select in the PLC settings tab',
  },
  'plc-settings.cadence-nth': {
    label: 'Cadence nth select in the PLC settings tab',
  },
  'plc-settings.cadence-weekday': {
    label: 'Cadence weekday select in the PLC settings tab',
  },
  'plc-settings.cadence-time': {
    label: 'Cadence time field in the PLC settings tab',
  },
  'plc-settings.cadence-anchor-date': {
    label: 'Cadence anchor date field in the PLC settings tab',
  },
  'plc-settings.cadence-agenda': {
    label: 'Cadence agenda text box in the PLC settings tab',
  },
  'plc-settings.cadence-save': {
    label: 'Cadence save button in the PLC settings tab',
    persists: true,
  },
  'plc-settings.cadence-clear': {
    label: 'Cadence clear button in the PLC settings tab',
    destructive: true,
  },
  'plc-settings.trash-restore': {
    label: 'Trash restore button in the PLC settings tab',
    persists: true,
    perField: true,
  },
  'plc-sync.keep-mine': {
    label: 'Keep mine button in the PLC sync conflict prompt',
    persists: true,
    panel: true,
  },
  'plc-sync.pull-theirs': {
    label: 'Pull theirs button in the PLC sync conflict prompt',
    persists: true,
    panel: true,
  },
  'plc-assign.row-monitor': {
    label: 'Row monitor button in the PLC assignments list',
  },
  'plc-assign.row-results': {
    label: 'Row results button in the PLC assignments list',
  },
  'plc-assign.row-assign': {
    label: 'Row assign button in the PLC assignments list',
    persists: true,
  },
  'plc-assign.row-sheet': {
    label: 'Row sheet link in the PLC assignments list',
  },
  'plc-settings.feature-switch': {
    label: 'Feature switch checkbox in the PLC settings tab',
    persists: true,
    perField: true,
  },
  'plc-settings.digest': {
    label: 'Digest button in the PLC settings tab',
    persists: true,
  },
  'plc-settings.trash-toggle': {
    label: 'Trash toggle button in the PLC settings tab',
  },
  'plc-versions.close': {
    label: 'Close button in the PLC version history panel',
    panel: true,
  },
  'plc-versions.reload': {
    label: 'Reload button in the PLC version history panel',
    persists: true,
    panel: true,
  },
  'plc-versions.restore': {
    label: 'Restore button in the PLC version history panel',
    persists: true,
    perField: true,
    panel: true,
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
  'admin.features.filter-enabled': {
    label: 'Enabled filter button in Features',
    perField: true,
    panel: true,
  },
  'admin.features.filter-availability': {
    label: 'Availability filter button in Features',
    perField: true,
    panel: true,
  },
  'admin.features.filter-building': {
    label: 'Building filter button in Features',
    perField: true,
    panel: true,
  },
  'admin.features.filter-toggle': {
    label: 'Filters button in Features (phone)',
    panel: true,
  },
  'admin.features.daily-limit-toggle': {
    label: 'Daily limit switch on a feature row',
    perField: true,
    panel: true,
  },
  'admin.features.daily-limit-number': {
    label: 'Uses per day box on a feature row',
    perField: true,
    panel: true,
  },
  'admin.features.model-tier': {
    label: 'Model select on a feature row',
    perField: true,
    panel: true,
  },
  'admin.access.expand': {
    label: 'Row expand button in Features, Widgets and Previews',
    perField: true,
    panel: true,
  },
  'admin.access.enabled': {
    label: 'Enabled switch on an access row',
    perField: true,
    panel: true,
  },
  'admin.access.level': {
    label: 'Who can use it picker on an access row',
    perField: true,
    panel: true,
  },
  'admin.access.save': {
    label: 'Save button on an access row',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.access.min-tier': {
    label: 'Minimum tier select on an access row',
    panel: true,
  },
  'admin.access.search': {
    label: 'Search box on an Access tab',
    perField: true,
    panel: true,
  },
  'admin.access.search-elsewhere': {
    label: 'Found on another tab button in Access search',
    perField: true,
    panel: true,
  },
  'admin.gemini.model': {
    label: 'Gemini model select',
    perField: true,
    panel: true,
  },
  'admin.gemini.save': {
    label: 'Save Gemini models button',
    persists: true,
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
    perField: true,
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
  'admin.previews.district-switch': {
    label: 'District switch on a Previews row',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.previews.graduate': {
    label: 'Graduate button on a Previews row',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.analytics.active-students-search': {
    label: 'Search field in the active students list',
    panel: true,
  },
  'admin.analytics.building-filter': {
    label: 'Building filter dropdown in Analytics',
    panel: true,
  },
  'admin.analytics.user-building-filter': {
    label: 'Building filter dropdown in the Analytics user list',
    panel: true,
  },
  'admin.analytics.domain-filter': {
    label: 'Domain filter dropdown in Analytics',
    panel: true,
  },
  'admin.analytics.group': {
    label: 'Group by buttons in Analytics overview',
    perField: true,
    panel: true,
  },
  'admin.analytics.kpi-card': {
    label: 'KPI cards in Analytics overview',
    perField: true,
    panel: true,
  },
  'admin.analytics.range': {
    label: 'Time range buttons in Analytics overview',
    perField: true,
    panel: true,
  },
  'admin.analytics.tab': {
    label: 'Analytics tabs',
    perField: true,
    panel: true,
  },
  'admin.analytics.table-sort': {
    label: 'Sortable column buttons in Analytics tables',
    perField: true,
    panel: true,
  },
  'admin.analytics.user-search': {
    label: 'Email search field in the users table',
    panel: true,
  },
  'admin.analytics.user-sort': {
    label: 'Sortable column headers in the users table',
    perField: true,
    panel: true,
  },
  'admin.analytics.widget-search': {
    label: 'Search field in the widget usage table',
    panel: true,
  },
  'admin.analytics.widget-sort': {
    label: 'Sortable column buttons in the widget usage table',
    perField: true,
    panel: true,
  },
  'admin.analytics.widget-users-search': {
    label: 'Email search field in a widget usage row',
    panel: true,
  },
  'admin.analytics.widget-users-toggle': {
    label: 'Show users button in a widget usage row',
    perField: true,
    panel: true,
  },
  'admin.dock-defaults.building': {
    label: 'Dock by default switch for a building',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.add-period': {
    label: 'Add period button in Gradebook settings',
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.cancel-remove-configuration': {
    label: 'Cancel delete configuration button in Gradebook settings',
    panel: true,
  },
  'admin.gradebook-settings.cancel-remove-period-set': {
    label: 'Cancel delete period set button in Gradebook settings',
    panel: true,
  },
  'admin.gradebook-settings.configuration-name': {
    label: 'Configuration name field in Gradebook settings',
    panel: true,
  },
  'admin.gradebook-settings.configuration-select': {
    label: 'Configuration dropdown in Gradebook settings',
    panel: true,
  },
  'admin.gradebook-settings.confirm-delete-configuration': {
    label: 'Confirm delete configuration button in Gradebook settings',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.confirm-delete-period-set': {
    label: 'Confirm delete period set button in Gradebook settings',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.default-configuration': {
    label: 'Default configuration switch in Gradebook settings',
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.delete-configuration': {
    label: 'Delete configuration button in Gradebook settings',
    destructive: true,
    panel: true,
  },
  'admin.gradebook-settings.delete-period-set': {
    label: 'Delete period set button in Gradebook settings',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.gradebook-settings.duplicate-configuration': {
    label: 'Duplicate configuration button in Gradebook settings',
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.new-configuration': {
    label: 'New configuration button in Gradebook settings',
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.new-period-set': {
    label: 'New period set button in Gradebook settings',
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.period-date': {
    label: 'Period start and end date fields in Gradebook settings',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.period-name': {
    label: 'Period name field in Gradebook settings',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.period-preset': {
    label: 'Quarters and semesters preset buttons in Gradebook settings',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.period-set-name': {
    label: 'Period set name field in Gradebook settings',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.gradebook-settings.remove-period': {
    label: 'Remove period button in Gradebook settings',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.gradebook-settings.rename-configuration': {
    label: 'Rename configuration button in Gradebook settings',
    panel: true,
  },
  'admin.links.copy': {
    label: 'Copy short URL button in a short link row',
    perField: true,
    panel: true,
  },
  'admin.links.copy-created': {
    label: 'Copy button for the newly created short link',
    panel: true,
  },
  'admin.links.create': {
    label: 'Create short link button',
    persists: true,
    panel: true,
  },
  'admin.links.delete': {
    label: 'Delete button in a short link row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.links.destination': {
    label: 'Destination URL field in the short link form',
    panel: true,
  },
  'admin.links.edit': {
    label: 'Edit button in a short link row',
    perField: true,
    panel: true,
  },
  'admin.links.edit-cancel': {
    label: 'Cancel button in the edit short link dialog',
    panel: true,
  },
  'admin.links.edit-destination': {
    label: 'Destination field in the edit short link dialog',
    panel: true,
  },
  'admin.links.edit-label': {
    label: 'Label field in the edit short link dialog',
    panel: true,
  },
  'admin.links.edit-save': {
    label: 'Save button in the edit short link dialog',
    persists: true,
    panel: true,
  },
  'admin.links.label': {
    label: 'Label field in the short link form',
    panel: true,
  },
  'admin.links.modal-close': {
    label: 'Close button in the edit short link dialog',
    panel: true,
  },
  'admin.links.search': {
    label: 'Search field in the short links list',
    panel: true,
  },
  'admin.links.shorten-url': {
    label: 'Shorten URL button',
    persists: true,
    panel: true,
  },
  'admin.links.slug': {
    label: 'Custom slug field in the short link form',
    panel: true,
  },
  'admin.mini-app-library.building': {
    label: 'Building buttons in the mini app editor',
    perField: true,
    panel: true,
  },
  'admin.mini-app-library.cancel': {
    label: 'Cancel button in the mini app editor',
    panel: true,
  },
  'admin.mini-app-library.delete': {
    label: 'Delete button in a mini app row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.mini-app-library.edit': {
    label: 'Edit button in a mini app row',
    perField: true,
    panel: true,
  },
  'admin.mini-app-library.html-code': {
    label: 'HTML code field in the mini app editor',
    panel: true,
  },
  'admin.mini-app-library.modal-close': {
    label: 'Close button in the mini app library',
    panel: true,
  },
  'admin.mini-app-library.move-up': {
    label: 'Move up button in a mini app row',
    perField: true,
    panel: true,
  },
  'admin.mini-app-library.new-app': {
    label: 'New app button in the mini app library',
    panel: true,
  },
  'admin.mini-app-library.save': {
    label: 'Save button in the mini app editor',
    persists: true,
    panel: true,
  },
  'admin.mini-app-library.title': {
    label: 'Title field in the mini app editor',
    panel: true,
  },
  'admin.music.add-station': {
    label: 'Add station button in Music manager',
    panel: true,
  },
  'admin.music.building': {
    label: 'Building buttons in the station editor',
    perField: true,
    panel: true,
  },
  'admin.music.cancel': {
    label: 'Cancel button in the station editor',
    panel: true,
  },
  'admin.music.channel': {
    label: 'Channel field in the station editor',
    panel: true,
  },
  'admin.music.delete': {
    label: 'Delete button in a station row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.music.edit': {
    label: 'Edit button in a station row',
    perField: true,
    panel: true,
  },
  'admin.music.genre': {
    label: 'Genre dropdown in the station editor',
    panel: true,
  },
  'admin.music.modal-close': {
    label: 'Close button in the music library dialog',
    panel: true,
  },
  'admin.music.modal-done': {
    label: 'Close footer button in the music library dialog',
    panel: true,
  },
  'admin.music.save': {
    label: 'Save station button in the station editor',
    persists: true,
    panel: true,
  },
  'admin.music.thumbnail-browse': {
    label: 'Browse thumbnail button in the station editor',
    panel: true,
  },
  'admin.music.thumbnail-remove': {
    label: 'Remove thumbnail button in the station editor',
    destructive: true,
    panel: true,
  },
  'admin.music.thumbnail-url': {
    label: 'Thumbnail image URL field in the station editor',
    panel: true,
  },
  'admin.music.title': {
    label: 'Title field in the station editor',
    panel: true,
  },
  'admin.music.url': {
    label: 'URL field in the station editor',
    panel: true,
  },
  'admin.pdf-library.building': {
    label: 'Building buttons in the PDF editor',
    perField: true,
    panel: true,
  },
  'admin.pdf-library.cancel': {
    label: 'Cancel button in the PDF editor',
    panel: true,
  },
  'admin.pdf-library.delete': {
    label: 'Delete button in a PDF row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.pdf-library.edit': {
    label: 'Edit button in a PDF row',
    perField: true,
    panel: true,
  },
  'admin.pdf-library.modal-close': {
    label: 'Close button in the PDF library',
    panel: true,
  },
  'admin.pdf-library.move-up': {
    label: 'Move up button in a PDF row',
    perField: true,
    panel: true,
  },
  'admin.pdf-library.new-pdf': {
    label: 'New PDF button in the PDF library',
    panel: true,
  },
  'admin.pdf-library.save': {
    label: 'Save button in the PDF editor',
    persists: true,
    panel: true,
  },
  'admin.pdf-library.save-settings': {
    label: 'Save settings button in the PDF library',
    persists: true,
    panel: true,
  },
  'admin.pdf-library.tab-library': {
    label: 'Library tab in the PDF library',
    panel: true,
  },
  'admin.pdf-library.tab-settings': {
    label: 'Settings tab in the PDF library',
    panel: true,
  },
  'admin.pdf-library.title': {
    label: 'Title field in the PDF editor',
    panel: true,
  },
  'admin.pdf-library.upload-pdf': {
    label: 'Upload PDF button in the PDF editor',
    persists: true,
    panel: true,
  },
  'admin.routines.close': {
    label: 'Close button in Instructional routines manager',
    panel: true,
  },
  'admin.routines.delete': {
    label: 'Delete button in a routine row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.routines.edit': {
    label: 'Edit button in a routine row',
    perField: true,
    panel: true,
  },
  'admin.routines.new-routine': {
    label: 'New routine button in Instructional routines manager',
    panel: true,
  },
  'admin.save-template.building': {
    label: 'Building buttons in Save as template',
    perField: true,
    panel: true,
  },
  'admin.save-template.existing-template': {
    label: 'Existing template dropdown in Save as template',
    panel: true,
  },
  'admin.save-template.new-name': {
    label: 'New template name field in Save as template',
    panel: true,
  },
  'admin.save-template.save-new': {
    label: 'Save as new template button',
    persists: true,
    panel: true,
  },
  'admin.save-template.update-existing': {
    label: 'Update template button in Save as template',
    persists: true,
    panel: true,
  },
  'admin.schoology.add-category': {
    label: 'Add category button in Schoology categories',
    panel: true,
  },
  'admin.schoology.category-name': {
    label: 'Category name field in Schoology categories',
    perField: true,
    panel: true,
  },
  'admin.schoology.category-weight': {
    label: 'Category weight field in Schoology categories',
    perField: true,
    panel: true,
  },
  'admin.schoology.remove-category': {
    label: 'Remove category button in Schoology categories',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.schoology.save': {
    label: 'Save button in Schoology categories',
    persists: true,
    panel: true,
  },
  'admin.standards.seed': {
    label: 'Seed standards button',
    persists: true,
    panel: true,
  },
  'admin.stickers.grade-level': {
    label: 'Grade level buttons on a sticker',
    perField: true,
    panel: true,
  },
  'admin.stickers.modal-close': {
    label: 'Close button in the sticker library',
    panel: true,
  },
  'admin.stickers.remove': {
    label: 'Remove button on a sticker',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.stickers.save': {
    label: 'Save button in the sticker library',
    persists: true,
    panel: true,
  },
  'admin.stickers.upload': {
    label: 'Upload area in the sticker library',
    persists: true,
    panel: true,
  },
  'admin.sub-presets.add-email': {
    label: 'Add email button in Preset sub emails',
    panel: true,
  },
  'admin.sub-presets.building': {
    label: 'Building dropdown in Preset sub emails',
    panel: true,
  },
  'admin.sub-presets.email': {
    label: 'Email field in Preset sub emails',
    panel: true,
  },
  'admin.sub-presets.remove-email': {
    label: 'Remove email button in Preset sub emails',
    destructive: true,
    panel: true,
  },
  'admin.sub-presets.save': {
    label: 'Save button in Preset sub emails',
    persists: true,
    panel: true,
  },
  'admin.subjects.add': {
    label: 'Add content area button in Subjects',
    persists: true,
    panel: true,
  },
  'admin.subjects.archive': {
    label: 'Archive or restore button in a subject row',
    perField: true,
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.subjects.new-label': {
    label: 'New content area field in Subjects',
    panel: true,
  },
  'admin.subjects.rename': {
    label: 'Rename button in a subject row',
    perField: true,
    panel: true,
  },
  'admin.subjects.rename-input': {
    label: 'Rename field in a subject row',
    perField: true,
    panel: true,
  },
  'admin.templates.access-level': {
    label: 'Access level buttons in a template row',
    perField: true,
    panel: true,
  },
  'admin.templates.all-buildings': {
    label: 'All buildings button in a template row',
    perField: true,
    panel: true,
  },
  'admin.templates.building': {
    label: 'Building buttons in a template row',
    perField: true,
    panel: true,
  },
  'admin.templates.cancel': {
    label: 'Cancel button in the new template form',
    panel: true,
  },
  'admin.templates.create': {
    label: 'Create button in the new template form',
    persists: true,
    panel: true,
  },
  'admin.templates.delete': {
    label: 'Delete button in a template row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.templates.description': {
    label: 'Template description field in a template row',
    perField: true,
    panel: true,
  },
  'admin.templates.enabled': {
    label: 'Enabled switch in a template row',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.templates.name': {
    label: 'Template name field in a template row',
    perField: true,
    panel: true,
  },
  'admin.templates.new-description': {
    label: 'Description field in the new template form',
    panel: true,
  },
  'admin.templates.new-name': {
    label: 'Name field in the new template form',
    panel: true,
  },
  'admin.templates.new-template': {
    label: 'New template button in Dashboard templates',
    panel: true,
  },
  'admin.templates.save': {
    label: 'Save button in a template row',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.templates.type-filter': {
    label: 'Template type filter buttons',
    perField: true,
    panel: true,
  },
  'admin.view-as-log.filter': {
    label: 'Filter dropdown in the View as log',
    panel: true,
  },
  'admin.view-as-log.filter-admin': {
    label: 'Admin filter button in a View as log entry',
    panel: true,
  },
  'admin.view-as-log.filter-teacher': {
    label: 'Teacher filter button in a View as log entry',
    panel: true,
  },
  'admin.view-as-log.keep-current': {
    label: 'Keep current button in the revert confirmation',
    panel: true,
  },
  'admin.view-as-log.load-more': {
    label: 'Load more button in the View as log',
    panel: true,
  },
  'admin.view-as-log.revert': {
    label: 'Revert button in a View as log entry',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.view-as-log.revert-anyway': {
    label: 'Revert anyway button in the revert confirmation',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.view-as-log.toggle-changes': {
    label: 'Show or hide changes button in a View as log entry',
    panel: true,
  },
  'admin.widget-builder.ai-add': {
    label: 'Add feature button in the Widget builder AI panel',
    panel: true,
  },
  'admin.widget-builder.ai-explain': {
    label: 'Explain button in the Widget builder AI panel',
    panel: true,
  },
  'admin.widget-builder.ai-fix': {
    label: 'Fix errors button in the Widget builder AI panel',
    panel: true,
  },
  'admin.widget-builder.ai-generate': {
    label: 'Generate button in the Widget builder AI panel',
    panel: true,
  },
  'admin.widget-builder.ai-prompt': {
    label: 'Description field in the Widget builder AI panel',
    panel: true,
  },
  'admin.widget-builder.back': {
    label: 'Back button in Widget builder',
    panel: true,
  },
  'admin.widget-builder.build-step': {
    label: 'Build step buttons in Widget builder',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.cell-add-block': {
    label: 'Add block button in the cell editor',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.cell-close': {
    label: 'Close button in the cell editor',
    panel: true,
  },
  'admin.widget-builder.cell-config': {
    label: 'Block setting field in the cell editor',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.cell-remove-block': {
    label: 'Remove block button in the cell editor',
    destructive: true,
    panel: true,
  },
  'admin.widget-builder.close': {
    label: 'Close button in Widget builder',
    panel: true,
  },
  'admin.widget-builder.connection-action': {
    label: 'Action dropdown in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-cancel': {
    label: 'Cancel button in a new connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-condition-block': {
    label: 'Condition block dropdown in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-condition-operator': {
    label: 'Condition operator dropdown in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-condition-value': {
    label: 'Condition value field in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-delete': {
    label: 'Delete button in a connection row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.widget-builder.connection-event': {
    label: 'Event dropdown in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-event-count': {
    label: 'Event count field in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-has-condition': {
    label: 'Add condition checkbox in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-new': {
    label: 'New rule button in Connections',
    panel: true,
  },
  'admin.widget-builder.connection-payload': {
    label: 'Action text field in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-save': {
    label: 'Save rule button in Connections',
    panel: true,
  },
  'admin.widget-builder.connection-source': {
    label: 'Source block dropdown in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-target': {
    label: 'Target block dropdown in a connection rule',
    panel: true,
  },
  'admin.widget-builder.connection-value': {
    label: 'Action value field in a connection rule',
    panel: true,
  },
  'admin.widget-builder.delete': {
    label: 'Delete button in a custom widget row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.widget-builder.edit': {
    label: 'Edit button in a custom widget row',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.grid-columns-less': {
    label: 'Fewer columns button in the builder grid',
    panel: true,
  },
  'admin.widget-builder.grid-columns-more': {
    label: 'More columns button in the builder grid',
    panel: true,
  },
  'admin.widget-builder.grid-merge': {
    label: 'Merge selected cells button in the builder grid',
    panel: true,
  },
  'admin.widget-builder.grid-rows-less': {
    label: 'Fewer rows button in the builder grid',
    panel: true,
  },
  'admin.widget-builder.grid-rows-more': {
    label: 'More rows button in the builder grid',
    panel: true,
  },
  'admin.widget-builder.grid-split': {
    label: 'Split cell button in the builder grid',
    panel: true,
  },
  'admin.widget-builder.meta-access-level': {
    label: 'Access level buttons in Widget builder details',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.meta-beta-users': {
    label: 'Beta users field in Widget builder details',
    panel: true,
  },
  'admin.widget-builder.meta-building': {
    label: 'Building checkboxes in Widget builder details',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.meta-color': {
    label: 'Color buttons in Widget builder details',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.meta-description': {
    label: 'Description field in Widget builder details',
    panel: true,
  },
  'admin.widget-builder.meta-height': {
    label: 'Default height field in Widget builder details',
    panel: true,
  },
  'admin.widget-builder.meta-icon': {
    label: 'Icon buttons in Widget builder details',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.meta-slug': {
    label: 'Slug field in Widget builder details',
    panel: true,
  },
  'admin.widget-builder.meta-title': {
    label: 'Title field in Widget builder details',
    panel: true,
  },
  'admin.widget-builder.meta-width': {
    label: 'Default width field in Widget builder details',
    panel: true,
  },
  'admin.widget-builder.mode-card': {
    label: 'Build mode cards in Widget builder',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.new-widget': {
    label: 'New widget button in Widget builder',
    panel: true,
  },
  'admin.widget-builder.next': {
    label: 'Next button in Widget builder',
    panel: true,
  },
  'admin.widget-builder.palette-block': {
    label: 'Block buttons in the Widget builder palette',
    perField: true,
    panel: true,
  },
  'admin.widget-builder.preview-height': {
    label: 'Preview height slider in Widget builder',
    panel: true,
  },
  'admin.widget-builder.preview-width': {
    label: 'Preview width slider in Widget builder',
    panel: true,
  },
  'admin.widget-builder.publish': {
    label: 'Publish or unpublish button in a custom widget row',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.widget-builder.publish-widget': {
    label: 'Publish widget button in Widget builder',
    persists: true,
    panel: true,
  },
  'admin.widget-builder.refresh-preview': {
    label: 'Refresh preview button in Widget builder',
    panel: true,
  },
  'admin.widget-builder.save-draft': {
    label: 'Save as draft button in Widget builder',
    persists: true,
    panel: true,
  },
  'admin.widget-builder.setting-add': {
    label: 'Add setting button in Widget builder settings',
    panel: true,
  },
  'admin.widget-builder.setting-cancel': {
    label: 'Cancel button in the new setting form',
    panel: true,
  },
  'admin.widget-builder.setting-default': {
    label: 'Setting default value control in Widget builder settings',
    panel: true,
  },
  'admin.widget-builder.setting-delete': {
    label: 'Delete button in a setting row',
    perField: true,
    destructive: true,
    panel: true,
  },
  'admin.widget-builder.setting-key': {
    label: 'Setting key field in Widget builder settings',
    panel: true,
  },
  'admin.widget-builder.setting-label': {
    label: 'Setting label field in Widget builder settings',
    panel: true,
  },
  'admin.widget-builder.setting-options': {
    label: 'Setting options field in Widget builder settings',
    panel: true,
  },
  'admin.widget-builder.setting-save': {
    label: 'Add setting button in the new setting form',
    panel: true,
  },
  'admin.widget-builder.setting-type': {
    label: 'Setting type buttons in Widget builder settings',
    perField: true,
    panel: true,
  },
  'admin.widgets.configure': {
    label: 'Configure button on a widget access row',
    perField: true,
    panel: true,
  },
  'admin.widgets.display-name': {
    label: 'Display name box on a widget access row',
    perField: true,
    panel: true,
  },
  'admin.widgets.grade-level': {
    label: 'Grade level button on a widget access row',
    perField: true,
    panel: true,
  },
  'admin.beta.email': {
    label: 'Add beta user email box',
    panel: true,
  },
  'admin.beta.add': {
    label: 'Add beta user button',
    panel: true,
  },
  'admin.beta.remove': {
    label: 'Remove beta user button',
    perField: true,
    panel: true,
  },
  'admin.org.add-building': {
    label: 'Add building button in Organization buildings',
    panel: true,
  },
  'admin.org.add-domain': {
    label: 'Add domain button in Organization sign-in domains',
    panel: true,
  },
  'admin.org.add-domain-cancel': {
    label: 'Cancel button in Organization add domain dialog',
    panel: true,
  },
  'admin.org.add-domain-method': {
    label: 'Auth method dropdown in Organization add domain dialog',
    panel: true,
  },
  'admin.org.add-domain-name': {
    label: 'Domain field in Organization add domain dialog',
    panel: true,
  },
  'admin.org.add-domain-saml-url': {
    label: 'IdP metadata URL field in Organization add domain dialog',
    panel: true,
  },
  'admin.org.add-domain-submit': {
    label: 'Send verification button in Organization add domain dialog',
    persists: true,
    panel: true,
  },
  'admin.org.all-organizations': {
    label: 'Back to all organizations button in Organization sidebar',
    panel: true,
  },
  'admin.org.archive-org': {
    label: 'Archive organization button in Organization overview',
    destructive: true,
    panel: true,
  },
  'admin.org.mode-submissions': {
    label:
      'Submissions mode button for an assignment type in Organization app settings',
    perField: true,
    panel: true,
  },
  'admin.org.mode-view-only': {
    label:
      'View only mode button for an assignment type in Organization app settings',
    perField: true,
    panel: true,
  },
  'admin.org.assignment-modes-save': {
    label: 'Save button for assignment modes in Organization app settings',
    persists: true,
    panel: true,
  },
  'admin.org.building-address': {
    label: 'Address field in Organization building dialog',
    panel: true,
  },
  'admin.org.building-cancel': {
    label: 'Cancel button in Organization building dialog',
    panel: true,
  },
  'admin.org.building-grades': {
    label: 'Grades served field in Organization building dialog',
    panel: true,
  },
  'admin.org.building-name': {
    label: 'Building name field in Organization building dialog',
    panel: true,
  },
  'admin.org.building-save': {
    label: 'Save button in Organization building dialog',
    persists: true,
    panel: true,
  },
  'admin.org.building-type': {
    label: 'Building type dropdown in Organization building dialog',
    panel: true,
  },
  'admin.org.bulk-building-cancel': {
    label: 'Cancel button in Organization move to building dialog',
    panel: true,
  },
  'admin.org.bulk-building-continue': {
    label: 'Continue button in Organization move to building dialog',
    panel: true,
  },
  'admin.org.bulk-building-option': {
    label: 'Building checkbox in Organization move to building dialog',
    perField: true,
    panel: true,
  },
  'admin.org.bulk-change-role': {
    label: 'Change role bulk action in Organization users',
    panel: true,
  },
  'admin.org.bulk-clear': {
    label: 'Clear selection button in Organization users',
    panel: true,
  },
  'admin.org.bulk-deactivate': {
    label: 'Deactivate bulk action in Organization users',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.org.bulk-import': {
    label: 'Bulk import button in Organization users',
    panel: true,
  },
  'admin.org.bulk-move-building': {
    label: 'Move to building bulk action in Organization users',
    panel: true,
  },
  'admin.org.bulk-remove': {
    label: 'Remove from org bulk action in Organization users',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.org.bulk-resend-invite': {
    label: 'Resend invite bulk action in Organization users',
    persists: true,
    panel: true,
  },
  'admin.org.bulk-role-apply': {
    label: 'Apply button in Organization change role dialog',
    persists: true,
    panel: true,
  },
  'admin.org.bulk-role-cancel': {
    label: 'Cancel button in Organization change role dialog',
    panel: true,
  },
  'admin.org.clone-role': {
    label: 'Clone to customize button on a role card in Organization roles',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.org.confirm-cancel': {
    label: 'Cancel button in Organization confirm dialogs',
    panel: true,
  },
  'admin.org.confirm-ok': {
    label: 'Confirm button in Organization confirm dialogs',
    persists: true,
    panel: true,
  },
  'admin.org.confirm-typing': {
    label: 'Type-to-confirm input in Organization confirm dialogs',
    panel: true,
  },
  'admin.org.edit-user-building': {
    label: 'Building checkbox in Organization edit user dialog',
    perField: true,
    panel: true,
  },
  'admin.org.edit-user-cancel': {
    label: 'Cancel button in Organization edit user dialog',
    panel: true,
  },
  'admin.org.edit-user-name': {
    label: 'Name field in Organization edit user dialog',
    panel: true,
  },
  'admin.org.edit-user-role': {
    label: 'Role dropdown in Organization edit user dialog',
    panel: true,
  },
  'admin.org.edit-user-save': {
    label: 'Save changes button in Organization edit user dialog',
    persists: true,
    panel: true,
  },
  'admin.org.export-orgs': {
    label: 'Export list button in Organization organizations list',
    panel: true,
  },
  'admin.org.import-cancel': {
    label: 'Cancel button in Organization bulk import dialog',
    panel: true,
  },
  'admin.org.import-choose-file': {
    label: 'Choose CSV file button in Organization bulk import dialog',
    panel: true,
  },
  'admin.org.import-clear': {
    label: 'Clear button in Organization bulk import dialog',
    panel: true,
  },
  'admin.org.import-csv': {
    label: 'CSV text field in Organization bulk import dialog',
    panel: true,
  },
  'admin.org.import-send': {
    label: 'Send invites button in Organization bulk import dialog',
    persists: true,
    panel: true,
  },
  'admin.org.invite-building': {
    label: 'Building checkbox in Organization invite users dialog',
    perField: true,
    panel: true,
  },
  'admin.org.invite-cancel': {
    label: 'Cancel button in Organization invite users dialog',
    panel: true,
  },
  'admin.org.invite-emails': {
    label: 'Emails field in Organization invite users dialog',
    panel: true,
  },
  'admin.org.invite-message': {
    label: 'Custom message field in Organization invite users dialog',
    panel: true,
  },
  'admin.org.invite-role': {
    label: 'Role dropdown in Organization invite users dialog',
    panel: true,
  },
  'admin.org.invite-send': {
    label: 'Send invites button in Organization invite users dialog',
    persists: true,
    panel: true,
  },
  'admin.org.invite-users': {
    label: 'Invite users button in Organization users',
    panel: true,
  },
  'admin.org.media-after-date': {
    label: 'After date field in Organization media review',
    panel: true,
  },
  'admin.org.media-before-date': {
    label: 'Before date field in Organization media review',
    panel: true,
  },
  'admin.org.media-clear-filters': {
    label: 'Clear filters button in Organization media review',
    panel: true,
  },
  'admin.org.media-remove-cancel': {
    label: 'Cancel button in Organization media delete dialog',
    panel: true,
  },
  'admin.org.media-delete-confirm': {
    label: 'Delete button in Organization media delete dialog',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.org.media-delete-selected': {
    label: 'Delete selected button in Organization media review',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.org.media-remove-typing': {
    label: 'Type-to-confirm field in Organization media delete dialog',
    panel: true,
  },
  'admin.org.media-dismiss-results': {
    label: 'Dismiss results button in Organization media review',
    panel: true,
  },
  'admin.org.media-refresh': {
    label: 'Refresh button in Organization media review',
    panel: true,
  },
  'admin.org.media-retry': {
    label: 'Retry button in Organization media review',
    panel: true,
  },
  'admin.org.media-select-all': {
    label: 'Select all checkbox in Organization media review',
    panel: true,
  },
  'admin.org.media-select-row': {
    label: 'Row checkbox in Organization media review',
    panel: true,
  },
  'admin.org.media-teacher-filter': {
    label: 'Teacher filter dropdown in Organization media review',
    panel: true,
  },
  'admin.org.modal-close': {
    label: 'Close button in Organization dialogs',
    panel: true,
  },
  'admin.org.new-org': {
    label: 'New organization button in Organization organizations list',
    panel: true,
  },
  'admin.org.new-org-admin-email': {
    label: 'Primary admin email field in Organization new organization dialog',
    panel: true,
  },
  'admin.org.new-org-cancel': {
    label: 'Cancel button in Organization new organization dialog',
    panel: true,
  },
  'admin.org.new-org-create': {
    label: 'Create button in Organization new organization dialog',
    persists: true,
    panel: true,
  },
  'admin.org.new-org-name': {
    label: 'Name field in Organization new organization dialog',
    panel: true,
  },
  'admin.org.new-org-plan': {
    label: 'Plan dropdown in Organization new organization dialog',
    panel: true,
  },
  'admin.org.new-org-short-code': {
    label: 'Short code field in Organization new organization dialog',
    panel: true,
  },
  'admin.org.new-role': {
    label: 'New role button in Organization roles',
    panel: true,
  },
  'admin.org.new-role-cancel': {
    label: 'Cancel button in Organization new role dialog',
    panel: true,
  },
  'admin.org.new-role-create': {
    label: 'Create role button in Organization new role dialog',
    persists: true,
    panel: true,
  },
  'admin.org.new-role-description': {
    label: 'Description field in Organization new role dialog',
    panel: true,
  },
  'admin.org.new-role-name': {
    label: 'Role name field in Organization new role dialog',
    panel: true,
  },
  'admin.org.new-test-class': {
    label: 'New test class button in Organization test classes',
    panel: true,
  },
  'admin.org.org-search': {
    label: 'Search field in Organization organizations list',
    panel: true,
  },
  'admin.org.overview-ai-toggle': {
    label: 'AI features switch in Organization overview',
    persists: true,
    panel: true,
  },
  'admin.org.overview-name': {
    label: 'Organization name field in Organization overview',
    panel: true,
  },
  'admin.org.overview-primary-admin': {
    label: 'Primary admin field in Organization overview',
    panel: true,
  },
  'admin.org.overview-short-code': {
    label: 'Short code field in Organization overview',
    panel: true,
  },
  'admin.org.overview-short-name': {
    label: 'Short name field in Organization overview',
    panel: true,
  },
  'admin.org.overview-state': {
    label: 'State field in Organization overview',
    panel: true,
  },
  'admin.org.remove-logo': {
    label: 'Remove logo button in Organization app settings',
    destructive: true,
    persists: true,
    panel: true,
  },
  'admin.org.reset-link-copy': {
    label: 'Copy button in Organization password-reset link dialog',
    panel: true,
  },
  'admin.org.reset-link-done': {
    label: 'Done button in Organization password-reset link dialog',
    panel: true,
  },
  'admin.org.reset-link-url': {
    label: 'Password-reset link field in Organization dialog',
    panel: true,
  },
  'admin.org.reset-roles': {
    label: 'Reset to defaults button in Organization roles',
    destructive: true,
    panel: true,
  },
  'admin.org.role-access-cell': {
    label: 'Access level cell in the Organization roles matrix',
    persists: true,
    panel: true,
  },
  'admin.org.role-card': {
    label: 'Role card in Organization roles',
    perField: true,
    panel: true,
  },
  'admin.org.roles-discard': {
    label: 'Discard button for unsaved role changes in Organization roles',
    destructive: true,
    panel: true,
  },
  'admin.org.roles-save': {
    label: 'Save changes button in Organization roles',
    persists: true,
    panel: true,
  },
  'admin.org.row-menu': {
    label: 'Row actions menu button in Organization lists',
    panel: true,
  },
  'admin.org.row-menu-item': {
    label: 'Row actions menu item in Organization lists',
    perField: true,
    panel: true,
  },
  'admin.org.section': {
    label: 'Section button in Organization sidebar',
    perField: true,
    panel: true,
  },
  'admin.org.section-select': {
    label: 'Section dropdown in Organization on small screens',
    panel: true,
  },
  'admin.org.test-class-cancel': {
    label: 'Cancel button in Organization test class dialog',
    panel: true,
  },
  'admin.org.test-class-emails': {
    label: 'Member emails field in Organization test class dialog',
    panel: true,
  },
  'admin.org.test-class-id': {
    label: 'Class ID field in Organization test class dialog',
    panel: true,
  },
  'admin.org.test-class-save': {
    label: 'Create or save button in Organization test class dialog',
    persists: true,
    panel: true,
  },
  'admin.org.test-class-subject': {
    label: 'Subject field in Organization test class dialog',
    panel: true,
  },
  'admin.org.test-class-title': {
    label: 'Title field in Organization test class dialog',
    panel: true,
  },
  'admin.org.upload-logo': {
    label: 'Upload logo button in Organization app settings',
    persists: true,
    panel: true,
  },
  'admin.org.user-building-filter': {
    label: 'Building filter dropdown in Organization users',
    panel: true,
  },
  'admin.org.user-building-option': {
    label: 'Building option in Organization users buildings menu',
    perField: true,
    persists: true,
    panel: true,
  },
  'admin.org.user-building-search': {
    label: 'Building search field in Organization users buildings menu',
    panel: true,
  },
  'admin.org.user-buildings-cell': {
    label: 'Buildings cell button in Organization users',
    persists: true,
    panel: true,
  },
  'admin.org.user-role-cell': {
    label: 'Role cell button in Organization users',
    persists: true,
    panel: true,
  },
  'admin.org.user-role-filter': {
    label: 'Role filter dropdown in Organization users',
    panel: true,
  },
  'admin.org.user-search': {
    label: 'Search field in Organization users',
    panel: true,
  },
  'admin.org.user-select': {
    label: 'Row checkbox in Organization users',
    panel: true,
  },
  'admin.org.user-select-all': {
    label: 'Select all checkbox in Organization users',
    panel: true,
  },
  'admin.org.user-sort': {
    label: 'Sort dropdown in Organization users',
    panel: true,
  },
  'admin.org.user-status-cell': {
    label: 'Status cell button in Organization users',
    persists: true,
    panel: true,
  },

  // Activity Wall, Projects and Review start.
  'activity-wall.visibility': {
    label: 'Visible/Hidden posts toggle in Activity Wall',
    perWidget: true,
    persists: true,
  },
  'activity-wall.more-actions': {
    label: 'More wall actions button in Activity Wall',
    perWidget: true,
  },
  'activity-wall.copy-link': {
    label: 'Copy student link action in Activity Wall',
    perWidget: true,
    panel: true,
  },
  'activity-wall.add-qr': {
    label: 'Add join QR to board action in Activity Wall',
    perWidget: true,
    persists: true,
    panel: true,
  },
  'activity-wall.open-student-view': {
    label: 'Open student view action in Activity Wall',
    perWidget: true,
    panel: true,
  },
  'activity-wall.image-size': {
    label: 'Image size action in Activity Wall',
    perWidget: true,
    persists: true,
    panel: true,
  },
  'activity-wall.connect-drive': {
    label: 'Connect Google Drive button in Activity Wall',
    perWidget: true,
    persists: true,
  },
  'activity-wall.empty-open-library': {
    label: 'Open library button in the empty Activity Wall',
    perWidget: true,
  },
  'activity-wall.review-posts': {
    label: 'Review posts button in the empty Activity Wall',
    perWidget: true,
  },
  'activity-wall-moderation.edit-title': {
    label: 'Post title box in Moderate posts',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-moderation.edit-text': {
    label: 'Post text box in Moderate posts',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-moderation.edit-save': {
    label: 'Save post edit button in Moderate posts',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'activity-wall-moderation.edit-start': {
    label: 'Edit post button in Moderate posts',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-moderation.approve': {
    label: 'Approve post button in Moderate posts',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'activity-wall-moderation.reject': {
    label: 'Reject post button in Moderate posts',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'activity-wall-moderation.pin': {
    label: 'Pin or unpin post button in Moderate posts',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'activity-wall-moderation.delete': {
    label: 'Delete post button in Moderate posts',
    perWidgetType: true,
    destructive: true,
    persists: true,
    panel: true,
  },
  'activity-wall-link.url': {
    label: 'Link box in the Activity Wall share dialog',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-link.copy': {
    label: 'Copy link button in the Activity Wall share dialog',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-link.add-qr': {
    label: 'Add join QR to board button in the Activity Wall share dialog',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'activity-wall-link.close': {
    label: 'Close button in the Activity Wall share dialog',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-link.expiration-toggle': {
    label: 'Set link expiration checkbox in the Activity Wall share dialog',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-link.expiration-date': {
    label: 'Expiration date box in the Activity Wall share dialog',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-link.create-gallery': {
    label: 'Create gallery link button in the Activity Wall share dialog',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'activity-wall-link.done': {
    label: 'Done button in the Activity Wall share dialog',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-link.tab': {
    label:
      'Student link or Public gallery tab in the Activity Wall share dialog',
    perField: true,
    panel: true,
  },
  'activity-wall-library.empty-new': {
    label: 'New wall button in the empty wall library',
    perWidgetType: true,
    panel: true,
  },
  'activity-wall-editor.change-layout': {
    label: 'Change layout button in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.prompt': {
    label: 'Prompt box in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.submission-type': {
    label: 'Submission type toggle in the Activity Wall editor',
    perField: true,
    panel: true,
  },
  'activity-wall-editor.max-posts-custom': {
    label: 'Custom max posts button in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.max-posts-custom-input': {
    label: 'Custom max posts box in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.target-classes': {
    label: 'Target classes list in the Activity Wall editor',
    perWidget: true,
    panel: true,
  },
  'activity-wall-editor.section-label': {
    label: 'Column or row name box in the Activity Wall editor',
    panel: true,
  },
  'activity-wall-editor.section-move': {
    label: 'Move column or row button in the Activity Wall editor',
    panel: true,
  },
  'activity-wall-editor.section-remove': {
    label: 'Remove column or row button in the Activity Wall editor',
    destructive: true,
    panel: true,
  },
  'activity-wall-editor.section-add': {
    label: 'Add column or row button in the Activity Wall editor',
    panel: true,
  },
  'activity-wall-editor.map-start': {
    label: 'Map start view picker in the Activity Wall editor',
    panel: true,
  },
  'activity-wall-editor.map-zoom': {
    label: 'Map zoom slider in the Activity Wall editor',
    panel: true,
  },
  'projects.back-to-library': {
    label: 'Library back button on the Projects board',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.manage-groups': {
    label: 'Manage groups button on the Projects board',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.review-waiting': {
    label: 'Waiting for review button on the Projects board',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.layout-bars': {
    label: 'Bars layout button on the Projects board',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.layout-grid': {
    label: 'Grid layout button on the Projects board',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.actions-menu': {
    label: 'Project actions menu button on the Projects board',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.actions-menu-item': {
    label: 'Item in the Project actions menu',
    perField: true,
    panel: true,
  },
  'projects.selection-mode': {
    label: 'Select button in the Projects library',
    perWidget: true,
    requires: 'widget-restored',
  },
  'projects.discard-import': {
    label: 'Discard button on the Group Maker import banner',
    perWidget: true,
    requires: 'widget-restored',
    destructive: true,
    persists: true,
  },
  'projects.status-option': {
    label: 'Step status choice in the Projects status menu',
    perWidget: true,
    panel: true,
  },
  'projects.group-student-view': {
    label: 'Group student view button on the Projects board',
    perWidgetType: true,
    requires: 'widget-restored',
  },
  'projects.group-expand': {
    label: 'Expand group button on the Projects board',
    perWidgetType: true,
    requires: 'widget-restored',
  },
  'projects.step-cell': {
    label: 'Step status cell on the Projects board',
    perWidgetType: true,
    requires: 'widget-restored',
  },
  'projects-editor.description': {
    label: 'Description box in the project editor',
    panel: true,
  },
  'projects-editor.due': {
    label: 'Due date box in the project editor',
    panel: true,
  },
  'projects-editor.rubric': {
    label: 'Rubric picker in the project editor',
    panel: true,
  },
  'projects-editor.rubric-edit': {
    label: 'New or Edit rubric button in the project editor',
    panel: true,
  },
  'projects-editor.paste-steps': {
    label: 'Paste steps button in the project editor',
    panel: true,
  },
  'projects-editor.add-step': {
    label: 'Add step button in the project editor',
    panel: true,
  },
  'projects-editor.bulk-text': {
    label: 'One step per line box in the project editor',
    panel: true,
  },
  'projects-editor.bulk-apply': {
    label: 'Use these steps button in the project editor',
    panel: true,
  },
  'projects-editor.bulk-cancel': {
    label: 'Cancel pasted steps button in the project editor',
    panel: true,
  },
  'projects-editor.step-reorder': {
    label: 'Step drag handle in the project editor',
    panel: true,
  },
  'projects-editor.step-select': {
    label: 'Step row in the project editor',
    panel: true,
  },
  'projects-editor.step-delete': {
    label: 'Delete step button in the project editor',
    destructive: true,
    panel: true,
  },
  'projects-editor.step-title': {
    label: 'Step title box in the project editor',
    panel: true,
  },
  'projects-editor.step-description': {
    label: 'Step description box in the project editor',
    panel: true,
  },
  'projects-editor.step-due': {
    label: 'Step due date box in the project editor',
    panel: true,
  },
  'projects-editor.step-approval': {
    label: 'Needs your approval toggle in the project editor',
    panel: true,
  },
  'projects.groups-class': {
    label: 'Class picker in the Manage groups dialog',
    panel: true,
  },
  'projects.group-color': {
    label: 'Group color button in the Manage groups dialog',
    panel: true,
  },
  'projects.member-select': {
    label: 'Student chip in the Manage groups dialog',
    panel: true,
  },
  'projects.member-remove': {
    label: 'Take student out of group button in the Manage groups dialog',
    panel: true,
  },
  'projects.add-group': {
    label: 'Add group button in the Manage groups dialog',
    panel: true,
  },
  'projects.spread-students': {
    label: 'Spread ungrouped students button in the Manage groups dialog',
    panel: true,
  },
  'projects.group-name': {
    label: 'Group name box in the Manage groups dialog',
    panel: true,
  },
  'projects.group-delete': {
    label: 'Delete group button in the Manage groups dialog',
    destructive: true,
    panel: true,
  },
  'projects.group-keep': {
    label: 'Keep group button in the Manage groups dialog',
    panel: true,
  },
  'projects.group-delete-confirm': {
    label: 'Confirm delete group button in the Manage groups dialog',
    destructive: true,
    persists: true,
    panel: true,
  },
  'projects.group-move-here': {
    label: 'Move here button in the Manage groups dialog',
    panel: true,
  },
  'projects.take-out': {
    label:
      'Take selected student out of group button in the Manage groups dialog',
    panel: true,
  },
  'projects.groups-undo': {
    label: 'Undo changes button in the Manage groups dialog',
    destructive: true,
    panel: true,
  },
  'projects.groups-close': {
    label: 'Cancel or Close button in the Manage groups dialog',
    panel: true,
  },
  'projects.groups-save': {
    label: 'Save changes button in the Manage groups dialog',
    persists: true,
    panel: true,
  },
  'projects.setup-cancel': {
    label: 'Cancel button in the Set up groups dialog',
    panel: true,
  },
  'projects.setup-commit': {
    label: 'Add groups button in the Set up groups dialog',
    persists: true,
    panel: true,
  },
  'projects.setup-class': {
    label: 'Class picker in the Set up groups dialog',
    panel: true,
  },
  'projects.setup-carry-names': {
    label: 'Use Group Maker names checkbox in the Set up groups dialog',
    panel: true,
  },
  'projects.setup-count': {
    label: 'How many groups box in the Set up groups dialog',
    panel: true,
  },
  'projects.grade-prev': {
    label: 'Previous group button in the project grader',
    panel: true,
  },
  'projects.grade-skip': {
    label: 'Skip button in the project grader',
    panel: true,
  },
  'projects.grade-save': {
    label: 'Save grade button in the project grader',
    persists: true,
    panel: true,
  },
  'projects.grade-save-next': {
    label: 'Save and next button in the project grader',
    persists: true,
    panel: true,
  },
  'projects.grade-queue-item': {
    label: 'Group in the project grader queue',
    panel: true,
  },
  'projects.grade-feedback': {
    label: 'Comment to the group box in the project grader',
    panel: true,
  },
  'projects.grade-override': {
    label: 'Individual points box in the project grader',
    panel: true,
  },
  'projects.grade-override-note': {
    label: 'Individual score note box in the project grader',
    panel: true,
  },
  'projects.grade-visible': {
    label: 'Let this group see their score toggle in the project grader',
    persists: true,
    panel: true,
  },
  'projects.view-rubric': {
    label: 'How this is scored button in the group view',
    panel: true,
  },
  'projects.view-close': {
    label: 'Close button in the group view',
    panel: true,
  },
  'review-start.class-picker': {
    label: 'Class picker in the Start review dialog',
    panel: true,
  },
  'review-start.hand-raise': {
    label: 'Raise a hand toggle in the Start review dialog',
    panel: true,
  },
  'review-start.read-aloud': {
    label: 'Read aloud toggle in the Start review dialog',
    panel: true,
  },
  'review-start.speed-bonus': {
    label: 'Speed Bonus Points toggle in the Start review dialog',
    panel: true,
  },
  'review-start.streak-bonus': {
    label: 'Streak Bonuses toggle in the Start review dialog',
    panel: true,
  },
  'review-start.podium': {
    label: 'Podium Between Questions toggle in the Start review dialog',
    panel: true,
  },
  'review-start.sound-effects': {
    label: 'Sound Effects toggle in the Start review dialog',
    panel: true,
  },
  'review-start.tab-warning': {
    label: 'Tab warning threshold row in the Start review dialog',
    panel: true,
  },

  // Flashcards and Mini Apps editors, assign, results and modals.
  'flashcards.card-move': {
    label: 'Drag handle on a card in the Flashcards editor',
    perField: true,
    panel: true,
  },
  'flashcards.card-term': {
    label: 'Term box on a card in the Flashcards editor',
    perField: true,
    panel: true,
  },
  'flashcards.card-definition': {
    label: 'Definition box on a card in the Flashcards editor',
    perField: true,
    panel: true,
  },
  'flashcards.card-delete': {
    label: 'Delete button on a card in the Flashcards editor',
    perField: true,
    destructive: true,
    panel: true,
  },
  'flashcards.editor-back': {
    label: 'Back button in the Flashcards editor',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.editor-paste': {
    label: 'Paste button in the Flashcards editor',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.editor-save': {
    label: 'Save button in the Flashcards editor',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'flashcards.editor-description': {
    label: 'Description box in the Flashcards editor',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.add-card': {
    label: 'Add card button in the Flashcards editor',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.language-select': {
    label: 'Language picker in the Flashcards editor',
    perField: true,
    panel: true,
  },
  'flashcards.language-code': {
    label: 'Custom language code box in the Flashcards editor',
    perField: true,
    panel: true,
  },
  'flashcards.collect-submission': {
    label: 'Collect a submission switch in the Flashcards assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.check-mode': {
    label: 'Mode choice in the Flashcards assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.show-first': {
    label: 'Show first choice in the Flashcards assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.strict-mode': {
    label: 'Strict mode switch in the Flashcards assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.question-type': {
    label: 'Question type checkbox in the Flashcards assign dialog',
    perField: true,
    panel: true,
  },
  'flashcards.question-count': {
    label: 'Questions count in the Flashcards assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.mastery-threshold': {
    label: 'Mastery threshold choice in the Flashcards assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.score-visibility': {
    label: 'Score visibility picker in the Flashcards assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.assign-confirm': {
    label: 'Assign button in the Flashcards assign dialog',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'flashcards.student-actions': {
    label: 'Actions menu button on a student row in Flashcards Check results',
    perField: true,
    panel: true,
  },
  'flashcards.student-menu-item': {
    label: 'Item in a student actions menu in Flashcards Check results',
    perField: true,
    destructive: true,
    persists: true,
    panel: true,
  },
  'flashcards.flag-accept': {
    label: 'Accept button on a flagged answer in Flashcards results',
    perField: true,
    persists: true,
    panel: true,
  },
  'flashcards.flag-dismiss': {
    label: 'Dismiss button on a flagged answer in Flashcards results',
    perField: true,
    persists: true,
    panel: true,
  },
  'flashcards.let-in': {
    label: 'Let in now button in Flashcards Study results',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'flashcards.reset-student': {
    label: 'Reset this student button in Flashcards Study results',
    perWidgetType: true,
    destructive: true,
    persists: true,
    panel: true,
  },
  'flashcards.publish-scores': {
    label: 'Publish or Hide scores button in Flashcards results',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'flashcards.results-class-filter': {
    label: 'Class filter button in Flashcards results',
    perField: true,
    panel: true,
  },
  'flashcards.scores-cancel': {
    label: 'Cancel button in the Flashcards publish scores dialog',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.publish-confirm': {
    label: 'Publish button in the Flashcards publish scores dialog',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'flashcards.scores-visibility': {
    label: 'Score visibility option in the Flashcards publish scores dialog',
    perField: true,
    panel: true,
  },
  'flashcards.paste-close': {
    label: 'Close button in the Flashcards paste drawer',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.paste-separator': {
    label: 'Separator picker in the Flashcards paste drawer',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.paste-custom-separator': {
    label: 'Custom separator box in the Flashcards paste drawer',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.paste-source': {
    label: 'Terms and definitions box in the Flashcards paste drawer',
    perWidgetType: true,
    panel: true,
  },
  'flashcards.paste-add': {
    label: 'Add cards button in the Flashcards paste drawer',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.dialog-close': {
    label: 'Close button in the Mini App assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.copy-link': {
    label: 'Copy link button in the Mini App assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.session-name': {
    label: 'Assignment name box in the Mini App assign dialog',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.assign-confirm': {
    label: 'Assign or Create share link button in the Mini App assign dialog',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'mini-app.toolbar-student-link': {
    label: 'Assign button in the running Mini App toolbar',
    perWidgetType: true,
  },
  'mini-app.toolbar-sessions': {
    label: 'Assignments button in the running Mini App toolbar',
    perWidgetType: true,
  },
  'mini-app.toolbar-save': {
    label: 'Save button in the running Mini App toolbar',
    perWidgetType: true,
    persists: true,
  },
  'mini-app.toolbar-qr': {
    label: 'QR Share button in the running Mini App toolbar',
    perWidgetType: true,
    persists: true,
  },
  'mini-app.toolbar-save-as-widget': {
    label: 'Save as Widget button in the running Mini App toolbar',
    perWidgetType: true,
    persists: true,
  },
  'mini-app.toolbar-library': {
    label: 'Library button in the running Mini App toolbar',
    perWidgetType: true,
  },
  'mini-app.save-cancel': {
    label: 'Cancel button in the Mini App save to library form',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.save-title': {
    label: 'App title box in the Mini App save to library form',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.save-app': {
    label: 'Save App button in the Mini App save to library form',
    perWidgetType: true,
    persists: true,
    panel: true,
  },
  'mini-app.select-mode': {
    label: 'Select button in the Mini App library toolbar',
    perWidgetType: true,
  },
  'mini-app.draft-with-ai': {
    label: 'Draft with AI button in the Mini App editor',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.import-from-notes': {
    label: 'Import from Notes button in the Mini App AI drafter',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.ai-prompt': {
    label: 'Describe your mini-app box in the Mini App AI drafter',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.html-code': {
    label: 'HTML Code box in the Mini App editor',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.sessions-close': {
    label: 'Close button in the Mini App assignments list',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.session-rename-input': {
    label: 'Rename box on a Mini App assignment',
    perField: true,
    panel: true,
  },
  'mini-app.session-rename-save': {
    label: 'Save rename button on a Mini App assignment',
    perField: true,
    persists: true,
    panel: true,
  },
  'mini-app.session-rename': {
    label: 'Rename button on a Mini App assignment',
    perField: true,
    panel: true,
  },
  'mini-app.session-copy-link': {
    label: 'Copy Link button on a Mini App assignment',
    perField: true,
    panel: true,
  },
  'mini-app.session-open': {
    label: 'Open button on a Mini App assignment',
    perField: true,
    panel: true,
  },
  'mini-app.session-submissions': {
    label: 'Submissions button on a Mini App assignment',
    perField: true,
    panel: true,
  },
  'mini-app.session-end-confirm': {
    label: 'Confirm End button on a Mini App assignment',
    perField: true,
    destructive: true,
    persists: true,
    panel: true,
  },
  'mini-app.session-end': {
    label: 'End Session button on a Mini App assignment',
    perField: true,
    destructive: true,
    persists: true,
    panel: true,
  },
  'mini-app.submissions-close': {
    label: 'Close button in the Mini App submissions list',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.submission-row': {
    label: 'Submission row in the Mini App submissions list',
    perField: true,
    panel: true,
  },
  'mini-app.save-as-widget-close': {
    label: 'Close button in the Mini App Save as Widget dialog',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.save-as-widget-title': {
    label: 'Title box in the Mini App Save as Widget dialog',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.save-as-widget-icon': {
    label: 'Icon option in the Mini App Save as Widget dialog',
    perField: true,
    panel: true,
  },
  'mini-app.save-as-widget-color': {
    label: 'Color option in the Mini App Save as Widget dialog',
    perField: true,
    panel: true,
  },
  'mini-app.save-as-widget-cancel': {
    label: 'Cancel button in the Mini App Save as Widget dialog',
    perWidgetType: true,
    panel: true,
  },
  'mini-app.save-as-widget-save': {
    label: 'Save Widget button in the Mini App Save as Widget dialog',
    perWidgetType: true,
    persists: true,
    panel: true,
  },

  // Video Activity editor, live monitor, results and student app.
  'video-activity.creator-back': {
    label: 'Back arrow in the video activity creator',
  },
  'video-activity.creator-title': {
    label: 'Activity title box in the video activity creator',
  },
  'video-activity.creator-discover-tab': {
    label: 'Paste URL, Search and Recommend tabs in the creator',
    perField: true,
  },
  'video-activity.creator-url': {
    label: 'YouTube URL box in the creator',
  },
  'video-activity.creator-next': {
    label: 'Next Step button in the creator',
  },
  'video-activity.creator-source-ai': {
    label: 'Draft with AI choice in the creator',
  },
  'video-activity.creator-source-import': {
    label: 'Import choice in the creator',
  },
  'video-activity.creator-source-manual': {
    label: 'Create manually choice in the creator',
    persists: true,
  },
  'video-activity.creator-ai-count': {
    label: 'Question count slider in the creator AI step',
  },
  'video-activity.creator-ai-generate': {
    label: 'Generate button in the creator AI step',
    persists: true,
  },
  'video-activity.creator-search-query': {
    label: 'Video search box in the creator',
  },
  'video-activity.creator-search-submit': {
    label: 'Search button in the creator',
  },
  'video-activity.creator-result': {
    label: 'Video search result in the creator',
    perField: true,
  },
  'video-activity.creator-recommend-topic': {
    label: 'Topic box in the creator Recommend tab',
  },
  'video-activity.creator-recommend-submit': {
    label: 'Recommend button in the creator',
  },
  'video-activity.creator-recommend-accept': {
    label: 'Use this video button in the creator',
  },
  'video-activity.editor-youtube-url': {
    label: 'YouTube URL box in the video activity editor',
    persists: true,
  },
  'video-activity.editor-question-pill': {
    label: 'Question button in the editor question list',
    perField: true,
  },
  'video-activity.editor-question-delete': {
    label: 'Delete button on a question in the editor question list',
    perField: true,
    destructive: true,
    persists: true,
  },
  'video-activity.editor-question-text': {
    label: 'Question prompt box in the video activity editor',
    persists: true,
  },
  'video-activity.editor-question-type': {
    label: 'Question type button in the video activity editor',
    perField: true,
    persists: true,
  },
  'video-activity.editor-question-timestamp': {
    label: 'Question timestamp box in the video activity editor',
    persists: true,
  },
  'video-activity.editor-question-time-limit': {
    label: 'Question time limit box in the video activity editor',
    persists: true,
  },
  'video-activity.editor-question-points': {
    label: 'Question points box in the video activity editor',
    persists: true,
  },
  'video-activity.ai-count-decrement': {
    label: 'Fewer questions button for a type in the AI drafter',
    perField: true,
  },
  'video-activity.ai-count-increment': {
    label: 'More questions button for a type in the AI drafter',
    perField: true,
  },
  'video-activity.editor-correct-answer': {
    label: 'Correct answer box for a multiple choice question',
    persists: true,
  },
  'video-activity.editor-incorrect-answer': {
    label: 'Incorrect answer box for a multiple choice question',
    perField: true,
    persists: true,
  },
  'video-activity.editor-fib-answer': {
    label: 'Canonical answer box for a fill in the blank question',
    persists: true,
  },
  'video-activity.editor-fib-variants': {
    label: 'Acceptable variants box for a fill in the blank question',
    persists: true,
  },
  'video-activity.editor-option-correct': {
    label: 'Correct toggle on a multi-answer option',
    perField: true,
    persists: true,
  },
  'video-activity.editor-option-text': {
    label: 'Text box on a multi-answer option',
    perField: true,
    persists: true,
  },
  'video-activity.editor-partial-credit': {
    label: 'Allow partial credit checkbox in the video activity editor',
    persists: true,
  },
  'video-activity.editor-draft-ai': {
    label: 'Draft with AI button in the video activity editor footer',
  },
  'video-activity.editor-tab': {
    label: 'Questions and Settings tabs in the video activity editor',
    perField: true,
  },
  'video-activity.live-start': {
    label: 'Start button in the live video activity waiting room',
    persists: true,
  },
  'video-activity.live-who-open': {
    label: 'Answered count button on a live video question',
  },
  'video-activity.live-who-close': {
    label: 'Close button in the who has not answered popover',
    panel: true,
  },
  'video-activity.live-play-toggle': {
    label: 'Play and pause button in the live video controls',
  },
  'video-activity.live-scrub': {
    label: 'Video position slider in the live video controls',
  },
  'video-activity.live-list-toggle': {
    label: 'Question list toggle in the live video controls',
  },
  'video-activity.live-jump-question': {
    label: 'Jump to question button in the live question list',
    perField: true,
  },
  'video-activity.monitor-unlock': {
    label: 'Unlock badge on a student row in the live monitor',
    perField: true,
    persists: true,
  },
  'video-activity.monitor-let-in': {
    label: 'Let in now button on a student row in the live monitor',
    perField: true,
    persists: true,
  },
  'video-activity.monitor-tab-warnings': {
    label: 'Tab warnings toggle in the live monitor',
  },
  'video-activity.results-tab': {
    label: 'Overview, Questions and Students tabs in video activity results',
    perField: true,
  },
  'video-activity.results-more-item': {
    label: 'Item in the video activity results more menu',
    perField: true,
    persists: true,
    panel: true,
  },
  'video-activity.timeline-track': {
    label: 'Video timeline track in the editor',
  },
  'video-activity.timeline-marker': {
    label: 'Question marker on the editor video timeline',
    perField: true,
    persists: true,
  },
  'video-activity.timeline-add': {
    label: 'Add question at playhead button under the editor timeline',
    persists: true,
  },
  'video-activity.empty-create': {
    label: 'Create Activity button in the empty video activity library',
  },
  'video-activity.selection-toggle': {
    label: 'Select toggle in the video activity library',
  },
  'video-activity.assign-due-date': {
    label: 'Due date box in the video activity assign dialog',
    persists: true,
    panel: true,
  },
  'video-activity.behavior-open-editor': {
    label: 'Edit in activity link in the video activity assign dialog',
    panel: true,
  },
  'video-activity.settings-score-visibility': {
    label: 'Score visibility option in video activity behavior settings',
    perField: true,
    persists: true,
  },
  'video-activity.admin-tab': {
    label: 'List and Settings tabs in the video activity admin modal',
    perField: true,
    panel: true,
  },
  'video-activity.admin-building-all': {
    label: 'All buildings chip on an admin video activity',
    persists: true,
    panel: true,
  },
  'video-activity.admin-building': {
    label: 'Building chip on an admin video activity',
    perField: true,
    persists: true,
    panel: true,
  },
  'video-activity.admin-delete': {
    label: 'Delete button on an admin video activity',
    destructive: true,
    persists: true,
    panel: true,
  },
  'video-activity.plc-assign-due-date': {
    label: 'Due date box in the PLC video activity assign dialog',
    persists: true,
    panel: true,
  },
  'video-activity.plc-teacher-name': {
    label: 'Teacher name box in the PLC video activity assign dialog',
    persists: true,
    panel: true,
  },
  'video-activity.plc-sheet-url': {
    label: 'PLC sheet URL box in the PLC video activity assign dialog',
    persists: true,
    panel: true,
  },

  // Guided Learning editor, Studio, player and results.
  'gl-results.error-back': {
    label: 'Back to library button in the results error state',
  },
  'gl-editor.draft-ai': {
    label: 'Draft with AI button in the Guided Learning editor',
    panel: true,
  },
  'gl-editor.open-classic': {
    label: 'Open classic editor link in the Studio header',
    panel: true,
  },
  'gl-ai.image-reorder': {
    label: 'Drag handle on a source image in the AI generator',
    panel: true,
  },
  'gl-ai.image-remove': {
    label: 'Remove button on a source image in the AI generator',
    destructive: true,
    panel: true,
  },
  'gl-ai.image-notes': {
    label: 'Notes box on a source image in the AI generator',
    panel: true,
  },
  'gl-ai.add-images': {
    label: 'Add source images drop zone in the AI generator',
    panel: true,
  },
  'gl-ai.prompt': {
    label: 'Extra instructions box in the AI generator',
    panel: true,
  },
  'gl-ai.generate': {
    label: 'Generate button in the AI generator',
    persists: true,
    panel: true,
  },
  'gl-editor.description': {
    label: 'Description box in the classic editor',
    panel: true,
  },
  'gl-editor.mode': { label: 'Mode pill in the classic editor', panel: true },
  'gl-editor.slide-tab': {
    label: 'Slide tab in the classic editor',
    panel: true,
  },
  'gl-editor.canvas': {
    label: 'Image canvas in the classic editor',
    panel: true,
  },
  'gl-editor.upload': {
    label: 'Add media button in the classic editor',
    panel: true,
  },
  'gl-editor.paste': {
    label: 'Paste from clipboard button in the classic editor',
    panel: true,
  },
  'gl-editor.add-step': {
    label: 'Add hotspot button in the classic editor',
    panel: true,
  },
  'gl-editor.trim-toggle': {
    label: 'Trim toggle in the classic editor',
    panel: true,
  },
  'gl-editor.slide-earlier': {
    label: 'Move slide earlier button in the classic editor',
    panel: true,
  },
  'gl-editor.slide-later': {
    label: 'Move slide later button in the classic editor',
    panel: true,
  },
  'gl-editor.slide-delete': {
    label: 'Delete slide button in the classic editor',
    destructive: true,
    panel: true,
  },
  'gl-editor.step-chip': {
    label: 'Step chip in the classic editor step list',
    panel: true,
  },
  'gl-editor.hotspot-marker': {
    label: 'Hotspot marker on the classic editor canvas',
    panel: true,
  },
  'gl-editor.welcome': {
    label: 'Welcome screen chip in the classic editor',
    panel: true,
  },
  'gl-editor.welcome-enabled': {
    label: 'Show welcome screen checkbox',
    panel: true,
  },
  'gl-editor.welcome-message': { label: 'Welcome message box', panel: true },
  'gl-editor.trim': { label: 'Video trim bar', panel: true },
  'gl-editor.trim-reset': {
    label: 'Reset trim button in the video trim bar',
    panel: true,
  },
  'gl-editor.folder': {
    label: 'Folder picker button in the editor header',
    panel: true,
  },
  'gl-editor.step-delete': {
    label: 'Delete step button in the classic step editor',
    destructive: true,
    panel: true,
  },
  'gl-editor.step-label': {
    label: 'Step label box in the classic step editor',
    panel: true,
  },
  'gl-editor.step-interaction': {
    label: 'Interaction type select in the classic step editor',
    panel: true,
  },
  'gl-editor.step-slide': {
    label: 'Slide select in the classic step editor',
    panel: true,
  },
  'gl-editor.step-hide-marker': {
    label: 'Always hide hotspot marker checkbox',
    panel: true,
  },
  'gl-editor.step-text': {
    label: 'Text content box in the classic step editor',
    panel: true,
  },
  'gl-editor.step-tooltip-position': {
    label: 'Tooltip position select',
    panel: true,
  },
  'gl-editor.step-tooltip-offset': {
    label: 'Tooltip distance slider',
    panel: true,
  },
  'gl-editor.step-audio-url': { label: 'Audio URL box', panel: true },
  'gl-editor.step-video-url': { label: 'Video URL box', panel: true },
  'gl-editor.step-zoom': { label: 'Pan and zoom scale slider', panel: true },
  'gl-editor.step-spotlight': { label: 'Spotlight radius slider', panel: true },
  'gl-editor.step-overlay': { label: 'Overlay style select', panel: true },
  'gl-editor.step-overlay-text': { label: 'Overlay text box', panel: true },
  'gl-editor.step-banner-tone': { label: 'Banner tone select', panel: true },
  'gl-editor.step-auto-advance': {
    label: 'Auto-advance seconds box',
    panel: true,
  },
  'gl-editor.step-upload': {
    label: 'Upload media button in the classic step editor',
    panel: true,
  },
  'gl-editor.question-type': {
    label: 'Question type select in the classic step editor',
    panel: true,
  },
  'gl-editor.question-text': {
    label: 'Question text box in the classic step editor',
    panel: true,
  },
  'gl-editor.question-correct': {
    label: 'Correct answer radio in the classic step editor',
    panel: true,
  },
  'gl-editor.question-choice': {
    label: 'Answer choice box in the classic step editor',
    panel: true,
  },
  'gl-editor.question-choice-remove': {
    label: 'Remove answer choice button in the classic step editor',
    destructive: true,
    panel: true,
  },
  'gl-editor.question-choice-add': {
    label: 'Add answer choice button in the classic step editor',
    panel: true,
  },
  'gl-editor.question-match-left': {
    label: 'Matching term box in the classic step editor',
    panel: true,
  },
  'gl-editor.question-match-right': {
    label: 'Matching definition box in the classic step editor',
    panel: true,
  },
  'gl-editor.question-match-remove': {
    label: 'Remove matching pair button in the classic step editor',
    destructive: true,
    panel: true,
  },
  'gl-editor.question-match-add': {
    label: 'Add matching pair button in the classic step editor',
    panel: true,
  },
  'gl-editor.question-sort-item': {
    label: 'Sorting item box in the classic step editor',
    panel: true,
  },
  'gl-editor.question-sort-remove': {
    label: 'Remove sorting item button in the classic step editor',
    destructive: true,
    panel: true,
  },
  'gl-editor.question-sort-add': {
    label: 'Add sorting item button in the classic step editor',
    panel: true,
  },
  'gl-manager.show-older': { label: 'Show older assignments button' },
  'gl-manager.select-mode': {
    label: 'Select mode toggle in the Guided Learning library',
  },
  'gl-manager.preview-play': {
    label: 'Play preview button in the Guided Learning library',
  },
  'gl-player.read-aloud': { label: 'Read aloud button in the player' },
  'gl-player.prev': { label: 'Previous step button in the player' },
  'gl-player.play-pause': { label: 'Play or pause button in the player' },
  'gl-player.step-dot': { label: 'Step progress dot in the player' },
  'gl-player.next': { label: 'Next step button in the player' },
  'gl-player.hotspot': { label: 'Hotspot on the player slide' },
  'gl-player.retry-slide': { label: 'Retry slide load button in the player' },
  'gl-player.reset-zoom': { label: 'Reset zoom button in the player' },
  'gl-player.outline-open': { label: 'Open outline button in the player' },
  'gl-player.close': { label: 'Close button in the player' },
  'gl-player.slide-thumb': { label: 'Slide thumbnail in the player' },
  'gl-player.more': { label: 'More actions button in the player footer' },
  'gl-player.resume': { label: 'Resume button in the player resume prompt' },
  'gl-player.resume-start-over': {
    label: 'Start over button in the player resume prompt',
    destructive: true,
  },
  'gl-player.speed-option': {
    label: 'Playback speed option in the player',
    panel: true,
  },
  'gl-player.outline-step': {
    label: 'Step in the player outline',
    panel: true,
  },
  'gl-player.scrubber': { label: 'Watch scrubber in the player' },
  'gl-results.back': { label: 'Back button in the results header' },
  'gl-results.export': { label: 'Export button in the results header' },
  'gl-results.period-start-all': {
    label: 'Start all periods button in results',
    persists: true,
  },
  'gl-results.period-pause-all': {
    label: 'Pause all periods button in results',
    persists: true,
  },
  'gl-capture.upload': {
    label: 'Upload file button in the capture dialog',
    panel: true,
  },
  'gl-capture.screen-start': {
    label: 'Share screen button in the capture dialog',
    panel: true,
  },
  'gl-capture.snap': {
    label: 'Snap frame button in the capture dialog',
    panel: true,
  },
  'gl-capture.record-start': {
    label: 'Start recording button in the capture dialog',
    panel: true,
  },
  'gl-capture.record-stop': {
    label: 'Stop recording button in the capture dialog',
    panel: true,
  },
  'gl-capture.add-frame': {
    label: 'Add frame button in the capture dialog',
    panel: true,
  },
  'gl-capture.add-video': {
    label: 'Add whole video button in the capture dialog',
    panel: true,
  },
  'gl-capture.upload-video': {
    label: 'Upload video file button in the capture dialog',
    panel: true,
  },
  'gl-capture.screen-stop': {
    label: 'Stop sharing button in the capture dialog',
    panel: true,
  },
  'studio.blur-remove': {
    label: 'Remove blur box button on the Studio canvas',
    panel: true,
  },
  'studio.callout-edit-text': {
    label: 'Edit callout text button',
    panel: true,
  },
  'studio.callout-reset-position': {
    label: 'Reset callout position button',
    panel: true,
  },
  'studio.callout-reset-size': {
    label: 'Reset callout size button',
    panel: true,
  },
  'studio.callout-kind': { label: 'Toggle callout kind button', panel: true },
  'studio.callout-tone': { label: 'Callout colour option', panel: true },
  'studio.callout-delete': {
    label: 'Delete callout step button',
    destructive: true,
    panel: true,
  },
  'studio.device-size': { label: 'Custom preview size box', panel: true },
  'studio.device-preset': { label: 'Preview device select', panel: true },
  'studio.callout-label': { label: 'Inline callout label box', panel: true },
  'studio.callout-text': { label: 'Inline callout text box', panel: true },
  'studio.undo': { label: 'Undo button in the Studio top bar', panel: true },
  'studio.redo': { label: 'Redo button in the Studio top bar', panel: true },
  'studio.play': { label: 'Play button in the Studio top bar', panel: true },
  'studio.shortcuts': {
    label: 'Keyboard shortcuts button in the Studio top bar',
    panel: true,
  },
  'studio.properties': {
    label: 'Properties panel toggle in the Studio top bar',
    panel: true,
  },
  'studio.folder': {
    label: 'Folder picker button in the Studio top bar',
    panel: true,
  },
  'studio.conflict-reload': {
    label: 'Reload latest version button in the Studio conflict banner',
    destructive: true,
    panel: true,
  },
  'studio.conflict-overwrite': {
    label: 'Overwrite button in the Studio conflict banner',
    destructive: true,
    persists: true,
    panel: true,
  },
  'studio.dismiss-note': {
    label: 'Dismiss button on the Studio small-screen note',
    panel: true,
  },
  'studio.properties-close': {
    label: 'Close properties panel button',
    panel: true,
  },
  'studio.tool-select': {
    label: 'Select tool on the Studio canvas',
    panel: true,
  },
  'studio.tool-shape': {
    label: 'Shape tool on the Studio canvas',
    panel: true,
  },
  'studio.tool-blur': { label: 'Blur tool on the Studio canvas', panel: true },
  'studio.blur-mode': {
    label: 'Blur mode button on the Studio canvas',
    panel: true,
  },
  'studio.blur-apply': {
    label: 'Apply blur button on the Studio canvas',
    persists: true,
    panel: true,
  },
  'studio.blur-cancel': {
    label: 'Cancel blur button on the Studio canvas',
    panel: true,
  },
  'studio.zoom-out': {
    label: 'Zoom out button on the Studio canvas',
    panel: true,
  },
  'studio.zoom-in': {
    label: 'Zoom in button on the Studio canvas',
    panel: true,
  },
  'studio.zoom-fit': {
    label: 'Zoom to fit button on the Studio canvas',
    panel: true,
  },
  'studio.vertex-handle': {
    label: 'Polygon vertex handle on the Studio canvas',
    panel: true,
  },
  'studio.slide-thumb': {
    label: 'Slide thumbnail in the Studio filmstrip',
    panel: true,
  },
  'studio.slide-delete': {
    label: 'Delete slide button in the Studio filmstrip',
    destructive: true,
    panel: true,
  },
  'studio.slides-show': {
    label: 'Show slides button in the Studio filmstrip',
    panel: true,
  },
  'studio.slides-hide': {
    label: 'Hide slides button in the Studio filmstrip',
    panel: true,
  },
  'studio.upload-slide': {
    label: 'Add media button in the Studio filmstrip',
    panel: true,
  },
  'studio.paste-slide': {
    label: 'Paste slide button in the Studio filmstrip',
    panel: true,
  },
  'studio.narration-stop': {
    label: 'Stop narration recording button',
    panel: true,
  },
  'studio.narration-save': {
    label: 'Save narration button',
    persists: true,
    panel: true,
  },
  'studio.narration-discard': {
    label: 'Discard narration recording button',
    destructive: true,
    panel: true,
  },
  'studio.narration-record': {
    label: 'Start narration recording button',
    panel: true,
  },
  'studio.narration-cancel': {
    label: 'Cancel narration recording button',
    panel: true,
  },
  'studio.narration-generate': {
    label: 'Generate narration with AI button',
    persists: true,
    panel: true,
  },
  'studio.narration-open-recorder': {
    label: 'Record narration button',
    panel: true,
  },
  'studio.narration-delete': {
    label: 'Delete narration button',
    destructive: true,
    panel: true,
  },
  'studio.narration-batch-generate': {
    label: 'Generate narration for all steps button',
    persists: true,
    panel: true,
  },
  'studio.play-exit': {
    label: 'Back to editing button in Studio play mode',
    panel: true,
  },
  'studio.play-show-key': {
    label: 'Show answer key switch in Studio play mode',
    panel: true,
  },
  'studio.props-delete-step': {
    label: 'Delete step button in the Studio properties panel',
    destructive: true,
    panel: true,
  },
  'studio.props-mark-reviewed': {
    label: 'Mark reviewed button in the Studio properties panel',
    persists: true,
    panel: true,
  },
  'studio.props-description': {
    label: 'Description box in the Studio properties panel',
    panel: true,
  },
  'studio.props-welcome-enabled': {
    label: 'Welcome screen checkbox in the Studio properties panel',
    panel: true,
  },
  'studio.props-welcome-message': {
    label: 'Welcome message box in the Studio properties panel',
    panel: true,
  },
  'studio.props-edit-on-board': {
    label: 'Edit on board button in the Studio properties panel',
    panel: true,
  },
  'studio.question-text': { label: 'Question text box in Studio', panel: true },
  'studio.question-correct': {
    label: 'Correct answer radio in Studio',
    panel: true,
  },
  'studio.question-choice': {
    label: 'Answer choice box in Studio',
    panel: true,
  },
  'studio.question-choice-remove': {
    label: 'Remove answer choice button in Studio',
    destructive: true,
    panel: true,
  },
  'studio.question-choice-add': {
    label: 'Add answer choice button in Studio',
    panel: true,
  },
  'studio.question-match-left': {
    label: 'Matching term box in Studio',
    panel: true,
  },
  'studio.question-match-right': {
    label: 'Matching definition box in Studio',
    panel: true,
  },
  'studio.question-match-remove': {
    label: 'Remove matching pair button in Studio',
    destructive: true,
    panel: true,
  },
  'studio.question-match-add': {
    label: 'Add matching pair button in Studio',
    panel: true,
  },
  'studio.question-sort-item': {
    label: 'Sorting item box in Studio',
    panel: true,
  },
  'studio.question-sort-remove': {
    label: 'Remove sorting item button in Studio',
    destructive: true,
    panel: true,
  },
  'studio.question-sort-add': {
    label: 'Add sorting item button in Studio',
    panel: true,
  },
  'studio.region-corner': {
    label: 'Corner radius slider for a hotspot region',
    panel: true,
  },
  'studio.region-reset': {
    label: 'Reset placement button for a hotspot region',
    panel: true,
  },
  'studio.hub-upload': {
    label: 'Upload card in the Studio start hub',
    panel: true,
  },
  'studio.hub-paste': {
    label: 'Paste card in the Studio start hub',
    panel: true,
  },
  'studio.hub-capture': {
    label: 'Capture card in the Studio start hub',
    panel: true,
  },
  'studio.hub-record': {
    label: 'Record a tour card in the Studio start hub',
    panel: true,
  },
  'studio.hub-ai': {
    label: 'Draft with AI card in the Studio start hub',
    panel: true,
  },
  'studio.hub-import': {
    label: 'Import card in the Studio start hub',
    panel: true,
  },
  'studio.step-interaction': {
    label: 'Interaction type select in the Studio step fields',
    panel: true,
  },
  'studio.step-slide': {
    label: 'Slide select in the Studio step fields',
    panel: true,
  },
  'studio.step-label': {
    label: 'Step label box in the Studio step fields',
    panel: true,
  },
  'studio.step-text': {
    label: 'Step text box in the Studio step fields',
    panel: true,
  },
  'studio.step-auto-advance': {
    label: 'Auto-advance seconds box in the Studio step fields',
    panel: true,
  },
  'studio.step-hide-marker': {
    label: 'Always hide hotspot marker checkbox in Studio',
    panel: true,
  },
  'studio.step-range': {
    label: 'Slider in the Studio step fields',
    panel: true,
  },
  'studio.step-url': {
    label: 'Media URL box in the Studio step fields',
    panel: true,
  },
  'studio.step-upload': {
    label: 'Upload media button in the Studio step fields',
    panel: true,
  },
  'studio.timeline-slide': {
    label: 'Go to slide button in the Studio timeline',
    panel: true,
  },
  'studio.timeline-step': {
    label: 'Step chip in the Studio timeline',
    panel: true,
  },
  'studio.add-step': {
    label: 'Add step button in the Studio timeline',
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
