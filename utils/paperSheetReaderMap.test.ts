import { describe, expect, it } from 'vitest';
import type { PaperBoxSize, PaperPageMap } from '@/types';
import {
  paintSyntheticSheet,
  type SyntheticMark,
  type SyntheticSheetOptions,
  type SyntheticWriting,
} from '@/tests/testHelpers/paperSheetRaster';
import { planPaperPages, type PaperSheetEntry } from './paperPageMap';
import { type PaperGrid } from './paperSheetLayout';
import { paperBatchTag } from './paperSheetMarker';
import {
  cropWrittenBox,
  readPaperPage,
  type PageRead,
  type PageReadResult,
} from './paperSheetReader';

const TAG = paperBatchTag('batch-v2');

const ok = (result: PageReadResult): PageRead => {
  if (result.status !== 'ok') throw new Error(`read failed: ${result.status}`);
  return result;
};

const mc = (n: number): PaperSheetEntry => ({
  kind: 'mc',
  questionId: `q${n}`,
  label: String(n),
});
const written = (n: number, size: PaperBoxSize = 'M'): PaperSheetEntry => ({
  kind: 'written',
  questionId: `q${n}`,
  label: String(n),
  size,
});

const plan = (entries: PaperSheetEntry[], grid: PaperGrid): PaperPageMap[] => {
  const result = planPaperPages({ entries, grid, stems: true });
  if (!result.ok) throw new Error('plan refused');
  return result.pageMaps;
};

const paint = (map: PaperPageMap, over: Partial<SyntheticSheetOptions> = {}) =>
  paintSyntheticSheet({
    marker: {
      batchTag: TAG,
      seat: 3,
      page: map.page,
      isKeySheet: false,
      readByMap: true,
    },
    questionCount: 0,
    choiceCount: 4,
    pageMap: map,
    ...over,
  });

const read = (
  maps: PaperPageMap[],
  page: ReturnType<typeof paint>,
  grid: PaperGrid
): PageRead =>
  ok(
    readPaperPage(page, {
      questionCount: 0,
      choiceCount: 4,
      columnsPerPage: grid,
      pageMaps: maps,
    })
  );

const MIXED = [
  mc(1),
  mc(2),
  mc(3),
  written(4),
  mc(5),
  mc(6),
  mc(7),
  mc(8),
  written(9, 'S'),
];

describe('readPaperPage on a page-map sheet', () => {
  it.each<PaperGrid>([2, 'questions', 1])(
    'reads a mixed page back exactly on a %s grid',
    (grid) => {
      const maps = plan(MIXED, grid);
      const map = maps[0];
      const mcCount = map.items.filter((i) => i.kind === 'mc').length;
      const marks: SyntheticMark[] = Array.from(
        { length: mcCount },
        (_, row) => ({ row, choice: row % 4 })
      );
      const writing: SyntheticWriting[] = [{ questionId: 'q4' }];
      const result = read(
        maps,
        paint(map, {
          marks,
          writing,
          printedLetters: true,
          ...(grid === 1
            ? { stimuli: [{ heightFraction: 0.6, tone: 0x70 }] }
            : {}),
        }),
        grid
      );
      expect(result.rows.map((r) => r.choice)).toEqual(
        marks.map((m) => m.choice)
      );
      expect(result.rows.map((r) => r.sheetRow)).toEqual(
        marks.map((_, i) => i)
      );
      const states = Object.fromEntries(
        result.written.map((w) => [w.questionId, w.state])
      );
      expect(states.q4).toBe('ink');
      if ('q9' in states) expect(states.q9).toBe('blank');
      expect(result.written.every((w) => w.page === map.page)).toBe(true);
    }
  );

  it('reads every page of a multi-page plan by its own map', () => {
    const entries = [
      ...Array.from({ length: 12 }, (_, i) => mc(i + 1)),
      written(13, 'full'),
      mc(14),
    ];
    const maps = plan(entries, 2);
    expect(maps.length).toBe(3);
    const last = maps[2];
    const result = read(
      maps,
      paint(last, { marks: [{ row: 0, choice: 3 }] }),
      2
    );
    expect(result.marker.page).toBe(3);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ sheetRow: 12, choice: 3 });
    expect(result.written).toEqual([]);
  });

  it('keeps bubble reads right beside a box full of heavy writing', () => {
    const maps = plan([mc(1), mc(2), written(3, 'L'), mc(4)], 2);
    const map = maps[0];
    const heavy: SyntheticWriting = {
      questionId: 'q3',
      density: 1,
      tone: 10,
      strokes: [{ x: 1, y: 1, w: 138, h: 94 }],
    };
    const result = read(
      maps,
      paint(map, {
        writing: [heavy],
        printedLetters: true,
        marks: [
          { row: 0, choice: 2 },
          { row: 2, choice: 1 },
        ],
      }),
      2
    );
    expect(result.rows.map((r) => r.choice)).toEqual([2, null, 1]);
    expect(result.rows.every((r) => !r.doubt)).toBe(true);
    expect(result.written[0].state).toBe('ink');
  });

  it('reads a skewed, upside-down page the same as a straight one', () => {
    const maps = plan(MIXED, 2);
    const opts = {
      marks: [
        { row: 0, choice: 1 },
        { row: 5, choice: 3 },
      ],
      writing: [{ questionId: 'q4' }],
    };
    const straight = read(maps, paint(maps[0], opts), 2);
    const turned = read(
      maps,
      paint(maps[0], { ...opts, rotated: true, skewDeg: 1.2 }),
      2
    );
    expect(turned.rotated).toBe(true);
    expect(turned.rows.map((r) => r.choice)).toEqual(
      straight.rows.map((r) => r.choice)
    );
    expect(turned.written.map((w) => w.state)).toEqual(
      straight.written.map((w) => w.state)
    );
  });

  it('refuses a flagged page it was given no map for', () => {
    const maps = plan(MIXED, 2);
    expect(
      readPaperPage(paint(maps[0]), { questionCount: 7, choiceCount: 4 })
    ).toEqual({ status: 'needs-map' });
  });

  it('never reads the boxes on the answer key sheet', () => {
    const maps = plan(MIXED, 2);
    const result = read(
      maps,
      paint(maps[0], {
        marker: {
          batchTag: TAG,
          seat: 9,
          page: 1,
          isKeySheet: true,
          readByMap: true,
        },
        writing: [{ questionId: 'q4' }],
      }),
      2
    );
    expect(result.written).toEqual([]);
    expect(result.rows).toHaveLength(7);
  });
});

