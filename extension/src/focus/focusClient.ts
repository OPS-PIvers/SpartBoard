// The worker's half of focus sessions: pull status, keep it in session storage, report time away (CHROME_EXTENSION.md F3, F5, F10).
import {
  FOCUS_REPORT_MIN_INTERVAL_MS,
  type FocusPushSubscription,
  type FocusReportRequest,
  type FocusStatusRequest,
} from '@/utils/focus/contract';
import type { ApiResult } from '../spartboardApi';
import {
  badgeText,
  isEnforcing,
  isStaffEmail,
  isStudentEmail,
  liveHostFor,
  parseStatusReply,
  statusFor,
  type FocusLocalState,
} from './focusState';

/** A new blocked try is reported once this long has passed since the last report (the server's burst limit). */
export const TRIES_REPORT_GAP_MS = 5_000;

/** A subscription already sent is sent again after this long, in case the server dropped it. */
export const PUSH_RESEND_MS = 24 * 60 * 60_000;

/** A staff profile the server refused is asked again after this long, or at once on start-up or sign-in. */
export const STAFF_RECHECK_MS = 6 * 60 * 60_000;

export interface PushSent {
  endpoint: string;
  at: number;
}

/** The staff profile the server last said is no test student, and when. */
export interface StaffRefused {
  email: string;
  at: number;
}

export interface FocusClientDeps {
  /** This listing's SpartBoard origins, always allowed (F9). */
  origins: readonly string[];
  protocol: number;
  /** The Chrome profile's email, read fresh each time. */
  email(): Promise<string | undefined>;
  status(body: FocusStatusRequest): Promise<ApiResult<unknown>>;
  report(body: FocusReportRequest): Promise<ApiResult<unknown>>;
  load(): Promise<FocusLocalState | undefined>;
  save(state: FocusLocalState | null): Promise<void>;
  /** The Web Push subscription, or null without a VAPID key or below Chrome 121 (F5). */
  pushSubscription(): Promise<FocusPushSubscription | null>;
  loadPushSent(): Promise<PushSent | undefined>;
  savePushSent(sent: PushSent): Promise<void>;
  loadStaffRefused(): Promise<StaffRefused | undefined>;
  saveStaffRefused(refused: StaffRefused | null): Promise<void>;
  /** The address of the active tab in the last focused window. */
  activeUrl(): Promise<string | undefined>;
  /** Whether the student's window is fullscreen; Lock counts time outside it as away. */
  activeFullscreen(): Promise<boolean>;
  /** Redirect and Lock (FS7): parks and restores tabs, sets the Lock rules and fullscreen to match the state. */
  enforce(state: FocusLocalState | null | undefined): Promise<void>;
  openFocusPage(): Promise<void>;
  setBadge(text: string): Promise<void>;
  /** Blocked tries kept per session across a restart, so the server's max doesn't swallow new ones. */
  loadTries(sessionId: string): Promise<number>;
  saveTries(sessionId: string, tries: number): Promise<void>;
  /** Turns the once-a-minute badge and report alarm on or off. */
  setTicking(on: boolean): Promise<void>;
  now(): number;
}

const isActiveFalse = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  (value as { active?: unknown }).active === false;

