import { describe, expect, it } from 'vitest';
import type { PaperBatch } from '@/types';
import {
  assemblePaperScan,
  sheetRowOf,
  type ScannedPage,
} from './paperImportAssemble';
import { QUESTIONS_PER_PAGE, ROWS_PER_COLUMN } from './paperSheetLayout';
import { paperBatchTag } from './paperSheetMarker';
import type {
  PageReadResult,
  RowRead,
  WrittenBoxRead,
} from './paperSheetReader';

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
    written: [],
    mmToPx: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
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

describe('assemblePaperScan on a page-map batch (layoutVersion 2)', () => {
  const v2: PaperBatch = {
    ...batch,
    id: 'batch-v2',
    questionCount: 3,
    pagesPerSheet: 2,
    layoutVersion: 2,
    pageMaps: [
      {
        page: 1,
        grid: 2,
        items: [
          {
            kind: 'mc',
            questionId: 'q1',
            sheetRow: 0,
            label: '1',
            originMm: { x: 24, y: 58 },
          },
          {
            kind: 'written',
            questionId: 'q2',
            label: '2',
            headerMm: { x: 24, y: 66, w: 154, h: 13 },
            boxMm: { x: 38, y: 79, w: 140, h: 48 },
            lines: 6,
          },
        ],
      },
      {
        page: 2,
        grid: 2,
        items: [
          {
            kind: 'mc',
            questionId: 'q3',
            sheetRow: 1,
            label: '3',
            originMm: { x: 24, y: 58 },
          },
          {
            kind: 'mc',
            questionId: 'q4',
            sheetRow: 2,
            label: '4',
            originMm: { x: 24, y: 66 },
          },
        ],
      },
    ],
  };
  const box = (
    questionId: string,
    state: WrittenBoxRead['state'],
    pageNo = 1
  ): WrittenBoxRead => ({
    questionId,
    label: questionId.slice(1),
    page: pageNo,
    boxMm: { x: 38, y: 79, w: 140, h: 48 },
    state,
    inkMm2: state === 'ink' ? 40 : 0,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  });
  const v2Page = (
    scanIndex: number,
    seat: number,
    pageNo: number,
    rows: RowRead[],
    written: WrittenBoxRead[]
  ): ScannedPage => ({
    scanIndex,
    read: {
      status: 'ok',
      marker: {
        batchTag: paperBatchTag(v2.id),
        seat,
        page: pageNo,
        isKeySheet: seat === v2.keySheetSeat,
        readByMap: true,
      },
      rotated: false,
      rows,
      written,
      mmToPx: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      registrationResidualMm: 0.1,
      pxPerMm: 7.87,
    },
  });
  const mapRow = (
    indexOnPage: number,
    sheetRow: number,
    choice: number | null
  ): RowRead => ({ ...row(indexOnPage, choice), sheetRow });

  it('numbers answers by the map’s sheet row and carries the written boxes', () => {
    const result = assemblePaperScan(v2, [
      v2Page(0, 1, 2, [mapRow(0, 1, 2), mapRow(1, 2, null)], []),
      v2Page(1, 1, 1, [mapRow(0, 0, 1)], [box('q2', 'ink')]),
    ]);
    const [sheet] = result.sheets;
    expect(sheet.answers.map((a) => [a.question, a.choice])).toEqual([
      [0, 1],
      [1, 2],
      [2, null],
    ]);
    expect(sheet.written).toEqual([
      {
        questionId: 'q2',
        label: '2',
        page: 1,
        state: 'ink',
        inkMm2: 40,
        scanIndex: 1,
      },
    ]);
    expect(sheet.missingPages).toEqual([]);
  });

  it('does not skip a student who only wrote', () => {
    const result = assemblePaperScan(v2, [
      v2Page(0, 1, 1, [mapRow(0, 0, null)], [box('q2', 'ink')]),
      v2Page(1, 1, 2, [mapRow(0, 1, null), mapRow(1, 2, null)], []),
    ]);
    expect(result.sheets[0].isBlank).toBe(false);
  });

  it('still calls a sheet blank when every box is blank and no bubble is marked', () => {
    const result = assemblePaperScan(v2, [
      v2Page(0, 1, 1, [mapRow(0, 0, null)], [box('q2', 'blank')]),
      v2Page(1, 1, 2, [mapRow(0, 1, null), mapRow(1, 2, null)], []),
    ]);
    expect(result.sheets[0].isBlank).toBe(true);
    expect(result.sheets[0].written?.[0].state).toBe('blank');
  });

  it('counts expected pages from the maps and leaves a missing page’s boxes out', () => {
    const result = assemblePaperScan({ ...v2, pagesPerSheet: 1 }, [
      v2Page(0, 1, 2, [mapRow(0, 1, 0), mapRow(1, 2, 0)], []),
    ]);
    expect(result.unknownPages).toEqual([]);
    expect(result.sheets[0].missingPages).toEqual([1]);
    expect(result.sheets[0].written).toEqual([]);
  });

  it('lists a page the reader could not read without its map as unreadable', () => {
    const result = assemblePaperScan(v2, [
      { scanIndex: 0, read: { status: 'needs-map' } },
    ]);
    expect(result.unreadablePages).toEqual([0]);
  });

  it('adds no written list to an older batch', () => {
    const result = assemblePaperScan(batch, [page(0, 1, 1, [row(0, 1)])]);
    expect(result.sheets[0]).not.toHaveProperty('written');
  });

  it('sheetRowOf prefers the map’s row and falls back to page arithmetic', () => {
    const read = {
      marker: { batchTag: 0, seat: 1, page: 2, isKeySheet: false },
    };
    expect(sheetRowOf(read, { indexOnPage: 3, sheetRow: 7 }, 2)).toBe(7);
    expect(sheetRowOf(read, { indexOnPage: 3 }, 2)).toBe(
      QUESTIONS_PER_PAGE + 3
    );
  });
});
