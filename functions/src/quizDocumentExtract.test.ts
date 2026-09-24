/**
 * The AI reader for quiz document import
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D3, D18, D19, D20).
 *
 * The rule the whole feature rests on is "extract, never invent": a wrong
 * answer key gets marked on a student's paper, so anything the model was not
 * sure of has to arrive keyless and flagged rather than guessed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const INCREMENT = Symbol('increment');

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({ getUser: vi.fn() })),
  storage: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: {
      increment: (n: number) => ({ [INCREMENT]: n }),
      serverTimestamp: () => 'ts',
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

vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(true)),
}));

import type { Firestore } from 'firebase-admin/firestore';
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
  MAX_FIGURES,
  MAX_QUESTIONS,
  buildDocumentResponseSchema,
  buildExtractPrompt,
  chargeQuizQuota,
  documentMimeType,
  extractQuizFromDocument,
  normalizeAiQuiz,
  parseExtractDocumentRequest,
  type ExtractDocumentDeps,
} from './quizDocumentExtract';

// ── Minimal Firestore fake (docs + transactions with set-merge) ────────────

function makeDb(seed: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map<string, Record<string, unknown>>(Object.entries(seed));
  const applyMerge = (
    path: string,
    data: Record<string, unknown>,
    merge: boolean
  ) => {
    const prev = merge ? (docs.get(path) ?? {}) : {};
    const next: Record<string, unknown> = { ...prev };
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && INCREMENT in v) {
        next[k] =
          Number(prev[k] ?? 0) + (v as Record<symbol, number>)[INCREMENT];
      } else next[k] = v;
    }
    docs.set(path, next);
  };
  const snap = (path: string) => {
    const data = docs.get(path);
    return { exists: data !== undefined, data: () => data };
  };
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        path: `${name}/${id}`,
        get: () => Promise.resolve(snap(`${name}/${id}`)),
      }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      const writes: (() => void)[] = [];
      const tx = {
        get: (ref: { path: string }) => Promise.resolve(snap(ref.path)),
        set: (
          ref: { path: string },
          data: Record<string, unknown>,
          opts?: { merge?: boolean }
        ) => writes.push(() => applyMerge(ref.path, data, !!opts?.merge)),
      };
      await fn(tx);
      writes.forEach((w) => w());
    },
  };
  return { db: db as unknown as Firestore, docs };
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** What Gemini answers for a tidy two-question test with a key. */
const GOOD_RESPONSE = JSON.stringify({
  title: 'Unit 3 Test',
  questions: [
    {
      number: 1,
      text: 'What colour is the sky?',
      type: 'MC',
      options: [
        { letter: 'A', text: 'Blue' },
        { letter: 'B', text: 'Green' },
      ],
      correctAnswer: 'Blue',
      warnings: [],
    },
    {
      number: 2,
      text: 'Explain why.',
      type: 'free-response',
      options: [],
      correctAnswer: '',
      warnings: [],
    },
  ],
});

function request(over: Partial<{ fileName: string; mimeType: string }> = {}) {
  return {
    fileName: over.fileName ?? 'Unit 3 Test.pdf',
    mimeType: over.mimeType ?? PDF_MIME,
    bytes: Buffer.from('%PDF-1.4 fake'),
  };
}

function makeDeps(over: Partial<ExtractDocumentDeps> = {}) {
  let now = 1_000_000;
  const deps: ExtractDocumentDeps = {
    db: makeDb().db,
    isImportGranted: vi.fn(() => Promise.resolve(true)),
    isGeminiGranted: vi.fn(() => Promise.resolve(true)),
    chargeQuiz: vi.fn(() => Promise.resolve()),
    pdfPageCount: vi.fn(() => Promise.resolve(4)),
    extract: vi.fn(() => Promise.resolve(GOOD_RESPONSE)),
    now: () => now,
    ...over,
  };
  return { deps, advance: (ms: number) => (now += ms) };
}

