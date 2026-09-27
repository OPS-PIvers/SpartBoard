// Server mirrors of the quiz / question bank save paths (hooks/useQuiz.ts saveQuiz, hooks/useQuestionBanks.ts saveBank).
import type * as admin from 'firebase-admin';
import { hashQuestionForTranslation } from '../quizTranslationHash';
import { ToolError } from './activity';

type Firestore = admin.firestore.Firestore;

export type StoredQuestionType =
  | 'MC'
  | 'FIB'
  | 'Matching'
  | 'Ordering'
  | 'MA'
  | 'free-response';

/** Mirrors QuizQuestion in types.ts; unknown fields ride along untouched. */
export interface StoredQuestion {
  id: string;
  timeLimit: number;
  text: string;
  type: StoredQuestionType;
  correctAnswer: string;
  incorrectAnswers: string[];
  alternateAnswers?: string[];
  optionOrder?: number[];
  needsKey?: boolean;
  points?: number;
  matchingDistractors?: string[];
  allowPartialCredit?: boolean;
  placeholder?: string;
  minWords?: number;
  maxWords?: number;
  targets?: { id: string }[];
  [extra: string]: unknown;
}

/** QuizData / QuestionBankData share this shape on Drive. */
export interface QuizContent {
  id: string;
  title: string;
  questions: StoredQuestion[];
  createdAt: number;
  updatedAt: number;
  language?: string;
  targets?: { id: string }[];
  [extra: string]: unknown;
}

export type QuizKind = 'quiz' | 'bank';

export const KIND = {
  quiz: {
    collection: 'quizzes',
    folderCollection: 'quiz_folders',
    itemType: 'quiz',
    label: 'quiz',
    plural: 'quizzes',
  },
  bank: {
    collection: 'question_banks',
    folderCollection: 'question_bank_folders',
    itemType: 'question_bank',
    label: 'question bank',
    plural: 'question banks',
  },
} as const;

export const MAX_QUESTIONS = 200;
export const MC_MAX_WRONG = 4;
export const LIST_MAX = 12;
export const MA_MAX_OPTIONS = 6;

// ── Tool-facing question format ────────────────────────────────────────────

export type FriendlyType =
  | 'multiple_choice'
  | 'choose_all'
  | 'fill_in_blank'
  | 'matching'
  | 'ordering'
  | 'free_response';

export interface FriendlyQuestion {
  id?: string;
  type: FriendlyType;
  text: string;
  correct_answer?: string;
  incorrect_answers?: string[];
  correct_answers?: string[];
  accepted_alternates?: string[];
  pairs?: { term: string; match: string }[];
  extra_matches?: string[];
  items_in_order?: string[];
  points?: number;
  time_limit_seconds?: number;
  partial_credit?: boolean;
  placeholder?: string;
  min_words?: number;
  max_words?: number;
}

const TO_STORED: Record<FriendlyType, StoredQuestionType> = {
  multiple_choice: 'MC',
  choose_all: 'MA',
  fill_in_blank: 'FIB',
  matching: 'Matching',
  ordering: 'Ordering',
  free_response: 'free-response',
};
const TO_FRIENDLY: Record<StoredQuestionType, FriendlyType> = {
  MC: 'multiple_choice',
  MA: 'choose_all',
  FIB: 'fill_in_blank',
  Matching: 'matching',
  Ordering: 'ordering',
  'free-response': 'free_response',
};

/** Fields owned by the answer key; replaced wholesale whenever Claude edits a question. */
const KEY_FIELDS = [
  'correctAnswer',
  'incorrectAnswers',
  'alternateAnswers',
  'optionOrder',
  'matchingDistractors',
  'allowPartialCredit',
  'placeholder',
  'minWords',
  'maxWords',
  'needsKey',
] as const;
/** Type-specific extras that no longer make sense once the type changes. */
const TYPE_BOUND_EXTRAS = [
  'recording',
  'rubricId',
  'rubricSnapshot',
  'enforceWordLimit',
  'paperBoxSize',
] as const;

const clean = (values: string[] | undefined): string[] =>
  (values ?? []).map((v) => v.trim()).filter(Boolean);

function assertNoPipe(n: number, values: string[], what: string): void {
  if (values.some((v) => v.includes('|'))) {
    throw new ToolError(
      `Question ${n}: ${what} can't contain the "|" character.`
    );
  }
}

