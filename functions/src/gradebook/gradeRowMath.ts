// Pure builders for grade index rows, one per activity kind (docs/plans/GRADEBOOK.md D10, D11, D15, D25).
import {
  gradeGroupAnswer,
  parsePublicQuestion,
  parseSyncedQuestion,
  selectRepresentativeAnswers,
  type GroupQuestion,
  type ManualGrade,
  type QuestionTargetSnapshot,
  type RawAnswer,
} from '../plcAssessmentMath';
import { parseCompletedResponse } from '../recomputePlcAssessments';
import { notChosenIds, parseChooseSections } from '../quizSectionsChosen';
import type {
  GradeAttempt,
  GradeIndexRow,
  GradeKind,
  GradeState,
  RowScore,
  SessionMeta,
  TargetEvidence,
} from './types';

export const GRADE_INDEX_SCHEMA_VERSION = 1;

type Doc = Record<string, unknown>;

const asRecord = (v: unknown): Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Doc) : {};
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Millis from a number, Firestore Timestamp or ISO string; null otherwise. */
export function toMillis(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.length > 0) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  const r = asRecord(v);
  if (typeof r.toMillis === 'function') return (r.toMillis as () => number)();
  if (typeof r.seconds === 'number') return r.seconds * 1000;
  if (typeof r._seconds === 'number') return r._seconds * 1000;
  return null;
}

function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(asRecord(v))) {
    const ms = toMillis(raw);
    if (ms !== null) out[k] = ms;
  }
  return out;
}

const TITLE_FIELDS: Record<GradeKind, string[]> = {
  quiz: ['quizTitle', 'title'],
  'video-activity': ['assignmentName', 'activityTitle', 'title'],
  'guided-learning': ['title'],
  flashcards: ['title'],
  projects: ['title'],
  'mini-app': ['assignmentName', 'appTitle', 'title'],
  'activity-wall': ['title', 'prompt'],
};

/** Session fields every row carries; `assignment` supplies quiz per-class due dates. */
export function parseSessionMeta(
  kind: GradeKind,
  sessionId: string,
  session: Doc,
  assignment: Doc = {}
): SessionMeta {
  const rosterIdByClassId: Record<string, string> = {};
  for (const [classId, p] of Object.entries(asRecord(session.periodAccess))) {
    const rosterId = asString(asRecord(p).rosterId);
    if (rosterId) rosterIdByClassId[classId] = rosterId;
  }
  const classIds = [
    ...new Set([
      ...asStrings(session.classIds),
      ...asStrings([session.classId]),
    ]),
  ];
  const title =
    TITLE_FIELDS[kind].map((f) => asString(session[f])).find((t) => t) ?? '';
  return {
    kind,
    sessionId,
    assignmentId:
      kind === 'mini-app'
        ? asString(session.assignmentId) || sessionId
        : sessionId,
    ownerUid: asString(session.teacherUid),
    title,
    rosterIds: asStrings(session.rosterIds),
    classIds,
    openAt: toMillis(session.openAt),
    dueAt: toMillis(session.dueAt),
    closeAt: toMillis(session.closeAt),
    individualTargeting: session.individualTargeting === true,
    rosterIdByClassId,
    dueAtByRosterId: numberMap(assignment.dueAtByRosterId),
    dueAtByClassId: numberMap(session.dueAtByClassId),
  };
}

/** Pointer override beats the class's due date, which beats the session's. */
export function effectiveDueAt(
  meta: SessionMeta,
  classId: string | null,
  pointerDueAt: number | null
): number | null {
  if (pointerDueAt !== null) return pointerDueAt;
  if (classId) {
    if (meta.dueAtByClassId[classId] !== undefined)
      return meta.dueAtByClassId[classId];
    const rosterId = meta.rosterIdByClassId[classId];
    if (rosterId && meta.dueAtByRosterId[rosterId] !== undefined)
      return meta.dueAtByRosterId[rosterId];
  }
  return meta.dueAt;
}

