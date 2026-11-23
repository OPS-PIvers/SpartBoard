import { describe, it, expect, vi } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import type { BankContent } from '@/utils/questionBanks';
import {
  loadPaperQuizWithFallback,
  paperFrozenFileId,
  applyCurrentAnswerKeys,
  keyFixOptionsFor,
  assignmentFrozenFileId,
  hasEveryCurrentAnswerKey,
  loadAssignmentAnswerKeyQuiz,
  resolveQuizAssignContent,
  unfrozenAssignmentCount,
  withCurrentAnswerKeys,
} from '@/utils/quizAssignBankDraw';

const q = (id: string): QuizQuestion => ({
  id,
  type: 'MC',
  text: id,
  timeLimit: 0,
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
});

const baseQuiz = (over: Partial<QuizData> = {}): QuizData => ({
  id: 'quiz-1',
  title: 'Vocab',
  questions: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('resolveQuizAssignContent', () => {
  it('passes a plain quiz through untouched', async () => {
    const saveDriveSnapshot = vi.fn();
    const out = await resolveQuizAssignContent(
      baseQuiz({ questions: [q('q1')] }),
      'drive-1',
      { loadBankContentsForQuiz: vi.fn(), saveDriveSnapshot }
    );
    expect(out.questions.map((x) => x.id)).toEqual(['q1']);
    expect(out.driveFileId).toBe('drive-1');
    expect(out.bankSlots).toBeUndefined();
    expect(saveDriveSnapshot).not.toHaveBeenCalled();
  });

  it('resolves an all-bank quiz into its pool and a frozen copy', async () => {
    const quiz = baseQuiz({
      bankSlots: [
        {
          id: 's1',
          bankId: 'bank-1',
          bankTitle: 'Bank',
          mode: 'random',
          count: 2,
        },
      ],
    });
    const bank = {
      questions: [q('b1'), q('b2'), q('b3')],
    } as unknown as BankContent;
    const saveDriveSnapshot = vi.fn().mockResolvedValue('snap-1');
    const out = await resolveQuizAssignContent(quiz, 'drive-1', {
      loadBankContentsForQuiz: vi
        .fn()
        .mockResolvedValue(new Map([['bank-1', bank]])),
      saveDriveSnapshot,
    });
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.bankSlots?.length).toBe(1);
    expect(out.driveFileId).toBe('snap-1');
    expect(out.resolvedDriveFileId).toBe('snap-1');
    expect(saveDriveSnapshot).toHaveBeenCalledOnce();
  });
});

const fib = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
  id: 'b1',
  type: 'FIB',
  text: 'Studies of identical twins are called ____.',
  timeLimit: 0,
  correctAnswer: 'Twin studies',
  incorrectAnswers: [],
  alternateAnswers: ['Twins'],
  points: 2,
  ...over,
});

const bankOf = (...questions: QuizQuestion[]) =>
  new Map([['bank-1', { questions }]]);

const slot = (id: string, bankId: string) => ({
  id,
  bankId,
  bankTitle: bankId,
  mode: 'random' as const,
});
const lib = (questions: QuizQuestion[] = []) => ({
  questions,
  bankSlots: [slot('s1', 'bank-1')],
});

