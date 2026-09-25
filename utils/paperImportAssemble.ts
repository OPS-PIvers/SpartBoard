/**
 * Reassembles the pages of one scanned stack into per-seat sheets (plan Q12,
 * Q21, Q22, Q23). Pure: pages arrive in any order, from any number of scans.
 */

import type { PaperBatch, PaperSeatAssignment } from '@/types';
import {
  paperGridOf,
  questionsPerPage,
  type PaperGrid,
} from './paperSheetLayout';
import { paperBatchTag } from './paperSheetMarker';
import type {
  PageRead,
  PageReadResult,
  RowDoubt,
  RowRead,
  WrittenBoxRead,
} from './paperSheetReader';

export interface ScannedPage {
  /** Position in the scan, for the teacher to find the physical page again. */
  scanIndex: number;
  read: PageReadResult;
}

export interface SheetAnswer {
  /** 0-based question index across the whole test. */
  question: number;
  choice: number | null;
  doubt?: RowDoubt;
  fills: number[];
  crop: RowRead['crop'];
  /** Scan page the answer was read from, for the review crop. */
  scanIndex: number;
}

/** A handwritten box as the sheet arrived; the crop itself travels separately (D21). */
export interface SheetWritten {
  questionId: string;
  label: string;
  page: number;
  state: WrittenBoxRead['state'];
  inkMm2: number;
  scanIndex: number;
}

export type SheetKind = 'student' | 'spare' | 'key';

export type SheetFlag = 'missing-page' | 'doubtful-rows' | 'duplicate-conflict';

export interface AssembledSheet {
  seat: number;
  kind: SheetKind;
  student: PaperSeatAssignment | null;
  /** One entry per question; questions on a missing page are absent. */
  answers: SheetAnswer[];
  /** Handwritten boxes that arrived; present only for page-map batches (layoutVersion 2). */
  written?: SheetWritten[];
  pagesSeen: number[];
  missingPages: number[];
  /** No ink on any row or box that arrived — listed as unused, never graded (Q21, D22). */
  isBlank: boolean;
  flags: SheetFlag[];
}

export interface AssembleResult {
  sheets: AssembledSheet[];
  keySheet: AssembledSheet | null;
  /** Scan indexes whose marks or marker could not be read. */
  unreadablePages: number[];
  /** Scan indexes carrying another batch's marker. */
  foreignPages: number[];
  /** Scan indexes whose seat or page number this batch never printed. */
  unknownPages: number[];
}

const seatKind = (batch: PaperBatch, seat: number): SheetKind | null => {
  if (batch.keySheetSeat === seat) return 'key';
  if (batch.seats[seat]) return 'student';
  if (batch.spareSeats.includes(seat)) return 'spare';
  return null;
};

/** Row index across the whole sheet: the map's on v2 pages, else page arithmetic. */
export function sheetRowOf(
  read: Pick<PageRead, 'marker'>,
  row: Pick<RowRead, 'indexOnPage' | 'sheetRow'>,
  grid: PaperGrid
): number {
  return (
    row.sheetRow ??
    (read.marker.page - 1) * questionsPerPage(grid) + row.indexOnPage
  );
}

/** Pages each student's sheet has; a page-map batch counts its maps. */
export const sheetPageCount = (batch: PaperBatch): number =>
  batch.layoutVersion === 2 && batch.pageMaps
    ? batch.pageMaps.length
    : batch.pagesPerSheet;

/** Later scan wins a duplicate; the sheet is flagged if their answers disagree. */
function mergeDuplicate(
  existing: SheetAnswer[],
  incoming: SheetAnswer[]
): { answers: SheetAnswer[]; conflict: boolean } {
  const byQuestion = new Map(existing.map((a) => [a.question, a]));
  let conflict = false;
  for (const answer of incoming) {
    const prior = byQuestion.get(answer.question);
    if (
      prior &&
      prior.choice !== null &&
      answer.choice !== null &&
      prior.choice !== answer.choice
    ) {
      conflict = true;
    }
  }
  return { answers: incoming, conflict };
}

