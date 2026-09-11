// Pure math for the PLC pooled-assessment aggregate (docs/plans/PLC_ASSESSMENT_DATA.md §5.3).
// Local mirrors of the root `types.ts` shapes; functions cannot import across the repo root.

export const AGGREGATE_SCHEMA_VERSION = 4;

export type LearningTargetKind = 'standard' | 'plc' | 'personal';

export interface QuestionTargetSnapshot {
  id: string;
  kind: LearningTargetKind;
  ownerId?: string;
  code?: string;
  label: string;
  standardIds?: string[];
  /** Benchmark tags: the standard-level id (`set:std:code`) they roll up into. */
  parentId?: string;
  parentLabel?: string;
}

export interface GroupQuestion {
  id: string;
  text: string;
  type: string;
  points: number;
  /** MC option labels in canonical order; empty for other types. */
  choices: string[];
  /** Known only when the synced group carries the answer key. */
  correctAnswer: string | null;
  allowPartialCredit: boolean;
  /** Frozen tag snapshots used for target and standard rollups. */
  targets: QuestionTargetSnapshot[];
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
  servedQuestionIds?: string[];
  classPeriod?: string;
  classId?: string;
  /** Teacher manual grades by session question id (primary slot). */
  manualPoints?: Record<string, number>;
}

export interface SessionInput {
  id: string;
  teacherUid: string;
  teacherName: string;
  publicQuestions: unknown[];
  /** Teacher-private assignment snapshot; carries tags even when students cannot see them. */
  questionSnapshot?: unknown[];
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
  servedCount: number;
  choiceDistribution: AggregateChoiceRow[];
}

export interface AggregateTargetRow {
  targetId: string;
  kind: LearningTargetKind;
  code?: string;
  label: string;
  questionIds: string[];
  attempted: number;
  correctPercent: number;
  lowSample: boolean;
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
  perTarget: AggregateTargetRow[];
  perStandard: AggregateTargetRow[];
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

function parseTarget(raw: unknown): QuestionTargetSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  const label = asString(r.label);
  if (
    id.length === 0 ||
    label.length === 0 ||
    (r.kind !== 'standard' && r.kind !== 'plc' && r.kind !== 'personal')
  ) {
    return null;
  }
  return {
    id,
    kind: r.kind,
    label,
    ...(asString(r.ownerId) ? { ownerId: asString(r.ownerId) } : {}),
    ...(asString(r.code) ? { code: asString(r.code) } : {}),
    ...(asStringArray(r.standardIds).length > 0
      ? { standardIds: asStringArray(r.standardIds) }
      : {}),
    ...(asString(r.parentId) ? { parentId: asString(r.parentId) } : {}),
    ...(asString(r.parentLabel)
      ? { parentLabel: asString(r.parentLabel) }
      : {}),
  };
}

const STANDARD_TAG_MARKER = ':std:';

/** Parent standard row for a benchmark tag; null when the tag carries no parent. */
function parentStandardTag(
  target: QuestionTargetSnapshot
): QuestionTargetSnapshot | null {
  if (!target.parentId) return null;
  const marker = target.parentId.indexOf(STANDARD_TAG_MARKER);
  const code =
    marker >= 0
      ? target.parentId.slice(marker + STANDARD_TAG_MARKER.length)
      : target.parentId;
  return {
    id: target.parentId,
    kind: 'standard',
    code,
    label: target.parentLabel ?? code,
  };
}

function parseTargets(raw: unknown): QuestionTargetSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, QuestionTargetSnapshot>();
  for (const value of raw) {
    const target = parseTarget(value);
    if (target) byId.set(target.id, target);
  }
  return Array.from(byId.values());
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
    allowPartialCredit: r.allowPartialCredit === true,
    targets: parseTargets(r.targets),
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
    allowPartialCredit: false,
    targets: parseTargets(r.targets),
  };
}

export function publicQuestionIds(publicQuestions: unknown[]): string[] {
  return publicQuestions
    .map(parsePublicQuestion)
    .filter((q): q is GroupQuestion => q !== null)
    .map((q) => q.id);
}

