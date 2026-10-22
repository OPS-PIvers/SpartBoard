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
  | { type: 'overlay/render'; state: OverlayState }
  | { type: 'overlay/unmount' };

export type ProgressPost = WebTourProgressMessage;

/** The Chrome APIs playback needs, so the controller runs against a fake in tests. */
export interface PlaybackHost {
  openTab(url: string): Promise<number>;
  frames(tabId: number): Promise<HostFrame[]>;
  /** Injects the locator script into frames (and the overlay into those listed), idempotently. */
  inject(tabId: number, frameIds: number[], overlay: boolean): Promise<void>;
  sendToFrame(tabId: number, frameId: number, msg: FrameCommand | OverlayMessage): void;
  load<T>(key: string): Promise<T | undefined>;
  save(entries: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  post(setId: string, msg: ProgressPost): void;
  setTimer(ms: number, cb: () => void): void;
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
  /** Last match posted per step, so an unchanged repeat isn't posted again. */
  posted: Record<string, LocatorClue | 'none'>;
}

export const FALLBACK_MS = 4000;
const tabKey = (tabId: number) => `wt:tab:${tabId}`;
const picKey = (tabId: number, stepId: string) => `wt:pic:${tabId}:${stepId}`;
const TABS_KEY = 'wt:tabs';

/** The frame ids whose chain of addresses matches the step's recorded frames; empty when none do. */
export function framesForStep(
  frames: HostFrame[],
  path: { urlPattern: string; index: number }[]
): number[] {
  if (path.length === 0) return [0];
  const byId = new Map(frames.map((f) => [f.frameId, f]));
  const chain = (f: HostFrame): HostFrame[] => {
    const out: HostFrame[] = [];
    for (let c: HostFrame | undefined = f; c && c.frameId !== 0; c = byId.get(c.parentFrameId)) {
      out.unshift(c);
    }
    return out;
  };
  const hits = frames.filter((f) => {
    const c = chain(f);
    return c.length === path.length && c.every((cf, i) => matchesUrlPattern(path[i].urlPattern, cf.url));
  });
  if (hits.length <= 1) return hits.map((f) => f.frameId);
  // Several sibling frames match: prefer the one at the recorded position among its matching siblings.
  const last = path[path.length - 1].index;
  const preferred = hits[Math.min(Math.max(last, 0), hits.length - 1)];
  return [preferred.frameId, ...hits.filter((f) => f !== preferred).map((f) => f.frameId)];
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

  async function trackTab(tabId: number, add: boolean) {
    const tabs = new Set((await host.load<number[]>(TABS_KEY)) ?? []);
    if (add) tabs.add(tabId);
    else tabs.delete(tabId);
    await host.save({ [TABS_KEY]: [...tabs] });
  }

  async function picture(rec: TabRecord): Promise<WebTourPictureBytes | null> {
    const step = rec.state.tour.steps[rec.state.index];
    if (!step?.hasPicture) return null;
    if (rec.state.status !== 'fallback' && rec.state.status !== 'wrong-page') return null;
    return (await host.load<WebTourPictureBytes>(picKey(rec.tabId, step.id))) ?? null;
  }

  async function render(rec: TabRecord) {
    const { state } = rec;
    const step = state.tour.steps[state.index];
    if (state.status === 'exited' || !step) {
      host.sendToFrame(rec.tabId, 0, { type: 'overlay/unmount' });
      if (rec.targetFrameId !== null && rec.targetFrameId !== 0) {
        host.sendToFrame(rec.tabId, rec.targetFrameId, { type: 'overlay/unmount' });
      }
      return;
    }
    const shownIn = state.status === 'shown' ? rec.targetFrameId : null;
    const base = {
      title: step.title,
      text: step.text,
      current: state.index + 1,
      total: state.tour.steps.length,
      status: state.status,
      observe: step.action === 'observe',
    };
    host.sendToFrame(rec.tabId, 0, {
      type: 'overlay/render',
      state: { ...base, role: 'top', targetHere: shownIn === 0, picture: await picture(rec) },
    });
    if (rec.litFrameId !== null && rec.litFrameId !== 0 && rec.litFrameId !== shownIn) {
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

  function postProgress(rec: TabRecord, before: PlaybackState) {
    const { state } = rec;
    const setId = state.tour.id;
    const step = state.tour.steps[state.index];
    if (state.status === 'shown' || state.status === 'fallback') {
      const how = state.matched[step.id];
      const match = how === undefined || how === 'picture' ? 'none' : how;
      if (rec.posted[step.id] !== match) {
        rec.posted = { ...rec.posted, [step.id]: match };
        host.post(setId, { type: 'web-tour/step', setId, stepIndex: state.index, stepId: step.id, match });
      }
    }
    if (state.status === 'done' && before.status !== 'done') {
      host.post(setId, { type: 'web-tour/done', setId });
    }
    if (state.status === 'exited' && before.status !== 'exited' && before.status !== 'done') {
      host.post(setId, { type: 'web-tour/exit', setId, stepIndex: state.index });
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
    host.setTimer(FALLBACK_MS, () => {
      void serial(rec.tabId, async () => {
        const now = await load(rec.tabId);
        if (now && now.token === token) await dispatch(now, { type: 'timeout' });
      });
    });
  }

  async function dispatch(rec: TabRecord, event: PlaybackEvent, frameId: number | null = null) {
    const before = rec.state;
    rec.state = reducePlayback(before, event);
    if (event.type === 'found' && rec.state.status === 'shown') rec.targetFrameId = frameId;
    postProgress(rec, before);
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

  async function forget(rec: TabRecord) {
    await host.remove([
      tabKey(rec.tabId),
      ...rec.state.tour.steps.map((s) => picKey(rec.tabId, s.id)),
    ]);
    await trackTab(rec.tabId, false);
  }

  return {
    /** Opens the tour's first page in a new tab and starts playing there. */
    async start(parsed: ParsedStart): Promise<number> {
      const tabId = await host.openTab(parsed.tour.startUrl);
      const state = startPlayback(parsed.tour, parsed.tour.startUrl, host.now());
      const rec: TabRecord = {
        tabId,
        state: { ...state, index: parsed.stepIndex, furthest: parsed.stepIndex },
        token: '',
        seq: 0,
        targetFrameId: null,
        litFrameId: null,
        url: parsed.tour.startUrl,
        posted: {},
      };
      await host.save(
        Object.fromEntries(
          Object.entries(parsed.pictures).map(([id, pic]) => [picKey(tabId, id), pic])
        )
      );
      await store(rec);
      await trackTab(tabId, true);
      return tabId;
    },

    /** A new document committed in a frame of the tab (navigation, reload or a new frame). */
    committed: (tabId: number, frameId: number, url: string) =>
      serial(tabId, async () => {
      const rec = await load(tabId);
      if (!rec) return;
      await host.inject(tabId, [frameId], frameId === 0);
      if (frameId === 0) {
        rec.url = url;
        await dispatch(rec, { type: 'page', url });
      } else if (rec.state.status === 'seeking') {
        // A frame added after the seek started gets the current step too.
        await seek(rec);
        await render(rec);
        await store(rec);
      }
    }),

    /** A single-page app changed its address without loading a new document. */
    historyChanged: (tabId: number, frameId: number, url: string) =>
      serial(tabId, async () => {
      if (frameId !== 0) return;
      const rec = await load(tabId);
      if (!rec || url === rec.url) return;
      rec.url = url;
      await dispatch(rec, { type: 'page', url });
    }),

    frameReport: (tabId: number, frameId: number, report: FrameReport) =>
      serial(tabId, async () => {
      const rec = await load(tabId);
      if (!rec || report.token !== rec.token) return;
      if (report.type === 'wt:found') {
        if (rec.state.status === 'shown' && rec.targetFrameId !== frameId) return;
        // The spotlight is drawn inside the frame that holds the target.
        if (frameId !== 0) await host.inject(tabId, [frameId], true);
        await dispatch(rec, { type: 'found', clue: report.clue }, frameId);
      } else if (frameId === rec.targetFrameId) {
        await dispatch(rec, { type: report.type === 'wt:lost' ? 'lost' : 'acted' });
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
        host.post(setId, { type: 'web-tour/closed', setId, stepIndex: rec.state.index });
      }
      await forget(rec);
    }),

    async isPlaying(tabId: number): Promise<boolean> {
      return (await load(tabId)) !== undefined;
    },
  };
}

export type PlaybackController = ReturnType<typeof createPlaybackController>;