const teacher = {
  uid: 'teacher-1',
  email: 'teacher@school.org',
  emailVerified: true,
  studentRole: false,
};

// ── Request parsing ────────────────────────────────────────────────────────

describe('documentMimeType', () => {
  it('accepts a PDF or Word file by declared type or by name', () => {
    expect(documentMimeType(PDF_MIME, 'x')).toBe(PDF_MIME);
    expect(documentMimeType('', 'Test.pdf')).toBe(PDF_MIME);
    expect(documentMimeType(DOCX_MIME, 'x')).toBe(DOCX_MIME);
    expect(documentMimeType('', 'Test.docx')).toBe(DOCX_MIME);
  });

  it('rejects anything else', () => {
    expect(documentMimeType('text/plain', 'notes.txt')).toBeNull();
    expect(documentMimeType('application/vnd.google-apps.document', 'a')).toBe(
      null
    );
  });
});

describe('parseExtractDocumentRequest', () => {
  const base64 = Buffer.from('%PDF-1.4 fake').toString('base64');

  it('decodes a valid request', () => {
    const parsed = parseExtractDocumentRequest({
      fileName: 'Unit 3 Test.pdf',
      mimeType: PDF_MIME,
      data: base64,
    });
    expect(parsed.fileName).toBe('Unit 3 Test.pdf');
    expect(parsed.mimeType).toBe(PDF_MIME);
    expect(parsed.bytes.toString()).toBe('%PDF-1.4 fake');
  });

  it('requires a file name, data and a readable type', () => {
    expect(() =>
      parseExtractDocumentRequest({ mimeType: PDF_MIME, data: base64 })
    ).toThrow(/fileName/);
    expect(() =>
      parseExtractDocumentRequest({ fileName: 'a.pdf', mimeType: PDF_MIME })
    ).toThrow(/data/);
    expect(() =>
      parseExtractDocumentRequest({
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        data: base64,
      })
    ).toThrow(/PDF or a Word file/);
  });

  it('rejects an oversized payload on its encoded length, before decoding', () => {
    // Bounding the base64 first is what stops a caller spending the
    // function's memory just to be told the file is too big.
    const huge = 'A'.repeat(Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 100);
    expect(() =>
      parseExtractDocumentRequest({
        fileName: 'big.pdf',
        mimeType: PDF_MIME,
        data: huge,
      })
    ).toThrow(/too large/);
  });

  it('rejects an empty file', () => {
    expect(() =>
      parseExtractDocumentRequest({
        fileName: 'a.pdf',
        mimeType: PDF_MIME,
        data: Buffer.from('').toString('base64'),
      })
    ).toThrow(/data is required/);
  });
});

// ── The extract-never-invent rules ─────────────────────────────────────────

describe('normalizeAiQuiz figure boxes (D13)', () => {
  const question = (figures: unknown) => ({
    questions: [
      {
        number: 1,
        text: 'What does the diagram show?',
        type: 'free-response',
        options: [],
        correctAnswer: '',
        figures,
        warnings: [],
      },
    ],
  });

  it('keeps a box that sits on the page', () => {
    const quiz = normalizeAiQuiz(
      question([{ page: 2, x: 0.1, y: 0.2, width: 0.5, height: 0.3 }]),
      'fallback'
    );
    expect(quiz.questions[0].figures).toEqual([
      { page: 2, x: 0.1, y: 0.2, width: 0.5, height: 0.3 },
    ]);
  });

  it('drops a box that encloses nothing', () => {
    // A zero-width box would crop an empty image the student cannot see.
    const quiz = normalizeAiQuiz(
      question([{ page: 1, x: 0.1, y: 0.2, width: 0, height: 0.3 }]),
      'fallback'
    );
    expect(quiz.questions[0].figures).toEqual([]);
  });

  it('drops a box whose corner is off the page', () => {
    const quiz = normalizeAiQuiz(
      question([{ page: 1, x: 1.2, y: 0.2, width: 0.5, height: 0.3 }]),
      'fallback'
    );
    expect(quiz.questions[0].figures).toEqual([]);
  });

  it('drops a box on a page number that makes no sense', () => {
    const quiz = normalizeAiQuiz(
      question([{ page: 0, x: 0.1, y: 0.2, width: 0.5, height: 0.3 }]),
      'fallback'
    );
    expect(quiz.questions[0].figures).toEqual([]);
  });

  it('drops a box with a value that is not a number', () => {
    const quiz = normalizeAiQuiz(
      question([{ page: 1, x: 'left', y: 0.2, width: 0.5, height: 0.3 }]),
      'fallback'
    );
    expect(quiz.questions[0].figures).toEqual([]);
  });

  it('caps how many pictures one question can claim', () => {
    const many = Array.from({ length: 10 }, () => ({
      page: 1,
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.3,
    }));
    expect(
      normalizeAiQuiz(question(many), 'f').questions[0].figures
    ).toHaveLength(MAX_FIGURES);
  });

  it('leaves figures empty when the model returned none', () => {
    expect(
      normalizeAiQuiz(question(undefined), 'f').questions[0].figures
    ).toEqual([]);
  });
});