/** Adds this attempt's score to the ledger kept on the row; a regrade replaces the same attempt. */
export function mergeAttempts(
  previous: readonly GradeAttempt[],
  score: RowScore
): GradeAttempt[] {
  if (score.state !== 'scored' && score.state !== 'awaiting-grade') {
    return [...previous].filter((a) => a.n < (score.attemptNumber ?? 1));
  }
  const n = score.attemptNumber ?? 1;
  const current: GradeAttempt = {
    n,
    pct: score.rawPct,
    points: score.points,
    max: score.max,
    submittedAt: score.submittedAt,
  };
  return [...previous.filter((a) => a.n !== n), current].sort(
    (a, b) => a.n - b.n
  );
}

export interface AssembleInput {
  meta: SessionMeta;
  studentUid: string;
  score: RowScore;
  previousAttempts: readonly GradeAttempt[];
  assigned: boolean;
  pointerDueAt: number | null;
  now: number;
}

export function assembleRow(input: AssembleInput): GradeIndexRow {
  const { meta, score } = input;
  const completionOnly =
    meta.kind === 'mini-app' || meta.kind === 'activity-wall';
  const classId =
    score.classId ?? (meta.classIds.length === 1 ? meta.classIds[0] : null);
  const dueAt = effectiveDueAt(meta, classId, input.pointerDueAt);
  const attempts = completionOnly
    ? []
    : mergeAttempts(input.previousAttempts, score);
  return {
    kind: meta.kind,
    sessionId: meta.sessionId,
    assignmentId: meta.assignmentId,
    ownerUid: meta.ownerUid,
    editorUids: [],
    rosterIds: meta.rosterIds,
    classIds: meta.classIds,
    classId,
    rosterId:
      (classId ? meta.rosterIdByClassId[classId] : undefined) ??
      (meta.rosterIds.length === 1 ? meta.rosterIds[0] : null),
    studentUid: input.studentUid,
    title: meta.title,
    completionOnly,
    rawPct: score.rawPct,
    points: score.points,
    max: score.max,
    state: score.state,
    submittedAt: score.submittedAt,
    openAt: meta.openAt,
    dueAt,
    closeAt: meta.closeAt,
    late:
      score.submittedAt !== null && dueAt !== null && score.submittedAt > dueAt,
    attempts,
    targetEvidence: score.targetEvidence,
    published: score.published,
    assigned: input.assigned,
    schemaVersion: GRADE_INDEX_SCHEMA_VERSION,
    updatedAt: input.now,
  };
}

// ── Question-based scoring (quiz, video activity) ─────────────────────────

function addEvidence(
  acc: Map<string, TargetEvidence>,
  targets: readonly QuestionTargetSnapshot[],
  earned: number,
  possible: number
): void {
  for (const t of targets) {
    const row = acc.get(t.id) ?? {
      targetId: t.id,
      kind: t.kind,
      label: t.label,
      ...(t.code ? { code: t.code } : {}),
      ...(t.standardIds?.length ? { standardIds: t.standardIds } : {}),
      ...(t.parentId ? { parentId: t.parentId } : {}),
      ...(t.parentLabel ? { parentLabel: t.parentLabel } : {}),
      earned: 0,
      possible: 0,
    };
    row.earned = round2(row.earned + earned);
    row.possible = round2(row.possible + possible);
    acc.set(t.id, row);
  }
}

export interface QuestionScoreInput {
  questions: GroupQuestion[];
  answers: RawAnswer[];
  servedQuestionIds?: string[];
  manualGrades?: Record<string, ManualGrade>;
  fibAnswersByQuestion?: Record<string, string[]>;
  sectionsRaw?: unknown;
  /** Video activity: grade from the stored `isCorrect` when the key is missing. */
  useStoredCorrectness?: boolean;
}

export interface QuestionScore {
  earned: number;
  max: number;
  awaiting: boolean;
  noKey: boolean;
  evidence: TargetEvidence[];
}

