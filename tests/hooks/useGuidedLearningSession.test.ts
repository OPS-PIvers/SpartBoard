import { describe, expect, it } from 'vitest';
import {
  toPublicStep,
  isAnswerCorrect,
  dedupeStepsById,
} from '@/hooks/useGuidedLearningSession';
import type { GuidedLearningStep } from '@/types';

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

  it('mirrors v3 region, callout, cursor and narration playback fields but never tour', () => {
    const step: GuidedLearningStep = {
      id: 'step-v3',
      xPct: 30,
      yPct: 40,
      imageIndex: 0,
      interactionType: 'tooltip',
      region: {
        shape: 'polygon',
        wPct: 10,
        hPct: 8,
        points: [
          { x: 25, y: 36 },
          { x: 35, y: 36 },
          { x: 30, y: 44 },
        ],
      },
      calloutPin: { xPct: 60, yPct: 20 },
      cursor: { hide: true },
      narration: {
        source: 'recorded',
        url: 'https://example.com/n.mp3',
        storagePath: 'users/t/gl/n.mp3',
        durationMs: 4200,
        voice: 'en-US-Neural2-F',
        textHash: 'abc',
      },
      tour: { anchor: 'dock.open-tools', action: 'click' },
    };

    const publicStep = toPublicStep(step);

    expect(publicStep.region).toEqual(step.region);
    expect(publicStep.calloutPin).toEqual({ xPct: 60, yPct: 20 });
    expect(publicStep.cursor).toEqual({ hide: true });
    expect(publicStep.narration).toEqual({
      url: 'https://example.com/n.mp3',
      durationMs: 4200,
      voice: 'en-US-Neural2-F',
    });
    expect(publicStep).not.toHaveProperty('tour');
  });

  it('strips answer keys and never passes matching pairs or sorting order through', () => {
    const sorting = toPublicStep({
      id: 's',
      xPct: 0,
      yPct: 0,
      imageIndex: 0,
      interactionType: 'question',
      question: { type: 'sorting', text: 'Order', sortingItems: ['a', 'b'] },
    });
    const matching = toPublicStep({
      id: 'm',
      xPct: 0,
      yPct: 0,
      imageIndex: 0,
      interactionType: 'question',
      question: {
        type: 'matching',
        text: 'Match',
        matchingPairs: [{ left: 'x', right: 'y' }],
      },
    });
    expect(sorting.question).not.toHaveProperty('correctAnswer');
    expect([...(sorting.question?.sortingItems ?? [])].sort()).toEqual([
      'a',
      'b',
    ]);
    expect(matching.question).not.toHaveProperty('matchingPairs');
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

// ─── dedupeStepsById ─────────────────────────────────────────────────────────

function mcQuestionStep(
  id: string,
  text: string,
  correct: string
): GuidedLearningStep {
  return {
    id,
    xPct: 0,
    yPct: 0,
    imageIndex: 0,
    interactionType: 'question',
    question: {
      type: 'multiple-choice',
      text,
      choices: [correct, 'wrong'],
      correctAnswer: correct,
    },
  };
}

describe('dedupeStepsById', () => {
  it('keeps the first occurrence and drops later duplicates by id', () => {
    const first = mcQuestionStep('s1', 'Original text', '2');
    const dup = mcQuestionStep('s1', 'Phantom duplicate text', '2');
    const unique = mcQuestionStep('s2', 'What is 2+2?', '4');
    expect(dedupeStepsById([first, dup, unique])).toEqual([first, unique]);
  });

  it('returns an equivalent array when there are no duplicates', () => {
    const list = [
      mcQuestionStep('s1', 'A', '1'),
      mcQuestionStep('s2', 'B', '2'),
    ];
    expect(dedupeStepsById(list)).toEqual(list);
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeStepsById([])).toEqual([]);
  });
});
