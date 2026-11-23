import type { GlobalFeature } from '@/types';
import { ALL_GLOBAL_FEATURES } from '@/config/featureDefaults';

/** Facts a live tour can check about the teacher's account (docs/plans/shipped/GETTING_STARTED.md D10, D12). */
export const TOUR_FACTS = {
  'building-saved': 'The teacher has saved at least one building',
  'drive-connected': 'Drive stays connected, with a stored refresh token',
  'class-added': 'The teacher has at least one class',
  'org-has-buildings': "The teacher's organization has buildings",
  'district-account':
    'Signed in with a district account, not as an external user',
  'classlink-on': "ClassLink import is on for the teacher's first building",
} as const;

export type TourFact = keyof typeof TOUR_FACTS;

export const TOUR_FACT_IDS = Object.keys(TOUR_FACTS) as TourFact[];

/** Facts a step can wait on: ones the teacher can make true during the tour. */
export const TOUR_DONE_FACTS = [
  'building-saved',
  'drive-connected',
  'class-added',
] as const satisfies readonly TourFact[];

export type TourDoneFact = (typeof TOUR_DONE_FACTS)[number];

const FEATURE_PREFIX = 'feature:';

/** Retired flags are on for everyone; saved tours may still name them. Add each id you retire. */
export const RETIRED_TOUR_FEATURES: readonly string[] = [
  'app-pickers',
  'assign-due-date',
  'assignment-class-list',
  'board-context-menu',
  'checklist-small-card',
  'choose-n-pick-counted',
  'claude-connector-apps',
  'district-library-folders',
  'embed-block-new-tabs',
  'flashcard-answer-rows',
  'flashcard-card-images',
  'flashcards-check-sync',
  'flashcards-missed-cards',
  'flashcards-study-settings',
  'flashcards-swap-sides',
  'flashcards-term-only',
  'getting-started',
  'lunch-count-resend',
  'modification-groups',
  'paper-fill-in-blank',
  'project-submit',
  'quiz-dok',
  'quiz-explanations',
  'quiz-import-equations',
  'quiz-import-google-doc-pdf',
  'quiz-import-pdf-answer-marks',
  'quiz-import-versions',
  'quiz-monitor-roster',
  'quiz-ordering-images',
  'quiz-ordering-list',
  'quiz-ordering-results',
  'quiz-prompt-formatting',
  'quiz-recap-all-options',
  'quiz-reopen-submission',
  'quiz-results-tools',
  'quiz-review-step',
  'quiz-stimulus-preview',
  'quiz-stimulus-tabs',
  'quiz-submit-for-student',
  'reopen-selected-students',
  'schoology-push-due-date',
  'share-import-confirm',
  'sparty',
  'spell-check-setting',
  'student-keyboards',
  'tour-pacing',
  'tour-steps-view',
  'va-score-only-verdicts',
  'video-activity-editor-arrows',
  'video-activity-stops',
  'widget-connections',
  'widget-settings-defaults',
  'youtube-paste-picker',
];

/** A fact, or `feature:<id>` for a feature the teacher can use. */
export type TourConditionRef = TourFact | `feature:${GlobalFeature}`;

export const isTourDoneFact = (value: unknown): value is TourDoneFact =>
  (TOUR_DONE_FACTS as readonly unknown[]).includes(value);

export const isTourConditionRef = (
  value: unknown
): value is TourConditionRef => {
  if (typeof value !== 'string') return false;
  if (value in TOUR_FACTS) return true;
  return (
    value.startsWith(FEATURE_PREFIX) &&
    (ALL_GLOBAL_FEATURES as readonly string[]).includes(
      value.slice(FEATURE_PREFIX.length)
    )
  );
};

const isFeatureRef = (
  ref: TourConditionRef
): ref is `feature:${GlobalFeature}` => ref.startsWith(FEATURE_PREFIX);

/** Answers a ref from the teacher's facts and feature access; a retired feature holds and any other unknown id never does. */
export const checkTourCondition = (
  ref: TourConditionRef,
  facts: Record<TourFact, boolean | undefined>,
  canAccessFeature: (feature: GlobalFeature) => boolean
): boolean | undefined => {
  if (!isFeatureRef(ref)) return facts[ref];
  const feature = ALL_GLOBAL_FEATURES.find(
    (id) => id === ref.slice(FEATURE_PREFIX.length)
  );
  if (feature) return canAccessFeature(feature);
  return RETIRED_TOUR_FEATURES.includes(ref.slice(FEATURE_PREFIX.length));
};

/** Answers one fact or feature; undefined while it is still loading. */
export type TourConditionCheck = (ref: TourConditionRef) => boolean | undefined;

/** Whether every condition holds; a condition still loading counts as holding, so nothing hides by accident. */
export const tourConditionsHold = (
  refs: readonly TourConditionRef[] | undefined,
  check: TourConditionCheck
): boolean => !refs || refs.every((ref) => check(ref) !== false);
