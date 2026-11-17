// Mirror of isAdminPreviewFeature in config/featureDefaults.ts; config/featureDefaults.test.ts keeps it in sync.
export const ADMIN_PREVIEW_FEATURES: readonly string[] = [
  'quiz-read-aloud',
  'quiz-translation',
  'question-bank-ai',
  'schoology-quiz-import',
  'quiz-document-ai-reader',
  'quiz-import-versions-plain',
  'paper-answer-sheets',
  'roster-groups',
  'quiz-document-import',
  'tab-away-timer',
  'live-tour-editing-v2',
  'paper-handwritten-responses',
  'paper-written-hybrid',
  'paper-reword-sync',
  'paper-kept-pages',
  'paper-pages-student-view',
  'paper-image-markup',
  'claude-connector',
  'web-tours',
  'claude-connector-guided-learning',
  'video-activity-live',
  'quiz-student-view',
  'class-student-page',
  'quiz-live-view',
  'quiz-live-view-nudge',
  'quiz-live-view-nudge-note',
  'quiz-live-view-screenshot',
  'quiz-monitor-roster',
  'drive-only-uploads',
  'quiz-score-on-submit',
  'modification-groups',
  'rubric-grading-v2',
  'paper-printed-versions',
  'project-submit',
  'gradebook',
  'student-gradebook',
  'quiz-time-limit',
  'group-reminders',
  'share-content-safeguards',
  'guided-learning-ai',
  'routine-guide',
  'blooms-ai',
  'flashcards-ai',
  'plc-meeting-ai-notes',
  'google-tasks-sync',
  'plc-goal-coach',
  'embed-reload',
  'mini-app-results',
  'quiz-stimulus-quotes',
  'quiz-cross-out',
  'quiz-blank-types',
  'quiz-calculator-stimulus',
  'quiz-stimulus-preview',
  'question-editor-fields',
  'flashcard-answer-rows',
  'flashcard-card-images',
  'lunch-count-redesign',
  'weather-details',
  'checklist-small-card',
  'seating-chart-plans',
  'noise-meter-pro',
  'document-camera-pro',
  'whiteboard-pro',
  'music-my-songs',
  'embed-block-new-tabs',
  'focus-sessions',
  'input-signals',
  'managed-profile-check',
  'staff-audience',
  'universal-import',
  'import-extension-send',
  'import-board-drop',
  'import-flashcards',
  'import-google-forms',
  'import-activity-wall',
  'import-new-board',
  'import-guided-learning',
  'import-notebook',
  'import-video-activity',
  'import-mini-app',
  'import-pdf',
  'import-sticker',
  'import-embed',
  'import-link',
  'import-schoology-course',
  'import-straight-to-board',
  'video-import-ai',
  'embed-mini-app',
  'board-context-menu',
  'assign-due-date',
  'reopen-selected-students',
  'course-agenda',
  'va-score-only-verdicts',
];

// Mirror of `missingDocPublic: true` flags and their `defaultMinTier` (null = none); config/featureDefaults.test.ts keeps it in sync.
export const PUBLIC_MISSING_DOC_FEATURES: Readonly<
  Record<string, string | null>
> = {
  'live-session': null,
  'gemini-functions': null,
  'dashboard-sharing': null,
  'dashboard-import': null,
  'district-library': null,
  'magic-layout': null,
  'smart-paste': null,
  'smart-poll': null,
  'screen-recording': null,
  'remote-control': null,
  'ai-file-context': 'org',
  'org-admin-writes': null,
  'assignment-modes': null,
  'share-link-tracking': null,
  'google-classroom': 'org',
  'anonymous-join': null,
  'video-activity-ai': null,
  'mini-app-ai': null,
  ocr: null,
  quiz: null,
  'drawing-ai': null,
  'webcam-ai': null,
  'dashboard-layout': null,
  'instructional-routine': null,
};

/** Who a missing `global_permissions` doc lets in, as the client's `canAccessFeature` decides it. */
export type MissingDocAccess =
  | { audience: 'everyone'; minTier: string | null }
  | { audience: 'admins' }
  | { audience: 'nobody' };

export function missingDocAccess(featureId: string): MissingDocAccess {
  if (Object.hasOwn(PUBLIC_MISSING_DOC_FEATURES, featureId)) {
    return {
      audience: 'everyone',
      minTier: PUBLIC_MISSING_DOC_FEATURES[featureId],
    };
  }
  return adminPassesMissingDoc(featureId)
    ? { audience: 'admins' }
    : { audience: 'nobody' };
}

/** Plan D7: admins pass a default-off flag (preview, or admin-default like `guided-learning-ai`) that has no saved doc yet. */
export const adminPassesMissingDoc = (featureId: string): boolean =>
  ADMIN_PREVIEW_FEATURES.includes(featureId);
