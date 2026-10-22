import type { FrameCommand, FrameReport } from './frameScript';
import type { LocatorClue } from './locate';
import {
  reducePlayback,
  startPlayback,
  type PlaybackEvent,
  type PlaybackState,
} from './progress';
import type {
  WebTourPictureBytes,
  WebTourProgressMessage,
} from '@/components/tours/web/extensionProtocol';
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

export type ProgressPost = WebTourProgressMessage;

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
  posted: Record<string, LocatorClue | 'none'>;
  /** Step index of the last step post, so a revisit found by the same clue still moves the hub's marker. */
  postedIndex: number;
  /** Step index on which a page actually loaded and didn't match, so only a real wrong page counts as a miss. */
  wrongPageIndex?: number;
}

export const FALLBACK_MS = 4000;
const tabKey = (tabId: number) => `wt:tab:${tabId}`;
const picKey = (tabId: number, stepId: string) => `wt:pic:${tabId}:${stepId}`;
const TABS_KEY = 'wt:tabs';
// Not a real tab id: the queue that keeps two starts from racing.
const START_QUEUE = -1;
const TABS_QUEUE = -2;
/** The session store holds 10 MB; one tour's record and pictures stay under this. */
export const SESSION_BUDGET = 9 * 1024 * 1024;
const MAX_TITLE = 200;
const isWebPage = (url: string) => /^https?:\/\//.test(url);

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
    const shownIn = state.status === 'shown' ? rec.targetFrameId : null;
    const base = {
      title: step.title.slice(0, MAX_TITLE),
      text: step.text,
      current: state.index + 1,
      total: state.tour.steps.length,
      status: state.status,
      observe: step.action === 'observe',
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

  function postStep(
    rec: TabRecord,
    index: number,
    match: LocatorClue | 'none'
  ) {
    const setId = rec.state.tour.id;
    const step = rec.state.tour.steps[index];
    if (!step) return;
    rec.posted = { ...rec.posted, [step.id]: match };
    rec.postedIndex = index;
    host.post(setId, {
      type: 'web-tour/step',
      setId,
      stepIndex: index,
      stepId: step.id,
      match,
    });
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
    const setId = state.tour.id;
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
      host.post(setId, { type: 'web-tour/done', setId });
    }
    if (
      state.status === 'exited' &&
      before.status !== 'exited' &&
      before.status !== 'done'
    ) {
      host.post(setId, {
        type: 'web-tour/exit',
        setId,
        stepIndex: state.index,
      });
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

  async function startNow(parsed: ParsedStart): Promise<number> {
    for (const other of (await host.load<number[]>(TABS_KEY)) ?? []) {
      await serial(other, async () => {
        const rec = await load(other);
        if (!rec) return;
        if (rec.state.status !== 'done') {
          const setId = rec.state.tour.id;
          postWrongPageMiss(rec, rec.state);
          host.post(setId, {
            type: 'web-tour/exit',
            setId,
            stepIndex: rec.state.index,
          });
        }
        await stopTab(rec);
      });
    }
    // The record is saved before the page loads, so its first commit always finds it.
    const tabId = await host.openTab('about:blank');
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
          status: 'seeking',
        },
        token: '',
        seq: 0,
        targetFrameId: null,
        litFrameId: null,
        url: 'about:blank',
        seekAt: 0,
        posted: {},
        postedIndex: -1,
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
        await host.closeTab(tabId).catch(() => undefined);
        throw err;
      }
      await host.navigate(tabId, parsed.tour.startUrl);
      return tabId;
    });
  }

  return {
    /** Opens the tour's first page in a new tab and starts playing there; one tour plays at a time. */
    start(parsed: ParsedStart): Promise<number> {
      return serial(START_QUEUE, () => startNow(parsed));
    },

    /** A new document committed in a frame of the tab (navigation, reload or a new frame). */
    committed: (tabId: number, frameId: number, url: string) =>
      serial(tabId, async () => {
        const rec = await load(tabId);
        if (!rec || !isWebPage(url)) return;
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
          // The spotlight is drawn inside the frame that holds the target.
          if (frameId !== 0) await host.inject(tabId, [frameId], true);
          await dispatch(rec, { type: 'found', clue: report.clue }, frameId);
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
        await dispatch(rec, { type: action });
      }),

    tabClosed: (tabId: number) =>
      serial(tabId, async () => {
        const rec = await load(tabId);
        if (!rec) return;
        const setId = rec.state.tour.id;
        if (rec.state.status !== 'done' && rec.state.status !== 'exited') {
          postWrongPageMiss(rec, rec.state);
          host.post(setId, {
            type: 'web-tour/closed',
            setId,
            stepIndex: rec.state.index,
          });
        }
        await forget(rec);
      }),

    /** What a page that starts watching mid-tour has missed: the current step's latest match, or done. */
    async replay(setId: string): Promise<ProgressPost[]> {
      const out: ProgressPost[] = [];
      for (const tabId of (await host.load<number[]>(TABS_KEY)) ?? []) {
        const rec = await load(tabId);
        if (!rec || rec.state.tour.id !== setId) continue;
        const { state } = rec;
        const step = state.tour.steps[state.index];
        const match = step ? rec.posted[step.id] : undefined;
        if (state.status === 'done') {
          out.push({ type: 'web-tour/done', setId });
        } else if (step && match) {
          out.push({
            type: 'web-tour/step',
            setId,
            stepIndex: state.index,
            stepId: step.id,
            match,
          });
        }
      }
      return out;
    },

    /** Times out seeks whose timer died with a restarted worker. */
    async sweep() {
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
