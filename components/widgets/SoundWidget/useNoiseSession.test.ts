import { describe, expect, it } from 'vitest';
import { addSample, type NoiseSession } from './useNoiseSession';

describe('addSample', () => {
  it('counts seconds per level and merges runs at the same level', () => {
    let session: NoiseSession = {
      seconds: [0, 0, 0, 0, 0],
      runs: [],
      alerts: 0,
    };
    for (const level of [0, 0, 2, 2, 2, 0]) session = addSample(session, level);
    expect(session.seconds).toEqual([3, 0, 3, 0, 0]);
    expect(session.runs).toEqual([
      { level: 0, seconds: 2 },
      { level: 2, seconds: 3 },
      { level: 0, seconds: 1 },
    ]);
  });
});
