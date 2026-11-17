import { describe, it, expect } from 'vitest';
import type { Rubric, StudentOverride } from '@/types';
import {
  resolveRubricForResponse,
  withOwnCriterionIds,
} from './rubricOverrideResolution';

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

  describe('modified-questions group', () => {
    const mod = { id: 'mod-rubric' } as unknown as Rubric;
    const withMod = { ...question, modifiedRubricSnapshot: mod };
    const group = (extra: Partial<StudentOverride> = {}) =>
      ({ 'ref-1': { modifiedQuestions: true, ...extra } }) as Record<
        string,
        StudentOverride
      >;

    it('grades the group on the modified rubric', () => {
      expect(
        resolveRubricForResponse(withMod, 'uid-1', group(), uidMap)
      ).toEqual({ rubric: mod, isOverridden: true, overrideMode: 'rubric' });
    });

    it('lets a student-specific rubric win', () => {
      expect(
        resolveRubricForResponse(
          withMod,
          'uid-1',
          group({ rubricOverrideByQuestion: { q1: alt } }),
          uidMap
        ).rubric
      ).toBe(alt);
    });

    it('keeps the main rubric for students outside the group', () => {
      expect(resolveRubricForResponse(withMod, 'uid-1', {}, uidMap)).toEqual({
        ...fallback,
      });
    });
  });
});

describe('withOwnCriterionIds', () => {
  const rubric = (ids: string[]) =>
    ({
      id: 'r',
      criteria: ids.map((id) => ({ id, name: id, levels: [] })),
    }) as unknown as Rubric;
  it('renames criteria shared with the main rubric', () => {
    const out = withOwnCriterionIds(rubric(['a', 'z']), rubric(['a', 'b']));
    expect(out.criteria[0].id).not.toBe('a');
    expect(out.criteria[1].id).toBe('z');
  });
  it('leaves a rubric with its own ids alone', () => {
    const mod = rubric(['x']);
    expect(withOwnCriterionIds(mod, rubric(['a']))).toBe(mod);
  });
});