describe('applyCurrentAnswerKeys', () => {
  it('takes a bank question’s new also-accepted answers but keeps the slot’s points', () => {
    const frozen = baseQuiz({ questions: [fib()] });
    const out = applyCurrentAnswerKeys(
      frozen,
      lib(),
      bankOf(fib({ points: 1, alternateAnswers: ['Twins', 'Twins studies'] }))
    );
    expect(out.questions[0].alternateAnswers).toEqual([
      'Twins',
      'Twins studies',
    ]);
    expect(out.questions[0].points).toBe(2);
    expect(out.questions[0].text).toBe(frozen.questions[0].text);
  });

  it('drops a key field the bank question no longer has', () => {
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [fib()] }),
      lib(),
      bankOf(fib({ alternateAnswers: undefined, correctAnswer: 'Twins' }))
    );
    expect(out.questions[0].alternateAnswers).toBeUndefined();
    expect(out.questions[0].correctAnswer).toBe('Twins');
  });

  it('lets a fixed question’s current key win over a bank copy with the same id', () => {
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [fib()] }),
      lib([fib({ correctAnswer: 'From quiz' })]),
      bankOf(fib({ correctAnswer: 'From bank' }))
    );
    expect(out.questions[0].correctAnswer).toBe('From quiz');
  });

  it('moves the correct choice when the choices themselves are unchanged', () => {
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [q('m1')] }),
      lib(),
      bankOf({ ...q('m1'), correctAnswer: 'b', incorrectAnswers: ['a'] })
    );
    expect(out.questions[0].correctAnswer).toBe('b');
    expect(out.questions[0].incorrectAnswers).toEqual(['a']);
  });

  it('keeps the frozen key when students saw different choices or a different type', () => {
    const frozen = baseQuiz({ questions: [q('m1'), fib()] });
    const out = applyCurrentAnswerKeys(
      frozen,
      lib(),
      bankOf(
        { ...q('m1'), incorrectAnswers: ['c'] },
        fib({ correctAnswer: 'Twin studies\u001FNature' })
      )
    );
    expect(out).toBe(frozen);
  });

  it('grades with the frozen copy when the library quiz cannot load', async () => {
    const frozen = baseQuiz({ questions: [fib()] });
    const out = await withCurrentAnswerKeys(frozen, 'drive-1', {
      loadQuizData: () => Promise.reject(new Error('gone')),
      loadBankContentsForQuiz: vi.fn(),
    });
    expect(out).toBe(frozen);
  });

  it('takes a shared id from the slot first in quiz order, whatever order the banks loaded in', () => {
    const banks = new Map([
      ['bank-2', { questions: [fib({ correctAnswer: 'Second' })] }],
      ['bank-1', { questions: [fib({ correctAnswer: 'First' })] }],
    ]);
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [fib()] }),
      {
        questions: [],
        bankSlots: [slot('s1', 'bank-1'), slot('s2', 'bank-2')],
      },
      banks
    );
    expect(out.questions[0].correctAnswer).toBe('First');
  });

  it('skips a bank question the earlier slot could not have dealt', () => {
    const banks = new Map([
      ['bank-1', { questions: [fib({ correctAnswer: 'Wrong bank' })] }],
      ['bank-2', { questions: [fib({ correctAnswer: 'Dealt' })] }],
    ]);
    const out = applyCurrentAnswerKeys(
      baseQuiz({ questions: [fib()] }),
      {
        questions: [],
        bankSlots: [
          { ...slot('s1', 'bank-1'), questionIds: ['someone-else'] },
          slot('s2', 'bank-2'),
        ],
      },
      banks
    );
    expect(out.questions[0].correctAnswer).toBe('Dealt');
  });

  it('marks the result only when every bank in the quiz loaded', () => {
    const frozen = baseQuiz({ questions: [fib()] });
    expect(
      hasEveryCurrentAnswerKey(applyCurrentAnswerKeys(frozen, lib(), new Map()))
    ).toBe(false);
    expect(
      hasEveryCurrentAnswerKey(
        applyCurrentAnswerKeys(frozen, lib(), bankOf(fib()))
      )
    ).toBe(true);
  });
});

describe('loadAssignmentAnswerKeyQuiz', () => {
  it('loads the library quiz when the assignment has no frozen copy', async () => {
    const library = baseQuiz({ questions: [q('m1')] });
    const loadQuizData = vi.fn().mockResolvedValue(library);
    const out = await loadAssignmentAnswerKeyQuiz('drive-1', undefined, {
      loadQuizData,
      loadBankContentsForQuiz: vi.fn(),
    });
    expect(out).toBe(library);
    expect(loadQuizData).toHaveBeenCalledWith('drive-1');
  });

  it('grades the frozen copy with the library keys', async () => {
    const frozen = baseQuiz({ questions: [fib()] });
    const loadQuizData = vi.fn((id: string) =>
      Promise.resolve(
        id === 'frozen-1' ? frozen : baseQuiz({ ...lib(), id: 'library' })
      )
    );
    const out = await loadAssignmentAnswerKeyQuiz('drive-1', 'frozen-1', {
      loadQuizData,
      loadBankContentsForQuiz: () =>
        Promise.resolve(
          bankOf(fib({ alternateAnswers: ['Twins', 'Twinning'] }))
        ) as Promise<Map<string, BankContent>>,
    });
    expect(loadQuizData.mock.calls.map((c) => c[0])).toEqual([
      'frozen-1',
      'drive-1',
    ]);
    expect(out.questions[0].alternateAnswers).toEqual(['Twins', 'Twinning']);
  });

  it('throws when the frozen copy cannot load', async () => {
    await expect(
      loadAssignmentAnswerKeyQuiz('drive-1', 'frozen-1', {
        loadQuizData: () => Promise.reject(new Error('gone')),
        loadBankContentsForQuiz: vi.fn(),
      })
    ).rejects.toThrow('gone');
  });
});

