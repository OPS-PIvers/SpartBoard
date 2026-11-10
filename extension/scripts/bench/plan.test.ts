import { describe, expect, it } from 'vitest';
import { redrawnSteps, waitPlan } from './plan.ts';
import { SCENARIOS } from './scenarios.ts';

describe('bench play plan', () => {
  it('waits for every step of an ordinary tour', () => {
    expect(waitPlan([{ target: 'a' }, { target: 'b' }])).toEqual([0, 1]);
  });

  it('clicks ahead from the first skipped step and rushes without waiting', () => {
    expect(
      waitPlan([
        { target: 'a' },
        { target: 'b', play: 'skip' },
        { target: 'c', play: 'skip' },
        { target: 'd' },
        { target: 'e', play: 'rush' },
        { target: 'f' },
      ])
    ).toEqual([0, null, null, 1, null, 5]);
  });

  it('keeps every click-ahead in the ahead scenario within three steps', () => {
    const ahead = SCENARIOS.find((s) => s.name === 'ahead')!;
    waitPlan(ahead.steps).forEach((w, i) => {
      if (w !== null) expect(i - w).toBeLessThanOrEqual(3);
    });
  });
});

describe('tips drawn twice', () => {
  it('counts a step whose tip comes back after another step', () => {
    const renders = [1, 1, 2, 2, 3, 2, 4].map((current) => ({ current }));
    expect([...redrawnSteps(renders)]).toEqual([2]);
  });

  it('does not count repeated renders of the same step', () => {
    const renders = [1, 1, 1, 2, 3, 3].map((current) => ({ current }));
    expect(redrawnSteps(renders).size).toBe(0);
  });
});
