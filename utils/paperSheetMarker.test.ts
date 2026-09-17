import { describe, expect, it } from 'vitest';
import { MARKER_CELL_COUNT } from './paperSheetLayout';
import {
  BATCH_TAG_MASK,
  MAX_PAGE,
  MAX_SEAT,
  decodePaperMarker,
  encodePaperMarker,
  markerFitsGrid,
  paperBatchTag,
  type PaperMarkerPayload,
} from './paperSheetMarker';

const payload = (
  over: Partial<PaperMarkerPayload> = {}
): PaperMarkerPayload => ({
  batchTag: 0xabcde,
  seat: 7,
  page: 1,
  isKeySheet: false,
  ...over,
});

describe('paperSheetMarker', () => {
  it('sizes the payload to exactly fill the printed grid', () => {
    expect(markerFitsGrid()).toBe(true);
    expect(encodePaperMarker(payload())).toHaveLength(MARKER_CELL_COUNT);
  });

  it('round-trips a payload', () => {
    const p = payload({
      batchTag: 0x1f2f3,
      seat: 142,
      page: 3,
      isKeySheet: true,
    });
    expect(decodePaperMarker(encodePaperMarker(p))).toEqual(p);
  });

  it('round-trips the extremes of every field', () => {
    for (const p of [
      payload({ batchTag: 0, seat: 1, page: 1 }),
      payload({ batchTag: BATCH_TAG_MASK, seat: MAX_SEAT, page: MAX_PAGE }),
    ]) {
      expect(decodePaperMarker(encodePaperMarker(p))).toEqual(p);
    }
  });

  it('decodes a sheet fed upside down', () => {
    const p = payload({ seat: 99, page: 2 });
    const rotated = [...encodePaperMarker(p)].reverse();
    expect(decodePaperMarker(rotated)).toEqual(p);
  });

  it('rejects a single flipped cell rather than decoding the wrong student', () => {
    const bits = encodePaperMarker(payload({ seat: 100 }));
    for (let i = 0; i < bits.length; i += 1) {
      const corrupted = [...bits];
      corrupted[i] = !corrupted[i];
      expect(decodePaperMarker(corrupted)).toBeNull();
    }
  });

  it('rejects an all-blank and an all-inked grid', () => {
    expect(
      decodePaperMarker(new Array(MARKER_CELL_COUNT).fill(false))
    ).toBeNull();
    expect(
      decodePaperMarker(new Array(MARKER_CELL_COUNT).fill(true))
    ).toBeNull();
  });

  it('rejects a grid of the wrong size', () => {
    expect(
      decodePaperMarker(new Array(MARKER_CELL_COUNT - 1).fill(false))
    ).toBeNull();
  });

  it('refuses to encode a seat or page it cannot represent', () => {
    expect(() => encodePaperMarker(payload({ seat: 0 }))).toThrow(RangeError);
    expect(() => encodePaperMarker(payload({ seat: MAX_SEAT + 1 }))).toThrow(
      RangeError
    );
    expect(() => encodePaperMarker(payload({ page: 0 }))).toThrow(RangeError);
    expect(() => encodePaperMarker(payload({ page: MAX_PAGE + 1 }))).toThrow(
      RangeError
    );
  });
});

describe('paperBatchTag', () => {
  it('is stable and within the encodable range', () => {
    const id = '0f6b7c2a-0000-4000-8000-1234567890ab';
    expect(paperBatchTag(id)).toBe(paperBatchTag(id));
    expect(paperBatchTag(id)).toBeLessThanOrEqual(BATCH_TAG_MASK);
    expect(paperBatchTag(id)).toBeGreaterThanOrEqual(0);
  });

  it('separates UUIDs that differ in one character', () => {
    expect(paperBatchTag('0f6b7c2a-0000-4000-8000-1234567890ab')).not.toBe(
      paperBatchTag('0f6b7c2a-0000-4000-8000-1234567890ac')
    );
  });

  it('collides rarely enough to identify a teacher s batches', () => {
    const tags = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
      tags.add(paperBatchTag(`batch-${i}-0000-4000-8000-abcdefabcdef`));
    }
    expect(tags.size).toBeGreaterThan(4980);
  });
});
