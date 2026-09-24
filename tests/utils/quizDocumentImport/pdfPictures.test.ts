/**
 * Pictures found from pdf.js's operator list (QUIZ_IMPORT_RELIABILITY.md PR 4).
 * The fixture is a real two-page PDF recorded with pdfjs-dist.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  dropRepeatedEdgePictures,
  imageBoxesFromOperatorList,
  mergeBoxes,
  picturesOnPage,
  placePictureLines,
  resolvePictureIds,
  sharePicturesAcrossRanges,
  usedPictureBoxes,
  type PageBox,
  type PdfOperatorListLike,
  type PositionedLine,
} from '@/utils/quizDocumentImport/pdfPictures';
import {
  cropPdfFigures,
  figureKey,
  type FigureBox,
  type PdfCropperDeps,
} from '@/utils/quizDocumentImport/pdfFigures';
import { parseQuestionLines } from '@/utils/quizDocumentImport/parseQuestions';
import { extractedToQuizData } from '@/utils/quizDocumentImport/toQuizData';
import { attachDocumentImages } from '@/utils/quizDocumentImport/attachImages';
import type { DocLine } from '@/utils/quizDocumentImport/types';
import recorded from './fixtures/pdfPicturesOperatorList.json';

const { ops } = recorded;
const W = 612;
const H = 792;
const viewport = { width: W, height: H, transform: [1, 0, 0, -1, 0, H] };

/** A picture drawn at (x, y) in PDF points, w × h, as a page fraction box. */
const pdfBox = (x: number, y: number, w: number, h: number): PageBox => ({
  x: x / W,
  y: (H - y - h) / H,
  width: w / W,
  height: h / H,
});

const close = (actual: PageBox, expected: PageBox) => {
  expect(actual.x).toBeCloseTo(expected.x, 4);
  expect(actual.y).toBeCloseTo(expected.y, 4);
  expect(actual.width).toBeCloseTo(expected.width, 4);
  expect(actual.height).toBeCloseTo(expected.height, 4);
};

const list = (...entries: Array<[number, unknown[] | null]>) => ({
  fnArray: entries.map(([fn]) => fn),
  argsArray: entries.map(([, args]) => args),
});

describe('imageBoxesFromOperatorList', () => {
  it('finds every image draw in a recorded operator list', () => {
    const page = recorded.pages[0];
    const boxes = imageBoxesFromOperatorList(
      page.operatorList as PdfOperatorListLike,
      ops,
      page.viewport
    );
    expect(boxes).toHaveLength(3);
    close(boxes[0], pdfBox(36, 740, 40, 40));
    close(boxes[1], pdfBox(108, 520, 200, 150));
    close(boxes[2], pdfBox(108, 180, 240, 150));
  });

  it('restores the transform after a save/restore pair', () => {
    const boxes = imageBoxesFromOperatorList(
      list(
        [ops.save, null],
        [ops.transform, [100, 0, 0, 100, 50, 50]],
        [ops.restore, null],
        [ops.transform, [60, 0, 0, 30, 200, 300]],
        [ops.paintImageXObject, ['img', 1, 1]]
      ),
      ops,
      viewport
    );
    expect(boxes).toHaveLength(1);
    close(boxes[0], pdfBox(200, 300, 60, 30));
  });

  it('applies a form XObject matrix until the form ends', () => {
    const boxes = imageBoxesFromOperatorList(
      list(
        [
          ops.paintFormXObjectBegin,
          [
            [2, 0, 0, 2, 100, 100],
            [0, 0, 50, 50],
          ],
        ],
        [ops.transform, [50, 0, 0, 25, 0, 0]],
        [ops.paintImageXObject, ['img', 1, 1]],
        [ops.paintFormXObjectEnd, null],
        [ops.transform, [10, 0, 0, 10, 0, 0]],
        [ops.paintImageXObject, ['img', 1, 1]]
      ),
      ops,
      viewport
    );
    close(boxes[0], pdfBox(100, 100, 100, 50));
    close(boxes[1], pdfBox(0, 0, 10, 10));
  });

  it('reads repeated and grouped draws one box per tile', () => {
    const boxes = imageBoxesFromOperatorList(
      list(
        [ops.paintImageXObjectRepeat, ['img', 20, 10, [0, 0, 100, 200]]],
        [
          ops.paintInlineImageXObjectGroup,
          [{}, [{ transform: [30, 0, 0, 30, 300, 300] }]],
        ],
        [
          ops.paintImageMaskXObjectGroup,
          [[{ transform: [5, 0, 0, 5, 400, 400] }]],
        ]
      ),
      ops,
      viewport
    );
    expect(boxes).toHaveLength(4);
    close(boxes[0], pdfBox(0, 0, 20, 10));
    close(boxes[1], pdfBox(100, 200, 20, 10));
    close(boxes[2], pdfBox(300, 300, 30, 30));
    close(boxes[3], pdfBox(400, 400, 5, 5));
  });

  it('follows a rotated page through the viewport transform', () => {
    // A page turned 90°: PDF x runs down the viewport, PDF y runs across.
    const rotated = { width: H, height: W, transform: [0, 1, 1, 0, 0, 0] };
    const [box] = imageBoxesFromOperatorList(
      list(
        [ops.transform, [100, 0, 0, 50, 10, 20]],
        [ops.paintImageXObject, ['img', 1, 1]]
      ),
      ops,
      rotated
    );
    close(box, { x: 20 / H, y: 10 / W, width: 50 / H, height: 100 / W });
  });
});

