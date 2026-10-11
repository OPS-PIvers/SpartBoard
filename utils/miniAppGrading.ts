// Client copy of functions/src/miniAppGrading.ts for Try as student; tests/utils/miniAppGradingParity.test.ts keeps them identical.

// Local mirrors of the root types.ts shapes; functions cannot import root code.
export type MiniAppQuestionType =
  'mc' | 'multi' | 'tf' | 'numeric' | 'short' | 'order' | 'other';

export interface ManifestQuestion {
  id: string;
  type: MiniAppQuestionType;
  prompt: string;
  points?: number;
}

export interface AnswerKeyEntry {
  correct?: unknown;
  tolerance?: number;
  accepted?: string[];
}

export interface ResultItem {
  id: string;
  answer: unknown;
  correct?: boolean;
  points?: number;
}

export interface ParsedResult {
  items: ResultItem[];
  score?: number;
  maxScore?: number;
  data?: Record<string, unknown>;
}

export interface GradedItem {
  id: string;
  answer: unknown;
  correct: boolean | null;
  points: number;
  earned: number;
  gradedBy: 'server' | 'app' | null;
}

export interface GradeOutcome {
  items: GradedItem[];
  score: number | null;
  maxScore: number | null;
  gradedBy: 'server' | 'app' | null;
}

export const MAX_RESULT_ITEMS = 200;
export const MAX_RESULT_BYTES = 20_000;
const MAX_ID_LENGTH = 128;
const QUESTION_TYPES: readonly MiniAppQuestionType[] = [
  'mc',
  'multi',
  'tf',
  'numeric',
  'short',
  'order',
  'other',
];

export class MiniAppResultError extends Error {}

const fail = (message: string): never => {
  throw new MiniAppResultError(message);
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isQuestionType = (value: unknown): value is MiniAppQuestionType =>
  QUESTION_TYPES.includes(value as MiniAppQuestionType);

export const jsonBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value ?? null)).length;

const NAME_KEY =
  /^(first|last|full|given|family|sur|middle|display|student|user|nick)?name$/;
const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const isPrivateKey = (key: string): boolean => {
  const flat = key.toLowerCase().replace(/[\s_-]/g, '');
  return NAME_KEY.test(flat) || flat.includes('email');
};

const isEmailLike = (value: unknown): boolean =>
  typeof value === 'string' && EMAIL_VALUE.test(value);

/** D11: drops name- and email-keyed fields and email-like strings at any depth. */
export function stripPrivateFields(value: unknown, depth = 0): unknown {
  if (depth > 20) return null;
  if (isEmailLike(value)) return null;
  if (Array.isArray(value))
    return value
      .filter((entry) => !isEmailLike(entry))
      .map((entry) => stripPrivateFields(entry, depth + 1));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (isPrivateKey(key) || isEmailLike(entry)) continue;
      const cleaned = stripPrivateFields(entry, depth + 1);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return value;
}

