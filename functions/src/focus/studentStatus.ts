// What a student's extension gets from focusStatusV1 and how focusReportV1 updates its state (CHROME_EXTENSION.md F3-F5, F7).
import {
  FOCUS_REPORT_MIN_INTERVAL_MS,
  type FocusActiveSession,
  type FocusPushSubscription,
  type FocusReportReply,
  type FocusReportRequest,
  type FocusReportedStatus,
  type FocusSessionDoc,
  type FocusStatusReply,
  type FocusStudentDoc,
} from './shared.gen';

export class FocusCallError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const fail = (status: number, message: string) =>
  new FocusCallError(status, message);

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PROTOCOL = 10_000;
const MAX_BLOCKED_TRIES = 100_000;
/** A report inside this gap after the last one is dropped unless its status changed. */
export const FOCUS_REPORT_BURST_MS = 5_000;
/** Slack under the once-a-minute report so a slightly early alarm still lands. */
const REPORT_SLACK_MS = 10_000;
// Chrome's Web Push service; any other endpoint would let a client point FS5's sends anywhere.
const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'android.googleapis.com']);
const PUSH_KEY = /^[A-Za-z0-9_-]+={0,2}$/;
const HOST = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*$/;

const isInt = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;

/** A subscription as `PushSubscription.toJSON()` gives it, or null when it isn't one we would send to. */
export function parsePushSubscription(
  raw: unknown
): FocusPushSubscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const { endpoint, keys } = raw as { endpoint?: unknown; keys?: unknown };
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    !PUSH_HOSTS.has(url.hostname)
  )
    return null;
  if (!keys || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (
    typeof p256dh !== 'string' ||
    typeof auth !== 'string' ||
    p256dh.length > 200 ||
    auth.length > 100 ||
    !PUSH_KEY.test(p256dh) ||
    !PUSH_KEY.test(auth)
  )
    return null;
  return { endpoint, keys: { p256dh, auth } };
}

export interface ParsedStatusRequest {
  protocol: number;
  /** undefined leaves the stored subscription alone, null removes it. */
  push: FocusPushSubscription | null | undefined;
}

export function parseStatusRequest(body: unknown): ParsedStatusRequest {
  const b = (body && typeof body === 'object' ? body : {}) as Record<
    string,
    unknown
  >;
  if (!isInt(b.protocol, MAX_PROTOCOL)) throw fail(400, 'Malformed request.');
  // A subscription we can't use is ignored rather than failing the check.
  const push =
    b.push === null
      ? null
      : b.push === undefined
        ? undefined
        : (parsePushSubscription(b.push) ?? undefined);
  return { protocol: b.protocol, push };
}

/** Lowercased host without a trailing dot, or null for anything that isn't a host name. */
export function normalizeReportedHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const host = raw.trim().toLowerCase().replace(/\.$/, '');
  return HOST.test(host) ? host : null;
}

export function parseReportRequest(body: unknown): FocusReportRequest {
  const b = (body && typeof body === 'object' ? body : {}) as Record<
    string,
    unknown
  >;
  if (
    typeof b.sessionId !== 'string' ||
    !SESSION_ID.test(b.sessionId) ||
    !isInt(b.protocol, MAX_PROTOCOL) ||
    (b.status !== 'on-task' && b.status !== 'away') ||
    !isInt(b.blockedTries, MAX_BLOCKED_TRIES)
  )
    throw fail(400, 'Malformed request.');
  return {
    sessionId: b.sessionId,
    protocol: b.protocol,
    status: b.status,
    blockedTries: b.blockedTries,
    host: normalizeReportedHost(b.host),
  };
}

/** A running session: not ended and not past its end on the server clock. */
export const isSessionRunning = (s: FocusSessionDoc, now: number): boolean =>
  s.endedAt === null && typeof s.endsAt === 'number' && s.endsAt > now;

export interface SessionCandidate {
  id: string;
  session: FocusSessionDoc;
  /** This student's doc in it, or null when the server hasn't written one yet. */
  student: Pick<FocusStudentDoc, 'status'> | null;
}

const byStart = (a: SessionCandidate, b: SessionCandidate) =>
  a.session.startedAt - b.session.startedAt || (a.id < b.id ? -1 : 1);

/** F7: the earliest running session holding the student, else the earliest that left them waiting (`promote`). */
export function pickSession(
  candidates: SessionCandidate[],
  now: number
): { pick: SessionCandidate; promote: boolean } | null {
  const running = candidates.filter((c) => isSessionRunning(c.session, now));
  const holding = running
    .filter((c) => c.student?.status !== 'other-session')
    .sort(byStart);
  if (holding.length) return { pick: holding[0], promote: false };
  const waiting = running.sort(byStart);
  return waiting.length ? { pick: waiting[0], promote: true } : null;
}

export function toActiveSession(
  pick: SessionCandidate,
  showLiveSite: boolean
): FocusActiveSession {
  const { session } = pick;
  return {
    sessionId: pick.id,
    teacherName: session.teacherName,
    level: session.level,
    sites: session.sites,
    endsAt: session.endsAt,
    released: pick.student?.status === 'released',
    showLiveSite,
  };
}