describe('normalizeAiQuiz', () => {
  it('keeps a question the model answered from the document', () => {
    const quiz = normalizeAiQuiz(JSON.parse(GOOD_RESPONSE), 'fallback');
    expect(quiz.title).toBe('Unit 3 Test');
    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions[0].correctAnswer).toBe('Blue');
  });

  it('drops an answer that matches none of the choices, and says so', () => {
    const quiz = normalizeAiQuiz(
      {
        questions: [
          {
            number: 1,
            text: 'What colour is the sky?',
            type: 'MC',
            options: [{ letter: 'A', text: 'Blue' }],
            // A paraphrase would silently mark the wrong option correct.
            correctAnswer: 'The colour blue',
            warnings: [],
          },
        ],
      },
      'fallback'
    );
    expect(quiz.questions[0].correctAnswer).toBe('');
    expect(quiz.questions[0].warnings[0]).toMatch(/does not match/i);
  });

  it('accepts an answer that differs only in case, using the choice as written', () => {
    const quiz = normalizeAiQuiz(
      {
        questions: [
          {
            number: 1,
            text: 'Q',
            type: 'MC',
            options: [{ letter: 'A', text: 'Blue' }],
            correctAnswer: 'blue',
            warnings: [],
          },
        ],
      },
      'fallback'
    );
    expect(quiz.questions[0].correctAnswer).toBe('Blue');
    expect(quiz.questions[0].warnings).toEqual([]);
  });

  it('never carries a key on a written response', () => {
    const quiz = normalizeAiQuiz(
      {
        questions: [
          {
            number: 1,
            text: 'Explain why.',
            type: 'free-response',
            options: [],
            correctAnswer: 'Because the sky scatters blue light.',
            warnings: [],
          },
        ],
      },
      'fallback'
    );
    // Free response is graded by hand; a stored answer would grade it wrong.
    expect(quiz.questions[0].correctAnswer).toBe('');
  });

  it('turns an unknown type into a written response', () => {
    const quiz = normalizeAiQuiz(
      {
        questions: [
          {
            number: 1,
            text: 'Draw the diagram.',
            type: 'drawing',
            options: [],
            correctAnswer: '',
            warnings: [],
          },
        ],
      },
      'fallback'
    );
    expect(quiz.questions[0].type).toBe('free-response');
  });

  it('skips a question with no text at all', () => {
    const quiz = normalizeAiQuiz(
      { questions: [{ number: 1, text: '   ', type: 'MC' }] },
      'fallback'
    );
    expect(quiz.questions).toEqual([]);
  });

  it('drops a blank choice and caps how many it keeps', () => {
    const quiz = normalizeAiQuiz(
      {
        questions: [
          {
            number: 1,
            text: 'Q',
            type: 'MC',
            options: [
              { letter: 'A', text: 'One' },
              { letter: 'B', text: '  ' },
              ...Array.from({ length: 8 }, (_, i) => ({
                letter: 'C',
                text: `Extra ${i}`,
              })),
            ],
            correctAnswer: '',
            warnings: [],
          },
        ],
      },
      'fallback'
    );
    expect(quiz.questions[0].options).toHaveLength(6);
    expect(quiz.questions[0].options[0].text).toBe('One');
  });

  it('falls back to the file name when the model gave no title', () => {
    expect(normalizeAiQuiz({ questions: [] }, 'Unit 3 Test').title).toBe(
      'Unit 3 Test'
    );
  });

  it('caps a runaway response and says the rest was not read', () => {
    const questions = Array.from({ length: MAX_QUESTIONS + 5 }, (_, i) => ({
      number: i + 1,
      text: `Q${i + 1}`,
      type: 'free-response',
      options: [],
      correctAnswer: '',
      warnings: [],
    }));
    const quiz = normalizeAiQuiz({ questions }, 'fallback');
    expect(quiz.questions).toHaveLength(MAX_QUESTIONS);
    expect(quiz.warnings[0]).toMatch(/Split the file/);
  });

  it('survives a response that is not the shape at all', () => {
    expect(normalizeAiQuiz(null, 'fallback').questions).toEqual([]);
    expect(normalizeAiQuiz('nonsense', 'fallback').questions).toEqual([]);
    expect(
      normalizeAiQuiz({ questions: 'nope' }, 'fallback').questions
    ).toEqual([]);
  });
});

