import { describe, expect, it } from 'vitest';
import {
  parseDocument,
  sliceByChoice,
} from '@/utils/quizDocumentImport/parseQuestions';
import { boxFromKey } from '@/utils/quizDocumentImport/pdfFigures';
import { resolveChoicePictures } from '@/utils/quizDocumentImport/pdfPictures';
import { toQuizQuestion } from '@/utils/quizDocumentImport/toQuizData';
import { attachDocumentImages } from '@/utils/quizDocumentImport/attachImages';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const line = (
  text: string,
  top: number,
  left: number,
  inlineBoxes?: DocLine['inlineBoxes']
): DocLine => ({
  text,
  page: 1,
  y: 800 - top * 800,
  top,
  segments: [{ text, x: left * 600, left }],
  ...(inlineBoxes
    ? {
        inlineBoxes,
        inlineImage: {
          top: Math.min(...inlineBoxes.map((b) => b.y)),
          bottom: Math.max(...inlineBoxes.map((b) => b.y + b.height)),
        },
      }
    : {}),
});

const pic = (x: number, y: number) => ({ x, y, width: 0.1, height: 0.02 });

const stacked = (): DocLine[] => [
  line('1. Which is the graph of y = x squared?', 0.1, 0.05),
  line('A.', 0.15, 0.08, [pic(0.12, 0.135)]),
  line('B.', 0.2, 0.08, [pic(0.12, 0.185)]),
  line('C.', 0.25, 0.08, [pic(0.12, 0.235)]),
  line('D.', 0.3, 0.08, [pic(0.12, 0.285)]),
  line('2. What is 2 + 2?', 0.4, 0.05),
  line('A. 3', 0.45, 0.08),
  line('B. 4', 0.5, 0.08),
];

