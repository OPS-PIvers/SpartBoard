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

  it('reads a removed key as undefined and an untouched form as empty', () => {
    const out = changedSessionOptions({ a: 1 }, {});
    expect(out).toHaveProperty('a', undefined);
    expect(changedSessionOptions({ a: 1 }, { a: 1 })).toEqual({});
  });

  it('treats absent and null as equal', () => {
    expect(changedSessionOptions({}, { a: null })).toEqual({});
    expect(changedSessionOptions({ a: null }, {})).toEqual({});
  });
});
