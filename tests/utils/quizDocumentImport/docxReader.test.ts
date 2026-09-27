/**
 * The Word reader (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D2, D4, D13). Fixtures
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

/* ─── Layout (docs/plans/shipped/QUIZ_IMPORT_RELIABILITY.md R2, R24) ──────────────── */

const cell = (inner: string, props = ''): string =>
  `<w:tc>${props ? `<w:tcPr>${props}</w:tcPr>` : ''}${inner}</w:tc>`;
const row = (...cells: string[]): string => `<w:tr>${cells.join('')}</w:tr>`;
const table = (...rows: string[]): string => `<w:tbl>${rows.join('')}</w:tbl>`;

async function makeDocxWithParts(
  body: string,
  parts: Record<string, string>
): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${W} ${R} ${A}><w:body>${body}</w:body></w:document>`
  );
  for (const [path, xml] of Object.entries(parts)) zip.file(path, xml);
  return zip.generateAsync({ type: 'blob' });
}

describe('readDocx — tables and tabs', () => {
  it('reads a table row as one line with a segment per cell', async () => {
    const { lines } = await readDocx(
      await makeDocx(
        [
          para(run('1. Pick the largest number.')),
          table(
            row(cell(para(run('a. 357.4'))), cell(para(run('d. 35,740')))),
            row(cell(para(run('b. 3,574'))), cell(para(run('e. 0.3574')))),
            row(cell(para(run('c. 35.74'))), cell(para()))
          ),
        ].join('')
      )
    );
    expect(lines.map((l) => l.text.trim())).toEqual([
      '1. Pick the largest number.',
      'a. 357.4 d. 35,740',
      'b. 3,574 e. 0.3574',
      'c. 35.74',
    ]);
    expect(lines[1].segments?.map((s) => s.text)).toEqual([
      'a. 357.4',
      'd. 35,740',
    ]);
  });

  it('keeps a two-paragraph cell, a spanned cell and a merged cell in their columns', async () => {
    const { lines } = await readDocx(
      await makeDocx(
        table(
          row(
            cell(para(run('ITEM 1')) + para(run('Which is a noun?'))),
            cell(para(run('Correct Answer: b')), '<w:gridSpan w:val="2"/>')
          ),
          row(cell(para(run('ITEM 2'))), cell(para(), '<w:vMerge/>'))
        )
      )
    );
    expect(lines[0].segments?.map((s) => s.text)).toEqual([
      'ITEM 1 Which is a noun?',
      'Correct Answer: b',
    ]);
    expect(lines[1].segments?.map((s) => s.text)).toEqual(['ITEM 2', '']);
  });

  it('flattens a nested table into its parent cell', async () => {
    const { lines } = await readDocx(
      await makeDocx(
        table(
          row(
            cell(para(run('1'))),
            cell(table(row(cell(para(run('B'))), cell(para(run('noun'))))))
          )
        )
      )
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].segments?.map((s) => s.text)).toEqual(['1', 'B noun']);
  });

  it('splits at a tab and keeps bold on the choice it covers', async () => {
    const { lines } = await readDocx(
      await makeDocx(
        `<w:p>${run('a. Rome')}<w:r><w:tab/></w:r>${run('d. Paris', 'b')}</w:p>`
      )
    );
    expect(lines[0].segments?.map((s) => s.text)).toEqual([
      'a. Rome',
      'd. Paris',
    ]);
    expect(lines[0].segments?.[0].emphasized).toBeUndefined();
    expect(lines[0].segments?.[1].emphasized).toBe(true);
  });

  it('reads a text box once, after the paragraph that anchors it', async () => {
    const { lines } = await readDocx(
      await makeDocx(
        `<w:p>${run('1. Read the note.')}<w:r><w:drawing><w:txbxContent>${para(run('Boxed note'))}</w:txbxContent></w:drawing></w:r></w:p>` +
          para(run('A. Yes'))
      )
    );
    expect(lines.map((l) => l.text)).toEqual([
      '1. Read the note.',
      'Boxed note',
      'A. Yes',
    ]);
  });

  it('parses options laid out in a table as separate choices', async () => {
    const { lines } = await readDocx(
      await makeDocx(
        [
          para(run('1. Which city is in Italy?')),
          table(row(cell(para(run('A. Rome'))), cell(para(run('B. Paris'))))),
        ].join('')
      )
    );
    const [q] = parseQuestionLines(lines);
    expect(q.options.map((o) => o.text)).toEqual(['Rome', 'Paris']);
  });
});

const numbering = (abstracts: string, nums: string): string =>
  `<?xml version="1.0"?><w:numbering ${W}>${abstracts}${nums}</w:numbering>`;
const lvl = (ilvl: number, fmt: string, text: string, start = 1): string =>
  `<w:lvl w:ilvl="${ilvl}"><w:start w:val="${start}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/></w:lvl>`;
