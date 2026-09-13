/**
 * Quiz translation (docs/plans/QUIZ_TRANSLATION.md §5, §6). Two callables:
 *
 *   - `translateQuizV1` (teacher): one Gemini call per quiz per language,
 *     server-validated for index alignment, metered per teacher and per org.
 *   - `translateResponseV1` (teacher): back-translation of one free-response
 *     answer for grading.
 *
 * The client owns Drive, so this function returns the payload and the
 * per-question source hashes; it never writes a sidecar itself.
 */
import './functionsInit';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  GoogleGenAI,
  Type,
  Schema,
  ThinkingLevel,
  GoogleGenAIOptions,
} from '@google/genai';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { parseGeminiJson } from './parseGeminiJson';
import { normalizeModelName } from './shared';
import { LANGUAGE_TAG_RE } from './languageTag';
import {
  hashQuestionForTranslation,
  type HashableQuestion,
} from './quizTranslationHash';

type Firestore = admin.firestore.Firestore;

export const QUIZ_TRANSLATION_SETTINGS_DOC = 'quiz_translation';
const DEFAULT_STANDARD_MODEL = 'gemini-3.5-flash-lite';
const VERTEX_LOCATION = 'global';

// Mirrors config/quizTranslation.ts; functions cannot import the root package.
export const QUIZ_TRANSLATION_LANGUAGES: readonly {
  code: string;
  label: string;
}[] = [
  { code: 'es', label: 'Spanish' },
  { code: 'so', label: 'Somali' },
  { code: 'hmn', label: 'Hmong' },
];
export const DEFAULT_MONTHLY_CAP_UNITS = 2000;
export const DEFAULT_MONTHLY_CAP_OUTPUT_TOKENS = 8_000_000;
/** Teacher-per-day ceilings (§5, §6). */
export const TEACHER_DAILY_LIMIT = 40;
export const BACK_TRANSLATION_DAILY_LIMIT = 200;

export interface QuizTranslationSettings {
  enabledLanguages: string[];
  monthlyCapUnits: number;
  monthlyCapOutputTokens: number;
}

/** Free-response rubric shape; structurally mirrored by the translation. */
export interface TranslatableRubric {
  criteria?: { name?: string; descriptors?: string[] }[];
}

export interface TranslatableQuestion extends HashableQuestion {
  id: string;
  incorrectAnswers?: string[];
  matchingDistractors?: string[];
  rubricSnapshot?: TranslatableRubric;
}

export interface QuestionTranslation {
  text: string;
  choices?: string[];
  matchingLeft?: string[];
  matchingRight?: string[];
  matchingDistractors?: string[];
  orderingItems?: string[];
  placeholder?: string;
  rubricSnapshot?: TranslatableRubric;
}

export interface TranslateQuizRequest {
  quizId: string;
  locale: string;
  title: string;
  sourceLanguage?: string;
  questions: TranslatableQuestion[];
  questionIds?: string[];
  bankSlots?: unknown;
}

export interface TranslateQuizResponse {
  title?: string;
  questions: Record<string, QuestionTranslation>;
  sourceHashes: Record<string, string>;
  model: string;
  outputTokens: number;
  cap: { remaining: number; total: number };
}

/** Which ceiling stopped the call; surfaced in the `resource-exhausted` details. */
export type QuotaReason = 'daily' | 'units' | 'outputTokens';

/** Request-size ceilings — a hostile payload must not reach Gemini or Firestore. */
export const MAX_TRANSLATABLE_QUESTIONS = 200;
export const MAX_TRANSLATABLE_QUESTIONS_BYTES = 200_000;
export const MAX_BACK_TRANSLATION_CHARS = 5000;

/** Injected so tests exercise the decisions, not Vertex or Firestore. */
export interface TranslationDeps {
  db: Firestore;
  generate: (input: {
    model: string;
    systemInstruction: string;
    prompt: string;
    responseSchema?: Schema;
    maxOutputTokens: number;
  }) => Promise<{
    text: string | undefined;
    finishReason?: string;
    outputTokens: number;
  }>;
  now: () => number;
}

