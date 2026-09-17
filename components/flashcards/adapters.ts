import type { FlashcardCardProgress, FlashcardStudyState } from '@/types';
import {
  createFlashcardStudyState,
  recordFlashcardAnswer,
} from '@/utils/flashcardSchedule';

export interface FlashcardProgressAdapter {
  readonly showsMarks: boolean;
  load: () => FlashcardStudyState;
  record: (
    cardId: string,
    correct: boolean,
    currentRound: number
  ) => FlashcardStudyState;
  star: (cardId: string) => FlashcardStudyState;
  flush: (state?: FlashcardStudyState) => void | Promise<void>;
  reset: (options?: { keepStarred?: boolean }) => FlashcardStudyState;
}

const cloneState = (state: FlashcardStudyState): FlashcardStudyState => ({
  cards: Object.fromEntries(
    Object.entries(state.cards).map(([id, progress]) => [id, { ...progress }])
  ),
  starred: [...state.starred],
  round: state.round,
});

const isCardProgress = (value: unknown): value is FlashcardCardProgress => {
  if (typeof value !== 'object' || value === null) return false;
  const progress = value as Partial<FlashcardCardProgress>;
  return (
    Number.isInteger(progress.s) &&
    (progress.s ?? -1) >= 0 &&
    (progress.s ?? 5) <= 4 &&
    Number.isInteger(progress.due) &&
    (progress.due ?? 0) >= 1 &&
    Number.isInteger(progress.c) &&
    (progress.c ?? -1) >= 0 &&
    Number.isInteger(progress.w) &&
    (progress.w ?? -1) >= 0
  );
};

const parseStoredState = (raw: string | null): FlashcardStudyState => {
  if (!raw) return createFlashcardStudyState();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return createFlashcardStudyState();
    }
    const candidate = parsed as Partial<FlashcardStudyState>;
    const cards =
      typeof candidate.cards === 'object' && candidate.cards !== null
        ? Object.fromEntries(
            Object.entries(candidate.cards).filter((entry) =>
              isCardProgress(entry[1])
            )
          )
        : {};
    const starred = Array.isArray(candidate.starred)
      ? candidate.starred.filter(
          (cardId): cardId is string => typeof cardId === 'string'
        )
      : [];
    return {
      cards,
      starred: [...new Set(starred)],
      round:
        Number.isInteger(candidate.round) && (candidate.round ?? 0) >= 1
          ? (candidate.round ?? 1)
          : 1,
    };
  } catch {
    return createFlashcardStudyState();
  }
};

abstract class BaseFlashcardAdapter implements FlashcardProgressAdapter {
  abstract readonly showsMarks: boolean;
  protected state: FlashcardStudyState = createFlashcardStudyState();

  load(): FlashcardStudyState {
    return cloneState(this.state);
  }

  record(
    cardId: string,
    correct: boolean,
    currentRound: number
  ): FlashcardStudyState {
    this.state = {
      ...this.state,
      round: currentRound,
      cards: {
        ...this.state.cards,
        [cardId]: recordFlashcardAnswer(
          this.state.cards[cardId],
          currentRound,
          correct
        ),
      },
    };
    this.persist();
    return this.load();
  }

  star(cardId: string): FlashcardStudyState {
    const starred = new Set(this.state.starred);
    if (starred.has(cardId)) starred.delete(cardId);
    else starred.add(cardId);
    this.state = { ...this.state, starred: [...starred] };
    this.persist();
    return this.load();
  }

  flush(state?: FlashcardStudyState): void {
    if (state) this.state = cloneState(state);
    this.persist();
  }

  reset(options?: { keepStarred?: boolean }): FlashcardStudyState {
    this.state = {
      ...createFlashcardStudyState(),
      starred: options?.keepStarred ? [...this.state.starred] : [],
    };
    this.persist();
    return this.load();
  }

  protected abstract persist(): void;
}

export class LocalFlashcardAdapter extends BaseFlashcardAdapter {
  readonly showsMarks = true;
  private readonly storageKey: string;

  constructor(shareId: string) {
    super();
    this.storageKey = `spart.flashcards.v1.${shareId}`;
    try {
      this.state = parseStoredState(localStorage.getItem(this.storageKey));
    } catch {
      this.state = createFlashcardStudyState();
    }
  }

  protected persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch {
      // Partitioned/private storage can be unavailable. The in-memory state
      // remains usable for the lifetime of the page.
    }
  }
}

export class MemoryFlashcardAdapter extends BaseFlashcardAdapter {
  readonly showsMarks = false;

  protected persist(): void {
    // Present mode intentionally keeps progress in memory only.
  }
}
