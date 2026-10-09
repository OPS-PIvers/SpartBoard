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
  // Assign dialogs: stepper steps, legacy Assign window, student pickers, settings and publish.
  'assign-when.mode': {
    label: 'Manual or Scheduled switch in the Assign dialog',
    panel: true,
  },
  'assign-when.scope': {
    label:
      'Same time or different time for each class button in the Assign dialog',
    panel: true,
  },
  'assign-when.allow-late': {
    label: 'Allow submissions after close switch in the Assign dialog',
    panel: true,
  },
  'assign-when.window': {
    label: 'Schedule switch in the Assign dialog',
    panel: true,
  },
  'assign-classes.trigger': {
    label: 'Classes menu button in the Assign dialog',
    panel: true,
  },
  'assign-classes.option': {
    label: 'Class checkbox in the Assign dialog classes menu',
    perField: true,
    panel: true,
  },
  'assign-classes.select-all': {
    label: 'Select all button in the Assign dialog classes menu',
    panel: true,
  },
  'assign-classes.clear': {
    label: 'Clear button in the Assign dialog classes menu',
    panel: true,
  },
  'assign-students.trigger': {
    label: 'All students menu button for a class in the Assign dialog',
    perField: true,
    panel: true,
  },
  'assign-students.search': {
    label: 'Search students box in the Assign dialog students menu',
    panel: true,
  },
  'assign-students.group': {
    label: 'Group button in the Assign dialog students menu',
    perField: true,
    panel: true,
  },
  'assign-students.option': {
    label: 'Student checkbox in the Assign dialog students menu',
    perField: true,
    panel: true,
  },
  'assign-students.all': {
    label: 'All students button in the Assign dialog students menu',
    panel: true,
  },
  'assign-students.clear': {
    label: 'Clear button in the Assign dialog students menu',
    panel: true,
  },
  'sharing.plc-toggle': {
    label: 'Share results with a PLC switch in the Assign dialog',
    panel: true,
  },
  'sharing.plc-select': {
    label: 'PLC dropdown in the Assign dialog',
    panel: true,
  },
  'flashcards-check.strict': {
    label: 'Strict mode switch in the Assign dialog flashcards check step',
    panel: true,
  },
  'flashcards-check.test-type': {
    label: 'Question type switch in the Assign dialog flashcards check step',
    perField: true,
    panel: true,
  },
  'flashcards-check.questions': {
    label: 'Questions dropdown in the Assign dialog flashcards check step',
    panel: true,
  },
  'flashcards-check.mastery': {
    label:
      'Correct in a row to master box in the Assign dialog flashcards check step',
    panel: true,
  },
  'flashcards-check.score-visibility': {
    label:
      'Score visibility dropdown in the Assign dialog flashcards check step',
    panel: true,
  },
  'assign-mods.open': {
    label: 'Modifications link in the Assign dialog',
    panel: true,
  },
  'assign-mods.back': {
    label: 'Back button in the Assign dialog modifications view',
    panel: true,
  },
  'assign-mods.clear': {
    label:
      'Clear all modifications button in the Assign dialog modifications view',
    destructive: true,
    panel: true,
  },
  'assign-mods.done': {
    label: 'Done button in the Assign dialog modifications view',
    panel: true,
  },
  'assign-mods.show-all': {
    label:
      'Show more or fewer students button in the Assign dialog modifications view',
    panel: true,
  },
  'assign-mods.add-student': {
    label: 'Add a student dropdown in the Assign dialog modifications view',
    panel: true,
  },
  'assign-mods.skip-student': {
    label: 'Skip this student switch in the Assign dialog modifications view',
    perField: true,
    panel: true,
  },
  'assign-mods.remove': {
    label: 'Remove modification button in the Assign dialog modifications view',
    perField: true,
    destructive: true,
    panel: true,
  },
  'assign-mods.generate-translation': {
    label:
      'Generate translation button in the Assign dialog modifications view',
    perField: true,
    panel: true,
  },
  'assign-override.row': {
    label: 'Student modification row in the Assign dialog',
    panel: true,
  },
  'assign-override.copy-from': {
    label:
      'Copy overrides from dropdown in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.copy': {
    label: 'Copy button in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.time-multiplier': {
    label: 'Extended time options in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.read-aloud': {
    label: 'Read aloud checkbox in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.language': {
    label: 'Language dropdown in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.tab-warning': {
    label:
      'Tab-warning threshold box in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.tab-warning-off': {
    label: 'Tab-warning off checkbox in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.tab-away': {
    label: 'Time allowed away box in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.tab-away-off': {
    label: 'No auto-submit checkbox in the Assign dialog student modification',
    panel: true,
  },
  'assign-override.window': {
    label: 'Window shift date box in the Assign dialog student modification',
    perField: true,
    panel: true,
  },
  'assign-override.question': {
    label: 'Question checkbox in the Assign dialog student modification',
    perField: true,
    panel: true,
  },
  'assign-override.hide-option': {
    label:
      'Hide answer option checkbox in the Assign dialog student modification',
    perField: true,
    panel: true,
  },
  'assign-override.rubric': {
    label: 'Rubric swap dropdown in the Assign dialog student modification',
    perField: true,
    panel: true,
  },
  'assign-modal.cancel-header': {
    label: 'Cancel button at the top of the Assign window',
    panel: true,
  },
  'assign-modal.cancel': {
    label: 'Cancel button at the bottom of the Assign window',
    panel: true,
  },
  'assign-modal.confirm': {
    label: 'Assign button at the bottom of the Assign window',
    persists: true,
    panel: true,
  },
  'assign-modal.name': {
    label: 'Assignment Name box in the Assign window',
    panel: true,
  },
  'assign-modal.mode': {
    label: 'Session mode card in the Assign window',
    perField: true,
    panel: true,
  },
  'assign-students-legacy.close': {
    label: 'Close button in the Choose students window',
    panel: true,
  },
  'assign-students-legacy.cancel': {
    label: 'Cancel button in the Choose students window',
    panel: true,
  },
  'assign-students-legacy.confirm': {
    label: 'Add students button in the Choose students window',
    panel: true,
  },
  'assign-students-legacy.generate-translation': {
    label: 'Generate translation button in the Choose students window',
    perField: true,
    panel: true,
  },
  'assign-students-legacy.remove-selected': {
    label: 'Remove student button in the Choose students window',
    perField: true,
    panel: true,
  },
  'assign-students-legacy.roster': {
    label: 'Class button in the Choose students window',
    perField: true,
    panel: true,
  },
  'assign-students-legacy.group': {
    label: 'Group button in the Choose students window',
    perField: true,
    panel: true,
  },
  'assign-students-legacy.search': {
    label: 'Search students box in the Choose students window',
    panel: true,
  },
  'assign-students-legacy.select-all': {
    label: 'Select all checkbox in the Choose students window',
    panel: true,
  },
  'assign-students-legacy.student': {
    label: 'Student checkbox in the Choose students window',
    perField: true,
    panel: true,
  },
  'assign-students-legacy.switch-roster': {
    label: 'Choose another class button in the Choose students window',
    panel: true,
  },
  'assign-students-legacy.clear-search': {
    label: 'Clear search button in the Choose students window',
    panel: true,
  },
  'assign-targeting.schedule': {
    label: 'Schedule section header in the Assign window',
    panel: true,
  },
  'assign-targeting.window': {
    label: 'Opens, Closes or Due date box in the Assign window schedule',
    perField: true,
    panel: true,
  },
  'assign-targeting.open': {
    label: 'Edit or add modifications button in the Assign window',
    panel: true,
  },
  'assign-targeting.clear': {
    label: 'Clear all modifications button in the Assign window',
    destructive: true,
    panel: true,
  },
  'assign-targeting.collapse': {
    label: 'Done button in the Assign window modifications',
    panel: true,
  },
  'assign-targeting.revert': {
    label: 'Assign to whole class button in the Assign window',
    panel: true,
  },
  'assign-targeting.choose-students': {
    label: 'Choose students button in the Assign window',
    panel: true,
  },
  'assign-targeting.remove-student': {
    label: 'Remove student button in the Assign window',
    perField: true,
    destructive: true,
    panel: true,
  },
  'assign-availability.date': {
    label: 'Opens or Closes date box in the Assign window availability',
    perField: true,
    panel: true,
  },
  'assign-availability.time': {
    label: 'Opens or Closes time box in the Assign window availability',
    perField: true,
    panel: true,
  },
  'assign-availability.bell': {
    label: 'Start or end of class button in the Assign window availability',
    perField: true,
    panel: true,
  },
  'assign-availability.scope': {
    label:
      'All classes or Each class dropdown in the Assign window availability',
    panel: true,
  },
  'assign-availability.work-kind': {
    label:
      'Submissions Enabled or Study Resource option in the Assign window availability',
    perField: true,
    panel: true,
  },
  'assign-availability.allow-late': {
    label:
      'Allow submissions after close switch in the Assign window availability',
    panel: true,
  },
  'assign-availability.no-end': {
    label: 'No end date switch in the Assign window availability',
    panel: true,
  },
  'assign-periods.tag-roster': {
    label: 'Which period is this class dropdown in the Assign window',
    perField: true,
    panel: true,
  },
  'assign-periods.window': {
    label: 'Window for a class dropdown in the Assign window periods',
    perField: true,
    panel: true,
  },
  'assign-periods.custom-time': {
    label:
      'Custom Opens or Closes box for a class in the Assign window periods',
    perField: true,
    panel: true,
  },
  'assign-periods.customize': {
    label: 'Customize per period button in the Assign window',
    panel: true,
  },
  'assign-periods.selector-close': {
    label: 'Close button in the Class Periods popup',
    panel: true,
  },
  'assign-periods.selector-period': {
    label: 'Class period checkbox in the Class Periods popup',
    perField: true,
    panel: true,
  },
  'assign-periods.selector-cancel': {
    label: 'Cancel button in the Class Periods popup',
    panel: true,
  },
  'assign-periods.selector-save': {
    label: 'Save button in the Class Periods popup',
    panel: true,
  },
  'assign-per-class.mode': {
    label: 'One date or Each class option in the Assign window due date',
    perField: true,
    panel: true,
  },
  'assign-per-class.date': {
    label: 'Due date or time box for a class in the Assign window',
    perField: true,
    panel: true,
  },
  'assign-settings.attempts': {
    label: 'Attempts allowed option in the Assign window',
    perField: true,
    panel: true,
  },
  'assign-settings.section': {
    label:
      'Question Randomization or Answer Feedback section header in the Assign window',
    perField: true,
    panel: true,
  },
  'assign-settings.disclosure': {
    label: 'Edit settings button in the Assign window',
    panel: true,
  },
  'assign-quiz-behavior.mode': {
    label: 'Session mode card in the Quiz assign settings',
    perField: true,
    panel: true,
  },
  'assign-quiz-behavior.gamification': {
    label: 'Gamification section header in the Quiz assign settings',
    panel: true,
  },
  'assign-quiz-time.minutes': {
    label: 'Time limit minutes box in the Quiz assign settings',
    panel: true,
  },
  'assign-tab-warning.threshold-toggle': {
    label:
      'Auto-submit after repeated tab switches switch in the Assign window',
    panel: true,
  },
  'assign-tab-warning.threshold': {
    label: 'Warnings before auto-submit box in the Assign window',
    panel: true,
  },
  'assign-tab-warning.away-toggle': {
    label: 'Auto-submit if away too long switch in the Assign window',
    panel: true,
  },
  'assign-tab-warning.away-preset': {
    label: 'Time allowed away preset button in the Assign window',
    perField: true,
    panel: true,
  },
  'assign-tab-warning.away-less': {
    label: 'Less time button in the Assign window tab-away limit',
    panel: true,
  },
  'assign-tab-warning.away-more': {
    label: 'More time button in the Assign window tab-away limit',
    panel: true,
  },
  'assign-results-protection.watermark': {
    label: 'Watermark checkbox in the Publish scores window',
    panel: true,
  },
  'assign-results-protection.tab-warning': {
    label: 'Tab-switch warning checkbox in the Publish scores window',
    panel: true,
  },
  'assign-results-protection.threshold': {
    label: 'Warnings before lockout box in the Publish scores window',
    panel: true,
  },
  'assign-video-behavior.scoring': {
    label: 'Scoring section header in the Video Activity assign settings',
    panel: true,
  },
  'assign-video-behavior.score-visibility': {
    label: 'Score visibility option in the Video Activity assign settings',
    perField: true,
    panel: true,
  },
  'publish-scores.close': {
    label: 'Close button in the Publish scores window',
    panel: true,
  },
  'publish-scores.level': {
    label: 'Score level option in the Publish scores window',
    perField: true,
    panel: true,
  },
  'publish-scores.written-mode': {
    label: 'Written answers option in the Publish scores window',
    perField: true,
    panel: true,
  },
  'publish-scores.unpublish': {
    label: 'Unpublish button in the Publish scores window',
    persists: true,
    panel: true,
  },
  'publish-scores.cancel': {
    label: 'Cancel button in the Publish scores window',
    panel: true,
  },
  'publish-scores.confirm': {
    label: 'Publish or Update button in the Publish scores window',
    persists: true,
    panel: true,
  },
  'view-only-share.close': {
    label: 'Close button in the Share link window',
    panel: true,
  },
  'view-only-share.confirm': {
    label: 'Create Share Link button in the Share link window',
    persists: true,
    panel: true,
  },
  'view-only-share.copy': {
    label: 'Copy Link button in the Share link window',
    panel: true,
  },
  'view-only-share.open': {
    label: 'Open in New Tab link in the Share link window',
    panel: true,
  },
  'flashcards-assign.collect': {
    label: 'Collect a submission switch in the Flashcards assign window',
    panel: true,
  },
  'flashcards-assign.segmented': {
    label:
      'Mode, Show first or Mastery threshold option in the Flashcards assign window',
    perField: true,
    panel: true,
  },
  'flashcards-assign.strict': {
    label: 'Strict mode switch in the Flashcards assign window',
    panel: true,
  },
  'flashcards-assign.test-type': {
    label: 'Question type checkbox in the Flashcards assign window',
    perField: true,
    panel: true,
  },
  'flashcards-assign.questions': {
    label: 'Questions dropdown in the Flashcards assign window',
    panel: true,
  },
  'flashcards-assign.score-visibility': {
    label: 'Score visibility dropdown in the Flashcards assign window',
    panel: true,
  },
  'plc-video-assign.due-date': {
    label: 'Due Date box in the PLC Video Activity assign window',
    panel: true,
  },
  'plc-video-assign.teacher-name': {
    label: 'Your Name box in the PLC Video Activity assign window',
    panel: true,
  },
  'plc-video-assign.sheet-url': {
    label:
      'Shared Google Sheet URL box in the PLC Video Activity assign window',
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