function mergeTargets(
  existing: QuestionTargetSnapshot[],
  incoming: QuestionTargetSnapshot[]
): QuestionTargetSnapshot[] {
  const byId = new Map(existing.map((target) => [target.id, target]));
  for (const target of incoming) byId.set(target.id, target);
  return Array.from(byId.values());
}

function parseQuestionTargetSnapshot(
  raw: unknown
): { id: string; targets: QuestionTargetSnapshot[] } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = asString(r.id);
  if (!id) return null;
  return { id, targets: parseTargets(r.targets) };
}

/**
 * Build the pooled question snapshot. Synced questions lead (and carry answer
 * keys), while resolved session-pool questions are appended so random bank
 * draws are represented. Teacher-private assignment snapshots supply frozen
 * tags even when the student-facing payload intentionally omits them.
 */
export function resolveGroupQuestions(
  synced: SyncedQuestions | null,
  publicQuestions: unknown[],
  questionSnapshot: unknown[] = []
): GroupQuestion[] {
  const questions = new Map<string, GroupQuestion>();
  if (synced && Array.isArray(synced.questions)) {
    for (const raw of synced.questions) {
      const parsed = parseSyncedQuestion(raw);
      if (parsed) questions.set(parsed.id, parsed);
    }
  }
  for (const raw of publicQuestions) {
    const parsed = parsePublicQuestion(raw);
    if (!parsed) continue;
    const existing = questions.get(parsed.id);
    if (existing) {
      existing.targets = mergeTargets(existing.targets, parsed.targets);
    } else {
      questions.set(parsed.id, parsed);
    }
  }
  for (const raw of questionSnapshot) {
    const snapshot = parseQuestionTargetSnapshot(raw);
    if (!snapshot) continue;
    const question = questions.get(snapshot.id);
    if (question) {
      question.targets = mergeTargets(question.targets, snapshot.targets);
    }
  }
  return Array.from(questions.values());
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

export type LocalGradeState =
  | 'scored'
  | 'not-attempted'
  | 'awaiting-grade'
  | 'no-key';

export interface LocalGrade {
  isCorrect: boolean;
  pointsEarned: number;
  pointsMax: number;
  state: LocalGradeState;
}

const normalizeAnswer = (s: string): string =>
  s.trim().toLowerCase().replace(/\s+/g, ' ');

function hasSubmittedContent(answer: string): boolean {
  let stripped = answer ?? '';
  let previous: string;
  do {
    previous = stripped;
    stripped = stripped.replace(/<[^<>]*>/g, '');
  } while (stripped !== previous);
  return stripped.replace(/&nbsp;/gi, ' ').trim().length > 0;
}

/** Longest run of `given` items appearing in `correct` order; mirrors the client grader. */
function longestOrderedSubsequenceLength(
  correct: string[],
  given: string[]
): number {
  const correctNorm = correct.map(normalizeAnswer);
  const used = new Array<boolean>(correct.length).fill(false);
  const seq: number[] = [];
  for (const g of given) {
    const target = normalizeAnswer(g);
    let chosen = -1;
    for (let i = 0; i < correctNorm.length; i++) {
      if (!used[i] && correctNorm[i] === target) {
        chosen = i;
        break;
      }
    }
    if (chosen >= 0) {
      used[chosen] = true;
      seq.push(chosen);
    }
  }
  const tails: number[] = [];
  for (const x of seq) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x;
  }
  return tails.length;
}

