import { describe, expect, it } from 'vitest';
import type { ClassRoster, PaperBatch, QuizData, QuizQuestion } from '@/types';
import { resolveQuizAssignment, type BankContent } from './questionBanks';
import { analyzePaperQuiz, planPaperBatch } from './paperSheetPlan';
import { planPaperPages } from './paperPageMap';
import {
  addPromptPages,
  needsPromptPage,
  pageMapsForSeat,
  planPaperVersions,
  printVersionsFor,
  promptAnalysis,
  seatQuestionId,
  versionSheetQuestions,
} from './paperSheetVersions';
import { buildPaperSheetsHtml } from './paperSheetPrint';
import { buildImportPayload } from './paperImportPlan';
import type { AssembledSheet } from './paperImportAssemble';
import { buildPaperTestHtml } from './paperTestPrint';

const mc = (id: string, correct = 'Paris'): QuizQuestion => ({
  id,
  timeLimit: 0,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: correct,
  incorrectAnswers: ['Lyon', 'Nice', 'Lille'],
  points: 1,
});

const frq = (
  id: string,
  text: string,
  stimulusIds?: string[]
): QuizQuestion => ({
  id,
  timeLimit: 0,
  text,
  type: 'free-response',
  correctAnswer: '',
  incorrectAnswers: [],
  points: 10,
  ...(stimulusIds ? { stimulusIds } : {}),
});

const bank: BankContent = {
  id: 'bank-1',
  title: 'Unit 3 FRQ',
  questions: [
    frq('vA', 'Version A intro\nA. Define\nB. Explain', ['map']),
    frq('vB', 'Version B intro\nA. Identify\nB. Compare', ['map']),
  ],
  stimuli: [
    {
      id: 'map',
      type: 'image',
      url: 'https://example.test/map.png',
      label: 'Map',
    },
  ],
};

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Unit 3',
  questions: [mc('q1')],
  bankSlots: [
    {
      id: 'slot-1',
      bankId: 'bank-1',
      bankTitle: 'Unit 3 FRQ',
      mode: 'random',
      count: 1,
      points: 10,
      dealing: 'balanced',
    },
  ],
  createdAt: 1,
  updatedAt: 1,
};

const banks = new Map([['bank-1', bank]]);
const slot = quiz.bankSlots?.[0] ?? null;
if (!slot) throw new Error('fixture');
const mustPlan = (q: QuizData, b: Map<string, BankContent>) => {
  const plan = planPaperVersions(q, resolveQuizAssignment(q, b), {
    written: true,
  });
  if (!plan) throw new Error('no plan');
  return plan;
};
const resolved = () => resolveQuizAssignment(quiz, banks);