// ── Ids, settings and quota ────────────────────────────────────────────────

export function monthlyTranslationDocId(nowMs: number): string {
  const d = new Date(nowMs);
  return `global_translation_${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function teacherDailyTranslationDocId(uid: string, nowMs: number) {
  return `${uid}_translation_${new Date(nowMs).toISOString().slice(0, 10)}`;
}

export async function loadTranslationSettings(
  db: Firestore
): Promise<QuizTranslationSettings> {
  let raw: Record<string, unknown> | undefined;
  try {
    const snap = await db
      .collection('admin_settings')
      .doc(QUIZ_TRANSLATION_SETTINGS_DOC)
      .get();
    raw = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  } catch {
    raw = undefined;
  }
  const codes = QUIZ_TRANSLATION_LANGUAGES.map((l) => l.code);
  const enabled = Array.isArray(raw?.enabledLanguages)
    ? (raw.enabledLanguages as unknown[]).filter(
        (c): c is string => typeof c === 'string' && codes.includes(c)
      )
    : null;
  const cap = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : fallback;
  return {
    enabledLanguages: enabled ?? codes,
    monthlyCapUnits: cap(raw?.monthlyCapUnits, DEFAULT_MONTHLY_CAP_UNITS),
    monthlyCapOutputTokens: cap(
      raw?.monthlyCapOutputTokens,
      DEFAULT_MONTHLY_CAP_OUTPUT_TOKENS
    ),
  };
}

const inc = (n: number) => admin.firestore.FieldValue.increment(n);

const usageRefs = (db: Firestore, uid: string, nowMs: number) => ({
  monthlyRef: db.collection('ai_usage').doc(monthlyTranslationDocId(nowMs)),
  dailyRef: db
    .collection('ai_usage')
    .doc(teacherDailyTranslationDocId(uid, nowMs)),
});

/**
 * Reserve one translation unit BEFORE the model call. Reading and incrementing
 * in one transaction is what makes the caps real: a failed generation is still
 * paid for, and two concurrent calls at cap-1 cannot both pass.
 * Hard block (never degrade): translation has no cheaper tier.
 */
export async function reserveTranslationUnit(
  db: Firestore,
  uid: string,
  settings: QuizTranslationSettings,
  nowMs: number
): Promise<{ remaining: number; total: number }> {
  const { monthlyRef, dailyRef } = usageRefs(db, uid, nowMs);
  return db.runTransaction(async (tx) => {
    const [monthly, daily] = await Promise.all([
      tx.get(monthlyRef),
      tx.get(dailyRef),
    ]);
    const num = (snap: admin.firestore.DocumentSnapshot, field: string) =>
      snap.exists ? Number(snap.get(field) ?? 0) : 0;
    const units = num(monthly, 'units');
    const tokens = num(monthly, 'outputTokens');
    const remaining = Math.max(0, settings.monthlyCapUnits - units);
    const total = settings.monthlyCapUnits;
    const block = (reason: QuotaReason, message: string): never => {
      throw new HttpsError('resource-exhausted', message, {
        capRemaining: remaining,
        capTotal: total,
        reason,
      });
    };
    if (units >= settings.monthlyCapUnits)
      block('units', 'This month’s translation limit has been reached.');
    if (tokens >= settings.monthlyCapOutputTokens)
      block('outputTokens', 'This month’s translation limit has been reached.');
    if (num(daily, 'count') >= TEACHER_DAILY_LIMIT)
      block('daily', 'Daily translation limit reached. Try again tomorrow.');
    tx.set(monthlyRef, { units: inc(1), updatedAt: nowMs }, { merge: true });
    tx.set(dailyRef, { count: inc(1), updatedAt: nowMs }, { merge: true });
    return { remaining: Math.max(0, remaining - 1), total };
  });
}

/** Post-call token spend for a reserved unit. Runs on success AND on failure. */
export async function billTranslationTokens(
  db: Firestore,
  uid: string,
  outputTokens: number,
  nowMs: number
): Promise<void> {
  if (outputTokens <= 0) return;
  const { monthlyRef, dailyRef } = usageRefs(db, uid, nowMs);
  await Promise.all([
    monthlyRef.set(
      { outputTokens: inc(outputTokens), updatedAt: nowMs },
      { merge: true }
    ),
    dailyRef.set(
      { outputTokens: inc(outputTokens), updatedAt: nowMs },
      { merge: true }
    ),
  ]);
}

/**
 * Back-translation is metered on its own ceiling only (200/teacher/day), so it
 * never spends the org's quiz-translation cap. `backUnits`/`backOutputTokens`
 * on the monthly doc are for visibility, not for any gate.
 */
export async function billBackTranslation(
  db: Firestore,
  uid: string,
  outputTokens: number,
  nowMs: number
): Promise<void> {
  const { monthlyRef, dailyRef } = usageRefs(db, uid, nowMs);
  await Promise.all([
    monthlyRef.set(
      {
        backUnits: inc(1),
        backOutputTokens: inc(outputTokens),
        updatedAt: nowMs,
      },
      { merge: true }
    ),
    dailyRef.set({ backCount: inc(1), updatedAt: nowMs }, { merge: true }),
  ]);
}

// ── Feature flag (server mirror of the client's canAccessFeature) ───────────

/** Mirrors FEATURE_DEFAULTS['quiz-translation'] in config/featureDefaults.ts. */
const QUIZ_TRANSLATION_FEATURE_DEFAULT = {
  enabled: true,
  accessLevel: 'admin' as const,
};

async function isSpartBoardAdmin(
  db: Firestore,
  email: string | undefined
): Promise<boolean> {
  if (!email) return false;
  const doc = await db.collection('admins').doc(email.toLowerCase()).get();
  return doc.exists;
}

/**
 * Server-side gate for `global_permissions/quiz-translation`, resolved exactly
 * as `AuthContext.canAccessFeature` resolves it client-side.
 */
export async function assertQuizTranslationFeature(
  db: Firestore,
  email: string | undefined
): Promise<void> {
  let data: Record<string, unknown> | undefined;
  try {
    const snap = await db
      .collection('global_permissions')
      .doc('quiz-translation')
      .get();
    data = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  } catch {
    data = undefined;
  }
  const enabled =
    data === undefined
      ? QUIZ_TRANSLATION_FEATURE_DEFAULT.enabled
      : data.enabled !== false;
  const accessLevel =
    data === undefined
      ? QUIZ_TRANSLATION_FEATURE_DEFAULT.accessLevel
      : typeof data.accessLevel === 'string'
        ? data.accessLevel
        : '';
  const deny = (): never => {
    throw new HttpsError(
      'permission-denied',
      'Quiz translation is not available for your account.'
    );
  };
  if (!enabled) deny();
  if (await isSpartBoardAdmin(db, email)) return;
  if (accessLevel === 'public') return;
  if (accessLevel === 'beta') {
    const betaUsers = Array.isArray(data?.betaUsers)
      ? (data.betaUsers as unknown[]).filter(
          (e): e is string => typeof e === 'string'
        )
      : [];
    const lower = (email ?? '').toLowerCase();
    if (lower && betaUsers.some((e) => e.toLowerCase() === lower)) return;
  }
  deny();
}

// ── Alignment helpers ──────────────────────────────────────────────────────

export const filteredChoices = (q: TranslatableQuestion): string[] => [
  q.correctAnswer ?? '',
  ...(q.incorrectAnswers ?? []).filter(Boolean),
];

export const filteredDistractors = (q: TranslatableQuestion): string[] =>
  (q.matchingDistractors ?? []).filter(Boolean);

export function parseMatchingPairs(
  correctAnswer: string | undefined
): { left: string; right: string }[] {
  return (correctAnswer ?? '')
    .split('|')
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':');
      return idx === -1
        ? { left: pair, right: '' }
        : { left: pair.slice(0, idx), right: pair.slice(idx + 1) };
    });
}

export const orderingItems = (q: TranslatableQuestion): string[] =>
  (q.correctAnswer ?? '').split('|').filter(Boolean);

const normalizeAnswer = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

const isMatching = (type: string) => type === 'Matching';
const isOrdering = (type: string) => type === 'Ordering';
const isMultipleChoice = (type: string) => type === 'MC';
const isFreeResponse = (type: string) => type === 'free-response';

const hasForbiddenChar = (values: string[]): boolean =>
  values.some((v) => v.includes('|') || v.includes(':'));

/**
 * Index alignment is the load-bearing invariant: every array must match the
 * FILTERED source array in length and order. Returns null when valid.
 */
export function validateQuizTranslation(
  source: TranslatableQuestion[],
  requestedIds: string[],
  output: Record<string, QuestionTranslation>
): string | null {
  const byId = new Map(source.map((q) => [q.id, q]));
  for (const id of Object.keys(output)) {
    if (!requestedIds.includes(id))
      return `Unexpected question id in the translation: ${id}.`;
  }
  for (const id of requestedIds) {
    const q = byId.get(id);
    const t = output[id];
    if (!q) return `Unknown question id: ${id}.`;
    if (!t) return `Missing translation for question ${id}.`;
    if (typeof t.text !== 'string' || t.text.trim() === '')
      return `Empty translated text for question ${id}.`;

    if (isMultipleChoice(q.type)) {
      const expected = filteredChoices(q);
      if ((t.choices?.length ?? 0) !== expected.length)
        return `Question ${id}: expected ${expected.length} choices, got ${t.choices?.length ?? 0}.`;
      const normalized = (t.choices ?? []).map(normalizeAnswer);
      if (new Set(normalized).size !== normalized.length)
        return `Question ${id}: translated choices are not mutually distinct.`;
    }

    if (isMatching(q.type)) {
      const pairs = parseMatchingPairs(q.correctAnswer);
      if ((t.matchingLeft?.length ?? 0) !== pairs.length)
        return `Question ${id}: expected ${pairs.length} matchingLeft entries, got ${t.matchingLeft?.length ?? 0}.`;
      if ((t.matchingRight?.length ?? 0) !== pairs.length)
        return `Question ${id}: expected ${pairs.length} matchingRight entries, got ${t.matchingRight?.length ?? 0}.`;
      const distractors = filteredDistractors(q);
      if ((t.matchingDistractors?.length ?? 0) !== distractors.length)
        return `Question ${id}: expected ${distractors.length} matchingDistractors, got ${t.matchingDistractors?.length ?? 0}.`;
      if (
        hasForbiddenChar([
          ...(t.matchingLeft ?? []),
          ...(t.matchingRight ?? []),
          ...(t.matchingDistractors ?? []),
        ])
      )
        return `Question ${id}: matching strings may not contain "|" or ":".`;
    }

    if (isOrdering(q.type)) {
      const items = orderingItems(q);
      if ((t.orderingItems?.length ?? 0) !== items.length)
        return `Question ${id}: expected ${items.length} orderingItems, got ${t.orderingItems?.length ?? 0}.`;
      if (hasForbiddenChar(t.orderingItems ?? []))
        return `Question ${id}: ordering strings may not contain "|" or ":".`;
    }

    if (isFreeResponse(q.type) && q.rubricSnapshot) {
      const src = q.rubricSnapshot.criteria ?? [];
      const out = t.rubricSnapshot?.criteria ?? [];
      if (out.length !== src.length)
        return `Question ${id}: expected ${src.length} rubric criteria, got ${out.length}.`;
      for (let i = 0; i < src.length; i++) {
        const srcCount = src[i].descriptors?.length ?? 0;
        const outCount = out[i].descriptors?.length ?? 0;
        if (srcCount !== outCount)
          return `Question ${id}: rubric criterion ${i + 1} expected ${srcCount} descriptors, got ${outCount}.`;
      }
    }
  }
  return null;
}

// ── Prompt and schema ──────────────────────────────────────────────────────

export function buildQuizTranslationResponseSchema(): Schema {
  const stringArray = { type: Type.ARRAY, items: { type: Type.STRING } };
  return {
    type: Type.OBJECT,
    required: ['title', 'questions'],
    properties: {
      title: { type: Type.STRING },
      questions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ['id', 'text'],
          properties: {
            id: { type: Type.STRING },
            text: { type: Type.STRING },
            choices: stringArray,
            matchingLeft: stringArray,
            matchingRight: stringArray,
            matchingDistractors: stringArray,
            orderingItems: stringArray,
            placeholder: { type: Type.STRING },
            rubric: {
              type: Type.OBJECT,
              properties: {
                criteria: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      descriptors: stringArray,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  } as Schema;
}

export function buildSystemInstruction(
  locale: string,
  languageLabel: string
): string {
  return [
    `You translate K-12 quiz content into ${languageLabel} (BCP-47 code "${locale}").`,
    'Translate for the reading level of a K-12 student.',
    'Preserve numbers, units, proper nouns, code, LaTeX and markup verbatim.',
    'Keep every array the same length and the same order as the input array it mirrors.',
    'Multiple-choice options must remain mutually distinct after translation.',
    'Never introduce the characters "|" or ":" into matching or ordering strings.',
    'Return JSON only, with one entry per requested question id and no extras.',
  ].join(' ');
}

export function buildTranslationPrompt(
  title: string,
  source: TranslatableQuestion[],
  requestedIds: string[]
): string {
  const context = source.map((q) => ({ id: q.id, type: q.type, text: q.text }));
  const payload = source
    .filter((q) => requestedIds.includes(q.id))
    .map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text ?? '',
      ...(isMultipleChoice(q.type) ? { choices: filteredChoices(q) } : {}),
      ...(isMatching(q.type)
        ? {
            matchingPairs: parseMatchingPairs(q.correctAnswer),
            matchingDistractors: filteredDistractors(q),
          }
        : {}),
      ...(isOrdering(q.type) ? { orderingItems: orderingItems(q) } : {}),
      ...(q.placeholder ? { placeholder: q.placeholder } : {}),
      ...(q.rubricSnapshot ? { rubric: q.rubricSnapshot } : {}),
    }));
  return [
    `Quiz title: ${JSON.stringify(title)}`,
    'Full quiz for terminology consistency (do not translate entries absent from the list below):',
    JSON.stringify(context),
    'Translate exactly these questions:',
    JSON.stringify(payload),
  ].join('\n');
}

interface RawTranslatedQuestion extends QuestionTranslation {
  id?: string;
  rubric?: TranslatableRubric;
}

/** Keep only the fields that belong to the question's type — never spread. */
function pickForType(
  type: string,
  q: RawTranslatedQuestion
): QuestionTranslation {
  const text = typeof q.text === 'string' ? q.text : '';
  if (isMultipleChoice(type))
    // Invariant: `choices[0]` is the CORRECT answer (filteredChoices order), so
    // consumers map by index onto the shuffled English array — never render in order.
    return { text, ...(q.choices ? { choices: q.choices } : {}) };
  if (isMatching(type))
    return {
      text,
      ...(q.matchingLeft ? { matchingLeft: q.matchingLeft } : {}),
      ...(q.matchingRight ? { matchingRight: q.matchingRight } : {}),
      ...(q.matchingDistractors
        ? { matchingDistractors: q.matchingDistractors }
        : {}),
    };
  if (isOrdering(type))
    return {
      text,
      ...(q.orderingItems ? { orderingItems: q.orderingItems } : {}),
    };
  if (isFreeResponse(type))
    return {
      text,
      ...(typeof q.placeholder === 'string'
        ? { placeholder: q.placeholder }
        : {}),
      ...(q.rubric ? { rubricSnapshot: q.rubric } : {}),
    };
  return { text };
}

function shapeOutput(
  parsed: {
    title?: string;
    questions?: RawTranslatedQuestion[];
  },
  byId: Map<string, TranslatableQuestion>
): { title?: string; questions: Record<string, QuestionTranslation> } {
  const questions: Record<string, QuestionTranslation> = {};
  for (const q of parsed.questions ?? []) {
    if (!q || typeof q.id !== 'string') continue;
    // Unknown ids are kept so the validator can reject them by name.
    questions[q.id] = pickForType(byId.get(q.id)?.type ?? '', q);
  }
  return {
    ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
    questions,
  };
}

// ── Core ───────────────────────────────────────────────────────────────────

export function parseTranslateQuizRequest(raw: unknown): TranslateQuizRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  const quizId = typeof data.quizId === 'string' ? data.quizId.trim() : '';
  const locale = typeof data.locale === 'string' ? data.locale.trim() : '';
  const title = typeof data.title === 'string' ? data.title : '';
  if (!quizId) throw new HttpsError('invalid-argument', 'quizId is required.');
  if (!LANGUAGE_TAG_RE.test(locale))
    throw new HttpsError('invalid-argument', 'A language tag is required.');
  if (!Array.isArray(data.questions) || data.questions.length === 0)
    throw new HttpsError('invalid-argument', 'questions are required.');
  const questions = data.questions as TranslatableQuestion[];
  if (questions.length > MAX_TRANSLATABLE_QUESTIONS)
    throw new HttpsError(
      'invalid-argument',
      `A quiz may have at most ${MAX_TRANSLATABLE_QUESTIONS} questions to translate.`
    );
  if (JSON.stringify(questions).length > MAX_TRANSLATABLE_QUESTIONS_BYTES)
    throw new HttpsError(
      'invalid-argument',
      'That quiz is too large to translate.'
    );
  if (questions.some((q) => !q || typeof q.id !== 'string' || !q.id))
    throw new HttpsError('invalid-argument', 'Every question needs an id.');
  const questionIds = Array.isArray(data.questionIds)
    ? (data.questionIds as unknown[]).filter(
        (id): id is string => typeof id === 'string'
      )
    : undefined;
  if (questionIds && questionIds.length === 0)
    throw new HttpsError(
      'invalid-argument',
      'questionIds must name at least one question.'
    );
  return {
    quizId,
    locale,
    title,
    ...(typeof data.sourceLanguage === 'string'
      ? { sourceLanguage: data.sourceLanguage }
      : {}),
    questions,
    ...(questionIds ? { questionIds } : {}),
    ...(data.bankSlots !== undefined ? { bankSlots: data.bankSlots } : {}),
  };
}

/** D17: v1 only translates quizzes whose source is English or unset. */
export const isEnglishSource = (lang: string | undefined): boolean =>
  !lang || lang.toLowerCase().startsWith('en');

export async function translateQuiz(
  request: TranslateQuizRequest,
  uid: string,
  deps: TranslationDeps
): Promise<TranslateQuizResponse> {
  if (request.bankSlots != null)
    throw new HttpsError(
      'failed-precondition',
      'Quizzes that draw from a question bank cannot be translated.'
    );
  if (!isEnglishSource(request.sourceLanguage))
    throw new HttpsError(
      'failed-precondition',
      'Only quizzes written in English can be translated.'
    );

  const settings = await loadTranslationSettings(deps.db);
  if (!settings.enabledLanguages.includes(request.locale))
    throw new HttpsError(
      'failed-precondition',
      'That language is not enabled for translation.'
    );

  const isFullQuiz = !request.questionIds;
  const requestedIds =
    request.questionIds ?? request.questions.map((q) => q.id);
  const unknown = requestedIds.filter(
    (id) => !request.questions.some((q) => q.id === id)
  );
  if (unknown.length > 0)
    throw new HttpsError(
      'invalid-argument',
      `Unknown question ids: ${unknown.join(', ')}.`
    );

  const label =
    QUIZ_TRANSLATION_LANGUAGES.find((l) => l.code === request.locale)?.label ??
    request.locale;
  const model = await resolveStandardModel(deps.db);
  const systemInstruction = buildSystemInstruction(request.locale, label);
  const basePrompt = buildTranslationPrompt(
    request.title,
    request.questions,
    requestedIds
  );
  const responseSchema = buildQuizTranslationResponseSchema();
  const maxOutputTokens = isFullQuiz ? 16384 : 4096;
  const byId = new Map(request.questions.map((q) => [q.id, q]));

  // Reserve the unit first: a rejected or truncated generation costs real tokens
  // and must not be retryable for free.
  const nowMs = deps.now();
  const cap = await reserveTranslationUnit(deps.db, uid, settings, nowMs);

  let outputTokens = 0;
  let shaped: {
    title?: string;
    questions: Record<string, QuestionTranslation>;
  } | null = null;
  let complaint: string | null = null;

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? basePrompt
          : `${basePrompt}\nYour previous output was rejected: ${complaint}\nReturn corrected JSON that fixes this.`;
      const result = await deps.generate({
        model,
        systemInstruction,
        prompt,
        responseSchema,
        maxOutputTokens,
      });
      outputTokens += result.outputTokens;
      // A truncated array is a MISALIGNED array — never serve it.
      if (result.finishReason === 'MAX_TOKENS')
        throw new HttpsError(
          'invalid-argument',
          'The translation was cut off before it finished. Try regenerating fewer questions.'
        );
      if (!result.text)
        throw new HttpsError('internal', 'Empty response from the translator.');
      const parsed = parseGeminiJson<{
        title?: string;
        questions?: RawTranslatedQuestion[];
      }>(result.text);
      const candidate = shapeOutput(parsed, byId);
      complaint = validateQuizTranslation(
        request.questions,
        requestedIds,
        candidate.questions
      );
      if (!complaint) {
        shaped = candidate;
        break;
      }
    }
  } finally {
    await billTranslationTokens(deps.db, uid, outputTokens, nowMs);
  }

  if (!shaped)
    throw new HttpsError(
      'invalid-argument',
      complaint ?? 'The translation did not match the quiz structure.'
    );

  const sourceHashes: Record<string, string> = {};
  for (const id of requestedIds) {
    const q = request.questions.find((item) => item.id === id);
    if (q) sourceHashes[id] = hashQuestionForTranslation(q);
  }

  return {
    ...(isFullQuiz && shaped.title ? { title: shaped.title } : {}),
    questions: shaped.questions,
    sourceHashes,
    model,
    outputTokens,
    cap,
  };
}

export async function translateResponse(
  input: { text: string; sourceLocale: string },
  uid: string,
  deps: TranslationDeps
): Promise<{ text: string; model: string }> {
  const settings = await loadTranslationSettings(deps.db);
  if (!settings.enabledLanguages.includes(input.sourceLocale))
    throw new HttpsError(
      'failed-precondition',
      'That language is not enabled for translation.'
    );
  const nowMs = deps.now();
  const dailySnap = await deps.db
    .collection('ai_usage')
    .doc(teacherDailyTranslationDocId(uid, nowMs))
    .get();
  const used = dailySnap.exists ? Number(dailySnap.get('backCount') ?? 0) : 0;
  if (used >= BACK_TRANSLATION_DAILY_LIMIT)
    throw new HttpsError(
      'resource-exhausted',
      'Daily back-translation limit reached. Try again tomorrow.'
    );

  const model = await resolveStandardModel(deps.db);
  const result = await deps.generate({
    model,
    systemInstruction:
      'You translate a K-12 student’s quiz answer into English for their teacher. ' +
      'Translate faithfully, preserve numbers and proper nouns, add nothing, and return JSON only.',
    prompt: `Source language code: ${input.sourceLocale}\nStudent response:\n${JSON.stringify(input.text)}`,
    responseSchema: {
      type: Type.OBJECT,
      required: ['text'],
      properties: { text: { type: Type.STRING } },
    } as Schema,
    maxOutputTokens: 2048,
  });
  if (result.finishReason === 'MAX_TOKENS')
    throw new HttpsError(
      'invalid-argument',
      'The response was too long to translate.'
    );
  if (!result.text)
    throw new HttpsError('internal', 'Empty response from the translator.');
  const parsed = parseGeminiJson<{ text?: string }>(result.text);
  if (typeof parsed.text !== 'string' || parsed.text.trim() === '')
    throw new HttpsError('internal', 'The translator returned no text.');

  await billBackTranslation(deps.db, uid, result.outputTokens, nowMs);
  return { text: parsed.text, model };
}

// ── Vertex plumbing ────────────────────────────────────────────────────────

function projectIdFromFirebaseConfig(): string | undefined {
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG ?? '{}') as {
      projectId?: string;
    };
    return cfg.projectId;
  } catch {
    return undefined;
  }
}

function vertexClientOptions(): GoogleGenAIOptions {
  const project =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    projectIdFromFirebaseConfig();
  if (!project)
    throw new HttpsError('internal', 'AI service is not configured.');
  return { vertexai: true, project, location: VERTEX_LOCATION };
}

/** Honors the admin override at `global_permissions/gemini-functions` (D20). */
export async function resolveStandardModel(db: Firestore): Promise<string> {
  try {
    const doc = await db
      .collection('global_permissions')
      .doc('gemini-functions')
      .get();
    const cfg = doc.data()?.config as { standardModel?: string } | undefined;
    return normalizeModelName(cfg?.standardModel) ?? DEFAULT_STANDARD_MODEL;
  } catch {
    return DEFAULT_STANDARD_MODEL;
  }
}

function buildDefaultDeps(): TranslationDeps {
  return {
    db: admin.firestore(),
    now: () => Date.now(),
    generate: async ({
      model,
      systemInstruction,
      prompt,
      responseSchema,
      maxOutputTokens,
    }) => {
      const ai = new GoogleGenAI(vertexClientOptions());
      const result = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          ...(responseSchema ? { responseSchema } : {}),
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          temperature: 0.2,
          maxOutputTokens,
        },
      });
      return {
        text: result.text,
        finishReason: result.candidates?.[0]?.finishReason as
          | string
          | undefined,
        outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  };
}

// ── Callables ──────────────────────────────────────────────────────────────

export const translateQuizV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    if (request.auth.token.studentRole === true)
      throw new HttpsError('permission-denied', 'Teacher account required.');
    const deps = buildDefaultDeps();
    await assertQuizTranslationFeature(deps.db, request.auth.token.email);
    return translateQuiz(
      parseTranslateQuizRequest(request.data),
      request.auth.uid,
      deps
    );
  }
);

export const translateResponseV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    if (request.auth.token.studentRole === true)
      throw new HttpsError('permission-denied', 'Teacher account required.');
    const data = (request.data ?? {}) as Record<string, unknown>;
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    const sourceLocale =
      typeof data.sourceLocale === 'string' ? data.sourceLocale.trim() : '';
    if (!text) throw new HttpsError('invalid-argument', 'text is required.');
    if (text.length > MAX_BACK_TRANSLATION_CHARS)
      throw new HttpsError(
        'invalid-argument',
        'That response is too long to translate.'
      );
    if (!LANGUAGE_TAG_RE.test(sourceLocale))
      throw new HttpsError('invalid-argument', 'A language tag is required.');
    const deps = buildDefaultDeps();
    await assertQuizTranslationFeature(deps.db, request.auth.token.email);
    return translateResponse({ text, sourceLocale }, request.auth.uid, deps);
  }
);