const numPara = (numId: string, ilvl: number, text: string): string =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${run(text)}</w:p>`;

describe('readDocx — Word list numbering (R24)', () => {
  const NUMBERING = numbering(
    `<w:abstractNum w:abstractNumId="0">${lvl(0, 'decimal', '%1.')}${lvl(1, 'lowerLetter', '%2)')}</w:abstractNum>` +
      `<w:abstractNum w:abstractNumId="1">${lvl(0, 'bullet', '•')}</w:abstractNum>` +
      `<w:abstractNum w:abstractNumId="2">${lvl(0, 'upperRoman', '(%1)')}</w:abstractNum>`,
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>` +
      `<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>` +
      `<w:num w:numId="3"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="10"/></w:lvlOverride></w:num>` +
      `<w:num w:numId="4"><w:abstractNumId w:val="2"/></w:num>`
  );

  it('renders question numbers and option letters Word adds itself', async () => {
    const { lines } = await readDocx(
      await makeDocxWithParts(
        [
          numPara('1', 0, 'Which planet is closest to the sun?'),
          numPara('1', 1, 'Mercury'),
          numPara('1', 1, 'Venus'),
          numPara('1', 0, 'Which planet is largest?'),
          numPara('1', 1, 'Jupiter'),
          numPara('2', 0, 'A bullet adds nothing'),
          numPara('4', 0, 'Roman'),
        ].join(''),
        { 'word/numbering.xml': NUMBERING }
      )
    );
    expect(lines.map((l) => l.text)).toEqual([
      '1. Which planet is closest to the sun?',
      'a) Mercury',
      'b) Venus',
      '2. Which planet is largest?',
      // The letters restart under each new question.
      'a) Jupiter',
      'A bullet adds nothing',
      '(I) Roman',
    ]);
    expect(lines[0].segments?.map((s) => s.text)).toEqual([
      '1.',
      'Which planet is closest to the sun?',
    ]);
    const questions = parseQuestionLines(lines);
    expect(questions.map((q) => q.number)).toEqual([1, 2]);
    expect(questions[0].options.map((o) => o.text)).toEqual([
      'Mercury',
      'Venus',
    ]);
  });

  it('restarts a list that overrides its start', async () => {
    const { lines } = await readDocx(
      await makeDocxWithParts(
        [
          numPara('1', 0, 'First'),
          numPara('3', 0, 'Restarted'),
          numPara('3', 0, 'Next'),
        ].join(''),
        { 'word/numbering.xml': NUMBERING }
      )
    );
    expect(lines.map((l) => l.text)).toEqual([
      '1. First',
      '10. Restarted',
      '11. Next',
    ]);
  });

  it('numbers a paragraph whose style carries the list', async () => {
    const styles = `<?xml version="1.0"?><w:styles ${W}>
      <w:style w:type="paragraph" w:styleId="QuestionBase"><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>
      <w:style w:type="paragraph" w:styleId="Question"><w:basedOn w:val="QuestionBase"/></w:style>
    </w:styles>`;
    const styled = (text: string) =>
      `<w:p><w:pPr><w:pStyle w:val="Question"/></w:pPr>${run(text)}</w:p>`;
    const { lines } = await readDocx(
      await makeDocxWithParts([styled('One?'), styled('Two?')].join(''), {
        'word/numbering.xml': NUMBERING,
        'word/styles.xml': styles,
      })
    );
    expect(lines.map((l) => l.text)).toEqual(['1. One?', '2. Two?']);
  });
});
