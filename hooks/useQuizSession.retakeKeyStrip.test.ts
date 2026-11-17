import { describe, it, expect } from 'vitest';
import { deleteField } from 'firebase/firestore';
import { retakeKeyStrip } from './useQuizSession';

describe('retakeKeyStrip', () => {
  it('deletes the published key on the response and its override', () => {
    const patch = retakeKeyStrip({
      revealedAnswers: { q1: 'A' },
      revealedExplanations: { q1: { explanation: 'Because' } },
      resultsOverride: {
        mode: 'shown',
        visibility: 'score-responses-and-answers',
        publishedAt: 1,
        revealedAnswers: { q1: 'A' },
        revealedRubricExamples: { q1: { c1: ['Example'] } },
      },
    });
    expect(Object.keys(patch).sort()).toEqual([
      'resultsOverride.revealedAnswers',
      'resultsOverride.revealedRubricExamples',
      'revealedAnswers',
      'revealedExplanations',
    ]);
    expect(patch.revealedAnswers.isEqual(deleteField())).toBe(true);
  });

  it('writes nothing when no key was published', () => {
    expect(
      retakeKeyStrip({ resultsOverride: { mode: 'hidden', publishedAt: 1 } })
    ).toEqual({});
  });
});
