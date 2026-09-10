// Pure math for the PLC pooled-assessment aggregate (docs/plans/PLC_ASSESSMENT_DATA.md §5.3).
// Local mirrors of the root `types.ts` shapes; functions cannot import across the repo root.

export const AGGREGATE_SCHEMA_VERSION = 2;

export interface GroupQuestion {
  id: string;
  text: string;
  type: string;
  points: number;
  /** MC option labels in canonical order; empty for other types. */
  choices: string[];
  /** Known only when the synced group carries the answer key. */
  correctAnswer: string | null;
}

export interface SyncedQuestions {
  questions?: unknown;
}

export interface RawAnswer {
  questionId: string;
  answer: string;
  answeredAt?: number;
  isCorrect?: boolean;
  status?: 'draft' | 'submitted';
  unresponded?: unknown;
  takeIndex?: number;
}

export interface CompletedResponse {
  studentUid: string;
  answers: RawAnswer[];
  score: number | null;
  classPeriod?: string;
  classId?: string;
}

export interface SessionInput {
  id: string;
  teacherUid: string;
  teacherName: string;
  publicQuestions: unknown[];
  /** Only `status === 'completed'` responses belong here. */
  responses: CompletedResponse[];
  /** ms when the teacher published scores; null while unpublished. */
  scorePublishedAt: number | null;
}

export interface ComputeInput {
  assessmentId: string;
  title: string;
  kind: 'quiz' | 'video-activity';
  groupQuestions: GroupQuestion[];
  sessions: SessionInput[];
}

export interface AggregateChoiceRow {
  label: string;
  count: number;
  isCorrect: boolean;
}

export interface AggregatePerQuestion {
  questionId: string;
  text: string;
  correctPercent: number;
  points: number;
  incorrectPercent: number | null;
  answered: number;
  graded: number;
  correct: number;
  choiceDistribution: AggregateChoiceRow[];
}

export interface AggregatePerTeacher {
  teacherUid: string;
  teacherName: string;
  classCount: number;
  averagePercent: number;
  studentCount: number;
}

/** The aggregate doc minus `ranAt`, which the writer stamps with `serverTimestamp()`. */
export interface AggregatePayload {
  assessmentId: string;
  schemaVersion: number;
  title: string;
  kind: 'quiz' | 'video-activity';
  teacherCount: number;
  studentCount: number;
  teamAveragePercent: number;
  /** Completed responses that carried a numeric score. */
  scoredStudentCount: number;
  sessionCount: number;
  /** Every linked session, including ones with no completed responses. */
  linkedSessionCount: number;
  /** Linked sessions whose scores are published. */
  publishedSessionCount: number;
  computedFromSessionIds: string[];
  alignment: 'byId' | 'positional';
  alignmentWarning?: string;
  perQuestion: AggregatePerQuestion[];
  perTeacher: AggregatePerTeacher[];
}

export const ALIGNMENT_WARNING =
  'Some linked sessions had a different question count and were matched by position; per-question counts may be incomplete.';

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
}

function parseSyncedQuestion(raw: unknown): GroupQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (id.length === 0) return null;
  const type = asString(r.type);
  const correctAnswer = asString(r.correctAnswer);
  const choices =
    type === 'MC'
      ? [correctAnswer, ...asStringArray(r.incorrectAnswers)].filter(
          (c) => c.length > 0
        )
      : [];
  return {
    id,
    text: asString(r.text),
    type,
    points: asFiniteNumber(r.points) ?? 1,
    choices,
    correctAnswer: correctAnswer.length > 0 ? correctAnswer : null,
  };
}

/** Parse one session `publicQuestions[]` entry; the public payload carries no answer key. */
export function parsePublicQuestion(raw: unknown): GroupQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (id.length === 0) return null;
  const type = asString(r.type);
  return {
    id,
    text: asString(r.text),
    type,
    points: asFiniteNumber(r.points) ?? 1,
    choices: type === 'MC' ? asStringArray(r.choices) : [],
    correctAnswer: null,
  };
}

