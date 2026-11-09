import { describe, it, expect } from 'vitest';
import type { PaperBatch, PaperImageMarkup, PaperMarkupItem } from '@/types';
import {
  imageMarkupForSave,
  markupItemsEqual,
  moveItem,
  placePoint,
  rectFromCorners,
  resizeItem,
} from '@/components/quiz/paper/markup/markupGeometry';
import {
  EMPTY_HISTORY,
  MAX_MARKUP_UNDO,
  historyCommit,
  historyRedo,
  historyUndo,
} from '@/components/quiz/paper/markup/useMarkupHistory';
import {
  findAnswerBox,
  paperSeatOf,
} from '@/components/quiz/paper/markup/usePaperAnswerBox';

const VIEW = { x: 36, y: 68, w: 144, h: 68 };
const box: PaperMarkupItem = {
  id: 'a',
  kind: 'rect',
  rectMm: { x: 50, y: 80, w: 20, h: 10 },
};

describe('markup geometry', () => {
  it('normalizes a drag in any direction and clamps it to the crop', () => {
    expect(rectFromCorners({ x: 90, y: 95 }, { x: 50, y: 80 }, VIEW)).toEqual({
      x: 50,
      y: 80,
      w: 40,
      h: 15,
    });
    expect(rectFromCorners({ x: 20, y: 60 }, { x: 40, y: 70 }, VIEW)).toEqual({
      x: 36,
      y: 68,
      w: 4,
      h: 2,
    });
  });

  it('keeps stamps and pins wholly inside the crop', () => {
    expect(placePoint({ x: 0, y: 500 }, 'stamp', VIEW)).toEqual({
      x: 39,
      y: 133,
    });
    expect(placePoint({ x: 500, y: 0 }, 'pin', VIEW)).toEqual({
      x: 177.5,
      y: 70.5,
    });
  });

  it('moves an item without leaving the crop', () => {
    expect(moveItem(box, { x: 500, y: -500 }, VIEW)).toMatchObject({
      rectMm: { x: 160, y: 68, w: 20, h: 10 },
    });
  });

  it('resizes from each corner and never below the minimum', () => {
    if (box.kind !== 'rect') throw new Error('rect fixture');
    expect(resizeItem(box, 'nw', { x: 40, y: 70 }, VIEW).rectMm).toEqual({
      x: 40,
      y: 70,
      w: 30,
      h: 20,
    });
    expect(resizeItem(box, 'ne', { x: 10, y: 100 }, VIEW).rectMm).toEqual({
      x: 50,
      y: 88,
      w: 2,
      h: 2,
    });
  });
});

describe('imageMarkupForSave', () => {
  const saved: PaperImageMarkup = {
    scanId: 'old-scan',
    page: 2,
    reviewedForScanId: 'x',
    items: [box],
  };

  it('passes saved markup through untouched when the teacher has not edited it', () => {
    expect(
      imageMarkupForSave({
        editable: true,
        saved,
        items: [box],
        scanId: 'new-scan',
        page: 2,
      })
    ).toBe(saved);
    expect(
      imageMarkupForSave({
        editable: false,
        saved,
        items: [],
        scanId: 'new-scan',
        page: 2,
      })
    ).toBe(saved);
  });

  it('stamps edited markup with the current scan and page', () => {
    const moved = { ...box, rectMm: { x: 60, y: 80, w: 20, h: 10 } };
    expect(
      imageMarkupForSave({
        editable: true,
        saved,
        items: [moved],
        scanId: 'new-scan',
        page: 2,
      })
    ).toEqual({ scanId: 'new-scan', page: 2, items: [moved] });
  });

  it('drops the field when every mark was deleted', () => {
    expect(
      imageMarkupForSave({
        editable: true,
        saved,
        items: [],
        scanId: 's',
        page: 2,
      })
    ).toBeUndefined();
    expect(markupItemsEqual([], undefined)).toBe(true);
  });
});

describe('markup history', () => {
  it('undoes and redoes whole steps and clears redo on a new step', () => {
    const a: PaperMarkupItem[] = [];
    const b = [box];
    let h = historyCommit(EMPTY_HISTORY, a);
    const u = historyUndo(h, b);
    expect(u?.items).toBe(a);
    if (!u) throw new Error('nothing to undo');
    const r = historyRedo(u.history, u.items);
    expect(r?.items).toBe(b);
    if (!r) throw new Error('nothing to redo');
    h = historyCommit(u.history, a);
    expect(h.future).toEqual([]);
    expect(historyUndo(EMPTY_HISTORY, a)).toBeNull();
  });

  it(`keeps at most ${MAX_MARKUP_UNDO} steps`, () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < MAX_MARKUP_UNDO + 20; i++) h = historyCommit(h, []);
    expect(h.past).toHaveLength(MAX_MARKUP_UNDO);
  });
});

describe('answer box lookup', () => {
  const batch = {
    pageMaps: [
      { page: 1, grid: 1, items: [] },
      {
        page: 2,
        grid: 1,
        items: [
          {
            kind: 'written',
            questionId: 'slotQ',
            label: '4',
            headerMm: { x: 0, y: 0, w: 1, h: 1 },
            boxMm: { x: 20, y: 40, w: 170, h: 90 },
            lines: 10,
          },
        ],
      },
    ],
    versions: [
      { label: 'A', servedQuestionIds: [], swaps: {} },
      { label: 'B', servedQuestionIds: [], swaps: { slotQ: 'bankQ' } },
    ],
    seatVersions: { 7: 1 },
  } as unknown as PaperBatch;

  it("finds the box on the seat's own version of the sheet", () => {
    expect(findAnswerBox(batch, 7, 'bankQ')).toEqual({
      page: 2,
      boxMm: { x: 20, y: 40, w: 170, h: 90 },
    });
    expect(findAnswerBox(batch, 3, 'slotQ')?.page).toBe(2);
    expect(findAnswerBox(batch, 3, 'bankQ')).toBeNull();
  });

  it('prefers the written-answers stack on a hybrid response', () => {
    expect(
      paperSeatOf({
        paperWrittenBatchId: 'w',
        paperWrittenSeat: 4,
        paperBatchId: 'p',
        paperSeat: 1,
      })
    ).toEqual({ batchId: 'w', seat: 4 });
    expect(paperSeatOf({ paperBatchId: 'p', paperSeat: 1 })).toEqual({
      batchId: 'p',
      seat: 1,
    });
    expect(paperSeatOf({})).toBeNull();
  });
});
