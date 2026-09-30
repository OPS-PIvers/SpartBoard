// Server mirrors of the gradebook shapes (docs/plans/GRADEBOOK.md data model); functions cannot import root types.ts.

export type GradeKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'flashcards'
  | 'projects'
  | 'mini-app'
  | 'activity-wall';

/** RR-06 states; `in-progress` is a started attempt with nothing submitted yet. */
export type GradeState =
  | 'scored'
  | 'awaiting-grade'
  | 'not-attempted'
  | 'in-progress';

export interface GradeAttempt {
  /** 1-based attempt number. */
  n: number;
  pct: number | null;
  points: number | null;
  max: number | null;
  submittedAt: number | null;
}

export interface TargetEvidence {
  targetId: string;
  kind: string;
  label: string;
  code?: string;
  standardIds?: string[];
  parentId?: string;
  parentLabel?: string;
  earned: number;
  possible: number;
}

/** `grade_index/{sessionId}__{studentUid}` (D10, D11, D15, D25). */
export interface GradeIndexRow {
  kind: GradeKind;
  sessionId: string;
  /** The teacher's assignment id; differs from `sessionId` only for mini-apps. */
  assignmentId: string;
  ownerUid: string;
  editorUids: string[];
  rosterIds: string[];
  classIds: string[];
  /** The class this student's work came from, when known. */
  classId: string | null;
  /** The roster that class maps to, for per-class settings lookups. */
  rosterId: string | null;
  studentUid: string;
  title: string;
  /** Mini-app and Activity Wall: a checkmark column, never averaged (D6). */
  completionOnly: boolean;
  rawPct: number | null;
  points: number | null;
  max: number | null;
  state: GradeState;
  submittedAt: number | null;
  openAt: number | null;
  dueAt: number | null;
  closeAt: number | null;
  /** D15 auto-Late input: submitted after the due date. */
  late: boolean;
  attempts: GradeAttempt[];
  targetEvidence: TargetEvidence[];
  published: boolean;
  /** D25: false when individual targeting leaves this student out. */
  assigned: boolean;
  schemaVersion: number;
  updatedAt: number;
}

/** Row fields the per-kind builders compute; the rest come from the session. */
export type RowScore = Pick<
  GradeIndexRow,
  | 'rawPct'
  | 'points'
  | 'max'
  | 'state'
  | 'submittedAt'
  | 'targetEvidence'
  | 'published'
  | 'classId'
> & {
  /** Current attempt number when the kind counts attempts; null otherwise. */
  attemptNumber: number | null;
};

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
  individualTargeting: boolean;
  /** `classId → rosterId` from `periodAccess`, for per-class due dates. */
  rosterIdByClassId: Record<string, string>;
  /** Per-class due dates (quiz `dueAtByRosterId`, mini-app `dueAtByClassId`). */
  dueAtByRosterId: Record<string, number>;
  dueAtByClassId: Record<string, number>;
}

export type AttemptPolicy = 'latest' | 'highest' | 'average';

/** `gradebook_columns/{sessionId}` subset the server reads (D22). */
export interface GradebookColumnMirror {
  maxPointsOverride: number | null;
  attemptPolicy: AttemptPolicy;
  countsTowardOverall: boolean;
}

/** `gradebook_marks/{sessionId}__{studentUid}` subset the server reads (D9). */
export interface GradebookMarkMirror {
  override: { points: number } | null;
  comment: { text: string; shared: boolean } | null;
  flags: string[];
  suppressedAuto: string[];
  /** true / false forces this student's publish state; null follows the column. */
  publishOverride: boolean | null;
}

export type FlagVisibility = 'off' | 'teacher' | 'students';

export interface GradebookFlagMirror {
  id: string;
  key: string;
  name: string;
  color: string;
  /** Percent a flagged cell with no score gets; null has no effect. */
  value: number | null;
  /** Excused: leaves the cell out of averages and beats every value. */
  excludes: boolean;
  visibility: FlagVisibility;
}

export interface GradebookConfigMirror {
  flags: GradebookFlagMirror[];
  autoFlags: boolean;
  studentVisibility: {
    scores: boolean;
    flags: boolean;
    comments: boolean;
    standards: boolean;
  };
}
