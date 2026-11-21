// Server mirror of utils/writingResponseState.ts; utils/writingResponseState.test.ts fails if the body below drifts.
// ---- shared body ----

/** Where a student's piece stands (D12); `draft` and `revising` are the unlocked states. */
export type WritingResponseStatus =
  'draft' | 'turned-in' | 'returned' | 'revising';

/** Who turned a piece in: the student, the time limit running out, or the teacher. */
export type WritingTurnedInBy = 'student' | 'timer' | 'teacher';

export const WRITING_RESPONSE_STATUSES: readonly WritingResponseStatus[] = [
  'draft',
  'turned-in',
  'returned',
  'revising',
];

/** D25: one log chunk holds this many bytes, about 6,000 words of typing. */
export const WRITING_LOG_CHUNK_BYTES = 200_000;
/** D25: ten chunks per piece; past them recording stops and the summary keeps counting. */
export const WRITING_LOG_MAX_CHUNKS = 10;
/** The grace the rules give a write landing just after a close, matched by the functions. */
export const WRITING_CLOSE_GRACE_MS = 120_000;
/** A timed turn in waits for the clock, give or take a client clock this far ahead. */
export const WRITING_TIMER_SKEW_MS = 5_000;
/** The holding tab's final text is taken this long after the deadline; the rules give saves the same grace. */
export const WRITING_TIMED_FLUSH_GRACE_MS = 30_000;
/** A frozen copy's text, in UTF-8 bytes, so a copy with its feedback stays under Firestore's 1 MiB. */
export const WRITING_HTML_MAX_BYTES = 400_000;

/** The student can write: a first draft or a revision. */
export function isWritingUnlocked(status: WritingResponseStatus): boolean {
  return status === 'draft' || status === 'revising';
}

/** Reads a stored response into a status; an unknown value falls back on the turn-in stamp. */
export function deriveWritingStatus(doc: unknown): WritingResponseStatus {
  if (typeof doc !== 'object' || doc === null) return 'draft';
  const raw = (doc as { status?: unknown }).status;
  if ((WRITING_RESPONSE_STATUSES as readonly unknown[]).includes(raw))
    return raw as WritingResponseStatus;
  return typeof (doc as { turnedInAt?: unknown }).turnedInAt === 'number'
    ? 'turned-in'
    : 'draft';
}

/** Turned in, returned or not, as the student landing counts it. */
export function isWritingTurnedIn(status: WritingResponseStatus): boolean {
  return status === 'turned-in' || status === 'returned';
}

export interface WritingTakeBackFacts {
  now: number;
  /** The due date that applies to this student; null when there is none. */
  dueAt: number | null;
  /** The latest frozen copy has teacher feedback or a grade. */
  hasFeedback: boolean;
  /** The assignment has a time limit. */
  timed: boolean;
  /** The close that applies to this student, the teacher's end included; null or absent when there is none. */
  closeAt?: number | null;
}

export type WritingTakeBackBlock =
  'not-turned-in' | 'feedback' | 'past-due' | 'timed' | 'closed';

/** D12: why take back is refused, or null when it is allowed. */
export function takeBackBlock(
  status: WritingResponseStatus,
  facts: WritingTakeBackFacts
): WritingTakeBackBlock | null {
  if (status !== 'turned-in') return 'not-turned-in';
  if (facts.timed) return 'timed';
  if (facts.hasFeedback) return 'feedback';
  if (facts.dueAt !== null && facts.now > facts.dueAt) return 'past-due';
  if (
    facts.closeAt != null &&
    facts.now > facts.closeAt + WRITING_CLOSE_GRACE_MS
  )
    return 'closed';
  return null;
}

export function canTakeBack(
  status: WritingResponseStatus,
  facts: WritingTakeBackFacts
): boolean {
  return takeBackBlock(status, facts) === null;
}

