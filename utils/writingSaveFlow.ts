// The holding tab's save decisions (D23, D24, D25), kept pure so each one is tested on its own.
import {
  isWritingUnlocked,
  type WritingResponseStatus,
} from '@/utils/writingResponseState';
import { diffText } from '@/utils/writingLog';

/** The rules tie every save to its tab: `tabId:saveCount`. */
export const saveKeyOf = (tabId: string, saveCount: number): string =>
  `${tabId}:${saveCount}`;

/** A save goes this long after typing stops, and at least every max wait while typing. */
export const SAVE_IDLE_MS = 1_500;
export const SAVE_MAX_WAIT_MS = 10_000;
/** D15: while the teacher has Live view open, saves go out at least this often. */
export const WATCHED_SAVE_MAX_WAIT_MS = 2_000;

/** How long to wait before the next save, from the first unsaved change. */
export function saveDelayMs(a: {
  firstAt: number;
  now: number;
  /** Server ms the teacher's Live view watch runs to; 0 when nobody is watching. */
  watchedUntil: number;
  serverNow: number;
}): number {
  const maxWait =
    a.watchedUntil > a.serverNow ? WATCHED_SAVE_MAX_WAIT_MS : SAVE_MAX_WAIT_MS;
  return Math.max(0, Math.min(SAVE_IDLE_MS, a.firstAt + maxWait - a.now));
}

/** The log goes up every 20 s, slowing to once a minute past 30 KB (AB-201). */
export const LOG_EVERY_MS = 20_000;
export const BIG_LOG_BYTES = 30_000;
export const BIG_LOG_EVERY_MS = 60_000;

export function isLogDue(a: {
  logDirty: boolean;
  /** A full chunk waits to be written closed. */
  closing: boolean;
  force: boolean;
  now: number;
  lastLogAt: number;
  logBytes: number;
}): boolean {
  if (!a.logDirty) return false;
  if (a.force || a.closing) return true;
  const every = a.logBytes > BIG_LOG_BYTES ? BIG_LOG_EVERY_MS : LOG_EVERY_MS;
  return a.now - a.lastLogAt >= every;
}

/** After the rules refuse a save: try once more from the server's counter if the piece is still ours, else let it go. */
export function refusedSaveAction(
  server: {
    tabId: string;
    status: WritingResponseStatus;
    saveCount: number;
  } | null,
  myTabId: string,
  closed: boolean
): 'retry' | 'lost' {
  if (!server || closed) return 'lost';
  return server.tabId === myTabId && isWritingUnlocked(server.status)
    ? 'retry'
    : 'lost';
}

/** Where this tab's text is: on the server, on its way, kept on the device, or nowhere safe. */
export type WritingSaveState = 'saved' | 'saving' | 'device' | 'failed';

export function saveStateOf(a: {
  /** Text not yet confirmed by the server; the log is tracked apart. */
  dirty: boolean;
  online: boolean;
  /** A save has waited long enough that the device copy is what holds the text. */
  slow: boolean;
  /** The rules refused the last save, even after a retry. */
  refused: boolean;
  /** The last device copy write worked. */
  copyOk: boolean;
}): WritingSaveState {
  if (!a.dirty) return 'saved';
  if (!a.online || a.slow || a.refused) return a.copyOk ? 'device' : 'failed';
  return 'saving';
}

/** What Turn in sends so the server freezes the text on screen; a counter equal to the saved one carries nothing new. */
export function turnInFlush(a: {
  html: string;
  savedHtml: string;
  confirmed: number;
}): { html: string; saveCount: number } {
  return {
    html: a.html,
    saveCount: a.html === a.savedHtml ? a.confirmed : a.confirmed + 1,
  };
}

/** Native inserts the page did not approve: a paste or drop that skipped the editor's handlers. */
const GUARDED_INPUTS = new Set([
  'insertFromPaste',
  'insertFromPasteAsQuotation',
  'insertFromDrop',
  'insertFromYank',
]);

/** A pending paste or drop decision counts for this long. */
export const INSERT_APPROVAL_MS = 1_000;

export function insertApproved(
  inputType: string,
  approvedAt: number | null,
  now: number
): boolean {
  if (!GUARDED_INPUTS.has(inputType)) return true;
  return approvedAt !== null && now - approvedAt < INSERT_APPROVAL_MS;
}

/** A Dictate announcement labels the edit that follows it within this long. */
export const DICTATION_PENDING_MS = 1_500;

const spokenKey = (s: string): string =>
  s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Whether an edit inserted the passage Dictate announced; spacing, case and a character or two may differ. */
export function isDictatedInsert(announced: string, inserted: string): boolean {
  const said = spokenKey(announced);
  const got = spokenKey(inserted);
  if (!said || !got) return false;
  if (said.includes(got) || got.includes(said)) return true;
  return said.length >= 8 && Math.abs(said.length - got.length) <= 2;
}

interface PendingDictation {
  text: string;
  at: number;
  /** The plain text just before the passage went in. */
  before: string;
  /** The turn that announced it has ended. */
  settled: boolean;
}

/** Labels the edit Dictate announces (SPEECH_TO_TEXT.md D13, D14), however the editor puts the text in. */
export class DictationTracker {
  private pending: PendingDictation | null = null;

  /** Dictate is about to insert `text`; `before` is the box's plain text now. */
  announce(text: string, before: string, now: number): void {
    this.pending = { text, at: now, before, settled: false };
  }

  /** An announced passage may still land, so the paste guard stands down. */
  active(now: number): boolean {
    return (
      this.pending !== null && now - this.pending.at < DICTATION_PENDING_MS
    );
  }

  /** The passage is going in during the announcing turn; `settle` logs it whole, so input events wait. */
  get landing(): boolean {
    return this.pending !== null && !this.pending.settled;
  }

  /** End of the announcing turn: the change since the announcement is the dictated edit, or null when nothing landed yet. */
  settle(next: string): { prev: string; next: string } | null {
    const p = this.pending;
    if (!p) return null;
    p.settled = true;
    if (next === p.before) return null;
    this.pending = null;
    return { prev: p.before, next };
  }

  /** A later edit: true, once, when it inserts the announced passage. */
  claim(prev: string, next: string, now: number): boolean {
    const p = this.pending;
    if (!p) return false;
    if (now - p.at >= DICTATION_PENDING_MS) {
      this.pending = null;
      return false;
    }
    const d = diffText(prev, next);
    if (!d || !isDictatedInsert(p.text, d.ins)) return false;
    this.pending = null;
    return true;
  }
}
