import { describe, expect, it } from 'vitest';
import {
  createPlaybackController,
  framesForStep,
  type HostFrame,
  type PlaybackHost,
  type ProgressPost,
} from './controller';
import type { ParsedStart } from './startMessage';

function fakeHost(frames: HostFrame[] = [{ frameId: 0, parentFrameId: -1, url: '' }]) {
  const store = new Map<string, unknown>();
  const sent: { frameId: number; msg: { type: string } & Record<string, unknown> }[] = [];
  const posts: ProgressPost[] = [];
  const timers: (() => void)[] = [];
  const injected: { frameIds: number[]; overlay: boolean }[] = [];
  const host: PlaybackHost = {
    openTab: async () => 7,
    frames: async () => frames,
    inject: async (_t, frameIds, overlay) => {
      injected.push({ frameIds, overlay });
    },
    sendToFrame: (_t, frameId, msg) => sent.push({ frameId, msg: msg as never }),
    load: async <T,>(k: string) => structuredClone(store.get(k)) as T | undefined,
    save: async (e) => {
      for (const [k, v] of Object.entries(e)) store.set(k, structuredClone(v));
    },
    remove: async (keys) => {
      for (const k of keys) store.delete(k);
    },
    post: (_s, msg) => posts.push(msg),
    setTimer: (_ms, cb) => timers.push(cb),
    now: () => 1000,
  };
  const lastSeek = () => [...sent].reverse().find((s) => s.msg.type === 'wt:seek')!;
  const lastRender = (frameId = 0) =>
    [...sent].reverse().find((s) => s.frameId === frameId && s.msg.type === 'wt:render')!.msg;
  return { host, store, sent, posts, timers, injected, lastSeek, lastRender };
}

const parsed = (): ParsedStart => ({
  version: 1,
  stepIndex: 0,
  pictures: { b: { mime: 'image/png', data: 'AAAA', w: 10, h: 10 } },
  tour: {
    id: 'set1',
    title: 'Post an update',
    startUrl: 'https://a.example/home',
    steps: [
      { id: 'a', title: 'Open', text: 'Click Open', urlPattern: 'https://a.example/home', frames: [], clues: { role: 'button', name: 'Open' }, action: 'click', hasPicture: false },
      { id: 'b', title: 'Read', text: 'Look here', urlPattern: 'https://a.example/course/*', frames: [], clues: { text: 'Grades' }, action: 'observe', hasPicture: true },
    ],
  },
});

