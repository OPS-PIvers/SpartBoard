import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseNotebookFile, NotebookTooLargeError } from './notebookParser';

// 1x1 transparent PNG.
const PNG_1PX_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pngBytes = (): Uint8Array =>
  Uint8Array.from(atob(PNG_1PX_B64), (c) => c.charCodeAt(0));

const pageSvg = (height: number, imageHrefs: string[] = []): string => {
  const images = imageHrefs
    .map((h) => `<image href="${h}" x="0" y="0" width="50" height="50"/>`)
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<svg width="800" height="${height}" xml:id="p">` +
    `<rect width="100%" height="100%"/>` +
    `<g class="foreground"><text x="1" y="1">t</text>${images}</g></svg>`
  );
};

// Manifest with two lesson groups whose page order differs from filename order.
const MANIFEST = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<manifest identifier="id1" xmlns="http://www.imsglobal.org/xsd/imscp_v1p1">
  <organizations>
    <organization id="pagegroups">
      <item id="g0" identifierref="group0_pages"><title>Lesson B</title></item>
      <item id="g1" identifierref="group1_pages"><title>Lesson A</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="group0_pages" type="webcontent">
      <file href="page2.svg"/><file href="page0.svg"/>
    </resource>
    <resource identifier="group1_pages" type="webcontent">
      <file href="page1.svg"/>
    </resource>
    <resource identifier="pages" type="webcontent">
      <file href="page2.svg"/><file href="page0.svg"/><file href="page1.svg"/>
    </resource>
  </resources>
</manifest>`;

const toFile = async (zip: JSZip, name: string): Promise<File> => {
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name);
};

const blobText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsText(blob);
  });

describe('parseNotebookFile — raw .notebook', () => {
  const buildRawNotebook = (): JSZip => {
    const zip = new JSZip();
    zip.file('imsmanifest.xml', MANIFEST);
    zip.file('images/photo.png', pngBytes());
    zip.file('images/nickle front #1.jpg', pngBytes()); // literal '#'
    zip.file(
      'page2.svg',
      pageSvg(600, ['images/photo.png', 'images/nickle front #1.jpg'])
    );
    zip.file('page0.svg', pageSvg(720));
    zip.file('page1.svg', pageSvg(600, ['images/photo.png']));
    return zip;
  };

  it('orders pages by the manifest, not by filename', async () => {
    const file = await toFile(buildRawNotebook(), 'Sample.notebook');
    const result = await parseNotebookFile(file);

    expect(result.pages).toHaveLength(3);
    // Manifest order: page2 (h600), page0 (h720), page1 (h600).
    const first = await blobText(result.pages[0].blob);
    const second = await blobText(result.pages[1].blob);
    expect(first).toContain('height="600"');
    expect(second).toContain('height="720"');
  });

  it('extracts lesson sections from the manifest', async () => {
    const file = await toFile(buildRawNotebook(), 'Sample.notebook');
    const result = await parseNotebookFile(file);
    expect(result.sections).toEqual([
      { title: 'Lesson B', startIndex: 0, pageCount: 2 },
      { title: 'Lesson A', startIndex: 2, pageCount: 1 },
    ]);
  });

  it('inlines relative image refs as data URIs (no broken refs)', async () => {
    const file = await toFile(buildRawNotebook(), 'Sample.notebook');
    const result = await parseNotebookFile(file);
    for (const page of result.pages) {
      const svg = await blobText(page.blob);
      expect(svg).not.toContain('href="images/');
    }
    // The image-bearing pages must contain data URIs.
    const page0 = await blobText(result.pages[0].blob);
    expect(page0).toContain('data:image/');
  });

  it('resolves filenames containing a literal "#"', async () => {
    const file = await toFile(buildRawNotebook(), 'Sample.notebook');
    const result = await parseNotebookFile(file);
    const page0 = await blobText(result.pages[0].blob); // page2 has both images
    // Both images inlined -> two data URIs, zero leftover image refs.
    expect((page0.match(/data:image\//g) ?? []).length).toBe(2);
  });

  it('injects the SVG namespace so pages render via <img>', async () => {
    // SMART page SVGs omit xmlns; without it the page is a broken <img>.
    const file = await toFile(buildRawNotebook(), 'Sample.notebook');
    const result = await parseNotebookFile(file);
    const svg = await blobText(result.pages[0].blob);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('surfaces images as draggable assets', async () => {
    const file = await toFile(buildRawNotebook(), 'Sample.notebook');
    const result = await parseNotebookFile(file);
    expect(result.assets.length).toBeGreaterThan(0);
  });

  it('falls back to preview.png when no page SVGs exist', async () => {
    const zip = new JSZip();
    zip.file('metadata.xml', '<x/>');
    zip.file('preview.png', pngBytes());
    const file = await toFile(zip, 'NoPages.notebook');
    const result = await parseNotebookFile(file);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].extension).toBe('png');
    expect(result.assets).toEqual([]);
  });
});

describe('parseNotebookFile — .spartnb bundle', () => {
  it('unpacks pages in manifest order with sections', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        version: 1,
        title: 'Converted Unit',
        pageCount: 2,
        pages: [
          { file: 'pages/0.svg', width: 800, height: 600 },
          { file: 'pages/1.svg', width: 800, height: 720 },
        ],
        sections: [{ title: 'Intro', startIndex: 0, pageCount: 2 }],
      })
    );
    zip.file('pages/0.svg', pageSvg(600));
    zip.file('pages/1.svg', pageSvg(720));
    const file = await toFile(zip, 'Converted.spartnb');

    const result = await parseNotebookFile(file);
    expect(result.title).toBe('Converted Unit');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].extension).toBe('svg');
    expect(result.assets).toEqual([]);
    expect(result.sections).toEqual([
      { title: 'Intro', startIndex: 0, pageCount: 2 },
    ]);
    const first = await blobText(result.pages[0].blob);
    expect(first).toContain('height="600"');
  });
});

describe('parseNotebookFile — size cap', () => {
  it('rejects oversized raw .notebook files with NotebookTooLargeError', async () => {
    const zip = new JSZip();
    zip.file('page0.svg', pageSvg(600));
    const blob = await zip.generateAsync({ type: 'blob' });
    // Force an over-cap reported size (>20MB) without allocating 20MB.
    const file = new File([blob], 'Huge.notebook');
    Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024 });

    await expect(parseNotebookFile(file)).rejects.toBeInstanceOf(
      NotebookTooLargeError
    );
  });
});