/** Tool input → stored question, keeping the existing question's non-key extras (targets, stimuli, rubric). */
export function toStoredQuestion(
  input: FriendlyQuestion,
  n: number,
  existing: StoredQuestion | undefined,
  newId: () => string
): StoredQuestion {
  const type = TO_STORED[input.type];
  const text = input.text.trim();
  if (!text) throw new ToolError(`Question ${n}: text is required.`);
  const base: StoredQuestion = {
    id: existing?.id ?? newId(),
    timeLimit: input.time_limit_seconds ?? existing?.timeLimit ?? 0,
    text,
    type,
    correctAnswer: '',
    incorrectAnswers: [],
  };
  if (existing) {
    for (const [k, v] of Object.entries(existing)) {
      if (k in base || (KEY_FIELDS as readonly string[]).includes(k)) continue;
      if (
        existing.type !== type &&
        (TYPE_BOUND_EXTRAS as readonly string[]).includes(k)
      )
        continue;
      base[k] = v;
    }
  }
  if (input.points !== undefined) base.points = input.points;

  switch (type) {
    case 'MC': {
      const correct = input.correct_answer?.trim() ?? '';
      const wrong = clean(input.incorrect_answers);
      if (!correct)
        throw new ToolError(
          `Question ${n}: multiple_choice needs correct_answer.`
        );
      if (wrong.length < 1 || wrong.length > MC_MAX_WRONG) {
        throw new ToolError(
          `Question ${n}: multiple_choice needs 1 to ${MC_MAX_WRONG} incorrect_answers.`
        );
      }
      base.correctAnswer = correct;
      base.incorrectAnswers = wrong;
      break;
    }
    case 'MA': {
      const right = clean(input.correct_answers);
      const wrong = clean(input.incorrect_answers);
      if (
        right.length < 1 ||
        right.length > MA_MAX_OPTIONS ||
        wrong.length > MA_MAX_OPTIONS
      ) {
        throw new ToolError(
          `Question ${n}: choose_all needs 1 to ${MA_MAX_OPTIONS} correct_answers and at most ${MA_MAX_OPTIONS} incorrect_answers.`
        );
      }
      assertNoPipe(n, [...right, ...wrong], 'choices');
      base.correctAnswer = right.join('|');
      base.incorrectAnswers = wrong;
      if (input.partial_credit !== undefined)
        base.allowPartialCredit = input.partial_credit;
      break;
    }
    case 'FIB': {
      const correct = input.correct_answer?.trim() ?? '';
      if (!correct)
        throw new ToolError(
          `Question ${n}: fill_in_blank needs correct_answer.`
        );
      base.correctAnswer = correct;
      const alternates = clean(input.accepted_alternates);
      if (alternates.length > 0) base.alternateAnswers = alternates;
      break;
    }
    case 'Matching': {
      const pairs = (input.pairs ?? [])
        .map((p) => ({ term: p.term.trim(), match: p.match.trim() }))
        .filter((p) => p.term && p.match);
      if (pairs.length < 2 || pairs.length > LIST_MAX) {
        throw new ToolError(
          `Question ${n}: matching needs 2 to ${LIST_MAX} pairs.`
        );
      }
      if (pairs.some((p) => p.term.includes(':'))) {
        throw new ToolError(`Question ${n}: matching terms can't contain ":".`);
      }
      const extras = clean(input.extra_matches);
      assertNoPipe(
        n,
        [...pairs.flatMap((p) => [p.term, p.match]), ...extras],
        'matching items'
      );
      base.correctAnswer = pairs.map((p) => `${p.term}:${p.match}`).join('|');
      if (extras.length > 0) base.matchingDistractors = extras;
      if (input.partial_credit !== undefined)
        base.allowPartialCredit = input.partial_credit;
      break;
    }
    case 'Ordering': {
      const items = clean(input.items_in_order);
      if (items.length < 2 || items.length > LIST_MAX) {
        throw new ToolError(
          `Question ${n}: ordering needs 2 to ${LIST_MAX} items_in_order.`
        );
      }
      assertNoPipe(n, items, 'items');
      base.correctAnswer = items.join('|');
      if (input.partial_credit !== undefined)
        base.allowPartialCredit = input.partial_credit;
      break;
    }
    case 'free-response': {
      if (input.placeholder?.trim())
        base.placeholder = input.placeholder.trim();
      if (input.min_words !== undefined) base.minWords = input.min_words;
      if (input.max_words !== undefined) base.maxWords = input.max_words;
      break;
    }
  }
  return base;
}

