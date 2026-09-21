// The AI reader for quiz document import
// (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1, D3, D18, D19, D20).
//
// The browser reader handles a tidy numbered test. This one reads the PDF
// itself rather than a transcription of it, so layout, bold and a key laid
// out in a table all count. It returns the same shape the browser reader
// does, so the review table never learns which one ran.
//
// It extracts and never invents: no question the document does not contain,
// no rewording, and no guessed answer. A question it cannot place comes back
// as a written response with a note, which the teacher fixes in the review
// table — an invented answer key would be marked wrong on a student's paper.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { Type, type Schema } from '@google/genai';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import { parseGeminiJson } from './parseGeminiJson';
import './functionsInit';

export const QUIZ_DOCUMENT_IMPORT_FEATURE_ID = 'quiz-document-import';
export const GEMINI_FEATURE_ID = 'gemini-functions';
/** D19: one import is one use of the teacher's existing `quiz` allowance. */
export const QUIZ_QUOTA_FEATURE_ID = 'quiz';
export const DEFAULT_QUIZ_DAILY_LIMIT = 20;
/** D18, matching the browser reader's `utils/quizDocumentImport/limits.ts`. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 20;
export const EXTRACT_DEADLINE_MS = 110_000;
/** Gemini occasionally runs long on a dense test; more than this is a bug. */
export const MAX_QUESTIONS = 200;
export const MAX_OPTIONS = 6;

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Question types the quiz supports; anything else becomes a written response. */
const QUESTION_TYPES = [
  'MC',
  'FIB',
  'Matching',
  'Ordering',
  'free-response',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface ExtractDocumentRequest {
  fileName: string;
  mimeType: string;
  /** The document itself, base64. Held in memory and never stored (D20). */
  bytes: Buffer;
}

export interface AiExtractedOption {
  letter: string;
  text: string;
}

export interface AiExtractedQuestion {
  number: number;
  text: string;
  type: QuestionType;
  options: AiExtractedOption[];
  /** '' when the document gave no answer — never a guess (D5). */
  correctAnswer: string;
  warnings: string[];
}

export interface AiExtractedQuiz {
  title: string;
  questions: AiExtractedQuestion[];
  warnings: string[];
}

export interface ExtractDocumentDeps {
  db: Firestore;
  isImportGranted: (uid: string, email: string | null) => Promise<boolean>;
  isGeminiGranted: (uid: string, email: string | null) => Promise<boolean>;
  /** Throws `resource-exhausted` past the teacher's daily quiz allowance. */
  chargeQuiz: (uid: string, email: string | null) => Promise<void>;
  /** PDFs only; a Word file has no fixed page count. */
  pdfPageCount: (bytes: Buffer) => Promise<number>;
  extract: (bytes: Buffer, mimeType: string) => Promise<string>;
  now: () => number;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** What the file is, by declared type then by name; null when neither. */
export function documentMimeType(
  mimeType: string,
  fileName: string
): typeof PDF_MIME | typeof DOCX_MIME | null {
  const name = fileName.toLowerCase();
  if (mimeType === PDF_MIME || name.endsWith('.pdf')) return PDF_MIME;
  if (mimeType === DOCX_MIME || name.endsWith('.docx')) return DOCX_MIME;
  return null;
}

export function parseExtractDocumentRequest(
  raw: unknown
): ExtractDocumentRequest {
  const d = (raw ?? {}) as Record<string, unknown>;
  const fileName = typeof d.fileName === 'string' ? d.fileName.trim() : '';
  if (!fileName)
    throw new HttpsError('invalid-argument', 'fileName is required.');
  const declared = typeof d.mimeType === 'string' ? d.mimeType.trim() : '';
  const mimeType = documentMimeType(declared, fileName);
  if (!mimeType)
    throw new HttpsError(
      'invalid-argument',
      'Only a PDF or a Word file (.docx) can be read.'
    );
  const data = typeof d.data === 'string' ? d.data : '';
  if (!data) throw new HttpsError('invalid-argument', 'data is required.');
  // Base64 inflates by 4/3, so the encoded length bounds the decode before it
  // allocates — a caller cannot spend the function's memory to learn the cap.
  if (data.length > Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 4)
    throw new HttpsError(
      'invalid-argument',
      'That file is too large to read. Split it and import the parts.'
    );
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0)
    throw new HttpsError('invalid-argument', 'That file is empty.');
  if (bytes.length > MAX_DOCUMENT_BYTES)
    throw new HttpsError(
      'invalid-argument',
      'That file is too large to read. Split it and import the parts.'
    );
  return { fileName, mimeType, bytes };
}

/**
 * The structured shape Gemini must answer in. Making every field required
 * is what stops a half-filled question arriving as `undefined` downstream;
 * `correctAnswer` is required but may be empty, which is how the model says
 * the document gave no key rather than inventing one.
 */
export function buildDocumentResponseSchema(): Schema {
  return {
    type: Type.OBJECT,
    required: ['title', 'questions'],
    properties: {
      title: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: [
            'number',
            'text',
            'type',
            'options',
            'correctAnswer',
            'warnings',
          ],
          properties: {
            number: { type: Type.INTEGER },
            text: { type: Type.STRING },
            type: { type: Type.STRING, enum: [...QUESTION_TYPES] },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['letter', 'text'],
                properties: {
                  letter: { type: Type.STRING },
                  text: { type: Type.STRING },
                },
              },
            },
            correctAnswer: { type: Type.STRING },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    },
  };
}

