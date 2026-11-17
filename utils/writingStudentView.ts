// What the student Writing page shows (D7, D12, D23, D24), derived from the session, the response and this tab.
import type { WritingAssignmentSession, WritingResponse } from '@/types';
import { countWords } from '@/utils/wordCount';
import { wordLimitBounds } from '@/utils/wordLimit';
import {
  WRITING_CLOSE_GRACE_MS,
  deriveWritingStatus,
  isWritingUnlocked,
  resolveWritingDueAt,
  takeBackBlock,
  type WritingResponseStatus,
} from '@/utils/writingResponseState';
import { saveStateOf, type WritingSaveState } from '@/utils/writingSaveFlow';

/** The page's main state; each one is a harness state. */
export type WritingPageMode =
  | 'loading'
  | 'not-started'
  | 'writing'
  | 'taken-over'
  | 'turned-in'
  | 'returned'
  | 'closed';

export type { WritingSaveState };

export interface WritingTabFacts {
  myTabId: string;
  /** This tab has claimed the piece (or is claiming it now). */
  holding: boolean;
  claiming: boolean;
  online: boolean;
  /** Edits not yet confirmed by the server. */
  dirty: boolean;
  /** A save has been waiting long enough that the device copy is what holds the text. */
  slow: boolean;
  /** The last save failed, even after a retry. */
  refused: boolean;
  /** The last device copy write worked. */
  copyOk: boolean;
  /** Turn in is sending the text on screen, so the editor holds still. */
  turningIn: boolean;
  /** The current html, for the word count. */
  html: string;
}

export interface WritingPointerFacts {
  closeAt?: number | null;
  dueAt?: number | null;
}

export type WritingSessionFacts = Pick<
  WritingAssignmentSession,
  | 'status'
  | 'closeAt'
  | 'dueAt'
  | 'dueAtByClassId'
  | 'minWords'
  | 'maxWords'
  | 'enforceWordLimit'
  | 'timeLimitMinutes'
>;

export type WritingResponseFacts = Pick<
  WritingResponse,
  'status' | 'tabId' | 'classId'
> &
  Partial<Pick<WritingResponse, 'turnedInAt' | 'deadlineAt'>>;

export interface WritingPageView {
  mode: WritingPageMode;
  status: WritingResponseStatus | null;
  editable: boolean;
  wordCount: number;
  /** Turn in shows while writing; `turnInBlockedBy` says why it is off. */
  showTurnIn: boolean;
  turnInBlockedBy: 'empty' | 'too-short' | 'too-long' | 'offline' | null;
  /** Words short or over, for the message under Turn in. */
  wordGap: number;
  showTakeBack: boolean;
  saveState: WritingSaveState | null;
}

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Past the close (the student's own, else the session's) and its grace, or ended. */
export function writingClosed(
  session: WritingSessionFacts,
  pointer: WritingPointerFacts | null,
  now: number
): boolean {
  if (session.status === 'ended') return true;
  const closeAt = isNum(pointer?.closeAt)
    ? pointer.closeAt
    : isNum(session.closeAt)
      ? session.closeAt
      : null;
  return closeAt !== null && now > closeAt + WRITING_CLOSE_GRACE_MS;
}

export function deriveWritingView(args: {
  session: WritingSessionFacts | null;
  /** undefined while loading, null when the student has not opened it. */
  response: WritingResponseFacts | null | undefined;
  pointer: WritingPointerFacts | null;
  tab: WritingTabFacts;
  now: number;
}): WritingPageView {
  const { session, response, pointer, tab, now } = args;
  const wordCount = countWords(tab.html);
  const base: WritingPageView = {
    mode: 'loading',
    status: null,
    editable: false,
    wordCount,
    showTurnIn: false,
    turnInBlockedBy: null,
    wordGap: 0,
    showTakeBack: false,
    saveState: null,
  };
  if (!session || response === undefined) return base;
  const closed = writingClosed(session, pointer, now);
  if (response === null)
    return { ...base, mode: closed ? 'closed' : 'not-started' };
  const status = deriveWritingStatus(response);
  if (status === 'turned-in') {
    const block = takeBackBlock(status, {
      now,
      dueAt: resolveWritingDueAt(session, response.classId, pointer?.dueAt),
      hasFeedback: false,
      timed: isNum(response.deadlineAt),
    });
    return { ...base, mode: 'turned-in', status, showTakeBack: block === null };
  }
  if (status === 'returned') return { ...base, mode: 'returned', status };
  if (closed) return { ...base, mode: 'closed', status };
  // D23: another tab claimed the piece after this one did; a claim of our own in flight is not a takeover.
  const mine = response.tabId === tab.myTabId || tab.claiming;
  if (!isWritingUnlocked(status) || !(tab.holding && mine))
    return { ...base, mode: mine ? 'loading' : 'taken-over', status };
  const { min, max } = wordLimitBounds(session);
  const tooShort = session.enforceWordLimit === true && min !== undefined && wordCount < min;
  const tooLong = session.enforceWordLimit === true && max !== undefined && wordCount > max;
  return {
    ...base,
    mode: 'writing',
    status,
    editable: !tab.turningIn,
    showTurnIn: true,
    turnInBlockedBy:
      wordCount === 0
        ? 'empty'
        : tooShort
          ? 'too-short'
          : tooLong
            ? 'too-long'
            : !tab.online
              ? 'offline'
              : null,
    wordGap: tooShort && min !== undefined ? min - wordCount : tooLong && max !== undefined ? wordCount - max : 0,
    saveState: saveStateOf(tab),
  };
}
