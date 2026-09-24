/**
 * The browser reader bringing in a PDF's pictures end to end, through the real
 * pdf.js on a small generated two-page test (QUIZ_IMPORT_RELIABILITY.md PR 4).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readQuizDocument } from '@/utils/quizDocumentImport';
import type { PdfCropperDeps } from '@/utils/quizDocumentImport/pdfFigures';
import {
  PDF_PICTURES_FAILED,
  picturesOnPage,
} from '@/utils/quizDocumentImport/pdfPictures';
import type {
  PdfReaderDeps,
  PdfTextItem,
} from '@/utils/quizDocumentImport/pdfReader';

const bytes = readFileSync(resolve(__dirname, 'fixtures/pdfPictures.pdf'));

async function nodePdfDeps(): Promise<PdfReaderDeps> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
  });
  const doc = await task.promise;
  return {
    loadPdf: () =>
      Promise.resolve({
        numPages: doc.numPages,
        getPage: async (n: number) => {
          const page = await doc.getPage(n);
          return {
            getTextContent: async () => ({
              items: (await page.getTextContent()).items.flatMap(
                (i): PdfTextItem[] =>
                  'str' in i
                    ? [
                        {
                          str: i.str,
                          transform: i.transform as number[],
                          width: i.width,
                          height: i.height,
                        },
                      ]
                    : []
              ),
            }),
            getPictures: async (items: readonly PdfTextItem[]) => {
              const viewport = page.getViewport({ scale: 1 });
              const list = await page.getOperatorList();
              return {
                viewport,
                pictures: picturesOnPage(list, pdfjs.OPS, viewport, items),
              };
            },
          };
        },
        destroy: () => task.destroy(),
      }),
  };
}

const fakeCropper = (): PdfCropperDeps => ({
  pageCount: 2,
  pageSize: () => Promise.resolve({ width: 1275, height: 1650 }),
  crop: () => Promise.resolve(new Blob(['PNG'], { type: 'image/png' })),
});

describe('reading a PDF with pictures', () => {
  it('brings each picture in on the question it belongs to', async () => {
    const quiz = await readQuizDocument(new Blob([bytes]), {
      fileName: 'cells.pdf',
      pdf: await nodePdfDeps(),
      pdfCropper: () => Promise.resolve(fakeCropper()),
    });

    expect(quiz.questions.map((q) => q.imageIds)).toEqual([
      ['pdf-figure-1'],
      [],
      ['pdf-figure-2'],
      ['pdf-figure-2'],
    ]);
    // The "X" label drawn over the picture goes with the picture.
    expect(quiz.questions[0].text).toBe('Which part of the cell is labeled X?');
    // The header logo on both pages is not a picture.
    expect(quiz.images.map((i) => i.id)).toEqual([
      'pdf-figure-1',
      'pdf-figure-2',
    ]);
    expect(quiz.warnings).toEqual([]);
  });

  it('keeps the questions when the PDF cannot be opened for cropping', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const quiz = await readQuizDocument(new Blob([bytes]), {
      fileName: 'cells.pdf',
      pdf: await nodePdfDeps(),
      pdfCropper: () => Promise.reject(new Error('no canvas')),
    });
    warn.mockRestore();

    expect(quiz.questions).toHaveLength(4);
    expect(quiz.questions.every((q) => q.imageIds.length === 0)).toBe(true);
    expect(quiz.images).toEqual([]);
    expect(quiz.warnings).toEqual([PDF_PICTURES_FAILED]);
  });

  it('still says pictures were left behind when there is no cropper', async () => {
    const quiz = await readQuizDocument(new Blob([bytes]), {
      fileName: 'cells.pdf',
      pdf: await nodePdfDeps(),
    });
    expect(quiz.questions.every((q) => q.imageIds.length === 0)).toBe(true);
    expect(quiz.warnings.join(' ')).toMatch(/pictures in a pdf aren/i);
  });
});
