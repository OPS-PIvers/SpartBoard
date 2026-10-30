import { describe, expect, it, vi } from 'vitest';
import {
  createNotebookSlidesImportAdapter,
  pageToNotebookSvg,
  toParsedNotebook,
} from './notebookSlidesImportAdapter';
import type { PageImage } from '@/utils/import/pageImages';
import { findForeground } from '@/utils/notebookSvgEdit';

const page = (text: string): PageImage => ({
  blob: new Blob(['img'], { type: 'image/webp' }),
  width: 1920,
  height: 1080,
  text,
});

describe('notebook slides import', () => {
  it('wraps each page picture in a sized SVG that keeps its text', async () => {
    const svg = await pageToNotebookSvg(page('Cells & <tissues>'));
    expect(svg).toContain('viewBox="0 0 1920 1080"');
    expect(svg).toContain('<desc>Cells &amp; &lt;tissues&gt;</desc>');
    expect(svg).toContain('href="data:image/webp;base64,');
    expect(
      new DOMParser()
        .parseFromString(svg, 'image/svg+xml')
        .querySelector('parsererror')
    ).toBeNull();
  });

  it('gives the page an editable foreground layer', async () => {
    const doc = new DOMParser().parseFromString(
      await pageToNotebookSvg(page('Title')),
      'image/svg+xml'
    );
    expect(
      findForeground(doc.documentElement as unknown as SVGSVGElement)
    ).not.toBeNull();
  });

  it('leaves out the description on a picture-only page', async () => {
    expect(await pageToNotebookSvg(page(''))).not.toContain('<desc>');
  });

  it('builds one SVG page per imported page under the chosen title', async () => {
    const parsed = await toParsedNotebook(
      { title: 'Deck', pages: [page('a'), page('b')], previewUrls: [] },
      'Unit 4'
    );
    expect(parsed.title).toBe('Unit 4');
    expect(parsed.pages.map((p) => p.extension)).toEqual(['svg', 'svg']);
    expect(parsed.pages[0].blob.type).toBe('image/svg+xml');
  });

  it('reads PDFs, refuses other files and saves through the widget', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    const save = vi.fn().mockResolvedValue(undefined);
    const adapter = createNotebookSlidesImportAdapter({
      readPages: () =>
        Promise.resolve({ pages: [page('Title')], warnings: [], pageCount: 1 }),
      save,
    });
    const result = await adapter.parse({
      kind: 'file',
      file: new File(['%PDF'], 'Biology Unit.pdf'),
    });
    expect(adapter.suggestTitle?.(result.data)).toBe('Biology Unit');
    expect(adapter.validate(result.data).ok).toBe(true);
    await expect(
      adapter.parse({ kind: 'file', file: new File(['x'], 'a.docx') })
    ).rejects.toThrow(/PDF or PowerPoint/);
    await adapter.save(result.data, 'Biology');
    expect(save.mock.calls[0][0]).toMatchObject({ title: 'Biology' });
  });
});
