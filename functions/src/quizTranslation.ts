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
import {
  ALLOWED_ORIGINS,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from './classlinkShared';
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
// Mirrors aiGeneration.ts DEFAULT_ADVANCED_MODEL.
const DEFAULT_ADVANCED_MODEL = 'gemini-3.7-flash';
const VERTEX_LOCATION = 'global';

// Mirrors config/quizTranslation.ts; functions cannot import the root package.
export const QUIZ_TRANSLATION_LANGUAGES: readonly {
  code: string;
  label: string;
}[] = [
  { code: 'es', label: 'Spanish' },
  { code: 'so', label: 'Somali' },
  { code: 'hmn', label: 'Hmong' },
  { code: 'ru', label: 'Russian' },
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
  /** FIB only: the translated accepted answer, snapshotted onto the assignment for grading. */
  answer?: string;
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
export const MAX_TRANSLATABLE_TITLE_CHARS = 1000;
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
  const { monthlyRef } = usageRefs(db, uid, nowMs);
  // Only the monthly doc's outputTokens is ever read (reserveTranslationUnit's
  // token-cap check) — no daily write to keep.
  await monthlyRef.set(
    { outputTokens: inc(outputTokens), updatedAt: nowMs },
    { merge: true }
  );
}

/**
 * Reserve one back-translation unit BEFORE the model call, mirroring
 * `reserveTranslationUnit`: a failed generation is still paid for, and two
 * concurrent calls at cap-1 cannot both pass. Back-translation is metered on
 * its own ceiling only (200/teacher/day), so it never spends the org's
 * quiz-translation cap. `backUnits` on the monthly doc is for visibility,
 * not for any gate.
 */
export async function reserveBackTranslationUnit(
  db: Firestore,
  uid: string,
  nowMs: number
): Promise<void> {
  const { monthlyRef, dailyRef } = usageRefs(db, uid, nowMs);
  return db.runTransaction(async (tx) => {
    const daily = await tx.get(dailyRef);
    const used = daily.exists ? Number(daily.get('backCount') ?? 0) : 0;
    if (used >= BACK_TRANSLATION_DAILY_LIMIT)
      throw new HttpsError(
        'resource-exhausted',
        'Daily back-translation limit reached. Try again tomorrow.'
      );
    tx.set(dailyRef, { backCount: inc(1), updatedAt: nowMs }, { merge: true });
    tx.set(
      monthlyRef,
      { backUnits: inc(1), updatedAt: nowMs },
      { merge: true }
    );
  });
}

/** Post-call token spend for a reserved back-translation unit. */
export async function billBackTranslationTokens(
  db: Firestore,
  uid: string,
  outputTokens: number,
  nowMs: number
): Promise<void> {
  if (outputTokens <= 0) return;
  const { monthlyRef } = usageRefs(db, uid, nowMs);
  await monthlyRef.set(
    { backOutputTokens: inc(outputTokens), updatedAt: nowMs },
    { merge: true }
  );
}

// ── Feature flag (server mirror of the client's canAccessFeature) ───────────

async function isSpartBoardAdmin(
  db: Firestore,
  email: string | undefined
): Promise<boolean> {
  if (!email) return false;
  const doc = await db.collection('admins').doc(email.toLowerCase()).get();
  return doc.exists;
}

/** Mirrors `BUILDING_ID_ALIASES` in `config/buildings.ts`; functions cannot import it. */
const BUILDING_ID_ALIASES: Readonly<Record<string, string>> = {
  'orono-high-school': 'high',
  'orono-middle-school': 'middle',
  'orono-intermediate-school': 'intermediate',
  'schumann-elementary': 'schumann',
};

/** Mirrors `INTERNAL_TIER_DOMAINS` in `utils/userTier.ts`. */
const INTERNAL_TIER_DOMAINS: readonly string[] = ['orono.k12.mn.us'];

/** Mirrors the `free < org < internal` ordering in `utils/userTier.ts`. */
const TIER_RANK: Readonly<Record<string, number>> = {
  free: 0,
  org: 1,
  internal: 2,
};

/** Server twin of `meetsMinTier` — an unset floor imposes no restriction. */
function meetsMinTierServer(tier: string, minTier: unknown): boolean {
  if (typeof minTier !== 'string' || !minTier) return true;
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[minTier] ?? 0);
}