export function publicQuestionIds(publicQuestions: unknown[]): string[] {
  return publicQuestions
    .map(parsePublicQuestion)
    .filter((q): q is GroupQuestion => q !== null)
    .map((q) => q.id);
}

/** Synced group questions win (they carry the key); else the first session's public questions. */
export function resolveGroupQuestions(
  synced: SyncedQuestions | null,
  firstSessionPublicQuestions: unknown[]
): GroupQuestion[] {
  if (synced && Array.isArray(synced.questions)) {
    const parsed = synced.questions
      .map(parseSyncedQuestion)
      .filter((q): q is GroupQuestion => q !== null);
    if (parsed.length > 0) return parsed;
  }
  return firstSessionPublicQuestions
    .map(parsePublicQuestion)
    .filter((q): q is GroupQuestion => q !== null);
}

export interface Alignment {
  mode: 'byId' | 'positional';
  /** session question id → group question id */
  map: Map<string, string>;
  countMismatch: boolean;
}

/** byId when every session id is a group id; otherwise positional (retroactively linked copies). */
export function alignSessionQuestions(
  groupIds: string[],
  sessionQuestionIds: string[]
): Alignment {
  const groupSet = new Set(groupIds);
  const map = new Map<string, string>();
  if (sessionQuestionIds.every((id) => groupSet.has(id))) {
    for (const id of sessionQuestionIds) map.set(id, id);
    return { mode: 'byId', map, countMismatch: false };
  }
  sessionQuestionIds.forEach((id, i) => {
    if (i < groupIds.length) map.set(id, groupIds[i]);
  });
  return {
    mode: 'positional',
    map,
    countMismatch: sessionQuestionIds.length !== groupIds.length,
  };
}

/** One answer per question: highest `takeIndex` (absent = 0), earliest `answeredAt` on ties; drafts and unresponded entries dropped. */
export function selectRepresentativeAnswers(
  answers: RawAnswer[]
): Map<string, RawAnswer> {
  const eligible = answers.filter(
    (a) =>
      typeof a.questionId === 'string' &&
      a.questionId.length > 0 &&
      a.status !== 'draft' &&
      (a.unresponded === undefined || a.unresponded === null)
  );
  const sorted = [...eligible].sort((a, b) => {
    const ai = a.takeIndex ?? 0;
    const bi = b.takeIndex ?? 0;
    if (ai !== bi) return bi - ai;
    return (a.answeredAt ?? 0) - (b.answeredAt ?? 0);
  });
  const byQuestion = new Map<string, RawAnswer>();
  for (const a of sorted) {
    if (!byQuestion.has(a.questionId)) byQuestion.set(a.questionId, a);
  }
  return byQuestion;
}

function pct(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 100);
}

function classKey(r: CompletedResponse, sessionId: string): string {
  return (
    (typeof r.classPeriod === 'string' && r.classPeriod.length > 0
      ? r.classPeriod
      : null) ??
    (typeof r.classId === 'string' && r.classId.length > 0
      ? r.classId
      : null) ??
    sessionId
  );
}

interface QuestionAcc {
  answered: number;
  graded: number;
  correct: number;
  choiceCounts: Map<string, number>;
  /** Labels seen with a published `isCorrect: true`, for sessions without a key. */
  correctLabels: Set<string>;
}

interface TeacherAcc {
  teacherName: string;
  classKeys: Set<string>;
  studentCount: number;
  scoreSum: number;
  scoreCount: number;
}

