/**
 * Reassembles the pages of one scanned stack into per-seat sheets (plan Q12,
 * Q21, Q22, Q23). Pure: pages arrive in any order, from any number of scans.
 */

import type { PaperBatch, PaperSeatAssignment } from '@/types';
import { questionsPerPage } from './paperSheetLayout';
import { paperBatchTag } from './paperSheetMarker';
import type { PageReadResult, RowDoubt, RowRead } from './paperSheetReader';

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

export type SheetKind = 'student' | 'spare' | 'key';

export type SheetFlag = 'missing-page' | 'doubtful-rows' | 'duplicate-conflict';

export interface AssembledSheet {
  seat: number;
  kind: SheetKind;
  student: PaperSeatAssignment | null;
  /** One entry per question; questions on a missing page are absent. */
  answers: SheetAnswer[];
  pagesSeen: number[];
  missingPages: number[];
  /** No ink on any row that arrived — listed as unused, never graded (Q21). */
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
  const perPage = questionsPerPage(batch.columnsPerPage);
  const unreadablePages: number[] = [];
  const foreignPages: number[] = [];
  const unknownPages: number[] = [];
  const bySeat = new Map<
    number,
    { pages: Map<number, SheetAnswer[]>; conflict: boolean }
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
    if (
      seatKind(batch, marker.seat) === null ||
      marker.page > batch.pagesPerSheet
    ) {
      unknownPages.push(scanIndex);
      continue;
    }
    const answers: SheetAnswer[] = read.rows.map((row) => ({
      question: (marker.page - 1) * perPage + row.indexOnPage,
      choice: row.choice,
      ...(row.doubt ? { doubt: row.doubt } : {}),
      fills: row.fills,
      crop: row.crop,
      scanIndex,
    }));
    const entry = bySeat.get(marker.seat) ?? {
      pages: new Map<number, SheetAnswer[]>(),
      conflict: false,
    };
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
    for (let p = 1; p <= batch.pagesPerSheet; p += 1) {
      if (!entry.pages.has(p)) missingPages.push(p);
    }
    const answers = pagesSeen
      .flatMap((p) => entry.pages.get(p) ?? [])
      .sort((a, b) => a.question - b.question);
    const isBlank = answers.every((a) => a.choice === null && !a.doubt);
    const flags: SheetFlag[] = [];
    if (missingPages.length > 0) flags.push('missing-page');
    if (answers.some((a) => a.doubt)) flags.push('doubtful-rows');
    if (entry.conflict) flags.push('duplicate-conflict');
    sheets.push({
      seat,
      kind,
      student: batch.seats[seat] ?? null,
      answers,
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
