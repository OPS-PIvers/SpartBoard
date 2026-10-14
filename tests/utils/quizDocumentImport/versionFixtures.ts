// Reads the dev fixtures through the real testSetReader with a fake cropper, for the version-import tests.
import {
  frqTestSet,
  mcReorderedTestSet,
} from '@/components/dev/quizVersionFixtures';
import type { Pixels } from '@/utils/quizDocumentImport/figureMatch';
import type { PdfCropperDeps } from '@/utils/quizDocumentImport/pdfFigures';
import { readTestSet } from '@/utils/quizDocumentImport/testSetReader';
import type { ImportedTestSet } from '@/utils/quizDocumentImport/types';

const block = (w: number, shade: number): Pixels => {
  const data = new Uint8ClampedArray(20 * 20 * 4).fill(255);
  for (let y = 2; y < 18; y++)
    for (let x = 2; x < 2 + w; x++) {
      const i = (y * 20 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = shade;
    }
  return { width: 20, height: 20, data };
};

/** The FRQ fixture read with each map cropped per page; `differentPage` prints a changed map there. */
export async function importedFrq(
  options: { differentPage?: number } = {}
): Promise<ImportedTestSet> {
  const tags = new WeakMap<Blob, string>();
  const cropper: PdfCropperDeps = {
    pageCount: 20,
    pageSize: () => Promise.resolve({ width: 1000, height: 1000 }),
    crop: (page, rect) => {
      const blob = new Blob([`${page}:${rect.left}`], { type: 'image/png' });
      const map = rect.left < 500 ? 'map1' : 'map2';
      tags.set(blob, page === options.differentPage ? `${map}-changed` : map);
      return Promise.resolve(blob);
    },
  };
  return readTestSet(frqTestSet(), {
    fallbackTitle: 'Bohl Unit 3 FRQ (2025)',
    cropper: () => Promise.resolve(cropper),
    decodePixels: (blob) => {
      const tag = tags.get(blob);
      if (tag === 'map1') return Promise.resolve(block(10, 30));
      if (tag === 'map2') return Promise.resolve(block(6, 90));
      return Promise.resolve(block(6, 200));
    },
  });
}

export function importedMc(): Promise<ImportedTestSet> {
  return readTestSet(mcReorderedTestSet(), {
    fallbackTitle: 'Unit 3 Quiz',
  });
}
