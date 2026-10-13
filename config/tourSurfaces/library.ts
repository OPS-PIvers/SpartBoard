import type { TourSurfaceMap } from './types';

export const SURFACES: TourSurfaceMap = {
  'library.shell': {
    label: 'Library (tabs, toolbar, folders and item cards)',
    kind: 'shared',
    files: [
      'components/common/library/',
      'components/common/library/LibraryItemCard.tsx',
    ],
    inner: {
      'library-shell.new-menu-item': 'library-shell.new',
      'library-shell.sort-option': 'library-shell.sort',
      'library-shell.card-menu-item': 'library-shell.card-menu',
      'library-shell.folder-menu-rename': 'library-shell.folder-menu',
      'library-shell.folder-menu-new-subfolder': 'library-shell.folder-menu',
      'library-shell.folder-menu-move-to-root': 'library-shell.folder-menu',
      'library-shell.folder-menu-delete': 'library-shell.folder-menu',
      'library-shell.folder-rename-input': 'library-shell.folder-menu-rename',
      'library-shell.new-folder-input': 'library-shell.new-folder',
      'library-shell.folder-dialog-close': 'library-shell.folder-menu-delete',
      'library-shell.folder-dialog-move-contents':
        'library-shell.folder-menu-delete',
      'library-shell.folder-dialog-delete-all':
        'library-shell.folder-menu-delete',
      'library-shell.folder-dialog-cancel': 'library-shell.folder-menu-delete',
    },
  },
  // Owns no anchors (library.shell lists the card first): a hop for openers inside a card's kebab menu.
  'library.card-menu': {
    label: 'Library item card menu',
    kind: 'menu',
    files: ['components/common/library/LibraryItemCard.tsx'],
    opensWith: 'library-shell.card-menu#row-1',
    needs: ['library-item'],
  },
  'library.assignments': {
    label: 'Library Active tab (assignment cards)',
    kind: 'panel',
    files: ['components/common/library/AssignmentArchiveCard.tsx'],
    opensWith: 'library-shell.tab#active',
    inner: {
      'library-shell.archive-menu-item': 'library-shell.archive-menu',
      'quiz-library.archive-settings': 'library-shell.archive-menu',
      'quiz-library.archive-plc-results': 'library-shell.archive-menu',
    },
  },
  // Owns no anchors (library.assignments lists the card first): the Archive tab, where Results is the primary action.
  'library.assignments-archive': {
    label: 'Library Archive tab (ended assignment cards)',
    kind: 'panel',
    files: ['components/common/library/AssignmentArchiveCard.tsx'],
    opensWith: 'library-shell.tab#archive',
  },
  // Shared by every library's Import wizard, so it has no single opener.
  'library.import-wizard': {
    label: 'Import wizard (file, Google Sheet, JSON, AI draft)',
    kind: 'shared',
    files: ['components/common/library/importer/'],
  },
  'library.assign-modal': {
    label: 'Assign dialog (classes, targeting, availability)',
    kind: 'shared',
    files: [
      'components/common/library/AssignModal.tsx',
      'components/common/library/AssignTargetingSection.tsx',
      'components/common/library/AssignAvailabilitySection.tsx',
      'components/common/library/AssignPeriodAccessSection.tsx',
      'components/common/library/PeriodSelector.tsx',
    ],
    inner: {
      'assign-targeting.clear': 'assign-targeting.open',
      'assign-targeting.collapse': 'assign-targeting.open',
    },
  },
  'library.assign-student-picker': {
    label: 'Choose students dialog (legacy targeting)',
    kind: 'modal',
    files: ['components/common/library/AssignStudentPicker.tsx'],
    opensWith: 'assign-targeting.choose-students',
    needs: ['class'],
  },
  'library.assign-behavior': {
    label: 'Quiz and video assignment behavior settings',
    kind: 'shared',
    files: [
      'components/common/library/QuizBehaviorSettingsPanel.tsx',
      'components/common/library/QuizTimeLimitRow.tsx',
      'components/common/library/TabWarningRows.tsx',
      'components/common/library/AssignmentSettingsToggleGroup.tsx',
      'components/common/library/QuizAssignSettingsInline.tsx',
    ],
  },
  'library.override-row': {
    label: 'Per-student modification row',
    kind: 'shared',
    files: ['components/common/library/OverrideEditorRow.tsx'],
  },
  'library.publish-scores': {
    label: 'Publish scores dialog',
    kind: 'shared',
    files: [
      'components/common/library/PublishScoresModal.tsx',
      'components/common/library/ResultsProtectionFieldset.tsx',
    ],
  },
  'library.view-only-share': {
    label: 'View-only share dialog',
    kind: 'shared',
    files: ['components/common/library/ViewOnlyShareModal.tsx'],
  },
  'library.assign-stepper': {
    label: 'Assign stepper (classes, when, rules, sharing steps)',
    kind: 'shared',
    files: ['components/common/library/assignStepper/'],
    inner: {
      'assign-when.mode': 'assign-step.when',
      'assign-when.mode-option': 'assign-step.when',
      'assign-when.scope': 'assign-step.when',
      'assign-when.allow-late': 'assign-step.when',
      'sharing.plc-toggle': 'assign-step.sharing',
      'sharing.plc-select': 'assign-step.sharing',
      'assign-classes.option': 'assign-classes.trigger',
      'assign-classes.select-all': 'assign-classes.trigger',
      'assign-classes.clear': 'assign-classes.trigger',
      'assign-students.search': 'assign-students.trigger',
      'assign-students.group': 'assign-students.trigger',
      'assign-students.option': 'assign-students.trigger',
      'assign-students.all': 'assign-students.trigger',
      'assign-students.clear': 'assign-students.trigger',
      'assign-mods.skip-student': 'assign-mods.open',
      'assign-mods.generate-translation': 'assign-mods.open',
      'assign-mods.remove': 'assign-mods.open',
      'assign-mods.add-student': 'assign-mods.open',
      'assign-mods.show-all': 'assign-mods.open',
      'assign-mods.back': 'assign-mods.open',
      'assign-mods.clear': 'assign-mods.open',
      'assign-mods.done': 'assign-mods.open',
    },
  },
  'library.inline-assign': {
    label: 'Inline assign step bodies (Classroom add-on, LTI)',
    kind: 'shared',
    files: [
      'components/common/library/assignStepper/InlineAssignStepBodies.tsx',
    ],
  },

  'library.video-activity': {
    label: 'Video Activity library',
    kind: 'widget',
    widgetType: 'video-activity',
    needs: ['widget-on-stage'],
    files: ['components/widgets/VideoActivityWidget/'],
    inner: {
      'video-activity.preview-close':
        'library-shell.card-open:video-activity#row-1',
      'video-activity.preview-open-editor':
        'library-shell.card-open:video-activity#row-1',
      'video-activity.assign-pacing':
        'library-shell.card-primary-action:video-activity#row-1',
      'video-activity.behavior-open-editor':
        'library-shell.card-primary-action:video-activity#row-1',
    },
  },
  'library.video-activity.creator': {
    label: 'Video Activity import / create view',
    kind: 'editor',
    files: ['components/widgets/VideoActivityWidget/components/Creator.tsx'],
    opensWith: 'library-shell.secondary-action:video-activity#row-1',
    parent: 'library.video-activity',
  },
  'library.video-activity.editor': {
    label: 'Video Activity editor',
    kind: 'editor',
    files: [
      'components/widgets/VideoActivityWidget/components/VideoActivityEditorModal.tsx',
      'components/widgets/VideoActivityWidget/components/VideoActivityEditor.tsx',
      'components/widgets/VideoActivityWidget/components/Timeline.tsx',
      'components/common/library/VideoActivityBehaviorSettingsPanel.tsx',
    ],
    opensWith: 'library-shell.new:video-activity',
    parent: 'library.video-activity',
    inner: {
      'assign-video-behavior.scoring':
        'video-activity.editor-tab:video-activity#settings',
      'assign-video-behavior.score-visibility':
        'video-activity.editor-tab:video-activity#settings',
      'video-activity.settings-score-visibility':
        'video-activity.editor-tab:video-activity#settings',
      'video-activity.editor-ai-close': 'video-activity.editor-draft-ai',
      'video-activity.editor-ai-generate': 'video-activity.editor-draft-ai',
      'video-activity.ai-count-decrement': 'video-activity.editor-draft-ai',
      'video-activity.ai-count-increment': 'video-activity.editor-draft-ai',
    },
  },
  'library.video-activity.assign': {
    label: 'Video Activity assign stepper',
    kind: 'modal',
    files: ['components/common/library/assignStepper/VideoAssignStepper.tsx'],
    opensWith: 'library-shell.card-primary-action:video-activity#row-1',
    parent: 'library.video-activity',
    needs: ['library-item', 'class'],
  },
  'library.video-activity.results': {
    label: 'Video Activity results',
    kind: 'panel',
    files: ['components/widgets/VideoActivityWidget/components/Results.tsx'],
    opensWith: 'library-shell.archive-primary-action:video-activity#row-1',
    parent: 'library.assignments-archive',
    needs: ['student-data'],
  },
  'library.video-activity.live': {
    label: 'Video Activity live monitor / teacher-paced player',
    kind: 'panel',
    files: [
      'components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor.tsx',
      'components/widgets/VideoActivityWidget/components/VideoActivityLivePlayer.tsx',
    ],
    opensWith: 'library-shell.archive-primary-action:video-activity#row-1',
    parent: 'library.assignments',
    needs: ['live-session'],
  },

  'library.flashcards': {
    label: 'Flashcards library',
    kind: 'widget',
    widgetType: 'flashcards',
    needs: ['widget-on-stage'],
    files: ['components/widgets/Flashcards/'],
  },
  'library.flashcards.editor': {
    label: 'Flashcard set editor',
    kind: 'editor',
    files: [
      'components/widgets/Flashcards/FlashcardEditor.tsx',
      'components/widgets/Flashcards/FlashcardLanguageField.tsx',
    ],
    opensWith: 'library-shell.new:flashcards',
    parent: 'library.flashcards',
  },
  'library.flashcards.paste': {
    label: 'Flashcards paste import drawer',
    kind: 'panel',
    files: ['components/widgets/Flashcards/PasteImportDrawer.tsx'],
    opensWith: 'flashcards.editor-paste:flashcards',
  },
  'library.flashcards.assign': {
    label: 'Flashcards assign dialog / stepper',
    kind: 'modal',
    files: [
      'components/widgets/Flashcards/FlashcardAssignModal.tsx',
      'components/widgets/Flashcards/FlashcardAssignStepper.tsx',
      'components/common/library/assignStepper/FlashcardsCheckStep.tsx',
    ],
    opensWith: 'library-shell.card-primary-action:flashcards#row-1',
    parent: 'library.flashcards',
    needs: ['library-item', 'class'],
    inner: {
      'flashcards-check.mode': 'assign-step.check',
      'flashcards-check.show-first': 'assign-step.check',
      'flashcards-check.strict': 'assign-step.check',
      'flashcards-check.test-type': 'assign-step.check',
      'flashcards-check.questions': 'assign-step.check',
      'flashcards-check.mastery': 'assign-step.check',
      'flashcards-check.score-visibility': 'assign-step.check',
    },
  },
  'library.flashcards.results': {
    label: 'Flashcards assignment results',
    kind: 'panel',
    files: ['components/widgets/Flashcards/results/'],
    opensWith: 'library-shell.archive-primary-action:flashcards#row-1',
    parent: 'library.assignments',
    needs: ['student-data'],
  },
  'library.flashcards.publish-scores': {
    label: 'Flashcards publish scores dialog',
    kind: 'modal',
    files: [
      'components/widgets/Flashcards/results/FlashcardPublishScoresModal.tsx',
    ],
    opensWith: 'flashcards.publish-scores:flashcards',
  },

  'library.activity-wall': {
    label: 'Activity Wall',
    kind: 'widget',
    widgetType: 'activity-wall',
    needs: ['widget-on-stage'],
    files: ['components/widgets/ActivityWall/'],
  },
  'library.activity-wall.library': {
    label: 'Activity Wall library',
    kind: 'modal',
    files: ['components/widgets/ActivityWall/WallLibraryModal.tsx'],
    opensWith: 'activity-wall.empty-open-library',
  },
  'library.activity-wall.editor': {
    label: 'Activity Wall editor',
    kind: 'modal',
    files: ['components/widgets/ActivityWall/editor/'],
    opensWith: 'library-shell.new:activity-wall',
    parent: 'library.activity-wall.library',
    inner: {
      'activity-wall-editor.appearance':
        'activity-wall-editor.section:activity-wall#appearance',
      'activity-wall-editor.moderation':
        'activity-wall-editor.section:activity-wall#moderation',
      'activity-wall-editor.guests':
        'activity-wall-editor.section:activity-wall#moderation',
      'activity-wall-editor.show-names':
        'activity-wall-editor.section:activity-wall#moderation',
      'activity-wall-editor.student-view':
        'activity-wall-editor.section:activity-wall#moderation',
      'activity-wall-editor.target-classes':
        'activity-wall-editor.section:activity-wall#moderation',
      'activity-wall-editor.likes':
        'activity-wall-editor.section:activity-wall#engagement',
      'activity-wall-editor.comments':
        'activity-wall-editor.section:activity-wall#engagement',
      'activity-wall-editor.replies':
        'activity-wall-editor.section:activity-wall#engagement',
      'activity-wall-editor.max-posts':
        'activity-wall-editor.section:activity-wall#limits',
      'activity-wall-editor.max-posts-custom':
        'activity-wall-editor.section:activity-wall#limits',
      'activity-wall-editor.max-posts-custom-input':
        'activity-wall-editor.section:activity-wall#limits',
      'activity-wall-editor.allow-edit':
        'activity-wall-editor.section:activity-wall#limits',
      'activity-wall-editor.allow-delete':
        'activity-wall-editor.section:activity-wall#limits',
    },
  },
  'library.activity-wall.moderation': {
    label: 'Activity Wall moderation drawer',
    kind: 'panel',
    files: ['components/widgets/ActivityWall/ModerationDrawer.tsx'],
    opensWith: 'activity-wall.moderate',
    needs: ['library-item'],
    inner: {
      'activity-wall-moderation.edit-title':
        'activity-wall-moderation.edit-start',
      'activity-wall-moderation.edit-text':
        'activity-wall-moderation.edit-start',
      'activity-wall-moderation.edit-save':
        'activity-wall-moderation.edit-start',
    },
  },
  'library.activity-wall.share': {
    label: 'Activity Wall share dialog',
    kind: 'modal',
    files: ['components/widgets/ActivityWall/ShareModal.tsx'],
    opensWith: 'activity-wall.share',
    needs: ['library-item'],
    inner: {
      'activity-wall-link.expiration-toggle':
        'activity-wall-link.tab:activity-wall#gallery',
      'activity-wall-link.expiration-date':
        'activity-wall-link.tab:activity-wall#gallery',
      'activity-wall-link.create-gallery':
        'activity-wall-link.tab:activity-wall#gallery',
    },
  },

  'library.mini-app': {
    label: 'Mini App library',
    kind: 'widget',
    widgetType: 'miniApp',
    needs: ['widget-on-stage'],
    files: ['components/widgets/MiniApp/'],
    inner: {
      'mini-app.preview-close': 'library-shell.card-open:miniApp#row-1',
      'mini-app.preview-open-editor': 'library-shell.card-open:miniApp#row-1',
    },
  },
  'library.mini-app.running': {
    label: 'Running mini app and its toolbar',
    kind: 'panel',
    files: ['components/widgets/MiniApp/Widget.tsx'],
    opensWith: 'library-shell.card-menu-item:miniApp#row-1-item-1',
    parent: 'library.card-menu',
    needs: ['library-item'],
    inner: {
      'mini-app.save-cancel': 'mini-app.toolbar-save:miniApp',
      'mini-app.save-title': 'mini-app.toolbar-save:miniApp',
      'mini-app.save-app': 'mini-app.toolbar-save:miniApp',
      'mini-app.dialog-close': 'mini-app.toolbar-student-link:miniApp',
      'mini-app.copy-link': 'mini-app.toolbar-student-link:miniApp',
      'mini-app.session-name': 'mini-app.toolbar-student-link:miniApp',
      'mini-app.assign-confirm': 'mini-app.toolbar-student-link:miniApp',
    },
  },
  'library.mini-app.editor': {
    label: 'Mini App editor',
    kind: 'modal',
    files: ['components/widgets/MiniApp/components/MiniAppEditorModal.tsx'],
    opensWith: 'library-shell.new:miniApp',
    parent: 'library.mini-app',
    inner: {
      'mini-app.ai-close': 'mini-app.draft-with-ai:miniApp',
      'mini-app.ai-generate': 'mini-app.draft-with-ai:miniApp',
      'mini-app.ai-mode': 'mini-app.draft-with-ai:miniApp',
      'mini-app.ai-prompt': 'mini-app.draft-with-ai:miniApp',
      'mini-app.ai-attach-drive': 'mini-app.draft-with-ai:miniApp',
    },
  },
  'library.mini-app.assign': {
    label: 'Mini App assign stepper',
    kind: 'modal',
    files: [
      'components/widgets/MiniApp/components/MiniAppAssignStepper.tsx',
      'components/widgets/MiniApp/components/MiniAppResultsStep.tsx',
    ],
    opensWith: 'library-shell.card-primary-action:miniApp#row-1',
    parent: 'library.mini-app',
    needs: ['library-item', 'class'],
  },
  'library.mini-app.assignments': {
    label: 'Mini App assignments (sessions) dialog',
    kind: 'modal',
    files: ['components/widgets/MiniApp/components/AssignmentsModal.tsx'],
    opensWith: 'mini-app.toolbar-sessions:miniApp',
    inner: {
      'mini-app.session-rename-input': 'mini-app.session-rename',
      'mini-app.session-rename-save': 'mini-app.session-rename',
      'mini-app.session-end-confirm': 'mini-app.session-end',
    },
  },
  'library.mini-app.submissions': {
    label: 'Mini App submissions dialog',
    kind: 'modal',
    files: ['components/widgets/MiniApp/components/SubmissionsModal.tsx'],
    opensWith: 'mini-app.session-submissions',
    needs: ['student-data'],
  },
  'library.mini-app.save-as-widget': {
    label: 'Save mini app as widget dialog',
    kind: 'modal',
    files: ['components/widgets/MiniApp/components/SaveAsWidgetModal.tsx'],
    opensWith: 'mini-app.toolbar-save-as-widget:miniApp',
  },
};