/** Validates an app's `SpartBoard.submit` result (D3). Throws MiniAppResultError. */
export function parseMiniAppResult(raw: unknown): ParsedResult {
  if (!isRecord(raw)) return fail('The result must be an object.');
  if (jsonBytes(raw) > MAX_RESULT_BYTES)
    fail('The result is larger than 20 KB.');
  const rawItems = raw.items ?? [];
  if (!Array.isArray(rawItems)) return fail('items must be a list.');
  if (rawItems.length > MAX_RESULT_ITEMS)
    fail('A result can hold at most 200 items.');
  const seen = new Set<string>();
  const items = (rawItems as unknown[]).map((entry): ResultItem => {
    if (!isRecord(entry)) return fail('Each item must be an object.');
    const id = entry.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH)
      return fail('Each item needs an id.');
    if (seen.has(id)) fail(`Item ${id} appears twice.`);
    seen.add(id);
    const item: ResultItem = { id, answer: entry.answer ?? null };
    if (entry.correct !== undefined) {
      if (typeof entry.correct !== 'boolean')
        fail(`Item ${id}: correct must be true or false.`);
      item.correct = entry.correct as boolean;
    }
    if (entry.points !== undefined) {
      if (!isFiniteNumber(entry.points) || entry.points < 0)
        fail(`Item ${id}: points must be a number of 0 or more.`);
      item.points = entry.points as number;
    }
    return item;
  });
  const parsed: ParsedResult = { items };
  if (raw.score !== undefined) {
    if (!isFiniteNumber(raw.score) || raw.score < 0)
      fail('score must be a number of 0 or more.');
    parsed.score = raw.score as number;
  }
  if (raw.maxScore !== undefined) {
    if (!isFiniteNumber(raw.maxScore) || raw.maxScore <= 0)
      fail('maxScore must be a number above 0.');
    parsed.maxScore = raw.maxScore as number;
  }
  if (raw.data !== undefined) {
    if (!isRecord(raw.data)) fail('data must be an object.');
    parsed.data = raw.data as Record<string, unknown>;
  }
  return parsed;
}

/** Reads a stored manifest, dropping malformed questions. */
export function readManifest(raw: unknown): ManifestQuestion[] {
  if (!isRecord(raw) || !Array.isArray(raw.questions)) return [];
  const out: ManifestQuestion[] = [];
  const seen = new Set<string>();
  for (const q of raw.questions as unknown[]) {
    if (!isRecord(q) || typeof q.id !== 'string' || seen.has(q.id)) continue;
    if (!isQuestionType(q.type)) continue;
    seen.add(q.id);
    out.push({
      id: q.id,
      type: q.type,
      prompt: typeof q.prompt === 'string' ? q.prompt : '',
      ...(isFiniteNumber(q.points) && q.points >= 0
        ? { points: q.points }
        : {}),
    });
  }
  return out;
}

/** Reads a stored answer key into id -> entry. */
export function readAnswerKey(raw: unknown): Map<string, AnswerKeyEntry> {
  const out = new Map<string, AnswerKeyEntry>();
  if (!isRecord(raw) || !isRecord(raw.questions)) return out;
  for (const [id, entry] of Object.entries(raw.questions)) {
    if (!isRecord(entry)) continue;
    const parsed: AnswerKeyEntry = {};
    if (entry.correct !== undefined) parsed.correct = entry.correct;
    if (isFiniteNumber(entry.tolerance) && entry.tolerance >= 0)
      parsed.tolerance = entry.tolerance;
    if (Array.isArray(entry.accepted))
      parsed.accepted = entry.accepted.filter(
        (a): a is string => typeof a === 'string'
      );
    out.set(id, parsed);
  }
  return out;
}

const scalar = (value: unknown): string | null =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'
    ? String(value)
    : null;

const normalizeText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const sameScalar = (a: unknown, b: unknown): boolean => {
  const left = scalar(a);
  return left !== null && left === scalar(b);
};

const scalarList = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const out = value.map(scalar);
  return out.every((v): v is string => v !== null) ? out : null;
};

/** True when the key can grade this question type on the server. */
export function keyGrades(
  type: MiniAppQuestionType,
  key: AnswerKeyEntry | undefined
): boolean {
  if (!key || type === 'other') return false;
  if (type === 'short')
    return (key.accepted?.length ?? 0) > 0 || typeof key.correct === 'string';
  if (type === 'multi' || type === 'order') return Array.isArray(key.correct);
  if (type === 'numeric') return isFiniteNumber(key.correct);
  return scalar(key.correct) !== null;
}