describe('planPaperVersions', () => {
  it('deals one version per turn and lays every version out like the first', () => {
    const plan = planPaperVersions(quiz, resolved(), { written: true });
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(plan.records.map((r) => r.label)).toEqual([
      'Version A',
      'Version B',
    ]);
    expect(plan.records.map((r) => r.servedQuestionIds)).toEqual([
      ['q1', 'vA'],
      ['q1', 'vB'],
    ]);
    expect(plan.records[1].swaps).toEqual({ vA: 'vB' });
    expect(plan.template.exclusions).toEqual([]);
    expect(plan.template.entries).toEqual([
      { kind: 'mc', questionId: 'q1', label: '1' },
      { kind: 'written', questionId: 'vA', label: '2', size: 'full' },
    ]);
    expect([...plan.promptIds]).toEqual(['vA']);
    expect(versionSheetQuestions(plan).map((q) => q.id)).toEqual(['q1']);
  });

  it('stays off paper for a random slot, a mixed-type pool or no slot at all', () => {
    const random: QuizData = {
      ...quiz,
      bankSlots: [{ ...slot, dealing: 'random' }],
    };
    expect(
      planPaperVersions(random, resolveQuizAssignment(random, banks))
    ).toBeNull();
    const mixedBank: BankContent = {
      ...bank,
      questions: [bank.questions[0], mc('vM')],
    };
    const mixed = new Map([['bank-1', mixedBank]]);
    expect(
      planPaperVersions(quiz, resolveQuizAssignment(quiz, mixed), {
        written: true,
      })
    ).toBeNull();
    const plain = { ...quiz, bankSlots: undefined };
    expect(
      planPaperVersions(plain, resolveQuizAssignment(plain, banks))
    ).toBeNull();
  });

  it('counts versions to the rotation period of every slot', () => {
    const three: BankContent = {
      ...bank,
      questions: [mc('m1', 'A1'), mc('m2', 'A2'), mc('m3', 'A3')],
    };
    const two: QuizData = {
      ...quiz,
      bankSlots: [{ ...slot, count: 2 }],
    };
    const plan = planPaperVersions(
      two,
      resolveQuizAssignment(two, new Map([['bank-1', three]]))
    );
    expect(plan?.records.map((r) => r.servedQuestionIds)).toEqual([
      ['q1', 'm1', 'm2'],
      ['q1', 'm3', 'm1'],
      ['q1', 'm2', 'm3'],
    ]);
    expect(plan?.records.map((r) => r.label)).toEqual([
      'Version A, Version B',
      'Version A, Version C',
      'Version B, Version C',
    ]);
  });
});

describe('prompt pages', () => {
  it('a long or illustrated written prompt gets a Full box', () => {
    expect(needsPromptPage(frq('a', 'Short'), [])).toBe(false);
    expect(needsPromptPage(frq('a', 'Line one\nLine two'), [])).toBe(true);
    expect(
      needsPromptPage(frq('a', 'Short', ['s']), [{ id: 's', type: 'image' }])
    ).toBe(true);
    expect(needsPromptPage(mc('a'), [])).toBe(false);
    const split: QuizData = {
      ...quiz,
      bankSlots: undefined,
      questions: [frq('p1', 'Part 1\nA. Define'), frq('p2', 'Short')],
    };
    const a = promptAnalysis(split, analyzePaperQuiz(split, { written: true }));
    expect(a.written.map((w) => w.size)).toEqual(['full', 'M']);
  });

  it('puts the prompt page in front of its box and renumbers what follows', () => {
    const plan = mustPlan(quiz, banks);
    const pages = planPaperPages({
      entries: plan.template.entries,
      grid: 2,
      stems: true,
      choiceCount: 4,
    });
    expect(pages.ok).toBe(true);
    if (!pages.ok) return;
    const result = addPromptPages(pages.pageMaps, plan.promptIds);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.pageMaps.map((m) => [m.page, m.items.length, m.prompt ?? null])
    ).toEqual([
      [1, 1, null],
      [2, 0, 'vA'],
      [3, 1, null],
    ]);
  });
});

const roster = (id: string, n: number): ClassRoster =>
  ({
    id,
    name: `Period ${id}`,
    students: Array.from({ length: n }, (_, i) => ({
      id: `${id}-s${i}`,
      firstName: `F${i}`,
      lastName: `L${i}`,
      pin: `${id}${i}`,
    })),
  }) as unknown as ClassRoster;

function printedBatch() {
  const plan = mustPlan(quiz, banks);
  const pages = planPaperPages({
    entries: plan.template.entries,
    grid: 2,
    stems: true,
    choiceCount: 4,
  });
  if (!pages.ok) throw new Error('pages');
  const maps = addPromptPages(pages.pageMaps, plan.promptIds);
  if (!maps.ok) throw new Error('maps');
  const r1 = roster('1', 3);
  const r2 = roster('2', 2);
  const { batch, sheets } = planPaperBatch({
    batchId: 'batch-1',
    quizId: quiz.id,
    selections: [
      { roster: r1, students: r1.students },
      { roster: r2, students: r2.students },
    ],
    questionCount: plan.template.rows.length,
    choiceCount: 4,
    spareCount: 2,
    includeKeySheet: true,
    questions: versionSheetQuestions(plan),
    pageMaps: maps.pageMaps,
    versions: plan.records,
    createdAt: 1,
  });
  return { plan, batch, sheets, rosters: [r1, r2] };
}

