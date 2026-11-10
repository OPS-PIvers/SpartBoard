/**
 * Regression tests for a science test that read badly without AI: cropped and
 * captioned figures, a ruled table, a labelled reaction arrow, subscripts,
 * two-column matching and questions answered with a letter off a diagram.
 * Fixtures are synthetic and copy only the layout.
 */
import { describe, it, expect } from 'vitest';
import {
  groupItemsIntoLines,
  type PdfTextItem,
} from '@/utils/quizDocumentImport/pdfReader';
import {
  captionLabel,
  growPicturesToLabels,
  imageBoxesFromOperatorList,
  mergeAcrossGaps,
  pageDrawings,
  placePictureLines,
  sharePicturesAcrossRanges,
  tableBoxes,
  type PageBox,
  type PositionedLine,
} from '@/utils/quizDocumentImport/pdfPictures';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import type { DocLine } from '@/utils/quizDocumentImport/types';

/** A fragment at (x, y) set in `size` points, `width` points wide. */
const item = (
  str: string,
  x: number,
  y: number,
  size = 12,
  width = str.length * size * 0.5
): PdfTextItem => ({ str, transform: [size, 0, 0, size, x, y], width });

describe('text set off the baseline', () => {
  it('writes small lowered digits as subscripts', () => {
    const lines = groupItemsIntoLines([
      item('H', 72, 700),
      item('2', 78, 698, 7.2),
      item('O', 82, 700),
      item('2', 88, 698, 7.2),
      item(' → H', 92, 700),
      item('2', 116, 698, 7.2),
      item('O', 120, 700),
    ]);
    expect(lines).toEqual(['H₂O₂ → H₂O']);
  });

  it('writes small raised digits as superscripts, even from their own baseline', () => {
    const lines = groupItemsIntoLines([
      item('x', 72, 700),
      item('2', 78, 705, 7.2),
      item(' + 10', 82, 700),
      item('3', 112, 705, 7.2),
    ]);
    expect(lines).toEqual(['x² + 10³']);
  });

  it('keeps a label over an arrow in its own line, in plain letters', () => {
    const lines = groupItemsIntoLines([
      item('14. In the reaction H', 55, 592),
      item('2', 181, 590, 7.2),
      item('O', 185, 592),
      item('2', 191, 590, 7.2),
      item('H', 263, 592),
      item('2', 269, 590, 7.2),
      item('O', 273, 592),
      item('𝑒𝑛𝑧𝑦𝑚𝑒', 200, 596, 10.5, 40),
      item('>', 251, 588, 14.9, 8),
      item('a. water', 73, 572),
    ]);
    expect(lines).toEqual([
      '14. In the reaction H₂O₂ —enzyme→ H₂O',
      'a. water',
    ]);
  });

  it('leaves two lines of ordinary text apart', () => {
    const lines = groupItemsIntoLines([
      item('first line of a stem', 72, 700),
      item('wraps', 72, 686),
    ]);
    expect(lines).toEqual(['first line of a stem', 'wraps']);
  });
});

const ops = {
  save: 10,
  restore: 11,
  transform: 12,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintImageMaskXObject: 83,
  paintSolidColorImageMask: 90,
  paintImageXObjectRepeat: 88,
  paintImageMaskXObjectRepeat: 89,
  paintInlineImageXObjectGroup: 87,
  paintImageMaskXObjectGroup: 84,
  clip: 29,
  eoClip: 30,
  constructPath: 91,
};
const viewport = { width: 100, height: 100, transform: [1, 0, 0, -1, 0, 100] };
const list = (...entries: Array<[number, unknown[] | null]>) => ({
  fnArray: entries.map(([fn]) => fn),
  argsArray: entries.map(([, args]) => args),
});
const box = (x: number, y: number, width: number, height: number): PageBox => ({
  x,
  y,
  width,
  height,
});

describe('pictures drawn under a clip', () => {
  it('keeps only the part of a cropped picture that shows', () => {
    const [picture] = imageBoxesFromOperatorList(
      list(
        [ops.save, null],
        [ops.eoClip, null],
        [ops.constructPath, [28, [], [50, 40, 90, 70]]],
        [ops.transform, [80, 0, 0, 60, 40, 30]],
        [ops.paintImageXObject, ['img']],
        [ops.restore, null]
      ),
      ops,
      viewport
    );
    expect(picture.x).toBeCloseTo(0.5);
    expect(picture.width).toBeCloseTo(0.4);
    expect(picture.y).toBeCloseTo(0.3);
    expect(picture.height).toBeCloseTo(0.3);
  });

  it('drops the clip again after the restore', () => {
    const boxes = imageBoxesFromOperatorList(
      list(
        [ops.save, null],
        [ops.eoClip, null],
        [ops.constructPath, [28, [], [0, 0, 10, 10]]],
        [ops.restore, null],
        [ops.transform, [50, 0, 0, 50, 20, 20]],
        [ops.paintImageXObject, ['img']]
      ),
      ops,
      viewport
    );
    expect(boxes).toHaveLength(1);
    expect(boxes[0].width).toBeCloseTo(0.5);
  });
});

