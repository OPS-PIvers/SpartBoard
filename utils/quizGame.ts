import type {
  GameClockStamp,
  QuizGameState,
  QuizSession,
  QuizSessionSection,
} from '@/types';
import { seededShuffle } from '@/utils/quizShuffle';
import { sectionOfQuestion } from '@/utils/quizSections';

/** Timestamp or epoch ms; null when absent. Mirrors stampMillis in functions/src/checkQuizGameAnswer.ts. */
export function gameStampMillis(
  value: GameClockStamp | null | undefined
): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return null;
}

export type GameClockPhase = 'waiting' | 'running' | 'paused' | 'over';

export interface GameClock {
  phase: GameClockPhase;
  /** Time left on the game clock, frozen while paused. */
  remainingMs: number;
}

/** Where the self-paced game clock stands at `nowMs` (server-offset time, plan D22). */
export function readGameClock(
  session: Pick<
    QuizSession,
    'status' | 'gameEndsAt' | 'gamePausedAt' | 'gameDurationMs'
  >,
  nowMs: number
): GameClock {
  if (session.status === 'ended') return { phase: 'over', remainingMs: 0 };
  const endsAt = gameStampMillis(session.gameEndsAt);
  if (endsAt === null)
    return { phase: 'waiting', remainingMs: session.gameDurationMs ?? 0 };
  const pausedAt = gameStampMillis(session.gamePausedAt);
  if (pausedAt !== null)
    return { phase: 'paused', remainingMs: Math.max(0, endsAt - pausedAt) };
  const remainingMs = endsAt - nowMs;
  if (remainingMs <= 0) return { phase: 'over', remainingMs: 0 };
  return { phase: 'running', remainingMs };
}

/** m:ss for a countdown, rounding up so 0:00 means time is really up. */
export function formatGameClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** An empty score, for a device whose first answer hasn't landed yet. */
export const EMPTY_GAME_STATE: QuizGameState = {
  points: 0,
  streak: 0,
  answered: 0,
  correct: 0,
  firstTry: {},
  lastCorrect: {},
  last: null,
};

/**
 * Questions this student plays, in pass-1 order: choose-N sections keep only
 * their picks once made (D18). Sections without picks yet keep every question.
 */
export function gamePlayOrder(
  passOneIds: readonly string[],
  sections: readonly QuizSessionSection[] | undefined,
  picks: Readonly<Record<string, readonly string[]>>
): string[] {
  return passOneIds.filter((id) => {
    const section = sectionOfQuestion(sections, id);
    const picked = section ? picks[section.id] : undefined;
    return !picked || picked.includes(id);
  });
}

/** Reorders `ids` so no question follows itself, starting away from `lastId`; drops what can't fit. */
export function avoidBackToBack(
  ids: readonly string[],
  lastId: string | null
): string[] {
  const remaining = [...ids];
  const out: string[] = [];
  let prev = lastId;
  while (remaining.length > 0) {
    const index = remaining.findIndex((id) => id !== prev);
    if (index === -1) break;
    const [id] = remaining.splice(index, 1);
    out.push(id);
    prev = id;
  }
  return out;
}

/** A later pass (D23): this student's misses first, then every question, reshuffled. */
export function buildRepeatCycle(
  order: readonly string[],
  game: Pick<QuizGameState, 'lastCorrect'>,
  lastId: string | null,
  seed: string
): string[] {
  const missed = order.filter((id) => game.lastCorrect[id] === false);
  return avoidBackToBack(
    [
      ...seededShuffle(missed, `${seed}:missed`),
      ...seededShuffle(order, `${seed}:all`),
    ],
    lastId
  );
}

export interface GameStep {
  /** Next question, or null when nothing can be served without a back-to-back repeat. */
  questionId: string | null;
  /** The later-pass queue left after this question. */
  queue: string[];
  /** Later passes built so far; seeds the next reshuffle. */
  cycles: number;
}

/**
 * Next question for a student (D23). Pass 1 walks `order`; afterwards the
 * device keeps a queue of misses-then-everything and refills it when empty.
 */
