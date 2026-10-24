import type { FrameCommand, FrameReport } from './frameScript';
import {
  type FoundMatch,
  reducePlayback,
  startPlayback,
  type PlaybackEvent,
  type PlaybackState,
} from './progress';
import {
  parseWebTourLocator,
  type WebTourPictureBytes,
  type WebTourPortPost,
} from '@/components/tours/web/extensionProtocol';
import type { WebTourCheckResult, WebTourLocator } from '@/types';
import {
  checkFixClues,
  fixKey,
  runFixClues,
} from '@/components/tours/web/fixClues';
import type { OverlayAction, OverlayState } from '../overlay/overlayState';
import type { ParsedStart } from './startMessage';
import { matchesUrlPattern } from './urlPattern';

export interface HostFrame {
  frameId: number;
  parentFrameId: number;
  url: string;
}

export type OverlayMessage =
  { type: 'overlay/render'; state: OverlayState } | { type: 'overlay/unmount' };

export type ProgressPost = WebTourPortPost;

/** The Chrome APIs playback needs, so the controller runs against a fake in tests. */
export interface PlaybackHost {
  openTab(url: string): Promise<number>;
  navigate(tabId: number, url: string): Promise<void>;
  closeTab(tabId: number): Promise<void>;
  frames(tabId: number): Promise<HostFrame[]>;
  /** Injects the locator script into frames (and the overlay into those listed), idempotently. */
  inject(tabId: number, frameIds: number[], overlay: boolean): Promise<void>;
  sendToFrame(
    tabId: number,
    frameId: number,
    msg: FrameCommand | OverlayMessage
  ): void;
  load<T>(key: string): Promise<T | undefined>;
  save(entries: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  post(setId: string, msg: ProgressPost): void;
  setTimer(ms: number, cb: () => void): void;
  /** A wake-up that survives a worker restart, after which `sweep` re-checks timeouts. */
  backstop(): void;
  now(): number;
}

/** A tour waiting for its start page (WEB_TOURS_HELP_PANEL.md H1-H3). */
interface ArmState {
  since: number;
  /** The start page's host, which a sign-in round trip leaves and comes back to. */
  host: string;
  /** The tab left the host since it last loaded a page there. */
  leftHost: boolean;
  /** The one automatic trip to the start page has been made (H2). */
  navigated: boolean;
  /** The chip offers "Go to the start" instead of navigating again. */
  goStart: boolean;
}

interface TabRecord {
  tabId: number;
  state: PlaybackState;
  /** Changes on every new seek, so stale frame reports are ignored. */
  token: string;
  seq: number;
  targetFrameId: number | null;
  /** A subframe whose overlay currently draws the spotlight, so it can be cleared when the target moves. */
  litFrameId: number | null;
  url: string;
  /** When the current seek began, so a restarted worker can still time it out. */
  seekAt: number;
  /** Last match posted per step, so an unchanged repeat isn't posted again. */
  posted: Record<string, FoundMatch | 'none'>;
  /** Step index of the last step post, so a revisit found by the same clue still moves the hub's marker. */
  postedIndex: number;
  /** Step index on which a page actually loaded and didn't match, so only a real wrong page counts as a miss. */
  wrongPageIndex?: number;
  /** Check mode (C12): posts only check results, never a run's progress. */
  check?: boolean;
  /** Check mode: the page's id for the run, echoed in every result. */
  runId?: string;
  /** Check mode: the latest result posted per step. */
  results?: Record<string, WebTourCheckResult>;
  /** Check mode: the seek whose candidates tied. */
  ambiguousToken?: string;
  /** The closest candidate a frame found for the current seek when nothing matched (C14). */
  candidate?: { token: string; fix: WebTourLocator };
  /** The fix last suggested per step, replayed to a page that reconnects; the same clues aren't posted twice. */
  fixes?: Record<string, WebTourLocator>;
  /** Set while the tour is armed. */
  arm?: ArmState;
}

export const FALLBACK_MS = 4000;
/** How long an armed tour waits for its site before it stops (H3). */
export const ARM_MS = 10 * 60 * 1000;
const tabKey = (tabId: number) => `wt:tab:${tabId}`;
const picKey = (tabId: number, stepId: string) => `wt:pic:${tabId}:${stepId}`;
const TABS_KEY = 'wt:tabs';
const CHECK_ENDS_KEY = 'wt:checkEnds';
/** Ended check runs kept for an editor that reconnects late. */
export const CHECK_ENDS_KEPT = 5;
export const CHECK_END_KEEP_MS = 10 * 60 * 1000;

interface EndedCheck {
  setId: string;
  runId: string;
  at: number;
  posts: ProgressPost[];
}
// Not a real tab id: the queue that keeps two starts from racing.
const START_QUEUE = -1;
const TABS_QUEUE = -2;
const CHECK_ENDS_QUEUE = -3;
/** The session store holds 10 MB; one tour's record and pictures stay under this. */
export const SESSION_BUDGET = 9 * 1024 * 1024;
const MAX_TITLE = 200;
const isWebPage = (url: string) => /^https?:\/\//.test(url);
const hostOf = (url: string) => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
};

