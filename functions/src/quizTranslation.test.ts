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
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: (email: string) => {
    const at = email.lastIndexOf('@');
    return at < 0 || at === email.length - 1
      ? null
      : '@' + email.slice(at + 1).toLowerCase();
  },
  resolveOrgIdForDomain: () => Promise.resolve(null),
}));

import {
  BACK_TRANSLATION_DAILY_LIMIT,
  TEACHER_DAILY_LIMIT,
  assertQuizTranslationFeature,
  parseTranslateQuizRequest,
  translateResponse,
  monthlyTranslationDocId,
  teacherDailyTranslationDocId,
  translateQuiz,
  translateQuizV1,
  translateResponseV1,
  validateQuizTranslation,
  tokenizeFibStem,
  restoreFibStem,
  buildTranslationPrompt,
  buildSystemInstruction,
  type QuestionTranslation,
  type TranslatableQuestion,
  type TranslationDeps,
} from './quizTranslation';

type CallableHandler = (request: {
  auth?: { uid: string; token: { email?: string; email_verified?: boolean } };
  data?: unknown;
}) => Promise<unknown>;
const translateQuizV1Handler = translateQuizV1 as unknown as CallableHandler;
const translateResponseV1Handler =
  translateResponseV1 as unknown as CallableHandler;

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
    doc: (path: string) => refFor(path),
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

  it('rejects Russian MC choices that differ only by ё/е', () => {
    const result = validateQuizTranslation([mcQuestion()], ['q1'], {
      q1: { text: 'x', choices: ['Всё', 'Все', 'Ничего'] },
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

  it('translates with the advanced model, honoring the admin override', async () => {
    const generate = vi.fn(() =>
      Promise.resolve({
        text: JSON.stringify({ questions: [{ id: 'q1', ...goodMc() }] }),
        outputTokens: 10,
      })
    );
    const byDefault = await translateQuiz(
      baseRequest(),
      'teacher-1',
      deps({ generate })
    );
    expect(byDefault.model).toBe('gemini-3.7-flash');
    const overridden = await translateQuiz(baseRequest(), 'teacher-1', {
      ...deps({
        docs: {
          'global_permissions/gemini-functions': {
            config: {
              standardModel: 'gemini-3.5-flash-lite',
              advancedModel: 'gemini-3.8-flash',
            },
          },
        },
      }),
      generate,
    });
    expect(overridden.model).toBe('gemini-3.8-flash');
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
  const backDeps = (
    docs: Record<string, Doc>,
    generate?: TranslationDeps['generate']
  ) =>
    deps({
      docs,
      generate:
        generate ??
        vi.fn(() =>
          Promise.resolve({
            text: JSON.stringify({ text: 'I think so' }),
            outputTokens: 30,
          })
        ),
    });

  it('keeps back-translation on the standard model', async () => {
    const result = await translateResponse(
      { text: 'creo que si', sourceLocale: 'es' },
      'teacher-1',
      backDeps({})
    );
    expect(result.model).toBe('gemini-3.5-flash-lite');
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

  it('reserves the unit before the model is called', async () => {
    const docs: Record<string, Doc> = {};
    const seen: Record<string, unknown>[] = [];
    const generate: TranslationDeps['generate'] = vi.fn(() => {
      seen.push({
        ...docs[`ai_usage/${teacherDailyTranslationDocId('teacher-1', NOW)}`],
      });
      return Promise.resolve({
        text: JSON.stringify({ text: 'I think so' }),
        outputTokens: 5,
      });
    });
    await translateResponse(
      { text: 'creo que si', sourceLocale: 'es' },
      'teacher-1',
      backDeps(docs, generate)
    );
    expect(seen[0]).toMatchObject({ backCount: 1 });
  });

  it('still reserves the unit even when the model call fails', async () => {
    const docs: Record<string, Doc> = {};
    const generate: TranslationDeps['generate'] = vi.fn(() =>
      Promise.reject(new Error('vertex down'))
    );
    await expect(
      translateResponse(
        { text: 'creo que si', sourceLocale: 'es' },
        'teacher-1',
        backDeps(docs, generate)
      )
    ).rejects.toThrow('vertex down');
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

  it('blocks the second of two sequential calls made at cap-1', async () => {
    const docs: Record<string, Doc> = {
      [`ai_usage/${teacherDailyTranslationDocId('teacher-1', NOW)}`]: {
        backCount: BACK_TRANSLATION_DAILY_LIMIT - 1,
      },
    };
    const d = backDeps(docs);
    await expect(
      translateResponse({ text: 'hola', sourceLocale: 'es' }, 'teacher-1', d)
    ).resolves.toBeTruthy();
    await expect(
      translateResponse({ text: 'hola', sourceLocale: 'es' }, 'teacher-1', d)
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

  it('rejects a title over 1000 characters', () => {
    expect(() =>
      parseTranslateQuizRequest(baseRequest({ title: 'x'.repeat(1001) }))
    ).toThrow(/at most 1000 characters/);
  });

  it('accepts a title at exactly 1000 characters', () => {
    expect(() =>
      parseTranslateQuizRequest(baseRequest({ title: 'x'.repeat(1000) }))
    ).not.toThrow();
  });
});

describe('assertQuizTranslationFeature', () => {
  const run = (docs: Record<string, Doc>, email?: string, uid = 'uid-1') =>
    assertQuizTranslationFeature(makeDb(docs), email, uid);

  it('absent doc: denies everyone, admins included (missingDocPublic: false)', async () => {
    await expect(run({}, 'teacher@x.org')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      run({ 'admins/boss@x.org': {} }, 'Boss@X.org')
    ).rejects.toMatchObject({ code: 'permission-denied' });
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

  it('requires enabled === true, not merely !== false', async () => {
    await expect(
      run(
        { 'global_permissions/quiz-translation': { accessLevel: 'public' } },
        'teacher@x.org'
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('admin bypasses accessLevel, minTier and buildings once the doc exists and is enabled', async () => {
    await expect(
      run(
        {
          'global_permissions/quiz-translation': {
            enabled: true,
            accessLevel: 'admin',
            minTier: 'internal',
            buildings: ['high'],
          },
          'admins/boss@x.org': {},
        },
        'boss@x.org'
      )
    ).resolves.toBeUndefined();
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

  it('minTier: denies a free-tier teacher and allows an internal-domain one', async () => {
    const docs = {
      'global_permissions/quiz-translation': {
        enabled: true,
        accessLevel: 'public',
        minTier: 'org',
      },
    };
    await expect(run(docs, 'teacher@gmail.com')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(run(docs, 'teacher@orono.k12.mn.us')).resolves.toBeUndefined();
  });

  it('buildings: denies a teacher whose selectedBuildings do not match', async () => {
    const docs = {
      'global_permissions/quiz-translation': {
        enabled: true,
        accessLevel: 'public',
        buildings: ['high'],
      },
      'users/uid-1/userProfile/profile': { selectedBuildings: ['middle'] },
    };
    await expect(run(docs, 'teacher@x.org', 'uid-1')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('buildings: allows a teacher with a matching selectedBuildings entry', async () => {
    const docs = {
      'global_permissions/quiz-translation': {
        enabled: true,
        accessLevel: 'public',
        buildings: ['high'],
      },
      'users/uid-1/userProfile/profile': {
        selectedBuildings: ['orono-high-school'],
      },
    };
    await expect(run(docs, 'teacher@x.org', 'uid-1')).resolves.toBeUndefined();
  });
});

describe('translateQuizV1 / translateResponseV1 — caller identity verification', () => {
  // SECURITY: email/password sign-in lets a caller self-report ANY email — request.auth.token.email
  // alone can't prove ownership of that address. assertQuizTranslationFeature() authorizes off this
  // email (admins/{email} lookup, betaUsers allowlist), so an unverified claim of a real admin's or
  // beta user's address must be rejected before that check ever runs.
  it('translateQuizV1 rejects a self-reported email that is not verified', async () => {
    await expect(
      translateQuizV1Handler({
        auth: {
          uid: 'uid-1',
          token: { email: 'boss@x.org', email_verified: false },
        },
        data: {},
      })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Caller email must be verified.',
    });
  });

  it('translateQuizV1 rejects a token with no email_verified claim at all', async () => {
    await expect(
      translateQuizV1Handler({
        auth: { uid: 'uid-1', token: { email: 'boss@x.org' } },
        data: {},
      })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Caller email must be verified.',
    });
  });

  it('translateQuizV1 lets a verified caller past the identity gate (fails later, not on verification)', async () => {
    await expect(
      translateQuizV1Handler({
        auth: {
          uid: 'uid-1',
          token: { email: 'boss@x.org', email_verified: true },
        },
        data: {},
      })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Quiz translation is not available for your account.',
    });
  });

  it('translateResponseV1 rejects a self-reported email that is not verified', async () => {
    await expect(
      translateResponseV1Handler({
        auth: {
          uid: 'uid-1',
          token: { email: 'boss@x.org', email_verified: false },
        },
        data: { text: 'creo que si', sourceLocale: 'es' },
      })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Caller email must be verified.',
    });
  });

  it('translateResponseV1 rejects a token with no email_verified claim at all', async () => {
    await expect(
      translateResponseV1Handler({
        auth: { uid: 'uid-1', token: { email: 'boss@x.org' } },
        data: { text: 'creo que si', sourceLocale: 'es' },
      })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Caller email must be verified.',
    });
  });

  it('translateResponseV1 lets a verified caller past the identity gate (fails later, not on verification)', async () => {
    await expect(
      translateResponseV1Handler({
        auth: {
          uid: 'uid-1',
          token: { email: 'boss@x.org', email_verified: true },
        },
        data: { text: 'creo que si', sourceLocale: 'es' },
      })
    ).rejects.toMatchObject({
      code: 'permission-denied',
      message: 'Quiz translation is not available for your account.',
    });
  });
});

const fibQuestion = (): TranslatableQuestion => ({
  id: 'q5',
  type: 'FIB',
  text: 'The capital of France is ____ and it sits on the ______.',
  correctAnswer: 'Paris',
});

describe('FIB blank tokens', () => {
  it('tokenizes and restores a stem round-trip', () => {
    const q = fibQuestion();
    const { text, blanks } = tokenizeFibStem(q.text ?? '');
    expect(text).toBe(
      'The capital of France is [[1]] and it sits on the [[2]].'
    );
    expect(blanks).toEqual(['____', '______']);
    expect(restoreFibStem(text, blanks)).toBe(q.text);
  });

  it('restores blanks even when the target language reorders the tokens', () => {
    const { blanks } = tokenizeFibStem(fibQuestion().text ?? '');
    expect(restoreFibStem('Sobre el [[2]] está [[1]].', blanks)).toBe(
      'Sobre el ______ está ____.'
    );
  });

  it('accepts a translated stem that keeps every token and an answer', () => {
    expect(
      validateQuizTranslation([fibQuestion()], ['q5'], {
        q5: {
          text: 'La capital de Francia es [[1]] y está en el [[2]].',
          answer: 'París',
        },
      })
    ).toBeNull();
  });

  it('rejects a translated stem that drops a blank token', () => {
    expect(
      validateQuizTranslation([fibQuestion()], ['q5'], {
        q5: { text: 'La capital de Francia es [[1]].', answer: 'París' },
      })
    ).toMatch(/blank token/);
  });

  it('rejects a missing translated answer', () => {
    expect(
      validateQuizTranslation([fibQuestion()], ['q5'], {
        q5: { text: 'La capital de Francia es [[1]] y está en el [[2]].' },
      })
    ).toMatch(/accepted answer is required/);
  });

  it('does not require an answer when the English FIB has none', () => {
    expect(
      validateQuizTranslation(
        [{ ...fibQuestion(), correctAnswer: '  ' }],
        ['q5'],
        {
          q5: { text: 'La capital de Francia es [[1]] y está en el [[2]].' },
        }
      )
    ).toBeNull();
  });

  it('adds the per-language note only for that locale and keeps the structural rules', () => {
    const ru = buildSystemInstruction('ru', 'Russian');
    const es = buildSystemInstruction('es', 'Spanish');
    expect(ru).toContain('старшая школа');
    expect(es).not.toContain('старшая школа');
    expect(es).toContain('Latin American Spanish');
    for (const prompt of [ru, es, buildSystemInstruction('xx', 'Other')]) {
      expect(prompt).toContain('original English in parentheses');
      expect(prompt).toContain('Reproduce every token verbatim');
      expect(prompt).toContain('Return JSON only');
    }
  });

  it('omits answer from the prompt payload when the English answer is blank', () => {
    const lines = buildTranslationPrompt(
      'Quiz',
      [{ ...fibQuestion(), correctAnswer: '' }],
      ['q5']
    ).split('\n');
    const payload = JSON.parse(lines[lines.length - 1]) as {
      answer?: string;
    }[];
    expect(payload[0].answer).toBeUndefined();
    const withAnswer = buildTranslationPrompt('Quiz', [fibQuestion()], ['q5'])
      .split('\n')
      .pop() as string;
    const parsed = JSON.parse(withAnswer) as { answer?: string }[];
    expect(parsed[0].answer).toBe('Paris');
  });

  it('translates the answer and restores the blanks end to end', async () => {
    const generate: TranslationDeps['generate'] = vi.fn(() =>
      Promise.resolve({
        text: JSON.stringify({
          title: 'Cuestionario',
          questions: [
            {
              id: 'q5',
              text: 'La capital de Francia es [[1]] y está en el [[2]].',
              answer: 'París',
            },
          ],
        }),
        outputTokens: 30,
      })
    );
    const result = await translateQuiz(
      {
        quizId: 'quiz-1',
        locale: 'es',
        title: 'Quiz',
        questions: [fibQuestion()],
      },
      'teacher-1',
      deps({ generate })
    );
    expect(result.questions.q5.text).toBe(
      'La capital de Francia es ____ y está en el ______.'
    );
    expect(result.questions.q5.answer).toBe('París');
    // The model sees tokens, never raw underscore runs.
    expect(vi.mocked(generate).mock.calls[0][0].prompt).toContain('[[1]]');
  });
});