describe('buildDocumentResponseSchema', () => {
  it('requires correctAnswer, so the model must say "" rather than omit it', () => {
    const schema = buildDocumentResponseSchema();
    const question = schema.properties?.questions?.items;
    expect(question?.required).toContain('correctAnswer');
    expect(question?.properties?.type?.enum).toContain('free-response');
  });

  it('declares the figure box, without which no picture is ever returned', () => {
    // The schema is the only thing that tells the model figures exist; a
    // missing field makes the whole picture import a silent no-op.
    const box =
      buildDocumentResponseSchema().properties?.questions?.items?.properties
        ?.figures?.items;
    expect(box?.required).toEqual(['page', 'x', 'y', 'width', 'height']);
  });
});

describe('choose all that apply', () => {
  const maQuestion = (correctAnswer: string) => ({
    questions: [
      {
        number: 1,
        text: 'Which are mammals?',
        type: 'MA',
        options: [
          { letter: 'A', text: 'Whale' },
          { letter: 'B', text: 'Shark' },
          { letter: 'C', text: 'Bat' },
        ],
        correctAnswer,
        warnings: [],
      },
    ],
  });

  it('offers MA in the schema and prompt only when asked', () => {
    const types = (on: boolean) =>
      buildDocumentResponseSchema(on).properties?.questions?.items?.properties
        ?.type?.enum;
    expect(types(false)).not.toContain('MA');
    expect(types(true)).toContain('MA');
    expect(buildExtractPrompt(false)).not.toMatch(/choose all/i);
    expect(buildExtractPrompt(true)).toMatch(/choose all/i);
  });

  it('keeps the options and the |-joined right ones', () => {
    const quiz = normalizeAiQuiz(maQuestion('whale|Bat'), 'f', true);
    const [q] = quiz.questions;
    expect(q.type).toBe('MA');
    expect(q.options).toHaveLength(3);
    expect(q.correctAnswer).toBe('Whale|Bat');
  });

  it('blanks the key when a part matches no choice', () => {
    const [q] = normalizeAiQuiz(
      maQuestion('Whale|Dolphin'),
      'f',
      true
    ).questions;
    expect(q.correctAnswer).toBe('');
    expect(q.warnings[0]).toMatch(/do not all match/i);
  });

  it('turns MA into a written response when not asked for', () => {
    const [q] = normalizeAiQuiz(maQuestion('Whale|Bat'), 'f').questions;
    expect(q.type).toBe('free-response');
  });

  it('reads the flag off the request and passes it to the model', async () => {
    const parsed = parseExtractDocumentRequest({
      fileName: 'a.pdf',
      mimeType: PDF_MIME,
      data: Buffer.from('%PDF-1.4 fake').toString('base64'),
      multiAnswer: true,
    });
    expect(parsed.multiAnswer).toBe(true);
    const { deps } = makeDeps();
    await extractQuizFromDocument(parsed, teacher, deps);
    expect(deps.extract).toHaveBeenCalledWith(
      expect.anything(),
      PDF_MIME,
      true
    );
  });
});

