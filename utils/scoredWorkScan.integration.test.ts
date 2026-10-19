import { describe, expect, it } from 'vitest';
import { paintSyntheticSheet } from '../tests/testHelpers/paperSheetRaster';
import { paperBatchTag } from './paperSheetMarker';
import type { RasterDeps, RasterSurface } from './paperScanRaster';
import type { RasterPage } from './paperSheetReader';
import { scanScoredWork, type ScanPageResult } from './scoredWorkScan';
import type { ScoredWork } from '@/types';

const work = {
  id: 'work-integration',
  seats: {
    1: { rosterId: 'r', studentId: 's1' },
    2: { rosterId: 'r', studentId: 's2' },
  },
  spareSeats: [3],
  pageCount: 2,
} as unknown as ScoredWork;

/** A scan whose only page is the painted one. */
const depsFor = (page: RasterPage): RasterDeps => ({
  createSurface: (width, height): RasterSurface => ({
    width,
    height,
    getImageData: () => page,
    drawImage: () => undefined,
    renderPdf: () => Promise.resolve(),
    toDataUrl: () => 'data:image/png;base64,x',
    release: () => undefined,
  }),
  loadPdf: () => Promise.reject(new Error('not a pdf')),
  loadImage: () =>
    Promise.resolve({
      width: page.width,
      height: page.height,
      close: () => undefined,
    } as ImageBitmap),
});

const encode = () =>
  Promise.resolve(new Blob(['page'], { type: 'image/webp' }));

async function scan(
  seat: number,
  pageNo: number,
  extra: { rotated?: boolean; batch?: string } = {}
): Promise<ScanPageResult[]> {
  const page = paintSyntheticSheet({
    marker: {
      batchTag: paperBatchTag(extra.batch ?? work.id),
      seat,
      page: pageNo,
      isKeySheet: false,
    },
    questionCount: 0,
    choiceCount: 1,
    rotated: extra.rotated,
  });
  const out: ScanPageResult[] = [];
  for await (const r of scanScoredWork(
    new Blob(['x'], { type: 'image/png' }),
    work,
    depsFor(page),
    encode
  )) {
    out.push(r);
  }
  return out;
}

describe('scanScoredWork on a stamped page', () => {
  it('reads the seat and page from the marker', async () => {
    const [r] = await scan(2, 1);
    expect(r).toMatchObject({ status: 'ok', seat: 2, page: 1 });
  });

  it('reads a page that was fed upside down', async () => {
    const [r] = await scan(1, 2, { rotated: true });
    expect(r).toMatchObject({ status: 'ok', seat: 1, page: 2 });
  });

  it('rejects a page from a different set', async () => {
    const [r] = await scan(1, 1, { batch: 'another-set' });
    expect(r).toMatchObject({ status: 'unmatched', reason: 'other-set' });
  });

  it('rejects a seat the set never printed', async () => {
    const [r] = await scan(40, 1);
    expect(r).toMatchObject({ status: 'unmatched', reason: 'unknown-seat' });
  });
});