describe('the written ink check', () => {
  const maps = plan([mc(1), written(2, 'M')], 2);
  const stateOf = (over: Partial<SyntheticSheetOptions>) =>
    read(maps, paint(maps[0], over), 2).written[0];

  it('reads an empty ruled box as blank', () => {
    expect(stateOf({}).state).toBe('blank');
  });

  it('masks rule lines even when the copier prints them dark', () => {
    expect(stateOf({ ruleGrey: 0x30 }).state).toBe('blank');
    expect(stateOf({ ruleGrey: 0x30, skewDeg: 0.8 }).state).toBe('blank');
  });

  it('ignores scanner speckle', () => {
    expect(stateOf({ noise: 0.002, seed: 7 }).state).toBe('blank');
  });

  it('finds light pencil', () => {
    const pencil = stateOf({
      writing: [{ questionId: 'q2', tone: 0xa8, density: 0.4 }],
    });
    expect(pencil.state).toBe('ink');
  });

  it('finds a single short digit', () => {
    const digit = stateOf({
      writing: [
        {
          questionId: 'q2',
          density: 1,
          strokes: [{ x: 6, y: 1.5, w: 0.6, h: 5 }],
        },
      ],
    });
    expect(digit.state).toBe('ink');
  });
});

describe('cropWrittenBox', () => {
  const maps = plan([mc(1), written(2, 'M')], 2);
  const corner: SyntheticWriting = {
    questionId: 'q2',
    density: 1,
    tone: 10,
    strokes: [{ x: 2, y: 1, w: 10, h: 5 }],
  };
  const scale = 150 / 25.4;
  const mean = (
    crop: ReturnType<typeof cropWrittenBox>,
    xMm: number,
    yMm: number,
    wMm: number,
    hMm: number
  ): number => {
    let sum = 0;
    let n = 0;
    // Crop coordinates include the 2 mm margin.
    for (
      let y = Math.ceil((yMm + 2) * scale);
      y < (yMm + hMm + 2) * scale;
      y += 1
    ) {
      for (
        let x = Math.ceil((xMm + 2) * scale);
        x < (xMm + wMm + 2) * scale;
        x += 1
      ) {
        sum += crop.data[y * crop.width + x];
        n += 1;
      }
    }
    return sum / n;
  };

  it.each([
    { name: 'straight', over: {} },
    { name: 'skewed and upside down', over: { rotated: true, skewDeg: -1.5 } },
    {
      name: 'offset and rescaled',
      over: { pxPerMm: 6.2, offsetPx: { x: 30, y: -20 } },
    },
  ])('cuts an upright crop from a $name scan', ({ over }) => {
    const page = paint(maps[0], { writing: [corner], ...over });
    const result = read(maps, page, 2);
    const box = result.written[0];
    const crop = cropWrittenBox(page, result.mmToPx, box.boxMm);
    expect(crop.width).toBe(Math.round((box.boxMm.w + 4) * scale));
    expect(crop.height).toBe(Math.round((box.boxMm.h + 4) * scale));
    // The writing sits at the box's top-left, never mirrored to another corner.
    expect(mean(crop, 3, 2, 8, 3)).toBeLessThan(60);
    expect(mean(crop, box.boxMm.w - 12, 2, 8, 3)).toBeGreaterThan(200);
    expect(mean(crop, 3, box.boxMm.h - 6, 8, 3)).toBeGreaterThan(200);
  });
});
