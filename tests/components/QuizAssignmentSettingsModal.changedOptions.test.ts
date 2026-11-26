import { describe, it, expect } from 'vitest';
import { changedSessionOptions } from '@/utils/changedSessionOptions';

describe('changedSessionOptions', () => {
  it('returns only keys this edit changed, leaving a live change to another key out', () => {
    expect(
      changedSessionOptions(
        { showResultToStudent: false, shuffleQuestions: true },
        { showResultToStudent: false, shuffleQuestions: false }
      )
    ).toEqual({ shuffleQuestions: false });
  });

  it('reads a removed key as null and an untouched form as empty', () => {
    expect(changedSessionOptions({ a: 1 }, {})).toEqual({ a: null });
    expect(changedSessionOptions({ a: 1 }, { a: 1 })).toEqual({});
  });
});
