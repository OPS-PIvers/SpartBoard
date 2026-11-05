// Pooled PLC aggregate for Flashcards checks, in the same shape Quiz's PLC views read.
import {
  AGGREGATE_SCHEMA_VERSION,
  bucketScores,
  type AggregatePayload,
  type AggregatePerQuestion,
  type AggregatePerTeacher,
} from './plcAssessmentMath';

export interface FlashcardCheckCard {
  id: string;
  term: string;
}

export interface FlashcardCheckAnswer {
  cardId: string;
  correct: boolean;
}

export interface SubmittedFlashcardCheck {
  classId?: string;
  score: number | null;
  total: number | null;
  /** Server-graded by submitFlashcardCheckV1; students cannot write it. */
  answerLog: FlashcardCheckAnswer[];
}

export interface FlashcardCheckSessionInput {
  id: string;
  teacherUid: string;
  teacherName: string;
  /** `flashcards` (mastery) checks count as finished with no score. */
  checkMode: string;
  cards: FlashcardCheckCard[];
  submissions: SubmittedFlashcardCheck[];
}

export interface FlashcardAggregateInput {
  assessmentId: string;
  title: string;
  sessions: FlashcardCheckSessionInput[];
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function parseFlashcardCheckCards(raw: unknown): FlashcardCheckCard[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c: unknown) => {
    if (typeof c !== 'object' || c === null) return [];
    const r = c as Record<string, unknown>;
    const id = asString(r.id);
    return id ? [{ id, term: asString(r.term) }] : [];
  });
}

/** Null unless the progress doc carries a server `submittedAt`. */
export function parseSubmittedFlashcardCheck(
  raw: Record<string, unknown> | undefined
): SubmittedFlashcardCheck | null {
  if (!raw || finite(raw.submittedAt) === null) return null;
  // A teacher-accepted flag raises the score without flipping answerLog, so count it as right here too.
  const accepted = new Set(
    Array.isArray(raw.flags)
      ? raw.flags.flatMap((f: unknown) => {
          if (typeof f !== 'object' || f === null) return [];
          const r = f as Record<string, unknown>;
          const cardId = asString(r.cardId);
          return cardId && r.accepted === true ? [cardId] : [];
        })
      : []
  );
  const answerLog = Array.isArray(raw.answerLog)
    ? raw.answerLog.flatMap((a: unknown) => {
        if (typeof a !== 'object' || a === null) return [];
        const r = a as Record<string, unknown>;
        const cardId = asString(r.cardId);
        return cardId && typeof r.correct === 'boolean'
          ? [{ cardId, correct: r.correct || accepted.has(cardId) }]
          : [];
      })
    : [];
  return {
    classId: asString(raw.classId) || undefined,
    score: finite(raw.score),
    total: finite(raw.total),
    answerLog,
  };
}

function scoreOf(checkMode: string, s: SubmittedFlashcardCheck): number | null {
  if (checkMode === 'flashcards') return null;
  if (s.score === null || s.total === null || s.total <= 0) return null;
  return Math.round((Math.min(s.score, s.total) / s.total) * 100);
}

/** Counts and averages only; never a student id or a typed answer. */
export function computeFlashcardAggregate(
  input: FlashcardAggregateInput
): AggregatePayload {
  const terms = new Map<string, string>();
  for (const session of input.sessions) {
    for (const card of session.cards) {
      if (!terms.has(card.id)) terms.set(card.id, card.term);
    }
  }
  const tally = new Map<string, { answered: number; correct: number }>();
  for (const id of terms.keys()) tally.set(id, { answered: 0, correct: 0 });

  const teachers = new Map<
    string,
    {
      name: string;
      classes: Set<string>;
      students: number;
      sum: number;
      n: number;
    }
  >();
  const sessionIds: string[] = [];
  const scores: number[] = [];
  let studentCount = 0;

  for (const session of input.sessions) {
    if (session.submissions.length === 0) continue;
    sessionIds.push(session.id);
    const teacher = teachers.get(session.teacherUid) ?? {
      name: session.teacherName,
      classes: new Set<string>(),
      students: 0,
      sum: 0,
      n: 0,
    };
    teachers.set(session.teacherUid, teacher);
    const scored = session.checkMode !== 'flashcards';
    for (const s of session.submissions) {
      studentCount++;
      teacher.students++;
      teacher.classes.add(s.classId ?? session.id);
      const score = scoreOf(session.checkMode, s);
      if (score !== null) {
        scores.push(score);
        teacher.sum += score;
        teacher.n++;
      }
      if (!scored) continue;
      const seen = new Set<string>();
      for (const a of s.answerLog) {
        const t = tally.get(a.cardId);
        if (!t || seen.has(a.cardId)) continue;
        seen.add(a.cardId);
        t.answered++;
        if (a.correct) t.correct++;
      }
    }
  }

  const perQuestion: AggregatePerQuestion[] = Array.from(terms.entries()).map(
    ([id, term]) => {
      const t = tally.get(id) ?? { answered: 0, correct: 0 };
      const correctPercent =
        t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : 0;
      return {
        questionId: id,
        text: term,
        scoring: 'binary',
        points: 1,
        correctPercent,
        incorrectPercent: t.answered > 0 ? 100 - correctPercent : null,
        answered: t.answered,
        graded: t.answered,
        correct: t.correct,
        pointsEarned: t.correct,
        pointsPossible: t.answered,
        servedCount: t.answered,
        choiceDistribution: [],
      };
    }
  );

  const perTeacher: AggregatePerTeacher[] = Array.from(teachers.entries())
    .map(([teacherUid, t]) => ({
      teacherUid,
      teacherName: t.name,
      classCount: t.classes.size,
      averagePercent: t.n > 0 ? Math.round(t.sum / t.n) : 0,
      studentCount: t.students,
    }))
    .sort((a, b) => (a.teacherUid < b.teacherUid ? -1 : 1));

  const scoreSum = scores.reduce((sum, v) => sum + v, 0);
  return {
    assessmentId: input.assessmentId,
    schemaVersion: AGGREGATE_SCHEMA_VERSION,
    title: input.title,
    kind: 'flashcard-check',
    teacherCount: teachers.size,
    studentCount,
    teamAveragePercent:
      scores.length > 0 ? Math.round(scoreSum / scores.length) : 0,
    scoredStudentCount: scores.length,
    scoreDistribution: bucketScores(scores),
    sessionCount: sessionIds.length,
    linkedSessionCount: input.sessions.length,
    // Flashcards checks show results as soon as a student submits.
    publishedSessionCount: input.sessions.length,
    computedFromSessionIds: sessionIds,
    alignment: 'byId',
    perQuestion,
    perTarget: [],
    perStandard: [],
    contributorUids: perTeacher.map((t) => t.teacherUid),
    perTeacher,
  };
}
