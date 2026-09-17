import type {
  FlashcardCard,
  FlashcardCardProgress,
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