/** A step's check result from how it was found; an unfound step whose candidates tied is `ambiguous`. */
export const checkResultOf = (
  match: FoundMatch | 'none',
  tied: boolean
): WebTourCheckResult =>
  match === 'role'
    ? 'found'
    : match === 'score'
      ? 'weak'
      : tied
        ? 'ambiguous'
        : 'none';

/** The frame ids whose chain of addresses matches the step's recorded frames; empty when none do. */
export function framesForStep(
  frames: HostFrame[],
  path: { urlPattern: string; index: number }[]
): number[] {
  if (path.length === 0) return [0];
  const byId = new Map(frames.map((f) => [f.frameId, f]));
  // Null when a parent isn't listed yet, so a partial chain never passes for a shorter path.
  const chain = (f: HostFrame): HostFrame[] | null => {
    const out: HostFrame[] = [];
    let c: HostFrame | undefined = f;
    while (c && c.frameId !== 0) {
      out.unshift(c);
      c = byId.get(c.parentFrameId);
    }
    return c ? out : null;
  };
  const hits = frames.filter((f) => {
    const c = chain(f);
    return (
      c !== null &&
      c.length === path.length &&
      c.every((cf, i) => matchesUrlPattern(path[i].urlPattern, cf.url))
    );
  });
  if (hits.length <= 1) return hits.map((f) => f.frameId);
  // Several frames match: prefer chains whose frames sit at the recorded positions among their parents' frames.
  const position = (f: HostFrame) =>
    frames.filter((o) => o.parentFrameId === f.parentFrameId).indexOf(f);
  const score = (f: HostFrame) =>
    (chain(f) ?? []).filter((cf, i) => position(cf) === path[i].index).length;
  return hits
    .map((f) => ({ f, s: score(f) }))
    .sort((a, b) => b.s - a.s)
    .map(({ f }) => f.frameId);
}

