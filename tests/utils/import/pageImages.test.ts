import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_SLIDES_MIME_TYPE,
  MAX_PAGE_TEXT_CHARS,
  PAGE_IMAGE_LONG_EDGE_PX,
  PPTX_MIME_TYPE,
  pageRenderScale,
  pageSourceKind,
  pageTextFromItems,
  pptxToPdf,
  readPageSource,
  readPdfPages,
  type PageImageDeps,
  type RenderablePdfPage,
  type SlidesDrive,
} from '@/utils/import/pageImages';

const item = (str: string, x: number, y: number) => ({
  str,
  transform: [12, 0, 0, 12, x, y],
  width: str.length * 6,
});

function fakeDeps(pageTexts: string[][], size = { width: 720, height: 405 }) {
  const rendered: { width: number; height: number }[] = [];
  const destroy = vi.fn();
  const deps: PageImageDeps = {
    loadPdf: () =>
      Promise.resolve({
        numPages: pageTexts.length,
        getPage: (n: number) =>
          Promise.resolve<RenderablePdfPage>({
            getViewport: ({ scale }) => ({
              width: size.width * scale,
              height: size.height * scale,
            }),
            getTextContent: () =>
              Promise.resolve({
                items: pageTexts[n - 1].map((line, i) =>
                  item(line, 40, 360 - i * 30)
                ),
              }),
            renderToBlob: (viewport) => {
              rendered.push(viewport);
              return Promise.resolve(
                new Blob([`page${n}`], { type: 'image/webp' })
              );
            },
          }),
        destroy,
      }),
  };
  return { deps, rendered, destroy };
}

describe('pageSourceKind', () => {
  it('routes PDFs and PowerPoint decks and nothing else', () => {
    expect(pageSourceKind({ name: 'Unit 3.PDF' })).toBe('pdf');
    expect(pageSourceKind({ name: 'x', type: 'application/pdf' })).toBe('pdf');
    expect(pageSourceKind({ name: 'Lesson.pptx' })).toBe('pptx');
    expect(pageSourceKind({ name: 'Lesson.ppt' })).toBeNull();
    expect(pageSourceKind({ name: 'notes.notebook' })).toBeNull();
  });
});

describe('pageRenderScale', () => {
  it('draws the longest edge at the target size', () => {
    expect(pageRenderScale({ width: 720, height: 405 }) * 720).toBe(
      PAGE_IMAGE_LONG_EDGE_PX
    );
    expect(pageRenderScale({ width: 612, height: 792 }) * 792).toBeCloseTo(
      PAGE_IMAGE_LONG_EDGE_PX
    );
    expect(pageRenderScale({ width: 0, height: 0 })).toBe(1);
  });
});

describe('pageTextFromItems', () => {
  it('puts lines top to bottom and drops non-text items', () => {
    const text = pageTextFromItems([
      item('second   line', 40, 300),
      { type: 'beginMarkedContent' },
      item('Title', 40, 360),
    ]);
    expect(text).toBe('Title\nsecond line');
  });

  it('drops characters an SVG page cannot hold', () => {
    const text = pageTextFromItems([item('Cell\u0001s\u0000 \uD800ok', 0, 0)]);
    expect(text).toBe('Cells ok');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><desc>${text}</desc></svg>`;
    expect(
      new DOMParser()
        .parseFromString(svg, 'image/svg+xml')
        .querySelector('parsererror')
    ).toBeNull();
  });

  it('cuts very long page text', () => {
    const long = 'word '.repeat(2000);
    expect(pageTextFromItems([item(long, 0, 0)]).length).toBeLessThanOrEqual(
      MAX_PAGE_TEXT_CHARS
    );
  });
});

describe('readPdfPages', () => {
  it('renders every page at 1920px with its text, then closes the file', async () => {
    const { deps, rendered, destroy } = fakeDeps([
      ['Photosynthesis', 'Plants make food'],
      [],
    ]);
    const result = await readPdfPages(new Blob(), deps);
    expect(result.pageCount).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.pages.map((p) => p.text)).toEqual([
      'Photosynthesis\nPlants make food',
      '',
    ]);
    expect(result.pages[0]).toMatchObject({ width: 1920, height: 1080 });
    expect(rendered).toHaveLength(2);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('keeps the first pages of a long file and says so', async () => {
    const { deps } = fakeDeps([['a'], ['b'], ['c']]);
    const result = await readPdfPages(new Blob(), deps, 2);
    expect(result.pages).toHaveLength(2);
    expect(result.warnings).toEqual([
      'Only the first 2 of 3 pages were imported.',
    ]);
  });

  it('reads the text layer of a real PDF', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const require = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ).href;
    const bytes = new Uint8Array(
      readFileSync('tests/utils/quizDocumentImport/fixtures/versionsMc.pdf')
    );
    const deps: PageImageDeps = {
      loadPdf: async () => {
        const task = pdfjs.getDocument({ data: bytes });
        const doc = await task.promise;
        return {
          numPages: doc.numPages,
          getPage: async (n) => {
            const page = await doc.getPage(n);
            return {
              getViewport: (opts) => page.getViewport(opts),
              getTextContent: () => page.getTextContent(),
              renderToBlob: () => Promise.resolve(new Blob(['x'])),
            };
          },
          destroy: () => task.destroy(),
        };
      },
    };
    const result = await readPdfPages(new Blob(), deps);
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages[0].text.length).toBeGreaterThan(10);
    expect(Math.max(result.pages[0].width, result.pages[0].height)).toBe(
      PAGE_IMAGE_LONG_EDGE_PX
    );
  });
});

describe('PowerPoint through Drive', () => {
  const drive = (
    exportAsPdf: SlidesDrive['exportAsPdf']
  ): SlidesDrive & {
    calls: string[];
    types: string[];
  } => {
    const calls: string[] = [];
    const types: string[] = [];
    return {
      calls,
      types,
      importAsGoogleFile: (file, name, mime) => {
        types.push(file.type);
        calls.push(`import ${name} ${mime}`);
        return Promise.resolve('slides-1');
      },
      exportAsPdf: (id) => {
        calls.push(`export ${id}`);
        return exportAsPdf(id);
      },
      deleteFile: (id) => {
        calls.push(`delete ${id}`);
        return Promise.resolve();
      },
    };
  };

  it('converts to Google Slides, exports a PDF and deletes the copy', async () => {
    const d = drive(() => Promise.resolve(new Blob(['%PDF'])));
    const pdf = await pptxToPdf(new Blob(['pk']), 'Cells.pptx', d);
    expect(await pdf.text()).toBe('%PDF');
    expect(d.types[0]).toBe(PPTX_MIME_TYPE);
    expect(d.calls).toEqual([
      `import Cells ${GOOGLE_SLIDES_MIME_TYPE}`,
      'export slides-1',
      'delete slides-1',
    ]);
  });

  it('deletes the copy when the export fails', async () => {
    const d = drive(() => Promise.reject(new Error('too large')));
    await expect(pptxToPdf(new Blob(), 'a.pptx', d)).rejects.toThrow(
      'too large'
    );
    expect(d.calls.at(-1)).toBe('delete slides-1');
  });

  it('asks for Drive when a deck arrives without it', async () => {
    await expect(
      readPageSource(new File(['pk'], 'Deck.pptx'), { drive: null })
    ).rejects.toThrow(/Connect Google Drive/);
  });

  it('turns away other files', async () => {
    await expect(readPageSource(new File(['x'], 'a.docx'))).rejects.toThrow(
      /PDF or PowerPoint/
    );
  });
});
