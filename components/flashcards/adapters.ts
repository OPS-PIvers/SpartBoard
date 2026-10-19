import type {
  FlashcardCardProgress,
  FlashcardCheckWriteEntry,
  FlashcardMode,
  FlashcardProgress,
  FlashcardSpeakProgress,
  FlashcardStudyState,
  FlashcardTestType,
} from '@/types';
import {
  createFlashcardStudyState,
  mergeSpeakTally,
  recordFlashcardAnswer,
  recordSpeakAnswer,
  type FlashcardSpeakTally,
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
  /** Speak (F7, F8); the round defaults to the state's own `speakRound`. */
  recordSpeak: (
    cardId: string,
    passed: boolean,
    accuracy: number,
    tries: number,
    tally: FlashcardSpeakTally,
    currentRound?: number
  ) => FlashcardStudyState;
  star: (cardId: string) => FlashcardStudyState;
  flush: (state?: FlashcardStudyState) => void | Promise<void>;
  reset: (options?: { keepStarred?: boolean }) => FlashcardStudyState;
  noteMode?: (mode: FlashcardMode) => void;
  recordTest?: (test: FlashcardTestRecord) => void;
}

const cloneMap = <T extends object>(
  map: Record<string, T>
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(map).map(([id, value]) => [id, { ...value }])
  );

