import { describe, expect, it } from 'vitest';
import type { PaperBatch } from '@/types';
import { assemblePaperScan, type ScannedPage } from './paperImportAssemble';
import { QUESTIONS_PER_PAGE, ROWS_PER_COLUMN } from './paperSheetLayout';
import { paperBatchTag } from './paperSheetMarker';
import type { PageReadResult, RowRead } from './paperSheetReader';

const batch: PaperBatch = {
  id: 'batch-1',
  quizId: 'quiz-1',
  rosterIds: ['r1'],
  questionCount: QUESTIONS_PER_PAGE + 5,
  choiceCount: 4,
  seats: {
    1: { rosterId: 'r1', studentId: 's1' },
    2: { rosterId: 'r1', studentId: 's2' },
  },
  spareSeats: [3],
  keySheetSeat: 4,
  pagesPerSheet: 2,
  createdAt: 0,
};

const row = (
  indexOnPage: number,
  choice: number | null,
  doubt?: RowRead['doubt']
): RowRead => ({
  indexOnPage,
  choice,
  ...(doubt ? { doubt } : {}),
  fills: [],
  crop: { x: 0, y: 0, w: 1, h: 1 },
});

const page = (
  scanIndex: number,
  seat: number,
  pageNo: number,
  rows: RowRead[],
  over: Partial<{ batchTag: number; isKeySheet: boolean }> = {}
): ScannedPage => ({
  scanIndex,
  read: {
    status: 'ok',
    marker: {
      batchTag: paperBatchTag(batch.id),
      seat,
      page: pageNo,
      isKeySheet: seat === batch.keySheetSeat,
      ...over,
    },
    rotated: false,
    rows,
    registrationResidualMm: 0.1,
    pxPerMm: 7.87,
  },
});

const failed = (
  scanIndex: number,
  status: 'no-marker' | 'no-registration'
): ScannedPage => ({
  scanIndex,
  read: { status } as PageReadResult,
});

describe('assemblePaperScan', () => {
  it('joins a seat’s pages into one sheet in question order, whatever order they arrived', () => {
    const result = assemblePaperScan(batch, [
      page(0, 1, 2, [row(0, 3), row(4, 1)]),
      page(1, 1, 1, [row(0, 0), row(49, 2)]),
    ]);
    expect(result.sheets).toHaveLength(1);
    const sheet = result.sheets[0];
    expect(sheet.kind).toBe('student');
    expect(sheet.student).toEqual({ rosterId: 'r1', studentId: 's1' });
    expect(sheet.pagesSeen).toEqual([1, 2]);
    expect(sheet.missingPages).toEqual([]);
    expect(sheet.answers.map((a) => [a.question, a.choice])).toEqual([
      [0, 0],
      [49, 2],
      [QUESTIONS_PER_PAGE, 3],
      [QUESTIONS_PER_PAGE + 4, 1],
    ]);
    expect(sheet.flags).toEqual([]);
  });

  it('flags a missing page and keeps what arrived (Q22)', () => {
    const result = assemblePaperScan(batch, [page(0, 2, 1, [row(0, 1)])]);
    expect(result.sheets[0].missingPages).toEqual([2]);
    expect(result.sheets[0].flags).toContain('missing-page');
    expect(result.sheets[0].answers).toHaveLength(1);
  });

  it('lists a sheet with no ink as blank rather than a zero (Q21)', () => {
    const result = assemblePaperScan(batch, [
      page(0, 2, 1, [row(0, null), row(1, null)]),
      page(1, 2, 2, [row(0, null)]),
    ]);
    expect(result.sheets[0].isBlank).toBe(true);
  });

  it('a doubtful row is ink, so the sheet is not blank and is flagged', () => {
    const result = assemblePaperScan(batch, [
      page(0, 2, 1, [row(0, null, 'multiple')]),
      page(1, 2, 2, []),
    ]);
    expect(result.sheets[0].isBlank).toBe(false);
    expect(result.sheets[0].flags).toEqual(['doubtful-rows']);
  });

  it('separates the key sheet and labels spares', () => {
    const result = assemblePaperScan(batch, [
      page(0, 4, 1, [row(0, 2)]),
      page(1, 4, 2, []),
      page(2, 3, 1, [row(0, 1)]),
      page(3, 3, 2, []),
    ]);
    expect(result.keySheet?.seat).toBe(4);
    expect(result.keySheet?.kind).toBe('key');
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]).toMatchObject({
      seat: 3,
      kind: 'spare',
      student: null,
    });
  });

  it('lets a rescanned page replace the earlier read, flagging disagreement (Q23)', () => {
    const agree = assemblePaperScan(batch, [
      page(0, 1, 1, [row(0, 1), row(1, null, 'unclear')]),
      page(5, 1, 1, [row(0, 1), row(1, 2)]),
      page(6, 1, 2, []),
    ]);
    expect(agree.sheets[0].answers.map((a) => a.choice)).toEqual([1, 2]);
    expect(agree.sheets[0].flags).toEqual([]);

    const disagree = assemblePaperScan(batch, [
      page(5, 1, 1, [row(0, 3)]),
      page(0, 1, 1, [row(0, 1)]),
      page(6, 1, 2, []),
    ]);
    expect(disagree.sheets[0].answers[0].choice).toBe(3);
    expect(disagree.sheets[0].answers[0].scanIndex).toBe(5);
    expect(disagree.sheets[0].flags).toEqual(['duplicate-conflict']);
  });

  it('sets aside unreadable, foreign and unprinted pages by scan position', () => {
    const result = assemblePaperScan(batch, [
      failed(0, 'no-registration'),
      failed(1, 'no-marker'),
      page(2, 1, 1, [], { batchTag: paperBatchTag('other-batch') }),
      page(3, 9, 1, []),
      page(4, 1, 3, []),
      page(5, 1, 1, []),
    ]);
    expect(result.unreadablePages).toEqual([0, 1]);
    expect(result.foreignPages).toEqual([2]);
    expect(result.unknownPages).toEqual([3, 4]);
    expect(result.sheets.map((s) => s.seat)).toEqual([1]);
  });

  it('orders sheets by seat', () => {
    const result = assemblePaperScan(batch, [
      page(0, 2, 1, []),
      page(1, 1, 1, []),
    ]);
    expect(result.sheets.map((s) => s.seat)).toEqual([1, 2]);
  });
});

describe('assemblePaperScan on a single-column batch', () => {
  const narrow: PaperBatch = {
    ...batch,
    questionCount: 40,
    columnsPerPage: 1,
    pagesPerSheet: 2,
  };

  it('numbers page two from the 25 rows page one carried', () => {
    const result = assemblePaperScan(narrow, [
      page(0, 1, 1, [row(0, 2), row(24, 1)]),
      page(1, 1, 2, [row(0, 3), row(14, 0)]),
    ]);
    expect(result.sheets[0].answers.map((a) => [a.question, a.choice])).toEqual(
      [
        [0, 2],
        [24, 1],
        [ROWS_PER_COLUMN, 3],
        [ROWS_PER_COLUMN + 14, 0],
      ]
    );
  });

  it('leaves a batch without the field on the two-column numbering', () => {
    const result = assemblePaperScan(batch, [page(0, 1, 2, [row(0, 3)])]);
    expect(result.sheets[0].answers[0].question).toBe(QUESTIONS_PER_PAGE);
  });
});