export function assemblePaperScan(
  batch: PaperBatch,
  pages: readonly ScannedPage[]
): AssembleResult {
  const tag = paperBatchTag(batch.id);
  const grid = paperGridOf(batch);
  const byMap = batch.layoutVersion === 2;
  const pageCount = sheetPageCount(batch);
  const unreadablePages: number[] = [];
  const foreignPages: number[] = [];
  const unknownPages: number[] = [];
  const bySeat = new Map<
    number,
    {
      pages: Map<number, SheetAnswer[]>;
      written: Map<number, SheetWritten[]>;
      conflict: boolean;
    }
  >();

  const ordered = [...pages].sort((a, b) => a.scanIndex - b.scanIndex);
  for (const { scanIndex, read } of ordered) {
    if (read.status !== 'ok') {
      unreadablePages.push(scanIndex);
      continue;
    }
    const { marker } = read;
    if (marker.batchTag !== tag) {
      foreignPages.push(scanIndex);
      continue;
    }
    if (seatKind(batch, marker.seat) === null || marker.page > pageCount) {
      unknownPages.push(scanIndex);
      continue;
    }
    const answers: SheetAnswer[] = read.rows.map((row) => ({
      question: sheetRowOf(read, row, grid),
      choice: row.choice,
      ...(row.doubt ? { doubt: row.doubt } : {}),
      fills: row.fills,
      crop: row.crop,
      scanIndex,
    }));
    const written: SheetWritten[] = read.written.map((w) => ({
      questionId: w.questionId,
      label: w.label,
      page: w.page,
      state: w.state,
      inkMm2: w.inkMm2,
      scanIndex,
    }));
    const entry = bySeat.get(marker.seat) ?? {
      pages: new Map<number, SheetAnswer[]>(),
      written: new Map<number, SheetWritten[]>(),
      conflict: false,
    };
    entry.written.set(marker.page, written);
    const prior = entry.pages.get(marker.page);
    if (prior) {
      const merged = mergeDuplicate(prior, answers);
      entry.pages.set(marker.page, merged.answers);
      entry.conflict = entry.conflict || merged.conflict;
    } else {
      entry.pages.set(marker.page, answers);
    }
    bySeat.set(marker.seat, entry);
  }

  const sheets: AssembledSheet[] = [];
  for (const [seat, entry] of bySeat) {
    const kind = seatKind(batch, seat) as SheetKind;
    const pagesSeen = [...entry.pages.keys()].sort((a, b) => a - b);
    const missingPages: number[] = [];
    for (let p = 1; p <= pageCount; p += 1) {
      if (!entry.pages.has(p)) missingPages.push(p);
    }
    const answers = pagesSeen
      .flatMap((p) => entry.pages.get(p) ?? [])
      .sort((a, b) => a.question - b.question);
    const written = pagesSeen.flatMap((p) => entry.written.get(p) ?? []);
    const isBlank =
      answers.every((a) => a.choice === null && !a.doubt) &&
      written.every((w) => w.state === 'blank');
    const flags: SheetFlag[] = [];
    if (missingPages.length > 0) flags.push('missing-page');
    if (answers.some((a) => a.doubt)) flags.push('doubtful-rows');
    if (entry.conflict) flags.push('duplicate-conflict');
    sheets.push({
      seat,
      kind,
      student: batch.seats[seat] ?? null,
      answers,
      ...(byMap ? { written } : {}),
      pagesSeen,
      missingPages,
      isBlank,
      flags,
    });
  }
  sheets.sort((a, b) => a.seat - b.seat);

  return {
    sheets: sheets.filter((s) => s.kind !== 'key'),
    keySheet: sheets.find((s) => s.kind === 'key') ?? null,
    unreadablePages,
    foreignPages,
    unknownPages,
  };
}