export const EXTRACT_PROMPT = [
  'You are reading a teacher’s printed test and transcribing it. Extract only',
  'what the document contains. Never invent a question, never reword one, and',
  'never guess an answer.',
  '',
  'For each numbered question, return its number as printed, its full text,',
  'its answer choices exactly as written, and its type.',
  '',
  'correctAnswer must be the exact text of the choice the document marks as',
  'correct — from an answer key, an answer table, a bolded or highlighted or',
  'underlined choice, or a leading asterisk. If the document does not say',
  'which answer is correct, return an empty string. An empty string is always',
  'the right answer when you are unsure; a guess would be marked wrong on a',
  'student’s paper.',
  '',
  'Types: MC for multiple choice including true/false, FIB for fill in the',
  'blank, Matching, Ordering, and free-response for anything open-ended.',
  'A question that fits none of these is free-response, with a warning saying',
  'what it actually was.',
  '',
  'Use warnings for anything the teacher should check: a question you could',
  'not fully read, two answers marked, a key entry with no matching choice.',
  'Leave warnings empty when there is nothing to say.',
].join('\n');

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function coerceType(value: unknown): QuestionType {
  return QUESTION_TYPES.includes(value as QuestionType)
    ? (value as QuestionType)
    : 'free-response';
}

function coerceOptions(value: unknown): AiExtractedOption[] {
  if (!Array.isArray(value)) return [];
  const options: AiExtractedOption[] = [];
  for (const raw of value) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const text = asString(o.text).trim();
    if (!text) continue;
    options.push({ letter: asString(o.letter).trim().toUpperCase(), text });
    if (options.length >= MAX_OPTIONS) break;
  }
  return options;
}

/**
 * Turns whatever Gemini returned into the shape the client expects, dropping
 * anything unusable rather than trusting the schema to have been honoured.
 *
 * An answer the document's own choices do not contain is the important case:
 * the model paraphrasing a choice would silently mark the wrong option
 * correct, so it becomes a keyless question with a note instead.
 */