describe('figures in pieces', () => {
  it('joins pieces with nothing printed between them', () => {
    const chain = box(0.2, 0.3, 0.25, 0.05);
    const dots = [box(0.18, 0.42, 0.05, 0.03), box(0.3, 0.42, 0.05, 0.03)];
    const merged = mergeAcrossGaps([chain, ...dots], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].y).toBeCloseTo(0.3);
    expect(merged[0].y + merged[0].height).toBeCloseTo(0.45);
  });

  it('keeps two pictures apart when text runs between them', () => {
    const merged = mergeAcrossGaps(
      [box(0.2, 0.2, 0.3, 0.1), box(0.2, 0.36, 0.3, 0.1)],
      [box(0.2, 0.31, 0.3, 0.02)]
    );
    expect(merged).toHaveLength(2);
  });
});

describe('ruled tables', () => {
  const grid = [
    [ops.constructPath, [20, [], [10, 40, 90, 40]]],
    [ops.constructPath, [20, [], [10, 50, 90, 50]]],
    [ops.constructPath, [20, [], [10, 60, 90, 60]]],
    [ops.constructPath, [20, [], [10, 40, 10, 60]]],
    [ops.constructPath, [20, [], [90, 40, 90, 60]]],
  ] as Array<[number, unknown[]]>;

  it('finds a grid of rules as one table', () => {
    const tables = tableBoxes(pageDrawings(list(...grid), ops, viewport).rules);
    expect(tables).toHaveLength(1);
    expect(tables[0].table).toBe(true);
    expect(tables[0].x).toBeCloseTo(0.1);
    expect(tables[0].width).toBeCloseTo(0.8);
  });

  it('ignores answer blanks, which never cross', () => {
    const rules = pageDrawings(
      list(grid[0], grid[1], grid[2]),
      ops,
      viewport
    ).rules;
    expect(tableBoxes(rules)).toEqual([]);
  });

  const positioned = (
    text: string,
    top: number,
    left: number,
    right: number
  ): PositionedLine => ({ line: { text, page: 1 }, top, left, right });

  it('takes a data table out of the text as a picture', () => {
    const table: PageBox = { ...box(0.1, 0.4, 0.8, 0.2), table: true };
    const lines = [
      positioned('5. Use the table.', 0.35, 0.1, 0.5),
      positioned('Fatty Acid Carbons', 0.45, 0.12, 0.6),
      positioned('Stearic Acid 18', 0.55, 0.12, 0.6),
      positioned('a. 80', 0.65, 0.12, 0.3),
    ];
    const grown = growPicturesToLabels(lines, [table]);
    expect(grown).toHaveLength(1);
    const placed = placePictureLines(1, lines, grown);
    expect(placed.map((l) => l.text)).toEqual([
      '5. Use the table.',
      '',
      'a. 80',
    ]);
  });

  it('leaves a table that lays out questions or choices as text', () => {
    const table: PageBox = { ...box(0.1, 0.4, 0.8, 0.2), table: true };
    const lines = [
      positioned('1. Protein', 0.45, 0.12, 0.3),
      positioned('2. Sugar', 0.55, 0.12, 0.3),
    ];
    expect(growPicturesToLabels(lines, [table])).toEqual([]);
  });
});

