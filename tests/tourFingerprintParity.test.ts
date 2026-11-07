import { it, expect } from 'vitest';
import { buildTourContent } from '@/components/tours/tourSnapshot';
import { glTourFingerprint } from '@/functions/src/glTours';
const sortKeys = (_k: string, v: unknown): unknown =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0
        )
      )
    : v;
it('server and editor fingerprints agree on the same set', () => {
  const sets = [
    {
      id: 'a',
      title: 'T',
      mode: 'tour',
      imageUrl: 'x',
      imagePath: 'p',
      steps: [
        {
          id: 's',
          imageIndex: 5,
          web: { note: 'n', claudeQuestion: 'q', url: 'u' },
        },
        { id: 't', xPct: 0, showOverlay: 'popover' },
      ],
      updatedAt: 3,
      order: 1,
    },
    { id: 'b', title: 'T', imageUrls: [], steps: [], tourSetup: { x: 1 } },
  ];
  for (const s of sets) {
    const client = JSON.stringify(buildTourContent(s as never), sortKeys);
    expect(glTourFingerprint(s.id, s as never)).toBe(client);
  }
});
