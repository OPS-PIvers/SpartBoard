/**
 * Cropping a PDF's figures (D13). The box is a model's estimate, so the
 * maths has to survive one that runs off the page or encloses nothing —
 * a crop of zero pixels throws in a real canvas, and a question whose
 * diagram went missing is one a student cannot answer.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  FIGURE_PADDING,
  cropPdfFigures,
  figureKey,
  pixelRect,
  type FigureBox,
  type PdfCropperDeps,
} from '@/utils/quizDocumentImport/pdfFigures';

const page = { width: 1000, height: 2000 };
const box = (over: Partial<FigureBox> = {}): FigureBox => ({
  page: 1,
  x: 0.2,
  y: 0.1,
  width: 0.5,
  height: 0.25,
  ...over,
});

describe('pixelRect', () => {
  it('turns fractions into pixels with a margin around the figure', () => {
    const rect = pixelRect(box(), page);
    // 0.2 of 1000 is 200, less 1% of the page.
    expect(rect).toEqual({
      left: Math.floor((0.2 - FIGURE_PADDING) * 1000),
      top: Math.floor((0.1 - FIGURE_PADDING) * 2000),
      width:
        Math.ceil((0.7 + FIGURE_PADDING) * 1000) -
        Math.floor((0.2 - FIGURE_PADDING) * 1000),
      height:
        Math.ceil((0.35 + FIGURE_PADDING) * 2000) -
        Math.floor((0.1 - FIGURE_PADDING) * 2000),
    });
  });

  it('keeps a box at the very edge on the page', () => {
    // The padding would push this past 0; a negative left crops nothing.
    const rect = pixelRect(box({ x: 0, y: 0 }), page);
    expect(rect?.left).toBe(0);
    expect(rect?.top).toBe(0);
  });

  it('trims a box that runs off the bottom right', () => {
    const rect = pixelRect(
      box({ x: 0.8, y: 0.9, width: 0.5, height: 0.5 }),
      page
    );
    expect(rect).not.toBeNull();
    expect((rect?.left ?? 0) + (rect?.width ?? 0)).toBe(1000);
    expect((rect?.top ?? 0) + (rect?.height ?? 0)).toBe(2000);
  });

  it('still encloses something when the box is vanishingly small', () => {
    // The padding is what saves this: a hairline box the model returned by
    // mistake still crops a legible sliver rather than throwing.
    expect(
      pixelRect(box({ width: 0.0001, height: 0.0001 }), page)
    ).not.toBeNull();
  });

  it('refuses a page that rendered with no size', () => {
    // A canvas that came back empty would make drawImage throw on a zero
    // width; better to skip the picture and tell the teacher.
    expect(pixelRect(box(), { width: 0, height: 0 })).toBeNull();
  });
});

function cropper(over: Partial<PdfCropperDeps> = {}): PdfCropperDeps {
  return {
    pageCount: 3,
    pageSize: vi.fn(() => Promise.resolve(page)),
    crop: vi.fn(() =>
      Promise.resolve(new Blob(['png'], { type: 'image/png' }))
    ),
    ...over,
  };
}

describe('cropPdfFigures', () => {
  it('crops one picture per box', async () => {
    const deps = cropper();
    const result = await cropPdfFigures([box(), box({ page: 2 })], deps);

    expect(result.images).toHaveLength(2);
    expect(deps.crop).toHaveBeenCalledTimes(2);
    expect(result.warnings).toEqual([]);
  });

  it('crops a picture two questions share only once (D14)', async () => {
    const deps = cropper();
    const shared = box();
    const result = await cropPdfFigures([shared, { ...shared }], deps);

    expect(result.images).toHaveLength(1);
    expect(deps.crop).toHaveBeenCalledTimes(1);
    // Both questions resolve to the same image, so it uploads once.
    expect(result.idByBox.get(figureKey(shared))).toBe(result.images[0].id);
  });

  it('skips a page the document does not have', async () => {
    const deps = cropper();
    const result = await cropPdfFigures([box({ page: 9 })], deps);

    expect(deps.crop).not.toHaveBeenCalled();
    expect(result.images).toEqual([]);
    expect(result.warnings[0]).toContain('couldn’t be taken');
  });

  it('keeps the pictures that worked when one crop fails', async () => {
    let calls = 0;
    const deps = cropper({
      crop: vi.fn(() => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new Error('canvas gone'))
          : Promise.resolve(new Blob(['png'], { type: 'image/png' }));
      }),
    });

    const result = await cropPdfFigures([box(), box({ page: 2 })], deps);

    expect(result.images).toHaveLength(1);
    expect(result.warnings[0]).toContain('One picture');
  });

  it('counts several failures in one note', async () => {
    const deps = cropper({
      crop: vi.fn(() => Promise.reject(new Error('canvas gone'))),
    });

    const result = await cropPdfFigures([box(), box({ page: 2 })], deps);

    expect(result.images).toEqual([]);
    expect(result.warnings[0]).toContain('2 pictures');
  });

  it('does nothing when the reader pointed at no pictures', async () => {
    const deps = cropper();
    const result = await cropPdfFigures([], deps);
    expect(result.images).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(deps.pageSize).not.toHaveBeenCalled();
  });
});