/** Points, max and per-target evidence for one attempt over its served questions. */
export function scoreQuestions(input: QuestionScoreInput): QuestionScore {
  const served = input.servedQuestionIds?.length
    ? new Set(input.servedQuestionIds)
    : new Set(input.questions.map((q) => q.id));
  const notChosen = notChosenIds(
    parseChooseSections(input.sectionsRaw),
    input.answers,
    input.servedQuestionIds?.length ? input.servedQuestionIds : undefined
  );
  const representative = selectRepresentativeAnswers(input.answers);
  const evidence = new Map<string, TargetEvidence>();
  let earned = 0;
  let max = 0;
  let awaiting = false;
  let noKey = false;
  for (const q of input.questions) {
    if (!served.has(q.id) || notChosen.has(q.id)) continue;
    const answer = representative.get(q.id);
    let pointsEarned: number;
    let state: string;
    if (input.useStoredCorrectness && q.correctAnswer === null) {
      pointsEarned = answer?.isCorrect === true ? q.points : 0;
      state = answer ? 'scored' : 'not-attempted';
    } else {
      const g = gradeGroupAnswer(
        q,
        answer?.answer ?? '',
        input.manualGrades?.[q.id],
        q.type === 'FIB' ? input.fibAnswersByQuestion?.[q.id] : undefined
      );
      pointsEarned = g.pointsEarned;
      state = g.state;
    }
    if (state === 'no-key') noKey = true;
    if (state === 'awaiting-grade') {
      awaiting = true;
      max += q.points;
      continue;
    }
    earned += pointsEarned;
    max += q.points;
    // Evidence only from graded work; unanswered questions still count against the target.
    if (state !== 'no-key')
      addEvidence(evidence, q.targets, pointsEarned, q.points);
  }
  return {
    earned: round2(earned),
    max: round2(max),
    awaiting,
    noKey,
    evidence: [...evidence.values()].sort((a, b) =>
      a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0
    ),
  };
}

/** Key questions, with teacher-private tags from the assignment snapshot filled in. */
export function keyQuestions(
  keyRaw: unknown,
  snapshotRaw: unknown = [],
  publicRaw: unknown = []
): GroupQuestion[] {
  const snapshotTargets = new Map<string, GroupQuestion['targets']>();
  for (const entry of Array.isArray(snapshotRaw) ? snapshotRaw : []) {
    const parsed = parsePublicQuestion(entry);
    if (parsed && parsed.targets.length > 0)
      snapshotTargets.set(parsed.id, parsed.targets);
  }
  const fromKey = (Array.isArray(keyRaw) ? keyRaw : [])
    .map(parseSyncedQuestion)
    .filter((q): q is GroupQuestion => q !== null);
  const base =
    fromKey.length > 0
      ? fromKey
      : (Array.isArray(publicRaw) ? publicRaw : [])
          .map(parsePublicQuestion)
          .filter((q): q is GroupQuestion => q !== null);
  const seen = new Set<string>();
  return base
    .filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)))
    .map((q) =>
      q.targets.length === 0 && snapshotTargets.has(q.id)
        ? { ...q, targets: snapshotTargets.get(q.id) ?? [] }
        : q
    );
}

function pctOf(earned: number, max: number): number | null {
  return max > 0 ? Math.round((earned / max) * 100) : null;
}

/** Per-student publish: a `resultsOverride` wins over the session's publish state. */
export function isPublished(session: Doc, perStudent: Doc): boolean {
  const mode = asString(asRecord(perStudent.resultsOverride).mode);
  if (mode === 'shown') return true;
  if (mode === 'hidden') return false;
  return toMillis(session.scorePublishedAt) !== null;
}

export interface QuizContext {
  questions: GroupQuestion[];
  fibAnswersByStudent: (studentUid: string) => Record<string, string[]>;
  overrideQuestionIds: (studentUid: string) => string[];
}

