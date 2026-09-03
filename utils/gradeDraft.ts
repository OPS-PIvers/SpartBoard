import type {
  WrittenAnswerAnnotation,
  WrittenAnswerGrade,
  WrittenAnswerRubricScore,
} from '@/types';
import { sumRubricScorePoints } from '@/utils/rubricPoints';
import { sanitizeQuizResponse } from '@/utils/security';

/** Teacher's call on a slot whose capture never worked. */
export type Adjudication = 'none' | 'excuse' | 'blank' | 'substitute';

/** Everything the grader holds in form state for one target. */
export interface GradeDraft {
  pointsInput: string;
  comment: string;
  annotations: WrittenAnswerAnnotation[];
  rubricScores: WrittenAnswerRubricScore[];
  pinnedTakeIndex: number | null;
  adjudication: Adjudication;
}

/** What the target itself contributes to validation and the payload. */
export interface GradeDraftContext {
  kind: 'text' | 'media';
  captureUnavailable: boolean;
  maxPoints: number;
  rubricCriteriaCount: number;
  teacherUid: string;
  /** Typed answer for text targets; annotations need something to anchor to. */
  answerText: string;
  existingSnapshot?: string;
  /** Take the media grade is about; ignored for text targets. */
  gradedTakeIndex?: number;
}

export type GradeDraftError =
  | 'chooseOutcome'
  | 'noteRequired'
  | 'numericScore'
  | 'range'
  | 'emptyAnnotations';

export type BuildGradeResult =
  | { ok: true; grade: WrittenAnswerGrade }
  | { ok: false; error: GradeDraftError };

export const clampPoints = (points: number, maxPoints: number): number =>
  Math.max(0, Math.min(points, maxPoints));

/** Finite number inside `[0, maxPoints]`, else null. */
export function parsePoints(input: string, maxPoints: number): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > maxPoints) return null;
  return parsed;
}

const rubricActive = (ctx: GradeDraftContext) =>
  ctx.rubricCriteriaCount > 0 &&
  !(ctx.kind === 'media' && ctx.captureUnavailable);

/** A complete draft is one the teacher is done with: it gets written without a Save click. */
export function isGradeComplete(
  draft: GradeDraft,
  ctx: GradeDraftContext
): boolean {
  if (ctx.kind === 'media' && ctx.captureUnavailable) {
    if (draft.adjudication === 'excuse' || draft.adjudication === 'blank')
      return true;
    if (draft.adjudication === 'substitute') {
      if (!draft.comment.trim()) return false;
      return (
        draft.pointsInput.trim() === '' ||
        parsePoints(draft.pointsInput, ctx.maxPoints) !== null
      );
    }
    return false;
  }
  if (rubricActive(ctx)) {
    return draft.rubricScores.length === ctx.rubricCriteriaCount;
  }
  return parsePoints(draft.pointsInput, ctx.maxPoints) !== null;
}

/** Same validation the old Save button ran, as data instead of side effects. */
export function buildGradeFromDraft(
  draft: GradeDraft,
  ctx: GradeDraftContext,
  now: number = Date.now()
): BuildGradeResult {
  if (ctx.kind === 'media' && ctx.captureUnavailable) {
    if (draft.adjudication === 'none')
      return { ok: false, error: 'chooseOutcome' };
    if (draft.adjudication === 'substitute' && !draft.comment.trim())
      return { ok: false, error: 'noteRequired' };
    const raw =
      draft.adjudication === 'substitute'
        ? Number(draft.pointsInput.trim() || '0')
        : 0;
    if (!Number.isFinite(raw)) return { ok: false, error: 'numericScore' };
    return {
      ok: true,
      grade: {
        pointsAwarded: clampPoints(raw, ctx.maxPoints),
        ...(draft.adjudication === 'excuse' ? { excused: true } : {}),
        ...(draft.adjudication === 'substitute'
          ? { overallComment: draft.comment.trim() }
          : {}),
        gradedBy: ctx.teacherUid,
        gradedAt: now,
      },
    };
  }

  const trimmed = draft.pointsInput.trim();
  let points: number;
  if (trimmed === '') {
    // A rubric with any selection banks its running sum, no typed total needed.
    if (!rubricActive(ctx) || draft.rubricScores.length === 0)
      return { ok: false, error: 'numericScore' };
    points = clampPoints(
      sumRubricScorePoints(draft.rubricScores),
      ctx.maxPoints
    );
  } else {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return { ok: false, error: 'numericScore' };
    if (parsed < 0 || parsed > ctx.maxPoints)
      return { ok: false, error: 'range' };
    points = parsed;
  }
  const rubricScores =
    draft.rubricScores.length > 0 ? draft.rubricScores : undefined;

  if (ctx.kind === 'media') {
    const cleaned = draft.annotations.filter((a) => (a.comment ?? '').trim());
    return {
      ok: true,
      grade: {
        pointsAwarded: points,
        overallComment: draft.comment.trim() || undefined,
        annotations: cleaned.length > 0 ? cleaned : undefined,
        // Timeline comments are milliseconds, not character offsets.
        ...(cleaned.length > 0 ? { annotationUnit: 'ms' as const } : {}),
        rubricScores,
        gradedTakeIndex: ctx.gradedTakeIndex,
        gradedBy: ctx.teacherUid,
        gradedAt: now,
      },
    };
  }

  // The snapshot freezes on the first annotated save so offsets stay anchored.
  const hasAnnotations = draft.annotations.length > 0;
  if (hasAnnotations && !ctx.existingSnapshot && !ctx.answerText.trim())
    return { ok: false, error: 'emptyAnnotations' };
  return {
    ok: true,
    grade: {
      pointsAwarded: points,
      overallComment: draft.comment.trim() || undefined,
      annotations: hasAnnotations ? draft.annotations : undefined,
      gradingSnapshot: hasAnnotations
        ? (ctx.existingSnapshot ?? sanitizeQuizResponse(ctx.answerText))
        : ctx.existingSnapshot,
      rubricScores,
      gradedBy: ctx.teacherUid,
      gradedAt: now,
    },
  };
}