/** Server twin of `canonicalizeBuildingIds` — legacy ids, de-duplicated. */
function canonicalizeBuildingIdsServer(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== 'string') continue;
    const canonical = BUILDING_ID_ALIASES[raw] ?? raw;
    if (!out.includes(canonical)) out.push(canonical);
  }
  return out;
}

/** The teacher's `selectedBuildings`, canonicalized the way AuthContext does. */
async function loadTeacherBuildings(
  db: Firestore,
  teacherUid: string
): Promise<string[]> {
  if (!teacherUid) return [];
  const snap = await db
    .doc(`users/${teacherUid}/userProfile/profile`)
    .get()
    .catch(() => null);
  const raw: unknown = snap?.data()?.selectedBuildings;
  return Array.isArray(raw) ? canonicalizeBuildingIdsServer(raw) : [];
}

/** Server twin of `deriveUserTier` — internal domain, else org member, else free. */
async function deriveTeacherTier(
  db: Firestore,
  teacherEmail: string
): Promise<string> {
  const domain = teacherEmail.split('@')[1] ?? '';
  if (domain && INTERNAL_TIER_DOMAINS.includes(domain)) return 'internal';
  const domainWithAt = normalizeEmailDomain(teacherEmail);
  if (!domainWithAt) return 'free';
  const orgId = await resolveOrgIdForDomain(db, domainWithAt).catch(() => null);
  if (!orgId) return 'free';
  const member = await db
    .doc(`organizations/${orgId}/members/${teacherEmail}`)
    .get()
    .catch(() => null);
  return member?.exists ? 'org' : 'free';
}

/**
 * Server-side gate for `global_permissions/quiz-translation`, resolved exactly
 * as `AuthContext.resolvePermissionAccess`/`canAccessFeature` resolve it
 * client-side (`missingDocPublic: false` for this feature — see
 * `config/featureDefaults.ts` — so an absent doc denies everyone, admins
 * included).
 */
export async function assertQuizTranslationFeature(
  db: Firestore,
  email: string | undefined,
  uid: string
): Promise<void> {
  const deny = (): never => {
    throw new HttpsError(
      'permission-denied',
      'Quiz translation is not available for your account.'
    );
  };
  let raw: Record<string, unknown> | undefined;
  try {
    const snap = await db
      .collection('global_permissions')
      .doc('quiz-translation')
      .get();
    raw = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  } catch {
    raw = undefined;
  }
  if (raw === undefined) deny();
  // `deny()` always throws, so `raw` is defined below; assert to avoid TS
  // narrowing limits on a `let` reassigned inside try/catch.
  const data = raw as Record<string, unknown>;
  if (data.enabled !== true) deny();
  const isAdmin = await isSpartBoardAdmin(db, email);
  const accessLevel =
    typeof data.accessLevel === 'string' ? data.accessLevel : '';
  if (!isAdmin) {
    if (accessLevel === 'beta') {
      const betaUsers = Array.isArray(data.betaUsers)
        ? (data.betaUsers as unknown[]).filter(
            (e): e is string => typeof e === 'string'
          )
        : [];
      const lower = (email ?? '').toLowerCase();
      if (!lower || !betaUsers.some((e) => e.toLowerCase() === lower)) deny();
    } else if (accessLevel !== 'public') {
      deny();
    }
    // Tier gate: an unset `minTier` imposes no restriction.
    if (data.minTier !== undefined && data.minTier !== null) {
      const tier = email ? await deriveTeacherTier(db, email) : 'free';
      if (!meetsMinTierServer(tier, data.minTier)) deny();
    }
    // Building gate: only applies when the record explicitly restricts it.
    const buildings = Array.isArray(data.buildings) ? data.buildings : [];
    if (buildings.length > 0) {
      const allowed = new Set(buildings);
      const selected = await loadTeacherBuildings(db, uid);
      if (!selected.some((b) => allowed.has(b))) deny();
    }
  }
}

