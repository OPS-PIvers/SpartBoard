// Mirror of isAdminPreviewFeature in config/featureDefaults.ts; config/featureDefaults.test.ts keeps it in sync.
export const ADMIN_PREVIEW_FEATURES: readonly string[] = [
  'quiz-read-aloud',
  'quiz-translation',
  'question-bank-ai',
  'schoology-quiz-import',
  'quiz-document-ai-reader',
  'quiz-import-versions',
  'quiz-import-versions-plain',
  'quiz-import-google-doc-pdf',
  'quiz-import-pdf-answer-marks',
  'paper-answer-sheets',
  'roster-groups',
  'quiz-document-import',
  'tab-away-timer',
  'live-tour-editing-v2',
  'quiz-results-tools',
  'paper-handwritten-responses',
  'paper-written-hybrid',
  'paper-reword-sync',
  'paper-kept-pages',
  'paper-image-markup',
  'claude-connector',
  'web-tours',
  'tour-pacing',
  'claude-connector-guided-learning',
  'video-activity-live',
  'quiz-student-view',
  'quiz-score-on-submit',
  'gradebook',
  'student-gradebook',
  'student-overview-resources',
  'quiz-time-limit',
  'group-reminders',
  'guided-learning-ai',
  'routine-guide',
  'blooms-ai',
  'flashcards-ai',
  'plc-meeting-ai-notes',
  'sparty',
  'getting-started',
  'google-tasks-sync',
  'plc-goal-coach',
  'embed-reload',
  'mini-app-results',
  'quiz-stimulus-quotes',
  'quiz-cross-out',
  'quiz-submit-for-student',
  'quiz-ordering-images',
  'quiz-ordering-list',
  'quiz-ordering-results',
  'quiz-calculator-stimulus',
  'student-keyboards',
  'lunch-count-redesign',
  'lunch-count-resend',
  'weather-details',
  'checklist-small-card',
  'seating-chart-plans',
  'noise-meter-pro',
  'document-camera-pro',
  'whiteboard-pro',
  'spell-check-setting',
  'music-my-songs',
  'widget-connections',
  'focus-sessions',
  'staff-audience',
  'universal-import',
  'import-extension-send',
  'import-board-drop',
  'import-flashcards',
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
  'video-activity-stops',
  'video-import-ai',
  'embed-mini-app',
];

// Mirror of `missingDocPublic: true` flags and their `defaultMinTier` (null = none); config/featureDefaults.test.ts keeps it in sync.
export const PUBLIC_MISSING_DOC_FEATURES: Readonly<
  Record<string, string | null>
> = {
  'live-session': null,
  'gemini-functions': null,
  'dashboard-sharing': null,
  'dashboard-import': null,
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