/** Stored question → tool output (inverse of toStoredQuestion). */
export function toFriendlyQuestion(
  q: StoredQuestion
): FriendlyQuestion & { needs_answer_key?: boolean } {
  const out: FriendlyQuestion & { needs_answer_key?: boolean } = {
    id: q.id,
    type: TO_FRIENDLY[q.type] ?? 'free_response',
    text: q.text,
  };
  if (q.points !== undefined) out.points = q.points;
  if (q.timeLimit) out.time_limit_seconds = q.timeLimit;
  const split = (s: string) => (s ?? '').split('|').filter((v) => v.length > 0);
  switch (q.type) {
    case 'MC':
      out.correct_answer = q.correctAnswer;
      out.incorrect_answers = q.incorrectAnswers ?? [];
      break;
    case 'MA':
      out.correct_answers = split(q.correctAnswer);
      out.incorrect_answers = q.incorrectAnswers ?? [];
      if (q.allowPartialCredit !== undefined)
        out.partial_credit = q.allowPartialCredit;
      break;
    case 'FIB':
      out.correct_answer = q.correctAnswer;
      if (q.alternateAnswers?.length)
        out.accepted_alternates = q.alternateAnswers;
      break;
    case 'Matching':
      out.pairs = split(q.correctAnswer).map((pair) => {
        const i = pair.indexOf(':');
        return i === -1
          ? { term: pair, match: '' }
          : { term: pair.slice(0, i), match: pair.slice(i + 1) };
      });
      if (q.matchingDistractors?.length)
        out.extra_matches = q.matchingDistractors;
      if (q.allowPartialCredit !== undefined)
        out.partial_credit = q.allowPartialCredit;
      break;
    case 'Ordering':
      out.items_in_order = split(q.correctAnswer);
      if (q.allowPartialCredit !== undefined)
        out.partial_credit = q.allowPartialCredit;
      break;
    default:
      if (q.placeholder) out.placeholder = q.placeholder;
      if (q.minWords !== undefined) out.min_words = q.minWords;
      if (q.maxWords !== undefined) out.max_words = q.maxWords;
  }
  if (questionNeedsKey(q)) out.needs_answer_key = true;
  return out;
}

// ── Metadata mirrors ───────────────────────────────────────────────────────

/** Mirrors buildQuizSearchText in utils/quizSearchText.ts. */
export function buildSearchText(questions: StoredQuestion[]): string {
  return questions
    .map((q) => q.text)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 2000);
}

/** Mirrors quizOrder in utils/questionBanks.ts for question entries: drops removed ids, appends new ones last. */
export function reconcileQuestionOrder(
  order: unknown,
  questions: StoredQuestion[]
): unknown {
  if (!Array.isArray(order)) return order;
  const ids = new Set(questions.map((q) => q.id));
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const entry of order as { kind?: unknown; id?: unknown }[]) {
    if (entry?.kind === 'question') {
      const id = String(entry.id);
      if (!ids.has(id) || seen.has(id)) continue;
      seen.add(id);
    }
    out.push(entry);
  }
  for (const q of questions) {
    if (!seen.has(q.id)) out.push({ kind: 'question', id: q.id });
  }
  return out;
}

/** Mirrors isMissingKey in utils/quizNeedsKey.ts. */
function isMissingKey(q: StoredQuestion): boolean {
  if (q.type === 'free-response') return false;
  if (q.type === 'MA') {
    return (
      (q.correctAnswer ?? '').split('|').filter((s) => s.trim()).length === 0
    );
  }
  return !q.correctAnswer?.trim();
}

/** Mirrors questionNeedsKey in utils/quizNeedsKey.ts. */
export const questionNeedsKey = (q: StoredQuestion): boolean =>
  !!q.needsKey && isMissingKey(q);

/** Mirrors clearSatisfiedNeedsKey in utils/quizNeedsKey.ts. */
export function clearSatisfiedNeedsKey(
  questions: StoredQuestion[]
): StoredQuestion[] {
  return questions.map((q) => {
    if (!q.needsKey || questionNeedsKey(q)) return q;
    const rest: StoredQuestion = { ...q };
    delete rest.needsKey;
    return rest;
  });
}