describe('captions and lettering', () => {
  const positioned = (
    text: string,
    top: number,
    left: number,
    right: number
  ): PositionedLine => ({ line: { text, page: 1 }, top, left, right });

  it('reads a caption and nothing longer', () => {
    expect(captionLabel('(Figure 2)')).toBe('figure 2');
    expect(captionLabel('(Figure1)')).toBe('figure 1');
    expect(captionLabel('Graph 1')).toBe('graph 1');
    expect(captionLabel('Table A: Melting points')).toBe('table a');
    expect(captionLabel('Figure 3 shows the pH each enzyme prefers.')).toBe(
      null
    );
    expect(captionLabel('In Figure 2 what type is this?')).toBe(null);
  });

  it('grows a picture over its letters and caption, and names it', () => {
    const lines = [
      positioned(
        'Use figure 1 to answer questions # 10 and 11',
        0.27,
        0.1,
        0.6
      ),
      positioned('A', 0.305, 0.3, 0.32),
      positioned('B', 0.495, 0.3, 0.32),
      positioned('(Figure1)', 0.518, 0.26, 0.36),
      positioned('10. Which letter is a monomer?', 0.54, 0.1, 0.6),
    ];
    const [grown] = growPicturesToLabels(lines, [box(0.19, 0.319, 0.26, 0.16)]);
    expect(grown.labels).toEqual(['figure 1']);
    expect(grown.y).toBeLessThan(0.3);
    expect(grown.y + grown.height).toBeGreaterThan(0.518);
    const placed = sharePicturesAcrossRanges(
      placePictureLines(1, lines, [grown])
    );
    expect(placed.map((l) => l.text)).toEqual([
      'Use figure 1 to answer questions # 10 and 11',
      '10. Which letter is a monomer?',
    ]);
    expect(placed[1].imageIds).toHaveLength(1);
  });

  it('never takes a question, a choice or a paragraph’s last words into a picture', () => {
    const picture = box(0.05, 0.3, 0.9, 0.3);
    const lines = [
      positioned('a pH of 7 is neutral, and a pH of 8-14 is', 0.298, 0.05, 0.7),
      positioned('Basic.)', 0.314, 0.05, 0.12),
      positioned('b. enzyme changed shape', 0.4, 0.1, 0.4),
      positioned('22. Which enzyme?', 0.5, 0.1, 0.4),
      positioned('pH Level', 0.45, 0.6, 0.7),
    ];
    const placed = placePictureLines(
      1,
      lines,
      growPicturesToLabels(lines, [picture])
    );
    expect(placed.map((l) => l.text)).toEqual([
      'a pH of 7 is neutral, and a pH of 8-14 is',
      'Basic.)',
      '',
      'b. enzyme changed shape',
      '22. Which enzyme?',
    ]);
  });

  it('gives a picture to the question printed beside it', () => {
    const lines = [
      positioned(
        '14. A long stem that runs the width of the page',
        0.2,
        0.1,
        0.9
      ),
      positioned('d. last choice of fourteen', 0.33, 0.12, 0.4),
      positioned('15. Using the graph to the right', 0.4, 0.1, 0.5),
      positioned('a. Reaction 1', 0.45, 0.12, 0.3),
      positioned('16. Next question, full width again', 0.57, 0.1, 0.9),
    ];
    const placed = placePictureLines(1, lines, [box(0.55, 0.36, 0.36, 0.15)]);
    expect(placed.map((l) => l.text)).toEqual([
      '14. A long stem that runs the width of the page',
      'd. last choice of fourteen',
      '15. Using the graph to the right',
      '',
      'a. Reaction 1',
      '16. Next question, full width again',
    ]);
  });

  it('marks a picture heading the page for the question under it', () => {
    const lines = [
      positioned('(Figure 5)', 0.12, 0.4, 0.5),
      positioned('25. According to Figure 5, which enzyme?', 0.36, 0.1, 0.9),
    ];
    const grown = growPicturesToLabels(lines, [box(0.32, 0.136, 0.25, 0.19)]);
    const placed = placePictureLines(1, lines, grown);
    expect(placed[0].leads).toBe(true);
    expect(placed.map((l) => l.text)).toEqual([
      '',
      '25. According to Figure 5, which enzyme?',
    ]);
  });
});

const plain = (text: string): DocLine[] =>
  text.split('\n').map((t) => ({ text: t }));
const picture = (id: string, label?: string, leads = false): DocLine => ({
  text: '',
  imageIds: [id],
  ...(label ? { figureLabels: { [id]: [label] } } : {}),
  ...(leads ? { leads: true } : {}),
});