/** D7: exact-match grading for one answer against its key. */
export function gradeAnswer(
  type: MiniAppQuestionType,
  key: AnswerKeyEntry,
  answer: unknown
): boolean {
  switch (type) {
    case 'mc':
      return sameScalar(answer, key.correct);
    case 'tf': {
      const a = scalar(answer)?.toLowerCase();
      const c = scalar(key.correct)?.toLowerCase();
      return a !== undefined && a === c;
    }
    case 'multi': {
      const a = scalarList(answer);
      const c = scalarList(key.correct);
      if (!a || !c) return false;
      const want = new Set(c);
      const got = new Set(a);
      return want.size === got.size && [...want].every((v) => got.has(v));
    }
    case 'order': {
      const a = scalarList(answer);
      const c = scalarList(key.correct);
      return (
        !!a && !!c && a.length === c.length && a.every((v, i) => v === c[i])
      );
    }
    case 'numeric': {
      const value =
        typeof answer === 'number'
          ? answer
          : typeof answer === 'string' && answer.trim() !== ''
            ? Number(answer)
            : NaN;
      if (!Number.isFinite(value) || !isFiniteNumber(key.correct)) return false;
      return Math.abs(value - key.correct) <= (key.tolerance ?? 0) + 1e-9;
    }
    case 'short': {
      if (typeof answer !== 'string' && typeof answer !== 'number')
        return false;
      const given = normalizeText(String(answer));
      const accepted = [
        ...(key.accepted ?? []),
        ...(typeof key.correct === 'string' ? [key.correct] : []),
      ].map(normalizeText);
      return accepted.includes(given);
    }
    default:
      return false;
  }
}

/**
 * D7: server-grades keyed questions, falls back to the app's `correct` for the rest,
 * and to the app's own score when nothing is gradable.
 */
export function gradeMiniAppResult(
  result: ParsedResult,
  manifest: ManifestQuestion[],
  key: Map<string, AnswerKeyEntry>
): GradeOutcome {
  const byId = new Map(result.items.map((item) => [item.id, item]));
  const graded: GradedItem[] = [];
  if (manifest.length > 0) {
    const known = new Set(manifest.map((q) => q.id));
    for (const item of result.items)
      if (!known.has(item.id))
        fail(`Item ${item.id} is not in the app's questions.`);
    for (const q of manifest) {
      const item = byId.get(q.id);
      const entry = key.get(q.id);
      if (keyGrades(q.type, entry)) {
        const points = q.points ?? 1;
        const correct =
          item && entry ? gradeAnswer(q.type, entry, item.answer) : false;
        graded.push({
          id: q.id,
          answer: item?.answer ?? null,
          correct,
          points,
          earned: correct ? points : 0,
          gradedBy: 'server',
        });
      } else if (item?.correct !== undefined) {
        const points = q.points ?? item.points ?? 1;
        graded.push({
          id: q.id,
          answer: item.answer,
          correct: item.correct,
          points,
          earned: item.correct ? points : 0,
          gradedBy: 'app',
        });
      } else if (item) {
        graded.push({
          id: q.id,
          answer: item.answer,
          correct: null,
          points: 0,
          earned: 0,
          gradedBy: null,
        });
      }
    }
  } else {
    for (const item of result.items) {
      const points = item.points ?? 1;
      graded.push({
        id: item.id,
        answer: item.answer,
        correct: item.correct ?? null,
        points: item.correct === undefined ? 0 : points,
        earned: item.correct ? points : 0,
        gradedBy: item.correct === undefined ? null : 'app',
      });
    }
  }
  const scored = graded.filter((g) => g.gradedBy !== null);
  if (scored.length > 0) {
    const maxScore = scored.reduce((sum, g) => sum + g.points, 0);
    return {
      items: graded,
      score: scored.reduce((sum, g) => sum + g.earned, 0),
      maxScore,
      gradedBy: scored.some((g) => g.gradedBy === 'app') ? 'app' : 'server',
    };
  }
  if (
    result.score !== undefined &&
    result.maxScore !== undefined &&
    result.score <= result.maxScore
  )
    return {
      items: graded,
      score: result.score,
      maxScore: result.maxScore,
      gradedBy: 'app',
    };
  return { items: graded, score: null, maxScore: null, gradedBy: null };
}