// ── Alignment helpers ──────────────────────────────────────────────────────

const nonBlank = (s: string | undefined): s is string =>
  !!s && s.trim().length > 0;

/** MC: answer then distractors. MA: right options then wrong (mirrors utils/quizMultiAnswer multiAnswerOptions). */
export const filteredChoices = (q: TranslatableQuestion): string[] =>
  isMultiAnswer(q.type)
    ? [
        ...(q.correctAnswer ?? '').split('|').filter(nonBlank),
        ...(q.incorrectAnswers ?? []).filter(nonBlank),
      ]
    : [q.correctAnswer ?? '', ...(q.incorrectAnswers ?? []).filter(Boolean)];

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

/** A run of two or more underscores is how a FIB stem writes a blank. */
const FIB_BLANK_RE = /_{2,}/g;
const FIB_TOKEN_RE = /\[\[\d+\]\]/g;

export const isFillInTheBlank = (type: string) => type === 'FIB';

/** Replace each blank with `[[n]]` so the model cannot reflow or drop it. */
export function tokenizeFibStem(text: string): {
  text: string;
  blanks: string[];
} {
  const blanks: string[] = [];
  const tokenized = text.replace(FIB_BLANK_RE, (match) => {
    blanks.push(match);
    return `[[${blanks.length}]]`;
  });
  return { text: tokenized, blanks };
}

export const fibTokens = (text: string): string[] =>
  text.match(FIB_TOKEN_RE) ?? [];

/** Put the original underscore runs back; an unknown token is left as-is. */
export function restoreFibStem(text: string, blanks: string[]): string {
  return text.replace(FIB_TOKEN_RE, (token) => {
    const index = Number(token.slice(2, -2));
    return blanks[index - 1] ?? token;
  });
}

/** Sorted token multiset, so order changes in the target language are allowed. */
const sortedTokens = (text: string): string => fibTokens(text).sort().join(',');

// Mirrors hooks/useQuizSession.ts normalizeAnswer.
const normalizeAnswer = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ё/g, 'е');