describe('choices printed only as pictures', () => {
  it('crops each choice on its own and gives it a label', () => {
    const [q] = parseDocument(stacked(), { answerPictures: true }).questions;
    expect(q.imageIds).toEqual([]);
    expect(q.options.map((o) => o.text)).toEqual([
      expect.stringMatching(/^Picture [A-Z0-9]{3}$/),
      expect.stringMatching(/^Picture [A-Z0-9]{3}$/),
      expect.stringMatching(/^Picture [A-Z0-9]{3}$/),
      expect.stringMatching(/^Picture [A-Z0-9]{3}$/),
    ]);
    expect(new Set(q.options.map((o) => o.text)).size).toBe(4);
    const boxes = q.options.map((o) => boxFromKey(o.imageId ?? ''));
    expect(boxes[1]?.y).toBeCloseTo(0.181, 2);
    expect(boxes[1]?.x).toBeCloseTo(0.116, 2);
  });

  it('splits two choices printed on one row', () => {
    const lines: DocLine[] = [
      line('1. Which graph is a line?', 0.1, 0.05),
      line('A.', 0.15, 0.08, [pic(0.12, 0.135), pic(0.55, 0.135)]),
      line('B.', 0.15, 0.5),
      line('C.', 0.25, 0.08, [pic(0.12, 0.235), pic(0.55, 0.235)]),
      line('D.', 0.25, 0.5),
    ];
    const [q] = parseDocument(lines, { answerPictures: true }).questions;
    const xs = q.options.map((o) => boxFromKey(o.imageId ?? '')?.x);
    expect(xs[0]).toBeCloseTo(0.116, 2);
    expect(xs[1]).toBeCloseTo(0.546, 2);
  });

  it('leaves an ordering question as one picture', () => {
    const lines = stacked();
    lines[0] = line('1. Put the pictures in the correct order.', 0.1, 0.05);
    const [q] = parseDocument(lines, { answerPictures: true }).questions;
    expect(q.options.every((o) => !o.imageId)).toBe(true);
  });

  it('keeps a diagram printed beside the choices with the stem', () => {
    const lines = stacked().map((l) => ({
      ...l,
      inlineBoxes: undefined,
      inlineImage: undefined,
    }));
    lines[0] = {
      ...lines[0],
      imageIds: ['1:500:120:400:220'],
    };
    const [q] = parseDocument(lines, { answerPictures: true }).questions;
    expect(q.options.every((o) => !o.imageId)).toBe(true);
    expect(q.imageIds).toHaveLength(1);
  });

  it('keeps the whole-question picture when the flag is off', () => {
    const [q] = parseDocument(stacked()).questions;
    expect(q.imageIds).toHaveLength(1);
    expect(q.options.map((o) => o.text)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('falls back to the whole question when a choice has no picture beside it', () => {
    const lines = stacked();
    lines[4] = line('D.', 0.3, 0.08);
    const [q] = parseDocument(lines, { answerPictures: true }).questions;
    expect(q.imageIds).toHaveLength(1);
    expect(q.options.every((o) => !o.imageId)).toBe(true);
  });

  it('goes back to letters, key included, when a choice picture did not crop', () => {
    const [q] = parseDocument(stacked(), { answerPictures: true }).questions;
    const keyed = { ...q, correctAnswer: q.options[1].text };
    const ids = new Map(
      q.options.slice(0, 3).map((o, i) => [o.imageId ?? '', `img-${i}`])
    );
    ids.set(q.choiceFallbackId ?? '', 'whole');
    const back = resolveChoicePictures(keyed, ids);
    expect(back.options.map((o) => o.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(back.correctAnswer).toBe('B');
    expect(back.imageIds).toEqual(['whole']);
    expect(back.warnings.join(' ')).toContain('named by their letters');
    expect(back.choiceFallbackId).toBeUndefined();
  });

  it('saves each picture as its choice’s image after upload', async () => {
    const [q] = parseDocument(stacked(), { answerPictures: true }).questions;
    const ids = new Map(q.options.map((o, i) => [o.imageId ?? '', `img-${i}`]));
    const resolved = resolveChoicePictures(
      { ...q, correctAnswer: q.options[0].text },
      ids
    );
    const question = toQuizQuestion(resolved);
    expect(question.imageOnlyAnswers).toHaveLength(4);
    expect(question.answerImages?.[0]).toEqual({
      text: resolved.options[0].text,
      url: 'img-0',
    });
    const images = [0, 1, 2, 3].map((i) => ({
      id: `img-${i}`,
      blob: new Blob(['x']),
      contentType: 'image/png',
      name: `p${i}.png`,
    }));
    const quiz = await attachDocumentImages(
      {
        id: 'q',
        title: 'T',
        questions: [question],
        createdAt: 0,
        updatedAt: 0,
      },
      images,
      {
        upload: (image) =>
          Promise.resolve({
            driveFileId: `drive-${image.id}`,
            url: `https://drive.google.com/file/d/drive-${image.id}/view`,
          }),
        remove: () => Promise.resolve(),
      }
    );
    const saved = quiz.questions[0];
    expect(quiz.stimuli ?? []).toHaveLength(0);
    expect(saved.stimulusIds).toBeUndefined();
    expect(saved.answerImages?.every((a) => a.url.startsWith('https://'))).toBe(
      true
    );
    expect(saved.imageOnlyAnswers).toHaveLength(4);
  });

  it('cuts one merged picture back into a piece per choice', () => {
    const merged = { x: 0.15, y: 0.14, width: 0.15, height: 0.56 };
    const tops = [0.154, 0.305, 0.457, 0.608];
    const slices = sliceByChoice(
      merged,
      tops.map((top) => ({ top, left: 0.11 }))
    );
    expect(slices).toHaveLength(4);
    expect(slices[0].y).toBeCloseTo(0.14, 3);
    expect(slices[1].y).toBeCloseTo(0.29, 2);
    expect(slices[3].y + slices[3].height).toBeCloseTo(0.7, 3);
    const grid = sliceByChoice({ x: 0.15, y: 0.4, width: 0.6, height: 0.06 }, [
      { top: 0.42, left: 0.11 },
      { top: 0.42, left: 0.52 },
    ]);
    expect(grid.map((b) => [b.x, b.x + b.width])).toEqual([
      [0.15, 0.52],
      [0.52, 0.75],
    ]);
  });
});