export function createPlaybackController(host: PlaybackHost) {
  // One event at a time per tab, so two frame reports can't overwrite each other's saved state.
  const queues = new Map<number, Promise<unknown>>();
  const serial = <T>(tabId: number, fn: () => Promise<T>): Promise<T> => {
    const run = (queues.get(tabId) ?? Promise.resolve()).then(fn, fn);
    const tail = run.catch(() => undefined);
    queues.set(tabId, tail);
    void tail.then(() => {
      if (queues.get(tabId) === tail) queues.delete(tabId);
    });
    return run;
  };
  const load = (tabId: number) => host.load<TabRecord>(tabKey(tabId));
  const store = (rec: TabRecord) => host.save({ [tabKey(rec.tabId)]: rec });

  const trackTab = (tabId: number, add: boolean) =>
    serial(TABS_QUEUE, async () => {
      const tabs = new Set((await host.load<number[]>(TABS_KEY)) ?? []);
      if (add) tabs.add(tabId);
      else tabs.delete(tabId);
      await host.save({ [TABS_KEY]: [...tabs] });
    });

  async function picture(rec: TabRecord): Promise<WebTourPictureBytes | null> {
    const step = rec.state.tour.steps[rec.state.index];
    if (!step?.hasPicture) return null;
    if (rec.state.status !== 'fallback' && rec.state.status !== 'wrong-page')
      return null;
    return (
      (await host.load<WebTourPictureBytes>(picKey(rec.tabId, step.id))) ?? null
    );
  }

  async function render(rec: TabRecord) {
    const { state } = rec;
    const step = state.tour.steps[state.index];
    if (state.status === 'exited' || !step) {
      host.sendToFrame(rec.tabId, 0, { type: 'overlay/unmount' });
      if (rec.targetFrameId !== null && rec.targetFrameId !== 0) {
        host.sendToFrame(rec.tabId, rec.targetFrameId, {
          type: 'overlay/unmount',
        });
      }
      return;
    }
    if (state.status === 'armed') {
      host.sendToFrame(rec.tabId, 0, {
        type: 'overlay/render',
        state: notice(rec, 'armed'),
      });
      return;
    }
    const shownIn = state.status === 'shown' ? rec.targetFrameId : null;
    const settled = state.status === 'shown' || state.status === 'fallback';
    const base = {
      title: step.title.slice(0, MAX_TITLE),
      text: step.text,
      current: state.index + 1,
      total: state.tour.steps.length,
      status: state.status,
      observe: step.action === 'observe',
      ...(rec.check
        ? {
            check: (settled && rec.results?.[step.id]) || ('pending' as const),
          }
        : {}),
    };
    host.sendToFrame(rec.tabId, 0, {
      type: 'overlay/render',
      state: {
        ...base,
        role: 'top',
        targetHere: shownIn === 0,
        picture: await picture(rec),
      },
    });
    if (
      rec.litFrameId !== null &&
      rec.litFrameId !== 0 &&
      rec.litFrameId !== shownIn
    ) {
      host.sendToFrame(rec.tabId, rec.litFrameId, { type: 'overlay/unmount' });
    }
    rec.litFrameId = shownIn;
    if (shownIn !== null && shownIn !== 0) {
      host.sendToFrame(rec.tabId, shownIn, {
        type: 'overlay/render',
        state: { ...base, role: 'target', targetHere: true, picture: null },
      });
    }
  }

  /** The chip state for an armed, moved or stopped tour. */
  function notice(
    rec: TabRecord,
    status: 'armed' | 'moved' | 'stopped'
  ): OverlayState {
    const { state } = rec;
    return {
      title: state.tour.title.slice(0, MAX_TITLE),
      text: '',
      current: Math.min(state.index + 1, state.tour.steps.length),
      total: state.tour.steps.length,
      status,
      role: 'top',
      targetHere: false,
      observe: false,
      picture: null,
      ...(status === 'armed' ? { goStart: !!rec.arm?.goStart } : {}),
    };
  }

  /** An armed tab loaded a page that isn't the start page: a trip off the site and back goes to the start once (H2). */
  async function armedPage(rec: TabRecord, url: string) {
    const arm = rec.arm;
    if (!arm) return;
    if (hostOf(url) !== arm.host) {
      rec.arm = { ...arm, leftHost: true, goStart: false };
    } else if (arm.leftHost && !arm.navigated) {
      rec.arm = { ...arm, leftHost: false, navigated: true, goStart: false };
      await host.navigate(rec.tabId, rec.state.tour.startUrl);
    } else {
      rec.arm = { ...arm, leftHost: false, goStart: true };
    }
  }

  /** Stops a tour that waited too long for its site; the page can start it again. */
  async function expire(rec: TabRecord) {
    for (const f of await host.frames(rec.tabId)) {
      host.sendToFrame(rec.tabId, f.frameId, { type: 'wt:stop' });
    }
    host.sendToFrame(rec.tabId, 0, {
      type: 'overlay/render',
      state: notice(rec, 'stopped'),
    });
    postEnd(rec, 'exit', rec.state.index);
    await forget(rec);
  }

  const armedOut = (rec: TabRecord) =>
    !!rec.arm &&
    rec.state.status === 'armed' &&
    host.now() - rec.arm.since >= ARM_MS;

  /** Stops every armed tour past its wait; true while one is still waiting. */
  async function expireArmed(): Promise<boolean> {
    let waiting = false;
    for (const tabId of (await host.load<number[]>(TABS_KEY)) ?? []) {
      await serial(tabId, async () => {
        const rec = await load(tabId);
        if (!rec?.arm || rec.state.status !== 'armed') return;
        if (armedOut(rec)) await expire(rec);
        else waiting = true;
      });
    }
    return waiting;
  }

  /** The armed tour waiting for this url's site in another tab, if any. */
  async function armedTabFor(tabId: number, url: string) {
    const site = hostOf(url);
    for (const other of (await host.load<number[]>(TABS_KEY)) ?? []) {
      if (other === tabId) continue;
      const rec = await load(other);
      if (
        rec?.arm &&
        rec.state.status === 'armed' &&
        rec.arm.host === site &&
        !armedOut(rec)
      )
        return other;
    }
    return null;
  }

  /** Moves an armed tour to the tab that reached its site, e.g. one LaunchPad opened (H3). */
  function adopt(fromTabId: number, toTabId: number) {
    return serial(fromTabId, async (): Promise<TabRecord | null> => {
      const rec = await load(fromTabId);
      if (!rec?.arm || rec.state.status !== 'armed' || armedOut(rec))
        return null;
      const pictures: Record<string, WebTourPictureBytes> = {};
      for (const s of rec.state.tour.steps) {
        if (!s.hasPicture) continue;
        const pic = await host.load<WebTourPictureBytes>(
          picKey(fromTabId, s.id)
        );
        if (pic) pictures[picKey(toTabId, s.id)] = pic;
      }
      // Arriving from elsewhere counts as a trip off the site, so a landing page goes to the start once.
      const moved: TabRecord = {
        ...rec,
        tabId: toTabId,
        targetFrameId: null,
        litFrameId: null,
        arm: { ...rec.arm, leftHost: true, navigated: false, goStart: false },
      };
      await host.save(pictures);
      await store(moved);
      await trackTab(toTabId, true);
      await host.remove([
        tabKey(fromTabId),
        ...rec.state.tour.steps.map((s) => picKey(fromTabId, s.id)),
      ]);
      await trackTab(fromTabId, false);
      host.sendToFrame(fromTabId, 0, {
        type: 'overlay/render',
        state: notice(rec, 'moved'),
      });
      return moved;
    });
  }

  /** Posts a candidate's clues for a step that missed or played weak; pages before protocol 7 never get it. */
  function postSuggest(rec: TabRecord, index: number, fix: WebTourLocator) {
    const step = rec.state.tour.steps[index];
    if (!step) return;
    const had = rec.fixes?.[step.id];
    if (had && fixKey(had) === fixKey(fix)) return;
    rec.fixes = { ...rec.fixes, [step.id]: fix };
    const post = suggestPost(rec, index);
    if (post) host.post(rec.state.tour.id, post);
  }

  /** The step's last suggested fix as a post, or null. */
  function suggestPost(rec: TabRecord, index: number): ProgressPost | null {
    const setId = rec.state.tour.id;
    const step = rec.state.tour.steps[index];
    const fix = step ? rec.fixes?.[step.id] : undefined;
    if (!step || !fix) return null;
    return {
      type: 'web-tour/suggest',
      setId,
      stepIndex: index,
      stepId: step.id,
      locator: fix,
      ...(rec.check ? { runId: rec.runId ?? '' } : {}),
    };
  }

  /** Every step's last suggested fix, in step order. */
  const suggestPosts = (rec: TabRecord): ProgressPost[] =>
    rec.state.tour.steps.flatMap((_s, i) => {
      const post = suggestPost(rec, i);
      return post ? [post] : [];
    });

  /** A fix from a frame on the step's own frame path, with its box only from the top frame, whose viewport the box is measured in. */
  async function fixFrom(
    rec: TabRecord,
    frameId: number,
    raw: unknown
  ): Promise<WebTourLocator | null> {
    const step = rec.state.tour.steps[rec.state.index];
    const parsed = parseWebTourLocator(raw);
    if (!step || !parsed || parsed.frames) return null;
    const ids = framesForStep(await host.frames(rec.tabId), step.frames);
    if (!ids.includes(frameId)) return null;
    // A teacher's run keeps only the site's own clues; page words stay the step's (C15).
    const fix = (rec.check ? checkFixClues : runFixClues)(parsed, step.clues);
    if (frameId === 0) return fix;
    const { box: _box, ...rest } = fix;
    return rest;
  }

  function postStep(rec: TabRecord, index: number, match: FoundMatch | 'none') {
    const setId = rec.state.tour.id;
    const step = rec.state.tour.steps[index];
    if (!step) return;
    rec.posted = { ...rec.posted, [step.id]: match };
    rec.postedIndex = index;
    postProgressStep(rec, setId, index, step.id, match);
    // After the miss itself, so the page has the miss to attach it to.
    if (match === 'none' && rec.candidate?.token === rec.token)
      postSuggest(rec, index, rec.candidate.fix);
  }

  function postProgressStep(
    rec: TabRecord,
    setId: string,
    index: number,
    stepId: string,
    match: FoundMatch | 'none'
  ) {
    if (rec.check) {
      const result = checkResultOf(match, rec.ambiguousToken === rec.token);
      rec.results = { ...rec.results, [stepId]: result };
      host.post(setId, {
        type: 'web-tour/check-step',
        setId,
        runId: rec.runId ?? '',
        stepIndex: index,
        stepId,
        result,
      });
      return;
    }
    host.post(setId, {
      type: 'web-tour/step',
      setId,
      stepIndex: index,
      stepId,
      match,
    });
  }

  /** How a run ended; a check run reports only `web-tour/check-end`, so it is never logged as a teacher's run. */
  function postEnd(
    rec: TabRecord,
    kind: 'done' | 'exit' | 'closed',
    stepIndex: number
  ) {
    const setId = rec.state.tour.id;
    if (rec.check) {
      const end: ProgressPost = {
        type: 'web-tour/check-end',
        setId,
        runId: rec.runId ?? '',
        stepIndex,
        done: kind === 'done',
      };
      host.post(setId, end);
      rememberCheck(setId, rec.runId ?? '', [
        ...checkResultPosts(rec),
        ...suggestPosts(rec),
        end,
      ]);
    } else if (kind === 'done') {
      host.post(setId, { type: 'web-tour/done', setId });
    } else if (kind === 'exit') {
      host.post(setId, { type: 'web-tour/exit', setId, stepIndex });
    } else {
      host.post(setId, { type: 'web-tour/closed', setId, stepIndex });
    }
  }

  /** Every result of a check run so far, in step order. */
  function checkResultPosts(rec: TabRecord): ProgressPost[] {
    const setId = rec.state.tour.id;
    return rec.state.tour.steps.flatMap((s, i): ProgressPost[] => {
      const result = rec.results?.[s.id];
      return result
        ? [
            {
              type: 'web-tour/check-step',
              setId,
              runId: rec.runId ?? '',
              stepIndex: i,
              stepId: s.id,
              result,
            },
          ]
        : [];
    });
  }

  const loadEnded = async () =>
    ((await host.load<EndedCheck[]>(CHECK_ENDS_KEY)) ?? []).filter(
      (e) => host.now() - e.at < CHECK_END_KEEP_MS
    );

  /** Keeps an ended check run's results and end, so an editor that reconnects late still gets them. */
  function rememberCheck(setId: string, runId: string, posts: ProgressPost[]) {
    void serial(CHECK_ENDS_QUEUE, async () => {
      const kept = [
        ...(await loadEnded()),
        { setId, runId, at: host.now(), posts },
      ];
      await host.save({ [CHECK_ENDS_KEY]: kept.slice(-CHECK_ENDS_KEPT) });
    }).catch(() => undefined);
  }

  /** Check mode: a new seek of a step drops what an earlier visit found, so its result comes from this seek only. */
  function forgetCheckResult(rec: TabRecord, stepId: string) {
    const { [stepId]: _posted, ...posted } = rec.posted;
    const { [stepId]: _result, ...results } = rec.results ?? {};
    const { [stepId]: _matched, ...matched } = rec.state.matched;
    rec.posted = posted;
    rec.results = results;
    rec.state = { ...rec.state, matched };
  }

  /** A step left while still on the wrong page counts as a miss, so a broken page pattern shows in tour health. */
  function postWrongPageMiss(rec: TabRecord, before: PlaybackState) {
    const step = before.tour.steps[before.index];
    if (before.status !== 'wrong-page' || !step) return;
    if (rec.wrongPageIndex !== before.index) return;
    if (before.matched[step.id] !== undefined || step.id in rec.posted) return;
    postStep(rec, before.index, 'none');
  }

  function postProgress(rec: TabRecord, before: PlaybackState) {
    const { state } = rec;
    const step = state.tour.steps[state.index];
    if (
      state.index !== before.index ||
      state.status === 'exited' ||
      state.status === 'done'
    ) {
      postWrongPageMiss(rec, before);
    }
    if (state.status === 'shown' || state.status === 'fallback') {
      const how = state.matched[step.id];
      const match = how === undefined || how === 'picture' ? 'none' : how;
      if (rec.posted[step.id] !== match || rec.postedIndex !== state.index) {
        postStep(rec, state.index, match);
      }
    }
    if (state.status === 'done' && before.status !== 'done') {
      postEnd(rec, 'done', state.index);
    }
    if (
      state.status === 'exited' &&
      before.status !== 'exited' &&
      before.status !== 'done'
    ) {
      postEnd(rec, 'exit', state.index);
    }
  }

  async function seek(rec: TabRecord) {
    const { state } = rec;
    const step = state.tour.steps[state.index];
    for (const f of await host.frames(rec.tabId)) {
      host.sendToFrame(rec.tabId, f.frameId, { type: 'wt:stop' });
    }
    rec.targetFrameId = null;
    if (state.status !== 'seeking' || !step) return;
    if (rec.check) forgetCheckResult(rec, step.id);
    rec.seq += 1;
    rec.token = `${state.index}:${rec.seq}`;
    const frames = await host.frames(rec.tabId);
    let ids = framesForStep(frames, step.frames);
    // A target whose frames moved is still worth looking for anywhere in the tab.
    if (ids.length === 0) ids = frames.map((f) => f.frameId);
    await host.inject(rec.tabId, ids, false);
    for (const id of ids) {
      host.sendToFrame(rec.tabId, id, {
        type: 'wt:seek',
        token: rec.token,
        clues: step.clues,
        action: step.action,
      });
    }
    const token = rec.token;
    rec.seekAt = host.now();
    host.backstop();
    host.setTimer(FALLBACK_MS, () => {
      void serial(rec.tabId, async () => {
        const now = await load(rec.tabId);
        if (now && now.token === token)
          await dispatch(now, { type: 'timeout' });
      });
    });
  }

  /** Hands the current seek to a frame that appeared after it began, without restarting it. */
  async function seekInNewFrame(rec: TabRecord, frameId: number) {
    const step = rec.state.tour.steps[rec.state.index];
    if (!step || !rec.token) return;
    const frames = await host.frames(rec.tabId);
    const ids = framesForStep(frames, step.frames);
    if (ids.length > 0 && !ids.includes(frameId)) return;
    host.sendToFrame(rec.tabId, frameId, {
      type: 'wt:seek',
      token: rec.token,
      clues: step.clues,
      action: step.action,
    });
  }

  async function dispatch(
    rec: TabRecord,
    event: PlaybackEvent,
    frameId: number | null = null
  ) {
    const before = rec.state;
    const withUrl: PlaybackEvent =
      event.type === 'next' || event.type === 'back'
        ? { ...event, url: rec.url }
        : event;
    rec.state = reducePlayback(before, withUrl);
    if (rec.state.status !== 'armed') delete rec.arm;
    else if (event.type === 'page') await armedPage(rec, event.url);
    if (event.type === 'found' && rec.state.status === 'shown')
      rec.targetFrameId = frameId;
    postProgress(rec, before);
    if (event.type === 'page' && rec.state.status === 'wrong-page')
      rec.wrongPageIndex = rec.state.index;
    const moved =
      rec.state.index !== before.index ||
      (rec.state.status === 'seeking' && before.status !== 'seeking') ||
      event.type === 'page';
    if (rec.state.status === 'exited' || rec.state.status === 'done') {
      for (const f of await host.frames(rec.tabId)) {
        host.sendToFrame(rec.tabId, f.frameId, { type: 'wt:stop' });
      }
    } else if (moved) {
      await seek(rec);
    }
    await render(rec);
    if (rec.state.status === 'exited') {
      await forget(rec);
    } else {
      await store(rec);
    }
  }

  async function stopTab(rec: TabRecord) {
    for (const f of await host.frames(rec.tabId)) {
      host.sendToFrame(rec.tabId, f.frameId, { type: 'wt:stop' });
      host.sendToFrame(rec.tabId, f.frameId, { type: 'overlay/unmount' });
    }
    await forget(rec);
  }

  /** A finished tour lets go of the tab once the learner leaves its last page (T8). */
  const leftFinished = (rec: TabRecord, url: string) => {
    const last = rec.state.tour.steps[rec.state.tour.steps.length - 1];
    return (
      rec.state.status === 'done' && !matchesUrlPattern(last.urlPattern, url)
    );
  };

  async function forget(rec: TabRecord) {
    await host.remove([
      tabKey(rec.tabId),
      ...rec.state.tour.steps.map((s) => picKey(rec.tabId, s.id)),
    ]);
    await trackTab(rec.tabId, false);
  }

  async function startNow(
    parsed: ParsedStart,
    inTab?: number
  ): Promise<number> {
    for (const other of (await host.load<number[]>(TABS_KEY)) ?? []) {
      await serial(other, async () => {
        const rec = await load(other);
        if (!rec) return;
        if (rec.state.status !== 'done') {
          postWrongPageMiss(rec, rec.state);
          postEnd(rec, 'exit', rec.state.index);
        }
        await stopTab(rec);
      });
    }
    // The record is saved before the page loads, so its first commit always finds it.
    const tabId = inTab ?? (await host.openTab('about:blank'));
    return serial(tabId, async () => {
      const state = startPlayback(
        parsed.tour,
        parsed.tour.startUrl,
        host.now()
      );
      const rec: TabRecord = {
        tabId,
        state: {
          ...state,
          index: parsed.stepIndex,
          furthest: parsed.stepIndex,
          status: 'armed',
        },
        token: '',
        seq: 0,
        targetFrameId: null,
        litFrameId: null,
        url: 'about:blank',
        seekAt: 0,
        posted: {},
        postedIndex: -1,
        arm: {
          since: host.now(),
          host: hostOf(parsed.tour.startUrl),
          leftHost: false,
          navigated: false,
          goStart: false,
        },
        ...(parsed.check
          ? { check: true, runId: parsed.runId ?? '', results: {} }
          : {}),
      };
      let room = SESSION_BUDGET - JSON.stringify(rec).length;
      const pictures: Record<string, WebTourPictureBytes> = {};
      for (const [id, pic] of Object.entries(parsed.pictures)) {
        const size = pic.data.length + 200;
        if (size > room) continue;
        pictures[picKey(tabId, id)] = pic;
        room -= size;
      }
      const kept = new Set(Object.keys(pictures));
      rec.state.tour.steps = rec.state.tour.steps.map((s) => ({
        ...s,
        hasPicture: kept.has(picKey(tabId, s.id)),
      }));
      try {
        await host.save(pictures);
        await store(rec);
        await trackTab(tabId, true);
      } catch (err) {
        await forget(rec).catch(() => undefined);
        if (inTab === undefined)
          await host.closeTab(tabId).catch(() => undefined);
        throw err;
      }
      await host.navigate(tabId, parsed.tour.startUrl);
      host.backstop();
      host.setTimer(ARM_MS, () => void expireArmed());
      return tabId;
    });
  }

  return {
    /** Opens the tour's first page in a new tab, or `inTab` (H5), and starts playing there; one tour plays at a time. */
    start(parsed: ParsedStart, inTab?: number): Promise<number> {
      return serial(START_QUEUE, () => startNow(parsed, inTab));
    },

    /** A new document committed in a frame of the tab (navigation, reload or a new frame). */
    committed: (tabId: number, frameId: number, url: string) =>
      serial(tabId, async () => {
        if (!isWebPage(url)) return;
        let rec = await load(tabId);
        if (!rec && frameId === 0) {
          const from = await armedTabFor(tabId, url);
          if (from !== null) rec = (await adopt(from, tabId)) ?? undefined;
        }
        if (!rec) return;
        if (frameId === 0 && leftFinished(rec, url)) {
          await stopTab(rec);
          return;
        }
        await host.inject(tabId, [frameId], frameId === 0);
        if (frameId === 0) {
          rec.url = url;
          await dispatch(rec, { type: 'page', url });
        } else if (frameId === rec.targetFrameId) {
          // The frame holding the target loaded a new document, so the target is gone.
          await dispatch(rec, { type: 'lost' });
        } else if (
          rec.state.status === 'seeking' ||
          rec.state.status === 'fallback'
        ) {
          await seekInNewFrame(rec, frameId);
          await store(rec);
        }
      }),

    /** A single-page app changed its address without loading a new document. */
    historyChanged: (tabId: number, frameId: number, url: string) =>
      serial(tabId, async () => {
        if (frameId !== 0) return;
        const rec = await load(tabId);
        if (!rec || url === rec.url) return;
        if (leftFinished(rec, url)) {
          await stopTab(rec);
          return;
        }
        rec.url = url;
        await dispatch(rec, { type: 'page', url });
      }),

    frameReport: (tabId: number, frameId: number, report: FrameReport) =>
      serial(tabId, async () => {
        const rec = await load(tabId);
        if (!rec || report.token !== rec.token) return;
        if (report.type === 'wt:found') {
          if (rec.state.status === 'shown' && rec.targetFrameId !== frameId)
            return;
          const index = rec.state.index;
          const fix =
            report.weak && report.fix
              ? await fixFrom(rec, frameId, report.fix)
              : null;
          // The spotlight is drawn inside the frame that holds the target.
          if (frameId !== 0) await host.inject(tabId, [frameId], true);
          await dispatch(
            rec,
            { type: 'found', match: report.weak ? 'score' : 'role' },
            frameId
          );
          if (
            fix &&
            rec.state.index === index &&
            rec.state.status === 'shown'
          ) {
            postSuggest(rec, index, fix);
            await store(rec);
          }
        } else if (report.type === 'wt:candidate') {
          const fix = await fixFrom(rec, frameId, report.fix);
          if (!fix || rec.state.status === 'shown') return;
          rec.candidate = { token: report.token, fix };
          // A step that already fell back gets the fix now.
          const step = rec.state.tour.steps[rec.state.index];
          if (step && rec.posted[step.id] === 'none')
            postSuggest(rec, rec.state.index, fix);
          await store(rec);
        } else if (report.type === 'wt:ambiguous') {
          if (!rec.check || rec.ambiguousToken === report.token) return;
          rec.ambiguousToken = report.token;
          // A step that already timed out is re-reported as ambiguous.
          if (rec.state.status === 'fallback') {
            postStep(rec, rec.state.index, 'none');
            await render(rec);
          }
          await store(rec);
        } else if (frameId === rec.targetFrameId) {
          await dispatch(rec, {
            type: report.type === 'wt:lost' ? 'lost' : 'acted',
          });
        }
      }),

    overlayAction: (tabId: number, frameId: number, action: OverlayAction) =>
      serial(tabId, async () => {
        if (frameId !== 0) return;
        const rec = await load(tabId);
        if (!rec) return;
        if (action === 'start') {
          if (rec.state.status !== 'armed' || !rec.arm) return;
          rec.arm = { ...rec.arm, navigated: true, goStart: false };
          await store(rec);
          await render(rec);
          await host.navigate(tabId, rec.state.tour.startUrl);
          return;
        }
        await dispatch(rec, { type: action });
      }),

    tabClosed: (tabId: number) =>
      serial(tabId, async () => {
        const rec = await load(tabId);
        if (!rec) return;
        if (rec.state.status !== 'done' && rec.state.status !== 'exited') {
          postWrongPageMiss(rec, rec.state);
          postEnd(rec, 'closed', rec.state.index);
        }
        await forget(rec);
      }),

    /** What a page that starts watching mid-tour has missed: the current step's latest match, or done; a check run's every result and its end. */
    async replay(setId: string): Promise<ProgressPost[]> {
      const out: ProgressPost[] = [];
      const live = new Set<string>();
      for (const tabId of (await host.load<number[]>(TABS_KEY)) ?? []) {
        const rec = await load(tabId);
        if (!rec || rec.state.tour.id !== setId) continue;
        const { state } = rec;
        const step = state.tour.steps[state.index];
        const match = step ? rec.posted[step.id] : undefined;
        if (rec.check) {
          // An ended run (done or exited) replays from the ended list below.
          if (state.status === 'done' || state.status === 'exited') continue;
          live.add(rec.runId ?? '');
          out.push(...checkResultPosts(rec), ...suggestPosts(rec));
        } else if (state.status === 'done') {
          out.push({ type: 'web-tour/done', setId });
        } else if (step && match) {
          out.push({
            type: 'web-tour/step',
            setId,
            stepIndex: state.index,
            stepId: step.id,
            match,
          });
          // After the step, so the page has its miss to attach the fix to.
          out.push(...suggestPosts(rec));
        }
      }
      const ended = await serial(CHECK_ENDS_QUEUE, loadEnded);
      for (const e of ended) {
        if (e.setId === setId && !live.has(e.runId)) out.push(...e.posts);
      }
      return out;
    },

    /** Times out seeks and armed waits whose timers died with a restarted worker. */
    async sweep() {
      if (await expireArmed()) host.backstop();
      for (const tabId of (await host.load<number[]>(TABS_KEY)) ?? []) {
        await serial(tabId, async () => {
          const rec = await load(tabId);
          if (!rec) return trackTab(tabId, false);
          if (
            rec.state.status === 'seeking' &&
            rec.seekAt > 0 &&
            host.now() - rec.seekAt >= FALLBACK_MS
          ) {
            await dispatch(rec, { type: 'timeout' });
          }
        });
      }
    },

    async isPlaying(tabId: number): Promise<boolean> {
      return (await load(tabId)) !== undefined;
    },
  };
}

export type PlaybackController = ReturnType<typeof createPlaybackController>;
