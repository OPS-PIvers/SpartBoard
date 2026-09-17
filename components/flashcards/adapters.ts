import type {
  FlashcardCardProgress,
  FlashcardCheckWriteEntry,
  FlashcardMode,
  FlashcardProgress,
  FlashcardStudyState,
  FlashcardTestType,
} from '@/types';
import {
  createFlashcardStudyState,
  recordFlashcardAnswer,
} from '@/utils/flashcardSchedule';

export interface FlashcardTestRecord {
  types: FlashcardTestType[];
  count: number;
  score: number;
}

export interface FlashcardProgressAdapter {
  readonly showsMarks: boolean;
  /** False when a teacher tracks progress, so students can't wipe it. */
  readonly canReset: boolean;
  load: () => FlashcardStudyState;
  record: (
    cardId: string,
    correct: boolean,
    currentRound: number
  ) => FlashcardStudyState;
  star: (cardId: string) => FlashcardStudyState;
  flush: (state?: FlashcardStudyState) => void | Promise<void>;
  reset: (options?: { keepStarred?: boolean }) => FlashcardStudyState;
  noteMode?: (mode: FlashcardMode) => void;
  recordTest?: (test: FlashcardTestRecord) => void;
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

export const sanitizeFlashcardStudyState = (
  value: unknown
): FlashcardStudyState => {
  if (typeof value !== 'object' || value === null) {
    return createFlashcardStudyState();
  }
  const candidate = value as Partial<FlashcardStudyState>;
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
};

const parseStoredState = (raw: string | null): FlashcardStudyState | null => {
  if (!raw) return null;
  try {
    return sanitizeFlashcardStudyState(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

abstract class BaseFlashcardAdapter implements FlashcardProgressAdapter {
  abstract readonly showsMarks: boolean;
  readonly canReset: boolean = true;
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

  constructor(shareId: string, initialState?: FlashcardStudyState) {
    super();
    this.storageKey = `spart.flashcards.v1.${shareId}`;
    let stored: FlashcardStudyState | null = null;
    try {
      stored = parseStoredState(localStorage.getItem(this.storageKey));
    } catch {
      stored = null;
    }
    this.state = cloneState(
      stored ?? initialState ?? createFlashcardStudyState()
    );
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

export type FlashcardProgressWrite = Partial<
  Omit<
    FlashcardProgress,
    'submittedAt' | 'score' | 'total' | 'answerLog' | 'flags'
  >
>;

const TRACKED_FLUSH_DELAY_MS = 5000;
const MAX_STUDY_GAP_MS = 2 * 60 * 1000;
const MAX_TESTS = 50;

/** Assignment progress in Firestore: merges only changed cards on a debounce. */
export class TrackedFlashcardAdapter extends BaseFlashcardAdapter {
  readonly showsMarks = true;
  override readonly canReset: boolean = false;
  private readonly write: (payload: FlashcardProgressWrite) => Promise<void>;
  private readonly classId: string;
  private readonly now: () => number;
  private studyMs: number;
  private modesUsed: FlashcardMode[];
  private tests: FlashcardProgress['tests'];
  private checkLog: Record<string, FlashcardCheckWriteEntry>;
  private lastActivityAt: number;
  private readonly dirtyCards = new Set<string>();
  private readonly dirtyCheckLog = new Set<string>();
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(options: {
    classId: string;
    initial: Partial<FlashcardProgress> | null;
    write: (payload: FlashcardProgressWrite) => Promise<void>;
    now?: () => number;
  }) {
    super();
    this.write = options.write;
    this.classId = options.classId;
    this.now = options.now ?? Date.now;
    this.state = sanitizeFlashcardStudyState(options.initial);
    const initial = options.initial ?? {};
    this.studyMs =
      typeof initial.studyMs === 'number' && initial.studyMs >= 0
        ? Math.round(initial.studyMs)
        : 0;
    this.modesUsed = Array.isArray(initial.modesUsed)
      ? [...initial.modesUsed]
      : [];
    this.tests = Array.isArray(initial.tests) ? [...initial.tests] : [];
    this.checkLog =
      typeof initial.checkLog === 'object' && initial.checkLog !== null
        ? { ...initial.checkLog }
        : {};
    this.lastActivityAt = this.now();
  }

  override record(
    cardId: string,
    correct: boolean,
    currentRound: number
  ): FlashcardStudyState {
    this.dirtyCards.add(cardId);
    return super.record(cardId, correct, currentRound);
  }

  override flush(state?: FlashcardStudyState): Promise<void> {
    if (state) {
      for (const [cardId, progress] of Object.entries(state.cards)) {
        const previous = this.state.cards[cardId];
        if (
          !previous ||
          previous.s !== progress.s ||
          previous.due !== progress.due ||
          previous.c !== progress.c ||
          previous.w !== progress.w
        ) {
          this.dirtyCards.add(cardId);
        }
      }
      if (state.round !== this.state.round) this.dirty = true;
      this.state = cloneState(state);
    }
    return this.writeNow();
  }

  noteMode(mode: FlashcardMode): void {
    this.touch();
    if (!this.modesUsed.includes(mode)) {
      this.modesUsed = [...this.modesUsed, mode];
    }
    this.schedule();
  }

  recordTest(test: FlashcardTestRecord): void {
    this.touch();
    this.tests = [{ at: this.now(), ...test }, ...this.tests].slice(
      0,
      MAX_TESTS
    );
    this.schedule();
  }

  loadCheckLog(): Record<string, FlashcardCheckWriteEntry> {
    return { ...this.checkLog };
  }

  recordCheckWrite(cardId: string, entry: FlashcardCheckWriteEntry): void {
    this.touch();
    this.checkLog = { ...this.checkLog, [cardId]: { ...entry } };
    this.dirtyCheckLog.add(cardId);
    this.schedule();
  }

  /** Cancels a pending debounce without writing. */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  protected persist(): void {
    this.touch();
    this.schedule();
  }

  private touch(): void {
    const now = this.now();
    this.studyMs += Math.max(
      0,
      Math.min(now - this.lastActivityAt, MAX_STUDY_GAP_MS)
    );
    this.lastActivityAt = now;
    this.dirty = true;
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.writeNow();
    }, TRACKED_FLUSH_DELAY_MS);
  }

  private writeNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (
      !this.dirty &&
      this.dirtyCards.size === 0 &&
      this.dirtyCheckLog.size === 0
    ) {
      return this.pending;
    }
    const cardIds = [...this.dirtyCards];
    const checkIds = [...this.dirtyCheckLog];
    this.dirtyCards.clear();
    this.dirtyCheckLog.clear();
    this.dirty = false;
    const payload: FlashcardProgressWrite = {
      classId: this.classId,
      cards: Object.fromEntries(
        cardIds
          .filter((cardId) => cardId in this.state.cards)
          .map((cardId) => [cardId, { ...this.state.cards[cardId] }])
      ),
      starred: [...this.state.starred],
      round: this.state.round,
      studyMs: Math.round(this.studyMs),
      modesUsed: [...this.modesUsed],
      tests: [...this.tests],
      lastActiveAt: this.now(),
    };
    if (checkIds.length > 0) {
      payload.checkLog = Object.fromEntries(
        checkIds.map((cardId) => [cardId, { ...this.checkLog[cardId] }])
      );
    }
    this.pending = this.pending
      .then(() => this.write(payload))
      .catch((error: unknown) => {
        for (const cardId of cardIds) this.dirtyCards.add(cardId);
        for (const cardId of checkIds) this.dirtyCheckLog.add(cardId);
        this.dirty = true;
        console.error('[TrackedFlashcardAdapter] Progress save failed:', error);
      });
    return this.pending;
  }
}