/** Deterministic, anonymized rollup: counts and averages only, never a student name or free-text answer. */
export function computeAssessmentAggregate(
  input: ComputeInput
): AggregatePayload {
  const groupIds = input.groupQuestions.map((q) => q.id);
  const acc = new Map<string, QuestionAcc>();
  for (const q of input.groupQuestions) {
    acc.set(q.id, {
      answered: 0,
      graded: 0,
      correct: 0,
      choiceCounts: new Map(),
      correctLabels: new Set(),
    });
  }

  const teachers = new Map<string, TeacherAcc>();
  const sessionIds: string[] = [];
  let studentCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let anyPositional = false;
  let anyMismatch = false;

  const linkedSessionCount = input.sessions.length;
  const publishedSessionCount = input.sessions.filter(
    (s) => s.scorePublishedAt != null
  ).length;

  for (const session of input.sessions) {
    const completed = session.responses;
    if (completed.length === 0) continue;
    sessionIds.push(session.id);

    const alignment = alignSessionQuestions(
      groupIds,
      publicQuestionIds(session.publicQuestions)
    );
    if (alignment.mode === 'positional') {
      anyPositional = true;
      if (alignment.countMismatch) anyMismatch = true;
    }

    let teacher = teachers.get(session.teacherUid);
    if (!teacher) {
      teacher = {
        teacherName: session.teacherName,
        classKeys: new Set(),
        studentCount: 0,
        scoreSum: 0,
        scoreCount: 0,
      };
      teachers.set(session.teacherUid, teacher);
    }

    for (const r of completed) {
      studentCount++;
      teacher.studentCount++;
      teacher.classKeys.add(classKey(r, session.id));
      const score = asFiniteNumber(r.score);
      if (score !== null) {
        scoreSum += score;
        scoreCount++;
        teacher.scoreSum += score;
        teacher.scoreCount++;
      }

      const answers = Array.isArray(r.answers) ? r.answers : [];
      for (const [sessionQid, a] of selectRepresentativeAnswers(answers)) {
        const groupQid = alignment.map.get(sessionQid);
        const q = groupQid ? acc.get(groupQid) : undefined;
        if (!q) continue;
        q.answered++;
        if (typeof a.isCorrect === 'boolean') {
          q.graded++;
          if (a.isCorrect) q.correct++;
        }
        const label = asString(a.answer);
        q.choiceCounts.set(label, (q.choiceCounts.get(label) ?? 0) + 1);
        if (a.isCorrect === true) q.correctLabels.add(label);
      }
    }
  }

  const perQuestion: AggregatePerQuestion[] = input.groupQuestions.map((gq) => {
    const q = acc.get(gq.id)!;
    const choiceDistribution: AggregateChoiceRow[] =
      gq.type === 'MC'
        ? gq.choices.map((label) => ({
            label,
            count: q.choiceCounts.get(label) ?? 0,
            isCorrect:
              gq.correctAnswer !== null
                ? label === gq.correctAnswer
                : q.correctLabels.has(label),
          }))
        : [];
    return {
      questionId: gq.id,
      text: gq.text,
      points: gq.points,
      answered: q.answered,
      graded: q.graded,
      correct: q.correct,
      correctPercent: q.graded > 0 ? pct(q.correct, q.graded) : 0,
      incorrectPercent:
        q.graded > 0 ? pct(q.graded - q.correct, q.graded) : null,
      choiceDistribution,
    };
  });

  const perTeacher: AggregatePerTeacher[] = Array.from(teachers.entries())
    .map(([teacherUid, t]) => ({
      teacherUid,
      teacherName: t.teacherName,
      classCount: t.classKeys.size,
      averagePercent:
        t.scoreCount > 0 ? Math.round(t.scoreSum / t.scoreCount) : 0,
      studentCount: t.studentCount,
    }))
    .sort((a, b) => (a.teacherUid < b.teacherUid ? -1 : 1));

  const payload: AggregatePayload = {
    assessmentId: input.assessmentId,
    schemaVersion: AGGREGATE_SCHEMA_VERSION,
    title: input.title,
    kind: input.kind,
    teacherCount: teachers.size,
    studentCount,
    teamAveragePercent: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
    scoredStudentCount: scoreCount,
    sessionCount: sessionIds.length,
    linkedSessionCount,
    publishedSessionCount,
    computedFromSessionIds: sessionIds,
    alignment: anyPositional ? 'positional' : 'byId',
    perQuestion,
    perTeacher,
  };
  if (anyMismatch) payload.alignmentWarning = ALIGNMENT_WARNING;
  return payload;
}