describe('pictures named by their caption', () => {
  it('moves a captioned picture from the question above it to the ones that name it', () => {
    const { questions } = parseDocument([
      ...plain('1. What starts a reaction?\na. heat\nb. light'),
      picture('fig5', 'figure 5', true),
      ...plain(
        '2. According to Figure 5, which enzyme is it?\na. X\nb. Y\n3. Based on Figure 5, which is widest?\na. X\nb. Y\n4. Unrelated?\na. yes\nb. no'
      ),
    ]);
    expect(questions.map((q) => q.imageIds)).toEqual([
      [],
      ['fig5'],
      ['fig5'],
      [],
    ]);
  });

  it('keeps a picture on the question beside it that only says "the graph"', () => {
    const { questions } = parseDocument([
      { text: '1. Using the graph to the right, which is catalyzed?' },
      picture('g1', 'graph 1'),
      ...plain(
        'a. one\nb. two\n2. What does Graph 1 describe?\na. heat\nb. cold'
      ),
    ]);
    expect(questions.map((q) => q.imageIds)).toEqual([['g1'], ['g1']]);
  });

  it('gives a lead-in paragraph and its figures to the questions that lean on it', () => {
    const at = (y: number, text: string, x: number): DocLine => ({
      text,
      segments: [{ text, x, xEnd: x + text.length * 5 }],
      page: 1,
      y,
    });
    const { questions, texts } = parseDocument([
      at(700, '1. Why?', 72),
      at(686, 'a. liver', 90),
      at(672, 'b. enzyme', 90),
      at(
        640,
        'The far right column in Figure 3 shows the preferred pH environment for each enzyme in the human digestive system. Figure 4 shows the rate of reaction for three different enzymes at various pH levels.',
        36
      ),
      picture('figs', 'figure 3'),
      at(500, '2. Using the above figures, where is the middle enzyme?', 72),
      at(486, 'a. mouth', 90),
      at(472, 'b. stomach', 90),
      at(440, '3. Using the above figures, what happens at pH 5?', 72),
      at(426, 'a. same', 90),
      at(412, 'b. lower', 90),
      at(380, '4. What is activation energy?', 72),
      at(366, 'a. heat', 90),
      at(352, 'b. start', 90),
    ]);
    expect(texts).toHaveLength(1);
    expect(questions.map((q) => q.sharedTextId)).toEqual([
      undefined,
      'text-1',
      'text-1',
      undefined,
    ]);
    expect(questions.map((q) => q.imageIds)).toEqual([
      [],
      ['figs'],
      ['figs'],
      [],
    ]);
    expect(questions[0].options[1].text).toBe('enzyme');
  });
});

describe('matching and letter answers', () => {
  it('reads "Matching: match…" with terms in a second column as one set', () => {
    const row = (...cells: Array<[string, number]>): DocLine => ({
      text: cells.map(([t]) => t).join(' '),
      segments: cells.map(([text, x]) => ({ text, x, xEnd: x + 40 })),
      page: 1,
    });
    const { questions } = parseDocument([
      { text: 'Matching: match the word from the left column with the best' },
      { text: 'phrase from the right column' },
      row(['1.', 55], ['Protein', 72], ['a. Protease', 251]),
      row(['2.', 55], ['Sugar', 72], ['b. Aribinose', 251]),
      { text: '3. Which is a lipid?' },
      { text: 'a. fat' },
      { text: 'b. sugar' },
      { text: 'Key:' },
      { text: '1. A' },
      { text: '2. B' },
      { text: '3. A' },
    ]);
    expect(questions).toHaveLength(2);
    expect(questions[0].type).toBe('Matching');
    expect(questions[0].correctAnswer).toBe('Protein:Protease|Sugar:Aribinose');
    const last = questions[1];
    expect(last.text).toBe('Which is a lipid?');
    expect(last.correctAnswer).toBe('fat');
  });

  it('builds letter choices for a question answered off a diagram', () => {
    const { questions } = parseDocument(
      plain(
        '1. Which letter indicates the enzyme?\n2. Which letter indicates the products?\n3. Explain why.\nKey:\n1. C\n2. E\n3. B'
      )
    );
    expect(questions[0].type).toBe('MC');
    // Both read off one picture, so both get every letter the key uses.
    expect(questions[0].options.map((o) => o.text)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
    expect(questions[0].correctAnswer).toBe('C');
    expect(questions[0].warnings.join(' ')).toMatch(/letters A–E were added/);
    expect(questions[0]).not.toHaveProperty('lettersFromKey');
    expect(questions[1].options).toHaveLength(5);
    expect(questions[1].correctAnswer).toBe('E');
    expect(questions[2].type).toBe('free-response');
    expect(questions[2].warnings.join(' ')).toMatch(/probably missed/);
  });

  it('ends a choice at a ruled line under it', () => {
    const line = (y: number, text: string, x: number): DocLine => ({
      text,
      segments: [{ text, x, xEnd: x + text.length * 6 }],
      page: 1,
      y,
    });
    const { questions } = parseDocument([
      line(700, '1. Why?', 72),
      line(680, 'a. liver', 90),
      line(666, 'b. the enzyme was used up', 90),
      line(652, '________________________________', 36),
      line(600, '2. Next?', 72),
    ]);
    expect(questions[0].options[1].text).toBe('the enzyme was used up');
  });
});
