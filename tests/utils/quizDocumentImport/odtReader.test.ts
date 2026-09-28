/** The OpenDocument reader, against real .odt archives built with JSZip. */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readOdt } from '@/utils/quizDocumentImport/odtReader';
import {
  documentKind,
  readAnswerKeyFile,
  readQuizDocument,
} from '@/utils/quizDocumentImport';

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
].join(' ');

const STYLES = `
  <style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
  <style:style style:name="Under" style:family="text"><style:text-properties style:text-underline-style="solid"/></style:style>
  <style:style style:name="Plain" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
  <style:style style:name="BoldChild" style:family="text" style:parent-style-name="Bold"/>
  <text:list-style style:name="L1">
    <text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/>
    <text:list-level-style-number text:level="2" style:num-format="a" style:num-suffix="."/>
  </text:list-style>`;

async function makeOdt(
  body: string,
  media: Record<string, string> = {}
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  zip.file(
    'content.xml',
    `<?xml version="1.0"?><office:document-content ${NS}><office:automatic-styles>${STYLES}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`
  );
  for (const [path, content] of Object.entries(media)) zip.file(path, content);
  return zip.generateAsync({ type: 'blob' });
}

const p = (inner: string): string => `<text:p>${inner}</text:p>`;
const cell = (inner: string): string =>
  `<table:table-cell>${p(inner)}</table:table-cell>`;

describe('readOdt', () => {
  it('is recognised by extension and by type', () => {
    expect(documentKind(new Blob([]), 'Unit 1.odt')).toBe('odt');
    expect(
      documentKind(
        new Blob([], { type: 'application/vnd.oasis.opendocument.text' })
      )
    ).toBe('odt');
  });

  it('reads tabs as segments, text:s as spaces and styles as emphasis', async () => {
    const { lines } = await readOdt(
      await makeOdt(
        p('<text:tab/>1.<text:tab/>Which<text:s text:c="2"/>one?') +
          p('<text:span text:style-name="Plain">a. wrong</text:span>') +
          p('<text:span text:style-name="BoldChild">b. right</text:span>') +
          p('c. <text:span text:style-name="Under">also marked</text:span>') +
          p('')
      )
    );
    expect(lines.map((l) => l.text)).toEqual([
      ' 1. Which  one?',
      'a. wrong',
      'b. right',
      'c. also marked',
    ]);
    expect(lines[0].segments?.map((s) => s.text)).toEqual([
      '',
      '1.',
      'Which  one?',
    ]);
    expect(lines.map((l) => Boolean(l.emphasized))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it('reads a table row as one line with a segment per cell', async () => {
    const { lines } = await readOdt(
      await makeOdt(
        `<table:table><table:table-columns><table:table-column/></table:table-columns><table:table-row>${cell('a.')}${cell('Paris')}${cell('c.')}${cell('<text:span text:style-name="Bold">Rome</text:span>')}</table:table-row></table:table>`
      )
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].segments?.map((s) => s.text)).toEqual([
      'a.',
      'Paris',
      'c.',
      'Rome',
    ]);
    expect(lines[0].segments?.[3].emphasized).toBe(true);
  });

  it('numbers list items the way the list style prints them', async () => {
    const { lines } = await readOdt(
      await makeOdt(
        `<text:list text:style-name="L1">
          <text:list-item>${p('First question')}<text:list><text:list-item>${p('choice one')}</text:list-item><text:list-item>${p('choice two')}</text:list-item></text:list></text:list-item>
          <text:list-item>${p('Second question')}</text:list-item>
        </text:list>
        ${p('Between')}
        <text:list text:style-name="L1" text:continue-numbering="true"><text:list-item>${p('Third question')}</text:list-item></text:list>`
      )
    );
    expect(lines.map((l) => l.text)).toEqual([
      '1. First question',
      'a. choice one',
      'b. choice two',
      '2. Second question',
      'Between',
      '3. Third question',
    ]);
  });

  it('pulls pictures out and anchors them to their paragraph', async () => {
    const frame = (href: string) =>
      `<draw:frame><draw:image xlink:href="${href}"/></draw:frame>`;
    const { lines, images } = await readOdt(
      await makeOdt(
        p(`1. Look at the map ${frame('Pictures/map.png')}`) +
          p(frame('Pictures/map.png')) +
          p(frame('Pictures/art.wmf')),
        { 'Pictures/map.png': 'png-bytes', 'Pictures/art.wmf': 'wmf' }
      )
    );
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      id: 'img-1',
      contentType: 'image/png',
      name: 'map.png',
    });
    expect(lines[0].imageIds).toEqual(['img-1']);
    expect(lines[1].imageIds).toEqual(['img-1']);
    expect(lines).toHaveLength(2);
  });

  it('imports a test whose answers are marked in bold', async () => {
    const quiz = await readQuizDocument(
      new File(
        [
          await makeOdt(
            p('1. What is the capital of France?') +
              p('a. Rome') +
              p('<text:span text:style-name="Bold">b. Paris</text:span>') +
              p('c. Madrid') +
              p('2. Which is a primary color?') +
              p('a. Green') +
              p('<text:span text:style-name="Bold">b. Blue</text:span>')
          ),
        ],
        'Unit 2 Quiz.odt'
      )
    );
    expect(quiz.title).toBe('Unit 2 Quiz');
    expect(quiz.questions.map((q) => q.correctAnswer)).toEqual([
      'Paris',
      'Blue',
    ]);
  });

  it('reads an answer key saved as .odt', async () => {
    const items = await readAnswerKeyFile(
      new File([await makeOdt(p('1. B') + p('2. C'))], 'key.odt')
    );
    expect(items.map((i) => [i.item, i.answer])).toEqual([
      [1, 'B'],
      [2, 'C'],
    ]);
  });

  it('refuses an archive with no content.xml', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
    await expect(
      readOdt(await zip.generateAsync({ type: 'blob' }))
    ).rejects.toThrow(/couldn't be read/);
  });
});
