/**
 * Reads a scanned stack of stamped worksheets: each page's seat comes from its
 * printed marker, and each page is kept as an upright grayscale image ready for
 * the teacher's Drive. Nothing is read from the student's handwriting.
 */

import { paperBatchTag, type PaperMarkerPayload } from './paperSheetMarker';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from './paperSheetLayout';
import { readPaperPage } from './paperSheetReader';
import {
  cropWrittenBlob,
  rasterizeScan,
  type GrayEncoder,
  type RasterDeps,
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
      thumb: string;
    }
  | { status: 'unmatched'; scanPage: number; reason: UnmatchedReason };

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

/** Yield one result per scanned page, releasing each page before the next is read. */
export async function* scanScoredWork(
  file: Blob,
  work: ScoredWork,
  deps?: RasterDeps,
  encode?: GrayEncoder
): AsyncGenerator<ScanPageResult> {
  const wholePage = { x: 0, y: 0, w: PAGE_WIDTH_MM, h: PAGE_HEIGHT_MM };
  for await (const raster of rasterizeScan(file, deps)) {
    const read = readPaperPage(raster.page, {
      questionCount: 0,
      choiceCount: 1,
    });
    if (read.status !== 'ok') {
      yield {
        status: 'unmatched',
        scanPage: raster.pageNumber,
        reason: read.status === 'no-marker' ? 'no-marker' : 'no-registration',
      };
      continue;
    }
    const reason = markerMismatch(read.marker, work);
    if (reason) {
      yield { status: 'unmatched', scanPage: raster.pageNumber, reason };
      continue;
    }
    yield {
      status: 'ok',
      scanPage: raster.pageNumber,
      seat: read.marker.seat,
      page: read.marker.page,
      blob: await cropWrittenBlob(raster.page, read.mmToPx, wholePage, encode),
      thumb: raster.crop(
        { x: 0, y: 0, w: raster.page.width, h: raster.page.height },
        THUMB_EDGE_PX
      ),
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
