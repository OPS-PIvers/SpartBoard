import { describe, expect, it } from 'vitest';
import {
  checkTourCondition,
  isTourConditionRef,
  isTourDoneFact,
  tourConditionsHold,
  TOUR_DONE_FACTS,
  TOUR_FACT_IDS,
  type TourFact,
} from '@/config/tourConditions';

const facts: Record<TourFact, boolean | undefined> = {
  'building-saved': true,
  'drive-connected': false,
  'class-added': undefined,
  'org-has-buildings': true,
  'district-account': true,
  'classlink-on': false,
};

describe('tour conditions', () => {
  it('accepts facts and known features, and nothing else', () => {
    expect(isTourConditionRef('building-saved')).toBe(true);
    expect(isTourConditionRef('feature:sparty')).toBe(true);
    expect(isTourConditionRef('feature:no-such-feature')).toBe(false);
    expect(isTourConditionRef('building')).toBe(false);
    expect(isTourConditionRef(3)).toBe(false);
  });

  it('only lets a step wait on facts the teacher can make true', () => {
    expect(TOUR_DONE_FACTS.every((f) => TOUR_FACT_IDS.includes(f))).toBe(true);
    expect(isTourDoneFact('drive-connected')).toBe(true);
    expect(isTourDoneFact('org-has-buildings')).toBe(false);
  });

  it('answers facts and features', () => {
    const can = (id: string) => id === 'sparty';
    expect(checkTourCondition('building-saved', facts, can)).toBe(true);
    expect(checkTourCondition('classlink-on', facts, can)).toBe(false);
    expect(checkTourCondition('class-added', facts, can)).toBeUndefined();
    expect(checkTourCondition('feature:sparty', facts, can)).toBe(true);
    expect(checkTourCondition('feature:spell-check-setting', facts, can)).toBe(
      false
    );
  });

  it('holds when every condition holds or is still loading', () => {
    const check = (ref: Parameters<typeof checkTourCondition>[0]) =>
      checkTourCondition(ref, facts, () => true);
    expect(tourConditionsHold(undefined, check)).toBe(true);
    expect(tourConditionsHold(['building-saved', 'class-added'], check)).toBe(
      true
    );
    expect(tourConditionsHold(['building-saved', 'classlink-on'], check)).toBe(
      false
    );
  });
});