/** Quiz: stored `score` (publish or score-on-submit) when present, else computed live against the key. */
export function scoreQuizResponse(
  session: Doc,
  response: Doc,
  ctx: QuizContext
): RowScore {
  const status = asString(response.status);
  const parsed = parseCompletedResponse(response);
  const studentUid = parsed.studentUid;
  const completed = status === 'completed';
  const attemptsDone =
    typeof response.completedAttempts === 'number'
      ? response.completedAttempts
      : completed
        ? 1
        : 0;
  const served = parsed.servedQuestionIds?.length
    ? parsed.servedQuestionIds
    : ctx.overrideQuestionIds(studentUid);
  const q = scoreQuestions({
    questions: ctx.questions,
    answers: parsed.answers,
    servedQuestionIds: served,
    manualGrades: parsed.manualGrades,
    fibAnswersByQuestion: ctx.fibAnswersByStudent(studentUid),
    sectionsRaw: session.sections,
  });
  const base = {
    classId: parsed.classId ?? null,
    published: isPublished(session, response),
    targetEvidence: completed ? q.evidence : [],
  };
  if (!completed) {
    return {
      ...base,
      rawPct: null,
      points: null,
      max: q.max || null,
      state: status === 'in-progress' ? 'in-progress' : 'not-attempted',
      submittedAt: null,
      attemptNumber: attemptsDone + 1,
    };
  }
  const submittedAt = toMillis(response.submittedAt);
  const stored = parsed.score;
  let state: GradeState = 'scored';
  let rawPct: number | null;
  if (stored !== null) rawPct = stored;
  else if (q.awaiting) {
    state = 'awaiting-grade';
    rawPct = null;
  } else rawPct = q.noKey ? null : pctOf(q.earned, q.max);
  if (state === 'scored' && rawPct === null) state = 'awaiting-grade';
  const max = q.max > 0 ? q.max : null;
  return {
    ...base,
    rawPct,
    points:
      rawPct !== null && max !== null
        ? stored !== null
          ? round2((stored / 100) * max)
          : q.earned
        : null,
    max,
    state,
    submittedAt,
    attemptNumber: Math.max(attemptsDone, 1),
  };
}

/** Video activity: stored `score` after publish, else live from the key or stored correctness. */
export function scoreVideoResponse(
  session: Doc,
  response: Doc,
  questions: GroupQuestion[]
): RowScore {
  const answers: RawAnswer[] = (
    Array.isArray(response.answers) ? response.answers : []
  )
    .map(asRecord)
    .filter((a) => asString(a.questionId))
    .map((a) => ({
      questionId: asString(a.questionId),
      answer: asString(a.answer),
      answeredAt: toMillis(a.answeredAt) ?? undefined,
      isCorrect: typeof a.isCorrect === 'boolean' ? a.isCorrect : undefined,
    }));
  const completedAt = toMillis(response.completedAt);
  const attemptsDone =
    typeof response.completedAttempts === 'number'
      ? response.completedAttempts
      : completedAt !== null
        ? 1
        : 0;
  const q = scoreQuestions({
    questions,
    answers,
    useStoredCorrectness: true,
  });
  const stored =
    typeof response.score === 'number' && Number.isFinite(response.score)
      ? response.score
      : null;
  const classId = asString(response.classId) || null;
  const published =
    isPublished(session, response) ||
    (stored !== null && session.scoreVisibility !== 'none');
  if (completedAt === null) {
    return {
      classId,
      published,
      targetEvidence: [],
      rawPct: null,
      points: null,
      max: q.max || null,
      state: answers.length > 0 ? 'in-progress' : 'not-attempted',
      submittedAt: null,
      attemptNumber: attemptsDone + 1,
    };
  }
  const max = q.max > 0 ? q.max : null;
  const rawPct = stored ?? pctOf(q.earned, q.max);
  return {
    classId,
    published,
    targetEvidence: q.evidence,
    rawPct,
    points:
      rawPct !== null && max !== null ? round2((rawPct / 100) * max) : null,
    max,
    state: rawPct === null ? 'awaiting-grade' : 'scored',
    submittedAt: completedAt,
    attemptNumber: Math.max(attemptsDone, 1),
  };
}

