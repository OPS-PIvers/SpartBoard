import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { convertNotebookToBundle, ImageOptimizer } from './notebookConverter';

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
  </resources>
</manifest>`;

const buildNotebookFile = async (): Promise<File> => {
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
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'Sample Unit.notebook');
};

// Canvas-free stub: returns a fixed data URI so jsdom (no canvas) can run.
const stubOptimizer: ImageOptimizer = () =>
  Promise.resolve('data:image/webp;base64,ZHVtbXk=');

const readBundle = async (blob: Blob): Promise<JSZip> =>
  new JSZip().loadAsync(blob);

const readEntry = async (bundle: JSZip, name: string): Promise<string> => {
  const entry = bundle.file(name);
  if (!entry) throw new Error(`bundle missing ${name}`);
  return entry.async('string');
};

interface BundleManifest {
  pages: { file: string; width: number; height: number }[];
  sections: { title: string; startIndex: number; pageCount: number }[];
}

describe('convertNotebookToBundle', () => {
  it('produces a .spartnb with manifest order, sections, and stats', async () => {
    const file = await buildNotebookFile();
    const result = await convertNotebookToBundle(file, {
      optimizeImage: stubOptimizer,
    });

    expect(result.fileName).toBe('Sample Unit.spartnb');
    expect(result.title).toBe('Sample Unit');
    expect(result.pageCount).toBe(3);
    expect(result.sectionCount).toBe(2);
    expect(result.bytesBefore).toBe(file.size);
    expect(result.bytesAfter).toBeGreaterThan(0);

    const bundle = await readBundle(result.blob);
    const manifest = JSON.parse(
      await readEntry(bundle, 'manifest.json')
    ) as BundleManifest;
    // Manifest order: page2 (h600), page0 (h720), page1 (h600).
    expect(manifest.pages[0]).toMatchObject({
      file: 'pages/0.svg',
      height: 600,
    });
    expect(manifest.pages[1]).toMatchObject({
      file: 'pages/1.svg',
      height: 720,
    });
    expect(manifest.sections).toEqual([
      { title: 'Lesson B', startIndex: 0, pageCount: 2 },
      { title: 'Lesson A', startIndex: 2, pageCount: 1 },
    ]);
  });

  it('inlines images, repairs namespace, leaves no broken refs', async () => {
    const file = await buildNotebookFile();
    const result = await convertNotebookToBundle(file, {
      optimizeImage: stubOptimizer,
    });
    const bundle = await readBundle(result.blob);

    const page0 = await readEntry(bundle, 'pages/0.svg'); // source page2
    expect(page0).not.toContain('href="images/');
    expect(page0).toContain('data:image/webp;base64,ZHVtbXk=');
    expect(page0).toContain('xmlns="http://www.w3.org/2000/svg"');
    // page2 referenced two images (incl. the literal-'#' filename) -> both inlined.
    expect((page0.match(/data:image\/webp/g) ?? []).length).toBe(2);
  });

  it('reports progress for every page', async () => {
    const file = await buildNotebookFile();
    const seen: number[] = [];
    await convertNotebookToBundle(file, {
      optimizeImage: stubOptimizer,
      onProgress: (done, total) => {
        expect(total).toBe(3);
        seen.push(done);
      },
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('preserves SMART shortcut hyperlinks into manifest.objectLinks', async () => {
    // Mirrors the on-disk format observed in the Minnesota Studies Baseball
    // Final Review notebook: SMART writes page jumps as image elements with
    // shortcut="page://pageN.svg" plus shortcutArea="1". The converter must
    // translate the filename target into the .spartnb's own page index AND
    // stamp a stable data-edit-id on the linked element so the editor can
    // reconnect the FAB later.
    const zip = new JSZip();
    zip.file('imsmanifest.xml', MANIFEST);
    zip.file('images/home.png', pngBytes());
    // page2 (manifest position 0) carries a home-base hotspot pointing at
    // page1 (manifest position 2 in the second lesson group).
    const pageWithLink =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<svg width="800" height="600" xml:id="p">` +
      `<g class="foreground">` +
      `<image xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `shortcut="page://page1.svg" shortcutArea="1" ` +
      `xml:id="annotation.HOMEBASE1" ` +
      `x="640" y="450" width="80" height="80" ` +
      `xlink:href="images/home.png"/>` +
      `</g></svg>`;
    zip.file('page2.svg', pageWithLink);
    zip.file('page0.svg', pageSvg(720));
    zip.file('page1.svg', pageSvg(600));
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'WithLinks.notebook');

    const result = await convertNotebookToBundle(file, {
      optimizeImage: stubOptimizer,
    });
    const bundle = await readBundle(result.blob);
    interface WithLinks extends BundleManifest {
      objectLinks?: {
        objectId: string;
        sourcePage: number;
        targetPage: number;
        xFrac: number;
        yFrac: number;
        wFrac: number;
        hFrac: number;
      }[];
    }
    const manifest = JSON.parse(
      await readEntry(bundle, 'manifest.json')
    ) as WithLinks;

    // Manifest order from the test fixture: page2 (idx 0), page0 (idx 1),
    // page1 (idx 2). The shortcut on source page2 → target page1 should
    // become sourcePage:0, targetPage:2 in the converted bundle.
    expect(manifest.objectLinks).toHaveLength(1);
    const link = (manifest.objectLinks ?? [])[0];
    expect(link).toMatchObject({
      objectId: 'link-annotation.HOMEBASE1',
      sourcePage: 0,
      targetPage: 2,
    });
    // Normalized hotspot box: x=640/800, y=450/600, w=80/800, h=80/600.
    expect(link.xFrac).toBeCloseTo(0.8, 5);
    expect(link.yFrac).toBeCloseTo(0.75, 5);
    expect(link.wFrac).toBeCloseTo(0.1, 5);
    expect(link.hFrac).toBeCloseTo(0.1333333, 5);

    // The linked element should carry the stamped data-edit-id so the
    // editor's ensureObjectIds preserves it and the link FAB reconnects.
    const page0Svg = await readEntry(bundle, 'pages/0.svg');
    expect(page0Svg).toContain('data-edit-id="link-annotation.HOMEBASE1"');
  });
});
