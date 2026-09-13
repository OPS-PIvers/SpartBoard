// Unit tests for quiz translation (docs/plans/QUIZ_TRANSLATION.md §5, §11 PR2).
// Firestore is a tiny in-memory fake; Gemini is an injected stub, so only the
// plan's decisions — alignment, quota, D17, D29 — are under test.

import { describe, it, expect, vi } from 'vitest';

const INCREMENT = Symbol('increment');

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { increment: (n: number) => ({ [INCREMENT]: n }) },
  }),
}));

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
  Type: {
    OBJECT: 'OBJECT',
    ARRAY: 'ARRAY',
    STRING: 'STRING',
    INTEGER: 'INTEGER',
  },
  ThinkingLevel: { MINIMAL: 'minimal' },
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));

import {
  BACK_TRANSLATION_DAILY_LIMIT,
  TEACHER_DAILY_LIMIT,
  assertQuizTranslationFeature,
  parseTranslateQuizRequest,
  translateResponse,
  monthlyTranslationDocId,
  teacherDailyTranslationDocId,
  translateQuiz,
  validateQuizTranslation,
  type QuestionTranslation,
  type TranslatableQuestion,
  type TranslationDeps,
} from './quizTranslation';

type Doc = Record<string, unknown>;

function makeDb(docs: Record<string, Doc>) {
  const applyPatch = (path: string, patch: Doc) => {
    const target = { ...(docs[path] ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === 'object' && INCREMENT in v) {
        const prev = typeof target[k] === 'number' ? target[k] : 0;
        target[k] = prev + (v as Record<symbol, number>)[INCREMENT];
      } else {
        target[k] = v;
      }
    }
    docs[path] = target;
  };
  const snapshotFor = (path: string) => ({
    exists: docs[path] !== undefined,
    data: () => docs[path],
    get: (field: string) => docs[path]?.[field],
  });
  const refFor = (path: string) => ({
    path,
    get: () => Promise.resolve(snapshotFor(path)),
    set: (patch: Doc) => {
      applyPatch(path, patch);
      return Promise.resolve();
    },
  });
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => refFor(`${name}/${id}`),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const tx = {
        get: (ref: { path: string }) => Promise.resolve(snapshotFor(ref.path)),
        set: (ref: { path: string }, patch: Doc) => applyPatch(ref.path, patch),
      };
      return fn(tx);
    },
  };
  return db as unknown as TranslationDeps['db'];
}

const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);

const mcQuestion = (): TranslatableQuestion => ({
  id: 'q1',
  type: 'MC',
  text: 'Which is prime?',
  correctAnswer: 'Seven',
  incorrectAnswers: ['Eight', '', 'Nine'],
});

const matchingQuestion = (): TranslatableQuestion => ({
  id: 'q2',
  type: 'Matching',
  text: 'Match them',
  correctAnswer: 'dog:perro|cat:gato',
  matchingDistractors: ['pez', ''],
});

const orderingQuestion = (): TranslatableQuestion => ({
  id: 'q3',
  type: 'Ordering',
  text: 'Order these',
  correctAnswer: 'first|second|third',
});

const freeResponseQuestion = (): TranslatableQuestion => ({
  id: 'q4',
  type: 'free-response',
  text: 'Explain',
  placeholder: 'Type here',
  rubricSnapshot: {
    criteria: [{ name: 'Clarity', descriptors: ['Weak', 'Strong'] }],
  },
});

const goodMc = (): QuestionTranslation => ({
  text: '¿Cuál es primo?',
  choices: ['Siete', 'Ocho', 'Nueve'],
});

function deps(
  overrides: Partial<TranslationDeps> & { docs?: Record<string, Doc> } = {}
): TranslationDeps {
  const docs = overrides.docs ?? {};
  return {
    db: overrides.db ?? makeDb(docs),
    now: overrides.now ?? (() => NOW),
    generate:
      overrides.generate ??
      vi.fn(() =>
        Promise.resolve({
          text: JSON.stringify({
            title: 'Cuestionario',
            questions: [{ id: 'q1', ...goodMc() }],
          }),
          outputTokens: 120,
        })
      ),
  };
}

const baseRequest = (extra: Record<string, unknown> = {}) => ({
  quizId: 'quiz-1',
  locale: 'es',
  title: 'Quiz',
  questions: [mcQuestion()],
  ...extra,
});