function isMultiAnswer(type: string): boolean {
  return type === 'MA';
}
const isMatching = (type: string) => type === 'Matching';
const isOrdering = (type: string) => type === 'Ordering';
const isMultipleChoice = (type: string) => type === 'MC' || type === 'MA';
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
      if (
        isMultiAnswer(q.type) &&
        (t.choices ?? []).some((c) => c.includes('|'))
      )
        return `Question ${id}: choose-all choices may not contain "|".`;
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

    if (isFillInTheBlank(q.type)) {
      const expected = tokenizeFibStem(q.text ?? '');
      if (sortedTokens(t.text) !== sortedTokens(expected.text))
        return `Question ${id}: the translated stem must keep exactly the ${expected.blanks.length} blank token(s) from the English stem.`;
      // An English FIB with no answer key has nothing to translate.
      if (
        (q.correctAnswer ?? '').trim() !== '' &&
        (typeof t.answer !== 'string' || t.answer.trim() === '')
      )
        return `Question ${id}: a translated accepted answer is required.`;
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
            answer: { type: Type.STRING },
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

/** Per-language conventions appended to the system instruction. */
export const TRANSLATION_LOCALE_NOTES: Readonly<Record<string, string>> = {
  es: 'Use neutral Latin American Spanish familiar to students in US schools, with “ ” quotation marks throughout.',
  so: 'Use standard Somali Latin-script orthography as used in Somali-language schooling.',
  hmn: 'Use White Hmong (Hmoob Dawb) in the Romanized Popular Alphabet.',
  ru: 'Use standard Russian school vocabulary: a US high school is «старшая школа», a test is «тест» or «проверочная работа», cheating is «списывание», fabrication is «фальсификация», helping others cheat is «помощь другим в нарушениях» (not «пособничество»), and a student’s full name is «имя и фамилия». Write ё wherever it belongs and use «ёлочки» quotation marks.',
};

export function buildSystemInstruction(
  locale: string,
  languageLabel: string
): string {
  const note = TRANSLATION_LOCALE_NOTES[locale];
  return [
    `You are an experienced K-12 teacher and professional translator who writes classroom assessments in ${languageLabel}.`,
    `Translate an English quiz into ${languageLabel} (BCP-47 code "${locale}") for students who are still learning English.`,
    // Quality
    `Translate meaning, not words. Write what a native ${languageLabel}-speaking teacher would put on a test: natural, clear, grade-appropriate wording with the everyday school vocabulary students know. Avoid literal calques and legal or technical register.`,
    'Render US school terms (grade levels, high school, assessments, academic integrity) with their usual equivalents in that language.',
    'Students read the source materials (articles, passages, videos) in English. Every title of an article, section, book or video, and every phrase the English puts in quotation marks, is something students must find there: write your translation followed by the original English in parentheses.',
    'Preserve every qualifier and hedge exactly (may, might, probably, appear to, some, many, most, all, only, not). They often decide which answer is correct.',
    'Keep the full meaning of every answer choice; never shorten, merge or generalize a choice.',
    'When a question asks what an English word or phrase means, keep that word or phrase in English inside quotation marks and translate everything else, including the answer choices.',
    'Write personal names in the target script with standard transliteration, followed by the original spelling in parentheses the first time each appears in a question; in Latin-script languages keep names unchanged. Brand and product names (for example YouTube, Meta) stay as written.',
    'Use the established name for organizations, laws, places and historical events when that language has one, rather than translating the English words.',
    'Keep the assessment fair: add no hints or explanations, do not simplify away the concept being tested, keep answer choices parallel in grammar and length, and never make the correct choice easier to spot than the distractors.',
    'Use the target language’s quotation marks and punctuation, and proofread for spelling and grammar.',
    ...(note ? [note] : []),
    // Structure
    'Preserve numbers, units, code, LaTeX and markup verbatim.',
    'Keep every array the same length and the same order as the input array it mirrors.',
    'Multiple-choice options must remain mutually distinct after translation.',
    'Never introduce the characters "|" or ":" into matching or ordering strings.',
    'Fill-in-the-blank stems contain blank tokens like [[1]]. Reproduce every token verbatim, exactly once, adding none and dropping none; place each where the blank belongs in the target language.',
    'For a fill-in-the-blank question also translate "answer" — the accepted answer a student types.',
    'Return JSON only, with one entry per requested question id and no extras.',
  ].join(' ');
}

export function buildTranslationPrompt(
  title: string,
  source: TranslatableQuestion[],
  requestedIds: string[]
): string {
  const context = source.map((q) => ({
    id: q.id,
    type: q.type,
    text: isFillInTheBlank(q.type)
      ? tokenizeFibStem(q.text ?? '').text
      : q.text,
  }));
  const payload = source
    .filter((q) => requestedIds.includes(q.id))
    .map((q) => ({
      id: q.id,
      type: q.type,
      text: isFillInTheBlank(q.type)
        ? tokenizeFibStem(q.text ?? '').text
        : (q.text ?? ''),
      ...(isFillInTheBlank(q.type) && (q.correctAnswer ?? '').trim() !== ''
        ? { answer: q.correctAnswer }
        : {}),
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
    // Invariant: `choices` follow filteredChoices order (MC: [0] is correct), so
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
  if (isFillInTheBlank(type))
    return {
      text,
      ...(typeof q.answer === 'string' ? { answer: q.answer } : {}),
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
  if (title.length > MAX_TRANSLATABLE_TITLE_CHARS)
    throw new HttpsError(
      'invalid-argument',
      `The quiz title may be at most ${MAX_TRANSLATABLE_TITLE_CHARS} characters.`
    );
  if (!Array.isArray(data.questions) || data.questions.length === 0)
    throw new HttpsError('invalid-argument', 'questions are required.');
  const questions = data.questions as TranslatableQuestion[];
  if (questions.length > MAX_TRANSLATABLE_QUESTIONS)
    throw new HttpsError(
      'invalid-argument',
      `A quiz may have at most ${MAX_TRANSLATABLE_QUESTIONS} questions to translate.`
    );
  if (
    Buffer.byteLength(JSON.stringify(questions), 'utf8') >
    MAX_TRANSLATABLE_QUESTIONS_BYTES
  )
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
  const model = await resolveTranslationModel(deps.db);
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
  // and must not be retryable for free. One reserved unit may fund the initial
  // generate call plus its single repair retry; real spend stays bounded by the
  // outputTokens ceiling regardless.
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
    try {
      await billTranslationTokens(deps.db, uid, outputTokens, nowMs);
    } catch (err) {
      console.error('Failed to bill quiz-translation tokens', err);
    }
  }

  if (!shaped)
    throw new HttpsError(
      'invalid-argument',
      complaint ?? 'The translation did not match the quiz structure.'
    );

  // Blanks come back as tokens; put the underscore runs back before the sidecar sees them.
  for (const [id, entry] of Object.entries(shaped.questions)) {
    const q = byId.get(id);
    if (!q || !isFillInTheBlank(q.type)) continue;
    entry.text = restoreFibStem(
      entry.text,
      tokenizeFibStem(q.text ?? '').blanks
    );
  }

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

  // Reserve before the model call: a rejected or truncated generation still
  // costs real tokens and must not be retryable for free (mirrors translateQuiz).
  const nowMs = deps.now();
  await reserveBackTranslationUnit(deps.db, uid, nowMs);

  const model = await resolveStandardModel(deps.db);
  let outputTokens = 0;
  try {
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
    outputTokens = result.outputTokens;
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
    return { text: parsed.text, model };
  } finally {
    try {
      await billBackTranslationTokens(deps.db, uid, outputTokens, nowMs);
    } catch (err) {
      console.error('Failed to bill back-translation tokens', err);
    }
  }
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

async function resolveConfiguredModel(
  db: Firestore,
  key: 'standardModel' | 'advancedModel',
  fallback: string
): Promise<string> {
  try {
    const doc = await db
      .collection('global_permissions')
      .doc('gemini-functions')
      .get();
    const cfg = doc.data()?.config as Record<string, string> | undefined;
    return normalizeModelName(cfg?.[key]) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Honors the admin override at `global_permissions/gemini-functions` (D20). */
export function resolveStandardModel(db: Firestore): Promise<string> {
  return resolveConfiguredModel(db, 'standardModel', DEFAULT_STANDARD_MODEL);
}

/** Quiz translation uses the advanced model: flash-lite output was too literal for students. */
export function resolveTranslationModel(db: Firestore): Promise<string> {
  return resolveConfiguredModel(db, 'advancedModel', DEFAULT_ADVANCED_MODEL);
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
          // Flash models reject MINIMAL; LOW is accepted by lite and flash alike.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          temperature: 0.2,
          maxOutputTokens,
        },
      });
      const usage = result.usageMetadata;
      return {
        text: result.text,
        finishReason: result.candidates?.[0]?.finishReason as
          | string
          | undefined,
        outputTokens:
          (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
      };
    },
  };
}

// ── Callables ──────────────────────────────────────────────────────────────

export const translateQuizV1 = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 300,
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign-in required.');
    if (request.auth.token.studentRole === true)
      throw new HttpsError('permission-denied', 'Teacher account required.');
    // Unverified claims can't prove ownership of the caller's address (email/password sign-in allows a self-reported one) — same rail as organizationUserActivity.ts / isAdmin().
    if (request.auth.token.email_verified !== true)
      throw new HttpsError(
        'permission-denied',
        'Caller email must be verified.'
      );
    const deps = buildDefaultDeps();
    await assertQuizTranslationFeature(
      deps.db,
      request.auth.token.email,
      request.auth.uid
    );
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
    // Unverified claims can't prove ownership of the caller's address (email/password sign-in allows a self-reported one) — same rail as organizationUserActivity.ts / isAdmin().
    if (request.auth.token.email_verified !== true)
      throw new HttpsError(
        'permission-denied',
        'Caller email must be verified.'
      );
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
    await assertQuizTranslationFeature(
      deps.db,
      request.auth.token.email,
      request.auth.uid
    );
    return translateResponse({ text, sourceLocale }, request.auth.uid, deps);
  }
);