/** Guided learning: gradable steps are the ones carrying a question; one point each. */
export function scoreGuidedLearningResponse(
  session: Doc,
  response: Doc
): RowScore {
  const steps = Array.isArray(session.publicSteps) ? session.publicSteps : [];
  const gradable = new Set(
    steps
      .map(asRecord)
      .filter((s) => s.question && asString(s.id))
      .map((s) => asString(s.id))
  );
  const answers = (Array.isArray(response.answers) ? response.answers : []).map(
    asRecord
  );
  const correct = new Set(
    answers
      .filter(
        (a) =>
          a.isCorrect === true &&
          (gradable.size === 0 || gradable.has(asString(a.stepId)))
      )
      .map((a) => asString(a.stepId))
  );
  const max = gradable.size > 0 ? gradable.size : null;
  const completedAt = toMillis(response.completedAt);
  const stored =
    typeof response.score === 'number' && Number.isFinite(response.score)
      ? response.score
      : null;
  const classId = asString(response.classId) || null;
  const published = isPublished(session, response) || stored !== null;
  if (completedAt === null) {
    return {
      classId,
      published,
      targetEvidence: [],
      rawPct: null,
      points: null,
      max,
      state: answers.length > 0 ? 'in-progress' : 'not-attempted',
      submittedAt: null,
      attemptNumber: null,
    };
  }
  const rawPct = stored ?? (max ? pctOf(correct.size, max) : null);
  return {
    classId,
    published,
    targetEvidence: [],
    rawPct,
    points:
      rawPct !== null && max !== null ? round2((rawPct / 100) * max) : null,
    max,
    state: rawPct === null ? 'awaiting-grade' : 'scored',
    submittedAt: completedAt,
    attemptNumber: null,
  };
}

/** Flashcards check mode: server-written `score` correct out of `total`. */
export function scoreFlashcardProgress(session: Doc, progress: Doc): RowScore {
  const submittedAt = toMillis(progress.submittedAt);
  const total = typeof progress.total === 'number' ? progress.total : null;
  const correct = typeof progress.score === 'number' ? progress.score : null;
  const scored = submittedAt !== null && total !== null && correct !== null;
  return {
    classId: asString(progress.classId) || null,
    published: toMillis(session.scorePublishedAt) !== null,
    targetEvidence: [],
    rawPct: scored && total > 0 ? pctOf(correct, total) : null,
    points: scored ? correct : null,
    max: total,
    state: scored
      ? 'scored'
      : progress.lastActiveAt
        ? 'in-progress'
        : 'not-attempted',
    submittedAt,
    attemptNumber: null,
  };
}

/** Projects: one grade per group; a member override replaces the group's points. */
export function scoreProjectMember(
  grade: Doc,
  group: Doc,
  memberUid: string
): RowScore {
  const max = typeof grade.maxPoints === 'number' ? grade.maxPoints : null;
  const override = asRecord(asRecord(grade.overridesByUid)[memberUid]);
  const points =
    typeof override.points === 'number'
      ? override.points
      : typeof grade.points === 'number'
        ? grade.points
        : null;
  const scored = points !== null && max !== null;
  return {
    classId: asString(group.classId) || null,
    published: grade.released === true,
    targetEvidence: [],
    rawPct: scored && max > 0 ? round2((points / max) * 100) : null,
    points,
    max,
    state: scored ? 'scored' : 'awaiting-grade',
    submittedAt: toMillis(grade.gradedAt),
    attemptNumber: null,
  };
}

/** Completion-only kinds: a checkmark once any submission exists. */
export function scoreCompletion(
  submittedAt: number | null,
  classId: string | null
): RowScore {
  return {
    classId,
    published: true,
    targetEvidence: [],
    rawPct: null,
    points: null,
    max: null,
    state: submittedAt !== null ? 'scored' : 'not-attempted',
    submittedAt,
    attemptNumber: null,
  };
}

export const rowId = (sessionId: string, studentUid: string): string =>
  `${sessionId}__${studentUid}`;
