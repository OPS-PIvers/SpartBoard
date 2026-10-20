/**
 * Splitting a typed PDF into versions without AI (QUIZ_IMPORT_VERSIONS V7, V13):
 * section headings at the top of a page, each version's own key, and rubric
 * tables read row by row.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readQuizDocument } from '@/utils/quizDocumentImport';
import type {
  PdfReaderDeps,
  PdfTextItem,
} from '@/utils/quizDocumentImport/pdfReader';
import {
  SHARED_KEY_SKIPPED,
  mapPlainSections,
  plainGroups,
  readPlainRubric,
  rubricPointsMissing,
  splitPlainVersions,
  writtenResponseText,
} from '@/utils/quizDocumentImport/plainVersions';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const bytes = readFileSync(resolve(__dirname, 'fixtures/versionsMc.pdf'));

async function nodePdfDeps(): Promise<PdfReaderDeps> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
  });
  const doc = await task.promise;
  return {
    loadPdf: () =>
      Promise.resolve({
        numPages: doc.numPages,
        getPage: async (n: number) => {
          const page = await doc.getPage(n);
          return {
            getTextContent: async () => ({
              items: (await page.getTextContent()).items.flatMap(
                (i): PdfTextItem[] =>
                  'str' in i
                    ? [
                        {
                          str: i.str,
                          transform: i.transform as number[],
                          width: i.width,
                          height: i.height,
                        },
                      ]
                    : []
              ),
            }),
          };
        },
        destroy: () => task.destroy(),
      }),
  };
}

const line = (text: string, page = 1, y?: number): DocLine => ({
  text,
  page,
  ...(y !== undefined ? { y } : {}),
});

describe('reading a versioned PDF without AI', () => {
  it('splits each version with its own key', async () => {
    const quiz = await readQuizDocument(new Blob([bytes]), {
      fileName: 'Unit 5 Test.pdf',
      pdf: await nodePdfDeps(),
      versions: true,
    });

    const set = quiz.testSet;
    expect(quiz.questions).toEqual([]);
    expect(set?.versions.map((v) => v.label)).toEqual([
      'Version A',
      'Version B',
      'Unit 5 Retake',
    ]);
    const [a, b, retake] = set?.versions ?? [];
    expect(a.questions.map((q) => q.correctAnswer)).toEqual([
      'Cell',
      'Mitochondria',
      'Photosynthesis',
      'Cell membrane',
      'Nucleus',
      'Plant cells',
    ]);
    expect(b.questions[0].text).toBe(
      'Which organelle is found only in plant cells?'
    );
    expect(b.questions.map((q) => q.correctAnswer)).toEqual([
      'Chloroplast',
      'Carbon dioxide',
      'Cell wall',
      'Proteins',
      'Central vacuole',
      'Cytoplasm',
    ]);
    // The heading printed on a version's second page isn't a question's text.
    expect(a.questions.some((q) => q.text.includes('Version A'))).toBe(false);
    expect(retake.questions.map((q) => q.type)).toEqual([
      'free-response',
      'free-response',
    ]);
    expect(set?.groups).toEqual([
      { kind: 'parallel', name: 'Unit 5 Test', versions: [0, 1] },
      { kind: 'retake', name: 'Unit 5 Test', versions: [2] },
    ]);
  });

  it('reads the same file as one quiz without the flag', async () => {
    const quiz = await readQuizDocument(new Blob([bytes]), {
      fileName: 'Unit 5 Test.pdf',
      pdf: await nodePdfDeps(),
    });
    expect(quiz.testSet).toBeUndefined();
    expect(quiz.questions.length).toBeGreaterThan(0);
  });
});

describe('mapPlainSections', () => {
  it('starts a section only at a heading near the top of a page', () => {
    const sections = mapPlainSections([
      ['Unit 5 Test', 'Directions: answer every question.'],
      ['Name: ________', 'Version A', '1. What is a cell?'],
      ['2. Which organelle makes energy?'],
      ['Version A', '3. What is DNA?'],
      ['Version B', '1. What is a tissue?'],
      ['RUBRIC', '# Criteria Points'],
      ['E Explain the impact of distance-decay. 0 /2'],
      ['RUBRIC', '# Criteria Points'],
      ['Answer Key Version B'],
    ]);
    expect(sections).toEqual([
      { kind: 'version', label: 'Version A', pages: [2, 3, 4] },
      { kind: 'version', label: 'Version B', pages: [5] },
      { kind: 'rubric', label: 'RUBRIC', pages: [6, 7] },
      { kind: 'rubric', label: 'RUBRIC', pages: [8] },
      { kind: 'answer-key', label: 'Answer Key Version B', pages: [9] },
    ]);
  });

  it('never takes a question or a fill-in line for a heading', () => {
    expect(
      mapPlainSections([
        ['1. Which version of the story is true?'],
        ['Which form 2 answer fits?'],
        ['Version A ____________'],
        ['Key terms', 'Mitosis'],
        ['the cells form a hypothesis'],
        ['Use the rubric'],
        ['to form a hypothesis about the answer key.'],
      ])
    ).toEqual([]);
  });

  it('keeps a version whole when its later pages say continued', () => {
    expect(
      mapPlainSections([
        ['Version A'],
        ['Version A (continued)'],
        ['Version B'],
      ])
    ).toEqual([
      { kind: 'version', label: 'Version A', pages: [1, 2] },
      { kind: 'version', label: 'Version B', pages: [3] },
    ]);
  });
});

describe('splitPlainVersions', () => {
  const pages = (heads: string[][]) =>
    heads.flatMap((h, i) => h.map((t) => line(t, i + 1)));

  it('needs two different versions', () => {
    const heads = [['Version A', '1. What is a cell?'], ['Version A']];
    expect(
      splitPlainVersions(
        { lines: pages(heads), pictures: [], pageHeads: heads },
        'Quiz',
        {}
      )
    ).toBeNull();
  });

  it('leaves a key at the back alone when it may cover several versions', () => {
    const heads = [
      ['Version A', '1. What is a cell?', 'A. A unit', 'B. A rock'],
      ['Version B', '1. What is a rock?', 'A. A unit', 'B. A stone'],
      ['Answer Key', '1. A'],
    ];
    const split = splitPlainVersions(
      { lines: pages(heads), pictures: [], pageHeads: heads },
      'Quiz',
      {}
    );
    expect(split?.warnings).toEqual([SHARED_KEY_SKIPPED]);
    expect(split?.versions[1].questions[0].correctAnswer).toBe('');
  });

  it('skips a key for a version the file does not have', () => {
    const heads = [
      ['Version A', '1. What is a cell?', 'A. A unit', 'B. A rock'],
      ['Version B', '1. What is a rock?', 'A. A unit', 'B. A stone'],
      ['Answer Key Version C', '1. A'],
    ];
    const split = splitPlainVersions(
      { lines: pages(heads), pictures: [], pageHeads: heads },
      'Quiz',
      {}
    );
    expect(split?.warnings).toEqual([SHARED_KEY_SKIPPED]);
    expect(split?.versions[1].questions[0].correctAnswer).toBe('');
  });

  it('makes a version with no numbered questions one written response', () => {
    const heads = [
      ['Version A', 'Use the map to answer.', 'A. Identify one religion.'],
      ['Version B', 'Use the map to answer.', 'A. Define acculturation.'],
    ];
    const split = splitPlainVersions(
      { lines: pages(heads), pictures: [], pageHeads: heads },
      'FRQ',
      {}
    );
    expect(split?.versions.map((v) => v.questions)).toEqual([
      [
        expect.objectContaining({
          type: 'free-response',
          text: 'Use the map to answer.\nA. Identify one religion.',
        }),
      ],
      [
        expect.objectContaining({
          text: 'Use the map to answer.\nA. Define acculturation.',
        }),
      ],
    ]);
  });
});

describe('writtenResponseText', () => {
  it('joins wrapped lines and drops answer lines', () => {
    expect(
      writtenResponseText([
        line('Religion plays a role in culture. Using the maps', 1, 507),
        line('above, answer the prompts.', 1, 495),
        line('A. Identify one denomination.', 1, 482),
        line(
          'D. Describe one factor that made English a lingua franca in the',
          1,
          446
        ),
        line('world today.', 1, 434),
        line('______________________________', 1, 393),
        line('Name:', 2, 57),
      ])
    ).toBe(
      'Religion plays a role in culture. Using the maps above, answer the prompts.\nA. Identify one denomination.\nD. Describe one factor that made English a lingua franca in the world today.'
    );
  });
});

describe('readPlainRubric', () => {
  it('reads each lettered row with its credit and no-credit lines verbatim', () => {
    const rubric = readPlainRubric(
      [
        line('RUBRIC'),
        line('# Criteria Points'),
        line('A Identify one Chrsitian denomination. 0 /1'),
        line('Credit received for:'),
        line('- Any denomination not in the legend'),
        line('Teacher Comments:'),
        {
          ...line('B Explain how a religion diffused. 0'),
          segments: [
            { text: 'B Explain how a religion diffused.' },
            { text: '0' },
          ],
        },
        line('Credit received for: /2'),
        line('- Point 1: identify a universalizing'),
        line('religion'),
        line('○ Christianity, Buddhism, Islam'),
        line(
          'NOT ACCEPTABLE: internet (modern), Television (modern, UNLESS USING'
        ),
        line('A SPECIFIC HISTORICAL EXAMPLE)'),
        line('Teacher Comments:'),
        line('C Compare the two concepts.'),
        line('Name: Final Comments: /10'),
      ],
      { label: 'RUBRIC', pages: [11, 12] }
    );
    expect(rubric).toEqual({
      label: 'RUBRIC',
      pages: { start: 11, end: 12 },
      title: 'RUBRIC',
      printedTotal: 10,
      criteria: [
        {
          letter: 'A',
          prompt: 'Identify one Chrsitian denomination.',
          points: 1,
          credit: ['Any denomination not in the legend'],
          notes: [],
        },
        {
          letter: 'B',
          prompt: 'Explain how a religion diffused.',
          points: 2,
          credit: [
            'Point 1: identify a universalizing religion',
            'Christianity, Buddhism, Islam',
          ],
          notes: [
            'NOT ACCEPTABLE: internet (modern), Television (modern, UNLESS USING A SPECIFIC HISTORICAL EXAMPLE)',
          ],
        },
        {
          letter: 'C',
          prompt: 'Compare the two concepts.',
          points: 0,
          credit: [],
          notes: [],
        },
      ],
      warnings: [rubricPointsMissing('C')],
    });
  });
});

describe('readPlainRubric edge cases', () => {
  it('keeps a fraction in a credit line and a row that says total', () => {
    const rubric = readPlainRubric(
      [
        line('A Write the ratio. 0 /2'),
        line('Credit received for:'),
        line('- Writes the ratio 3/4'),
        line('B Explain the total cost. 0 /1'),
      ],
      { label: 'RUBRIC', pages: [1] }
    );
    expect(rubric.criteria.map((c) => [c.letter, c.points, c.credit])).toEqual([
      ['A', 2, ['Writes the ratio 3/4']],
      ['B', 1, []],
    ]);
    expect(rubric.printedTotal).toBeUndefined();
  });
});

describe('plainGroups', () => {
  it('sorts headings into parallel forms, retakes and a split', () => {
    expect(
      plainGroups(
        [
          'Version A',
          'Version B',
          'Unit 3 REASSESSMENT',
          'Version Split Pt 1',
          'Version Split Pt 2',
        ],
        'Unit 3 FRQ'
      )
    ).toEqual([
      { kind: 'parallel', name: 'Unit 3 FRQ', versions: [0, 1] },
      { kind: 'retake', name: 'Unit 3 FRQ', versions: [2] },
      { kind: 'split', name: 'Unit 3 FRQ Split', versions: [3, 4] },
    ]);
  });
});
