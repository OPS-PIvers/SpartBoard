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
  logStartText: string;
  savedAt: number;
}

/** What the server holds now, as the response snapshot shows it. */
export interface WritingServerPiece {
  tabId: string;
  status: WritingResponseStatus;
  html: string;
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
    !isStr(c.logStartText) ||
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

/** D24 on page load: send the copy only while the server piece is still the copy's tab's and unlocked; never overwrite newer text. */
export function decideDeviceCopy(
  copy: WritingDeviceCopy | null,
  server: WritingServerPiece | null
): DeviceCopyDecision {
  if (!copy) return 'none';
  if (!server) return 'unsent';
  const sameTab = server.tabId === copy.tabId;
  if (sameText(copy.html, server.html))
    return sameTab && isWritingUnlocked(server.status) ? 'send' : 'landed';
  if (!isWritingUnlocked(server.status)) return 'unsent';
  return sameTab ? 'send' : 'unsent';
}

/** The log in a sent copy goes into the open chunk only when the server is still on that chunk. */
export const copyLogFits = (
  copy: WritingDeviceCopy,
  serverLogChunk: number
): boolean => copy.logChunk === serverLogChunk;