describe('playback controller', () => {
  it('seeks the step on its page, spotlights it and moves on when the learner clicks', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    expect(await c.start(parsed())).toBe(7);
    await c.committed(7, 0, 'https://a.example/home');
    expect(h.injected[0]).toEqual({ frameIds: [0], overlay: true });
    const seek = h.lastSeek();
    expect(seek.frameId).toBe(0);
    await c.frameReport(7, 0, { type: 'wt:found', token: seek.msg.token as string, clue: 'role', tied: false, url: '' });
    expect(h.lastRender()).toMatchObject({ status: 'shown', targetHere: true, index: 0, label: 'Open' });
    expect(h.posts).toContainEqual({ type: 'web-tour/step', setId: 'set1', stepIndex: 0, stepId: 'a', match: 'role' });
    await c.frameReport(7, 0, { type: 'wt:acted', token: seek.msg.token as string });
    expect(h.lastRender()).toMatchObject({ index: 1 });
  });

  it('ignores reports for an older seek', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, { type: 'wt:found', token: 'stale', clue: 'role', tied: false, url: '' });
    expect(h.lastRender()).toMatchObject({ status: 'seeking' });
  });

  it('shows the picture after the fallback timer and posts a miss', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...parsed(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/course/3');
    h.timers.at(-1)!();
    await new Promise((r) => setTimeout(r, 0));
    await c.isPlaying(7);
    await new Promise((r) => setTimeout(r, 0));
    expect(h.lastRender()).toMatchObject({ status: 'fallback', picture: { mime: 'image/png', data: 'AAAA' } });
    expect(h.posts).toContainEqual({ type: 'web-tour/step', setId: 'set1', stepIndex: 1, stepId: 'b', match: 'none' });
  });

  it('waits on the wrong page and seeks after an in-app route change', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...parsed(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/home');
    expect(h.lastRender()).toMatchObject({ status: 'wrong-page', picture: { data: 'AAAA' } });
    const seeks = h.sent.filter((s) => s.msg.type === 'wt:seek').length;
    await c.historyChanged(7, 0, 'https://a.example/course/1');
    expect(h.sent.filter((s) => s.msg.type === 'wt:seek').length).toBe(seeks + 1);
    expect(h.lastRender()).toMatchObject({ status: 'seeking' });
  });

  it('draws the spotlight in the frame that holds the target and the tip in the top frame', async () => {
    const h = fakeHost([
      { frameId: 0, parentFrameId: -1, url: 'https://a.example/home' },
      { frameId: 4, parentFrameId: 0, url: 'https://b.example/inner' },
    ]);
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.tour.steps[0].frames = [{ urlPattern: 'https://b.example/inner', index: 0 }];
    await c.start(p);
    await c.committed(7, 0, 'https://a.example/home');
    const seek = h.lastSeek();
    expect(seek.frameId).toBe(4);
    await c.frameReport(7, 4, { type: 'wt:found', token: seek.msg.token as string, clue: 'text', tied: false, url: '' });
    expect(h.injected.at(-1)).toEqual({ frameIds: [4], overlay: true });
    expect(h.lastRender(0)).toMatchObject({ role: 'top', targetHere: false, status: 'shown' });
    expect(h.lastRender(4)).toMatchObject({ role: 'target', targetHere: true });
    // An action reported by another frame doesn't count.
    await c.frameReport(7, 0, { type: 'wt:acted', token: seek.msg.token as string });
    expect(h.lastRender(0)).toMatchObject({ index: 0 });
  });

  it('posts done, then exit clears the overlay and the saved state', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...parsed(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/course/1');
    await c.overlayCommand(7, 0, { type: 'wt:ui', action: 'next' });
    expect(h.posts).toContainEqual({ type: 'web-tour/done', setId: 'set1' });
    await c.overlayCommand(7, 0, { type: 'wt:ui', action: 'exit' });
    expect(h.posts.some((p) => p.type === 'web-tour/exit')).toBe(false);
    expect(h.sent.at(-1)?.msg.type).toBe('wt:clear');
    expect(await c.isPlaying(7)).toBe(false);
    expect([...h.store.keys()].filter((k) => k.startsWith('wt:pic'))).toEqual([]);
  });

  it('ignores overlay commands from a subframe and reports a closed tab', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.overlayCommand(7, 3, { type: 'wt:ui', action: 'next' });
    expect(h.lastRender()).toMatchObject({ index: 0 });
    await c.tabClosed(7);
    expect(h.posts).toContainEqual({ type: 'web-tour/closed', setId: 'set1', stepIndex: 0 });
    expect(await c.isPlaying(7)).toBe(false);
  });
});

describe('framesForStep', () => {
  const frames: HostFrame[] = [
    { frameId: 0, parentFrameId: -1, url: 'https://a.example/' },
    { frameId: 1, parentFrameId: 0, url: 'https://b.example/x' },
    { frameId: 2, parentFrameId: 0, url: 'https://b.example/x' },
    { frameId: 3, parentFrameId: 2, url: 'https://c.example/deep' },
  ];
  it('is the top frame when the step has no frames', () => {
    expect(framesForStep(frames, [])).toEqual([0]);
  });
  it('follows the recorded chain and prefers the recorded sibling', () => {
    expect(framesForStep(frames, [{ urlPattern: 'https://b.example/x', index: 1 }])).toEqual([2, 1]);
    expect(
      framesForStep(frames, [
        { urlPattern: 'https://b.example/x', index: 0 },
        { urlPattern: 'https://c.example/deep', index: 0 },
      ])
    ).toEqual([3]);
    expect(framesForStep(frames, [{ urlPattern: 'https://z.example/', index: 0 }])).toEqual([]);
  });
});
