import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import { tourPlaytestKey as client } from '@/components/tours/tourPlaytest';
import { tourPlaytestKey as server } from '@/functions/src/mcp/tourPlaytest';

const steps = [
  { id: 'a', tour: { anchor: 'board.whole', action: 'observe' } },
  {
    id: 'b',
    tour: {
      anchor: 'settings.toggle:random#sound',
      action: 'toggle',
      value: false,
    },
  },
  { id: 'c', tour: { anchor: '', action: 'type', value: 'Période 1 ✓' } },
  { id: 'd' },
] as unknown as GuidedLearningStep[];

describe('playtest fingerprint', () => {
  it('is the same in the app and the connector', () => {
    for (let n = 0; n <= steps.length; n++)
      expect(client(steps.slice(0, n))).toBe(server(steps.slice(0, n)));
    expect(client(steps)).toMatch(/^[0-9a-f]{8}$/);
    expect(client(steps)).not.toBe(client([...steps].reverse()));
  });
});
