import { deleteField } from 'firebase/firestore';
import type {
  QuizResponse,
  QuizResponseAnswer,
  ResponseArtifact,
  TakeMicState,
} from '@/types';

/**
 * Minimum interval between history snapshots for the same questionId on
 * the same response. The autosave debounce is 500 ms; without throttling
 * a long essay would fan out to hundreds of near-identical history docs.
 * 5 s gives "enough resolution to recover meaningful state" without
 * making history a per-keystroke audit log.
 */
const HISTORY_SNAPSHOT_THROTTLE_MS = 5000;

/**
 * Deterministic ledger doc id. Two underscores keep us safe even if a future
 * id contains a single underscore (Firestore doc ids allow underscores).
 * assignmentIds/sessionIds are UUIDs and HMAC pseudonyms are hex, so collisions
 * are not realistic, but the separator is cheap insurance.
 */
export function quizLedgerKey(
  assignmentId: string,
  studentUid: string
): string {
  return `${assignmentId}__${studentUid}`;
}

/** Mirrors the rules: a student cannot change a turned-in attempt's answers unless the teacher unlocked it. */
export function isAnswerLocked(
  r: Pick<QuizResponse, 'status' | 'unlocked'>
): boolean {
  return r.status === 'completed' && r.unlocked !== true;
}

/**
 * Build the `servedQuestionIds` portion of an answer-write patch (M17).
 * Returns {} when the doc already matches the live served subset, the ids
 * when it needs (re)writing, or a deleteField() when a mid-attempt override
 * removal must clear a stale snapshot. `served === undefined` means the
 * pointer subscription hasn't resolved yet — leave the doc untouched rather
 * than clearing a valid snapshot mid-load. Exported for unit tests.
 */
export function servedSnapshotPatch(
  served: string[] | null | undefined,
  onDoc: string[] | undefined
): { servedQuestionIds?: string[] | ReturnType<typeof deleteField> } {
  if (served === undefined) return {};
  if (served && served.length > 0) {
    const same =
      Array.isArray(onDoc) &&
      onDoc.length === served.length &&
      served.every((id, i) => onDoc[i] === id);
    return same ? {} : { servedQuestionIds: served };
  }
  return Array.isArray(onDoc) && onDoc.length > 0
    ? { servedQuestionIds: deleteField() }
    : {};
}

interface CommitRecordingTakeBase {
  questionId: string;
  /** Tennessen acknowledgment time, stamped on the take it authorised. */
  noticeAckedAt?: number;
  /** BCP-47 code the student was reading. Display hint only; never grades. */
  locale?: string;
  /** Mic state during the take (QUIZ_WHITEBOARD_RESPONSE D18). */
  micState?: TakeMicState;
}

/** A spoken take carries one artifact; a whiteboard take carries up to three (D19). */
export type CommitRecordingTakeInput = CommitRecordingTakeBase &
  (
    | { artifact: ResponseArtifact; artifacts?: never }
    | { artifacts: ResponseArtifact[]; artifact?: never }
  );

/** The artifacts a take commits, whichever shape the caller used. */
export function takeArtifacts(
  input: CommitRecordingTakeInput
): ResponseArtifact[] {
  return input.artifacts ?? [input.artifact];
}

/**
 * Defensive predicate: refuse a draft autosave that would overwrite a
 * non-empty saved answer with the empty string. Almost always indicates
 * a race (editor briefly emitted '' after a remount or a hydration miss)
 * rather than a deliberate clear. Explicit submits (`isDraft=false`)
 * bypass this — a student who really wants to clear an answer can still
 * submit empty.
 */
export function isUnsafeBlankDraft(
  answer: string,
  isDraft: boolean,
  priorEntry: QuizResponseAnswer | undefined
): boolean {
  return isDraft && answer === '' && !!priorEntry && priorEntry.answer !== '';
}

export interface CommittedAnswers {
  answers: QuizResponseAnswer[];
  status: QuizResponse['status'];
  baseWriteAt: unknown;
}

// What a transactional answers write leaves on the doc, keyed to the stamp it read.
export function committedFromPatch(
  read: QuizResponse,
  patch: Record<string, unknown>
): CommittedAnswers {
  return {
    answers:
      (patch.answers as QuizResponseAnswer[] | undefined) ?? read.answers ?? [],
    status:
      typeof patch.status === 'string'
        ? (patch.status as QuizResponse['status'])
        : read.status,
    baseWriteAt: read.lastWriteAt,
  };
}

