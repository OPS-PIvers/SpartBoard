import { describe, expect, it } from 'vitest';
import {
  toPublicStep,
  isAnswerCorrect,
} from '@/hooks/useGuidedLearningSession';
import { GuidedLearningStep } from '@/types';

describe('toPublicStep', () => {
  it('forwards public-safe visual configuration fields', () => {
    const step: GuidedLearningStep = {
      id: 'step-1',
      xPct: 42,
      yPct: 64,
      imageIndex: 0,
      label: 'Focus area',
      interactionType: 'tooltip',
      hideStepNumber: true,
      showOverlay: 'tooltip',
      tooltipPosition: 'below',
      tooltipOffset: 24,
      text: 'Read this section carefully.',
      panZoomScale: 3,
      spotlightRadius: 30,
      bannerTone: 'red',
      autoAdvanceDuration: 7,
      question: {
        type: 'multiple-choice',
        text: 'What is 2 + 2?',
        choices: ['4', '5', '6'],
        correctAnswer: '4',
      },
    };

    const publicStep = toPublicStep(step);

    expect(publicStep.tooltipPosition).toBe('below');
    expect(publicStep.tooltipOffset).toBe(24);
    expect(publicStep.bannerTone).toBe('red');
    expect(publicStep.question?.text).toBe('What is 2 + 2?');
    expect(publicStep.question).not.toHaveProperty('correctAnswer');
  });
});

// ─── Helper to build a minimal matching step ──────────────────────────────────

function matchingStep(
  pairs: { left: string; right: string }[]
): GuidedLearningStep {
  return {
    id: 'step-m',
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'question',
    question: {
      type: 'matching',
      text: 'Match each capital.',
      matchingPairs: pairs,
    },
  };
}

describe('isAnswerCorrect — matching', () => {
  const PAIRS = [
    { left: 'France', right: 'Paris' },
    { left: 'Germany', right: 'Berlin' },
  ];

  it('returns true when the student submits exactly the correct pairs', () => {
    expect(
      isAnswerCorrect(matchingStep(PAIRS), ['France:Paris', 'Germany:Berlin'])
    ).toBe(true);
  });

  it('returns true regardless of submission order', () => {
    expect(
      isAnswerCorrect(matchingStep(PAIRS), ['Germany:Berlin', 'France:Paris'])
    ).toBe(true);
  });

  it('returns false when a pair is wrong', () => {
    expect(
      isAnswerCorrect(matchingStep(PAIRS), ['France:Berlin', 'Germany:Paris'])
    ).toBe(false);
  });

  it('returns false when a pair is missing', () => {
    expect(isAnswerCorrect(matchingStep(PAIRS), ['France:Paris'])).toBe(false);
  });

  it('returns false when all correct pairs are present but extra wrong pairs are also submitted', () => {
    // Regression: before the fix, submitting every correct pair plus one wrong
    // pair passed the `every` check because it only tested the answer-key side.
    // The length guard makes this fail correctly.
    expect(
      isAnswerCorrect(matchingStep(PAIRS), [
        'France:Paris',
        'Germany:Berlin',
        'France:Berlin', // extra wrong pair
      ])
    ).toBe(false);
  });

  it('returns false when answer is not an array', () => {
    expect(isAnswerCorrect(matchingStep(PAIRS), 'France:Paris')).toBe(false);
  });

  it('returns false when matchingPairs is missing', () => {
    const step = matchingStep([]);
    // Remove the matchingPairs field to simulate a legacy/malformed question.
    const q = step.question;
    if (q) delete q.matchingPairs;
    expect(isAnswerCorrect(step, [])).toBe(false);
  });
});
