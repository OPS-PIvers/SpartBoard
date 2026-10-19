import { describe, expect, it } from 'vitest';
import { paintSyntheticSheet } from '../tests/testHelpers/paperSheetRaster';
import { paperBatchTag } from './paperSheetMarker';
import type { RasterDeps, RasterSurface } from './paperScanRaster';
import type { RasterPage } from './paperSheetReader';
import {
  readStampedPage,
  rotateRaster,
  scanScoredWork,
  type ScanPageResult,
} from './scoredWorkScan';
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

/** The page placed on a larger white canvas, as a scanner area bigger than the paper gives. */
function embed(
  page: RasterPage,
  pad: { left: number; top: number; right: number; bottom: number }
): RasterPage {
  const width = page.width + pad.left + pad.right;
  const height = page.height + pad.top + pad.bottom;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < page.height; y += 1) {
    const from = y * page.width * 4;
    const to = ((y + pad.top) * width + pad.left) * 4;
    data.set(page.data.subarray(from, from + page.width * 4), to);
  }
  return { width, height, data };
}

const painted = (seat: number, rotated = false): RasterPage =>
  paintSyntheticSheet({
    marker: {
      batchTag: paperBatchTag(work.id),
      seat,
      page: 1,
      isKeySheet: false,
    },
    questionCount: 0,
    choiceCount: 1,
    rotated,
  });

describe('scans that are not a clean letter page', () => {
  it('finds the marks when the scan has margin all round', () => {
    const base = painted(2);
    const wide = embed(base, {
      left: Math.round(base.width * 0.12),
      top: Math.round(base.height * 0.05),
      right: Math.round(base.width * 0.03),
      bottom: Math.round(base.height * 0.3),
    });
    const { read } = readStampedPage(wide);
    expect(read.status).toBe('ok');
    if (read.status === 'ok') expect(read.marker.seat).toBe(2);
  });

  it('reads a page scanned on its side, either way', () => {
    for (const direction of ['cw', 'ccw'] as const) {
      const { read } = readStampedPage(rotateRaster(painted(1), direction));
      expect(read.status).toBe('ok');
      if (read.status === 'ok') expect(read.marker.seat).toBe(1);
    }
  });

  it('still fails a page with no marks', () => {
    const blank: RasterPage = {
      width: 800,
      height: 1000,
      data: new Uint8ClampedArray(800 * 1000 * 4).fill(255),
    };
    expect(readStampedPage(blank).read.status).toBe('no-registration');
  });
});
