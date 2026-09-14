// Translated read-aloud (PR3): a locale routes to its own voice, cache and manifest slice,
// and the absence of a locale must leave today's English behaviour byte-for-byte intact.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const INCREMENT = Symbol('increment');
const DELETE = Symbol('delete');

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({ getUser: vi.fn() })),
  storage: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: {
      increment: (n: number) => ({ [INCREMENT]: n }),
      delete: () => ({ [DELETE]: true }),
    },
  }),
}));

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});

vi.mock('@google-cloud/text-to-speech', () => ({
  v1beta1: { TextToSpeechClient: vi.fn() },
  protos: {},
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(true)),
}));

import {
  enumerateLocalizedParts,
  localizedSessionQuestion,
  parseSynthesizeRequest,
  prepareQuizReadAloud,
  synthesizeQuizAudio,
  ttsLanguageForTranslationLocale,
  voicedSessionLocales,
  type ReadAloudDeps,
} from './quizReadAloud';

type Doc = Record<string, unknown>;

const deepMerge = (target: Doc, patch: Doc): Doc => {
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const inc = (v as Record<symbol, unknown>)[INCREMENT];
      if (typeof inc === 'number') {
        target[k] = (typeof target[k] === 'number' ? target[k] : 0) + inc;
        continue;
      }
      if ((v as Record<symbol, unknown>)[DELETE]) {
        delete target[k];
        continue;
      }
      const child =
        target[k] && typeof target[k] === 'object' ? (target[k] as Doc) : {};
      target[k] = deepMerge(child, v as Doc);
      continue;
    }
    target[k] = v;
  }
  return target;
};

function makeDb(docs: Record<string, Doc>): ReadAloudDeps['db'] {
  const refFor = (path: string) => ({
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
        get: (field: string) => docs[path]?.[field],
      }),
    set: (data: Doc, opts?: { merge?: boolean }) => {
      docs[path] = opts?.merge
        ? deepMerge(docs[path] ?? {}, data)
        : { ...data };
      return Promise.resolve();
    },
  });
  const collection = (c: string) => ({
    doc: (id: string) => ({
      ...refFor(`${c}/${id}`),
      collection: (sub: string) => ({
        doc: (subId: string) => refFor(`${c}/${id}/${sub}/${subId}`),
      }),
    }),
  });
  return {
    collection,
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (ref: { get: () => Promise<unknown> }) => ref.get(),
        set: (
          ref: { set: (d: Doc, o?: { merge?: boolean }) => Promise<void> },
          d: Doc,
          o?: { merge?: boolean }
        ) => void ref.set(d, o),
      }),
  } as unknown as ReadAloudDeps['db'];
}

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);

const MC = {
  id: 'q1',
  type: 'MC',
  text: 'What is 2 + 2?',
  choices: ['3', '4', '5'],
  localized: {
    es: { text: '¿Cuánto es 2 + 2?', choices: ['3', '4', '5'] },
    so: { text: 'Waa maxay 2 + 2?', choices: ['3', '4', '5'] },
  },
};

const FIB = {
  id: 'q2',
  type: 'FIB',
  text: 'The sky is ____.',
  localized: { es: { text: 'El cielo es ____.' } },
};

function makeDocs(session: Doc = {}, pointer: Doc = {}): Record<string, Doc> {
  return {
    'quiz_sessions/s1': {
      teacherUid: TEACHER,
      status: 'active',
      readAloudAll: true,
      language: 'en-US',
      publicQuestions: [MC, FIB],
      ...session,
    },
    [`student_assignments/${STUDENT}/items/s1`]: {
      kind: 'quiz',
      sessionId: 's1',
      teacherUid: TEACHER,
      override: { language: 'es' },
      ...pointer,
    },
  };
}

function makeDeps(docs: Record<string, Doc>) {
  const files = new Map<string, { timings?: unknown }>();
  const synthesize = vi.fn(
    ({ ssml }: Parameters<ReadAloudDeps['synthesize']>[0]) => {
      const marks = [...ssml.matchAll(/<mark name="([^"]+)"\/>/g)].map(
        (m, i) => ({ markName: m[1], timeSeconds: i * 1.5 })
      );
      return Promise.resolve({ audio: Buffer.from('mp3'), timepoints: marks });
    }
  );
  const deps: ReadAloudDeps = {
    db: makeDb(docs),
    statFile: (path) => Promise.resolve(files.has(path) ? {} : null),
    saveFile: (path) => {
      files.set(path, {});
      return Promise.resolve();
    },
    synthesize,
    isFeatureGranted: () => Promise.resolve(true),
    now: () => NOW,
  };
  return { deps, files, synthesize };
}

const student = { uid: STUDENT, email: null, studentRole: true };

