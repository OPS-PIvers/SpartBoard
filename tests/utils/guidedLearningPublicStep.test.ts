import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { toPublicStep } from '@/hooks/useGuidedLearningSession';
import type { GuidedLearningStep } from '@/types';

// The same cases the server projection runs
// (functions/src/guidedLearningPublicStep.ts). A substitute launching a shared
// guided activity gets its session built there, so the two must agree.
interface StepCase {
  name: string;
  step: GuidedLearningStep;
  expected: Record<string, unknown>;
}

const cases = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      'functions',
      'src',
      'guidedLearningPublicStep.cases.json'
    ),
    'utf8'
  )
) as StepCase[];

const SHUFFLED = ['choices', 'matchingLeft', 'matchingRight', 'sortingItems'];

const settled = (step: Record<string, unknown>): unknown => {
  const q = step.question as Record<string, unknown> | undefined;
  if (!q) return step;
  const sorted: Record<string, unknown> = { ...q };
  for (const field of SHUFFLED) {
    const list = q[field];
    if (Array.isArray(list)) sorted[field] = [...(list as string[])].sort();
  }
  return { ...step, question: sorted };
};

describe('toPublicStep shared cases', () => {
  it.each(cases)('$name', ({ step, expected }) => {
    expect(
      settled(toPublicStep(step) as unknown as Record<string, unknown>)
    ).toEqual(settled(expected));
  });
});
