import { describe, it, expect } from 'vitest';
import type { QuizPublicQuestion } from '@/types';
import { applyLocalizedStrings } from './quizLocalizedDisplay';

const mc: QuizPublicQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Capital of France?',
  timeLimit: 0,
  choices: ['Paris', 'London', 'Rome'],
};

describe('applyLocalizedStrings', () => {
  it('is identity when there is nothing to overlay', () => {
    expect(applyLocalizedStrings(mc, null)).toBe(mc);
  });

  it('overlays text and a lockstep choices array', () => {
    const out = applyLocalizedStrings(mc, {
      text: '¿Capital de Francia?',
      choices: ['París', 'Londres', 'Roma'],
    });
    expect(out.text).toBe('¿Capital de Francia?');
    expect(out.choices).toEqual(['París', 'Londres', 'Roma']);
  });

  it('falls back to English for an array of the wrong length', () => {
    const out = applyLocalizedStrings(mc, {
      text: '¿Capital de Francia?',
      choices: ['París'],
    });
    expect(out.choices).toEqual(mc.choices);
  });

  it('never invents a field the English question lacks', () => {
    const out = applyLocalizedStrings(mc, {
      text: 'x',
      matchingLeft: ['a', 'b'],
    });
    expect(out.matchingLeft).toBeUndefined();
  });

  it('leaves the source question untouched', () => {
    applyLocalizedStrings(mc, { text: 'x', choices: ['a', 'b', 'c'] });
    expect(mc.text).toBe('Capital of France?');
    expect(mc.choices).toEqual(['Paris', 'London', 'Rome']);
  });
});
