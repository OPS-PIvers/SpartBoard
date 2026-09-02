import { describe, it, expect } from 'vitest';
import {
  isInvalidWordRange,
  wordCounterLabel,
  wordLimitBounds,
  wordLimitStatus,
} from './wordLimit';
import { countWords } from './wordCount';

describe('wordLimitBounds', () => {
  it('drops 0, undefined and sub-1 values on either side', () => {
    expect(wordLimitBounds({ minWords: 0, maxWords: undefined })).toEqual({
      min: undefined,
      max: undefined,
    });
    expect(wordLimitBounds({ minWords: 0.4, maxWords: 200 })).toEqual({
      min: undefined,
      max: 200,
    });
  });

  it('floors fractional bounds', () => {
    expect(wordLimitBounds({ minWords: 10.9, maxWords: 20.9 })).toEqual({
      min: 10,
      max: 20,
    });
  });
});

describe('isInvalidWordRange', () => {
  it('is true only when both bounds are set and min exceeds max', () => {
    expect(isInvalidWordRange(200, 100)).toBe(true);
    expect(isInvalidWordRange(100, 200)).toBe(false);
    expect(isInvalidWordRange(100, 100)).toBe(false);
    expect(isInvalidWordRange(200, undefined)).toBe(false);
    expect(isInvalidWordRange(undefined, 100)).toBe(false);
  });
});

describe('wordLimitStatus', () => {
  it('is ok inside the range', () => {
    expect(wordLimitStatus(150, { minWords: 100, maxWords: 200 })).toEqual({
      blocked: false,
      message: null,
      tone: 'ok',
    });
  });

  it('is ok with no bounds at all', () => {
    expect(wordLimitStatus(0, {})).toEqual({
      blocked: false,
      message: null,
      tone: 'ok',
    });
  });

  it('warns without blocking when enforcement is off', () => {
    expect(wordLimitStatus(240, { maxWords: 200 })).toEqual({
      blocked: false,
      message: null,
      tone: 'warn',
    });
    expect(wordLimitStatus(38, { minWords: 100 })).toEqual({
      blocked: false,
      message: null,
      tone: 'warn',
    });
  });

  it('blocks and explains an over-max answer when enforced', () => {
    const status = wordLimitStatus(223, {
      maxWords: 200,
      enforceWordLimit: true,
    });
    expect(status.blocked).toBe(true);
    expect(status.tone).toBe('blocked');
    expect(status.message).toBe(
      'Your answer is 23 words over the 200-word limit. Trim it to submit.'
    );
  });

  it('singularizes a one-word overage', () => {
    expect(
      wordLimitStatus(201, { maxWords: 200, enforceWordLimit: true }).message
    ).toBe('Your answer is 1 word over the 200-word limit. Trim it to submit.');
  });

  it('blocks and explains an under-min answer when enforced', () => {
    const status = wordLimitStatus(62, {
      minWords: 100,
      enforceWordLimit: true,
    });
    expect(status.blocked).toBe(true);
    expect(status.message).toBe(
      'Write at least 100 words to submit. 38 to go.'
    );
  });

  it('never blocks a blank draft, even under an enforced minimum', () => {
    const status = wordLimitStatus(0, { minWords: 50, enforceWordLimit: true });
    expect(status.blocked).toBe(false);
    expect(status.message).toBeNull();
    expect(status.tone).toBe('ok');
  });

  it('does not block at the exact bounds', () => {
    const cfg = { minWords: 100, maxWords: 200, enforceWordLimit: true };
    expect(wordLimitStatus(100, cfg).blocked).toBe(false);
    expect(wordLimitStatus(200, cfg).blocked).toBe(false);
  });

  it('ignores enforcement when no usable bound is set', () => {
    expect(
      wordLimitStatus(0, { maxWords: 0, enforceWordLimit: true }).blocked
    ).toBe(false);
  });
});

describe('wordCounterLabel', () => {
  it('renders both bounds as a range', () => {
    expect(wordCounterLabel(42, { minWords: 100, maxWords: 200 })).toBe(
      '42 / 100–200 words'
    );
  });

  it('renders a min-only bound with a trailing plus', () => {
    expect(wordCounterLabel(42, { minWords: 100 })).toBe('42 / 100+ words');
  });

  it('renders a max-only bound as a cap', () => {
    expect(wordCounterLabel(42, { maxWords: 200 })).toBe('42 / 200 words');
  });

  it('falls back to a bare count, singularized at one', () => {
    expect(wordCounterLabel(42, {})).toBe('42 words');
    expect(wordCounterLabel(1, {})).toBe('1 word');
    expect(wordCounterLabel(0, {})).toBe('0 words');
  });
});

describe('countWords', () => {
  it('counts words across tags and entities', () => {
    expect(countWords('<p>one two</p><p>three</p>')).toBe(3);
    expect(countWords('<p>&nbsp;</p>')).toBe(0);
    expect(countWords('')).toBe(0);
  });
});
