// PLC norming flags: level labels, copy parsing and grouping (docs/plans/PLC_NORMING_FLAGS.md).
import type {
  PlcNormingCopy,
  PlcNormingLevel,
  PlcNormingLevelLabels,
} from '@/types';

export const PLC_NORMING_LEVELS: readonly PlcNormingLevel[] = [
  'high',
  'medium',
  'low',
  'review',
];

export const DEFAULT_NORMING_LABELS: Record<PlcNormingLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  review: 'Review',
};

export const NORMING_LABEL_MAX = 40;

/** Stars shown on each chip; Review shows a question mark instead. */
export const NORMING_LEVEL_STARS: Record<PlcNormingLevel, number> = {
  high: 3,
  medium: 2,
  low: 1,
  review: 0,
};

export function isNormingLevel(v: unknown): v is PlcNormingLevel {
  return (PLC_NORMING_LEVELS as readonly unknown[]).includes(v);
}

/** Keeps only non-empty string labels for the renameable levels, capped in length. */
export function parseNormingLevelLabels(
  raw: unknown
): PlcNormingLevelLabels | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: PlcNormingLevelLabels = {};
  for (const k of ['high', 'medium', 'low'] as const) {
    const v = typeof r[k] === 'string' ? r[k].trim() : '';
    if (v) out[k] = v.slice(0, NORMING_LABEL_MAX);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normingLabelFor(
  level: PlcNormingLevel,
  labels: PlcNormingLevelLabels | undefined
): string {
  if (level === 'review') return DEFAULT_NORMING_LABELS.review;
  return labels?.[level] ?? DEFAULT_NORMING_LABELS[level];
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseNormingCopy(
  id: string,
  raw: Record<string, unknown>
): PlcNormingCopy | null {
  if (!isNormingLevel(raw.level)) return null;
  if (raw.kind !== 'text' && raw.kind !== 'audio') return null;
  return {
    id,
    assessmentId: str(raw.assessmentId),
    questionId: str(raw.questionId),
    questionIndex: num(raw.questionIndex),
    questionText: str(raw.questionText),
    level: raw.level,
    kind: raw.kind,
    ...(typeof raw.answerText === 'string'
      ? { answerText: raw.answerText }
      : {}),
    ...(raw.truncated === true ? { truncated: true } : {}),
    ...(typeof raw.audioPath === 'string' ? { audioPath: raw.audioPath } : {}),
    ...(typeof raw.mimeType === 'string' ? { mimeType: raw.mimeType } : {}),
    ...(typeof raw.durationMs === 'number'
      ? { durationMs: raw.durationMs }
      : {}),
    flaggedByUid: str(raw.flaggedByUid),
    flaggedByName: str(raw.flaggedByName),
    createdAt: num(raw.createdAt),
    updatedAt: num(raw.updatedAt),
  };
}

export interface NormingQuestionGroup {
  questionId: string;
  questionIndex: number;
  questionText: string;
  byLevel: { level: PlcNormingLevel; copies: PlcNormingCopy[] }[];
}

/** Question order, then High, Medium, Low, Review; empty levels are dropped. */
export function groupNormingCopies(
  copies: readonly PlcNormingCopy[]
): NormingQuestionGroup[] {
  const byQuestion = new Map<string, PlcNormingCopy[]>();
  for (const c of copies) {
    const list = byQuestion.get(c.questionId) ?? [];
    list.push(c);
    byQuestion.set(c.questionId, list);
  }
  return Array.from(byQuestion.values())
    .map((list) => ({
      questionId: list[0].questionId,
      questionIndex: Math.min(...list.map((c) => c.questionIndex)),
      questionText: list[0].questionText,
      byLevel: PLC_NORMING_LEVELS.map((level) => ({
        level,
        copies: list
          .filter((c) => c.level === level)
          .sort((a, b) => a.createdAt - b.createdAt),
      })).filter((g) => g.copies.length > 0),
    }))
    .sort((a, b) => a.questionIndex - b.questionIndex);
}

/** Grader lookup key for one flagged answer slot. */
export function normingFlagKey(
  responseKey: string,
  questionId: string,
  slot: string
): string {
  return `${responseKey}\u0000${questionId}\u0000${slot}`;
}
