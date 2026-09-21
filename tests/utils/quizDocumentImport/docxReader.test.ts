/**
 * The Word reader (docs/plans/QUIZ_DOCUMENT_IMPORT.md D2, D4, D13). Fixtures
 * are real .docx archives built with JSZip rather than stubs, so the test
 * fails if the parts of the format we depend on are read wrongly.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readDocx } from '@/utils/quizDocumentImport/docxReader';
import { parseQuestionLines } from '@/utils/quizDocumentImport/parseQuestions';

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R =
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

/** One run, optionally bold / underlined / highlighted. */
const run = (
  text: string,
  mark?: 'b' | 'u' | 'highlight' | 'b-off'
): string => {
  const props =
    mark === 'b'
      ? '<w:rPr><w:b/></w:rPr>'
      : mark === 'b-off'
        ? '<w:rPr><w:b w:val="0"/></w:rPr>'
        : mark === 'u'
          ? '<w:rPr><w:u w:val="single"/></w:rPr>'
          : mark === 'highlight'
            ? '<w:rPr><w:highlight w:val="yellow"/></w:rPr>'
            : '';
  return `<w:r>${props}<w:t xml:space="preserve">${text}</w:t></w:r>`;
};

const para = (...runs: string[]): string => `<w:p>${runs.join('')}</w:p>`;

const drawingPara = (embedId: string, text = ''): string =>
  `<w:p>${text ? run(text) : ''}<w:drawing><a:blip r:embed="${embedId}"/></w:drawing></w:p>`;

async function makeDocx(
  body: string,
  opts: { rels?: Record<string, string>; media?: Record<string, string> } = {}
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${W} ${R} ${A}><w:body>${body}</w:body></w:document>`
  );
  const rels = Object.entries(opts.rels ?? {})
    .map(([id, target]) => `<Relationship Id="${id}" Target="${target}"/>`)
    .join('');
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships>${rels}</Relationships>`
  );
  for (const [path, content] of Object.entries(opts.media ?? {})) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'blob' });
}

describe('readDocx — text', () => {
  it('returns one line per paragraph, dropping empty ones', () => {
    return makeDocx(
      [
        para(run('1. Which planet is closest to the sun?')),
        para(),
        para(run('A. Mercury')),
        para(run('B. Venus')),
      ].join('')
    )
      .then(readDocx)
      .then(({ lines }) => {
        expect(lines.map((l) => l.text)).toEqual([
          '1. Which planet is closest to the sun?',
          'A. Mercury',
          'B. Venus',
        ]);
      });
  });

  it('joins runs that Word split mid-sentence', async () => {
    const { lines } = await readDocx(
      await makeDocx(para(run('1. Which planet is '), run('closest?')))
    );
    expect(lines[0].text).toBe('1. Which planet is closest?');
  });

  it('turns tabs into spaces', async () => {
    const { lines } = await readDocx(
      await makeDocx(`<w:p>${run('1.')}<w:tab/>${run('Question?')}</w:p>`)
    );
    expect(lines[0].text).toBe('1. Question?');
  });

  it('rejects a zip that is not a Word file', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'not a docx');
    await expect(
      readDocx(await zip.generateAsync({ type: 'blob' }))
    ).rejects.toThrow(/couldn't be read/i);
  });
});

describe('readDocx — the answer marked in the document', () => {
  it.each([
    ['bold', 'b' as const],
    ['underline', 'u' as const],
    ['highlight', 'highlight' as const],
  ])('marks an option the teacher set in %s', async (_label, mark) => {
    const { lines } = await readDocx(
      await makeDocx(
        [
          para(run('1. Which planet is closest to the sun?')),
          para(run('A. '), run('Mercury', mark)),
          para(run('B. Venus')),
        ].join('')
      )
    );
    expect(lines[1].emphasized).toBe(true);
    expect(lines[2].emphasized).toBeUndefined();

    const [q] = parseQuestionLines(lines);
    expect(q.correctAnswer).toBe('Mercury');
  });

  it('honours bold explicitly switched off', async () => {
    const { lines } = await readDocx(
      await makeDocx(para(run('A. Mercury', 'b-off')))
    );
    expect(lines[0].emphasized).toBeUndefined();
  });

  it('ignores emphasis that covers no word', async () => {
    const { lines } = await readDocx(
      await makeDocx(para(run('  ', 'b'), run('A. Mercury')))
    );
    expect(lines[0].emphasized).toBeUndefined();
  });
});

describe('readDocx — pictures', () => {
  it('pulls a picture out and anchors it to its paragraph', async () => {
    const { lines, images } = await readDocx(
      await makeDocx(
        [
          para(run('1. What does this diagram show?')),
          drawingPara('rId5'),
          para(run('A. A cell')),
        ].join(''),
        {
          rels: { rId5: 'media/diagram.png' },
          media: { 'word/media/diagram.png': 'PNGDATA' },
        }
      )
    );
    expect(images).toHaveLength(1);
    expect(images[0].contentType).toBe('image/png');
    expect(images[0].name).toBe('diagram.png');
    expect(lines.find((l) => l.imageIds)?.imageIds).toEqual([images[0].id]);
  });

  it('keeps one picture used twice as a single image', async () => {
    const { images } = await readDocx(
      await makeDocx(
        [
          drawingPara('rId5', '1. First?'),
          drawingPara('rId5', '2. Second?'),
        ].join(''),
        {
          rels: { rId5: 'media/shared.png' },
          media: { 'word/media/shared.png': 'PNGDATA' },
        }
      )
    );
    expect(images).toHaveLength(1);
  });

  it('carries a picture onto the question it sits under', async () => {
    const { lines, images } = await readDocx(
      await makeDocx(
        [
          para(run('1. What does this diagram show?')),
          drawingPara('rId5'),
          para(run('A. A cell')),
          para(run('B. A crystal')),
        ].join(''),
        {
          rels: { rId5: 'media/diagram.png' },
          media: { 'word/media/diagram.png': 'PNGDATA' },
        }
      )
    );
    const [q] = parseQuestionLines(lines);
    expect(q.imageIds).toEqual([images[0].id]);
  });

  it('skips a file type Quiz cannot show', async () => {
    const { images } = await readDocx(
      await makeDocx(drawingPara('rId5'), {
        rels: { rId5: 'media/drawing.emf' },
        media: { 'word/media/drawing.emf': 'EMFDATA' },
      })
    );
    expect(images).toEqual([]);
  });
});
