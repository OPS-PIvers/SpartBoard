// Builds a tiny in-memory .olf file, converts it with the real
// convertOlfToBundle + parseNotebookFile pipeline, and turns the resulting
// page blobs into object URLs — so the dev harness screenshots real
// converted SVG output instead of hand-drawn placeholders.
import JSZip from 'jszip';
import { convertOlfToBundle } from '@/utils/olfConverter';
import { parseNotebookFile } from '@/utils/notebookParser';
import { NotebookItem } from '@/types';

const run = (text: string) => ({
  text: {
    id: `run-${text.slice(0, 4)}`,
    text,
    'font-size': 30,
    'font-family': 'Segoe UI',
    'font-weight': 'normal',
    'font-style': 'normal',
    'text-decoration': 'normal',
    fill: '#FF000000',
    background: '#FFFFFFFF',
    'background-opacity': 1,
    'fill-opacity': 1,
  },
});

const paragraph = (text: string, id: string) => ({
  paragraph: { id, 'font-size': 30, 'text-list-container': [run(text)] },
});

const textarea = (
  id: string,
  x: number,
  y: number,
  lines: string[]
): unknown => ({
  textarea: {
    id,
    x,
    y,
    width: 1200,
    height: 300,
    'custom-data': '',
    matrix: '1,0,0,0,1,0,0,0,1',
    'text-blocks-container': lines.map((line, i) =>
      paragraph(line, `${id}-p${i}`)
    ),
  },
});

const page = (elements: unknown[], isHidden: boolean, id: string) => ({
  page: {
    id,
    matrix: '1,0,0,0,1,0,0,0,1',
    viewbox: '0,0,1920,1080',
    'is-hidden': isHidden,
    elements,
    backgrounds: [
      { background: { id: 'bg', opacity: 1, type: 'color', fill: '#FFFFFF' } },
    ],
  },
});

const doc = (pages: unknown[]) => ({
  olf: {
    width: 1920,
    height: 1080,
    viewbox: '0 0 1920 1080',
    pageset: pages,
    additional: [],
    links: [],
    groups: [],
  },
});

const buildSampleOlfFile = async (): Promise<File> => {
  const content = doc([
    page(
      [textarea('vocab', 120, 120, ['der Würfel — the die', 'zwei — two'])],
      false,
      'page-1'
    ),
    page(
      [textarea('answers', 120, 120, ['Lösungen', '1. zwei  2. der Würfel'])],
      true,
      'page-2'
    ),
  ]);
  const zip = new JSZip();
  zip.file('content.json', JSON.stringify(content));
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'Spielmaterialien, Spielaktivitäten, Spielarten.olf');
};

export interface MockNotebook {
  item: NotebookItem;
  importSummaryText: string;
}

/** Converts the sample .olf and turns page blobs into object URLs. */
export const buildMockNotebook = async (): Promise<MockNotebook> => {
  const file = await buildSampleOlfFile();
  const converted = await convertOlfToBundle(file);
  const bundle = new File([converted.blob], `${converted.title}.spartnb`, {
    type: 'application/zip',
  });
  const parsed = await parseNotebookFile(bundle);
  const pageUrls = parsed.pages.map((p) => URL.createObjectURL(p.blob));
  return {
    item: {
      id: 'mock-notebook-1',
      title: parsed.title,
      pageUrls,
      pagePaths: pageUrls.map((_, i) => `mock/page-${i}`),
      sections: parsed.sections,
      objectLinks: parsed.objectLinks,
      hiddenPages: parsed.hiddenPages,
      createdAt: Date.now(),
    },
    importSummaryText: `Imported ${parsed.pages.length} pages (${
      parsed.hiddenPages?.length ?? 0
    } hidden).`,
  };
};

/** A second library card with no real pages (image-free preview state). */
export const makeEmptyNotebookItem = (): NotebookItem => ({
  id: 'mock-notebook-2',
  title: 'Unit 3 Review',
  pageUrls: [],
  pagePaths: [],
  createdAt: Date.now() - 86_400_000,
});
