/**
 * Per-slot grading for media (audio) responses.
 *
 * Grades live in the same `QuizResponse.grading` map written by the
 * short/essay grader. An unsuffixed key is the primary slot, so every grade
 * written before this file existed keeps its exact meaning; any other slot is
 * `${questionId}::${slot}`. Nothing here engages unless the question carries a
 * `recording` block, so a response with no media grades exactly as before.
 */

import {
  type ArtifactArchiveEntry,
  type ArtifactSlot,
  type GradeResult,
  type QuizQuestion,
  type QuizResponseAnswer,
  type ResponseArtifact,
  type WrittenAnswerGrade,
} from '@/types';
import {
  artifactCountsAsTake,
  isArtifactPlayable,
  selectPlaybackTake,
} from '@/utils/responseArtifacts';

const SLOT_SEP = '::';

/** `m:ss` for a millisecond offset into a take. */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Composite grading-map key. Primary is unsuffixed, for backward compat. */
export function gradingKey(questionId: string, slot: ArtifactSlot): string {
  return slot === 'primary' ? questionId : `${questionId}${SLOT_SEP}${slot}`;
}

/** Inverse of {@link gradingKey}; an unsuffixed key reads as the primary slot. */
export function parseGradingKey(key: string): {
  questionId: string;
  slot: ArtifactSlot;
} {
  const at = key.lastIndexOf(SLOT_SEP);
  if (at < 0) return { questionId: key, slot: 'primary' };
  const suffix = key.slice(at + SLOT_SEP.length);
  if (suffix !== 'addendum' && suffix !== 'primary') {
    return { questionId: key, slot: 'primary' };
  }
  return { questionId: key.slice(0, at), slot: suffix };
}

/** Read one slot's grade through the key helper. */
export function readSlotGrade(
  grading: Record<string, WrittenAnswerGrade> | undefined,
  questionId: string,
  slot: ArtifactSlot = 'primary'
): WrittenAnswerGrade | undefined {
  return grading?.[gradingKey(questionId, slot)];
}

/**
 * Does THIS slot need a human? Per-slot and per-response, unlike the
 * per-question `isWrittenQuestionType`, which keeps its own call sites.
 */
export function slotNeedsManualGrading(
  question: Pick<QuizQuestion, 'type' | 'recording'> | undefined,
  artifact: Pick<ResponseArtifact, 'kind' | 'slot'> | undefined
): boolean {
  if (!artifact) return false;
  if (artifact.kind === 'audio' || artifact.kind === 'video') return true;
  if (artifact.kind === 'text') return artifact.slot === 'addendum';
  return false;
}

/** True when the question opted into media capture at authoring time. */
export function questionHasRecordingSlot(
  question: Pick<QuizQuestion, 'recording'> | undefined
): boolean {
  return !!question?.recording;
}

/** One committed take of one slot, newest first in {@link MediaGradingSlot.takes}. */
export interface MediaTake {
  takeIndex: number;
  /** 1-based position among the visible takes; what any "Take N" label shows. */
  displayIndex: number;
  answeredAt: number;
  artifact: ResponseArtifact;
  archive?: ArtifactArchiveEntry;
  /** Archived to Drive and still there — the only state that plays. */
  playable: boolean;
}

export interface MediaGradingSlot {
  questionId: string;
  slot: ArtifactSlot;
  /** Key into `QuizResponse.grading`. */
  key: string;
  /** Committed takes, highest `takeIndex` first. */
  takes: MediaTake[];
  /** Capture was never available to this student and no take exists. */
  captureUnavailable: boolean;
  grade?: WrittenAnswerGrade;
}

/** Minimum response shape the slot collector reads. */
export interface MediaGradingResponse {
  answers?: QuizResponseAnswer[];
  grading?: Record<string, WrittenAnswerGrade>;
  artifactArchive?: Record<string, ArtifactArchiveEntry>;
}

/**
 * Every gradeable slot of one question for one response. Returns nothing for a
 * question with no `recording` block — the whole media path stays dormant.
 */