beforeEach(() => vi.clearAllMocks());

describe('translation locale → voice', () => {
  it('maps es to the existing es-US voice entry and nothing else', () => {
    expect(ttsLanguageForTranslationLocale('es')).toBe('es-US');
    expect(ttsLanguageForTranslationLocale('so')).toBeNull();
    expect(ttsLanguageForTranslationLocale('hmn')).toBeNull();
    expect(ttsLanguageForTranslationLocale(undefined)).toBeNull();
  });

  it('lists only voiced locales stored on the session', () => {
    expect(voicedSessionLocales({ publicQuestions: [MC, FIB] })).toEqual([
      'es',
    ]);
  });
});

describe('localizedSessionQuestion', () => {
  it('projects the stored translation for a servable question', () => {
    expect(localizedSessionQuestion(MC, 'es')).toMatchObject({
      text: '¿Cuánto es 2 + 2?',
      choices: ['3', '4', '5'],
    });
  });

  it('refuses FIB (D21), unknown locales and half-translated questions', () => {
    expect(localizedSessionQuestion(FIB, 'es')).toBeNull();
    expect(localizedSessionQuestion(MC, 'hmn')).toBeNull();
    expect(
      localizedSessionQuestion(
        { ...MC, localized: { es: { text: '¿Cuánto es 2 + 2?' } } },
        'es'
      )
    ).toBeNull();
  });

  it('enumerates only translated questions, with no stimulus chunks', () => {
    const keys = enumerateLocalizedParts(
      { publicQuestions: [MC, FIB] },
      'es'
    ).map((p) => p.key);
    expect(keys).toContain('q:q1:question');
    expect(keys).toContain('q:q1:whole');
    expect(keys.some((k) => k.startsWith('q:q2'))).toBe(false);
    expect(keys.some((k) => k.startsWith('stim:'))).toBe(false);
  });
});

describe('parseSynthesizeRequest — locale', () => {
  const base = {
    mode: 'student',
    sessionId: 's1',
    questionId: 'q1',
    part: { kind: 'question' },
  };

  it('accepts a voiced locale and omits the field when absent', () => {
    expect(parseSynthesizeRequest({ ...base, locale: 'es' })).toMatchObject({
      locale: 'es',
    });
    expect(parseSynthesizeRequest(base)).not.toHaveProperty('locale');
  });

  it('rejects so and hmn', () => {
    for (const locale of ['so', 'hmn']) {
      expect(() => parseSynthesizeRequest({ ...base, locale })).toThrow(
        /no read-aloud voice/
      );
    }
  });
});

