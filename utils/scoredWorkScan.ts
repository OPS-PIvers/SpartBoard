/**
 * Reads a scanned stack of stamped worksheets: each page's seat comes from its
 * printed marker, and each page is kept as an upright grayscale image ready for
 * the teacher's Drive. Nothing is read from the student's handwriting.
 */

import { paperBatchTag, type PaperMarkerPayload } from './paperSheetMarker';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from './paperSheetLayout';
import {
  readPaperPage,
  type PageReadResult,
  type RasterPage,
} from './paperSheetReader';
import {
  cropWrittenBlob,
  rasterizeScan,
  type GrayEncoder,
  type RasterDeps,
  type RasterizedPage,
} from './paperScanRaster';
import type { ScoredWork } from '@/types';

export type UnmatchedReason =
  'no-registration' | 'no-marker' | 'other-set' | 'unknown-seat' | 'bad-page';

export type ScanPageResult =
  | {
      status: 'ok';
      scanPage: number;
      seat: number;
      page: number;
      blob: Blob;
    }
  | {
      status: 'unmatched';
      scanPage: number;
      reason: UnmatchedReason;
      /** The page as scanned, so the teacher can see what was uploaded. */
      thumb: string;
    };

const THUMB_EDGE_PX = 260;

/** Why a decoded marker does not belong to this set, or null when it does. */
export function markerMismatch(
  marker: PaperMarkerPayload,
  work: Pick<ScoredWork, 'id' | 'seats' | 'spareSeats' | 'pageCount'>
): UnmatchedReason | null {
  if (marker.batchTag !== paperBatchTag(work.id) || marker.isKeySheet) {
    return 'other-set';
  }
  if (!(marker.seat in work.seats) && !work.spareSeats.includes(marker.seat)) {
    return 'unknown-seat';
  }
  if (marker.page > work.pageCount) return 'bad-page';
  return null;
}

/** A page turned a quarter turn, for scans a feeder or scanner laid on its side. */
export function rotateRaster(
  page: RasterPage,
  direction: 'cw' | 'ccw'
): RasterPage {
  const { width: w, height: h, data } = page;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = direction === 'cw' ? h - 1 - y : y;
      const ny = direction === 'cw' ? x : w - 1 - x;
      const from = (y * w + x) * 4;
      const to = (ny * h + nx) * 4;
      out[to] = data[from];
      out[to + 1] = data[from + 1];
      out[to + 2] = data[from + 2];
      out[to + 3] = data[from + 3];
    }
  }
  return { width: h, height: w, data: out };
}

const READ_OPTIONS = { questionCount: 0, choiceCount: 1 };

/** Read a page as scanned; when that fails, as turned each way. */
export function readStampedPage(page: RasterPage): {
  read: PageReadResult;
  page: RasterPage;
} {
  const first = readPaperPage(page, READ_OPTIONS);
  if (first.status === 'ok') return { read: first, page };
  for (const direction of ['cw', 'ccw'] as const) {
    const turned = rotateRaster(page, direction);
    const read = readPaperPage(turned, READ_OPTIONS);
    if (read.status === 'ok') return { read, page: turned };
  }
  return { read: first, page };
}

const thumbOf = (raster: RasterizedPage): string =>
  raster.crop(
    { x: 0, y: 0, w: raster.page.width, h: raster.page.height },
    THUMB_EDGE_PX
  );

/** Yield one result per scanned page, releasing each page before the next is read. */
export async function* scanScoredWork(
  file: Blob,
  work: ScoredWork,
  deps?: RasterDeps,
  encode?: GrayEncoder
): AsyncGenerator<ScanPageResult> {
  const wholePage = { x: 0, y: 0, w: PAGE_WIDTH_MM, h: PAGE_HEIGHT_MM };
  for await (const raster of rasterizeScan(file, deps)) {
    const { read, page } = readStampedPage(raster.page);
    if (read.status !== 'ok') {
      yield {
        status: 'unmatched',
        scanPage: raster.pageNumber,
        reason: read.status === 'no-marker' ? 'no-marker' : 'no-registration',
        thumb: thumbOf(raster),
      };
      continue;
    }
    const reason = markerMismatch(read.marker, work);
    if (reason) {
      yield {
        status: 'unmatched',
        scanPage: raster.pageNumber,
        reason,
        thumb: thumbOf(raster),
      };
      continue;
    }
    yield {
      status: 'ok',
      scanPage: raster.pageNumber,
      seat: read.marker.seat,
      page: read.marker.page,
      blob: await cropWrittenBlob(page, read.mmToPx, wholePage, encode),
    };
  }
}

export interface ScanSeatSummary {
  seat: number;
  pages: number[];
  missingPages: number[];
  duplicatePages: number[];
}

export interface ScanSummary {
  seats: ScanSeatSummary[];
  unmatched: number;
  /** Seats the set printed for a student but the stack never showed. */
  absentSeats: number[];
}

/** Group page results by seat and report what is missing or doubled. */
export function summarizeScan(
  work: Pick<ScoredWork, 'seats' | 'spareSeats' | 'pageCount'>,
  results: readonly ScanPageResult[]
): ScanSummary {
  const bySeat = new Map<number, number[]>();
  let unmatched = 0;
  for (const r of results) {
    if (r.status !== 'ok') {
      unmatched += 1;
      continue;
    }
    bySeat.set(r.seat, [...(bySeat.get(r.seat) ?? []), r.page]);
  }
  const seats = [...bySeat.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seat, pages]) => {
      const unique = [...new Set(pages)].sort((a, b) => a - b);
      return {
        seat,
        pages: unique,
        missingPages: Array.from(
          { length: work.pageCount },
          (_, i) => i + 1
        ).filter((p) => !unique.includes(p)),
        duplicatePages: unique.filter(
          (p) => pages.filter((x) => x === p).length > 1
        ),
      };
    });
  const absentSeats = Object.keys(work.seats)
    .map(Number)
    .filter((seat) => !bySeat.has(seat))
    .sort((a, b) => a - b);
  return { seats, unmatched, absentSeats };
}