describe('picturesOnPage', () => {
  it('merges the tiles of one picture and drops glyph-sized pieces', () => {
    const pictures = picturesOnPage(
      list(
        [ops.save, null],
        [ops.transform, [300, 0, 0, 20, 100, 400]],
        [ops.paintImageXObject, ['strip', 1, 1]],
        [ops.restore, null],
        [ops.save, null],
        [ops.transform, [300, 0, 0, 20, 100, 420]],
        [ops.paintImageXObject, ['strip', 1, 1]],
        [ops.restore, null],
        [ops.transform, [6, 0, 0, 6, 100, 100]],
        [ops.paintImageMaskXObject, [{}]]
      ),
      ops,
      viewport
    );
    expect(pictures).toHaveLength(1);
    close(pictures[0], pdfBox(100, 400, 300, 40));
  });

  it('skips a page-sized image, which is a scan or a background', () => {
    const pictures = picturesOnPage(
      list(
        [ops.transform, [W, 0, 0, H, 0, 0]],
        [ops.paintImageXObject, ['scan', 1, 1]]
      ),
      ops,
      viewport
    );
    expect(pictures).toEqual([]);
  });

  it('grows a picture to take in a label drawn over its edge', () => {
    const [picture] = picturesOnPage(
      list(
        [ops.transform, [200, 0, 0, 100, 100, 400]],
        [ops.paintImageXObject, ['img', 1, 1]]
      ),
      ops,
      viewport,
      [
        // Centred inside the picture but running past its right edge.
        {
          str: 'Mitochondrion',
          transform: [12, 0, 0, 12, 250, 450],
          width: 90,
          height: 12,
        },
        // Outside the picture: an answer choice under it stays out.
        {
          str: 'a. nucleus',
          transform: [12, 0, 0, 12, 100, 380],
          width: 60,
          height: 12,
        },
      ]
    );
    expect(picture.x).toBeCloseTo(100 / W, 4);
    expect(picture.x + picture.width).toBeCloseTo(340 / W, 4);
    expect(picture.y + picture.height).toBeCloseTo((H - 400) / H, 4);
  });
});

describe('dropRepeatedEdgePictures', () => {
  it('drops the logo repeated in the header of both recorded pages', () => {
    const byPage = recorded.pages.map((page) =>
      picturesOnPage(
        page.operatorList as PdfOperatorListLike,
        ops,
        page.viewport,
        page.textItems
      )
    );
    expect(byPage[0]).toHaveLength(3);
    const kept = dropRepeatedEdgePictures(byPage);
    expect(kept[0]).toHaveLength(2);
    expect(kept[1]).toEqual([]);
  });

  it('keeps a picture that appears once near the edge', () => {
    const logo = pdfBox(36, 740, 40, 40);
    expect(dropRepeatedEdgePictures([[logo], []])).toEqual([[logo], []]);
  });
});

describe('mergeBoxes', () => {
  it('leaves apart pictures that are well separated', () => {
    const a = pdfBox(100, 500, 100, 100);
    const b = pdfBox(100, 100, 100, 100);
    expect(mergeBoxes([a, b])).toEqual([a, b]);
  });
});

/** The recorded pages as reading-order lines with their tops, like the PDF reader groups them. */
function positionedLines(pageIndex: number): PositionedLine[] {
  const page = recorded.pages[pageIndex];
  const rows = new Map<number, { x: number; str: string }[]>();
  for (const item of page.textItems) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    rows.set(y, [
      ...(rows.get(y) ?? []),
      { x: item.transform[4], str: item.str },
    ]);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => b - a)
    .map(([y, parts]) => ({
      line: {
        text: parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.str)
          .join(''),
        page: pageIndex + 1,
      },
      top: (H - y - 10) / H,
    }));
}

function readRecorded(): { lines: DocLine[]; boxes: FigureBox[] } {
  const byPage = dropRepeatedEdgePictures(
    recorded.pages.map((page) =>
      picturesOnPage(
        page.operatorList as PdfOperatorListLike,
        ops,
        page.viewport,
        page.textItems
      )
    )
  );
  const lines = byPage.flatMap((pictures, index) =>
    placePictureLines(index + 1, positionedLines(index), pictures)
  );
  const boxes = byPage.flatMap((pictures, index) =>
    pictures.map((box) => ({ page: index + 1, ...box }))
  );
  return { lines: sharePicturesAcrossRanges(lines), boxes };
}

