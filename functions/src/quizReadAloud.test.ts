// Unit tests for the quiz read-aloud engine (docs/plans/QUIZ_READ_ALOUD.md §7 PR2).
// Firestore is a tiny in-memory fake with set-merge + transactions; Cloud TTS
// and Storage are injected stubs, so only the plan's decisions are under test.

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
  buildSsml,
  chunkText,
  enumerateParts,
  monthlyUsageDocId,
  normalizeReadAloudText,
  parseSynthesizeRequest,
  partKey,
  prepareQuizReadAloud,
  resolvePartText,
  synthesizeQuizAudio,
  teacherDailyDocId,
  wholeSubParts,
  type ReadAloudDeps,
} from './quizReadAloud';

type Doc = Record<string, unknown>;

const isPlain = (v: unknown): v is Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function applyMerge(target: Doc, patch: Doc): Doc {
  const out: Doc = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (isPlain(v) && DELETE in v) {
      delete out[k];
    } else if (isPlain(v) && INCREMENT in v) {
      const prev = typeof out[k] === 'number' ? out[k] : 0;
      out[k] = prev + (v[INCREMENT as unknown as string] as number);
    } else if (isPlain(v) && isPlain(out[k])) {
      out[k] = applyMerge(out[k], v);
    } else if (isPlain(v)) {
      out[k] = applyMerge({}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function makeDb(docs: Record<string, Doc>) {
  const refFor = (path: string) => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
        get: (field: string) => docs[path]?.[field],
      }),
    set: (data: Doc, opts?: { merge?: boolean }) => {
      docs[path] = opts?.merge
        ? applyMerge(docs[path] ?? {}, data)
        : applyMerge({}, data);
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
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

const QUESTIONS = [
  {
    id: 'q1',
    type: 'MC',
    text: 'What is **2 + 2**?',
    timeLimit: 0,
    choices: ['3', '4', '5'],
  },
  {
    id: 'q2',
    type: 'Matching',
    text: 'Match each capital.',
    timeLimit: 0,
    matchingLeft: ['France', 'Spain'],
    matchingRight: ['Madrid', 'Paris'],
    stimulusIds: ['stim-1'],
  },
  {
    id: 'q3',
    type: 'FIB',
    text: 'The sky is ____.',
    timeLimit: 0,
  },
];

function makeDocs(over: { session?: Doc; pointer?: Doc | null } = {}) {
  const docs: Record<string, Doc> = {
    'quiz_sessions/s1': {
      teacherUid: TEACHER,
      status: 'active',
      readAloudAll: true,
      language: 'en-US',
      publicQuestions: QUESTIONS,
      ...over.session,
    },
  };
  if (over.pointer !== null) {
    docs[`student_assignments/${STUDENT}/items/s1`] = {
      kind: 'quiz',
      sessionId: 's1',
      teacherUid: TEACHER,
      ...over.pointer,
    };
  }
  return docs;
}

interface Stub {
  deps: ReadAloudDeps;
  files: Map<string, { timings?: unknown }>;
  synthesize: ReturnType<typeof vi.fn>;
}

function makeDeps(
  docs: Record<string, Doc>,
  over: Partial<ReadAloudDeps> = {}
): Stub {
  const files = new Map<string, { timings?: unknown }>();
  const synthesize = vi.fn(({ ssml }: { ssml: string }) => {
    const marks = [...ssml.matchAll(/<mark name="([^"]+)"\/>/g)].map(
      (m, i) => ({ markName: m[1], timeSeconds: i * 1.5 })
    );
    return Promise.resolve({ audio: Buffer.from('mp3'), timepoints: marks });
  });
  const deps: ReadAloudDeps = {
    db: makeDb(docs),
    statFile: (path) => {
      const f = files.get(path);
      if (!f) return Promise.resolve(null);
      return Promise.resolve(f.timings ? { timings: f.timings as never } : {});
    },
    saveFile: (path, _bytes, meta) => {
      files.set(path, {
        timings: meta.timings ? JSON.parse(meta.timings) : undefined,
      });
      return Promise.resolve();
    },
    synthesize,
    isFeatureGranted: () => Promise.resolve(true),
    now: () => NOW,
    ...over,
  };
  return { deps, files, synthesize };
}

const student = { uid: STUDENT, email: null, studentRole: true };
const teacher = { uid: TEACHER, email: 't@x.org', studentRole: false };
const classStudent = { ...student, classIds: ['c1'] };

beforeEach(() => vi.clearAllMocks());

describe('normalizeReadAloudText (R11)', () => {
  it('strips markdown and HTML, speaks blanks, fractions, exponents and units', () => {
    expect(normalizeReadAloudText('What is **2 + 2**?')).toBe('What is 2 + 2?');
    expect(normalizeReadAloudText('The sky is ____.')).toBe(
      'The sky is blank.'
    );
    expect(normalizeReadAloudText('<p>Hi <b>there</b></p>')).toBe('Hi there');
    expect(normalizeReadAloudText('3/4 of 10 cm')).toBe(
      '3 over 4 of 10 centimeters'
    );
    expect(normalizeReadAloudText('x^2 and 5^3 and 2^10')).toBe(
      'x to the power of 2 and 5 cubed and 2 to the power of 10'
    );
    expect(normalizeReadAloudText('50% off')).toBe('50 percent off');
    expect(normalizeReadAloudText('[link](http://x)')).toBe('link');
  });
});

describe('SSML and chunking (R4, R10)', () => {
  it('marks each sub-part and escapes text', () => {
    const ssml = buildSsml([
      { mark: 'question', text: 'Tom & Jerry?' },
      { mark: 'choice:0', text: 'A. <yes>' },
    ]);
    expect(ssml).toBe(
      '<speak><mark name="question"/>Tom &amp; Jerry?<break time="600ms"/><mark name="choice:0"/>A. &lt;yes&gt;</speak>'
    );
  });

  it('chunks on sentence boundaries under the byte cap', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i}.`).join(
      ' '
    );
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join(' ')).toBe(text);
    for (const c of chunks)
      expect(Buffer.byteLength(c)).toBeLessThanOrEqual(100);
  });

  it('splits a single oversized sentence rather than dropping it', () => {
    const chunks = chunkText('a'.repeat(250), 100);
    expect(chunks.join('')).toBe('a'.repeat(250));
    for (const c of chunks)
      expect(Buffer.byteLength(c)).toBeLessThanOrEqual(100);
  });
});

describe('part resolution from the session doc (D9)', () => {
  it('reads the whole MC question as prompt then each choice', () => {
    expect(wholeSubParts(QUESTIONS[0])).toEqual([
      { mark: 'question', text: 'What is 2 + 2?' },
      { mark: 'choice:0', text: '3' },
      { mark: 'choice:1', text: '4' },
      { mark: 'choice:2', text: '5' },
    ]);
  });

  it('reads matching left column then right column', () => {
    expect(wholeSubParts(QUESTIONS[1]).map((p) => p.text)).toEqual([
      'Match each capital.',
      'France',
      'Spain',
      'Madrid',
      'Paris',
    ]);
  });

  it('rejects parts that do not exist on the question', () => {
    expect(resolvePartText(QUESTIONS[0], { kind: 'choice', index: 3 })).toBe(
      null
    );
    expect(resolvePartText(QUESTIONS[2], { kind: 'choice', index: 0 })).toBe(
      null
    );
    expect(resolvePartText(QUESTIONS[2], { kind: 'question' })).toEqual([
      { text: 'The sky is blank.' },
    ]);
  });

  it('enumerates every part once and skips whole for single-part questions', () => {
    const { parts, stimulusChunks } = enumerateParts({
      publicQuestions: QUESTIONS,
      readAloudTextByStimulusId: {
        'stim-1': 'Read this passage. It is short.',
      },
    });
    const keys = parts.map((p) => p.key);
    expect(keys).toContain('q:q1:question');
    expect(keys).toContain('q:q1:choice:2');
    expect(keys).toContain('q:q1:whole');
    expect(keys).toContain('q:q2:left:1');
    expect(keys).toContain('q:q2:right:0');
    expect(keys).toContain('q:q3:question');
    expect(keys).not.toContain('q:q3:whole');
    expect(stimulusChunks['stim-1']).toEqual(['stim:stim-1:0']);
    expect(keys).toContain('stim:stim-1:0');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('builds stable part keys', () => {
    expect(partKey('q1', { kind: 'choice', index: 1 })).toBe('q:q1:choice:1');
    expect(partKey('q1', { kind: 'whole' })).toBe('q:q1:whole');
    expect(partKey('q1', { kind: 'stimulus', stimulusId: 's' })).toBe('stim:s');
  });
});

describe('request parsing', () => {
  it('accepts a student part and a preview language', () => {
    expect(
      parseSynthesizeRequest({
        mode: 'student',
        sessionId: 's1',
        questionId: 'q1',
        part: { kind: 'choice', index: 2 },
      })
    ).toEqual({
      mode: 'student',
      sessionId: 's1',
      questionId: 'q1',
      part: { kind: 'choice', index: 2 },
    });
    expect(
      parseSynthesizeRequest({ mode: 'preview', language: 'es-US' })
    ).toEqual({
      mode: 'preview',
      language: 'es-US',
    });
    expect(
      parseSynthesizeRequest({
        mode: 'preview',
        language: 'ru-RU',
        voice: 'ru-RU-Wavenet-A',
      })
    ).toEqual({ mode: 'preview', language: 'ru-RU', voice: 'ru-RU-Wavenet-A' });
  });

  it('rejects bad parts, voices and modes', () => {
    expect(() =>
      parseSynthesizeRequest({
        mode: 'student',
        sessionId: 's1',
        questionId: 'q1',
        part: { kind: 'choice' },
      })
    ).toThrow(/index/);
    expect(() =>
      parseSynthesizeRequest({
        mode: 'preview',
        language: 'en-US',
        voice: 'de-DE-Neural2-A',
      })
    ).toThrow(/voice/i);
    expect(() =>
      parseSynthesizeRequest({
        mode: 'preview',
        language: 'en-US',
        voice: 'en-US-Evil-X',
      })
    ).toThrow(/voice/i);
    expect(() => parseSynthesizeRequest({ mode: 'teacher' })).toThrow(/mode/);
  });
});

describe('synthesizeQuizAudio — student fallback', () => {
  const req = {
    mode: 'student' as const,
    sessionId: 's1',
    questionId: 'q1',
    part: { kind: 'question' as const },
  };

  it('denies teachers in student mode and students without a pointer', async () => {
    const { deps } = makeDeps(makeDocs());
    await expect(synthesizeQuizAudio(req, teacher, deps)).rejects.toMatchObject(
      {
        code: 'permission-denied',
      }
    );
    const noPointer = makeDeps(makeDocs({ pointer: null }));
    await expect(
      synthesizeQuizAudio(req, student, noPointer.deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('allows a pointer-less student whose token class matches the session', async () => {
    const { deps, synthesize } = makeDeps(
      makeDocs({ session: { classIds: ['c1'] }, pointer: null })
    );
    const res = await synthesizeQuizAudio(req, classStudent, deps);
    expect(res.cached).toBe(false);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('denies a pointer-less student when no class matches or readAloudAll is off', async () => {
    const other = makeDeps(
      makeDocs({ session: { classIds: ['c2'] }, pointer: null })
    );
    await expect(
      synthesizeQuizAudio(req, classStudent, other.deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const off = makeDeps(
      makeDocs({
        session: { classIds: ['c1'], readAloudAll: false },
        pointer: null,
      })
    );
    await expect(
      synthesizeQuizAudio(req, classStudent, off.deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies when neither readAloudAll nor the override is set', async () => {
    const { deps } = makeDeps(makeDocs({ session: { readAloudAll: false } }));
    await expect(synthesizeQuizAudio(req, student, deps)).rejects.toMatchObject(
      {
        code: 'permission-denied',
      }
    );
  });

  it('allows an override-only student', async () => {
    const { deps, synthesize } = makeDeps(
      makeDocs({
        session: { readAloudAll: false },
        pointer: { override: { readAloud: true } },
      })
    );
    const res = await synthesizeQuizAudio(req, student, deps);
    expect(res.cached).toBe(false);
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it('denies when the teacher lacks the feature flag', async () => {
    const { deps } = makeDeps(makeDocs(), {
      isFeatureGranted: () => Promise.resolve(false),
    });
    await expect(synthesizeQuizAudio(req, student, deps)).rejects.toMatchObject(
      {
        code: 'permission-denied',
      }
    );
  });

  it('bills the teacher on a miss and patches the manifest', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    const res = await synthesizeQuizAudio(req, student, deps);
    expect(res.mimeType).toBe('audio/mpeg');
    expect(res.path).toMatch(
      /^quiz_tts_cache\/en-US-Neural2-F\/[a-f0-9]{64}\.mp3$/
    );
    expect(res.chars).toBe('What is 2 + 2?'.length);
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        voice: 'en-US-Neural2-F',
        languageCode: 'en-US',
      })
    );
    expect(docs[`ai_usage/${teacherDailyDocId(TEACHER, NOW)}`]).toMatchObject({
      count: 1,
      chars: res.chars,
    });
    expect(docs[`ai_usage/${monthlyUsageDocId(NOW)}`]).toMatchObject({
      neural2Chars: res.chars,
    });
    expect(docs['quiz_sessions/s1'].readAloud).toMatchObject({
      status: 'partial',
      files: { 'q:q1:question': res.path },
    });
  });

  it('serves a cache hit with no quota write', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    await synthesizeQuizAudio(req, student, deps);
    synthesize.mockClear();
    const res = await synthesizeQuizAudio(req, student, deps);
    expect(res.cached).toBe(true);
    expect(synthesize).not.toHaveBeenCalled();
    expect(docs[`ai_usage/${teacherDailyDocId(TEACHER, NOW)}`]).toMatchObject({
      count: 1,
    });
    expect(docs[`ai_usage/${monthlyUsageDocId(NOW)}`]).toMatchObject({
      cacheHits: 1,
    });
  });

  it('flips new synthesis to the Standard voice past the monthly cap (R3)', async () => {
    const docs = makeDocs();
    docs[`ai_usage/${monthlyUsageDocId(NOW)}`] = { neural2Chars: 900_000 };
    const { deps, synthesize } = makeDeps(docs);
    const res = await synthesizeQuizAudio(req, student, deps);
    expect(res.path.startsWith('quiz_tts_cache/en-US-Standard-H/')).toBe(true);
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ voice: 'en-US-Standard-H' })
    );
    expect(docs[`ai_usage/${monthlyUsageDocId(NOW)}`]).toMatchObject({
      standardChars: res.chars,
      neural2Chars: 900_000,
    });
  });

  it('returns mark timings for whole and persists them on the manifest', async () => {
    const docs = makeDocs();
    const { deps } = makeDeps(docs);
    const res = await synthesizeQuizAudio(
      { ...req, part: { kind: 'whole' } },
      student,
      deps
    );
    expect(res.parts).toEqual([
      { kind: 'question', startMs: 0 },
      { kind: 'choice', index: 0, startMs: 1500 },
      { kind: 'choice', index: 1, startMs: 3000 },
      { kind: 'choice', index: 2, startMs: 4500 },
    ]);
    expect((docs['quiz_sessions/s1'].readAloud as Doc).timings).toMatchObject({
      'q:q1:whole': res.parts,
    });
    // A cache hit returns the same timings from object metadata.
    const again = await synthesizeQuizAudio(
      { ...req, part: { kind: 'whole' } },
      student,
      deps
    );
    expect(again.cached).toBe(true);
    expect(again.parts).toEqual(res.parts);
  });

  it('requires the stimulus to be attached to the question', async () => {
    const docs = makeDocs({
      session: { readAloudTextByStimulusId: { 'stim-1': 'Passage one.' } },
    });
    const { deps } = makeDeps(docs);
    await expect(
      synthesizeQuizAudio(
        { ...req, part: { kind: 'stimulus', stimulusId: 'stim-1' } },
        student,
        deps
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    const ok = await synthesizeQuizAudio(
      {
        ...req,
        questionId: 'q2',
        part: { kind: 'stimulus', stimulusId: 'stim-1' },
      },
      student,
      deps
    );
    expect(ok.chunks).toHaveLength(1);
    expect((docs['quiz_sessions/s1'].readAloud as Doc).stimulusChunks).toEqual({
      'stim-1': ['stim:stim-1:0'],
    });
  });

  it('maps a TTS outage to unavailable', async () => {
    const { deps } = makeDeps(makeDocs(), {
      synthesize: () => Promise.reject(new Error('boom')),
    });
    await expect(synthesizeQuizAudio(req, student, deps)).rejects.toMatchObject(
      {
        code: 'unavailable',
      }
    );
  });

  it('refuses an ended session and an unknown question', async () => {
    const ended = makeDeps(makeDocs({ session: { status: 'ended' } }));
    await expect(
      synthesizeQuizAudio(req, student, ended.deps)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const { deps } = makeDeps(makeDocs());
    await expect(
      synthesizeQuizAudio({ ...req, questionId: 'nope' }, student, deps)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('synthesizeQuizAudio — teacher preview', () => {
  it('speaks the fixed sentence under the caller uid and honours a voice override', async () => {
    const docs: Record<string, Doc> = {};
    const { deps, synthesize } = makeDeps(docs);
    const res = await synthesizeQuizAudio(
      { mode: 'preview', language: 'de-DE', voice: 'de-DE-Standard-B' },
      teacher,
      deps
    );
    expect(res.path.startsWith('quiz_tts_cache/de-DE-Standard-B/')).toBe(true);
    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        ssml: expect.stringContaining('Primzahl') as string,
      })
    );
    expect(docs[`ai_usage/${teacherDailyDocId(TEACHER, NOW)}`]).toMatchObject({
      count: 1,
    });
  });

  it('denies students and flag-off teachers', async () => {
    const { deps } = makeDeps({});
    await expect(
      synthesizeQuizAudio({ mode: 'preview', language: 'en-US' }, student, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const off = makeDeps(
      {},
      { isFeatureGranted: () => Promise.resolve(false) }
    );
    await expect(
      synthesizeQuizAudio(
        { mode: 'preview', language: 'en-US' },
        teacher,
        off.deps
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('prepareQuizReadAloud', () => {
  it('denies non-owners and flag-off teachers', async () => {
    const { deps } = makeDeps(makeDocs());
    await expect(
      prepareQuizReadAloud({ sessionId: 's1', callerUid: 'other' }, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const off = makeDeps(makeDocs(), {
      isFeatureGranted: () => Promise.resolve(false),
    });
    await expect(
      prepareQuizReadAloud({ sessionId: 's1', callerUid: TEACHER }, off.deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('writes a complete manifest and bills every miss to the teacher', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    const res = await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER },
      deps
    );
    expect(res.status).toBe('ready');
    const { parts } = enumerateParts({ publicQuestions: QUESTIONS });
    expect(res.parts).toBe(parts.length);
    expect(res.synthesized).toBe(parts.length);
    expect(synthesize).toHaveBeenCalledTimes(parts.length);
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    expect(manifest.status).toBe('ready');
    expect(manifest.voice).toBe('en-US-Neural2-F');
    expect(manifest.startedAt).toBeUndefined();
    expect(Object.keys(manifest.files as Doc).sort()).toEqual(
      parts.map((p) => p.key).sort()
    );
    expect((manifest.timings as Doc)['q:q1:whole']).toHaveLength(4);
    expect(docs[`ai_usage/${teacherDailyDocId(TEACHER, NOW)}`]).toMatchObject({
      count: parts.length,
    });
  });

  it('re-runs synthesize only what changed (R7)', async () => {
    const docs = makeDocs();
    const { deps, synthesize } = makeDeps(docs);
    await prepareQuizReadAloud({ sessionId: 's1', callerUid: TEACHER }, deps);
    synthesize.mockClear();
    const edited = QUESTIONS.map((q) =>
      q.id === 'q3' ? { ...q, text: 'The grass is ____.' } : q
    );
    docs['quiz_sessions/s1'].publicQuestions = edited;
    const res = await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER },
      deps
    );
    expect(res.status).toBe('ready');
    expect(res.synthesized).toBe(1);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(docs[`ai_usage/${monthlyUsageDocId(NOW)}`]).toMatchObject({
      cacheHits: res.parts - 1,
    });
  });

  it('marks partial with the failed keys when a part keeps failing', async () => {
    const docs = makeDocs();
    const { deps } = makeDeps(docs, {
      synthesize: ({ ssml }) =>
        ssml.includes('Spain')
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ audio: Buffer.from('x'), timepoints: [] }),
    });
    const res = await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER },
      deps
    );
    expect(res.status).toBe('partial');
    const manifest = docs['quiz_sessions/s1'].readAloud as Doc;
    expect(manifest.failedKeys).toEqual(
      expect.arrayContaining(['q:q2:left:1', 'q:q2:whole'])
    );
    expect((manifest.files as Doc)['q:q2:left:1']).toBeUndefined();
  });

  it('short-circuits while a fresh prepare is still running', async () => {
    const docs = makeDocs({
      session: { readAloud: { status: 'preparing', startedAt: NOW - 1000 } },
    });
    const { deps, synthesize } = makeDeps(docs);
    const res = await prepareQuizReadAloud(
      { sessionId: 's1', callerUid: TEACHER },
      deps
    );
    expect(res.status).toBe('preparing');
    expect(synthesize).not.toHaveBeenCalled();
  });
});