export function collectMediaSlots(
  question: Pick<QuizQuestion, 'id' | 'type' | 'recording'>,
  response: MediaGradingResponse
): MediaGradingSlot[] {
  if (!questionHasRecordingSlot(question)) return [];
  const entries = (response.answers ?? []).filter(
    (a) => a.questionId === question.id
  );
  const bySlot = new Map<ArtifactSlot, MediaTake[]>();
  for (const entry of entries) {
    if (entry.unresponded) continue;
    for (const artifact of entry.artifacts ?? []) {
      if (!slotNeedsManualGrading(question, artifact)) continue;
      const archive = response.artifactArchive?.[artifact.id];
      // The archive map is authoritative: a swept-up take is still a take.
      if (!artifactCountsAsTake(artifact, archive)) continue;
      const list = bySlot.get(artifact.slot) ?? [];
      list.push({
        takeIndex: entry.takeIndex ?? 0,
        displayIndex: 0,
        answeredAt: entry.answeredAt ?? 0,
        artifact,
        archive,
        playable: isArtifactPlayable(archive),
      });
      bySlot.set(artifact.slot, list);
    }
  }
  const captureUnavailable = entries.some(
    (a) => a.unresponded === 'capture-unavailable'
  );

  const slots: ArtifactSlot[] = ['primary', 'addendum'];
  const out: MediaGradingSlot[] = [];
  for (const slot of slots) {
    const takes = (bySlot.get(slot) ?? []).sort(
      (a, b) => b.takeIndex - a.takeIndex || a.answeredAt - b.answeredAt
    );
    // Newest first, so position counts up from the end of the list.
    takes.forEach((take, i) => {
      take.displayIndex = takes.length - i;
    });
    const unavailable =
      slot === 'primary' && captureUnavailable && !takes.length;
    const grade = readSlotGrade(response.grading, question.id, slot);
    if (!takes.length && !unavailable && !grade) continue;
    out.push({
      questionId: question.id,
      slot,
      key: gradingKey(question.id, slot),
      takes,
      captureUnavailable: unavailable,
      grade,
    });
  }
  return out;
}

/** The take a manual grade is about: the pinned one, else the winner. */
export function selectGradedTake(
  slot: MediaGradingSlot
): MediaTake | undefined {
  const pinned = slot.grade?.gradedTakeIndex;
  if (pinned != null) {
    const hit = slot.takes.find((t) => t.takeIndex === pinned);
    if (hit) return hit;
  }
  return slot.takes[0];
}

/** The teacher excused this slot: terminal, and worth no points either way. */
export function isSlotExcused(slot: MediaGradingSlot): boolean {
  return !!slot.grade?.excused;
}

/**
 * Lifecycle state of one slot, mapped onto the shipped `GradeState` tri-state.
 *
 * `excused` is TERMINAL, not pending: it reads `scored` and carries zero
 * points over a zero maximum, so it neither holds up publishing nor lands in
 * the gradebook. On a `capture-unavailable` slot the teacher's adjudication is
 * encoded by the grade itself: no grade is still pending, a grade with a note
 * is the offline substitute (`scored`), and a grade without one is Blank
 * (`not-attempted`, a real 0).
 */
export function resolveSlotState(
  slot: MediaGradingSlot,
  /** Auto/manual state this slot would replace; a provisional base wins. */
  baseState?: GradeResult['state']
): GradeResult['state'] {
  if (isSlotExcused(slot)) return 'scored';
  const resolved = resolveSlotStateRaw(slot);
  // A partial rubric save is `awaiting-grade` in `base`; a grade existing on
  // the slot must not promote it to `scored`.
  if (resolved === 'scored' && baseState === 'awaiting-grade')
    return 'awaiting-grade';
  return resolved;
}

function resolveSlotStateRaw(slot: MediaGradingSlot): GradeResult['state'] {
  if (slot.captureUnavailable) {
    if (!slot.grade) return 'awaiting-grade';
    return slot.grade.overallComment?.trim() ? 'scored' : 'not-attempted';
  }
  if (slot.takes.length === 0) return slot.grade ? 'scored' : 'not-attempted';
  return slot.grade ? 'scored' : 'awaiting-grade';
}

function slotPoints(slot: MediaGradingSlot, maxPoints: number): number {
  if (isSlotExcused(slot)) return 0;
  if (resolveSlotState(slot) !== 'scored') return 0;
  return Math.max(0, Math.min(maxPoints, slot.grade?.pointsAwarded ?? 0));
}

