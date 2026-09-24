import { describe, it, expect } from 'vitest';
import type { GuidedLearningPublicStep, GuidedLearningStep } from '@/types';
import {
  answerKeysForSteps,
  scoringStepsForSession,
  withFrozenAnswerKeys,
} from './resultsScoring';

const mc = (id: string, correct: string, text = id): GuidedLearningStep => ({
  id,
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'question',
  question: {
    type: 'multiple-choice',
    text,
    choices: ['a', 'b'],
    correctAnswer: correct,
  },
});
const pub = (s: GuidedLearningStep): GuidedLearningPublicStep => ({
  id: s.id,
  xPct: s.xPct,
  yPct: s.yPct,
  imageIndex: s.imageIndex,
  interactionType: s.interactionType,
  question: s.question
    ? { type: s.question.type, text: s.question.text, choices: ['b', 'a'] }
    : undefined,
});
const text = (id: string): GuidedLearningStep => ({
  id,
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'text-popover',
});

describe('scoringStepsForSession', () => {
  const assigned = [mc('q1', 'a'), text('t1'), mc('q2', 'b')];
  const frozen = assigned.map(pub);

  it('keeps the frozen question list when the set gains, loses or reorders questions', () => {
    const edited = [mc('q3', 'a'), mc('q2', 'b', 'renamed')];
    const steps = scoringStepsForSession(frozen, edited);
    expect(steps.map((s) => s.id)).toEqual(['q1', 'q2']);
    expect(steps[1].question?.text).toBe('q2');
    expect(steps[1].question?.correctAnswer).toBe('b');
    // q1 left the set: its slot stays, with no key.
    expect(steps[0].question?.correctAnswer).toBeUndefined();
  });

  it('drops the key when a question changed type after assigning', () => {
    const edited: GuidedLearningStep[] = [
      {
        ...mc('q1', 'a'),
        question: { type: 'sorting', text: 'q1', sortingItems: ['x', 'y'] },
      },
    ];
    const [q1] = scoringStepsForSession(frozen, edited);
    expect(q1.question).toEqual({ type: 'multiple-choice', text: 'q1' });
  });

  it("falls back to the set's own questions when the session has none to read", () => {
    const steps = scoringStepsForSession(null, [...assigned, mc('q1', 'b')]);
    expect(steps.map((s) => s.id)).toEqual(['q1', 'q2']);
  });
});

describe('frozen answer keys', () => {
  const set = (steps: GuidedLearningStep[]) => ({
    id: 'set-1',
    title: 'Set',
    imageUrls: [],
    steps,
    mode: 'structured' as const,
    createdAt: 1,
    updatedAt: 1,
  });

  it('captures only question keys, with no undefined fields', () => {
    const keys = answerKeysForSteps([mc('q1', 'a'), text('t1')]);
    expect(keys).toEqual({
      q1: { type: 'multiple-choice', choices: ['a', 'b'], correctAnswer: 'a' },
    });
    expect(Object.values(keys.q1)).not.toContain(undefined);
  });

  it('scores an edited set against the keys frozen at assign', () => {
    const keys = answerKeysForSteps([mc('q1', 'a')]);
    const edited = set([mc('q1', 'b', 'Reworded')]);
    const frozen = withFrozenAnswerKeys(edited, keys);
    expect(frozen.steps[0].question?.correctAnswer).toBe('a');
    expect(frozen.steps[0].question?.text).toBe('Reworded');
  });

  it('leaves a question whose type changed, and sets without keys, alone', () => {
    const keys = answerKeysForSteps([mc('q1', 'a')]);
    const sorting: GuidedLearningStep = {
      ...mc('q1', 'a'),
      question: { type: 'sorting', text: 'q1', sortingItems: ['x', 'y'] },
    };
    const edited = set([sorting]);
    expect(withFrozenAnswerKeys(edited, keys).steps[0]).toBe(sorting);
    expect(withFrozenAnswerKeys(edited, undefined)).toBe(edited);
  });
});
