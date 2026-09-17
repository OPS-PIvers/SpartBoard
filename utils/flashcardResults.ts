/**
 * Pure aggregation for the Flashcards teacher results views
 * (docs/plans/FLASHCARDS.md Q44/Q45). No Firestore, no React.
 */
import type {
  FlashcardCard,
  FlashcardCardProgress,
  FlashcardMode,
  FlashcardSession,
} from '@/types';
import { DEFAULT_FLASHCARD_MASTERY_THRESHOLD } from './flashcardSchedule';

export type FlashcardBucket = 'new' | 'learning' | 'familiar' | 'mastered';

export interface FlashcardBucketCounts {
  new: number;
  learning: number;
  familiar: number;
  mastered: number;
}

/** The shape the views need from one `progress/{studentUid}` document. */
export interface FlashcardResultRecord {
  studentUid: string;
  classId?: string;
  cards?: Record<string, FlashcardCardProgress>;
  round?: number;
  studyMs?: number;
  modesUsed?: FlashcardMode[];
  lastActiveAt?: number;
  tests?: Array<{ at: number; count: number; score: number }>;
  submittedAt?: number;
  score?: number;
  total?: number;
  answerLog?: Array<{
    cardId: string;
    response: string;
    correct?: boolean;
    attempts?: number;
  }>;
  flags?: Array<{ cardId: string; response: string; accepted?: boolean }>;
}

export interface FlashcardStudyRow {
  studentUid: string;
  classId: string;
  buckets: FlashcardBucketCounts;
  mastered: number;
  total: number;
  masteredPercent: number;
  studyMinutes: number;
  modesUsed: FlashcardMode[];
  lastActiveAt: number;
  started: boolean;
}

export interface FlashcardStudyAggregate {
  students: number;
  started: number;
  notStarted: number;
  averageMasteredPercent: number;
  buckets: FlashcardBucketCounts;
}

export interface FlashcardHardCard {
  card: FlashcardCard;
  wrong: number;
  correct: number;
  /** Students whose streak on this card is below the mastery threshold. */
  strugglingStudents: number;
}

export interface FlashcardCheckRow {
  studentUid: string;
  classId: string;
  submittedAt: number | null;
  score: number | null;
  total: number;
  percent: number | null;
  openFlags: number;
}

export interface FlashcardCardAccuracy {
  card: FlashcardCard;
  correct: number;
  answered: number;
  percent: number;
}

export interface FlashcardFlagRow {
  studentUid: string;
  cardId: string;
  card: FlashcardCard | null;
  response: string;
  expected: string;
  accepted?: boolean;
}

const emptyBuckets = (): FlashcardBucketCounts => ({
  new: 0,
  learning: 0,
  familiar: 0,
  mastered: 0,
});

export const flashcardBucketOf = (
  progress: FlashcardCardProgress | undefined,
  threshold = DEFAULT_FLASHCARD_MASTERY_THRESHOLD
): FlashcardBucket => {
  const streak = progress?.s ?? 0;
  if (streak >= threshold) return 'mastered';
  if (streak === 0) return 'new';
  return streak === 1 ? 'learning' : 'familiar';
};

export const sessionThreshold = (session: FlashcardSession): number =>
  session.masteryThreshold ?? DEFAULT_FLASHCARD_MASTERY_THRESHOLD;

/** The answer side a student types, per the teacher's locked `showFirst`. */
export const flashcardExpectedAnswer = (
  session: FlashcardSession,
  card: FlashcardCard
): string =>
  (session.lockedSettings?.showFirst ?? 'term') === 'term'
    ? card.definition
    : card.term;

export const filterResultsByClass = <T extends { classId?: string }>(
  results: readonly T[],
  classId: string | null
): T[] =>
  classId === null
    ? [...results]
    : results.filter((result) => (result.classId ?? '') === classId);

export const buildStudyRows = (
  session: FlashcardSession,
  results: readonly FlashcardResultRecord[]
): FlashcardStudyRow[] => {
  const threshold = sessionThreshold(session);
  const total = session.cards.length;
  return results.map((result) => {
    const buckets = emptyBuckets();
    for (const card of session.cards) {
      buckets[flashcardBucketOf(result.cards?.[card.id], threshold)] += 1;
    }
    const studyMs = result.studyMs ?? 0;
    return {
      studentUid: result.studentUid,
      classId: result.classId ?? '',
      buckets,
      mastered: buckets.mastered,
      total,
      masteredPercent: total === 0 ? 0 : (buckets.mastered / total) * 100,
      studyMinutes: Math.round(studyMs / 60000),
      modesUsed: result.modesUsed ?? [],
      lastActiveAt: result.lastActiveAt ?? 0,
      started: studyMs > 0 || buckets.new < total,
    };
  });
};