describe('validateQuizTranslation', () => {
  it('accepts a translation aligned with the FILTERED source arrays', () => {
    expect(
      validateQuizTranslation([mcQuestion()], ['q1'], { q1: goodMc() })
    ).toBeNull();
  });

  it('rejects a choices array sized against the unfiltered source', () => {
    const result = validateQuizTranslation([mcQuestion()], ['q1'], {
      q1: { text: 'x', choices: ['Siete', 'Ocho', '', 'Nueve'] },
    });
    expect(result).toMatch(/expected 3 choices/);
  });

  it('rejects a missing question id', () => {
    expect(validateQuizTranslation([mcQuestion()], ['q1'], {})).toMatch(
      /Missing translation for question q1/
    );
  });

  it('rejects an extra question id', () => {
    const result = validateQuizTranslation([mcQuestion()], ['q1'], {
      q1: goodMc(),
      q9: { text: 'nope' },
    });
    expect(result).toMatch(/Unexpected question id/);
  });

  it('rejects MC choices that collide after normalizeAnswer', () => {
    const result = validateQuizTranslation([mcQuestion()], ['q1'], {
      q1: { text: 'x', choices: ['Siete', '  siete ', 'Nueve'] },
    });
    expect(result).toMatch(/not mutually distinct/);
  });

  it('rejects "|" or ":" introduced into matching strings', () => {
    const result = validateQuizTranslation([matchingQuestion()], ['q2'], {
      q2: {
        text: 'x',
        matchingLeft: ['perro:x', 'gato'],
        matchingRight: ['dog', 'cat'],
        matchingDistractors: ['pez'],
      },
    });
    expect(result).toMatch(/may not contain/);
  });

  it('rejects a matching distractor count that ignores the empty entry', () => {
    const result = validateQuizTranslation([matchingQuestion()], ['q2'], {
      q2: {
        text: 'x',
        matchingLeft: ['perro', 'gato'],
        matchingRight: ['dog', 'cat'],
        matchingDistractors: ['pez', 'extra'],
      },
    });
    expect(result).toMatch(/expected 1 matchingDistractors/);
  });

  it('rejects "|" introduced into ordering strings and a wrong item count', () => {
    expect(
      validateQuizTranslation([orderingQuestion()], ['q3'], {
        q3: { text: 'x', orderingItems: ['uno|dos', 'dos', 'tres'] },
      })
    ).toMatch(/may not contain/);
    expect(
      validateQuizTranslation([orderingQuestion()], ['q3'], {
        q3: { text: 'x', orderingItems: ['uno', 'dos'] },
      })
    ).toMatch(/expected 3 orderingItems/);
  });

  it('rejects a rubric whose shape differs from the English snapshot', () => {
    const result = validateQuizTranslation([freeResponseQuestion()], ['q4'], {
      q4: {
        text: 'x',
        rubricSnapshot: {
          criteria: [{ name: 'Claridad', descriptors: ['Débil'] }],
        },
      },
    });
    expect(result).toMatch(/expected 2 descriptors/);
  });
});

