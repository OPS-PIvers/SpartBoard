import { describe, expect, it } from 'vitest';
import {
  createPlaybackController,
  type HostFrame,
  type PlaybackHost,
  type ProgressPost,
} from './controller';
import { isFrameReport } from './internalMessages';
import {
  reducePlayback,
  startPlayback,
  type PlaybackState,
  type PlaybackStep,
  type PlaybackTour,
} from './progress';
import type { ParsedStart } from './startMessage';

const HOME = 'https://a.example/home';
const CLASS = 'https://a.example/class/*';

const step = (
  id: string,
  urlPattern = HOME,
  action: PlaybackStep['action'] = 'click'
): PlaybackStep => ({
  id,
  title: `Title ${id}`,
  text: '',
  urlPattern,
  frames: [],
  clues: { role: 'button', name: id },
  action,
  hasPicture: false,
});

const tour: PlaybackTour = {
  id: 'set1',
  title: 'T',
  startUrl: HOME,
  steps: [
    step('a'),
    step('b', HOME, 'observe'),
    step('c'),
    step('d'),
    step('e'),
    step('f', CLASS),
    step('g', CLASS),
  ],
};

describe('catch-up in the playback reducer (TOURS_10X.md P2, P3)', () => {
  it('jumps to the step after an early action and records the steps passed over', () => {
    let s = startPlayback(tour, HOME, 0);
    s = reducePlayback(s, { type: 'found', match: 'role' });
    s = reducePlayback(s, { type: 'ahead', index: 2, url: HOME });
    expect(s.index).toBe(3);
    expect(s.status).toBe('seeking');
    expect(s.skipped).toEqual(['a', 'b']);
  });

  it('moves on from the current step when it was done before it was lit', () => {
    let s = startPlayback(tour, HOME, 0);
    s = reducePlayback(s, { type: 'ahead', index: 0, url: HOME });
    expect(s.index).toBe(1);
    expect(s.skipped).toEqual([]);
  });

  it('ignores an action beyond the lookahead or behind the current step', () => {
    let s = startPlayback(tour, HOME, 0);
    expect(reducePlayback(s, { type: 'ahead', index: 4 })).toBe(s);
    s = reducePlayback(s, { type: 'next', url: HOME });
    s = reducePlayback(s, { type: 'next', url: HOME });
    expect(reducePlayback(s, { type: 'ahead', index: 1 })).toBe(s);
  });

  it('catches up when a later step’s page is reached while the tour still seeks', () => {
    let s = startPlayback(tour, HOME, 0);
    s = reducePlayback(s, { type: 'next', url: HOME });
    s = reducePlayback(s, { type: 'next', url: HOME });
    s = reducePlayback(s, { type: 'page', url: 'https://a.example/class/4' });
    // Step e led to the class page; c and d were passed over.
    expect(s.index).toBe(5);
    expect(s.status).toBe('seeking');
    expect(s.skipped).toEqual(['c', 'd']);
  });

  it('a skipped step visited with Back is no longer skipped', () => {
    let s = startPlayback(tour, HOME, 0);
    s = reducePlayback(s, { type: 'ahead', index: 2, url: HOME });
    s = reducePlayback(s, { type: 'back', url: HOME });
    s = reducePlayback(s, { type: 'back', url: HOME });
    expect(s.index).toBe(1);
    expect(s.skipped).toEqual(['a']);
  });

  it('finishes when the last step is done early', () => {
    let s = startPlayback(tour, HOME, 0);
    for (let i = 0; i < 4; i++)
      s = reducePlayback(s, { type: 'next', url: HOME });
    s = reducePlayback(s, {
      type: 'page',
      url: 'https://a.example/class/4',
    });
    expect(s.index).toBe(5);
    s = reducePlayback(s, { type: 'ahead', index: 6 });
    expect(s.status).toBe('done');
  });
});

function fakeHost() {
  const frames: HostFrame[] = [{ frameId: 0, parentFrameId: -1, url: '' }];
  const store = new Map<string, unknown>();
  const sent: { frameId: number; msg: Record<string, unknown> }[] = [];
  const posts: ProgressPost[] = [];
  const timers: (() => void)[] = [];
  const host: PlaybackHost = {
    openTab: () => Promise.resolve(7),
    navigate: () => Promise.resolve(),
    closeTab: () => Promise.resolve(),
    backstop: () => undefined,
    frames: () => Promise.resolve(frames),
    inject: () => Promise.resolve(),
    sendToFrame: (_t, frameId, msg) => sent.push({ frameId, msg: { ...msg } }),
    load: <T>(k: string) => Promise.resolve(structuredClone(store.get(k)) as T),
    save: (e) => {
      for (const [k, v] of Object.entries(e)) store.set(k, structuredClone(v));
      return Promise.resolve();
    },
    remove: (keys) => {
      for (const k of keys) store.delete(k);
      return Promise.resolve();
    },
    post: (_s, msg) => posts.push(msg),
    setTimer: (_ms, cb) => timers.push(cb),
    now: () => 1000,
  };
  const seeks = () => sent.filter((s) => s.msg.type === 'wt:seek');
  const renders = () =>
    sent
      .filter((s) => s.frameId === 0 && s.msg.type === 'overlay/render')
      .map((s) => s.msg.state as Record<string, unknown>);
  const state = () =>
    (store.get('wt:tab:7') as { state: PlaybackState } | undefined)?.state;
  return { host, sent, posts, timers, seeks, renders, state };
}

