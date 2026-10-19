import { describe, expect, it } from 'vitest';
import { paperBatchTag } from './paperSheetMarker';
import {
  markerMismatch,
  summarizeScan,
  type ScanPageResult,
} from './scoredWorkScan';

const work = {
  id: 'w1',
  seats: {
    1: { rosterId: 'r', studentId: 's1' },
    2: { rosterId: 'r', studentId: 's2' },
  },
  spareSeats: [3],
  pageCount: 2,
};
const marker = (
  over: Partial<{
    batchTag: number;
    seat: number;
    page: number;
    isKeySheet: boolean;
  }>
) => ({
  batchTag: paperBatchTag('w1'),
  seat: 1,
  page: 1,
  isKeySheet: false,
  ...over,
});
const ok = (seat: number, page: number): ScanPageResult => ({
  status: 'ok',
  scanPage: 1,
  seat,
  page,
  blob: new Blob(),
  thumb: '',
});

describe('scoredWorkScan', () => {
  it('accepts a marker from this set', () => {
    expect(markerMismatch(marker({}), work)).toBeNull();
    expect(markerMismatch(marker({ seat: 3 }), work)).toBeNull();
  });

  it('names why a marker does not belong', () => {
    expect(markerMismatch(marker({ batchTag: 5 }), work)).toBe('other-set');
    expect(markerMismatch(marker({ seat: 9 }), work)).toBe('unknown-seat');
    expect(markerMismatch(marker({ page: 3 }), work)).toBe('bad-page');
  });

  it('reports missing, doubled and absent', () => {
    const summary = summarizeScan(work, [
      ok(1, 1),
      ok(1, 1),
      ok(3, 2),
      { status: 'unmatched', scanPage: 9, reason: 'no-marker' },
    ]);
    expect(summary.unmatched).toBe(1);
    expect(summary.absentSeats).toEqual([2]);
    expect(summary.seats[0]).toMatchObject({
      seat: 1,
      missingPages: [2],
      duplicatePages: [1],
    });
    expect(summary.seats[1]).toMatchObject({ seat: 3, missingPages: [1] });
  });
});