interface TranslationIndexEntry {
  sourceHashes?: Record<string, string>;
  [k: string]: unknown;
}

/** Mirrors recomputeTranslationIndex in utils/quizTranslationIndex.ts (every type is translatable). */
export function recomputeTranslationIndex(
  existing: Record<string, TranslationIndexEntry> | undefined,
  questions: StoredQuestion[]
): Record<string, TranslationIndexEntry> | undefined {
  if (!existing || Object.keys(existing).length === 0) return undefined;
  const hashes = new Map(
    questions.map((q) => [q.id, hashQuestionForTranslation(q)])
  );
  const next: Record<string, TranslationIndexEntry> = {};
  for (const [locale, entry] of Object.entries(existing)) {
    const source = entry.sourceHashes ?? {};
    let stale = 0;
    for (const [id, hash] of hashes) if (source[id] !== hash) stale += 1;
    next[locale] = {
      ...entry,
      questionCount: questions.length,
      staleCount: stale,
    };
  }
  return next;
}

/** Mirrors bankTargetIndex in utils/questionBanks.ts (question tags merged with the bank's own). */
export function bankTargetIndex(
  bank: Pick<QuizContent, 'questions' | 'targets'>
): {
  targetIds: string[];
  targetCounts: Record<string, number>;
} {
  const counts: Record<string, number> = {};
  for (const q of bank.questions) {
    const seen = new Set<string>();
    for (const tag of [...(q.targets ?? []), ...(bank.targets ?? [])]) {
      if (seen.has(tag.id)) continue;
      seen.add(tag.id);
      counts[tag.id] = (counts[tag.id] ?? 0) + 1;
    }
  }
  return { targetIds: Object.keys(counts).sort(), targetCounts: counts };
}

export const stripUndefined = <T extends Record<string, unknown>>(
  value: T
): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as T;

/** Mirrors the metadata doc useQuiz.saveQuiz / buildBankMetadata write, plus preserved library fields. */
export function buildMetadata(
  kind: QuizKind,
  content: QuizContent,
  driveFileId: string,
  existing: Record<string, unknown> | null,
  claude: { claudeCreatedAt?: number; claudeEditedAt?: number }
): Record<string, unknown> {
  const preserved = {
    folderId: existing?.folderId,
    order: existing?.order,
    sync: existing?.sync,
    claudeCreatedAt: existing?.claudeCreatedAt,
    ...claude,
  };
  if (kind === 'bank') {
    return stripUndefined({
      id: content.id,
      title: content.title,
      driveFileId,
      questionCount: content.questions.length,
      searchText: buildSearchText(content.questions),
      ...bankTargetIndex(content),
      createdAt: content.createdAt,
      updatedAt: content.updatedAt,
      ...preserved,
    });
  }
  return stripUndefined({
    id: content.id,
    title: content.title,
    driveFileId,
    questionCount: content.questions.length,
    searchText: buildSearchText(content.questions),
    needsKeyCount: content.questions.filter(questionNeedsKey).length,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
    behavior: existing?.behavior,
    translations: recomputeTranslationIndex(
      existing?.translations as
        | Record<string, TranslationIndexEntry>
        | undefined,
      content.questions
    ),
    language: content.language,
    ...preserved,
  });
}

export const metaPath = (kind: QuizKind, uid: string, id: string) =>
  `users/${uid}/${KIND[kind].collection}/${id}`;

export async function readMetadata(
  db: Firestore,
  kind: QuizKind,
  uid: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const snap = await db.doc(metaPath(kind, uid, id)).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

/** Mirrors normalizeLegacyQuestionType in utils/quizQuestionNormalize.ts. */
export function normalizeContent(raw: unknown, id: string): QuizContent {
  const data = (raw ?? {}) as Partial<QuizContent>;
  const questions = (Array.isArray(data.questions) ? data.questions : []).map(
    (q) => {
      const t = q.type as string;
      return t === 'short' || t === 'essay'
        ? { ...q, type: 'free-response' as const }
        : q;
    }
  );
  return {
    ...data,
    id: data.id ?? id,
    title: data.title ?? '',
    questions,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  } as QuizContent;
}