// Speak keys appear only once used, so a state that never ran Speak keeps today's shape.
const cloneState = (state: FlashcardStudyState): FlashcardStudyState => ({
  cards: cloneMap(state.cards),
  starred: [...state.starred],
  round: state.round,
  ...(state.speak ? { speak: cloneMap(state.speak) } : {}),
  ...(state.speakRound !== undefined ? { speakRound: state.speakRound } : {}),
  ...(state.speakSounds ? { speakSounds: cloneMap(state.speakSounds) } : {}),
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

const isPct = (value: unknown): boolean =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;

const isSpeakProgress = (value: unknown): value is FlashcardSpeakProgress => {
  if (!isCardProgress(value)) return false;
  const progress = value as Partial<FlashcardSpeakProgress>;
  return (
    isPct(progress.best) &&
    isPct(progress.last) &&
    Number.isInteger(progress.tries) &&
    (progress.tries ?? 0) >= 1 &&
    (progress.tries ?? 11) <= 10
  );
};

const isCount = (value: unknown): boolean =>
  Number.isInteger(value) && (value as number) >= 0;

const isSoundTally = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const tally = value as Record<string, unknown>;
  return isCount(tally.n) && isCount(tally.m) && isCount(tally.f);
};

const filterMap = <T>(
  raw: unknown,
  keep: (value: unknown) => boolean
): Record<string, T> | undefined =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw).filter((entry) => keep(entry[1])))
    : undefined;

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
  const speak = filterMap<FlashcardSpeakProgress>(
    candidate.speak,
    isSpeakProgress
  );
  const speakSounds = filterMap<{ n: number; m: number; f: number }>(
    candidate.speakSounds,
    isSoundTally
  );
  return {
    cards,
    starred: [...new Set(starred)],
    round:
      Number.isInteger(candidate.round) && (candidate.round ?? 0) >= 1
        ? (candidate.round ?? 1)
        : 1,
    ...(speak ? { speak } : {}),
    ...(Number.isInteger(candidate.speakRound) &&
    (candidate.speakRound ?? 0) >= 1
      ? { speakRound: candidate.speakRound }
      : {}),
    ...(speakSounds ? { speakSounds } : {}),
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

  recordSpeak(
    cardId: string,
    passed: boolean,
    accuracy: number,
    tries: number,
    tally: FlashcardSpeakTally,
    currentRound = this.state.speakRound ?? 1
  ): FlashcardStudyState {
    this.state = {
      ...this.state,
      speakRound: currentRound,
      speak: {
        ...this.state.speak,
        [cardId]: recordSpeakAnswer(
          this.state.speak?.[cardId],
          currentRound,
          passed,
          accuracy,
          tries
        ),
      },
      speakSounds: mergeSpeakTally(this.state.speakSounds, tally),
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

export interface FlashcardRating {
  cardId: string;
  correct: boolean;
  round: number;
}

const TRACKED_FLUSH_DELAY_MS = 5000;

const sameValues = (a: object, b: object | undefined): boolean =>
  !!b &&
  Object.entries(a).every(
    ([key, value]) => (b as Record<string, unknown>)[key] === value
  );

const markChanged = <T extends object>(
  next: Record<string, T> | undefined,
  previous: Record<string, T> | undefined,
  dirty: Set<string>
): void => {
  for (const [id, value] of Object.entries(next ?? {})) {
    if (!sameValues(value, previous?.[id])) dirty.add(id);
  }
};

const pickEntries = <T extends object>(
  map: Record<string, T> | undefined,
  ids: string[]
): Record<string, T> | undefined => {
  const picked = ids
    .filter((id) => map && id in map)
    .map((id): [string, T] => [id, { ...(map as Record<string, T>)[id] }]);
  return picked.length > 0 ? Object.fromEntries(picked) : undefined;
};
const MAX_RATINGS_PER_CALL = 500;
const MAX_STUDY_GAP_MS = 2 * 60 * 1000;
const MAX_TESTS = 50;

/** Assignment progress in Firestore: merges only changed cards on a debounce. */
export class TrackedFlashcardAdapter extends BaseFlashcardAdapter {
  readonly showsMarks = true;
  override readonly canReset: boolean = false;
  private readonly write: (payload: FlashcardProgressWrite) => Promise<void>;
  private readonly rate?: (ratings: FlashcardRating[]) => Promise<unknown>;
  private ratings: FlashcardRating[] = [];
  private discarded = false;
  private readonly classId: string;
  private readonly now: () => number;
  private studyMs: number;
  private modesUsed: FlashcardMode[];
  private tests: FlashcardProgress['tests'];
  private checkLog: Record<string, FlashcardCheckWriteEntry>;
  private lastActivityAt: number;
  private readonly dirtyCards = new Set<string>();
  private readonly dirtyCheckLog = new Set<string>();
  private readonly dirtySpeak = new Set<string>();
  private readonly dirtySounds = new Set<string>();
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> = Promise.resolve();
  private paused = false;

  constructor(options: {
    classId: string;
    initial: Partial<FlashcardProgress> | null;
    write: (payload: FlashcardProgressWrite) => Promise<void>;
    /** Flashcards-mode Checks: the server owns `cards`, so ratings go here instead. */
    rate?: (ratings: FlashcardRating[]) => Promise<unknown>;
    now?: () => number;
  }) {
    super();
    this.write = options.write;
    this.rate = options.rate;
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
    // Mirrors the server: a card counts once per round it comes due, so a re-rate can't run ahead of it.
    if (this.rate && currentRound < (this.state.cards[cardId]?.due ?? 1)) {
      return this.load();
    }
    this.dirtyCards.add(cardId);
    if (this.rate) this.ratings.push({ cardId, correct, round: currentRound });
    return super.record(cardId, correct, currentRound);
  }

  override recordSpeak(
    cardId: string,
    passed: boolean,
    accuracy: number,
    tries: number,
    tally: FlashcardSpeakTally,
    currentRound?: number
  ): FlashcardStudyState {
    this.dirtySpeak.add(cardId);
    for (const token of Object.keys(tally)) this.dirtySounds.add(token);
    return super.recordSpeak(
      cardId,
      passed,
      accuracy,
      tries,
      tally,
      currentRound
    );
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
      markChanged(state.speak, this.state.speak, this.dirtySpeak);
      markChanged(state.speakSounds, this.state.speakSounds, this.dirtySounds);
      if (
        state.round !== this.state.round ||
        state.speakRound !== this.state.speakRound
      ) {
        this.dirty = true;
      }
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

  /** Holds writes (the rules would refuse them) while the student's period is shut; resuming sends them. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) void this.writeNow();
  }

  /** Cancels a pending debounce without writing. */
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** True while ratings the server hasn't confirmed are queued. */
  hasUnsentRatings(): boolean {
    return this.ratings.length > 0;
  }

  /** Drops unsaved work and refuses later writes, after a teacher reset deletes the progress doc. */
  discard(): void {
    this.dispose();
    this.discarded = true;
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
    if (this.timer || this.paused) return;
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
      this.discarded ||
      this.paused ||
      (!this.dirty &&
        this.dirtyCards.size === 0 &&
        this.dirtyCheckLog.size === 0 &&
        this.dirtySpeak.size === 0 &&
        this.dirtySounds.size === 0)
    ) {
      return this.pending;
    }
    const cardIds = this.rate ? [] : [...this.dirtyCards];
    const checkIds = [...this.dirtyCheckLog];
    const speakIds = [...this.dirtySpeak];
    const soundIds = [...this.dirtySounds];
    const ratings = this.ratings;
    this.ratings = [];
    this.dirtyCards.clear();
    this.dirtyCheckLog.clear();
    this.dirtySpeak.clear();
    this.dirtySounds.clear();
    this.dirty = false;
    const payload: FlashcardProgressWrite = {
      classId: this.classId,
      ...(this.rate
        ? {}
        : {
            cards: Object.fromEntries(
              cardIds
                .filter((cardId) => cardId in this.state.cards)
                .map((cardId) => [cardId, { ...this.state.cards[cardId] }])
            ),
          }),
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
    const speak = pickEntries(this.state.speak, speakIds);
    if (speak) payload.speak = speak;
    const speakSounds = pickEntries(this.state.speakSounds, soundIds);
    if (speakSounds) payload.speakSounds = speakSounds;
    if (this.state.speakRound !== undefined) {
      payload.speakRound = this.state.speakRound;
    }
    const rate = this.rate;
    this.pending = this.pending
      .then(() => (this.discarded ? undefined : this.write(payload)))
      .catch((error: unknown) => {
        for (const cardId of cardIds) this.dirtyCards.add(cardId);
        for (const cardId of checkIds) this.dirtyCheckLog.add(cardId);
        for (const cardId of speakIds) this.dirtySpeak.add(cardId);
        for (const token of soundIds) this.dirtySounds.add(token);
        this.dirty = true;
        console.error('[TrackedFlashcardAdapter] Progress save failed:', error);
      })
      .then(async () => {
        // The callable takes at most 600 ratings, so a long offline queue goes in chunks.
        for (
          let start = 0;
          start < ratings.length;
          start += MAX_RATINGS_PER_CALL
        ) {
          // A reset may land while this chain is pending; don't recreate the deleted doc.
          if (!rate || this.discarded) return;
          const chunk = ratings.slice(start, start + MAX_RATINGS_PER_CALL);
          try {
            await rate(chunk);
          } catch (error: unknown) {
            // The server ignores a rating whose round it has already applied, so resending is safe.
            this.ratings = [...ratings.slice(start), ...this.ratings];
            this.dirty = true;
            console.error(
              '[TrackedFlashcardAdapter] Rating save failed:',
              error
            );
            return;
          }
        }
      });
    return this.pending;
  }
}