describe('anchoring pictures to questions', () => {
  it('puts a picture after the last line above it', () => {
    const [first] = recorded.pages;
    const pictures = picturesOnPage(
      first.operatorList as PdfOperatorListLike,
      ops,
      first.viewport,
      first.textItems
    );
    const placed = placePictureLines(1, positionedLines(0), pictures);
    const texts = placed.map(
      (l) => l.text || `[${l.imageIds?.length} picture]`
    );
    expect(texts.slice(0, 3)).toEqual([
      '[1 picture]',
      '1. Which part of the cell is labeled X?',
      '[1 picture]',
    ]);
  });

  it('ignores a line in another column when placing a picture', () => {
    const lines: PositionedLine[] = [
      { line: { text: '1. Left column' }, top: 0.1, left: 0.05, right: 0.45 },
      { line: { text: '2. Right column' }, top: 0.3, left: 0.55, right: 0.95 },
    ];
    const placed = placePictureLines(1, lines, [
      { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
    ]);
    expect(placed.map((l) => l.text)).toEqual([
      '1. Left column',
      '',
      '2. Right column',
    ]);
  });

  it('attaches each picture to the question it sits in', () => {
    const { lines } = readRecorded();
    const questions = parseQuestionLines(lines);
    expect(questions.map((q) => q.number)).toEqual([1, 2, 3, 4]);
    expect(questions[0].imageIds).toHaveLength(1);
    expect(questions[1].imageIds).toEqual([]);
  });

  it('links a picture for "questions 3 and 4" to both, not the one it follows', () => {
    const { lines } = readRecorded();
    const questions = parseQuestionLines(lines);
    expect(questions[2].imageIds).toHaveLength(1);
    expect(questions[3].imageIds).toEqual(questions[2].imageIds);
    expect(questions[2].imageIds).not.toEqual(questions[0].imageIds);
  });

  it('keeps a picture in the question whose own stem names the range', () => {
    const lines = sharePicturesAcrossRanges([
      { text: '3. Use the map for questions 3–4. Which city is north?' },
      { text: '', imageIds: ['map'] },
      { text: 'a. Duluth' },
      { text: '4. Which city is south?' },
      { text: 'a. Rochester' },
    ]);
    const questions = parseQuestionLines(lines);
    expect(questions.map((q) => q.imageIds)).toEqual([['map'], ['map']]);
  });

  it('leaves a picture where it is when no question in the range follows', () => {
    const lines = sharePicturesAcrossRanges([
      { text: '1. See questions 7 and 8 later.' },
      { text: '', imageIds: ['pic'] },
      { text: '2. Next question' },
    ]);
    expect(parseQuestionLines(lines)[0].imageIds).toEqual(['pic']);
  });
});

describe('cropping and linking the pictures questions use', () => {
  const fakeCropper = (): PdfCropperDeps => ({
    pageCount: 2,
    pageSize: vi.fn(() => Promise.resolve({ width: 1275, height: 1650 })),
    crop: vi.fn(() =>
      Promise.resolve(new Blob(['PNG'], { type: 'image/png' }))
    ),
  });

  it('crops a shared picture once and links it to both questions (D14)', async () => {
    const { lines, boxes } = readRecorded();
    const questions = parseQuestionLines(lines);
    const used = usedPictureBoxes(boxes, questions);
    expect(used).toHaveLength(2);

    const deps = fakeCropper();
    const cropped = await cropPdfFigures(used, deps);
    expect(deps.crop).toHaveBeenCalledTimes(2);

    const resolved = resolvePictureIds(questions, cropped.idByBox);
    expect(resolved[2].imageIds).toEqual(['pdf-figure-2']);
    expect(resolved[3].imageIds).toEqual(['pdf-figure-2']);
    expect(resolved[0].imageIds).toEqual(['pdf-figure-1']);

    const upload = vi.fn(() =>
      Promise.resolve({ driveFileId: 'drive-1', url: 'https://x' })
    );
    const quiz = await attachDocumentImages(
      extractedToQuizData({
        title: 'Cells',
        questions: resolved,
        images: cropped.images,
        warnings: [],
      }),
      cropped.images,
      { upload, remove: vi.fn(() => Promise.resolve()) }
    );
    expect(upload).toHaveBeenCalledTimes(2);
    expect(quiz.stimuli).toHaveLength(2);
    expect(quiz.questions[2].stimulusIds).toEqual(
      quiz.questions[3].stimulusIds
    );
  });

  it('drops a picture that could not be cropped rather than leaving a dangling id', () => {
    const box: FigureBox = { page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
    const [q] = resolvePictureIds(
      [{ imageIds: [figureKey(box), figureKey({ ...box, y: 0.5 })] }],
      new Map([[figureKey(box), 'pdf-figure-1']])
    );
    expect(q.imageIds).toEqual(['pdf-figure-1']);
  });
});