export function createFocusClient(deps: FocusClientDeps) {
  // One step at a time, so a push and an alarm landing together can't interleave their saves.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(step: () => Promise<T>): Promise<T> => {
    const next = queue.then(step, step);
    queue = next.catch(() => undefined);
    return next;
  };

  const redraw = async (state: FocusLocalState | null | undefined) => {
    const now = deps.now();
    // Enforcement must never stop the badge, the reports or the next check.
    await deps.enforce(state).catch(() => undefined);
    await deps.setTicking(isEnforcing(state, now));
    await deps.setBadge(badgeText(state, now));
  };

  const clear = async () => {
    // Saved first, so navigations made by restoring tabs never read the old session as still running.
    await deps.save(null);
    await redraw(null);
  };

  const pushToSend = async (): Promise<FocusPushSubscription | undefined> => {
    const sub = await deps.pushSubscription().catch(() => null);
    if (!sub) return undefined;
    const sent = await deps.loadPushSent().catch(() => undefined);
    return sent?.endpoint === sub.endpoint &&
      deps.now() - sent.at < PUSH_RESEND_MS
      ? undefined
      : sub;
  };

  const observe = async (force: boolean, recheck = true) => {
    const state = await deps.load();
    const now = deps.now();
    if (!state || !isEnforcing(state, now)) return;
    const url = await deps.activeUrl().catch(() => undefined);
    const fullscreen =
      state.session.level !== 'lock' ||
      (await deps.activeFullscreen().catch(() => true));
    const status = statusFor(url, state.session, deps.origins, fullscreen);
    const host = liveHostFor(url, state.session);
    // A few seconds' slack, so the once-a-minute alarm doesn't skip every other report.
    const due =
      force ||
      status !== state.reported ||
      host !== state.reportedHost ||
      (state.blockedTries !== (state.reportedTries ?? 0) &&
        now - state.reportedAt >= TRIES_REPORT_GAP_MS) ||
      now - state.reportedAt >= FOCUS_REPORT_MIN_INTERVAL_MS - 5_000;
    if (!due) return;
    const res = await deps.report({
      sessionId: state.session.sessionId,
      protocol: deps.protocol,
      status,
      blockedTries: state.blockedTries,
      host,
    });
    if (!res.ok) return;
    await deps.save({
      ...state,
      reported: status,
      reportedAt: now,
      reportedHost: host,
      reportedTries: state.blockedTries,
    });
    // The session ended or released this student since the last check.
    if (recheck && isActiveFalse(res.value)) await check();
  };

  // A staff profile asks only now and then: the server answers for it only as a mock-class test account.
  const mayAsk = async (email: string | undefined, fresh: boolean) => {
    if (isStudentEmail(email)) return true;
    if (!email || !isStaffEmail(email)) return false;
    if (fresh) return true;
    const refused = await deps.loadStaffRefused().catch(() => undefined);
    return (
      refused?.email !== email.toLowerCase() ||
      deps.now() - refused.at >= STAFF_RECHECK_MS
    );
  };

  const check = async (fresh = false) => {
    const email = await deps.email().catch(() => undefined);
    if (!(await mayAsk(email, fresh))) {
      if (await deps.load()) await clear();
      return;
    }
    const push = await pushToSend();
    const res = await deps.status({
      protocol: deps.protocol,
      ...(push ? { push } : {}),
    });
    const prev = await deps.load();
    if (!res.ok) {
      // Refused: stop. A token hiccup mid-session holds like offline, until the session's own end.
      const refused =
        res.why === 'no-access' ||
        (res.why === 'signed-out' && !isEnforcing(prev, deps.now()));
      if (refused) await clear();
      else await redraw(prev);
      if (res.why === 'no-access' && email && isStaffEmail(email))
        await deps
          .saveStaffRefused({ email: email.toLowerCase(), at: deps.now() })
          .catch(() => undefined);
      return;
    }
    if (isStaffEmail(email))
      await deps.saveStaffRefused(null).catch(() => undefined);
    const reply = parseStatusReply(res.value);
    if (!reply) {
      await redraw(prev);
      return;
    }
    if (push)
      await deps
        .savePushSent({ endpoint: push.endpoint, at: deps.now() })
        .catch(() => undefined);
    if (!reply.session) {
      await clear();
      return;
    }
    const now = deps.now();
    const same = prev?.session.sessionId === reply.session.sessionId;
    const next: FocusLocalState = {
      session: reply.session,
      offsetMs: reply.serverNow - now,
      reported: same ? prev.reported : null,
      reportedAt: same ? prev.reportedAt : 0,
      reportedHost: same ? prev.reportedHost : null,
      blockedTries: same
        ? prev.blockedTries
        : await deps.loadTries(reply.session.sessionId).catch(() => 0),
      reportedTries: same ? prev.reportedTries : 0,
    };
    await deps.save(next);
    await redraw(next);
    if (!isEnforcing(next, now)) return;
    // A session that newly holds this student opens the focus page (F10).
    if (!isEnforcing(prev, now) || !same)
      await deps.openFocusPage().catch(() => undefined);
    // No re-check from here, so a status and report that disagree can't loop.
    await observe(!same, false);
  };

  return {
    /** Pulls the session: on the 5-minute alarm, at browser start, on sign-in and on a push (F5); `fresh` asks for a refused staff profile too. */
    check: (fresh = false) => serial(() => check(fresh)),
    /** Reports on a status change, or when a minute has passed since the last report. */
    observe: () => serial(() => observe(false)),
    /** Redirect or Lock sent a blocked navigation back (F4 Blocked tries). */
    blocked: () =>
      serial(async () => {
        const state = await deps.load();
        if (!state || !isEnforcing(state, deps.now())) return;
        const tries = state.blockedTries + 1;
        await deps.save({ ...state, blockedTries: tries });
        await deps
          .saveTries(state.session.sessionId, tries)
          .catch(() => undefined);
        await observe(false);
      }),
    /** The once-a-minute alarm: redraw the badge, report, and check once the time is up. */
    tick: () =>
      serial(async () => {
        const state = await deps.load();
        if (!state || !isEnforcing(state, deps.now())) {
          // No state means not checked yet, never "over": that takes a check.
          await (state ? check() : redraw(undefined));
          return;
        }
        await redraw(state);
        await observe(false);
      }),
  };
}
