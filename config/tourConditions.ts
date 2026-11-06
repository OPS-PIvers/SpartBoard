import type { GlobalFeature } from '@/types';
import { ALL_GLOBAL_FEATURES } from '@/config/featureDefaults';

/** Facts a live tour can check about the teacher's account (docs/plans/GETTING_STARTED.md D10, D12). */
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

/** Answers a ref from the teacher's facts and feature access; a feature removed since the save never holds. */
export const checkTourCondition = (
  ref: TourConditionRef,
  facts: Record<TourFact, boolean | undefined>,
  canAccessFeature: (feature: GlobalFeature) => boolean
): boolean | undefined => {
  if (!isFeatureRef(ref)) return facts[ref];
  const feature = ALL_GLOBAL_FEATURES.find(
    (id) => id === ref.slice(FEATURE_PREFIX.length)
  );
  return feature ? canAccessFeature(feature) : false;
};

/** Answers one fact or feature; undefined while it is still loading. */
export type TourConditionCheck = (ref: TourConditionRef) => boolean | undefined;

/** Whether every condition holds; a condition still loading counts as holding, so nothing hides by accident. */
export const tourConditionsHold = (
  refs: readonly TourConditionRef[] | undefined,
  check: TourConditionCheck
): boolean => !refs || refs.every((ref) => check(ref) !== false);
