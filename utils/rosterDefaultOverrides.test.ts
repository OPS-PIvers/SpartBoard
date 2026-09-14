import { describe, it, expect } from 'vitest';
import {
  isEmptyStudentOverride,
  setRosterDefaultOverride,
} from './rosterDefaultOverrides';

describe('isEmptyStudentOverride', () => {
  it('treats absent, empty, and fully cleared overrides as empty', () => {
    expect(isEmptyStudentOverride(undefined)).toBe(true);
    expect(isEmptyStudentOverride({})).toBe(true);
    expect(
      isEmptyStudentOverride({
        timeMultiplier: undefined,
        readAloud: false,
        hiddenOptionIdsByQuestion: {},
        questionIds: [],
      })
    ).toBe(true);
  });

  it('treats any active accommodation as non-empty', () => {
    expect(isEmptyStudentOverride({ timeMultiplier: 2 })).toBe(false);
    expect(isEmptyStudentOverride({ readAloud: true })).toBe(false);
    expect(isEmptyStudentOverride({ tabWarningThreshold: 'off' })).toBe(false);
    expect(isEmptyStudentOverride({ openAt: 1 })).toBe(false);
  });
});

describe('setRosterDefaultOverride', () => {
  it('stores a compacted override without cleared keys', () => {
    const next = setRosterDefaultOverride({}, 's1', {
      timeMultiplier: 1.5,
      readAloud: undefined,
      hiddenOptionIdsByQuestion: {},
    });
    expect(next).toEqual({ s1: { timeMultiplier: 1.5 } });
  });

  it('drops the student entry when every field is cleared', () => {
    const next = setRosterDefaultOverride(
      { s1: { timeMultiplier: 2 }, s2: { readAloud: true } },
      's1',
      { timeMultiplier: undefined }
    );
    expect(next).toEqual({ s2: { readAloud: true } });
  });

  it('does not mutate the input map', () => {
    const before = { s1: { timeMultiplier: 2 as const } };
    setRosterDefaultOverride(before, 's2', { readAloud: true });
    expect(before).toEqual({ s1: { timeMultiplier: 2 } });
  });
});