export function nextGameQuestion(
  order: readonly string[],
  game: Pick<QuizGameState, 'firstTry' | 'lastCorrect' | 'last'>,
  queue: readonly string[],
  cycles: number,
  seed: string
): GameStep {
  const unseen = order.find((id) => !(id in game.firstTry));
  if (unseen) return { questionId: unseen, queue: [...queue], cycles };
  const lastId = game.last?.questionId ?? null;
  const playable = new Set(order);
  let pending = avoidBackToBack(
    queue.filter((id) => playable.has(id)),
    lastId
  );
  let built = cycles;
  if (pending.length === 0) {
    built += 1;
    pending = buildRepeatCycle(order, game, lastId, `${seed}:cycle-${built}`);
  }
  const [questionId, ...rest] = pending;
  return { questionId: questionId ?? null, queue: rest, cycles: built };
}

/** Rank and points for this device from the teacher's broadcast, or null before one lands. */
export function findMyGameRank(
  entries: QuizSession['liveLeaderboard'],
  me: { pin?: string; studentUid?: string }
): { rank: number; score: number; of: number } | null {
  if (!entries?.length) return null;
  const mine = entries.find(
    (entry) =>
      (!!me.pin && entry.pin === me.pin) ||
      (!!me.studentUid && entry.studentUid === me.studentUid)
  );
  return mine
    ? { rank: mine.rank, score: mine.score, of: entries.length }
    : null;
}

/** Session fields that start the game clock now (teacher side). */
export function startGamePatch(
  session: Pick<QuizSession, 'gameDurationMs'>,
  nowMs: number,
  fallbackMs: number
): { status: 'active'; startedAt: number; gameEndsAt: number } {
  return {
    status: 'active',
    startedAt: nowMs,
    gameEndsAt: nowMs + (session.gameDurationMs ?? fallbackMs),
  };
}

/** The end time after resuming: pushed out by however long the game sat paused. */
export function resumedEndsAt(
  session: Pick<QuizSession, 'gameEndsAt' | 'gamePausedAt'>,
  nowMs: number
): number | null {
  const endsAt = gameStampMillis(session.gameEndsAt);
  if (endsAt === null) return null;
  const pausedAt = gameStampMillis(session.gamePausedAt);
  return pausedAt === null ? endsAt : endsAt + Math.max(0, nowMs - pausedAt);
}

/** +1 min: extends the clock, or restarts a clock that already ran out. */
export function addGameTimePatch(
  session: Pick<
    QuizSession,
    'gameEndsAt' | 'gamePausedAt' | 'gameAddedMs' | 'status'
  >,
  nowMs: number,
  addMs = 60_000
): { gameEndsAt: number; gameAddedMs: number } | null {
  const endsAt = gameStampMillis(session.gameEndsAt);
  if (endsAt === null || session.status === 'ended') return null;
  const paused = gameStampMillis(session.gamePausedAt) !== null;
  const base = !paused && endsAt < nowMs ? nowMs : endsAt;
  return {
    gameEndsAt: base + addMs,
    gameAddedMs: (session.gameAddedMs ?? 0) + addMs,
  };
}

/** Game points on screen: a full-credit question is worth 100 before bonuses. */
export function gameDisplayPoints(points: number): number {
  return Math.round(points * 100);
}

/** A device counts as active if it answered within this window. */
export const GAME_ACTIVE_WINDOW_MS = 30_000;

export interface GameBoardStats {
  joined: number;
  active: number;
  /** First-try accuracy across the class, 0–100; null before any first try. */
  firstTryPct: number | null;
}

/** Joined/active counts and live first-try accuracy for the game board (D25, D26). */
export function summarizeGameBoard(
  responses: readonly {
    status?: string;
    game?: Pick<QuizGameState, 'firstTry' | 'last'>;
  }[],
  nowMs: number
): GameBoardStats {
  let active = 0;
  let tries = 0;
  let right = 0;
  for (const response of responses) {
    const game = response.game;
    if (!game) continue;
    if (
      response.status !== 'completed' &&
      game.last &&
      nowMs - game.last.at <= GAME_ACTIVE_WINDOW_MS
    )
      active += 1;
    for (const ok of Object.values(game.firstTry)) {
      tries += 1;
      if (ok) right += 1;
    }
  }
  return {
    joined: responses.length,
    active,
    firstTryPct: tries > 0 ? Math.round((right / tries) * 100) : null,
  };
}