const started = (): ParsedStart => ({
  version: 1,
  stepIndex: 0,
  pictures: {},
  tour: structuredClone(tour),
});

const settle = () => new Promise((r) => setTimeout(r, 0));

/** Starts the tour on its page with step 1 lit, as a learner finds it. */
async function playing() {
  const h = fakeHost();
  const c = createPlaybackController(h.host);
  await c.start(started());
  await c.committed(7, 0, HOME);
  const token = () => h.seeks().at(-1)!.msg.token as string;
  await c.frameReport(7, 0, {
    type: 'wt:found',
    token: token(),
    weak: false,
    url: '',
  });
  return { h, c, token };
}

describe('catch-up in the playback controller', () => {
  it('watches the next three steps on the same page, leaving out look-only steps', async () => {
    const { h } = await playing();
    const seek = h.seeks().at(-1)!.msg;
    expect(seek).toMatchObject({ index: 0, stepId: 'a' });
    expect(
      (seek.ahead as { index: number; stepId: string }[]).map((a) => [
        a.index,
        a.stepId,
      ])
    ).toEqual([
      [2, 'c'],
      [3, 'd'],
    ]);
  });

  it.each([
    [0, 1],
    [2, 3],
    [3, 4],
  ])(
    'a click-ahead to step index %i ends on step index %i with no fallback',
    async (index, landed) => {
      const { h, c, token } = await playing();
      await c.frameReport(7, 0, {
        type: 'wt:ahead',
        token: token(),
        index,
        stepId: tour.steps[index].id,
      });
      expect(h.state()?.index).toBe(landed);
      await c.frameReport(7, 0, {
        type: 'wt:found',
        token: token(),
        weak: false,
        url: '',
      });
      // Every fallback timer that was set, stale or current, now fires.
      for (const fire of h.timers.splice(0)) fire();
      await settle();
      await c.isPlaying(7);
      await settle();
      expect(h.renders().some((r) => r.status === 'fallback')).toBe(false);
      expect(h.renders().at(-1)).toMatchObject({
        status: 'shown',
        current: landed + 1,
      });
      // Each step's tip is drawn in one unbroken run: it never comes back after another step's.
      const runs = h
        .renders()
        .map((r) => r.current)
        .filter((n, i, all) => i === 0 || all[i - 1] !== n);
      expect(new Set(runs).size).toBe(runs.length);
      expect(runs).toEqual(landed === 1 ? [1, 2] : [1, landed + 1]);
      expect(
        h.posts.filter((p) => p.type === 'web-tour/step' && p.match === 'none')
      ).toEqual([]);
    }
  );

  it('records the passed-over steps in the run', async () => {
    const { h, c, token } = await playing();
    await c.frameReport(7, 0, {
      type: 'wt:ahead',
      token: token(),
      index: 3,
      stepId: 'd',
    });
    expect(h.state()?.skipped).toEqual(['a', 'b', 'c']);
  });

  it('ignores an early action from an older seek, for another step, or too far ahead', async () => {
    const { h, c, token } = await playing();
    await c.frameReport(7, 0, {
      type: 'wt:ahead',
      token: 'stale',
      index: 2,
      stepId: 'c',
    });
    await c.frameReport(7, 0, {
      type: 'wt:ahead',
      token: token(),
      index: 2,
      stepId: 'd',
    });
    await c.frameReport(7, 0, {
      type: 'wt:ahead',
      token: token(),
      index: 4,
      stepId: 'e',
    });
    expect(h.state()?.index).toBe(0);
    expect(h.renders().at(-1)).toMatchObject({ status: 'shown', current: 1 });
  });

  it('catches up to a later step’s page reached before the current step was found', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...started(), stepIndex: 3 });
    await c.committed(7, 0, HOME);
    await c.historyChanged(7, 0, 'https://a.example/class/2');
    expect(h.state()).toMatchObject({ index: 5, skipped: ['d'] });
    expect(h.renders().at(-1)).toMatchObject({ status: 'seeking', current: 6 });
  });

  it('never double-advances when the step’s own action and an early report for it race', async () => {
    // The early report arrives first: the late own action is from an older seek.
    const first = await playing();
    const t1 = first.token();
    await first.c.frameReport(7, 0, {
      type: 'wt:ahead',
      token: t1,
      index: 0,
      stepId: 'a',
    });
    await first.c.frameReport(7, 0, { type: 'wt:acted', token: t1 });
    expect(first.h.state()?.index).toBe(1);

    // The own action arrives first: the early report, sent under the next seek, is behind the tour.
    const second = await playing();
    await second.c.frameReport(7, 0, {
      type: 'wt:acted',
      token: second.token(),
    });
    expect(second.h.state()?.index).toBe(1);
    await second.c.frameReport(7, 0, {
      type: 'wt:ahead',
      token: second.token(),
      index: 0,
      stepId: 'a',
    });
    expect(second.h.state()?.index).toBe(1);
    expect(second.h.state()?.skipped ?? []).toEqual([]);
  });

  it('accepts only well-formed early-action reports from a frame', () => {
    expect(
      isFrameReport({ type: 'wt:ahead', token: 't', index: 2, stepId: 'c' })
    ).toBe(true);
    expect(
      isFrameReport({ type: 'wt:ahead', token: 't', index: -1, stepId: 'c' })
    ).toBe(false);
    expect(
      isFrameReport({ type: 'wt:ahead', token: 't', index: 1.5, stepId: 'c' })
    ).toBe(false);
    expect(isFrameReport({ type: 'wt:ahead', token: 't', index: 2 })).toBe(
      false
    );
  });
});
