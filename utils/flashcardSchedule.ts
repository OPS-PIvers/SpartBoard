import type {
  FlashcardCard,
  FlashcardCardProgress,
  FlashcardSpeakProgress,
  FlashcardStudyState,
} from '@/types';

export const DEFAULT_FLASHCARD_MASTERY_THRESHOLD = 3;

const ROUND_GAPS: Record<FlashcardCardProgress['s'], number> = {
  0: 1,
  1: 1,
  2: 2,
  3: 4,
  4: 8,
};

export const createFlashcardProgress = (): FlashcardCardProgress => ({
  s: 0,
  due: 1,
  c: 0,
  w: 0,
});

export const createFlashcardStudyState = (): FlashcardStudyState => ({
  cards: {},
  starred: [],
  round: 1,
});

export const recordFlashcardAnswer = (
  progress: FlashcardCardProgress | undefined,
  currentRound: number,
  correct: boolean
): FlashcardCardProgress => {
  const current = progress ?? createFlashcardProgress();
  const streak = correct
    ? (Math.min(current.s + 1, 4) as FlashcardCardProgress['s'])
    : 0;

  return {
    s: streak,
    due: currentRound + ROUND_GAPS[streak],
    c: current.c + (correct ? 1 : 0),
    w: current.w + (correct ? 0 : 1),
  };
};

export const isFlashcardMastered = (
  progress: FlashcardCardProgress | undefined,
  threshold = DEFAULT_FLASHCARD_MASTERY_THRESHOLD
): boolean => (progress?.s ?? 0) >= threshold;

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededShuffle = <T>(items: T[], seed: string): T[] => {
  const shuffled = [...items];
  let state = hashSeed(seed) || 1;
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
};

export interface FlashcardRoundOptions {
  cards: FlashcardCard[];
  progress: Record<string, FlashcardCardProgress>;
  round: number;
  starred?: string[];
  favoritesOnly?: boolean;
  hideMastered?: boolean;
  masteryThreshold?: number;
  shuffle?: boolean;
  seed?: string;
}

export interface FlashcardRoundQueue {
  cards: FlashcardCard[];
  round: number;
}

/**
 * Builds the due-card queue and skips empty rounds without blocking practice.
 * Filters are applied before the due-round jump so hidden cards never pull the
 * learner into an otherwise empty future round.
 */
export const buildFlashcardRoundQueue = ({
  cards,
  progress,
  round,
  starred = [],
  favoritesOnly = false,
  hideMastered = false,
  masteryThreshold = DEFAULT_FLASHCARD_MASTERY_THRESHOLD,
  shuffle = false,
  seed = 'flashcards',
}: FlashcardRoundOptions): FlashcardRoundQueue => {
  const favoriteIds = new Set(starred);
  const eligible = cards.filter((card) => {
    if (favoritesOnly && !favoriteIds.has(card.id)) return false;
    if (
      hideMastered &&
      isFlashcardMastered(progress[card.id], masteryThreshold)
    ) {
      return false;
    }
    return true;
  });

  if (eligible.length === 0) return { cards: [], round };

  const dueRound = eligible.reduce((minimum, card) => {
    const due = progress[card.id]?.due ?? 1;
    return due <= round ? round : Math.min(minimum, due);
  }, Number.POSITIVE_INFINITY);
  const effectiveRound = Number.isFinite(dueRound) ? dueRound : round;
  const dueCards = eligible.filter(
    (card) => (progress[card.id]?.due ?? 1) <= effectiveRound
  );

  return {
    round: effectiveRound,
    cards: shuffle
      ? seededShuffle(dueCards, `${seed}:${effectiveRound}`)
      : dueCards,
  };
};

export const countMasteredFlashcards = (
  cards: FlashcardCard[],
  progress: Record<string, FlashcardCardProgress>,
  threshold = DEFAULT_FLASHCARD_MASTERY_THRESHOLD
): number =>
  cards.reduce(
    (count, card) =>
      count + (isFlashcardMastered(progress[card.id], threshold) ? 1 : 0),
    0
  );

export type FlashcardSpeakTally = Record<
  string,
  { n: number; m: number; f: number }
>;

const clampInt = (value: number, min: number, max: number): number =>
  Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : min;

/** F7: a Speak pass or fail on the shared spacing, plus best/last accuracy and tries. */
export const recordSpeakAnswer = (
  progress: FlashcardSpeakProgress | undefined,
  currentRound: number,
  passed: boolean,
  accuracy: number,
  tries: number
): FlashcardSpeakProgress => {
  const score = clampInt(accuracy, 0, 100);
  return {
    ...recordFlashcardAnswer(progress, currentRound, passed),
    best: Math.max(progress?.best ?? 0, score),
    last: score,
    tries: clampInt(tries, 1, 10),
  };
};

/** F8: adds one deciding attempt's per-token counts to the running tallies. */
export const mergeSpeakTally = (
  totals: FlashcardSpeakTally | undefined,
  delta: FlashcardSpeakTally
): FlashcardSpeakTally => {
  const next: FlashcardSpeakTally = { ...totals };
  for (const [token, add] of Object.entries(delta)) {
    const prev = next[token] ?? { n: 0, m: 0, f: 0 };
    next[token] = {
      n: prev.n + clampInt(add.n, 0, 1000),
      m: prev.m + clampInt(add.m, 0, 1000),
      f: prev.f + clampInt(add.f, 0, 1000),
    };
  }
  return next;
};

/** F2: a card can be spoken when it has references for its current term and isn't marked unavailable. */
export const isSpeakableCard = (card: FlashcardCard): boolean =>
  !!card.speak &&
  card.speak.status !== 'unavailable' &&
  card.speak.term === card.term &&
  card.speak.refs.some((ref) => ref.tokens.length > 0);

export interface SpeakRoundOptions extends Omit<
  FlashcardRoundOptions,
  'progress' | 'round'
> {
  speak: Record<string, FlashcardSpeakProgress> | undefined;
  speakRound: number | undefined;
}

/** The Speak queue: speakable cards on Speak's own progress and round counter (F7). */
export const buildSpeakRoundQueue = ({
  cards,
  speak,
  speakRound,
  seed = 'flashcards',
  ...rest
}: SpeakRoundOptions): FlashcardRoundQueue =>
  buildFlashcardRoundQueue({
    ...rest,
    cards: cards.filter(isSpeakableCard),
    progress: speak ?? {},
    round: speakRound ?? 1,
    seed: `${seed}:speak`,
  });
