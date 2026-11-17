// Teacher grading of Writing assignments (WRITING_ASSIGNMENT.md D12-D14): result rows, scores and feedback payloads.
import type {
  WrittenAnswerAnnotation,
  WrittenAnswerRubricScore,
  WritingDraft,
  WritingFeedback,
  WritingGrade,
  WritingGrading,
  WritingResponse,
  WritingResponseStatus,
} from '@/types';
import { sumRubricScorePoints } from '@/utils/rubricPoints';
import { stableStringify } from '@/utils/stableStringify';
import { writingGradingMax } from '@/utils/writingResponseState';
import { parsePoints } from '@/utils/gradeDraft';

export interface WritingStudentName {
  givenName: string;
  familyName: string;
}

export type WritingRowState = 'not-started' | WritingResponseStatus;

export const WRITING_ROW_LABELS: Record<WritingRowState, string> = {
  'not-started': 'Not started',
  draft: 'Writing',
  'turned-in': 'Turned in',
  returned: 'Returned',
  revising: 'Revising',
};

export interface WritingResultRow {
  studentUid: string;
  /** "Last, First", or a fallback when the roster has no name for this student. */
  name: string;
  sortKey: string;
  state: WritingRowState;
  response: WritingResponse | null;
}

export const isGradable = (row: WritingResultRow): boolean =>
  (row.response?.draftCount ?? 0) > 0 &&
  typeof row.response?.latestDraftId === 'string';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

/** "Last, First"; either half may be missing. */
export function writingStudentLabel(name: WritingStudentName | undefined): {
  label: string;
  sortKey: string;
} | null {
  const first = name?.givenName.trim() ?? '';
  const last = name?.familyName.trim() ?? '';
  if (!first && !last) return null;
  return {
    label: first && last ? `${last}, ${first}` : last || first,
    sortKey: `${last}\u0000${first}`,
  };
}

/** Every named student plus every response, sorted by last name; unnamed responses go last. */
export function buildWritingRows(
  responses: readonly WritingResponse[],
  names: ReadonlyMap<string, WritingStudentName>
): WritingResultRow[] {
  const byUid = new Map(responses.map((r) => [r.studentUid, r]));
  const uids = new Set<string>([...names.keys(), ...byUid.keys()]);
  let unnamed = 0;
  const rows: WritingResultRow[] = [];
  for (const uid of uids) {
    const response = byUid.get(uid) ?? null;
    const label = writingStudentLabel(names.get(uid));
    rows.push({
      studentUid: uid,
      name: label?.label ?? `Student ${++unnamed}`,
      sortKey: label ? `0${label.sortKey}` : `1${uid}`,
      state: response ? response.status : 'not-started',
      response,
    });
  }
  return rows.sort((a, b) => collator.compare(a.sortKey, b.sortKey));
}

/** The total a score is out of, as the server counts it; null when ungraded. */
export const writingMaxPoints = (grading: WritingGrading): number | null =>
  writingGradingMax(grading);

/** "18 / 20", "Excused", or null when there is no score. */
export function formatWritingScore(
  grade:
    | Pick<WritingGrade, 'pointsAwarded' | 'excused' | 'rubricScores'>
    | undefined,
  max: number | null
): string | null {
  if (!grade) return null;
  if (grade.excused) return 'Excused';
  const points =
    grade.pointsAwarded ??
    (grade.rubricScores ? sumRubricScorePoints(grade.rubricScores) : undefined);
  if (points === undefined) return null;
  return max === null ? String(points) : `${points} / ${max}`;
}

/** What the grader holds for one frozen copy. */
export interface WritingFeedbackForm {
  pointsInput: string;
  comment: string;
  annotations: WrittenAnswerAnnotation[];
  rubricScores: WrittenAnswerRubricScore[];
  excused: boolean;
}

export function feedbackForm(
  feedback: WritingFeedback | undefined
): WritingFeedbackForm {
  return {
    pointsInput:
      typeof feedback?.pointsAwarded === 'number'
        ? String(feedback.pointsAwarded)
        : '',
    comment: feedback?.overallComment ?? '',
    annotations: feedback?.annotations ?? [],
    rubricScores: feedback?.rubricScores ?? [],
    excused: feedback?.excused === true,
  };
}

export type WritingFeedbackPayload = Omit<
  WritingFeedback,
  'gradedBy' | 'gradedAt'
>;

export type WritingFeedbackBuild =
  | { ok: true; feedback: WritingFeedbackPayload }
  | { ok: false; error: 'range' };

/** The callable's `feedback`; a rubric with no typed total banks its running sum. */
export function buildWritingFeedback(
  form: WritingFeedbackForm,
  grading: WritingGrading
): WritingFeedbackBuild {
  const out: WritingFeedbackPayload = {};
  const comment = form.comment.trim();
  if (comment) out.overallComment = comment;
  if (form.annotations.length > 0) out.annotations = form.annotations;
  const max = writingMaxPoints(grading);
  if (max === null) return { ok: true, feedback: out };
  if (form.excused) return { ok: true, feedback: { ...out, excused: true } };
  if (grading.mode === 'rubric' && form.rubricScores.length > 0)
    out.rubricScores = form.rubricScores;
  if (form.pointsInput.trim() !== '') {
    const points = parsePoints(form.pointsInput, max);
    if (points === null) return { ok: false, error: 'range' };
    out.pointsAwarded = points;
  } else if (out.rubricScores) {
    out.pointsAwarded = Math.min(sumRubricScorePoints(out.rubricScores), max);
  }
  return { ok: true, feedback: out };
}

const stable = (v: unknown): string => stableStringify(v ?? null);

/** The form differs from what is saved on the copy. */
export function feedbackFormDirty(
  form: WritingFeedbackForm,
  saved: WritingFeedback | undefined
): boolean {
  const base = feedbackForm(saved);
  return (
    form.pointsInput.trim() !== base.pointsInput ||
    form.comment.trim() !== base.comment.trim() ||
    form.excused !== base.excused ||
    stable(form.annotations) !== stable(base.annotations) ||
    stable(form.rubricScores) !== stable(base.rubricScores)
  );
}

/** A copy with a score or any written feedback. */
export function draftHasFeedback(
  draft: Pick<WritingDraft, 'feedback'>
): boolean {
  const f = draft.feedback;
  if (!f) return false;
  return (
    typeof f.pointsAwarded === 'number' ||
    f.excused === true ||
    (f.rubricScores?.length ?? 0) > 0 ||
    (f.annotations?.length ?? 0) > 0 ||
    Boolean(f.overallComment?.trim())
  );
}

/** Copies newest first; the order the grader lists them in. */
export function sortDraftsNewestFirst<
  T extends { number: number; seq?: number },
>(drafts: readonly T[]): T[] {
  return [...drafts].sort((a, b) => (b.seq ?? b.number) - (a.seq ?? a.number));
}

/** Why a feedback or return call was refused, from the callable error's details. */
export function writingCallReason(err: unknown): string | null {
  const details = (err as { details?: unknown } | null)?.details;
  const reason = (details as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' ? reason : null;
}
