// Pages, files, links and discussion prompts out of a Schoology course export (IMPORT.md D19).

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  courseFileReader,
  readCourseMaterials,
} from '@/utils/quizDocumentImport/cartridgeReader';

const MANIFEST = `<?xml version="1.0"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata><lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>Biology 1: Period 3</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom></metadata>
  <organizations><organization identifier="org" structure="rooted-hierarchy"><item identifier="root">
    <item identifier="f1"><title>Unit 1: Cells</title>
      <item identifier="i1" identifierref="page1"><title>Cell parts</title></item>
      <item identifier="i2" identifierref="file1"><title>Lab sheet</title></item>
      <item identifier="f2"><title>Extra</title>
        <item identifier="i3" identifierref="link1"><title>Cells alive</title></item>
      </item>
      <item identifier="i4" identifierref="disc1"><title>Cells in your life</title></item>
    </item>
    <item identifier="i5" identifierref="link2"><title></title></item>
    <item identifier="i6" identifierref="bad"><title>Not a web link</title></item>
  </item></organization></organizations>
  <resources>
    <resource identifier="page1" type="webcontent" href="pages/cell-parts.html"><file href="pages/cell-parts.html"/></resource>
    <resource identifier="file1" type="webcontent" href="files/Lab%20sheet.pdf"><file href="files/Lab sheet.pdf"/></resource>
    <resource identifier="pic" type="webcontent" href="files/diagram.png"><file href="files/diagram.png"/></resource>
    <resource identifier="link1" type="imswl_xmlv1p1"><file href="link1.xml"/></resource>
    <resource identifier="link2" type="imswl_xmlv1p1"><file href="link2.xml"/></resource>
    <resource identifier="bad" type="imswl_xmlv1p1"><file href="bad.xml"/></resource>
    <resource identifier="disc1" type="imsdt_xmlv1p1"><file href="disc1.xml"/></resource>
    <resource identifier="disc2" type="imsdt_xmlv1p1"><file href="disc2.xml"/></resource>
  </resources>
</manifest>`;

const link = (title: string, href: string): string =>
  `<?xml version="1.0"?><webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1"><title>${title}</title><url href="${href}"/></webLink>`;

const topic = (title: string, html: string): string =>
  `<?xml version="1.0"?><topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1"><title>${title}</title><text texttype="text/html">${html.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></topic>`;

async function courseZip(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('imsmanifest.xml', MANIFEST);
  zip.file(
    'pages/cell-parts.html',
    '<html><head><title>Parts</title><script>alert(1)</script></head><body><h2>Nucleus</h2><p>Holds the DNA.</p><ul><li>Membrane</li></ul></body></html>'
  );
  zip.file('files/Lab sheet.pdf', '%PDF-1.4 lab');
  zip.file('files/diagram.png', 'png');
  zip.file('link1.xml', link('Cells Alive', 'https://www.cellsalive.com/'));
  zip.file('link2.xml', link('Khan cells', 'https://khanacademy.org/cells'));
  zip.file('bad.xml', link('Script', 'javascript:alert(1)'));
  zip.file(
    'disc1.xml',
    topic(
      'Where you see cells',
      '<p>Name one place you see cells&nbsp;at home.</p>'
    )
  );
  zip.file('disc2.xml', topic('Loose topic', '<p>Not in the outline.</p>'));
  return zip.generateAsync({ type: 'blob' });
}

describe('readCourseMaterials', () => {
  it('reads pages, files, links and discussions in their folders', async () => {
    const course = await readCourseMaterials(await courseZip(), 'Fallback');
    expect(course.title).toBe('Biology 1: Period 3');
    const byId = new Map(course.materials.map((m) => [m.id, m]));

    expect(byId.get('page1')).toMatchObject({
      kind: 'page',
      title: 'Cell parts',
      folderPath: ['Unit 1: Cells'],
      text: 'Nucleus\nHolds the DNA.\n- Membrane',
    });
    expect(byId.get('file1')).toMatchObject({
      kind: 'file',
      title: 'Lab sheet',
      fileName: 'Lab sheet.pdf',
      folderPath: ['Unit 1: Cells'],
    });
    expect(byId.get('link1')).toMatchObject({
      kind: 'link',
      title: 'Cells alive',
      url: 'https://www.cellsalive.com/',
      folderPath: ['Unit 1: Cells', 'Extra'],
    });
    expect(byId.get('disc1')).toMatchObject({
      kind: 'discussion',
      title: 'Cells in your life',
      text: 'Name one place you see cells at home.',
    });
  });

  it('uses the item’s own title when the outline has none', async () => {
    const course = await readCourseMaterials(await courseZip(), 'Fallback');
    expect(course.materials.find((m) => m.id === 'link2')?.title).toBe(
      'Khan cells'
    );
  });

  it('drops non-web links and loose page attachments, and keeps loose discussions', async () => {
    const course = await readCourseMaterials(await courseZip(), 'Fallback');
    const ids = course.materials.map((m) => m.id);
    expect(ids).not.toContain('bad');
    expect(ids).not.toContain('pic');
    expect(course.materials.find((m) => m.id === 'disc2')).toMatchObject({
      kind: 'discussion',
      folderPath: [],
    });
  });

  it('refuses a zip with no manifest', async () => {
    const zip = new JSZip();
    zip.file('a.txt', 'x');
    await expect(
      readCourseMaterials(await zip.generateAsync({ type: 'blob' }), 'X')
    ).rejects.toThrow(/LMS export/);
  });
});

describe('courseFileReader', () => {
  it('reads a file out of the export with its type', async () => {
    const blob = await courseZip();
    const course = await readCourseMaterials(blob, 'Fallback');
    const material = course.materials.find((m) => m.id === 'file1');
    if (!material) throw new Error('missing');
    const read = courseFileReader(blob);
    const file = await read(material, 1024);
    expect(file.name).toBe('Lab sheet.pdf');
    expect(file.type).toBe('application/pdf');
    expect(await file.text()).toBe('%PDF-1.4 lab');
  });

  it('refuses a file larger than the cap', async () => {
    const blob = await courseZip();
    const course = await readCourseMaterials(blob, 'Fallback');
    const material = course.materials.find((m) => m.id === 'file1');
    if (!material) throw new Error('missing');
    await expect(courseFileReader(blob)(material, 4)).rejects.toThrow();
  });
});
