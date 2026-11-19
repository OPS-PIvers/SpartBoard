import { describe, expect, it, vi } from 'vitest';
import type {
  PaperBatch,
  QuizData,
  QuizQuestion,
  QuizTranslation,
  QuizTranslationIndexEntry,
} from '@/types';
import {
  printedCopyPlan,
  printedGroupForPrint,
  printedGroupRecord,
  printedReprintGroups,
  printedTranslation,
  recordPick,
  unprintedCopyPicks,
} from '@/utils/paperPrintedVersions';
import { printedGroupTranslations } from '@/utils/paperPrintedTranslations';
import { hashQuestionForTranslation } from '@/utils/quizTranslationHash';
import type {
  ModificationGroup,
  PrintedGroupPick,
} from '@/components/common/library/assignStepper/modificationGroups';

const mc = (id: string, extra: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id,
  type: 'MC',
  text: `Question ${id}`,
  correctAnswer: 'Right',
  incorrectAnswers: ['W1', 'W2'],
  timeLimit: 0,
  ...extra,
});

const QUIZ: QuizData = {
  id: 'quiz-1',
  title: 'Gravity',
  questions: [mc('q1'), mc('q2', { modifiedText: 'Easier q2' })],
  createdAt: 0,
  updatedAt: 0,
};

const group = (patch: Partial<ModificationGroup>): ModificationGroup => ({
  id: 'g',
  studentKeys: [],
  answerChoices: 'all',
  time: 'standard',
  readAloud: false,
  speechToText: false,
  ...patch,
});

const pick = (number: number, patch: Partial<ModificationGroup> = {}) =>
  ({
    number,
    group: group(patch),
    students: [{ rosterId: 'r1', studentId: `s${number}` }],
  }) satisfies PrintedGroupPick;

const ES = {
  q1: { text: 'Pregunta 1', choices: ['Bien', 'M1', 'M2'] },
  q2: { text: 'Pregunta 2', choices: ['Bien', 'M1', 'M2'] },
};

describe('printedTranslation', () => {
  it('maps text and each English choice to its translation', () => {
    const tr = printedTranslation(QUIZ, ES, {}, 'Gravedad');
    expect(tr?.title).toBe('Gravedad');
    expect(tr?.questions.q1).toEqual({
      text: 'Pregunta 1',
      choices: { Right: 'Bien', W1: 'M1', W2: 'M2' },
    });
  });

  it("keeps the group's modified wording in English", () => {
    const tr = printedTranslation(QUIZ, ES, { modifiedQuestions: true });
    expect(tr?.questions.q2.text).toBeUndefined();
    expect(tr?.questions.q1.text).toBe('Pregunta 1');
  });

  it('skips choices that do not line up', () => {
    const tr = printedTranslation(
      QUIZ,
      {
        q1: { text: 'Pregunta 1', choices: ['Bien'] },
      },
      {}
    );
    expect(tr?.questions.q1.choices).toBeUndefined();
  });

  it('is undefined with nothing to translate', () => {
    expect(printedTranslation(QUIZ, {}, {})).toBeUndefined();
  });
});

describe('printedGroupTranslations', () => {
  const sidecar = async (
    reviewed: string[],
    stale: string[] = []
  ): Promise<QuizTranslation> => ({
    locale: 'es',
    title: 'Gravedad',
    questions: ES,
    sourceHashes: Object.fromEntries(
      await Promise.all(
        QUIZ.questions.map(async (q) => [
          q.id,
          stale.includes(q.id) ? 'old' : await hashQuestionForTranslation(q),
        ])
      )
    ),
    reviewedQuestionIds: reviewed,
    model: 'm',
    generatedAt: 0,
    updatedAt: 0,
  });
  const index: Record<string, QuizTranslationIndexEntry> = {
    es: {
      driveFileId: 'f-es',
      reviewedCount: 0,
      staleCount: 0,
      questionCount: 2,
      sourceHashes: {},
      updatedAt: 0,
    },
  };

  it('loads only reviewed and current questions for a group with a language', async () => {
    const payload = await sidecar(['q1', 'q2'], ['q2']);
    const loader = { loadTranslation: vi.fn(() => Promise.resolve(payload)) };
    const [english, spanish] = await printedGroupTranslations(
      QUIZ,
      [pick(1), pick(2, { language: 'es' })],
      index,
      loader
    );
    expect(english).toBeUndefined();
    expect(Object.keys(spanish?.questions ?? {})).toEqual(['q1']);
    expect(loader.loadTranslation).toHaveBeenCalledOnce();
  });

  it('prints in English when the sidecar fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const loader = {
      loadTranslation: vi.fn(() => Promise.reject(new Error('down'))),
    };
    const out = await printedGroupTranslations(
      QUIZ,
      [pick(1, { language: 'es' })],
      index,
      loader
    );
    expect(out).toEqual([undefined]);
  });

  it('labels the group with its language', async () => {
    const payload = await sidecar(['q1']);
    const p = pick(2, { language: 'es' });
    const [tr] = await printedGroupTranslations(QUIZ, [p], index, {
      loadTranslation: () => Promise.resolve(payload),
    });
    expect(printedGroupForPrint(p, tr).label).toBe('Group 2 · Spanish');
    expect(printedGroupForPrint(p).label).toBe('Group 2 · English');
    expect(printedGroupForPrint(pick(3)).label).toBe('Group 3');
  });
});

describe('printed copy plans', () => {
  it('keeps unprinted groups printable with their version', () => {
    const plans = [
      pick(1),
      pick(2, {
        answerChoices: 'two',
        modifiedQuestions: true,
        language: 'es',
      }),
    ].map(printedCopyPlan);
    const printed: Pick<PaperBatch, 'printedGroup'>[] = [
      { printedGroup: { number: 1, answerChoices: 'all' } },
    ];
    const [left] = unprintedCopyPicks(plans, printed);
    expect(unprintedCopyPicks(plans, printed)).toHaveLength(1);
    expect(left.number).toBe(2);
    expect(left.students).toEqual([{ rosterId: 'r1', studentId: 's2' }]);
    expect(left.group).toMatchObject({
      answerChoices: 'two',
      modifiedQuestions: true,
      language: 'es',
    });
  });

  it('has nothing to print without a plan', () => {
    expect(unprintedCopyPicks(undefined, [])).toEqual([]);
  });
});

describe('reprinting a translated group', () => {
  it('keeps the language on the stack and labels the reprint with it', () => {
    const record = printedGroupRecord(pick(2, { language: 'es' }));
    expect(record.language).toBe('es');
    expect(recordPick(record).group.language).toBe('es');
    const batch: PaperBatch = {
      id: 'b2',
      quizId: 'quiz-1',
      rosterIds: ['r1'],
      questionCount: 2,
      choiceCount: 3,
      seats: {},
      spareSeats: [],
      pagesPerSheet: 1,
      createdAt: 0,
      printedGroup: record,
    };
    const tr = printedTranslation(QUIZ, ES, {});
    const [withTr] = printedReprintGroups(QUIZ, [batch], [tr]);
    expect(withTr.label).toBe('Group 2 · Spanish');
    expect(withTr.translation).toBe(tr);
    expect(printedReprintGroups(QUIZ, [batch])[0].label).toBe(
      'Group 2 · English'
    );
  });
});
