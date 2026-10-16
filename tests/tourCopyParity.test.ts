import { describe, expect, it } from 'vitest';
import { copyProblem as guard } from '@/scripts/widget-grader/static/copyGuard';
import { copyProblem as tour } from '@/functions/src/mcp/tourCopy';

const FIXTURES = [
  'Click **Assign**.',
  'Click **Assign** — then pick a class.',
  'Tip: drag the corner to resize.',
  'note: this saves as you go.',
  'Pro-tip: hold Shift.',
  Array.from({ length: 30 }, () => 'word').join(' '),
  Array.from({ length: 31 }, () => 'word').join(' '),
  '  spaced\n\nout   text  ',
  '42',
  '',
];

describe('tour copy rules', () => {
  it('match the widget copy guard', () => {
    expect(FIXTURES.map(tour)).toEqual(FIXTURES.map(guard));
  });
});