// Resolves once every pending draft write settles, or after `ms` so an offline queue can't hang a submit.
export function settleDraftsWithin(
  drafts: Iterable<Promise<unknown>>,
  ms: number
): Promise<void> {
  const pending = [...drafts];
  if (pending.length === 0) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.allSettled(pending).then(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// True when server stamp `a` is strictly later than `b`; a missing or pending (null) `a` never is.
export function isWriteAtAfter(a: unknown, b: unknown): boolean {
  const parts = (t: unknown): [number, number] | null => {
    if (!t || typeof t !== 'object') return null;
    const { seconds, nanoseconds } = t as {
      seconds?: unknown;
      nanoseconds?: unknown;
    };
    return typeof seconds === 'number' && typeof nanoseconds === 'number'
      ? [seconds, nanoseconds]
      : null;
  };
  const pa = parts(a);
  if (!pa) return false;
  const pb = parts(b);
  if (!pb) return true;
  return pa[0] !== pb[0] ? pa[0] > pb[0] : pa[1] > pb[1];
}

/**
 * Defensive predicate: refuse a draft autosave that would downgrade an
 * already-submitted answer's status to 'draft'. The cache-driven
 * autosave path can re-fire for the same question during the SSO
 * listener-fast race window (back-nav before the response listener
 * echoes the just-submitted answer back, so the local `submitted` state
 * briefly flips false), and without this guard the autosave silently
 * flips status 'submitted' → 'draft' and drops the question from the
 * teacher's "Finished" view. Explicit submits (`isDraft=false`) still
 * pass through.
 */
export function isUnsafeStatusDowngrade(
  isDraft: boolean,
  priorEntry: QuizResponseAnswer | undefined
): boolean {
  // Use `!== 'draft'` rather than `=== 'submitted'` so legacy entries
  // with `status === undefined` (predate the draft flag — treated as
  // submitted everywhere else via `isAnswerSubmitted`) are also
  // protected from being silently downgraded to draft.
  return isDraft && priorEntry !== undefined && priorEntry.status !== 'draft';
}

/**
 * Decide whether to snapshot the prior answer entry to the history
 * subcollection before overwriting. Captures any prior non-empty value
 * the incoming write is about to lose — either because the text
 * changed, or because the status is being destructively downgraded
 * from 'submitted' to 'draft' (which can erase grading state even
 * with identical text). The per-question throttle keeps a long essay
 * from fanning out to hundreds of near-identical docs.
 */
export function shouldSnapshotHistory(
  priorEntry: QuizResponseAnswer | undefined,
  newAnswer: string,
  newIsDraft: boolean,
  lastSnapshotAt: number,
  now: number,
  throttleMs: number = HISTORY_SNAPSHOT_THROTTLE_MS
): boolean {
  if (!priorEntry) return false;
  if (priorEntry.answer === '') return false;
  const textChanged = priorEntry.answer !== newAnswer;
  // Mirror `isUnsafeStatusDowngrade`: treat legacy entries with
  // `status === undefined` as submitted so a downgrade attempt on a
  // legacy answer still gets a forensic snapshot.
  const statusDowngrade = priorEntry.status !== 'draft' && newIsDraft;
  if (!textChanged && !statusDowngrade) return false;
  return now - lastSnapshotAt >= throttleMs;
}

/**
 * Clock-skew tolerance applied to the history-removal window. History
 * `snapshotAt` is a Firestore server timestamp while the response doc's
 * `joinedAt` is a client `Date.now()` from a (possibly skewed) Chromebook,
 * so the two clocks can disagree by a few seconds. We pad the window by this
 * amount on both ends so the current occupant's own early/late snapshots are
 * never accidentally left behind — without widening it so far that a colliding
 * classmate's neighbouring entries get swept in. A prior occupant of a
 * `pin-{period}-{pin}` key joined and answered an entire session earlier (far
 * more than this pad), so they remain safely outside the window.
 */
export const HISTORY_REMOVAL_WINDOW_SKEW_MS = 60_000;

/**
 * Coerce a history doc's `snapshotAt` (Firestore Timestamp), or any
 * Timestamp/number/null shape, to epoch milliseconds. Returns `null` when the
 * value can't be interpreted as a time — callers treat that as "owner
 * unknown" and conservatively keep the doc rather than risk clobbering a
 * PIN-mate's entry.
 */
export function snapshotAtToMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const maybe = value as {
      toMillis?: () => number;
      seconds?: number;
    };
    if (typeof maybe.toMillis === 'function') {
      const ms = maybe.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof maybe.seconds === 'number' && Number.isFinite(maybe.seconds)) {
      return maybe.seconds * 1000;
    }
  }
  return null;
}

/**
 * Decide whether a single history doc belongs to the removed student's own
 * occupancy of the (possibly shared) response key, and may therefore be
 * deleted.
 *
 * Anonymous PIN joiners share a deterministic `pin-{period}-{pin}` response
 * doc (and its `/history` subcollection) with any roster-mate on the same
 * normalized period+PIN. Deleting the *entire* subcollection on
 * `removeStudent` would clobber a still-present classmate's recovery history.
 * We bound the delete to `[joinedAt - skew, removalTime + skew]` — the window
 * during which the removed student occupied the doc. `joinedAt` is immutable
 * once set and is stamped only when the response doc is (re)created, i.e. after
 * any prior occupant's doc was deleted and the key freed. So a prior occupant's
 * orphaned snapshots were all written before this occupant's `joinedAt`, fall
 * outside the window, and survive.
 *
 * Callers only invoke this when a `joinedAt` lower bound is actually known
 * (the removed student's response doc was resolved). Without that anchor there
 * is no basis to define the occupant's window, so the caller falls back to the
 * legacy whole-subcollection delete instead of calling this.
 *
 * Robustness:
 *  - `snapshotAtMs === null` (legacy/unreadable timestamp): KEEP the doc. The
 *    `create` rule has always stamped `snapshotAt == request.time`, so a
 *    genuinely missing server timestamp means a malformed/legacy doc whose
 *    owner we can't prove on a shared key — leave it rather than risk deleting
 *    a classmate's entry. Worst case is a small orphan tail (teacher/admin can
 *    sweep), never cross-student data loss.
 *  - The `skewMs` pad absorbs client/server clock disagreement (server
 *    `snapshotAt` vs. client `joinedAt`) so the current occupant's own
 *    boundary entries aren't stranded.
 */
export function isHistoryDocInRemovalWindow(
  snapshotAtMs: number | null,
  joinedAtMs: number,
  removalTimeMs: number,
  skewMs: number = HISTORY_REMOVAL_WINDOW_SKEW_MS
): boolean {
  // Unknown ownership → conservatively keep (never clobber a PIN-mate whose
  // snapshot we can't time-bound).
  if (snapshotAtMs === null) return false;
  const lower = joinedAtMs - skewMs;
  const upper = removalTimeMs + skewMs;
  return snapshotAtMs >= lower && snapshotAtMs <= upper;
}
