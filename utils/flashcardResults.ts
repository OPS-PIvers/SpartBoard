/**
 * Pure aggregation for the Flashcards teacher results views
 * (docs/plans/shipped/FLASHCARDS.md Q44/Q45). No Firestore, no React.
 */
import type {
  FlashcardCard,
  FlashcardCardProgress,
  FlashcardMode,
  FlashcardSession,
  FlashcardSpeakProgress,
  SpeakLanguage,
} from '@/types';
import { isKnownSpeakSound } from '@/config/pronunciationSoundNames';
import {
  DEFAULT_FLASHCARD_MASTERY_THRESHOLD,
  isSpeakableCard,
} from './flashcardSchedule';

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
  speak?: Record<string, FlashcardSpeakProgress>;
  speakSounds?: Record<string, { n: number; m: number; f: number }>;
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

export interface FlashcardSpeakRow {
  studentUid: string;
  classId: string;
  /** False when this student's device never ran Speak, shown as "—" (F10). */
  ran: boolean;
  mastered: number;
  inProgress: number;
  notStarted: number;
  total: number;
  masteredPercent: number;
  /** Up to three most-missed sound tokens, most missed first. */
  missedSounds: string[];
}

export interface FlashcardSpeakAggregate {
  students: number;
  ran: number;
  notRan: number;
  averageMasteredPercent: number;
}

export interface FlashcardSpeakSoundTotal {
  token: string;
  n: number;
  m: number;
  f: number;
}

export interface FlashcardSpeakWordToCheck {
  card: FlashcardCard;
  tried: number;
  failed: number;
}

/** F10 "words to check": at least this many students tried the word. */
export const SPEAK_WORDS_TO_CHECK_MIN_STUDENTS = 5;
/** ...and at least this share of them failed their last round. */
export const SPEAK_WORDS_TO_CHECK_FAIL_SHARE = 0.6;

// Progress is client-written, so every number is clamped to a small whole count.
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.round(value), 100000)
    : 0;

const speakTouched = (progress: FlashcardSpeakProgress | undefined): boolean =>
  count(progress?.c) + count(progress?.w) > 0;

const knownSounds = (
  sounds: FlashcardResultRecord['speakSounds'],
  language: SpeakLanguage
): FlashcardSpeakSoundTotal[] =>
  Object.entries(sounds ?? {})
    .filter(([token]) => isKnownSpeakSound(language, token))
    .map(([token, tally]) => ({
      token,
      n: count(tally?.n),
      m: count(tally?.m),
      f: count(tally?.f),
    }));

const byMissed = (a: FlashcardSpeakSoundTotal, b: FlashcardSpeakSoundTotal) =>
  b.m - a.m ||
  b.m / Math.max(b.n, 1) - a.m / Math.max(a.n, 1) ||
  a.token.localeCompare(b.token);

export const buildSpeakRows = (
  session: FlashcardSession,
  results: readonly FlashcardResultRecord[],
  language: SpeakLanguage
): FlashcardSpeakRow[] => {
  const threshold = sessionThreshold(session);
  const cards = session.cards.filter(isSpeakableCard);
  return results.map((result) => {
    let mastered = 0;
    let inProgress = 0;
    for (const card of cards) {
      const progress = result.speak?.[card.id];
      if (!speakTouched(progress)) continue;
      if (count(progress?.s) >= threshold) mastered += 1;
      else inProgress += 1;
    }
    const sounds = knownSounds(result.speakSounds, language);
    const ran =
      mastered + inProgress > 0 || sounds.some((sound) => sound.n > 0);
    return {
      studentUid: result.studentUid,
      classId: result.classId ?? '',
      ran,
      mastered,
      inProgress,
      notStarted: cards.length - mastered - inProgress,
      total: cards.length,
      masteredPercent: cards.length === 0 ? 0 : (mastered / cards.length) * 100,
      missedSounds: sounds
        .filter((sound) => sound.m > 0)
        .sort(byMissed)
        .slice(0, 3)
        .map((sound) => sound.token),
    };
  });
};

/** Averages only students who ran Speak, so never-ran students don't read as 0%. */
export const aggregateSpeakRows = (
  rows: readonly FlashcardSpeakRow[]
): FlashcardSpeakAggregate => {
  const ranRows = rows.filter((row) => row.ran);
  const percentSum = ranRows.reduce((sum, row) => sum + row.masteredPercent, 0);
  return {
    students: rows.length,
    ran: ranRows.length,
    notRan: rows.length - ranRows.length,
    averageMasteredPercent:
      ranRows.length === 0 ? 0 : percentSum / ranRows.length,
  };
};

export const speakClassSounds = (
  results: readonly FlashcardResultRecord[],
  language: SpeakLanguage
): FlashcardSpeakSoundTotal[] => {
  const totals = new Map<string, FlashcardSpeakSoundTotal>();
  for (const result of results) {
    for (const sound of knownSounds(result.speakSounds, language)) {
      const current = totals.get(sound.token) ?? {
        token: sound.token,
        n: 0,
        m: 0,
        f: 0,
      };
      current.n += sound.n;
      current.m += sound.m;
      current.f += sound.f;
      totals.set(sound.token, current);
    }
  }
  return [...totals.values()];
};

export const mostMissedSounds = (
  totals: readonly FlashcardSpeakSoundTotal[],
  limit = 5
): FlashcardSpeakSoundTotal[] =>
  totals
    .filter((sound) => sound.m > 0)
    .sort(byMissed)
    .slice(0, limit);

export const mostForgivenSounds = (
  totals: readonly FlashcardSpeakSoundTotal[],
  limit = 5
): FlashcardSpeakSoundTotal[] =>
  totals
    .filter((sound) => sound.f > 0)
    .sort(
      (a, b) =>
        b.f - a.f ||
        b.f / Math.max(b.n, 1) - a.f / Math.max(a.n, 1) ||
        a.token.localeCompare(b.token)
    )
    .slice(0, limit);

/** F10: words most students fail aloud point at a scorer problem more than a teaching one. */
export const speakWordsToCheck = (
  session: FlashcardSession,
  results: readonly FlashcardResultRecord[]
): FlashcardSpeakWordToCheck[] =>
  session.cards
    .filter(isSpeakableCard)
    .map((card) => {
      let tried = 0;
      let failed = 0;
      for (const result of results) {
        const progress = result.speak?.[card.id];
        if (!speakTouched(progress)) continue;
        tried += 1;
        // A failed round resets the streak, so s 0 means the last round failed.
        if (count(progress?.s) === 0) failed += 1;
      }
      return { card, tried, failed };
    })
    .filter(
      (word) =>
        word.tried >= SPEAK_WORDS_TO_CHECK_MIN_STUDENTS &&
        word.failed / word.tried >= SPEAK_WORDS_TO_CHECK_FAIL_SHARE
    )
    .sort(
      (a, b) =>
        b.failed / b.tried - a.failed / a.tried ||
        b.tried - a.tried ||
        a.card.term.localeCompare(b.card.term)
    );