/** The fields focusReportV1 writes on the student's doc. */
export type ReportWrite = Pick<
  FocusStudentDoc,
  | 'status'
  | 'awaySince'
  | 'awayMs'
  | 'blockedTries'
  | 'lastReportAt'
  | 'protocol'
  | 'liveHost'
>;

/** F4/F5: folds one report into the student's state; `write` is null when it is dropped. */
export function applyReport(
  prev: FocusStudentDoc | null,
  req: FocusReportRequest,
  now: number,
  showLiveSite: boolean
): { write: ReportWrite | null; active: boolean } {
  const prevStatus = prev?.status ?? 'waiting';
  if (prevStatus === 'released' || prevStatus === 'other-session')
    return { write: null, active: false };
  const liveHost = showLiveSite ? (req.host ?? null) : null;
  const prevTries = isInt(prev?.blockedTries, MAX_BLOCKED_TRIES)
    ? prev.blockedTries
    : 0;
  const blockedTries = Math.max(prevTries, req.blockedTries);
  const last =
    typeof prev?.lastReportAt === 'number' ? prev.lastReportAt : null;
  if (last !== null && now >= last) {
    const changed =
      prevStatus !== req.status ||
      blockedTries !== prevTries ||
      liveHost !== (prev?.liveHost ?? null);
    const gap = now - last;
    // A status change always lands, or away time would be lost or counted twice.
    if (
      prevStatus === req.status &&
      (gap < FOCUS_REPORT_BURST_MS ||
        (!changed && gap < FOCUS_REPORT_MIN_INTERVAL_MS - REPORT_SLACK_MS))
    )
      return { write: null, active: true };
  }
  let awayMs = typeof prev?.awayMs === 'number' ? prev.awayMs : 0;
  let awaySince = typeof prev?.awaySince === 'number' ? prev.awaySince : null;
  const status: FocusReportedStatus = req.status;
  if (status === 'away') {
    if (awaySince === null) awaySince = now;
  } else if (awaySince !== null) {
    awayMs += Math.max(0, now - awaySince);
    awaySince = null;
  }
  return {
    write: {
      status,
      awaySince,
      awayMs,
      blockedTries,
      lastReportAt: now,
      protocol: req.protocol,
      liveHost,
    },
    active: true,
  };
}

/** Firestore behind the two endpoints, so the handlers can be tested without it. */
export interface FocusStudentStore {
  /** Sessions listing this student that haven't been marked ended and haven't run out. */
  openSessionsFor: (uid: string, now: number) => Promise<SessionCandidate[]>;
  /** F7 hand-over in a transaction; true when the student is (now) in the running session, also after a concurrent hand-over. */
  promote: (sessionId: string, uid: string, now: number) => Promise<boolean>;
  savePush: (
    uid: string,
    push: FocusPushSubscription | null,
    now: number
  ) => Promise<void>;
  showLiveSite: () => Promise<boolean>;
  /** Runs `apply` on the session and the student's doc in one transaction and writes what it returns. */
  report: (
    sessionId: string,
    uid: string,
    apply: (
      session: FocusSessionDoc | null,
      student: FocusStudentDoc | null
    ) => { write: ReportWrite | null; active: boolean }
  ) => Promise<boolean>;
}

export async function focusStatus(
  body: unknown,
  uid: string,
  store: FocusStudentStore,
  now: number
): Promise<FocusStatusReply> {
  const req = parseStatusRequest(body);
  const [candidates, showLiveSite] = await Promise.all([
    store.openSessionsFor(uid, now),
    store.showLiveSite(),
    // A failed save only delays push wake-ups; the check itself still answers.
    req.push === undefined
      ? null
      : store.savePush(uid, req.push, now).catch((err: unknown) => {
          console.error(
            '[focusStudent] push save failed:',
            err instanceof Error ? err.name : 'unknown'
          );
        }),
  ]);
  const picked = pickSession(candidates, now);
  if (!picked) return { session: null, serverNow: now };
  if (picked.promote) {
    if (!(await store.promote(picked.pick.id, uid, now)))
      return { session: null, serverNow: now };
    return {
      session: toActiveSession(
        { ...picked.pick, student: { status: 'waiting' } },
        showLiveSite
      ),
      serverNow: now,
    };
  }
  return {
    session: toActiveSession(picked.pick, showLiveSite),
    serverNow: now,
  };
}

export async function focusReport(
  body: unknown,
  uid: string,
  store: FocusStudentStore,
  now: number
): Promise<FocusReportReply> {
  const req = parseReportRequest(body);
  const showLiveSite = await store.showLiveSite();
  const active = await store.report(req.sessionId, uid, (session, student) => {
    if (
      !session ||
      !Array.isArray(session.studentUids) ||
      !session.studentUids.includes(uid) ||
      !isSessionRunning(session, now)
    )
      return { write: null, active: false };
    return applyReport(student, req, now, showLiveSite);
  });
  return { ok: true, active };
}
