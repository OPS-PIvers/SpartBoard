/**
 * Trust boundary for a translation sidecar (plan §3.3). The file lives in the
 * teacher's Drive, so it can be hand-edited, truncated or written by an older
 * build: coerce it into a `QuizTranslation` rather than casting.
 */
import type { QuestionTranslation, QuizTranslation, Rubric } from '@/types';

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const strArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.map((item) => str(item)) : undefined;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function normalizeQuestion(raw: unknown): QuestionTranslation {
  const r = isRecord(raw) ? raw : {};
  const choices = strArray(r.choices);
  const matchingLeft = strArray(r.matchingLeft);
  const matchingRight = strArray(r.matchingRight);
  const matchingDistractors = strArray(r.matchingDistractors);
  const orderingItems = strArray(r.orderingItems);
  return {
    text: str(r.text),
    ...(choices ? { choices } : {}),
    ...(matchingLeft ? { matchingLeft } : {}),
    ...(matchingRight ? { matchingRight } : {}),
    ...(matchingDistractors ? { matchingDistractors } : {}),
    ...(orderingItems ? { orderingItems } : {}),
    ...(typeof r.placeholder === 'string'
      ? { placeholder: r.placeholder }
      : {}),
    ...(isRecord(r.rubricSnapshot)
      ? { rubricSnapshot: r.rubricSnapshot as unknown as Rubric }
      : {}),
  };
}

export function normalizeQuizTranslation(raw: unknown): QuizTranslation {
  const r = isRecord(raw) ? raw : {};
  const questions: Record<string, QuestionTranslation> = {};
  if (isRecord(r.questions)) {
    for (const [id, value] of Object.entries(r.questions)) {
      questions[id] = normalizeQuestion(value);
    }
  }
  const sourceHashes: Record<string, string> = {};
  if (isRecord(r.sourceHashes)) {
    for (const [id, value] of Object.entries(r.sourceHashes)) {
      if (typeof value === 'string') sourceHashes[id] = value;
    }
  }
  const now = Date.now();
  const generatedAt = num(r.generatedAt, now);
  return {
    locale: str(r.locale),
    title: str(r.title),
    questions,
    sourceHashes,
    reviewedQuestionIds: Array.isArray(r.reviewedQuestionIds)
      ? r.reviewedQuestionIds.filter(
          (id): id is string => typeof id === 'string'
        )
      : [],
    model: str(r.model),
    generatedAt,
    updatedAt: num(r.updatedAt, generatedAt),
  };
}