/** Server-side mirror of the client `gradeAnswer`; `manualPoints` is the teacher's stored grade for written types. */
export function gradeGroupAnswer(
  question: GroupQuestion,
  studentAnswer: string,
  manualPoints: number | undefined
): LocalGrade {
  const max = question.points;
  const attempted = hasSubmittedContent(studentAnswer);
  if (question.type === 'free-response') {
    if (manualPoints === undefined) {
      return {
        isCorrect: false,
        pointsEarned: 0,
        pointsMax: max,
        state: attempted ? 'awaiting-grade' : 'not-attempted',
      };
    }
    const awarded = Math.min(max, Math.max(0, manualPoints));
    return {
      isCorrect: awarded === max && max > 0,
      pointsEarned: awarded,
      pointsMax: max,
      state: 'scored',
    };
  }
  if (question.correctAnswer === null) {
    return {
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: max,
      state: 'no-key',
    };
  }
  const state: LocalGradeState = attempted ? 'scored' : 'not-attempted';
  const correct = normalizeAnswer(question.correctAnswer);
  const given = normalizeAnswer(studentAnswer);
  const partial = question.allowPartialCredit;
  if (question.type === 'Matching') {
    const splitPair = (p: string): [string, string] => {
      const sep = p.indexOf(':');
      return sep < 0 ? [p, ''] : [p.slice(0, sep), p.slice(sep + 1)];
    };
    const correctMap = new Map<string, string>();
    for (const p of correct.split('|').map(normalizeAnswer)) {
      const [left, right] = splitPair(p);
      correctMap.set(left, right);
    }
    const seenLefts = new Set<string>();
    let matched = 0;
    for (const p of given.split('|').map(normalizeAnswer)) {
      const [left, right] = splitPair(p);
      if (seenLefts.has(left)) continue;
      seenLefts.add(left);
      if (correctMap.get(left) === right) matched++;
    }
    const total = correctMap.size;
    if (!partial) {
      const strict = matched === total && seenLefts.size === total;
      return {
        isCorrect: strict,
        pointsEarned: strict ? max : 0,
        pointsMax: max,
        state,
      };
    }
    return {
      isCorrect: matched === total,
      pointsEarned: total === 0 ? 0 : (matched / total) * max,
      pointsMax: max,
      state,
    };
  }
  if (question.type === 'Ordering' && partial) {
    const correctItems = question.correctAnswer.split('|');
    const lis = longestOrderedSubsequenceLength(
      correctItems,
      studentAnswer.split('|')
    );
    return {
      isCorrect: lis === correctItems.length,
      pointsEarned:
        correctItems.length === 0 ? 0 : (lis / correctItems.length) * max,
      pointsMax: max,
      state,
    };
  }
  const isCorrect = correct === given;
  return {
    isCorrect,
    pointsEarned: isCorrect ? max : 0,
    pointsMax: max,
    state,
  };
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
  served: number;
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
      served: 0,
      answered: 0,
      graded: 0,
      correct: 0,
      choiceCounts: new Map(),
      correctLabels: new Set(),
    });
  }

  const questionById = new Map(input.groupQuestions.map((q) => [q.id, q]));
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

      const servedIds =
        r.servedQuestionIds && r.servedQuestionIds.length > 0
          ? r.servedQuestionIds
          : publicQuestionIds(session.publicQuestions);
      const servedSet = new Set(servedIds);
      for (const sessionQid of servedSet) {
        const groupQid = alignment.map.get(sessionQid);
        const q = groupQid ? acc.get(groupQid) : undefined;
        if (q) q.served++;
      }

      const answers = Array.isArray(r.answers) ? r.answers : [];
      const representative = selectRepresentativeAnswers(answers);

      // Grade locally from the answer key so unpublished sessions still score;
      // any served question without a key or an owed manual grade blocks the score.
      let earned = 0;
      let max = 0;
      let gradable = true;
      const verdicts = new Map<string, boolean>();
      for (const sessionQid of servedSet) {
        const groupQid = alignment.map.get(sessionQid);
        const question = groupQid ? questionById.get(groupQid) : undefined;
        if (!question) {
          gradable = false;
          continue;
        }
        const a = representative.get(sessionQid);
        const grade = gradeGroupAnswer(
          question,
          a?.answer ?? '',
          r.manualPoints?.[sessionQid]
        );
        if (grade.state === 'no-key' || grade.state === 'awaiting-grade') {
          gradable = false;
        } else {
          earned += grade.pointsEarned;
          max += grade.pointsMax;
        }
        if (grade.state === 'scored' && a)
          verdicts.set(sessionQid, grade.isCorrect);
      }
      const published = asFiniteNumber(r.score);
      const score =
        published ??
        (gradable ? (max > 0 ? Math.round((earned / max) * 100) : 0) : null);
      if (score !== null) {
        scoreSum += score;
        scoreCount++;
        teacher.scoreSum += score;
        teacher.scoreCount++;
      }

      for (const [sessionQid, a] of representative) {
        const groupQid = alignment.map.get(sessionQid);
        const q = groupQid ? acc.get(groupQid) : undefined;
        if (!q) continue;
        q.answered++;
        // A published flag is authoritative; otherwise use the local verdict.
        const isCorrect =
          typeof a.isCorrect === 'boolean'
            ? a.isCorrect
            : verdicts.get(sessionQid);
        if (typeof isCorrect === 'boolean') {
          q.graded++;
          if (isCorrect) q.correct++;
        }
        const label = asString(a.answer);
        q.choiceCounts.set(label, (q.choiceCounts.get(label) ?? 0) + 1);
        if (isCorrect === true) q.correctLabels.add(label);
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
      servedCount: q.served,
      correctPercent: q.graded > 0 ? pct(q.correct, q.graded) : 0,
      incorrectPercent:
        q.graded > 0 ? pct(q.graded - q.correct, q.graded) : null,
      choiceDistribution,
    };
  });

  const buildTargetRows = (standards: boolean): AggregateTargetRow[] => {
    const groups = new Map<
      string,
      { target: QuestionTargetSnapshot; questionIds: Set<string> }
    >();
    const add = (target: QuestionTargetSnapshot, questionId: string) => {
      const current = groups.get(target.id);
      if (current) {
        current.questionIds.add(questionId);
        const incomingRich = target.label !== (target.code ?? target.id);
        const currentRich =
          current.target.label !== (current.target.code ?? current.target.id);
        if (incomingRich || !currentRich) current.target = target;
      } else {
        groups.set(target.id, {
          target,
          questionIds: new Set([questionId]),
        });
      }
    };
    for (const question of input.groupQuestions) {
      for (const target of question.targets) {
        // Personal targets live in a teacher-private document. They may be
        // useful in that teacher's results, but must not cross the PLC
        // aggregate boundary through either their label or linked standards.
        if (target.kind === 'personal') continue;
        if (!standards) {
          add(target, question.id);
        } else if (target.kind === 'standard') {
          add(target, question.id);
          const parent = parentStandardTag(target);
          if (parent) add(parent, question.id);
        } else {
          for (const standardId of new Set(target.standardIds ?? [])) {
            const code = standardId.includes(':')
              ? standardId.slice(standardId.indexOf(':') + 1)
              : standardId;
            add(
              { id: standardId, kind: 'standard', code, label: code },
              question.id
            );
          }
        }
      }
    }
    const order = new Map(
      input.groupQuestions.map((question, index) => [question.id, index])
    );
    return Array.from(groups.values())
      .map(({ target, questionIds }) => {
        const ids = Array.from(questionIds).sort(
          (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)
        );
        const attempted = ids.reduce(
          (sum, id) => sum + (acc.get(id)?.graded ?? 0),
          0
        );
        const correct = ids.reduce(
          (sum, id) => sum + (acc.get(id)?.correct ?? 0),
          0
        );
        return {
          targetId: target.id,
          kind: target.kind,
          ...(target.code ? { code: target.code } : {}),
          label: target.label,
          questionIds: ids,
          attempted,
          correctPercent: attempted > 0 ? pct(correct, attempted) : 0,
          lowSample: attempted < 5,
        };
      })
      .sort((a, b) =>
        `${a.code ?? ''} ${a.label}`.localeCompare(
          `${b.code ?? ''} ${b.label}`,
          undefined,
          { numeric: true, sensitivity: 'base' }
        )
      );
  };

  const perTarget = buildTargetRows(false);
  const perStandard = buildTargetRows(true);

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
    perTarget,
    perStandard,
    perTeacher,
  };
  if (anyMismatch) payload.alignmentWarning = ALIGNMENT_WARNING;
  return payload;
}