export const aggregateStudyRows = (
  rows: readonly FlashcardStudyRow[]
): FlashcardStudyAggregate => {
  const buckets = emptyBuckets();
  let percentSum = 0;
  let started = 0;
  for (const row of rows) {
    buckets.new += row.buckets.new;
    buckets.learning += row.buckets.learning;
    buckets.familiar += row.buckets.familiar;
    buckets.mastered += row.buckets.mastered;
    percentSum += row.masteredPercent;
    if (row.started) started += 1;
  }
  return {
    students: rows.length,
    started,
    notStarted: rows.length - started,
    averageMasteredPercent: rows.length === 0 ? 0 : percentSum / rows.length,
    buckets,
  };
};

/** Class-wide misses first, then cards the most students are still short on. */
export const hardestFlashcards = (
  session: FlashcardSession,
  results: readonly FlashcardResultRecord[],
  limit = 10
): FlashcardHardCard[] => {
  const threshold = sessionThreshold(session);
  const rows = session.cards.map((card) => {
    let wrong = 0;
    let correct = 0;
    let strugglingStudents = 0;
    for (const result of results) {
      const progress = result.cards?.[card.id];
      wrong += progress?.w ?? 0;
      correct += progress?.c ?? 0;
      const touched = (progress?.c ?? 0) + (progress?.w ?? 0) > 0;
      if (touched && (progress?.s ?? 0) < threshold) strugglingStudents += 1;
    }
    return { card, wrong, correct, strugglingStudents };
  });
  return rows
    .filter((row) => row.wrong > 0)
    .sort(
      (a, b) => b.wrong - a.wrong || b.strugglingStudents - a.strugglingStudents
    )
    .slice(0, limit);
};

export const buildCheckRows = (
  session: FlashcardSession,
  results: readonly FlashcardResultRecord[]
): FlashcardCheckRow[] => {
  const fallbackTotal = session.cards.length;
  return results.map((result) => {
    const total = result.total ?? fallbackTotal;
    const submitted = typeof result.submittedAt === 'number';
    const score = submitted ? (result.score ?? 0) : null;
    return {
      studentUid: result.studentUid,
      classId: result.classId ?? '',
      submittedAt: submitted ? (result.submittedAt ?? null) : null,
      score,
      total,
      percent: score === null || total === 0 ? null : (score / total) * 100,
      openFlags: (result.flags ?? []).filter(
        (flag) => flag.accepted === undefined
      ).length,
    };
  });
};

export const checkCardAccuracy = (
  session: FlashcardSession,
  results: readonly FlashcardResultRecord[]
): FlashcardCardAccuracy[] => {
  const byId = new Map(session.cards.map((card) => [card.id, card]));
  const tally = new Map<string, { correct: number; answered: number }>();
  for (const result of results) {
    if (typeof result.submittedAt !== 'number') continue;
    const accepted = new Set(
      (result.flags ?? [])
        .filter((flag) => flag.accepted === true)
        .map((flag) => flag.cardId)
    );
    for (const entry of result.answerLog ?? []) {
      if (!byId.has(entry.cardId)) continue;
      const current = tally.get(entry.cardId) ?? { correct: 0, answered: 0 };
      current.answered += 1;
      if (entry.correct === true || accepted.has(entry.cardId))
        current.correct += 1;
      tally.set(entry.cardId, current);
    }
  }
  return [...tally.entries()]
    .map(([cardId, counts]) => ({
      card: byId.get(cardId) as FlashcardCard,
      correct: counts.correct,
      answered: counts.answered,
      percent:
        counts.answered === 0 ? 0 : (counts.correct / counts.answered) * 100,
    }))
    .sort((a, b) => a.percent - b.percent);
};

export const buildFlagRows = (
  session: FlashcardSession,
  results: readonly FlashcardResultRecord[]
): FlashcardFlagRow[] => {
  const byId = new Map(session.cards.map((card) => [card.id, card]));
  return results.flatMap((result) =>
    (result.flags ?? []).map((flag) => {
      const card = byId.get(flag.cardId) ?? null;
      return {
        studentUid: result.studentUid,
        cardId: flag.cardId,
        card,
        response: flag.response,
        expected: card ? flashcardExpectedAnswer(session, card) : '',
        accepted: flag.accepted,
      };
    })
  );
};
