import { describe, it, expect } from 'vitest';
import type { Rubric, StudentOverride } from '@/types';
import { resolveRubricForResponse } from './rubricOverrideResolution';

const base = { id: 'base-rubric' } as unknown as Rubric;
const alt = { id: 'alt-rubric' } as unknown as Rubric;
const question = { id: 'q1', rubricSnapshot: base };
const uidMap = new Map([['uid-1', 'ref-1']]);
const fallback = { rubric: base, isOverridden: false, overrideMode: null };

const overrides = (byQuestion: Record<string, Rubric | 'points'>) =>
  ({
    'ref-1': { rubricOverrideByQuestion: byQuestion },
  }) as unknown as Record<string, StudentOverride>;

describe('resolveRubricForResponse', () => {
  it.each([
    ['missing overrides', 'uid-1', null, uidMap],
    ['missing uid map', 'uid-1', overrides({ q1: alt }), null],
    ['missing response uid', null, overrides({ q1: alt }), uidMap],
    ['unmapped uid', 'uid-x', overrides({ q1: alt }), uidMap],
    ['no entry for student', 'uid-1', {}, uidMap],
    ['override for another question', 'uid-1', overrides({ q2: alt }), uidMap],
  ])('falls back to base rubric: %s', (_n, uid, ov, map) => {
    expect(resolveRubricForResponse(question, uid, ov, map)).toEqual(fallback);
  });

  it('returns the alternate rubric in rubric mode', () => {
    expect(
      resolveRubricForResponse(
        question,
        'uid-1',
        overrides({ q1: alt }),
        uidMap
      )
    ).toEqual({ rubric: alt, isOverridden: true, overrideMode: 'rubric' });
  });

  it('ignores the base rubric in points mode', () => {
    expect(
      resolveRubricForResponse(
        question,
        'uid-1',
        overrides({ q1: 'points' }),
        uidMap
      )
    ).toEqual({
      rubric: undefined,
      isOverridden: true,
      overrideMode: 'points',
    });
  });

  it('returns no rubric when the question has none and no override applies', () => {
    expect(resolveRubricForResponse({ id: 'q1' }, 'uid-1', {}, uidMap)).toEqual(
      { rubric: undefined, isOverridden: false, overrideMode: null }
    );
  });
});