describe('translateQuiz', () => {
  it('returns sourceHashes for every requested id and a decremented cap', async () => {
    const docs: Record<string, Doc> = {};
    const result = await translateQuiz(
      baseRequest(),
      'teacher-1',
      deps({ docs })
    );
    expect(Object.keys(result.questions)).toEqual(['q1']);
    expect(result.sourceHashes.q1).toMatch(/^[0-9a-f]{16}$/);
    expect(result.title).toBe('Cuestionario');
    expect(result.cap).toEqual({ remaining: 1999, total: 2000 });
    expect(docs[`ai_usage/${monthlyTranslationDocId(NOW)}`]).toMatchObject({
      units: 1,
      outputTokens: 120,
    });
    expect(
      docs[`ai_usage/${teacherDailyTranslationDocId('teacher-1', NOW)}`]
    ).toMatchObject({ count: 1 });
  });

  it('omits the title when only a stale subset is regenerated', async () => {
    const generate: TranslationDeps['generate'] = vi.fn(() =>
      Promise.resolve({
        text: JSON.stringify({ questions: [{ id: 'q1', ...goodMc() }] }),
        outputTokens: 10,
      })
    );
    const result = await translateQuiz(
      baseRequest({ questionIds: ['q1'] }),
      'teacher-1',
      deps({ generate })
    );
    expect(result.title).toBeUndefined();
    expect(vi.mocked(generate).mock.calls[0][0].maxOutputTokens).toBe(4096);
  });

  it('repairs once, then succeeds', async () => {
    const generate: TranslationDeps['generate'] = vi
      .fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          questions: [{ id: 'q1', text: 'x', choices: ['a', 'b'] }],
        }),
        outputTokens: 10,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ questions: [{ id: 'q1', ...goodMc() }] }),
        outputTokens: 20,
      });
    const result = await translateQuiz(
      baseRequest(),
      'teacher-1',
      deps({ generate })
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.outputTokens).toBe(30);
    expect(vi.mocked(generate).mock.calls[1][0].prompt).toMatch(
      /previous output was rejected/
    );
  });

  it('gives up after exactly one repair attempt', async () => {
    const generate = vi.fn(() =>
      Promise.resolve({
        text: JSON.stringify({
          questions: [{ id: 'q1', text: 'x', choices: ['a'] }],
        }),
        outputTokens: 10,
      })
    );
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ generate }))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('rejects a MAX_TOKENS finish rather than serving a truncated array', async () => {
    const generate = vi.fn(() =>
      Promise.resolve({
        text: JSON.stringify({ questions: [] }),
        finishReason: 'MAX_TOKENS',
        outputTokens: 16384,
      })
    );
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ generate }))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('blocks with cap details when the org monthly unit cap is spent', async () => {
    const docs = {
      [`ai_usage/${monthlyTranslationDocId(NOW)}`]: { units: 2000 },
    };
    const generate = vi.fn();
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ docs, generate }))
    ).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { capRemaining: 0, capTotal: 2000 },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('blocks when the org monthly output-token cap is spent', async () => {
    const docs = {
      [`ai_usage/${monthlyTranslationDocId(NOW)}`]: {
        units: 1,
        outputTokens: 8_000_000,
      },
    };
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ docs }))
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('blocks when the teacher daily limit is spent', async () => {
    const docs = {
      [`ai_usage/${teacherDailyTranslationDocId('teacher-1', NOW)}`]: {
        count: TEACHER_DAILY_LIMIT,
      },
    };
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ docs }))
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('D17: refuses a non-English source quiz', async () => {
    await expect(
      translateQuiz(
        baseRequest({ sourceLanguage: 'es-MX' }),
        'teacher-1',
        deps()
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('D17: allows an absent or en-US source language', async () => {
    await expect(
      translateQuiz(
        baseRequest({ sourceLanguage: 'en-US' }),
        'teacher-1',
        deps()
      )
    ).resolves.toBeTruthy();
  });

  it('D29: refuses a bank-slot quiz', async () => {
    await expect(
      translateQuiz(
        baseRequest({ bankSlots: [{ bankId: 'b1', count: 2 }] }),
        'teacher-1',
        deps()
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses a locale the admin has not enabled', async () => {
    const docs = {
      'admin_settings/quiz_translation': { enabledLanguages: ['so'] },
    };
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ docs }))
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('treats an absent settings doc as all curated languages enabled', async () => {
    await expect(
      translateQuiz(baseRequest({ locale: 'hmn' }), 'teacher-1', deps())
    ).resolves.toBeTruthy();
  });
});

describe('quota metering', () => {
  it('reserves the unit before the model is called', async () => {
    const docs: Record<string, Doc> = {};
    const seen: Record<string, unknown>[] = [];
    const generate: TranslationDeps['generate'] = vi.fn(() => {
      seen.push({ ...docs[`ai_usage/${monthlyTranslationDocId(NOW)}`] });
      return Promise.resolve({
        text: JSON.stringify({ questions: [{ id: 'q1', ...goodMc() }] }),
        outputTokens: 5,
      });
    });
    await translateQuiz(baseRequest(), 'teacher-1', deps({ docs, generate }));
    expect(seen[0]).toMatchObject({ units: 1 });
  });

  it('bills output tokens when the validator rejects both attempts', async () => {
    const docs: Record<string, Doc> = {};
    const generate = vi.fn(() =>
      Promise.resolve({
        text: JSON.stringify({
          questions: [{ id: 'q1', text: 'x', choices: ['a'] }],
        }),
        outputTokens: 40,
      })
    );
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ docs, generate }))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(docs[`ai_usage/${monthlyTranslationDocId(NOW)}`]).toMatchObject({
      units: 1,
      outputTokens: 80,
    });
  });

  it('bills output tokens on a MAX_TOKENS cut-off', async () => {
    const docs: Record<string, Doc> = {};
    const generate = vi.fn(() =>
      Promise.resolve({
        text: JSON.stringify({ questions: [] }),
        finishReason: 'MAX_TOKENS',
        outputTokens: 16384,
      })
    );
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ docs, generate }))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(docs[`ai_usage/${monthlyTranslationDocId(NOW)}`]).toMatchObject({
      units: 1,
      outputTokens: 16384,
    });
  });

  it('blocks the second of two calls made at cap-1', async () => {
    const docs: Record<string, Doc> = {
      'admin_settings/quiz_translation': { monthlyCapUnits: 2 },
      [`ai_usage/${monthlyTranslationDocId(NOW)}`]: { units: 1 },
    };
    const d = deps({ docs });
    await expect(translateQuiz(baseRequest(), 't', d)).resolves.toBeTruthy();
    await expect(translateQuiz(baseRequest(), 't', d)).rejects.toMatchObject({
      code: 'resource-exhausted',
      details: { reason: 'units' },
    });
  });

  it('reports the true unit remainder when only the token cap is spent', async () => {
    const docs = {
      [`ai_usage/${monthlyTranslationDocId(NOW)}`]: {
        units: 5,
        outputTokens: 8_000_000,
      },
    };
    await expect(
      translateQuiz(baseRequest(), 'teacher-1', deps({ docs }))
    ).rejects.toMatchObject({
      details: { capRemaining: 1995, capTotal: 2000, reason: 'outputTokens' },
    });
  });
});

