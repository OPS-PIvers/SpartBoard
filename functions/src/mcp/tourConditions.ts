// Live-tour conditions the connector accepts; the lists are generated from config/tourConditions.ts.
import { z } from 'zod';
import {
  TOUR_CONDITION_DONE_FACTS,
  TOUR_CONDITION_FACTS,
  TOUR_CONDITION_FEATURES,
} from './tourConditionList';

const FACT_IDS = new Set(TOUR_CONDITION_FACTS.map((f) => f.id));
// Retired flags are on for everyone; saved tours may still name them, and the app treats them as holding.
const RETIRED_FEATURE_IDS = [
  'lunch-count-redesign',
  'lunch-count-resend',
  'quiz-import-versions',
  'quiz-ordering-images',
  'quiz-ordering-list',
  'quiz-ordering-results',
  'quiz-prompt-formatting',
  'quiz-reopen-submission',
  'quiz-results-tools',
  'quiz-review-step',
  'quiz-submit-for-student',
  'spell-check-setting',
  'tour-pacing',
  'tour-steps-view',
  'video-activity-editor-arrows',
  'video-activity-stops',
];
const FEATURE_IDS = new Set([
  ...TOUR_CONDITION_FEATURES,
  ...RETIRED_FEATURE_IDS,
]);
const DONE_IDS = new Set(TOUR_CONDITION_DONE_FACTS);

export const isTourConditionRef = (ref: string): boolean =>
  FACT_IDS.has(ref) ||
  (ref.startsWith('feature:') && FEATURE_IDS.has(ref.slice('feature:'.length)));

const factList = TOUR_CONDITION_FACTS.map((f) => `"${f.id}" (${f.label})`).join(
  '; '
);

export const tourConditionRef = z
  .string()
  .max(80)
  .refine(isTourConditionRef, {
    message: `Not a tour condition. Use a fact (${TOUR_CONDITION_FACTS.map((f) => f.id).join(', ')}) or "feature:<id>" for a SpartBoard feature.`,
  });

export const tourDoneFact = z
  .string()
  .max(40)
  .refine((v) => DONE_IDS.has(v), {
    message: `A step can wait only on ${TOUR_CONDITION_DONE_FACTS.join(', ')}.`,
  });

export const TOUR_CONDITION_HELP = `Facts: ${factList}. Or "feature:<id>" for a SpartBoard feature the teacher can use, e.g. "feature:sparty".`;