export interface WritingTurnInFacts {
  now: number;
  /** The close that applies to this student, the teacher's end included; null when there is none. */
  closeAt: number | null;
  wordCount: number;
  minWords?: number;
  maxWords?: number;
  enforceWordLimit?: boolean;
}

export type WritingTurnInBlock = 'locked' | 'closed' | 'too-short' | 'too-long';

/** Why a student's own turn in is refused, or null when it is allowed. */
export function turnInBlock(
  status: WritingResponseStatus,
  facts: WritingTurnInFacts
): WritingTurnInBlock | null {
  if (!isWritingUnlocked(status)) return 'locked';
  if (
    facts.closeAt !== null &&
    facts.now > facts.closeAt + WRITING_CLOSE_GRACE_MS
  )
    return 'closed';
  if (facts.enforceWordLimit) {
    if (facts.minWords !== undefined && facts.wordCount < facts.minWords)
      return 'too-short';
    if (facts.maxWords !== undefined && facts.wordCount > facts.maxWords)
      return 'too-long';
  }
  return null;
}

export function canTurnIn(
  status: WritingResponseStatus,
  facts: WritingTurnInFacts
): boolean {
  return turnInBlock(status, facts) === null;
}

/** Feedback goes on a frozen copy that still exists, while the piece is turned in, returned or being revised. */
export function canSaveFeedback(
  status: WritingResponseStatus,
  draftExists: boolean
): boolean {
  return draftExists && status !== 'draft';
}

export type WritingEvent =
  | { type: 'turn-in' }
  | { type: 'take-back'; facts: WritingTakeBackFacts; draftsLeft: number }
  | { type: 'return' }
  | { type: 'return-for-revision' };

/** The status after an event, or the same status for a refused one; Return locks, Return for revision unlocks. */
export function writingTransition(
  status: WritingResponseStatus,
  event: WritingEvent
): WritingResponseStatus {
  switch (status) {
    case 'draft':
    case 'revising':
      if (event.type === 'turn-in') return 'turned-in';
      if (status === 'revising' && event.type === 'return-for-revision')
        return 'revising';
      return status;
    case 'turned-in':
      if (event.type === 'take-back')
        return canTakeBack(status, event.facts)
          ? event.draftsLeft > 0
            ? 'revising'
            : 'draft'
          : status;
      if (event.type === 'return') return 'returned';
      if (event.type === 'return-for-revision') return 'revising';
      return status;
    case 'returned':
      if (event.type === 'return') return 'returned';
      if (event.type === 'return-for-revision') return 'revising';
      return status;
  }
}

/** True when the event changes the status or is an allowed repeat (Return twice, Return for revision twice). */
export function writingEventAllowed(
  status: WritingResponseStatus,
  event: WritingEvent
): boolean {
  if (writingTransition(status, event) !== status) return true;
  return (
    (status === 'returned' && event.type === 'return') ||
    (status === 'revising' && event.type === 'return-for-revision')
  );
}

/** The close for one student: their pointer's or the session's, brought forward to the teacher's end. */
export function resolveWritingCloseAt(
  session: { closeAt?: unknown; status?: unknown; endedAt?: unknown },
  pointerCloseAt?: unknown
): number | null {
  const close =
    typeof pointerCloseAt === 'number'
      ? pointerCloseAt
      : typeof session.closeAt === 'number'
        ? session.closeAt
        : null;
  if (session.status !== 'ended') return close;
  const ended = typeof session.endedAt === 'number' ? session.endedAt : 0;
  return close === null ? ended : Math.min(close, ended);
}

/** The due date for one student: their pointer's, else their class's, else the session's. */
export function resolveWritingDueAt(
  session: { dueAt?: unknown; dueAtByClassId?: unknown },
  classId: string | null,
  pointerDueAt?: unknown
): number | null {
  if (typeof pointerDueAt === 'number') return pointerDueAt;
  const byClass = session.dueAtByClassId;
  if (classId && typeof byClass === 'object' && byClass !== null) {
    const v = (byClass as Record<string, unknown>)[classId];
    if (typeof v === 'number') return v;
  }
  return typeof session.dueAt === 'number' ? session.dueAt : null;
}