describe('synthesizeQuizAudio — translated view', () => {
  const req = {
    mode: 'student' as const,
    sessionId: 's1',
    questionId: 'q1',
    part: { kind: 'question' as const },
  };

  it('speaks the stored Spanish text with the Spanish voice', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    const res = await synthesizeQuizAudio(
      { ...req, locale: 'es' },
      student,
      deps
    );
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: 'es-US-Neural2-A',
        languageCode: 'es-US',
      })
    );
    expect(synthesize.mock.calls[0][0].ssml).toContain('¿Cuánto es 2 + 2?');
    expect(res.path.startsWith('quiz_tts_cache/es-US-Neural2-A/')).toBe(true);
  });

  it('writes the locale manifest slice and leaves the English files untouched', async () => {
    const docs = makeDocs();
    const { deps } = makeDeps(docs);
    const english = await synthesizeQuizAudio(req, student, deps);
    const spanish = await synthesizeQuizAudio(
      { ...req, locale: 'es' },
      student,
      deps
    );
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    expect(manifest.voice).toBe('en-US-Neural2-F');
    expect(manifest.files).toMatchObject({ 'q:q1:question': english.path });
    expect((manifest.localized as Doc).es).toMatchObject({
      voice: 'es-US-Neural2-A',
      files: { 'q:q1:question': spanish.path },
    });
    expect(spanish.path).not.toBe(english.path);
  });

  it('writes a top-level files map on a session with no manifest yet', async () => {
    const docs = makeDocs();
    const { deps } = makeDeps(docs);
    await synthesizeQuizAudio({ ...req, locale: 'es' }, student, deps);
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    expect(manifest.files).toEqual({});
    expect(manifest.status).toBe('partial');
    expect(manifest.voice).toBe('en-US-Neural2-F');
    expect(Object.keys((manifest.localized as Doc).es as Doc)).toContain(
      'files'
    );
  });

  it('caches per (part, locale)', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    await synthesizeQuizAudio({ ...req, locale: 'es' }, student, deps);
    synthesize.mockClear();
    const again = await synthesizeQuizAudio(
      { ...req, locale: 'es' },
      student,
      deps
    );
    expect(again.cached).toBe(true);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('refuses a question with no stored translation and any stimulus part', async () => {
    const { deps } = makeDeps(makeDocs());
    await expect(
      synthesizeQuizAudio(
        { ...req, questionId: 'q2', locale: 'es' },
        student,
        deps
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      synthesizeQuizAudio(
        { ...req, part: { kind: 'stimulus', stimulusId: 'x' }, locale: 'es' },
        student,
        deps
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('refuses a locale the student is not assigned, even under readAloudAll', async () => {
    const { deps } = makeDeps(makeDocs({}, { override: { language: 'so' } }));
    await expect(
      synthesizeQuizAudio({ ...req, locale: 'es' }, student, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses a locale when the student holds no language at all', async () => {
    const { deps } = makeDeps(makeDocs({}, { override: {} }));
    await expect(
      synthesizeQuizAudio({ ...req, locale: 'es' }, student, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('still serves English to a student whose language is unset', async () => {
    const { deps } = makeDeps(makeDocs({}, { override: { readAloud: true } }));
    await expect(
      synthesizeQuizAudio(req, student, deps)
    ).resolves.toMatchObject({ mimeType: 'audio/mpeg' });
  });
});

describe('prepareQuizReadAloud — translation locale scope', () => {
  it('synthesizes English only when no locale scope is given', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    await prepareQuizReadAloud({ sessionId: 's1', callerUid: TEACHER }, deps);
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    expect(manifest.localized).toBeUndefined();
    for (const call of synthesize.mock.calls)
      expect(call[0].voice).toBe('en-US-Neural2-F');
  });

  it('adds a Spanish slice when es is in scope, and no so/hmn slice', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER, translationLocales: ['es', 'so'] },
      deps
    );
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    const localized = manifest.localized as Doc;
    expect(Object.keys(localized)).toEqual(['es']);
    expect((localized.es as Doc).voice).toBe('es-US-Neural2-A');
    expect(Object.keys((localized.es as Doc).files as Doc)).toContain(
      'q:q1:question'
    );
    expect(
      synthesize.mock.calls.some((c) => c[0].voice === 'es-US-Neural2-A')
    ).toBe(true);
  });

  it('never synthesizes a stored locale nobody with read-aloud holds', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER, translationLocales: ['so'] },
      deps
    );
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    expect(manifest.localized).toBeUndefined();
    for (const call of synthesize.mock.calls)
      expect(call[0].voice).toBe('en-US-Neural2-F');
  });

  it('counts localized parts in the returned total', async () => {
    const docs = makeDocs();
    const { deps } = makeDeps(docs);
    const english = await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER },
      deps
    );
    const docs2 = makeDocs();
    const both = await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER, translationLocales: ['es'] },
      makeDeps(docs2).deps
    );
    expect(both.parts).toBeGreaterThan(english.parts);
  });

  it('keeps failedKeys for a locale whose every part failed and reports partial', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    synthesize.mockImplementation((req: { languageCode: string }) =>
      req.languageCode === 'es-US'
        ? Promise.reject(new Error('tts down'))
        : Promise.resolve({ audio: Buffer.from('mp3'), timepoints: [] })
    );
    const result = await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER, translationLocales: ['es'] },
      deps
    );
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    const es = (manifest.localized as Doc).es as Doc;
    expect(es.files).toEqual({});
    expect((es.failedKeys as string[]).length).toBeGreaterThan(0);
    expect(manifest.status).toBe('partial');
    expect(result.status).toBe('partial');
  });

  it('clears the preparing status when the manifest write is rejected', async () => {
    const docs = makeDocs();
    const { deps } = makeDeps(docs);
    let writes = 0;
    const realCollection = deps.db.collection.bind(deps.db);
    (deps.db as unknown as { collection: unknown }).collection = (
      name: string
    ) => {
      const col = realCollection(name);
      if (name !== 'quiz_sessions') return col;
      return {
        ...col,
        doc: (id: string) => {
          const ref = col.doc(id);
          return {
            ...ref,
            set: (data: Doc, opts?: { merge?: boolean }) => {
              writes += 1;
              if (writes === 2)
                return Promise.reject(new Error('document too large'));
              return (
                ref.set as unknown as (
                  d: Doc,
                  o?: { merge?: boolean }
                ) => Promise<unknown>
              )(data, opts);
            },
          };
        },
      };
    };
    const result = await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER },
      deps
    );
    expect(result.status).toBe('failed');
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    expect(manifest.status).toBe('failed');
    expect(manifest.failedReason).toBe('manifest-write-failed');
    expect(manifest.startedAt).toBeUndefined();
  });
});
