/**
 * The AI reader for quiz document import
 * (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D3, D18, D19, D20).
 *
 * The rule the whole feature rests on is "extract, never invent": a wrong
 * answer key gets marked on a student's paper, so anything the model was not
 * sure of has to arrive keyless and flagged rather than guessed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const INCREMENT = Symbol('increment');

vi.mock('./firebaseAdmin', () => ({
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
  DOCUMENT_MAP_PROMPT,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_PAGES,
  MAX_VERSIONED_DOCUMENT_PAGES,
  buildDocumentMapSchema,
  buildRubricPrompt,
  buildRubricSchema,
  buildVersionPrompt,
  normalizeAiRubric,
  normalizeDocumentMap,
  remapFigurePages,
  versionCallPages,
  type AiExtractedQuiz,
  type ExtractedTestSet,
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

/** Narrows a plain-mode result, which is never a test set. */
function asQuiz(result: AiExtractedQuiz | ExtractedTestSet): AiExtractedQuiz {
  if ('kind' in result) throw new Error('expected a plain quiz');
  return result;
}

function makeDeps(over: Partial<ExtractDocumentDeps> = {}) {
  let now = 1_000_000;
  const deps: ExtractDocumentDeps = {
    db: makeDb().db,
    isImportGranted: vi.fn(() => Promise.resolve(true)),
    isGeminiGranted: vi.fn(() => Promise.resolve(true)),
    isAiReaderGranted: vi.fn(() => Promise.resolve(true)),
    chargeQuiz: vi.fn(() => Promise.resolve()),
    pdfPageCount: vi.fn(() => Promise.resolve(4)),
    extract: vi.fn(() => Promise.resolve(GOOD_RESPONSE)),
    isVersionsGranted: vi.fn(() => Promise.resolve(true)),
    generate: vi.fn(() => Promise.reject(new Error('not expected'))),
    slicePdf: vi.fn((bytes: Buffer) => Promise.resolve(bytes)),
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

describe('printed section and label (R29)', () => {
  const raw = (extra: Record<string, unknown>) => ({
    questions: [
      {
        number: 1,
        text: 'Pick one.',
        type: 'MC',
        options: [
          { letter: 'A', text: 'x' },
          { letter: 'B', text: 'y' },
        ],
        correctAnswer: '',
        warnings: [],
        ...extra,
      },
    ],
  });

  it('declares both as optional, so either side can deploy first', () => {
    const question = buildDocumentResponseSchema().properties?.questions?.items;
    expect(question?.properties?.section?.type).toBeDefined();
    expect(question?.properties?.label?.type).toBeDefined();
    expect(question?.required).not.toContain('section');
    expect(question?.required).not.toContain('label');
  });

  it('passes them through as printed and drops empty ones', () => {
    const quiz = normalizeAiQuiz(
      raw({ section: ' Section 2 ', label: '5A' }),
      'fallback'
    );
    expect(quiz.questions[0]).toMatchObject({
      section: 'Section 2',
      label: '5A',
    });
    const bare = normalizeAiQuiz(raw({ section: '', label: 3 }), 'fallback');
    expect(bare.questions[0]).not.toHaveProperty('section');
    expect(bare.questions[0]).not.toHaveProperty('label');
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
    const quiz = asQuiz(
      await extractQuizFromDocument(request(), teacher, deps)
    );
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

  it('refuses when the AI reader is off for the account', async () => {
    const { deps } = makeDeps({
      isAiReaderGranted: vi.fn(() => Promise.resolve(false)),
    });
    await expect(
      extractQuizFromDocument(request(), teacher, deps)
    ).rejects.toThrow(/Reading documents with AI is not enabled/);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(deps.chargeQuiz).not.toHaveBeenCalled();
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
    expect(deps.isAiReaderGranted).toHaveBeenCalledWith('teacher-1', null);
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
    const quiz = asQuiz(
      await extractQuizFromDocument(request(), teacher, deps)
    );
    expect(quiz.title).toBe('Unit 3 Test');
  });
});

// ── Versioned tests (QUIZ_IMPORT_VERSIONS V7, V11, V12) ────────────────────

/** Pass 1 for the reference file's shape: four versions, a split, rubrics. */
const MAP_RESPONSE = {
  title: 'Unit 3 FRQ',
  sections: [
    { kind: 'version', label: 'Version A', startPage: 1 },
    { kind: 'version', label: 'Version B', startPage: 3 },
    { kind: 'version', label: 'Unit 3 Version C', startPage: 6 },
    { kind: 'rubric', label: 'RUBRIC', startPage: 11 },
    { kind: 'rubric', label: 'RUBRIC (2)', startPage: 13 },
    { kind: 'version', label: 'Version Split Pt 1', startPage: 19 },
    { kind: 'version', label: 'Version Split Pt 2', startPage: 22 },
    { kind: 'rubric', label: 'RUBRIC Version Split', startPage: 25 },
  ],
  figures: [
    {
      page: 1,
      x: 0.1,
      y: 0.1,
      width: 0.4,
      height: 0.3,
      label: 'MAP #1',
      versions: ['Version A', 'version b', 'Nope'],
    },
  ],
  groups: [
    {
      kind: 'parallel',
      name: 'Unit 3 FRQ',
      versions: ['Version A', 'Version B'],
    },
    {
      kind: 'retake',
      name: 'Unit 3 FRQ Retake',
      versions: ['Unit 3 Version C', 'Version A'],
    },
    {
      kind: 'split',
      name: '',
      versions: ['Version Split Pt 1', 'Version Split Pt 2'],
    },
  ],
};

const FRQ_RESPONSE = {
  title: 'Version A',
  questions: [
    {
      number: 1,
      text: 'Religion plays a significant role…\nA. Identify…\nB. Define…',
      type: 'free-response',
      options: [],
      correctAnswer: '',
      figures: [{ page: 1, x: 0.1, y: 0.1, width: 0.4, height: 0.3 }],
      warnings: [],
    },
  ],
};

const RUBRIC_RESPONSE = {
  title: 'RUBRIC',
  printedTotal: 10,
  criteria: [
    {
      letter: 'a',
      prompt: 'Identify one of the specific Chrsitian denominations.',
      points: 1,
      credit: ['X = Mormon; Y = Lutheran; Z = Baptist'],
      notes: [],
    },
    {
      letter: 'B',
      prompt: 'Define the term acculturation.',
      points: 2,
      credit: [
        'Clear definition',
        'As distance increases, interaction decreases',
      ],
      notes: ['NOT ACCEPTABLE: assimilation'],
    },
  ],
  warnings: [],
};

describe('normalizeDocumentMap', () => {
  it('turns start pages into ranges that cover the file', () => {
    const map = normalizeDocumentMap(MAP_RESPONSE, 26, 'file');
    expect(map.versions.map((v) => [v.label, v.pages])).toEqual([
      ['Version A', { start: 1, end: 2 }],
      ['Version B', { start: 3, end: 5 }],
      ['Unit 3 Version C', { start: 6, end: 10 }],
      ['Version Split Pt 1', { start: 19, end: 21 }],
      ['Version Split Pt 2', { start: 22, end: 24 }],
    ]);
    expect(map.rubrics.map((r) => r.pages)).toEqual([
      { start: 11, end: 12 },
      { start: 13, end: 18 },
      { start: 25, end: 26 },
    ]);
  });

  it('maps group and figure labels to version indexes, case-insensitively', () => {
    const map = normalizeDocumentMap(MAP_RESPONSE, 26, 'file');
    expect(map.groups).toEqual([
      { kind: 'parallel', name: 'Unit 3 FRQ', versions: [0, 1] },
      // Version A is already grouped, so the retake keeps only C.
      { kind: 'retake', name: 'Unit 3 FRQ Retake', versions: [2] },
      {
        kind: 'split',
        name: 'Version Split Pt 1 / Version Split Pt 2',
        versions: [3, 4],
      },
    ]);
    expect(map.figures).toEqual([
      {
        page: 1,
        x: 0.1,
        y: 0.1,
        width: 0.4,
        height: 0.3,
        label: 'MAP #1',
        versions: [0, 1],
      },
    ]);
  });

  it('drops sections off the file, duplicate start pages and unknown kinds', () => {
    const map = normalizeDocumentMap(
      {
        sections: [
          { kind: 'version', label: 'Form 1', startPage: 1 },
          { kind: 'version', label: 'Form 1', startPage: 4 },
          { kind: 'rubric', label: 'Dup', startPage: 4 },
          { kind: 'version', label: 'Form 3', startPage: 99 },
          { kind: 'appendix', label: 'X', startPage: 5 },
        ],
      },
      6,
      'Fallback'
    );
    expect(map.title).toBe('Fallback');
    expect(map.versions).toEqual([
      { label: 'Form 1', pages: { start: 1, end: 3 } },
      { label: 'Form 1 (2)', pages: { start: 4, end: 6 } },
    ]);
    expect(map.rubrics).toEqual([]);
  });

  it('keeps a Word file in the model’s order, without pages', () => {
    const map = normalizeDocumentMap(
      {
        sections: [
          { kind: 'version', label: 'Version A', startPage: 0 },
          { kind: 'version', label: 'Version B' },
        ],
      },
      null,
      'file'
    );
    expect(map.versions).toEqual([
      { label: 'Version A' },
      { label: 'Version B' },
    ]);
  });

  it('attaches a version’s key pages, and a shared key to every version', () => {
    const map = normalizeDocumentMap(
      {
        sections: [
          { kind: 'version', label: 'Version A', startPage: 1 },
          { kind: 'version', label: 'Version B', startPage: 3 },
          {
            kind: 'answer-key',
            label: 'Key A',
            startPage: 5,
            forVersion: 'Version A',
          },
          { kind: 'answer-key', label: 'Key', startPage: 6 },
        ],
      },
      6,
      'file'
    );
    expect(versionCallPages(map, 0).pages).toEqual([1, 2, 5, 6]);
    expect(versionCallPages(map, 1).pages).toEqual([3, 4, 6]);
  });

  it('holds each pass-2 call to the per-call page cap (V12)', () => {
    const map = normalizeDocumentMap(
      {
        sections: [
          { kind: 'version', label: 'Version A', startPage: 1 },
          {
            kind: 'version',
            label: 'Version B',
            startPage: MAX_DOCUMENT_PAGES + 5,
          },
        ],
      },
      MAX_DOCUMENT_PAGES + 6,
      'file'
    );
    const call = versionCallPages(map, 0);
    expect(call.pages).toHaveLength(MAX_DOCUMENT_PAGES);
    expect(call.truncated).toBe(true);
  });
});

describe('normalizeAiRubric', () => {
  it('keeps criteria verbatim with points from the points column (V2, V3)', () => {
    const rubric = normalizeAiRubric(RUBRIC_RESPONSE, 'RUBRIC');
    expect(rubric.printedTotal).toBe(10);
    expect(rubric.criteria).toEqual([
      {
        letter: 'A',
        prompt: 'Identify one of the specific Chrsitian denominations.',
        points: 1,
        credit: ['X = Mormon; Y = Lutheran; Z = Baptist'],
        notes: [],
      },
      {
        letter: 'B',
        prompt: 'Define the term acculturation.',
        points: 2,
        credit: [
          'Clear definition',
          'As distance increases, interaction decreases',
        ],
        notes: ['NOT ACCEPTABLE: assimilation'],
      },
    ]);
  });

  it('flags unreadable points instead of guessing, and omits a missing total', () => {
    const rubric = normalizeAiRubric(
      {
        printedTotal: 0,
        criteria: [{ letter: 'C', prompt: 'Explain.', points: 'two' }],
      },
      'Rubric 3'
    );
    expect(rubric.title).toBe('Rubric 3');
    expect(rubric.printedTotal).toBeUndefined();
    expect(rubric.criteria[0].points).toBe(0);
    expect(rubric.warnings[0]).toMatch(/Row C/);
  });
});

describe('remapFigurePages', () => {
  it('maps slice pages back to the file’s and drops pages outside it', () => {
    const questions = normalizeAiQuiz(
      {
        questions: [
          {
            number: 1,
            text: 'Q',
            type: 'free-response',
            figures: [
              { page: 2, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
              { page: 3, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            ],
          },
        ],
      },
      'x'
    ).questions;
    expect(remapFigurePages(questions, [19, 20])[0].figures).toEqual([
      { page: 20, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    ]);
  });
});

describe('extractQuizFromDocument, versioned mode', () => {
  beforeEach(() => vi.clearAllMocks());

  const versionedRequest = () => ({ ...request(), versions: true });

  /** Answers each call by what its prompt asks for. */
  function routedGenerate(mapResponse: unknown = MAP_RESPONSE) {
    return vi.fn((_bytes: Buffer, _mime: string, prompt: string) =>
      Promise.resolve(
        JSON.stringify(
          prompt === DOCUMENT_MAP_PROMPT
            ? mapResponse
            : prompt.includes('criteria:')
              ? RUBRIC_RESPONSE
              : FRQ_RESPONSE
        )
      )
    );
  }

  it('maps, then reads every version and rubric from its own pages, charging once', async () => {
    const generate = routedGenerate();
    const slicePdf = vi.fn((_b: Buffer, pages: number[]) =>
      Promise.resolve(Buffer.from(pages.join(',')))
    );
    const { deps } = makeDeps({
      pdfPageCount: vi.fn(() => Promise.resolve(26)),
      generate,
      slicePdf,
    });
    const set = await extractQuizFromDocument(
      versionedRequest(),
      teacher,
      deps
    );
    if (!('kind' in set)) throw new Error('expected a test set');

    expect(deps.chargeQuiz).toHaveBeenCalledTimes(1);
    expect(deps.extract).not.toHaveBeenCalled();
    // One map call, five versions, three rubrics.
    expect(generate).toHaveBeenCalledTimes(9);
    expect(slicePdf).toHaveBeenCalledWith(expect.any(Buffer), [19, 20, 21]);

    expect(set.versions.map((v) => v.label)).toEqual([
      'Version A',
      'Version B',
      'Unit 3 Version C',
      'Version Split Pt 1',
      'Version Split Pt 2',
    ]);
    expect(set.versions[0].questions).toHaveLength(1);
    // The slice's page 1 is the split's page 19.
    expect(set.versions[3].questions[0].figures[0].page).toBe(19);
    expect(set.rubrics).toHaveLength(3);
    expect(set.rubrics[0].criteria[1].notes).toEqual([
      'NOT ACCEPTABLE: assimilation',
    ]);
    expect(set.groups.map((g) => g.kind)).toEqual([
      'parallel',
      'retake',
      'split',
    ]);
  });

  it('returns today’s quiz unchanged for a file with no versions (V7)', async () => {
    const generate = routedGenerate({
      title: '',
      sections: [],
      figures: [],
      groups: [],
    });
    const { deps } = makeDeps({ generate });
    const quiz = await extractQuizFromDocument(
      versionedRequest(),
      teacher,
      deps
    );
    const plain = await extractQuizFromDocument(
      request(),
      teacher,
      makeDeps().deps
    );
    expect(quiz).toEqual(plain);
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(deps.chargeQuiz).toHaveBeenCalledTimes(1);
  });

  it('treats a single version heading as no versions', async () => {
    const generate = routedGenerate({
      sections: [{ kind: 'version', label: 'Version A', startPage: 1 }],
    });
    const { deps } = makeDeps({ generate });
    const quiz = await extractQuizFromDocument(
      versionedRequest(),
      teacher,
      deps
    );
    expect('kind' in quiz).toBe(false);
  });

  it('ignores the versions request without the flag, keeping today’s cap', async () => {
    const { deps } = makeDeps({
      isVersionsGranted: vi.fn(() => Promise.resolve(false)),
      pdfPageCount: vi.fn(() => Promise.resolve(26)),
    });
    await expect(
      extractQuizFromDocument(versionedRequest(), teacher, deps)
    ).rejects.toThrow(/limit is 20/);
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.chargeQuiz).not.toHaveBeenCalled();
  });

  it('refuses a file over the versioned ceiling before any charge (V12)', async () => {
    const { deps } = makeDeps({
      pdfPageCount: vi.fn(() =>
        Promise.resolve(MAX_VERSIONED_DOCUMENT_PAGES + 1)
      ),
    });
    await expect(
      extractQuizFromDocument(versionedRequest(), teacher, deps)
    ).rejects.toThrow(new RegExp(`limit is ${MAX_VERSIONED_DOCUMENT_PAGES}`));
    expect(deps.chargeQuiz).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('refuses a long file that turns out to have no versions', async () => {
    const { deps } = makeDeps({
      pdfPageCount: vi.fn(() => Promise.resolve(26)),
      generate: routedGenerate({ sections: [] }),
    });
    await expect(
      extractQuizFromDocument(versionedRequest(), teacher, deps)
    ).rejects.toThrow(/no versions/);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it('keeps the other versions when one call fails', async () => {
    const generate = vi.fn((_b: Buffer, _m: string, prompt: string) =>
      prompt === DOCUMENT_MAP_PROMPT
        ? Promise.resolve(JSON.stringify(MAP_RESPONSE))
        : prompt.includes('"Version B"')
          ? Promise.reject(new Error('boom'))
          : Promise.resolve(
              JSON.stringify(
                prompt.includes('criteria:') ? RUBRIC_RESPONSE : FRQ_RESPONSE
              )
            )
    );
    const { deps } = makeDeps({
      pdfPageCount: vi.fn(() => Promise.resolve(26)),
      generate,
    });
    const set = await extractQuizFromDocument(
      versionedRequest(),
      teacher,
      deps
    );
    if (!('kind' in set)) throw new Error('expected a test set');
    expect(set.versions[1].questions).toEqual([]);
    expect(set.versions[1].warnings[0]).toMatch(/could not be read/);
    expect(set.versions[0].questions).toHaveLength(1);
  });

  it('reads a Word file whole in every call, scoped by label', async () => {
    const generate = routedGenerate({
      sections: [
        { kind: 'version', label: 'Version A' },
        { kind: 'version', label: 'Version B' },
      ],
    });
    const { deps } = makeDeps({ generate });
    const set = await extractQuizFromDocument(
      { ...versionedRequest(), fileName: 'FRQ.docx', mimeType: DOCX_MIME },
      teacher,
      deps
    );
    expect('kind' in set).toBe(true);
    expect(deps.slicePdf).not.toHaveBeenCalled();
    expect(deps.pdfPageCount).not.toHaveBeenCalled();
    expect(generate.mock.calls[1][2]).toMatch(
      /Read only the version\s+headed "Version A"/
    );
  });
});

describe('versioned prompts', () => {
  it('keeps lettered parts in one written response (V1)', () => {
    expect(buildVersionPrompt('Version A', false, false)).toMatch(
      /ONE free-response question/
    );
  });

  it('asks for rubric text verbatim (V3)', () => {
    expect(buildRubricPrompt('RUBRIC', false)).toMatch(/Never reword/);
  });

  it('requires every rubric row field in the schema', () => {
    const schema = buildRubricSchema() as {
      properties: { criteria: { items: { required: string[] } } };
    };
    expect(schema.properties.criteria.items.required).toEqual([
      'letter',
      'prompt',
      'points',
      'credit',
      'notes',
    ]);
    expect(buildDocumentMapSchema().required).toContain('sections');
  });
});

// ── Quota ──────────────────────────────────────────────────────────────────

describe('chargeQuizQuota', () => {
  const NOW = Date.UTC(2026, 8, 21);
  const today = '2026-09-21';

  it('increments both the per-feature and the overall counter', async () => {
    const { db, docs } = makeDb();
    await chargeQuizQuota(db, 'u1', 'teacher@school.org', NOW);
    expect(
      docs.get(`ai_usage/u1_quiz-document-ai-reader_${today}`)?.count
    ).toBe(1);
    expect(docs.get(`ai_usage/u1_${today}`)?.count).toBe(1);
  });

  it('refuses once the configured daily limit is reached', async () => {
    const { db } = makeDb({
      [`ai_usage/u1_quiz-document-ai-reader_${today}`]: { count: 3 },
      'global_permissions/quiz-document-ai-reader': {
        config: { dailyLimit: 3 },
      },
    });
    await expect(
      chargeQuizQuota(db, 'u1', 'teacher@school.org', NOW)
    ).rejects.toThrow(/Daily limit for AI quiz import reached \(3 per day\)/);
  });

  it('lets an admin past the limit', async () => {
    const { db, docs } = makeDb({
      'admins/teacher@school.org': { role: 'admin' },
      [`ai_usage/u1_quiz-document-ai-reader_${today}`]: { count: 99 },
      'global_permissions/quiz-document-ai-reader': {
        config: { dailyLimit: 3 },
      },
    });
    await chargeQuizQuota(db, 'u1', 'Teacher@School.org', NOW);
    expect(
      docs.get(`ai_usage/u1_quiz-document-ai-reader_${today}`)?.count
    ).toBe(100);
  });

  it('honours the limit being switched off entirely', async () => {
    const { db, docs } = makeDb({
      [`ai_usage/u1_quiz-document-ai-reader_${today}`]: { count: 99 },
      'global_permissions/quiz-document-ai-reader': {
        config: { dailyLimit: 3, dailyLimitEnabled: false },
      },
    });
    await chargeQuizQuota(db, 'u1', 'teacher@school.org', NOW);
    expect(
      docs.get(`ai_usage/u1_quiz-document-ai-reader_${today}`)?.count
    ).toBe(100);
  });

  it('treats a caller with no verified email as non-admin', async () => {
    const { db } = makeDb({
      [`ai_usage/u1_quiz-document-ai-reader_${today}`]: { count: 3 },
      'global_permissions/quiz-document-ai-reader': {
        config: { dailyLimit: 3 },
      },
    });
    await expect(chargeQuizQuota(db, 'u1', null, NOW)).rejects.toThrow(
      /Daily limit/
    );
  });
});
