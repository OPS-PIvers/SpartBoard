import { describe, it, expect } from 'vitest';
import {
  applyGroupOverride,
  isEmptyStudentOverride,
  setRosterDefaultOverride,
  sharedStudentOverride,
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
    expect(isEmptyStudentOverride({ blockCopyPaste: false })).toBe(false);
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

  it('keeps copy, paste and print set to Allow', () => {
    expect(
      setRosterDefaultOverride({}, 's1', { blockCopyPaste: false })
    ).toEqual({ s1: { blockCopyPaste: false } });
    expect(
      setRosterDefaultOverride({ s1: { blockCopyPaste: false } }, 's1', {
        blockCopyPaste: undefined,
      })
    ).toEqual({});
  });

  it('does not mutate the input map', () => {
    const before = { s1: { timeMultiplier: 2 as const } };
    setRosterDefaultOverride(before, 's2', { readAloud: true });
    expect(before).toEqual({ s1: { timeMultiplier: 2 } });
  });
});

describe('group accommodations', () => {
  const overrides = {
    a: { timeMultiplier: 2 as const, readAloud: true },
    b: { timeMultiplier: 2 as const, language: 'es' },
    c: { readAloud: true },
  };

  it('shows only the settings every member shares', () => {
    expect(sharedStudentOverride(overrides, ['a', 'b'])).toEqual({
      timeMultiplier: 2,
    });
    expect(sharedStudentOverride(overrides, ['a', 'c'])).toEqual({
      readAloud: true,
    });
    expect(sharedStudentOverride(overrides, ['a', 'z'])).toEqual({});
  });

  it('sets a changed setting on every member and keeps their own', () => {
    const next = applyGroupOverride(overrides, ['a', 'b'], {
      timeMultiplier: 2,
      readAloud: true,
    });
    expect(next.a).toEqual({ timeMultiplier: 2, readAloud: true });
    expect(next.b).toEqual({
      timeMultiplier: 2,
      language: 'es',
      readAloud: true,
    });
    expect(next.c).toBe(overrides.c);
  });

  it('clears a shared setting from every member and drops emptied entries', () => {
    const next = applyGroupOverride(overrides, ['a', 'c'], {
      readAloud: undefined,
    });
    expect(next.a).toEqual({ timeMultiplier: 2 });
    expect(next.c).toBeUndefined();
  });

  it('adds a student with no accommodations to the group setting', () => {
    const next = applyGroupOverride(overrides, ['a', 'z'], {
      timeMultiplier: 1.5,
    });
    expect(next.a).toEqual({ timeMultiplier: 1.5, readAloud: true });
    expect(next.z).toEqual({ timeMultiplier: 1.5 });
  });

  it('switches a group from Block to Allow for every member', () => {
    const blocked = {
      a: { blockCopyPaste: true },
      b: { blockCopyPaste: true, readAloud: true },
    };
    expect(sharedStudentOverride(blocked, ['a', 'b'])).toEqual({
      blockCopyPaste: true,
    });
    const next = applyGroupOverride(blocked, ['a', 'b'], {
      blockCopyPaste: false,
    });
    expect(next).toEqual({
      a: { blockCopyPaste: false },
      b: { blockCopyPaste: false, readAloud: true },
    });
    expect(sharedStudentOverride(next, ['a', 'b'])).toEqual({
      blockCopyPaste: false,
    });
  });

  it('never stores a window shift', () => {
    const next = applyGroupOverride(overrides, ['z'], { openAt: 5 });
    expect(next.z).toBeUndefined();
  });
});
