import { describe, expect, it } from 'vitest';
import type {
  ClassRoster,
  PaperGrid,
  PaperPageMap,
  QuizData,
  QuizQuestion,
} from '@/types';
import { paintSyntheticSheet } from '@/tests/testHelpers/paperSheetRaster';
import {
  analyzePaperQuiz,
  paperGroupOrder,
  paperGroupShape,
  planPaperBatch,
} from './paperSheetPlan';
import {
  itemBubbleRectMm,
  mcItemsOf,
  planPaperPages,
  type PaperSheetEntry,
} from './paperPageMap';
import {
  cornerWindowsMm,
  PAGE_WIDTH_MM,
  STIMULUS_RECT_MM,
  type RectMm,
} from './paperSheetLayout';
import { classifyMultiRow, readPaperPage } from './paperSheetReader';
import { assemblePaperScan } from './paperImportAssemble';
import {
  applyKeyToQuiz,
  buildImportPayload,
  groupAnswerText,
  keySheetChoices,
} from './paperImportPlan';
import { paperBatchTag } from './paperSheetMarker';
import { buildPaperSheetsHtml } from './paperSheetPrint';
import { buildPaperTestHtml } from './paperTestPrint';
import { groupTextsFor } from './paperSheetVersions';
import { READER_THRESHOLDS } from './paperSheetReader';

const q = (over: Partial<QuizQuestion>): QuizQuestion => ({
  id: 'q',
  timeLimit: 0,
  text: 'Question',
  type: 'MC',
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  ...over,
});

const MC = q({
  id: 'mc',
  text: 'Which organelle makes proteins?',
  correctAnswer: 'Ribosome',
  incorrectAnswers: ['Vacuole', 'Nucleus'],
});
const MA = q({
  id: 'ma',
  type: 'MA',
  text: 'Which are in plant cells?',
  correctAnswer: 'Cell wall|Chloroplast',
  incorrectAnswers: ['Centriole', 'Cilia'],
});
const MATCH = q({
  id: 'match',
  type: 'Matching',
  text: 'Match each organelle to its job.',
  correctAnswer:
    'Mitochondria:Releases energy|Nucleus:Holds the DNA|Ribosome:Makes proteins',
  incorrectAnswers: [],
  matchingDistractors: ['Stores water'],
});
const ORDER = q({
  id: 'order',
  type: 'Ordering',
  text: 'Put the steps of mitosis in order.',
  correctAnswer: 'Prophase|Metaphase|Anaphase|Telophase',
  incorrectAnswers: [],
});

const QUIZ: QuizData = {
  id: 'quiz',
  title: 'Cells',
  questions: [MC, MA, MATCH, ORDER],
  createdAt: 0,
  updatedAt: 0,
};

const ROSTER: ClassRoster = {
  id: 'r1',
  name: 'Period 1',
  driveFileId: null,
  studentCount: 1,
  createdAt: 0,
  students: [{ id: 's1', firstName: 'Priya', lastName: 'Berg', pin: '01' }],
};

const analysis = analyzePaperQuiz(QUIZ, { groups: true });

function stack(grid: PaperGrid) {
  const pages = planPaperPages({
    entries: analysis.entries,
    grid,
    stems: true,
    choiceCount: analysis.sheetChoiceCount,
    stemLines: { mc: 1, ma: 1, match: 1, order: 1 },
  });
  if (!pages.ok) throw new Error('plan refused');
  return planPaperBatch({
    batchId: 'b1',
    quizId: QUIZ.id,
    selections: [{ roster: ROSTER, students: ROSTER.students }],
    questionCount: analysis.rows.length + analysis.groups.length,
    choiceCount: analysis.sheetChoiceCount,
    spareCount: 0,
    includeKeySheet: false,
    questions: [MC, MA, MATCH, ORDER],
    ...(grid === 'questions' ? { sheetLayout: 'questions' as const } : {}),
    pageMaps: pages.pageMaps,
    createdAt: 0,
  }).batch;
}

