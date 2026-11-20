import { describe, expect, it } from 'vitest';
import * as client from '@/utils/quizCalculated';
import * as server from '@/functions/src/quizCalculated';

const spec = {
  seed: 'abc',
  variables: [
    { name: 'm', min: 0.5, max: 12.5, decimals: 2 },
    { name: 'v', min: -30, max: 30, decimals: 0 },
  ],
  formula: '1/2 m v^2',
  tolerance: { kind: 'relative' as const, percent: 2 },
  roundTo: 1,
  unit: 'J',
};

describe('random-number grading matches on client and server', () => {
  it('draws the same numbers and grades the same answers', () => {
    for (let i = 0; i < 300; i++) {
      const key = `pin-Period ${i % 4}-${1000 + i}`;
      const a = client.calcValuesFor({ id: 'q1', calc: spec }, key);
      const b = server.calcValuesFor({ id: 'q1', calc: spec }, key);
      expect(b).toEqual(a);
      if (!a || !b) throw new Error('no values');
      const shown = client.formatCalcAnswer(spec, a);
      expect(server.formatCalcAnswer(spec, b)).toBe(shown);
      for (const typed of [shown, '0', '12', shown.replace(' J', '1'), '1e3']) {
        expect(server.calcAnswerAccepted(spec, b, typed)).toBe(
          client.calcAnswerAccepted(spec, a, typed)
        );
      }
    }
  });
});

describe('the two copies', () => {
  it('share every line after their type definitions', async () => {
    const { readFileSync } = await import('node:fs');
    const body = (path: string) => {
      const text = readFileSync(path, 'utf8');
      return text.slice(text.indexOf('export const CALC_MAX_VARIABLES'));
    };
    expect(body('functions/src/quizCalculated.ts')).toBe(
      body('utils/quizCalculated.ts')
    );
  });
});