describe('frozen plain-quiz assignments', () => {
  const library = (questions: QuizQuestion[]) => ({ questions });

  it('keeps the as-assigned key when the question was reworded for a retake', () => {
    const frozen = baseQuiz({
      questions: [{ ...q('q1'), text: 'What is 2 + 2?', correctAnswer: '4' }],
    });
    const out = applyCurrentAnswerKeys(
      frozen,
      library([{ ...q('q1'), text: 'What is 3 + 3?', correctAnswer: '6' }]),
      new Map(),
      { sameTextOnly: true }
    );
    expect(out.questions[0].text).toBe('What is 2 + 2?');
    expect(out.questions[0].correctAnswer).toBe('4');
    expect(out).toBe(frozen);
  });

  it('a bank draw still takes a key fix on a reworded question, as before', () => {
    const frozen = baseQuiz({
      questions: [{ ...q('q1'), text: 'Teh answer?', correctAnswer: 'a' }],
    });
    const out = applyCurrentAnswerKeys(
      frozen,
      library([
        {
          ...q('q1'),
          text: 'The answer?',
          correctAnswer: 'b',
          incorrectAnswers: ['a'],
        },
      ]),
      new Map()
    );
    expect(out.questions[0].correctAnswer).toBe('b');
  });

  it('needs the same text only for assignments frozen at assign', () => {
    expect(keyFixOptionsFor({ frozenDriveFileId: 'f' }).sameTextOnly).toBe(
      true
    );
    expect(
      keyFixOptionsFor({ resolvedDriveFileId: 'r', frozenDriveFileId: 'f' })
        .sameTextOnly
    ).toBe(false);
    expect(keyFixOptionsFor(undefined).sameTextOnly).toBe(false);
  });

  it('takes a key fix when the question and its choices are unchanged', () => {
    const frozen = baseQuiz({
      questions: [{ ...q('q1'), correctAnswer: 'a', incorrectAnswers: ['b'] }],
    });
    const out = applyCurrentAnswerKeys(
      frozen,
      library([{ ...q('q1'), correctAnswer: 'b', incorrectAnswers: ['a'] }]),
      new Map()
    );
    expect(out.questions[0].correctAnswer).toBe('b');
  });

  it('keeps the as-assigned question when the choices changed', () => {
    const frozen = baseQuiz({ questions: [q('q1')] });
    const out = applyCurrentAnswerKeys(
      frozen,
      library([{ ...q('q1'), correctAnswer: 'c', incorrectAnswers: ['d'] }]),
      new Map()
    );
    expect(out.questions[0].correctAnswer).toBe('a');
  });

  it('prefers a bank-draw copy, then the frozen copy', () => {
    expect(
      assignmentFrozenFileId({
        resolvedDriveFileId: 'bank',
        frozenDriveFileId: 'frozen',
      })
    ).toBe('bank');
    expect(assignmentFrozenFileId({ frozenDriveFileId: 'frozen' })).toBe(
      'frozen'
    );
    expect(assignmentFrozenFileId({})).toBeUndefined();
    expect(assignmentFrozenFileId(undefined)).toBeUndefined();
  });

  it('counts only this quiz’s assignments that an edit would re-score', () => {
    expect(
      unfrozenAssignmentCount('quiz-1', [
        { quizId: 'quiz-1' },
        { quizId: 'quiz-1', frozenDriveFileId: 'f' },
        { quizId: 'quiz-1', resolvedDriveFileId: 'r' },
        { quizId: 'quiz-1', sync: { groupId: 'g', lastSyncedVersion: 1 } },
        { quizId: 'quiz-2' },
      ] as Parameters<typeof unfrozenAssignmentCount>[1])
    ).toBe(1);
  });
});

describe('paper import and reprint source', () => {
  const quiz = (id: string, text: string): QuizData =>
    ({
      id,
      title: 'Q',
      questions: [{ id: 'q1', type: 'MC', text }],
      createdAt: 0,
      updatedAt: 0,
    }) as unknown as QuizData;
  const store: Record<string, QuizData> = {
    live: quiz('qz', 'edited later'),
    frozen: quiz('qz', 'as printed'),
  };
  const deps = {
    loadQuizData: vi.fn((id: string) => Promise.resolve(store[id])),
    loadBankContentsForQuiz: vi.fn(() => Promise.resolve(new Map())),
  };

  it('reads the frozen copy for a frozen paper card', async () => {
    const id = paperFrozenFileId({ frozenDriveFileId: 'frozen' });
    expect(id).toBe('frozen');
    const data = await loadAssignmentAnswerKeyQuiz('live', id, deps);
    expect(data.questions[0].text).toBe('as printed');
  });

  it('reads the frozen copy for a frozen Written on paper assignment', () => {
    expect(paperFrozenFileId({ frozenDriveFileId: 'frozenWritten' })).toBe(
      'frozenWritten'
    );
  });

  it('keeps the library quiz for bank-draw hybrids and unfrozen cards', () => {
    expect(
      paperFrozenFileId({
        resolvedDriveFileId: 'r',
        frozenDriveFileId: 'f',
      })
    ).toBeUndefined();
    expect(paperFrozenFileId({})).toBeUndefined();
    expect(paperFrozenFileId(undefined)).toBeUndefined();
  });
});

describe('loadPaperQuizWithFallback', () => {
  const q = { id: 'live' } as unknown as QuizData;
  const f = { id: 'frozen' } as unknown as QuizData;

  it('uses the frozen copy when it loads', async () => {
    const live = vi.fn(() => Promise.resolve(q));
    expect(
      await loadPaperQuizWithFallback('x', () => Promise.resolve(f), live)
    ).toBe(f);
    expect(live).not.toHaveBeenCalled();
  });

  it('falls back to the library quiz when the frozen copy will not load', async () => {
    expect(
      await loadPaperQuizWithFallback(
        'x',
        () => Promise.resolve(null),
        () => Promise.resolve(q)
      )
    ).toBe(q);
  });

  it('goes straight to the library quiz when nothing is frozen', async () => {
    const frozen = vi.fn(() => Promise.resolve(f));
    expect(
      await loadPaperQuizWithFallback(undefined, frozen, () =>
        Promise.resolve(q)
      )
    ).toBe(q);
    expect(frozen).not.toHaveBeenCalled();
  });
});
