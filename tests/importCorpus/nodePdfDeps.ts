// pdf.js in Node for the private corpus run; the browser wiring lives in pdfBrowserDeps.ts.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type {
  PdfReaderDeps,
  PdfTextItem,
} from '@/utils/quizDocumentImport/pdfReader';
import { readPageText } from '@/utils/quizDocumentImport/pdfReader';
import {
  inlineImagesOnPage,
  picturesOnPage,
} from '@/utils/quizDocumentImport/pdfPictures';

export async function nodePdfDeps(bytes: Uint8Array): Promise<PdfReaderDeps> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ).href;
  const task = pdfjs.getDocument({ data: bytes, fontExtraProperties: true });
  const doc = await task.promise;
  return {
    loadPdf: () =>
      Promise.resolve({
        numPages: doc.numPages,
        getPage: async (n: number) => {
          const page = await doc.getPage(n);
          return {
            height: page.getViewport({ scale: 1 }).height,
            getTextContent: async () => {
              const content = await page.getTextContent();
              const items: PdfTextItem[] = [];
              for (const entry of content.items) {
                const c = entry as Partial<PdfTextItem>;
                if (typeof c.str !== 'string' || !Array.isArray(c.transform))
                  continue;
                items.push({
                  str: c.str,
                  transform: c.transform,
                  ...(typeof c.width === 'number' ? { width: c.width } : {}),
                  ...(typeof c.height === 'number' ? { height: c.height } : {}),
                  ...(typeof c.fontName === 'string'
                    ? { fontName: c.fontName }
                    : {}),
                });
              }
              return readPageText(page, items, {
                ops: pdfjs.OPS,
                pageWidth: page.getViewport({ scale: 1 }).width,
              });
            },
            getPictures: async (items) => {
              const viewport = page.getViewport({ scale: 1 });
              const list = await page.getOperatorList();
              return {
                viewport,
                pictures: picturesOnPage(list, pdfjs.OPS, viewport, items),
                inline: inlineImagesOnPage(list, pdfjs.OPS, viewport),
              };
            },
          };
        },
        destroy: () => task.destroy(),
      }),
  };
}
