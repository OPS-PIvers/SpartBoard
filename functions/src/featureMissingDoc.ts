// Mirror of isAdminPreviewFeature in config/featureDefaults.ts; config/featureDefaults.test.ts keeps it in sync.
export const ADMIN_PREVIEW_FEATURES: readonly string[] = [
  'settings-drawer',
  'quiz-read-aloud',
  'quiz-translation',
  'question-bank-ai',
  'quiz-document-ai-reader',
  'quiz-import-suggested-targets',
  'paper-answer-sheets',
  'roster-groups',
  'quiz-document-import',
  'sub-share-collections',
  'gl-player-v2',
  'tab-away-timer',
  'gl-live-tours',
  'gl-studio',
  'per-period-access',
  'quiz-results-print',
  'plc-home-v2',
  'plc-norming-flags',
  'quiz-choose-all',
  'quiz-choice-editor',
  'quiz-fib-alternates',
  'modal-fullscreen',
  'quiz-results-tools',
  'quiz-grader-v2',
  'gl-callout-editing',
  'plc-notes-rich-editor',
];

/** Plan D7: admins pass a preview flag that has no saved doc yet. */
export const adminPassesMissingDoc = (featureId: string): boolean =>
  ADMIN_PREVIEW_FEATURES.includes(featureId);