describe('translateResponse', () => {
  const backDeps = (docs: Record<string, Doc>) =>
    deps({
      docs,
      generate: vi.fn(() =>
        Promise.resolve({
          text: JSON.stringify({ text: 'I think so' }),
          outputTokens: 30,
        })
      ),
    });

  it('never spends the org quiz-translation cap', async () => {
    const docs: Record<string, Doc> = {};
    await translateResponse(
      { text: 'creo que si', sourceLocale: 'es' },
      'teacher-1',
      backDeps(docs)
    );
    const monthly = docs[`ai_usage/${monthlyTranslationDocId(NOW)}`];
    expect(monthly).toMatchObject({ backUnits: 1, backOutputTokens: 30 });
    expect(monthly.units).toBeUndefined();
    expect(monthly.outputTokens).toBeUndefined();
    expect(
      docs[`ai_usage/${teacherDailyTranslationDocId('teacher-1', NOW)}`]
    ).toMatchObject({ backCount: 1 });
  });

  it('still enforces its own daily ceiling', async () => {
    const docs: Record<string, Doc> = {
      [`ai_usage/${teacherDailyTranslationDocId('teacher-1', NOW)}`]: {
        backCount: BACK_TRANSLATION_DAILY_LIMIT,
      },
    };
    await expect(
      translateResponse(
        { text: 'hola', sourceLocale: 'es' },
        'teacher-1',
        backDeps(docs)
      )
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('refuses a locale the admin has not enabled', async () => {
    const docs: Record<string, Doc> = {
      'admin_settings/quiz_translation': { enabledLanguages: ['so'] },
    };
    await expect(
      translateResponse(
        { text: 'hola', sourceLocale: 'es' },
        'teacher-1',
        backDeps(docs)
      )
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('parseTranslateQuizRequest bounds', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...mcQuestion(), id: `q${i}` }));

  it('rejects more than 200 questions', () => {
    expect(() =>
      parseTranslateQuizRequest(baseRequest({ questions: many(201) }))
    ).toThrow(/at most 200/);
  });

  it('rejects an oversized payload', () => {
    const fat = many(10).map((q) => ({ ...q, text: 'x'.repeat(30_000) }));
    expect(() =>
      parseTranslateQuizRequest(baseRequest({ questions: fat }))
    ).toThrow(/too large/);
  });

  it('rejects an empty questionIds array', () => {
    expect(() =>
      parseTranslateQuizRequest(baseRequest({ questionIds: [] }))
    ).toThrow(/at least one question/);
  });
});

describe('assertQuizTranslationFeature', () => {
  const run = (docs: Record<string, Doc>, email?: string) =>
    assertQuizTranslationFeature(makeDb(docs), email);

  it('absent doc: admin-only', async () => {
    await expect(run({}, 'teacher@x.org')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      run({ 'admins/boss@x.org': {} }, 'Boss@X.org')
    ).resolves.toBeUndefined();
  });

  it('disabled: denied even for an admin', async () => {
    await expect(
      run(
        {
          'global_permissions/quiz-translation': { enabled: false },
          'admins/boss@x.org': {},
        },
        'boss@x.org'
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('beta: only listed emails', async () => {
    const docs = {
      'global_permissions/quiz-translation': {
        enabled: true,
        accessLevel: 'beta',
        betaUsers: ['Beta@x.org'],
      },
    };
    await expect(run(docs, 'beta@x.org')).resolves.toBeUndefined();
    await expect(run(docs, 'other@x.org')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('public: any signed-in teacher', async () => {
    await expect(
      run(
        {
          'global_permissions/quiz-translation': {
            enabled: true,
            accessLevel: 'public',
          },
        },
        'teacher@x.org'
      )
    ).resolves.toBeUndefined();
  });
});
