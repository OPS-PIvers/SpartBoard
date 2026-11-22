import { describe, expect, it } from 'vitest';
import { planMarkers } from './backfill-plc-header-markers.mjs';

const header = (over: Record<string, unknown> = {}) => ({
  plcId: 'p1',
  headerCollection: 'quizzes',
  headerId: 'h1',
  sharedBy: 'u1',
  createMs: 10,
  ...over,
});
const rec = (id: string, detachedAt: unknown = 50) => ({
  id,
  data: { plcId: 'p1', plcContentId: 'h1', detachedAt },
});

describe('planMarkers', () => {
  it('marks a leaver header made before they left, using the record time', () => {
    const out = planMarkers({
      group: { participants: {} },
      records: [rec('u1')],
      headers: [header()],
      existingIds: ['u1'],
    });
    expect(out).toEqual([
      {
        id: 'hdr:p1:quizzes:h1',
        data: {
          plcId: 'p1',
          plcContentId: 'h1',
          headerCollection: 'quizzes',
          sharedBy: 'u1',
          detachedAt: 50,
        },
      },
    ]);
  });

  it('skips current participants, other sharers, later and deleted headers', () => {
    const out = planMarkers({
      group: { participants: { u1: {} } },
      records: [rec('u1'), rec('u2')],
      headers: [
        header(),
        header({ headerId: 'h2', sharedBy: 'u3' }),
        header({ headerId: 'h3', sharedBy: 'u2', createMs: 99 }),
        header({ headerId: 'h4', sharedBy: 'u2', deletedAt: 5 }),
      ],
      existingIds: [],
    });
    expect(out).toEqual([]);
  });

  it('is idempotent and ignores records without a numeric detachedAt', () => {
    expect(
      planMarkers({
        group: {},
        records: [rec('u1')],
        headers: [header()],
        existingIds: ['hdr:p1:quizzes:h1'],
      })
    ).toEqual([]);
    expect(
      planMarkers({
        group: {},
        records: [rec('u1', 'x')],
        headers: [header()],
        existingIds: [],
      })
    ).toEqual([]);
  });
});
