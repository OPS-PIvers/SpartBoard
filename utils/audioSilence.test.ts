import { describe, it, expect } from 'vitest';
import { nextSpeechStart } from './audioSilence';

const S = true;
const V = false;

describe('nextSpeechStart', () => {
  it('from inside speech jumps past the next gap', () => {
    const silent = [V, V, V, S, S, V, V];
    expect(nextSpeechStart(silent, 1)).toBe(5);
  });

  it('from inside a gap jumps to the end of that gap', () => {
    const silent = [V, S, S, S, V, V];
    expect(nextSpeechStart(silent, 2)).toBe(4);
  });

  it('returns null when there is no gap ahead', () => {
    expect(nextSpeechStart([V, V, V, V], 0)).toBeNull();
  });

  it('returns null when the only gap is trailing', () => {
    expect(nextSpeechStart([V, V, S, S], 0)).toBeNull();
  });

  it('handles an empty mask and out-of-range indices', () => {
    expect(nextSpeechStart([], 0)).toBeNull();
    expect(nextSpeechStart([S, V], -5)).toBe(1);
    expect(nextSpeechStart([S, V], 10)).toBeNull();
  });
});