describe('print-time dealing', () => {
  it('alternates versions in seat order within each class and across the spares', () => {
    const { batch, sheets } = printedBatch();
    expect(sheets.map((s) => s.versionIndex ?? null)).toEqual([
      0,
      1,
      0,
      0,
      1,
      0,
      1,
      null,
    ]);
    expect(batch.seatVersions).toEqual({
      1: 0,
      2: 1,
      3: 0,
      4: 0,
      5: 1,
      6: 0,
      7: 1,
    });
    expect(seatQuestionId(batch, 2, 'vA')).toBe('vB');
    expect(seatQuestionId(batch, 8, 'vA')).toBe('vA');
    expect(
      pageMapsForSeat(batch, 2)?.flatMap((m) => [
        ...m.items.map((i) => i.questionId),
        ...(m.prompt ? [`prompt:${m.prompt}`] : []),
      ])
    ).toEqual(['q1', 'prompt:vB', 'vB']);
  });

  it("prints each sheet's own version label, prompt and figures", () => {
    const { plan, batch, sheets } = printedBatch();
    const html = buildPaperSheetsHtml({
      batchId: batch.id,
      quizTitle: quiz.title,
      questionCount: batch.questionCount,
      choiceCount: batch.choiceCount,
      pageMaps: batch.pageMaps,
      sheets: [sheets[0], sheets[1]],
      versions: printVersionsFor(plan, batch.choiceOrder ?? {}, false),
      stimulusImageSrc: { map: 'blob:map' },
    });
    expect(html).toContain('Version A · Period 1');
    expect(html).toContain('Version B · Period 1');
    expect(html).toContain('Version A intro');
    expect(html).toContain('Version B intro');
    expect(html).toContain('src="blob:map"');
    expect(html.match(/class="pr-text"/g)).toHaveLength(2);
  });

  it('prints one test copy per version', () => {
    const html = buildPaperTestHtml({
      quizTitle: 'Unit 3',
      questions: [],
      versions: [
        {
          label: 'Version A',
          questions: [{ row: 1, text: 'One', choices: [] }],
        },
        {
          label: 'Version B',
          questions: [{ row: 1, text: 'Two', choices: [] }],
        },
      ],
    });
    expect(html.match(/<section class="version">/g)).toHaveLength(2);
    expect(html).toContain('Version B');
  });
});

describe('scan import of a versioned stack', () => {
  it('answers each seat with the questions its version printed', () => {
    const { batch, rosters } = printedBatch();
    const sheet = (seat: number, student: PaperBatch['seats'][number]) =>
      ({
        seat,
        kind: 'student',
        student,
        answers: [
          { question: 0, choice: 1, fills: [], crop: null, scanIndex: 0 },
        ],
        written: [
          {
            questionId: seatQuestionId(batch, seat, 'vA'),
            label: '2',
            page: 3,
            state: 'ink',
            inkMm2: 50,
            scanIndex: 0,
          },
        ],
        pagesSeen: [1, 2, 3],
        missingPages: [],
        isBlank: false,
        flags: [],
      }) as unknown as AssembledSheet;
    const { payload } = buildImportPayload({
      batch,
      quiz,
      rosters,
      sheets: [sheet(1, batch.seats[1]), sheet(2, batch.seats[2])],
      spareAssignments: {},
      scan: { uid: 'u1', scanId: 'scan-1' },
    });
    expect(payload.map((p) => p.answers.map((a) => a.questionId))).toEqual([
      ['q1'],
      ['q1'],
    ]);
    expect(payload.map((p) => p.written?.map((w) => w.questionId))).toEqual([
      ['vA'],
      ['vB'],
    ]);
  });
});
