// Live-tour conditions the connector accepts; the lists are generated from config/tourConditions.ts.
import { z } from 'zod';
import {
  TOUR_CONDITION_DONE_FACTS,
  TOUR_CONDITION_FACTS,
  TOUR_CONDITION_FEATURES,
} from './tourConditionList';

const FACT_IDS = new Set(TOUR_CONDITION_FACTS.map((f) => f.id));
const FEATURE_IDS = new Set(TOUR_CONDITION_FEATURES);
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