/** D7 with D22's extra time: the clock's end, or null when unlimited. */
export function writingDeadline(
  startedAt: number,
  timeLimitMinutes: unknown,
  timeMultiplier?: unknown
): number | null {
  if (typeof timeLimitMinutes !== 'number' || timeLimitMinutes <= 0)
    return null;
  if (timeMultiplier === 'unlimited') return null;
  const factor =
    timeMultiplier === 1.5 || timeMultiplier === 2 ? timeMultiplier : 1;
  return startedAt + Math.round(timeLimitMinutes * factor * 60_000);
}

/** The clock has run out, allowing for a client clock slightly ahead. */
export function timedTurnInDue(now: number, deadlineAt: number): boolean {
  return now >= deadlineAt - WRITING_TIMER_SKEW_MS;
}

const BREAKING_TAG_START =
  /^<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|pre|tr|td|th|table|hr)\b/i;

/** `html.replace(/<\/?(?:p|div|…)\b[^>]*>/gi, ' ')` in linear time. */
function replaceBreakingTags(html: string): string {
  let out = '';
  let last = 0;
  let gt = -1;
  for (let i = html.indexOf('<'); i !== -1; i = html.indexOf('<', i + 1)) {
    if (gt < i) {
      gt = html.indexOf('>', i);
      if (gt === -1) break;
    }
    if (!BREAKING_TAG_START.test(html.slice(i, i + 13))) continue;
    out += html.slice(last, i) + ' ';
    last = gt + 1;
    i = gt;
  }
  return out + html.slice(last);
}

/** One `html.replace(/<[^>]+>/g, '')` pass (or `<[^>]*>` when `allowEmpty`) in linear time. */
export function stripTagsOnce(html: string, allowEmpty = false): string {
  let out = '';
  let last = 0;
  let i = html.indexOf('<');
  while (i !== -1) {
    const gt = html.indexOf('>', allowEmpty ? i : i + 1);
    if (gt === -1) break;
    if (!allowEmpty && gt === i + 1) {
      i = html.indexOf('<', i + 1);
      continue;
    }
    out += html.slice(last, i);
    last = gt + 1;
    i = html.indexOf('<', last);
  }
  return out + html.slice(last);
}

/** Words in editor HTML; the same count as utils/wordCount.ts, so the server agrees with the editor. */
export function countWritingWords(html: string): number {
  if (!html) return 0;
  let stripped = replaceBreakingTags(html);
  let previous;
  do {
    previous = stripped;
    stripped = stripTagsOnce(stripped);
  } while (stripped !== previous);
  const text = stripped
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.split(' ').length : 0;
}

/** D14: what a score is out of: the points total, the rubric's top levels summed, or null when ungraded. */
export function writingGradingMax(grading: unknown): number | null {
  if (typeof grading !== 'object' || grading === null) return null;
  const g = grading as {
    mode?: unknown;
    points?: unknown;
    rubricSnapshot?: { criteria?: unknown };
  };
  if (g.mode === 'points')
    return typeof g.points === 'number' && Number.isFinite(g.points)
      ? g.points
      : null;
  if (g.mode !== 'rubric') return null;
  const criteria = g.rubricSnapshot?.criteria;
  if (!Array.isArray(criteria)) return null;
  let total = 0;
  for (const c of criteria) {
    const levels = (c as { levels?: unknown } | null)?.levels;
    if (!Array.isArray(levels)) continue;
    let top = 0;
    for (const l of levels) {
      const p = (l as { points?: unknown } | null)?.points;
      if (typeof p === 'number' && Number.isFinite(p)) top = Math.max(top, p);
    }
    total += top;
  }
  return total > 0 ? total : null;
}
