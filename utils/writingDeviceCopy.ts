// D24: the device copy of a Writing piece, kept in browser storage until the server has it.
import type { WritingResponseSummary } from '@/types';
import {
  isWritingUnlocked,
  type WritingResponseStatus,
} from '@/utils/writingResponseState';

export interface WritingDeviceCopy {
  v: 1;
  /** The tab that wrote it; only that tab's piece on the server can take it. */
  tabId: string;
  html: string;
  summary: WritingResponseSummary;
  /** The open log chunk as the tab last had it, tail included. */
  logChunk: number;
  log: string;
  /** The server counter this text builds on; a server past base + 1 has newer text. */
  baseSaveCount: number;
  savedAt: number;
}

/** What the server holds now, as the response snapshot shows it. */
export interface WritingServerPiece {
  tabId: string;
  status: WritingResponseStatus;
  html: string;
  saveCount: number;
}

/** `landed`: clear it; `send`: the copy's tab still holds the piece; `unsent`: moved or locked, so show it to copy out. */
export type DeviceCopyDecision = 'none' | 'landed' | 'send' | 'unsent';

const PREFIX = 'spartboard:writing-copy';

/** Keyed by the signed-in student and the response (one per student per session). */
export const deviceCopyKey = (studentUid: string, sessionId: string): string =>
  `${PREFIX}:${studentUid}:${sessionId}`;

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function parseCopy(raw: string | null): WritingDeviceCopy | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const c = v as Record<string, unknown>;
  if (
    c.v !== 1 ||
    !isStr(c.tabId) ||
    !isStr(c.html) ||
    typeof c.summary !== 'object' ||
    c.summary === null ||
    !isNum(c.logChunk) ||
    !isStr(c.log) ||
    !isNum(c.baseSaveCount) ||
    !isNum(c.savedAt)
  )
    return null;
  return c as unknown as WritingDeviceCopy;
}

export function readDeviceCopy(
  storage: Storage | null,
  studentUid: string,
  sessionId: string
): WritingDeviceCopy | null {
  try {
    return parseCopy(
      storage?.getItem(deviceCopyKey(studentUid, sessionId)) ?? null
    );
  } catch {
    return null;
  }
}

/** False when storage is full or blocked; the page then can't promise "saved on this device". */
export function writeDeviceCopy(
  storage: Storage | null,
  studentUid: string,
  sessionId: string,
  copy: WritingDeviceCopy
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(deviceCopyKey(studentUid, sessionId), JSON.stringify(copy));
    return true;
  } catch {
    return false;
  }
}

export function clearDeviceCopy(
  storage: Storage | null,
  studentUid: string,
  sessionId: string
): void {
  try {
    storage?.removeItem(deviceCopyKey(studentUid, sessionId));
  } catch {
    // Blocked storage holds no copy to clear.
  }
}

const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/** D24 on page load: send the copy only while its tab still holds the open piece and no newer save landed; never overwrite newer text. */
export function decideDeviceCopy(
  copy: WritingDeviceCopy | null,
  server: WritingServerPiece | null,
  closed: boolean
): DeviceCopyDecision {
  if (!copy) return 'none';
  if (!server) return 'unsent';
  const open = !closed && isWritingUnlocked(server.status);
  const sameTab = server.tabId === copy.tabId;
  if (sameText(copy.html, server.html))
    return sameTab && open ? 'send' : 'landed';
  // Each save first stores its text here, so a later save means the server has text this copy never saw.
  return open && sameTab && server.saveCount <= copy.baseSaveCount + 1
    ? 'send'
    : 'unsent';
}

/** The log in a sent copy goes into the open chunk only when the server is still on that chunk. */
export const copyLogFits = (
  copy: WritingDeviceCopy,
  serverLogChunk: number
): boolean => copy.logChunk === serverLogChunk;

/** Writing the server never got, kept apart from the live copy until the student dismisses it. */
export interface UnsentWriting {
  html: string;
  savedAt: number;
}

const UNSENT_PREFIX = 'spartboard:writing-unsent';
const UNSENT_MAX = 5;

export const unsentKey = (studentUid: string, sessionId: string): string =>
  `${UNSENT_PREFIX}:${studentUid}:${sessionId}`;

export function readUnsent(
  storage: Storage | null,
  studentUid: string,
  sessionId: string
): UnsentWriting[] {
  try {
    const raw = storage?.getItem(unsentKey(studentUid, sessionId));
    const v: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(v)) return [];
    return v.filter(
      (u): u is UnsentWriting =>
        typeof u === 'object' &&
        u !== null &&
        isStr((u as UnsentWriting).html) &&
        isNum((u as UnsentWriting).savedAt)
    );
  } catch {
    return [];
  }
}

/** Adds one entry (newest last, a repeat of the same text skipped); false when storage refuses it. */
export function addUnsent(
  storage: Storage | null,
  studentUid: string,
  sessionId: string,
  entry: UnsentWriting
): boolean {
  if (!storage) return false;
  const list = readUnsent(storage, studentUid, sessionId).filter(
    (u) => !sameText(u.html, entry.html)
  );
  list.push(entry);
  try {
    storage.setItem(
      unsentKey(studentUid, sessionId),
      JSON.stringify(list.slice(-UNSENT_MAX))
    );
    return true;
  } catch {
    return false;
  }
}

/** Only Dismiss removes an entry. */
export function removeUnsent(
  storage: Storage | null,
  studentUid: string,
  sessionId: string,
  savedAt: number
): void {
  const list = readUnsent(storage, studentUid, sessionId).filter(
    (u) => u.savedAt !== savedAt
  );
  try {
    if (list.length > 0)
      storage?.setItem(unsentKey(studentUid, sessionId), JSON.stringify(list));
    else storage?.removeItem(unsentKey(studentUid, sessionId));
  } catch {
    // Blocked storage keeps nothing to remove.
  }
}