/**
 * Is this question excused for this student? An excused slot leaves the
 * student's denominator, so their percentage is computed over what remains.
 */
export function isQuestionExcused(
  question: Pick<QuizQuestion, 'id' | 'type' | 'recording'>,
  response: MediaGradingResponse
): boolean {
  if (!questionHasRecordingSlot(question)) return false;
  const slots = collectMediaSlots(question, response);
  const primary = slots.find((s) => s.slot === 'primary');
  return !!primary && isSlotExcused(primary);
}

/** Points this question contributes to ONE student's denominator. */
export function questionPointsFor(
  question: Pick<QuizQuestion, 'id' | 'type' | 'points' | 'recording'>,
  response: MediaGradingResponse
): number {
  return isQuestionExcused(question, response) ? 0 : (question.points ?? 1);
}

/**
 * Fold a question's media slots into the auto-graded result for its text
 * answer. A media primary slot REPLACES the auto result (a recording answer's
 * text slot is legitimately empty, so the auto path would score a silent 0);
 * an addendum slot ADDS to it, clamped so the question can never exceed its
 * own `points`. Returns `base` untouched for any question with no `recording`.
 */
export function applyMediaSlots(
  question: Pick<QuizQuestion, 'id' | 'type' | 'points' | 'recording'>,
  response: MediaGradingResponse,
  base: GradeResult
): GradeResult {
  const slots = collectMediaSlots(question, response);
  if (slots.length === 0) return base;
  const max = question.points ?? 1;

  const primary = slots.find((s) => s.slot === 'primary');
  const addendum = slots.find((s) => s.slot === 'addendum');
  // Media only owns the primary slot when the student actually recorded (or
  // could not); a bare grade on it is the ordinary written grade `base`
  // already accounts for, rubric completeness included.
  const primaryIsMedia =
    !!primary && (primary.takes.length > 0 || primary.captureUnavailable);

  // An excused primary is out of this student's total entirely: 0 of 0.
  if (primary && isSlotExcused(primary)) {
    return {
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 0,
      state: 'scored',
      excused: true,
    };
  }

  let points =
    primaryIsMedia && primary ? slotPoints(primary, max) : base.pointsEarned;
  let state: GradeResult['state'] =
    primaryIsMedia && primary
      ? resolveSlotState(primary, base.state)
      : base.state;

  if (addendum) {
    points += slotPoints(addendum, max);
    const addendumState = resolveSlotState(addendum);
    if (addendumState === 'awaiting-grade') state = 'awaiting-grade';
    else if (state === 'not-attempted' && addendumState === 'scored')
      state = 'scored';
  }

  const earned = Math.max(0, Math.min(max, points));
  return {
    isCorrect: max > 0 && earned === max,
    pointsEarned: earned,
    pointsMax: max,
    state,
  };
}

/** Human-facing reason a take cannot be played right now, or null. */
export type TakeUnplayableReason =
  | 'archiving'
  | 'archive-failed'
  | 'lost'
  | 'deleted'
  | 'unknown';

export function takeUnplayableReason(
  take: MediaTake | undefined
): TakeUnplayableReason | null {
  if (!take) return 'unknown';
  if (take.playable) return null;
  const status = take.archive?.archiveStatus;
  if (!status || status === 'syncing' || status === 'archived')
    return 'archiving';
  // 'failed' is still retrying; 'lost' is terminal and needs its own copy.
  if (status === 'lost') return 'lost';
  if (status === 'failed') return 'archive-failed';
  if (
    status === 'deleting' ||
    status === 'deleted' ||
    status === 'delete-failed'
  )
    return 'deleted';
  return 'unknown';
}

/**
 * Interim provisional detector for recording slots: a committed audio take
 * with no `grading` entry is still owed a teacher grade.
 */
export function hasUngradedRecording(
  answers: readonly QuizResponseAnswer[],
  grading: Record<string, unknown> | undefined,
  questionIds: readonly string[],
  archive?: Record<string, ArtifactArchiveEntry>
): boolean {
  return questionIds.some((questionId) => {
    const take = selectPlaybackTake(
      answers,
      questionId,
      'primary',
      undefined,
      archive
    );
    if (!take) return false;
    return grading?.[gradingKey(questionId, take.artifact.slot)] == null;
  });
}
