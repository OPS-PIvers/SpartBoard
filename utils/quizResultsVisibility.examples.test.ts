import { describe, it, expect } from 'vitest';
import { resolveResultsVisibility } from './quizResultsVisibility';

const examples = { q1: { a: ['The study is a meta-analysis.'] } };

describe('resolveResultsVisibility rubric examples', () => {
  it('reveals examples only when results include answers', () => {
    const response = { revealedRubricExamples: examples };
    expect(
      resolveResultsVisibility(
        { scoreVisibility: 'score-responses-and-answers' },
        response
      ).revealedRubricExamples
    ).toEqual(examples);
    expect(
      resolveResultsVisibility(
        { scoreVisibility: 'score-and-responses' },
        response
      ).revealedRubricExamples
    ).toBeUndefined();
  });

  it('reads a per-student publication from the override', () => {
    const now = 1_000;
    const out = resolveResultsVisibility(
      { scoreVisibility: 'none' },
      {
        resultsOverride: {
          mode: 'shown',
          visibility: 'score-responses-and-answers',
          publishedAt: 1,
          revealedRubricExamples: examples,
        },
      },
      now
    );
    expect(out.revealedRubricExamples).toEqual(examples);
  });
});
