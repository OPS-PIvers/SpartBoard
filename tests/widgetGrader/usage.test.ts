import { describe, expect, it } from 'vitest';
import { countBoard, usageFile } from '@/scripts/widget-grader/usage';

describe('usage counts', () => {
  it('counts each widget type once per board and ignores malformed entries', () => {
    const counts: Record<string, number> = {};
    countBoard(counts, [
      { type: 'clock' },
      { type: 'clock' },
      { type: 'poll' },
    ]);
    countBoard(counts, [{ type: 'clock' }, null, { type: 3 }, {}]);
    countBoard(counts, undefined);
    expect(counts).toEqual({ clock: 2, poll: 1 });
  });

  it('writes sorted aggregate counts only', () => {
    const file = usageFile(
      'spartboard',
      2,
      { poll: 1, clock: 2 },
      new Date('2026-10-05T00:00:00Z')
    );
    expect(file).toEqual({
      generatedAt: '2026-10-05T00:00:00.000Z',
      project: 'spartboard',
      boards: 2,
      counts: { clock: 2, poll: 1 },
    });
    expect(Object.keys(file.counts)).toEqual(['clock', 'poll']);
  });
});
