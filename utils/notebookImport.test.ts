import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  formatImportSummary,
  importNotebookFile,
  isNotebookImportFile,
} from './notebookImport';

const zipFile = async (
  entries: Record<string, string>,
  name: string
): Promise<File> => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name);
};

const bundleFile = (name: string, hiddenPages?: number[]) =>
  zipFile(
    {
      'pages/0.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'pages/1.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'manifest.json': JSON.stringify({
        version: 1,
        title: 'Bundle Lesson',
        pageCount: 2,
        pages: [{ file: 'pages/0.svg' }, { file: 'pages/1.svg' }],
        ...(hiddenPages ? { hiddenPages } : {}),
      }),
    },
    name
  );

const olfFile = (name = 'Lesson.olf') =>
  zipFile(
    {
      'content.json': JSON.stringify({
        olf: {
          width: 1920,
          height: 1080,
          viewbox: '0 0 1920 1080',
          pageset: [
            { page: { id: 'p1', viewbox: '0,0,1920,1080', elements: [] } },
            {
              page: {
                id: 'p2',
                viewbox: '0,0,1920,1080',
                'is-hidden': true,
                elements: [{ mystery: { id: 'm1' } }],
              },
            },
          ],
        },
      }),
    },
    name
  );

describe('isNotebookImportFile', () => {
  it('matches the three importable extensions, case-insensitively', () => {
    expect(isNotebookImportFile('a.olf')).toBe(true);
    expect(isNotebookImportFile('a.NOTEBOOK')).toBe(true);
    expect(isNotebookImportFile(' a.spartnb ')).toBe(true);
    expect(isNotebookImportFile('a.pdf')).toBe(false);
  });
});

describe('importNotebookFile', () => {
  it('converts .olf files before parsing and reports skipped objects', async () => {
    const { parsed, summary } = await importNotebookFile(await olfFile());

    expect(parsed.pages).toHaveLength(2);
    expect(parsed.hiddenPages).toEqual([1]);
    expect(summary.pageCount).toBe(2);
    expect(summary.hiddenPageCount).toBe(1);
    expect(summary.skipped).toEqual({ mystery: 1 });
  });

  it('passes bundles straight through with an empty skipped map', async () => {
    const { parsed, summary } = await importNotebookFile(
      await bundleFile('Lesson.spartnb', [0])
    );

    expect(parsed.title).toBe('Bundle Lesson');
    expect(summary).toEqual({
      pageCount: 2,
      hiddenPageCount: 1,
      skipped: {},
      warnings: [],
    });
  });
});

describe('formatImportSummary', () => {
  const base = { pageCount: 3, hiddenPageCount: 0, skipped: {}, warnings: [] };

  it('omits zero-valued clauses', () => {
    expect(formatImportSummary(base)).toBe('Imported 3 pages.');
  });

  it('reports hidden pages and skipped objects', () => {
    expect(
      formatImportSummary({
        ...base,
        hiddenPageCount: 1,
        skipped: { shape: 1, ink: 1 },
      })
    ).toBe('Imported 3 pages (1 hidden). Skipped 2 unsupported objects.');
  });

  it('singularizes counts of one and appends warnings', () => {
    expect(
      formatImportSummary({
        pageCount: 1,
        hiddenPageCount: 0,
        skipped: { shape: 1 },
        warnings: ['1 group(s) could not be reconstructed.'],
      })
    ).toBe(
      'Imported 1 page. Skipped 1 unsupported object. 1 group(s) could not be reconstructed.'
    );
  });
});
