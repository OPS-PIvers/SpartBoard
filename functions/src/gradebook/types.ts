// Server-side shapes for the grade index; the shared row, mark and settings shapes live in ../gradebookCore.
import type {
  GradeAttempt,
  GradeIndexRow,
  GradebookKind,
  TargetEvidence,
} from '../gradebookCore';

export type GradeKind = GradebookKind;

/** Builder state; `in-progress` is stored as `not-attempted` (or the previous attempt during a retake). */
export type BuildState =
  | 'scored'
  | 'awaiting-grade'
  | 'not-attempted'
  | 'in-progress';

/** A stored attempt, numbered so a regrade replaces the same attempt. */
export interface IndexAttempt extends GradeAttempt {
  n: number;
}

/** `grade_index` as the server writes it: the shared row plus lookup fields. */
export interface IndexRow extends GradeIndexRow {
  attempts: IndexAttempt[];
  /** The teacher's assignment id; differs from `sessionId` only for mini-apps. */
  assignmentId: string;
  /** The class this student's work came from, when known. */
  classId: string | null;
  /** The roster that class maps to, for per-class settings lookups. */
  rosterId: string | null;
  schemaVersion: number;
}

/** Row fields the per-kind builders compute; the rest come from the session. */
export interface RowScore {
  rawPct: number | null;
  points: number | null;
  max: number | null;
  state: BuildState;
  submittedAt: number | null;
  targetEvidence: TargetEvidence[];
  published: boolean;
  classId: string | null;
  /** Current attempt number when the kind counts attempts; null otherwise. */
  attemptNumber: number | null;
}

export interface SessionMeta {
  kind: GradeKind;
  sessionId: string;
  assignmentId: string;
  ownerUid: string;
  title: string;
  rosterIds: string[];
  classIds: string[];
  openAt: number | null;
  dueAt: number | null;
  closeAt: number | null;
  createdAt: number | null;
  individualTargeting: boolean;
  /** `classId → rosterId` from `periodAccess`, for per-class due dates. */
  rosterIdByClassId: Record<string, string>;
  /** Per-class due dates (quiz `dueAtByRosterId`, mini-app `dueAtByClassId`). */
  dueAtByRosterId: Record<string, number>;
  dueAtByClassId: Record<string, number>;
}