export function normalizeAiQuiz(
  parsed: unknown,
  fallbackTitle: string
): AiExtractedQuiz {
  const root = (parsed ?? {}) as Record<string, unknown>;
  const rawQuestions = Array.isArray(root.questions) ? root.questions : [];
  const warnings: string[] = [];
  const questions: AiExtractedQuestion[] = [];

  for (const raw of rawQuestions.slice(0, MAX_QUESTIONS)) {
    const q = (raw ?? {}) as Record<string, unknown>;
    const text = asString(q.text).trim();
    if (!text) continue;

    const type = coerceType(q.type);
    const options = type === 'MC' ? coerceOptions(q.options) : [];
    const questionWarnings = Array.isArray(q.warnings)
      ? q.warnings.map(asString).filter(Boolean)
      : [];

    let correctAnswer = asString(q.correctAnswer).trim();
    if (correctAnswer && type === 'MC') {
      const match = options.find((o) => o.text === correctAnswer);
      if (!match) {
        const loose = options.find(
          (o) => o.text.toLowerCase() === correctAnswer.toLowerCase()
        );
        if (loose) {
          correctAnswer = loose.text;
        } else {
          questionWarnings.push(
            'The answer given does not match any of the choices, so it was left blank.'
          );
          correctAnswer = '';
        }
      }
    }
    // A written response is graded by hand and never carries a key.
    if (type === 'free-response') correctAnswer = '';

    const number = Number.isInteger(q.number)
      ? (q.number as number)
      : questions.length + 1;

    questions.push({
      number,
      text,
      type,
      options,
      correctAnswer,
      warnings: questionWarnings,
    });
  }

  if (rawQuestions.length > MAX_QUESTIONS) {
    warnings.push(
      `Only the first ${MAX_QUESTIONS} questions were read. Split the file to import the rest.`
    );
  }

  const title = asString(root.title).trim() || fallbackTitle;
  return { title, questions, warnings };
}

