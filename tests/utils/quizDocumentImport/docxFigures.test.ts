/**
 * A Word file or exported Google Doc with figures, a table and chemistry:
 * what the reader keeps, and what it tells the teacher it could not.
 * Fixtures are real .docx archives built with JSZip.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readDocx } from '@/utils/quizDocumentImport/docxReader';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
].join(' ');

const run = (text: string, align?: 'subscript' | 'superscript'): string =>
  `<w:r>${align ? `<w:rPr><w:vertAlign w:val="${align}"/></w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (...runs: string[]): string => `<w:p>${runs.join('')}</w:p>`;
const picture = (id: string): string =>
  `<w:r><w:drawing><a:blip r:embed="${id}"/></w:drawing></w:r>`;
const textBox = (text: string): string =>
  `<wps:wsp><wps:txbx><w:txbxContent>${para(run(text))}</w:txbxContent></wps:txbx></wps:wsp>`;
const row = (...cells: string[]): string =>
  `<w:tr>${cells.map((c) => `<w:tc>${para(run(c))}</w:tc>`).join('')}</w:tr>`;

async function makeDocx(body: string, pictures: string[] = []): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>`
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships>${pictures
      .map((id) => `<Relationship Id="${id}" Target="media/${id}.png"/>`)
      .join('')}</Relationships>`
  );
  for (const id of pictures) zip.file(`word/media/${id}.png`, id);
  return zip.generateAsync({ type: 'blob' });
}

const read = async (body: string, pictures: string[] = []) => {
  const { lines } = await readDocx(await makeDocx(body, pictures));
  return { lines, ...parseDocument(lines) };
};

describe('chemistry and equations in a Word file', () => {
  it('writes subscript and superscript digits as ₂ and ²', async () => {
    const { lines } = await read(
      para(
        run('1. H'),
        run('2', 'subscript'),
        run('O has x'),
        run('2', 'superscript'),
        run(' atoms?')
      )
    );
    expect(lines[0].text).toBe('1. H₂O has x² atoms?');
  });

  it('reads a word set over an arrow as a labelled arrow', async () => {
    const { lines } = await read(
      para(
        run('1. H'),
        run('2', 'subscript'),
        run('O'),
        run('2', 'subscript'),
        run(' ', 'subscript'),
        '<m:oMath><m:f><m:num><m:r><m:t>peroxidase</m:t></m:r></m:num></m:f></m:oMath>',
        run('&gt;', 'subscript'),
        run(' H'),
        run('2', 'subscript'),
        run('O')
      )
    );
    expect(lines[0].text.replace(/\s+/g, ' ')).toBe('1. H₂O₂ —peroxidase→ H₂O');
  });
});

describe('a table in a Word question', () => {
  it('keeps each row on its own line of the question', async () => {
    const { questions } = await read(
      [
        para(run('1. Use the table.')),
        `<w:tbl>${row('Fatty Acid', 'Carbons')}${row('Stearic Acid', '18')}</w:tbl>`,
        para(run('What is its melting point?')),
        para(run('a. 80')),
        para(run('b. 45')),
      ].join('')
    );
    expect(questions[0].text).toBe(
      '1. Use the table.\nFatty Acid | Carbons\nStearic Acid | 18\nWhat is its melting point?'.replace(
        '1. ',
        ''
      )
    );
    expect(questions[0].options).toHaveLength(2);
  });

  it('still reads choices laid out in a table as choices', async () => {
    const { questions } = await read(
      [
        para(run('1. Pick one.')),
        `<w:tbl>${row('a. Rome', 'b. Oslo')}</w:tbl>`,
      ].join('')
    );
    expect(questions[0].text).toBe('Pick one.');
    expect(questions[0].options.map((o) => o.text)).toEqual(['Rome', 'Oslo']);
  });
});

describe('figures in a Word file', () => {
  it('names a picture by the caption near it and gives it to the questions that say so', async () => {
    const { questions } = await read(
      [
        para(run('1. What starts a reaction?')),
        para(run('a. heat')),
        para(run('b. light')),
        para(picture('fig2')),
        para(run('2. In Figure 2 what type of chain is this?')),
        para(run('a. saturated')),
        para(run('b. unsaturated')),
        para(run('                    (Figure 2)')),
        para(run('3. Unrelated?')),
        para(run('a. yes')),
        para(run('b. no')),
      ].join(''),
      ['fig2']
    );
    expect(questions.map((q) => q.imageIds.length)).toEqual([0, 1, 0]);
    expect(questions[1].options[1].text).toBe('unsaturated');
  });

  it('gives each of two captions on one line its own picture', async () => {
    const { questions } = await read(
      [
        para(run('1. Why?')),
        para(run('a. one')),
        para(run('b. two')),
        para(picture('fig3')),
        para(picture('fig4')),
        para(run('   (Figure 3)            (Figure 4)')),
        para(run('2. What do Figures 3 and 4 show?')),
        para(run('a. yes')),
        para(run('b. no')),
      ].join(''),
      ['fig3', 'fig4']
    );
    expect(questions[0].imageIds).toEqual([]);
    expect(questions[1].imageIds).toHaveLength(2);
  });

  it('says so when a figure’s letters are not in its picture files', async () => {
    const { questions } = await read(
      [
        para(run('Use figure 1 to answer questions # 1 and 2')),
        para(run('A')),
        para(picture('chain')),
        para(picture('dot'), picture('dot')),
        para(run('B')),
        para(run(' (Figure1)')),
        para(run('1. In Figure 1, which letter is a monomer?')),
        para(run('2. In Figure 1, which letter is a polymer?')),
        para(run('Key:')),
        para(run('1. B')),
        para(run('2. A')),
      ].join(''),
      ['chain', 'dot']
    );
    expect(questions.map((q) => q.imageIds.length)).toEqual([2, 2]);
    expect(questions[0].warnings.join(' ')).toMatch(
      /lettering printed with this question’s picture \(A, B\)/
    );
    expect(questions[0].options.map((o) => o.text)).toEqual(['A', 'B']);
  });

  it('keeps labels drawn over a picture out of the choice above it', async () => {
    const { questions } = await read(
      [
        para(run('1. Which is the catalyst?')),
        para(run('a. water')),
        para(run('b. peroxidase')),
        para(picture('graph'), textBox('Reaction 1'), textBox('Reaction 2')),
        para(run('2. Using the graph to the right which is catalyzed?')),
        para(run('a. Reaction 1')),
        para(run('b. Reaction 2')),
        para(run('        (Graph 1)')),
        para(run('3. What does Graph 1 describe?')),
        para(run('a. heat')),
        para(run('b. cold')),
      ].join(''),
      ['graph']
    );
    expect(questions[0].options[1].text).toBe('peroxidase');
    expect(questions.map((q) => q.imageIds.length)).toEqual([0, 1, 1]);
    expect(questions[1].warnings.join(' ')).toMatch(/Reaction 1, Reaction 2/);
  });

  it('still reads a text box that holds the test’s own text', async () => {
    const { lines } = await read(
      para(
        picture('pic'),
        textBox('Read the directions on this page before you answer anything.')
      ),
      ['pic']
    );
    expect(lines.map((l) => l.text)).toContain(
      'Read the directions on this page before you answer anything.'
    );
  });

  it('reads choices typed in boxes beside a picture as choices', async () => {
    const { questions } = await read(
      [
        para(
          run('1. Which part makes proteins?'),
          picture('cell'),
          textBox('A. Nucleus'),
          textBox('B. Ribosome')
        ),
      ].join(''),
      ['cell']
    );
    expect(questions[0].options.map((o) => o.text)).toEqual([
      'Nucleus',
      'Ribosome',
    ]);
  });

  it('keeps a picture that sits inside a text box', async () => {
    const boxed = `<wps:wsp><wps:txbx><w:txbxContent>${para(picture('inner'), run('Figure 2'))}</w:txbxContent></wps:txbx></wps:wsp>`;
    const { lines } = await read(para(picture('outer'), boxed), [
      'outer',
      'inner',
    ]);
    expect(lines.flatMap((l) => l.imageIds ?? [])).toHaveLength(2);
  });

  it('puts a diagram on every question its lead-in names', async () => {
    const { questions } = await read(
      [
        para(run('Use the diagram to answer questions 1-3.')),
        para(run('1. Which letter indicates the enzyme?'), picture('diagram')),
        para(run('2. Which letter indicates the products?')),
        para(run('3. Which letter indicates the active site?')),
        para(run('4. Unrelated?')),
      ].join(''),
      ['diagram']
    );
    expect(questions.map((q) => q.imageIds.length)).toEqual([1, 1, 1, 0]);
  });
});
