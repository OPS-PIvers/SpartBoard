import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  toGlPublicStep,
  dedupeGlStepsById,
  type GlKeyStep,
} from './guidedLearningPublicStep';

interface StepCase {
  name: string;
  step: GlKeyStep;
  expected: Record<string, unknown>;
}

const cases = JSON.parse(
  readFileSync(
    resolve(__dirname, 'guidedLearningPublicStep.cases.json'),
    'utf8'
  )
) as StepCase[];

const SHUFFLED = ['choices', 'matchingLeft', 'matchingRight', 'sortingItems'];

/** Every list in a public question is shuffled, so compare them sorted. */
export function settled(step: Record<string, unknown>): unknown {
  const q = step.question as Record<string, unknown> | undefined;
  if (!q) return step;
  const sorted: Record<string, unknown> = { ...q };
  for (const field of SHUFFLED) {
    const list = q[field];
    if (Array.isArray(list)) sorted[field] = [...(list as string[])].sort();
  }
  return { ...step, question: sorted };
}

describe('toGlPublicStep shared cases', () => {
  it.each(cases)('$name', ({ step, expected }) => {
    expect(settled(toGlPublicStep(step))).toEqual(settled(expected));
  });
});

describe('toGlPublicStep', () => {
  // The whole point of the projection: which choice is right stays with the
  // teacher. A choice list still carries the right answer among the others,
  // so the key fields are what must be absent.
  it('ships no answer key of any kind', () => {
    const out = JSON.stringify(cases.map(({ step }) => toGlPublicStep(step)));
    expect(out).not.toContain('correctAnswer');
    expect(out).not.toContain('matchingPairs');
    expect(out).not.toContain('tour');
    expect(out).not.toContain('StoragePath');
  });

  // The Admin SDK throws on an undefined value, so an absent field must be
  // absent rather than present-and-undefined.
  it('writes no undefined value the Admin SDK would reject', () => {
    const out = toGlPublicStep({
      id: 's',
      xPct: 1,
      yPct: 2,
      imageIndex: 0,
      interactionType: 'tooltip',
    });
    expect(Object.values(out).every((v) => v !== undefined)).toBe(true);
    expect('label' in out).toBe(false);
  });
});

describe('dedupeGlStepsById', () => {
  it('keeps the first of a repeated id', () => {
    const steps = [
      { id: 'a', label: 'first' },
      { id: 'b' },
      { id: 'a', label: 'second' },
    ] as GlKeyStep[];
    expect(dedupeGlStepsById(steps).map((s) => s.id)).toEqual(['a', 'b']);
    expect(dedupeGlStepsById(steps)[0].label).toBe('first');
  });
});