describe('grouped questions on paper', () => {
  it('prints matching, ordering and choose all as bubble rows', () => {
    expect(analysis.exclusions).toEqual([]);
    expect(
      analysis.groups.map((g) => [g.questionId, g.group, g.parts, g.choices])
    ).toEqual([
      ['ma', 'all', 1, 4],
      ['match', 'match', 3, 4],
      ['order', 'order', 4, 4],
    ]);
    // Without the option they stay off the sheet, as on older paths.
    expect(analyzePaperQuiz(QUIZ).groups).toEqual([]);
  });

  it('leaves out a question with more than 10 answers', () => {
    const big = q({
      id: 'big',
      type: 'Ordering',
      correctAnswer: Array.from({ length: 11 }, (_, i) => `Step ${i}`).join(
        '|'
      ),
      incorrectAnswers: [],
    });
    const a = analyzePaperQuiz({ ...QUIZ, questions: [big] }, { groups: true });
    expect(a.groups).toEqual([]);
    expect(a.exclusions.map((e) => e.reason)).toEqual(['too-many-choices']);
  });

  it('letters every print alike and never prints ordering already in order', () => {
    expect(paperGroupOrder(ORDER)).toEqual(paperGroupOrder({ ...ORDER }));
    expect(paperGroupOrder(ORDER).join('|')).not.toBe(ORDER.correctAnswer);
    const two = q({ type: 'Ordering', correctAnswer: 'First|Second' });
    expect(paperGroupOrder(two)).toEqual(['Second', 'First']);
    expect([...paperGroupOrder(MATCH)].sort()).toEqual([
      'Holds the DNA',
      'Makes proteins',
      'Releases energy',
      'Stores water',
    ]);
    expect(
      paperGroupShape(q({ type: 'Matching', correctAnswer: '' }))
    ).toBeNull();
  });

  it.each([2, 'questions'] as const)(
    'gives each matching term and ordering step its own row (%s)',
    (grid) => {
      const batch = stack(grid);
      const items = (batch.pageMaps ?? []).flatMap(mcItemsOf);
      expect(items.map((i) => [i.questionId, i.part ?? null])).toEqual([
        ['mc', null],
        ['ma', null],
        ['match', 0],
        ['match', 1],
        ['match', 2],
        ['order', 0],
        ['order', 1],
        ['order', 2],
        ['order', 3],
      ]);
      expect(items.map((i) => i.sheetRow)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      const across = grid === 'questions';
      expect(items.filter((i) => i.across).length).toBe(across ? 7 : 0);
      // No two rows overlap.
      const ys = items.map((i) => `${i.originMm.x}:${i.originMm.y}`);
      expect(new Set(ys).size).toBe(ys.length);
    }
  );

  it('spells online answers from the bubbles', () => {
    const maOptions = paperGroupOrder(MA);
    const wall = maOptions.indexOf('Cell wall');
    const chloro = maOptions.indexOf('Chloroplast');
    expect(
      groupAnswerText(
        MA,
        maOptions,
        'all',
        [{ part: 0, choice: null, marked: [chloro, wall] }],
        false
      )
    ).toBe(
      maOptions
        .filter((o) => o === 'Cell wall' || o === 'Chloroplast')
        .join('|')
    );

    const right = paperGroupOrder(MATCH);
    expect(
      groupAnswerText(
        MATCH,
        right,
        'match',
        [
          { part: 1, choice: right.indexOf('Holds the DNA') },
          { part: 0, choice: right.indexOf('Releases energy') },
          { part: 2, choice: null },
        ],
        false
      )
    ).toBe('Mitochondria:Releases energy|Nucleus:Holds the DNA');

    const items = paperGroupOrder(ORDER);
    const correct = ORDER.correctAnswer.split('|');
    // Plain sheet: row = position, bubble = item letter.
    expect(
      groupAnswerText(
        ORDER,
        items,
        'order',
        correct.map((item, part) => ({ part, choice: items.indexOf(item) })),
        false
      )
    ).toBe(ORDER.correctAnswer);
    // Question-text sheet: row = item, bubble = its place.
    expect(
      groupAnswerText(
        ORDER,
        items,
        'order',
        items.map((item, part) => ({ part, choice: correct.indexOf(item) })),
        true
      )
    ).toBe(ORDER.correctAnswer);
  });

  it('reads a choose all row as every clear mark', () => {
    const { mark } = READER_THRESHOLDS;
    expect(classifyMultiRow([0.9, 0, 0.85, 0.02])).toEqual({
      choice: null,
      marked: [0, 2],
    });
    expect(classifyMultiRow([0, 0, 0, 0])).toEqual({
      choice: null,
      marked: [],
    });
    expect(classifyMultiRow([0.9, mark * 0.8, 0, 0]).doubt).toBe('unclear');
    // A light check beside a solid fill is not trusted either way.
    expect(classifyMultiRow([0.9, mark * 1.5, 0, 0]).doubt).toBe('unclear');
  });

  it.each([2, 'questions'] as const)(
    'prints, scans and imports every kind as the right answer (%s)',
    (grid) => {
      const batch = stack(grid);
      const order = batch.choiceOrder ?? {};
      const maps = batch.pageMaps as PaperPageMap[];
      const correct = ORDER.correctAnswer.split('|');
      const pick = (questionId: string, part: number | undefined): number[] => {
        const opts = order[questionId];
        if (questionId === 'mc') return [opts.indexOf('Ribosome')];
        if (questionId === 'ma')
          return [opts.indexOf('Cell wall'), opts.indexOf('Chloroplast')];
        if (questionId === 'match') {
          const rights = ['Releases energy', 'Holds the DNA', 'Makes proteins'];
          return [opts.indexOf(rights[part ?? 0])];
        }
        return grid === 'questions'
          ? [correct.indexOf(opts[part ?? 0])]
          : [opts.indexOf(correct[part ?? 0])];
      };
      const pages = maps.map((map) => {
        const items = mcItemsOf(map).sort((a, b) => a.sheetRow - b.sheetRow);
        const marks = items.flatMap((item, row) =>
          pick(item.questionId, item.part).map((choice) => ({ row, choice }))
        );
        return readPaperPage(
          paintSyntheticSheet({
            marker: {
              batchTag: paperBatchTag(batch.id),
              seat: 1,
              page: map.page,
              isKeySheet: false,
              readByMap: true,
            },
            questionCount: 0,
            choiceCount: batch.choiceCount,
            pageMap: map,
            marks,
          }),
          {
            questionCount: 0,
            choiceCount: batch.choiceCount,
            columnsPerPage: grid,
            pageMaps: maps,
          }
        );
      });
      const assembled = assemblePaperScan(
        batch,
        pages.map((read, scanIndex) => ({ scanIndex, read }))
      );
      const { payload } = buildImportPayload({
        batch,
        quiz: QUIZ,
        rosters: [ROSTER],
        sheets: assembled.sheets,
        spareAssignments: {},
      });
      const answers = Object.fromEntries(
        payload[0].answers.map((a) => [a.questionId, a.answer])
      );
      expect(answers.mc).toBe('Ribosome');
      expect(answers.ma.split('|').sort()).toEqual([
        'Cell wall',
        'Chloroplast',
      ]);
      expect(answers.match).toBe(MATCH.correctAnswer);
      expect(answers.order).toBe(ORDER.correctAnswer);
      expect(payload[0].answers).toHaveLength(4);
    }
  );

  it('draws titles, letters and text for each kind', () => {
    const batch = stack('questions');
    const html = buildPaperSheetsHtml({
      batchId: batch.id,
      quizTitle: 'Cells',
      questionCount: batch.questionCount,
      choiceCount: batch.choiceCount,
      sheets: [
        {
          seat: 1,
          student: batch.seats[1],
          displayName: 'Berg, Priya',
          className: 'Period 1',
          isKeySheet: false,
        },
      ],
      columnsPerPage: 'questions',
      pageMaps: batch.pageMaps,
      questionTexts: [{ text: MC.text, choices: batch.choiceOrder?.mc ?? [] }],
      groupTexts: groupTextsFor(
        analysis,
        new Map(QUIZ.questions.map((x) => [x.id, x])),
        batch.choiceOrder ?? {}
      ),
    });
    expect(html).toContain('Select all that apply.');
    expect(html).toContain(
      'Bubble one letter for each term. Some letters are not used.'
    );
    expect(html).toContain('Bubble where each step goes. 1 is first.');
    expect(html).toContain('Mitochondria');
    expect(html).toContain('Telophase');
  });

  it('prints instructions and lettered lists on the test paper', () => {
    const html = buildPaperTestHtml({
      quizTitle: 'Cells',
      questions: [
        {
          row: 3,
          text: MATCH.text,
          choices: paperGroupOrder(MATCH),
          group: 'match',
          terms: ['Mitochondria', 'Nucleus', 'Ribosome'],
        },
        {
          row: 4,
          text: ORDER.text,
          choices: paperGroupOrder(ORDER),
          group: 'order',
        },
      ],
    });
    expect(html).toContain('3.1');
    expect(html).toContain('Mitochondria');
    expect(html).toContain(
      'Bubble the first step on row 4.1. Bubble the next step on each row after it.'
    );
  });

  const overlaps = (a: RectMm, b: RectMm): boolean =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const wideMa = (id: string): QuizQuestion =>
    q({
      id,
      type: 'MA',
      correctAnswer: 'A1|A2',
      incorrectAnswers: Array.from({ length: 8 }, (_, i) => `W${i}`),
    });
  const mcRun = (n: number): PaperSheetEntry[] =>
    Array.from({ length: n }, (_, i) => ({
      kind: 'mc' as const,
      questionId: `m${i}`,
      label: String(i + 1),
    }));

  it('keeps wide rows out of the corner windows', () => {
    for (let n = 40; n <= 50; n += 1) {
      const pages = planPaperPages({
        entries: [
          ...mcRun(n),
          {
            kind: 'mc',
            questionId: 'wide',
            label: 'W',
            group: 'match',
            parts: 3,
            choices: 10,
          },
        ],
        grid: 2,
        stems: false,
        choiceCount: 4,
      });
      if (!pages.ok) throw new Error('plan refused');
      for (const map of pages.pageMaps) {
        for (const item of mcItemsOf(map).filter((i) => i.group)) {
          for (let c = 0; c < 10; c += 1) {
            const r = itemBubbleRectMm(item, c, 2);
            expect(cornerWindowsMm().some((w) => overlaps(r, w))).toBe(false);
            expect(r.x + r.w).toBeLessThan(PAGE_WIDTH_MM);
          }
        }
      }
    }
  });

  it('wraps wide rows clear of the stimulus on one-column sheets', () => {
    const quiz = { ...QUIZ, questions: [MC, wideMa('wide')] };
    const a = analyzePaperQuiz(quiz, { groups: true });
    const pages = planPaperPages({
      entries: a.entries,
      grid: 1,
      stems: false,
      choiceCount: a.sheetChoiceCount,
    });
    if (!pages.ok) throw new Error('plan refused');
    const items = pages.pageMaps.flatMap(mcItemsOf);
    const wide = items.find((i) => i.questionId === 'wide');
    if (!wide) throw new Error('row missing');
    expect(wide.wrap).toBe(6);
    for (let c = 0; c < 10; c += 1) {
      const r = itemBubbleRectMm(wide, c, 1);
      expect(r.x + r.w).toBeLessThan(STIMULUS_RECT_MM.x);
    }
    const batch = planPaperBatch({
      batchId: 'b1',
      quizId: quiz.id,
      selections: [{ roster: ROSTER, students: ROSTER.students }],
      questionCount: a.rows.length + a.groups.length,
      choiceCount: a.sheetChoiceCount,
      spareCount: 0,
      includeKeySheet: false,
      questions: quiz.questions,
      pageMaps: pages.pageMaps,
      createdAt: 0,
    }).batch;
    const opts = batch.choiceOrder?.wide ?? [];
    // Two bubbles on the wrapped second line, whatever the right answers' letters are.
    const picks = [...new Set([opts.indexOf('A1'), opts.indexOf('A2'), 7, 9])];
    const maps = batch.pageMaps as PaperPageMap[];
    const reads = maps.map((map) =>
      readPaperPage(
        paintSyntheticSheet({
          marker: {
            batchTag: paperBatchTag(batch.id),
            seat: 1,
            page: map.page,
            isKeySheet: false,
            readByMap: true,
          },
          questionCount: 0,
          choiceCount: batch.choiceCount,
          pageMap: map,
          marks: mcItemsOf(map)
            .sort((x, y) => x.sheetRow - y.sheetRow)
            .flatMap((item, row) =>
              item.questionId === 'wide'
                ? picks.map((choice) => ({ row, choice }))
                : [{ row, choice: 0 }]
            ),
        }),
        {
          questionCount: 0,
          choiceCount: batch.choiceCount,
          columnsPerPage: 1,
          pageMaps: maps,
        }
      )
    );
    const assembled = assemblePaperScan(
      batch,
      reads.map((read, scanIndex) => ({ scanIndex, read }))
    );
    const { payload } = buildImportPayload({
      batch,
      quiz,
      rosters: [ROSTER],
      sheets: assembled.sheets,
      spareAssignments: {},
    });
    const got = payload[0].answers.find((x) => x.questionId === 'wide');
    expect(got?.answer.split('|').sort()).toEqual(
      picks.map((c) => opts[c]).sort()
    );
  });

  it('leaves grouped questions out of the answer key', () => {
    const batch = stack(2);
    const sheet = {
      seat: 0,
      kind: 'key' as const,
      answers: [
        { question: 0, choice: 1, fills: [], crop: null, scanIndex: 0 },
        {
          question: 1,
          choice: null,
          marked: [0, 1],
          fills: [],
          crop: null,
          scanIndex: 0,
        },
      ],
    } as unknown as Parameters<typeof keySheetChoices>[0];
    expect(keySheetChoices(sheet, QUIZ, batch)).toEqual({ mc: 1 });
    const keyed = applyKeyToQuiz(QUIZ, batch, { mc: 0, ma: 0 }, 1);
    expect(keyed.questions.find((x) => x.id === 'ma')).toEqual(MA);
  });

  it('marks a grouped question unclear when any of its rows is', () => {
    const batch = stack(2);
    const items = (batch.pageMaps ?? []).flatMap(mcItemsOf);
    const answers = items.map((item) => ({
      question: item.sheetRow,
      choice: 0,
      ...(item.questionId === 'match' && item.part === 1
        ? { choice: null, doubt: 'unclear' as const }
        : {}),
      fills: [],
      crop: null,
      scanIndex: 0,
    }));
    const { payload } = buildImportPayload({
      batch,
      quiz: QUIZ,
      rosters: [ROSTER],
      sheets: [
        {
          seat: 1,
          kind: 'student',
          student: { rosterId: 'r1', studentId: 's1' },
          answers,
          skippedRows: [],
          isBlank: false,
        },
      ] as unknown as Parameters<typeof buildImportPayload>[0]['sheets'],
      spareAssignments: {},
    });
    expect(payload[0].answers.find((x) => x.questionId === 'match')).toEqual({
      questionId: 'match',
      answer: '',
      unresponded: 'paper-unclear',
    });
  });

  it('prints the fixed words in the copy language', () => {
    const batch = stack('questions');
    const html = buildPaperSheetsHtml({
      batchId: batch.id,
      quizTitle: QUIZ.title,
      questionCount: batch.questionCount,
      choiceCount: batch.choiceCount,
      sheets: [
        {
          seat: 1,
          student: batch.seats[1],
          displayName: 'Berg, Priya',
          className: 'Period 1',
          isKeySheet: false,
        },
      ],
      columnsPerPage: 'questions',
      pageMaps: batch.pageMaps,
      language: 'es',
      groupTexts: groupTextsFor(
        analysis,
        new Map(QUIZ.questions.map((x) => [x.id, x])),
        batch.choiceOrder ?? {}
      ),
    });
    expect(html).toContain('Selecciona todas las respuestas correctas.');
    expect(html).not.toContain('Select all that apply.');
  });
});