// ── Gates, limits and quota ────────────────────────────────────────────────

describe('extractQuizFromDocument', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads a document and returns its questions', async () => {
    const { deps } = makeDeps();
    const quiz = await extractQuizFromDocument(request(), teacher, deps);
    expect(quiz.title).toBe('Unit 3 Test');
    expect(quiz.questions).toHaveLength(2);
  });

  it('refuses a student account', async () => {
    const { deps } = makeDeps();
    await expect(
      extractQuizFromDocument(
        request(),
        { ...teacher, studentRole: true },
        deps
      )
    ).rejects.toThrow(/Teacher account required/);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it('refuses when document import is off for the account', async () => {
    const { deps } = makeDeps({
      isImportGranted: vi.fn(() => Promise.resolve(false)),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/not enabled for this account/);
    expect(deps.chargeQuiz).not.toHaveBeenCalled();
  });

  it('refuses when AI is off for the account', async () => {
    const { deps } = makeDeps({
      isGeminiGranted: vi.fn(() => Promise.resolve(false)),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/AI features are not enabled/);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it('never lets an unverified email reach the gates', async () => {
    const { deps } = makeDeps();
    await extractQuizFromDocument(
      request(),
      { ...teacher, emailVerified: false },
      deps
    );
    // A self-reported address must not buy the admin bypass inside the gate.
    expect(deps.isImportGranted).toHaveBeenCalledWith('teacher-1', null);
    expect(deps.isGeminiGranted).toHaveBeenCalledWith('teacher-1', null);
    expect(deps.chargeQuiz).toHaveBeenCalledWith('teacher-1', null);
  });

  it('refuses a PDF over the page limit before sending anything', async () => {
    const { deps } = makeDeps({
      pdfPageCount: vi.fn(() => Promise.resolve(MAX_DOCUMENT_PAGES + 1)),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/Split it and import the parts/);
    // An over-long file must cost neither a request nor a use of the quota.
    expect(deps.extract).not.toHaveBeenCalled();
    expect(deps.chargeQuiz).not.toHaveBeenCalled();
  });

  it('does not count pages for a Word file, which has none', async () => {
    const { deps } = makeDeps();
    await extractQuizFromDocument(
      request({ fileName: 'Unit 3 Test.docx', mimeType: DOCX_MIME }),
      teacher,
      deps
    );
    expect(deps.pdfPageCount).not.toHaveBeenCalled();
    expect(deps.extract).toHaveBeenCalled();
  });

  it('says so plainly when the PDF cannot be opened', async () => {
    const { deps } = makeDeps({
      pdfPageCount: vi.fn(() => Promise.reject(new Error('encrypted'))),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/password protected/);
  });

  it('charges one use per import, whatever the page count', async () => {
    const { deps } = makeDeps({
      pdfPageCount: vi.fn(() => Promise.resolve(MAX_DOCUMENT_PAGES)),
    });
    await extractQuizFromDocument(request(), teacher, deps);
    // D19 — a 20-page test is one use, same as a one-page one.
    expect(deps.chargeQuiz).toHaveBeenCalledTimes(1);
  });

  it('does not send the document when the quota is spent', async () => {
    const { deps } = makeDeps({
      chargeQuiz: vi.fn(() => Promise.reject(new Error('Daily limit'))),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/Daily limit/);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it('reports a failed read rather than an empty quiz', async () => {
    const { deps } = makeDeps({
      extract: vi.fn(() => Promise.reject(new Error('vertex down'))),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/Reading the document failed/);
  });

  it('reports unparseable output rather than passing it on', async () => {
    const { deps } = makeDeps({
      extract: vi.fn(() => Promise.resolve('not json at all')),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/Reading the document failed/);
  });

  it('tells the teacher when nothing could be read', async () => {
    const { deps } = makeDeps({
      extract: vi.fn(() => Promise.resolve(JSON.stringify({ questions: [] }))),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/No questions could be read/);
  });

  it('gives up rather than hanging when the read runs past the deadline', async () => {
    const { deps, advance } = makeDeps({
      pdfPageCount: vi.fn(() => {
        advance(200_000);
        return Promise.resolve(2);
      }),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/took too long/);
    expect(deps.extract).not.toHaveBeenCalled();
    // Nothing reached Gemini, so the teacher keeps the daily use.
    expect(deps.chargeQuiz).not.toHaveBeenCalled();
  });

  it('names the quiz after the file when the model gave no title', async () => {
    const { deps } = makeDeps({
      extract: vi.fn(() =>
        Promise.resolve(
          JSON.stringify({
            questions: [
              {
                number: 1,
                text: 'Q',
                type: 'free-response',
                options: [],
                correctAnswer: '',
                warnings: [],
              },
            ],
          })
        )
      ),
    });
    const quiz = await extractQuizFromDocument(request(), teacher, deps);
    expect(quiz.title).toBe('Unit 3 Test');
  });
});

// ── Quota ──────────────────────────────────────────────────────────────────

describe('chargeQuizQuota', () => {
  const NOW = Date.UTC(2026, 8, 21);
  const today = '2026-09-21';

  it('increments both the per-feature and the overall counter', async () => {
    const { db, docs } = makeDb();
    await chargeQuizQuota(db, 'u1', 'teacher@school.org', NOW);
    expect(docs.get(`ai_usage/u1_quiz_${today}`)?.count).toBe(1);
    expect(docs.get(`ai_usage/u1_${today}`)?.count).toBe(1);
  });

  it('refuses once the configured daily limit is reached', async () => {
    const { db } = makeDb({
      [`ai_usage/u1_quiz_${today}`]: { count: 3 },
      'global_permissions/quiz': { config: { dailyLimit: 3 } },
    });
    await expect(
      chargeQuizQuota(db, 'u1', 'teacher@school.org', NOW)
    ).rejects.toThrow(/Daily limit for quiz reached \(3 per day\)/);
  });

  it('lets an admin past the limit', async () => {
    const { db, docs } = makeDb({
      'admins/teacher@school.org': { role: 'admin' },
      [`ai_usage/u1_quiz_${today}`]: { count: 99 },
      'global_permissions/quiz': { config: { dailyLimit: 3 } },
    });
    await chargeQuizQuota(db, 'u1', 'Teacher@School.org', NOW);
    expect(docs.get(`ai_usage/u1_quiz_${today}`)?.count).toBe(100);
  });

  it('honours the limit being switched off entirely', async () => {
    const { db, docs } = makeDb({
      [`ai_usage/u1_quiz_${today}`]: { count: 99 },
      'global_permissions/quiz': {
        config: { dailyLimit: 3, dailyLimitEnabled: false },
      },
    });
    await chargeQuizQuota(db, 'u1', 'teacher@school.org', NOW);
    expect(docs.get(`ai_usage/u1_quiz_${today}`)?.count).toBe(100);
  });

  it('treats a caller with no verified email as non-admin', async () => {
    const { db } = makeDb({
      [`ai_usage/u1_quiz_${today}`]: { count: 3 },
      'global_permissions/quiz': { config: { dailyLimit: 3 } },
    });
    await expect(chargeQuizQuota(db, 'u1', null, NOW)).rejects.toThrow(
      /Daily limit/
    );
  });
});