async function withDeadline<T>(
  work: Promise<T>,
  ms: number
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    return await Promise.race([
      work.then((value) => ({ timedOut: false as const, value })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Core ───────────────────────────────────────────────────────────────────

export async function extractQuizFromDocument(
  request: ExtractDocumentRequest,
  caller: {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    studentRole: boolean;
  },
  deps: ExtractDocumentDeps
): Promise<AiExtractedQuiz> {
  if (caller.studentRole)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  // An unverified (self-reported) email must never reach the admin bypass
  // inside either gate.
  const email = caller.emailVerified ? caller.email : null;

  const [importGranted, geminiGranted] = await Promise.all([
    deps.isImportGranted(caller.uid, email),
    deps.isGeminiGranted(caller.uid, email),
  ]);
  if (!importGranted)
    throw new HttpsError(
      'permission-denied',
      'Importing a quiz from a document is not enabled for this account.'
    );
  if (!geminiGranted)
    throw new HttpsError(
      'permission-denied',
      'AI features are not enabled for this account.'
    );

  const startedAt = deps.now();

  if (request.mimeType === PDF_MIME) {
    let pages: number;
    try {
      pages = await deps.pdfPageCount(request.bytes);
    } catch (err) {
      console.warn('[quizDocumentExtract] page count failed', err);
      throw new HttpsError(
        'invalid-argument',
        'That PDF could not be opened. It may be password protected.'
      );
    }
    // Checked before anything is sent, so an over-long file costs nothing.
    if (pages > MAX_DOCUMENT_PAGES)
      throw new HttpsError(
        'invalid-argument',
        `That file is ${pages} pages and the limit is ${MAX_DOCUMENT_PAGES}. Split it and import the parts.`
      );
  }

  // Charged once the request is going to be sent, and once per import
  // whatever the page count (D19).
  await deps.chargeQuiz(caller.uid, email);

  const remaining = EXTRACT_DEADLINE_MS - (deps.now() - startedAt);
  if (remaining <= 0)
    throw new HttpsError(
      'deadline-exceeded',
      'Reading the document took too long. Try a shorter file.'
    );

  let outcome: Awaited<ReturnType<typeof withDeadline<string>>>;
  try {
    outcome = await withDeadline(
      deps.extract(request.bytes, request.mimeType),
      remaining
    );
  } catch (err) {
    console.error('[quizDocumentExtract] extraction failed', err);
    throw new HttpsError('unavailable', 'Reading the document failed.');
  }
  if (outcome.timedOut)
    throw new HttpsError(
      'deadline-exceeded',
      'Reading the document took too long. Try a shorter file.'
    );

  let parsed: unknown;
  try {
    parsed = parseGeminiJson<Record<string, unknown>>(outcome.value);
  } catch (err) {
    console.error('[quizDocumentExtract] unparseable response', err);
    throw new HttpsError('unavailable', 'Reading the document failed.');
  }

  const fallbackTitle = request.fileName.replace(/\.[^.]+$/, '').trim();
  const quiz = normalizeAiQuiz(parsed, fallbackTitle || 'Imported Quiz');
  if (quiz.questions.length === 0)
    throw new HttpsError(
      'not-found',
      'No questions could be read from that document.'
    );
  return quiz;
}

// ── Default deps ───────────────────────────────────────────────────────────

async function pdfPageCountOf(bytes: Buffer): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

async function geminiExtract(bytes: Buffer, mimeType: string): Promise<string> {
  const [{ GoogleGenAI }, ai] = await Promise.all([
    import('@google/genai'),
    import('./aiGeneration'),
  ]);
  const client = new GoogleGenAI(ai.__vertexClientOptions());
  const { standardModel } = await ai.__getGeminiModelConfig(admin.firestore());
  const result = await client.models.generateContent({
    model: standardModel,
    contents: [
      {
        role: 'user',
        parts: [
          { text: EXTRACT_PROMPT },
          { inlineData: { mimeType, data: bytes.toString('base64') } },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: buildDocumentResponseSchema(),
    },
  });
  return result.text ?? '';
}

/** Mirrors generateWithAI's per-feature counter; admins are uncapped. */
export async function chargeQuizQuota(
  db: Firestore,
  uid: string,
  email: string | null,
  nowMs: number
): Promise<void> {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const isAdmin = email
    ? (await db.collection('admins').doc(email.toLowerCase()).get()).exists
    : false;
  const overallRef = db.collection('ai_usage').doc(`${uid}_${today}`);
  const specificRef = db
    .collection('ai_usage')
    .doc(`${uid}_${QUIZ_QUOTA_FEATURE_ID}_${today}`);
  const permRef = db
    .collection('global_permissions')
    .doc(QUIZ_QUOTA_FEATURE_ID);
  await db.runTransaction(async (tx) => {
    const [specific, perm] = await Promise.all([
      tx.get(specificRef),
      tx.get(permRef),
    ]);
    const used = specific.exists ? Number(specific.data()?.count ?? 0) : 0;
    const config = (perm.data()?.config ?? {}) as {
      dailyLimit?: unknown;
      dailyLimitEnabled?: unknown;
    };
    const limit =
      typeof config.dailyLimit === 'number'
        ? config.dailyLimit
        : DEFAULT_QUIZ_DAILY_LIMIT;
    if (!isAdmin && config.dailyLimitEnabled !== false && used >= limit)
      throw new HttpsError(
        'resource-exhausted',
        `Daily limit for ${QUIZ_QUOTA_FEATURE_ID} reached (${limit} per day). Please try again tomorrow.`
      );
    const inc = (n: number) => admin.firestore.FieldValue.increment(n);
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    tx.set(
      specificRef,
      { count: inc(1), lastUsed: stamp, featureId: QUIZ_QUOTA_FEATURE_ID },
      { merge: true }
    );
    tx.set(overallRef, { count: inc(1), lastUsed: stamp }, { merge: true });
  });
}

export function buildDefaultExtractDocumentDeps(): ExtractDocumentDeps {
  const db = admin.firestore();
  return {
    db,
    isImportGranted: (uid, email) =>
      isGlobalFeatureGranted(db, QUIZ_DOCUMENT_IMPORT_FEATURE_ID, email, uid),
    isGeminiGranted: (uid, email) =>
      isGlobalFeatureGranted(db, GEMINI_FEATURE_ID, email, uid),
    chargeQuiz: (uid, email) => chargeQuizQuota(db, uid, email, Date.now()),
    pdfPageCount: pdfPageCountOf,
    extract: geminiExtract,
    now: () => Date.now(),
  };
}

// ── Callable ───────────────────────────────────────────────────────────────

export const extractQuizFromDocumentV1 = onCall(
  {
    memory: '1GiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    const parsed = parseExtractDocumentRequest(request.data);
    return extractQuizFromDocument(
      parsed,
      {
        uid: request.auth.uid,
        email: request.auth.token.email ?? null,
        emailVerified: request.auth.token.email_verified === true,
        studentRole: request.auth.token.studentRole === true,
      },
      buildDefaultExtractDocumentDeps()
    );
  }
);
