import { describe, expect, it } from 'vitest';
import {
  ARM_MS,
  createPlaybackController,
  framesForStep,
  SESSION_BUDGET,
  CHECK_END_KEEP_MS,
  CHECK_ENDS_KEPT,
  type HostFrame,
  type PlaybackHost,
  type ProgressPost,
} from './controller';
import type { ParsedStart } from './startMessage';

function fakeHost(
  frames: HostFrame[] = [{ frameId: 0, parentFrameId: -1, url: '' }]
) {
  const store = new Map<string, unknown>();
  const sent: {
    frameId: number;
    msg: { type: string } & Record<string, unknown>;
  }[] = [];
  const posts: ProgressPost[] = [];
  const timers: (() => void)[] = [];
  const injected: { frameIds: number[]; overlay: boolean }[] = [];
  const opened: string[] = [];
  const navigated: { tabId: number; url: string; saved: boolean }[] = [];
  const clock = { now: 1000 };
  let nextTab = 7;
  let backstops = 0;
  const host: PlaybackHost = {
    openTab: (url) => {
      opened.push(url);
      return Promise.resolve(nextTab++);
    },
    navigate: (tabId, url) => {
      navigated.push({ tabId, url, saved: store.has(`wt:tab:${tabId}`) });
      return Promise.resolve();
    },
    closeTab: () => Promise.resolve(),
    backstop: () => {
      backstops += 1;
    },
    frames: () => Promise.resolve(frames),
    inject: (_t, frameIds, overlay) => {
      injected.push({ frameIds, overlay });
      return Promise.resolve();
    },
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
    now: () => clock.now,
  };
  const lastSeek = () =>
    [...sent].reverse().find((s) => s.msg.type === 'wt:seek')!;
  const lastRender = (frameId = 0) =>
    (
      [...sent]
        .reverse()
        .find((s) => s.frameId === frameId && s.msg.type === 'overlay/render')!
        .msg as unknown as { state: Record<string, unknown> }
    ).state;
  return {
    host,
    store,
    sent,
    posts,
    timers,
    injected,
    opened,
    navigated,
    clock,
    lastSeek,
    lastRender,
    backstops: () => backstops,
  };
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
      {
        id: 'a',
        title: 'Open',
        text: 'Click Open',
        urlPattern: 'https://a.example/home',
        frames: [],
        clues: { role: 'button', name: 'Open' },
        action: 'click',
        hasPicture: false,
      },
      {
        id: 'b',
        title: 'Read',
        text: 'Look here',
        urlPattern: 'https://a.example/course/*',
        frames: [],
        clues: { text: 'Grades' },
        action: 'observe',
        hasPicture: true,
      },
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
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: seek.msg.token as string,
      weak: false,
      url: '',
    });
    expect(h.lastRender()).toMatchObject({
      status: 'shown',
      targetHere: true,
      current: 1,
      title: 'Open',
      observe: false,
    });
    expect(h.posts).toContainEqual({
      type: 'web-tour/step',
      setId: 'set1',
      stepIndex: 0,
      stepId: 'a',
      match: 'role',
    });
    await c.frameReport(7, 0, {
      type: 'wt:acted',
      token: seek.msg.token as string,
    });
    expect(h.lastRender()).toMatchObject({ current: 2 });
  });

  it('hands each seek the next step on the same page, so a frame can find it before the worker answers', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const tour = parsed();
    tour.tour.steps[1].urlPattern = 'https://a.example/home';
    await c.start(tour);
    await c.committed(7, 0, 'https://a.example/home');
    const seek = h.lastSeek().msg;
    const next = seek.next as { token: string; clues: unknown };
    expect(next.clues).toEqual({ text: 'Grades' });
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: seek.token as string,
      weak: false,
      url: '',
    });
    expect(h.lastRender().ahead).toEqual({
      token: next.token,
      title: 'Read',
      text: 'Look here',
      observe: true,
    });
    const before = h.sent.length;
    await c.frameReport(7, 0, {
      type: 'wt:acted',
      token: seek.token as string,
    });
    // The frame already moved on, so it gets the same token and no stop.
    const after = h.sent.slice(before);
    expect(after.some((s) => s.frameId === 0 && s.msg.type === 'wt:stop')).toBe(
      false
    );
    expect(h.lastSeek().msg.token).toBe(next.token);
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: next.token,
      weak: false,
      url: '',
    });
    expect(h.lastRender()).toMatchObject({ status: 'shown', current: 2 });
  });

  it('gives no next step when it plays on another page or is only looked at', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    expect(h.lastSeek().msg.next).toBeUndefined();
  });

  it('replays the current step for a page that starts watching late', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    const seek = h.lastSeek();
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: seek.msg.token as string,
      weak: true,
      url: '',
    });
    expect(await c.replay('set1')).toEqual([
      {
        type: 'web-tour/step',
        setId: 'set1',
        stepIndex: 0,
        stepId: 'a',
        match: 'score',
      },
    ]);
    expect(await c.replay('other')).toEqual([]);
  });

  it('ignores reports for an older seek', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: 'stale',
      weak: false,
      url: '',
    });
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
    expect(h.lastRender()).toMatchObject({
      status: 'fallback',
      picture: { mime: 'image/png', data: 'AAAA' },
    });
    expect(h.posts).toContainEqual({
      type: 'web-tour/step',
      setId: 'set1',
      stepIndex: 1,
      stepId: 'b',
      match: 'none',
    });
  });

  it('waits on the wrong page and seeks after an in-app route change', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.overlayAction(7, 0, 'next');
    await c.historyChanged(7, 0, 'https://a.example/settings');
    expect(h.lastRender()).toMatchObject({
      status: 'wrong-page',
      picture: { data: 'AAAA' },
    });
    const seeks = h.sent.filter((s) => s.msg.type === 'wt:seek').length;
    await c.historyChanged(7, 0, 'https://a.example/course/1');
    expect(h.sent.filter((s) => s.msg.type === 'wt:seek').length).toBe(
      seeks + 1
    );
    expect(h.lastRender()).toMatchObject({ status: 'seeking' });
  });

  it('draws the spotlight in the frame that holds the target and the tip in the top frame', async () => {
    const h = fakeHost([
      { frameId: 0, parentFrameId: -1, url: 'https://a.example/home' },
      { frameId: 4, parentFrameId: 0, url: 'https://b.example/inner' },
    ]);
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.tour.steps[0].frames = [
      { urlPattern: 'https://b.example/inner', index: 0 },
    ];
    await c.start(p);
    await c.committed(7, 0, 'https://a.example/home');
    const seek = h.lastSeek();
    expect(seek.frameId).toBe(4);
    // The frame's overlay is loaded with the seek, ahead of the find.
    expect(h.injected.at(-1)).toEqual({ frameIds: [4], overlay: true });
    await c.frameReport(7, 4, {
      type: 'wt:found',
      token: seek.msg.token as string,
      weak: true,
      url: '',
    });
    expect(h.injected.at(-1)).toEqual({ frameIds: [4], overlay: true });
    expect(h.lastRender(0)).toMatchObject({
      role: 'top',
      targetHere: false,
      status: 'shown',
    });
    expect(h.lastRender(4)).toMatchObject({ role: 'target', targetHere: true });
    // An action reported by another frame doesn't count.
    await c.frameReport(7, 0, {
      type: 'wt:acted',
      token: seek.msg.token as string,
    });
    expect(h.lastRender(0)).toMatchObject({ current: 1 });
  });

  it('posts done, then exit clears the overlay and the saved state', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...parsed(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/course/1');
    await c.overlayAction(7, 0, 'next');
    expect(h.posts).toContainEqual({ type: 'web-tour/done', setId: 'set1' });
    await c.overlayAction(7, 0, 'exit');
    expect(h.posts.some((p) => p.type === 'web-tour/exit')).toBe(false);
    expect(h.sent.at(-1)?.msg.type).toBe('overlay/unmount');
    expect(await c.isPlaying(7)).toBe(false);
    expect([...h.store.keys()].filter((k) => k.startsWith('wt:pic'))).toEqual(
      []
    );
  });

  it('ignores overlay commands from a subframe and reports a closed tab', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.overlayAction(7, 3, 'next');
    expect(h.lastRender()).toMatchObject({ current: 1 });
    await c.tabClosed(7);
    expect(h.posts).toContainEqual({
      type: 'web-tour/closed',
      setId: 'set1',
      stepIndex: 0,
    });
    expect(await c.isPlaying(7)).toBe(false);
  });
});

describe('playback controller, review fixes', () => {
  it('saves the tour before the page loads, so its first commit finds it', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    expect(h.opened).toEqual(['about:blank']);
    expect(h.navigated).toEqual([
      { tabId: 7, url: 'https://a.example/home', saved: true },
    ]);
    await c.committed(7, 0, 'about:blank');
    expect(h.injected).toEqual([]);
  });

  it('plays one tour at a time', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    expect(await c.start(parsed())).toBe(8);
    expect(await c.isPlaying(7)).toBe(false);
    expect(h.posts).toContainEqual({
      type: 'web-tour/exit',
      setId: 'set1',
      stepIndex: 0,
    });
  });

  it('keeps one tour when two starts arrive together', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const [first, second] = await Promise.all([
      c.start(parsed()),
      c.start(parsed()),
    ]);
    expect(await c.isPlaying(first)).toBe(false);
    expect(await c.isPlaying(second)).toBe(true);
  });

  it('posts a revisited step again so the watcher sees the current step', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    const found = async (weak: boolean) =>
      c.frameReport(7, 0, {
        type: 'wt:found',
        token: h.lastSeek().msg.token as string,
        weak,
        url: '',
      });
    await found(false);
    await c.overlayAction(7, 0, 'next');
    await c.committed(7, 0, 'https://a.example/course/1');
    await found(true);
    await c.overlayAction(7, 0, 'back');
    await c.committed(7, 0, 'https://a.example/home');
    await found(false);
    expect(h.posts.at(-1)).toEqual({
      type: 'web-tour/step',
      setId: 'set1',
      stepIndex: 0,
      stepId: 'a',
      match: 'role',
    });
  });

  it('counts a step left on the wrong page as a miss', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.overlayAction(7, 0, 'next');
    await c.committed(7, 0, 'https://a.example/login');
    await c.overlayAction(7, 0, 'back');
    expect(h.posts).toContainEqual({
      type: 'web-tour/step',
      setId: 'set1',
      stepIndex: 1,
      stepId: 'b',
      match: 'none',
    });
  });

  it('does not count a step left before its page was opened', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.overlayAction(7, 0, 'next');
    expect(h.lastRender()).toMatchObject({ status: 'wrong-page' });
    await c.overlayAction(7, 0, 'exit');
    expect(h.posts.some((p) => p.type === 'web-tour/step')).toBe(false);
  });

  it('counts the wrong-page step as a miss when another tour starts', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.overlayAction(7, 0, 'next');
    await c.committed(7, 0, 'https://a.example/login');
    await c.start(parsed());
    expect(h.posts.map((p) => p.type)).toEqual([
      'web-tour/step',
      'web-tour/exit',
    ]);
  });

  it('counts the wrong-page step as a miss when the tab closes', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.overlayAction(7, 0, 'next');
    await c.committed(7, 0, 'https://a.example/login');
    await c.tabClosed(7);
    expect(h.posts.map((p) => p.type)).toEqual([
      'web-tour/step',
      'web-tour/closed',
    ]);
  });

  it('drops pictures that would overflow the session store', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.pictures.b = {
      mime: 'image/png',
      data: 'A'.repeat(SESSION_BUDGET),
      w: 1,
      h: 1,
    };
    await c.start(p);
    expect([...h.store.keys()].some((k) => k.startsWith('wt:pic'))).toBe(false);
  });

  it('hands a late frame the running seek without restarting it', async () => {
    const frames: HostFrame[] = [
      { frameId: 0, parentFrameId: -1, url: 'https://a.example/home' },
    ];
    const h = fakeHost(frames);
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.tour.steps[0].frames = [{ urlPattern: 'https://b.example/*', index: 0 }];
    await c.start(p);
    await c.committed(7, 0, 'https://a.example/home');
    const token = h.lastSeek().msg.token;
    const timers = h.timers.length;
    frames.push({ frameId: 5, parentFrameId: 0, url: 'https://b.example/x' });
    await c.committed(7, 5, 'https://b.example/x');
    expect(h.lastSeek()).toMatchObject({ frameId: 5, msg: { token } });
    expect(h.timers.length).toBe(timers);
  });

  it('seeks again when the frame holding the target reloads', async () => {
    const frames: HostFrame[] = [
      { frameId: 0, parentFrameId: -1, url: 'https://a.example/home' },
      { frameId: 4, parentFrameId: 0, url: 'https://b.example/x' },
    ];
    const h = fakeHost(frames);
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.tour.steps[0].frames = [{ urlPattern: 'https://b.example/*', index: 0 }];
    await c.start(p);
    await c.committed(7, 0, 'https://a.example/home');
    const seek = h.lastSeek();
    await c.frameReport(7, 4, {
      type: 'wt:found',
      token: seek.msg.token as string,
      weak: false,
      url: '',
    });
    await c.committed(7, 4, 'https://b.example/x');
    expect(h.lastRender()).toMatchObject({ status: 'seeking' });
    expect(h.lastSeek().msg.token).not.toBe(seek.msg.token);
  });

  it('says the next step is on another page instead of searching', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.overlayAction(7, 0, 'next');
    expect(h.lastRender()).toMatchObject({ current: 2, status: 'wrong-page' });
  });

  it('times out a seek after a worker restart lost its timer', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    expect(h.backstops()).toBeGreaterThan(0);
    await c.sweep();
    expect(h.lastRender()).toMatchObject({ status: 'seeking' });
    h.clock.now += 5000;
    await c.sweep();
    expect(h.lastRender()).toMatchObject({ status: 'fallback' });
  });

  it('prunes a tab id whose record is already gone', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    h.store.set('wt:tabs', [7, 99]);
    await c.sweep();
    expect(h.store.get('wt:tabs')).toEqual([7]);
  });

  it('lets go of the tab once the learner leaves a finished tour', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...parsed(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/course/1');
    await c.overlayAction(7, 0, 'next');
    await c.historyChanged(7, 0, 'https://a.example/course/2');
    expect(await c.isPlaying(7)).toBe(true);
    const injections = h.injected.length;
    await c.committed(7, 0, 'https://other.example/');
    expect(await c.isPlaying(7)).toBe(false);
    expect(h.injected.length).toBe(injections);
  });

  it('cuts a long step title to what the overlay accepts', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.tour.steps[0].title = 'x'.repeat(500);
    await c.start(p);
    await c.committed(7, 0, 'https://a.example/home');
    expect((h.lastRender().title as string).length).toBe(200);
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
    expect(
      framesForStep(frames, [{ urlPattern: 'https://b.example/x', index: 1 }])
    ).toEqual([2, 1]);
    expect(
      framesForStep(frames, [
        { urlPattern: 'https://b.example/x', index: 0 },
        { urlPattern: 'https://c.example/deep', index: 0 },
      ])
    ).toEqual([3]);
    expect(
      framesForStep(frames, [{ urlPattern: 'https://z.example/', index: 0 }])
    ).toEqual([]);
  });
  it('reads the recorded index among the parent frame, not among the matches', () => {
    const withAd: HostFrame[] = [
      { frameId: 0, parentFrameId: -1, url: 'https://a.example/' },
      { frameId: 4, parentFrameId: 0, url: 'https://ads.example/' },
      { frameId: 5, parentFrameId: 0, url: 'https://b.example/x' },
      { frameId: 6, parentFrameId: 0, url: 'https://b.example/x' },
    ];
    expect(
      framesForStep(withAd, [{ urlPattern: 'https://b.example/x', index: 1 }])
    ).toEqual([5, 6]);
  });
});

describe('playback controller, check mode (C12)', () => {
  const checkStart = (): ParsedStart => ({
    ...parsed(),
    check: true,
    runId: 'r1',
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const timeOut = async (
    h: ReturnType<typeof fakeHost>,
    c: { isPlaying: (t: number) => Promise<boolean> }
  ) => {
    h.timers.at(-1)?.();
    await flush();
    await c.isPlaying(7);
    await flush();
  };

  it('reports a clear find as Found, and Next moves on without a click', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(checkStart());
    await c.committed(7, 0, 'https://a.example/home');
    expect(h.lastRender()).toMatchObject({ check: 'pending' });
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: false,
      url: '',
    });
    expect(h.lastRender()).toMatchObject({ status: 'shown', check: 'found' });
    await c.overlayAction(7, 0, 'next');
    expect(h.lastRender()).toMatchObject({ current: 2, check: 'pending' });
    expect(h.posts).toEqual([
      {
        type: 'web-tour/check-step',
        setId: 'set1',
        runId: 'r1',
        stepIndex: 0,
        stepId: 'a',
        result: 'found',
      },
    ]);
  });

  it('reports weak and ambiguous targets', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(checkStart());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: true,
      url: '',
    });
    await c.overlayAction(7, 0, 'next');
    await c.historyChanged(7, 0, 'https://a.example/course/2');
    const token = h.lastSeek().msg.token as string;
    await c.frameReport(7, 0, { type: 'wt:ambiguous', token });
    await timeOut(h, c);
    expect(h.lastRender()).toMatchObject({
      status: 'fallback',
      check: 'ambiguous',
    });
    const results = h.posts.flatMap((p) =>
      p.type === 'web-tour/check-step' ? [[p.stepId, p.result]] : []
    );
    expect(results).toEqual([
      ['a', 'weak'],
      ['b', 'ambiguous'],
    ]);
  });

  it('posts Not found on timeout, and re-reports it once candidates tie', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...checkStart(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/course/3');
    const token = h.lastSeek().msg.token as string;
    await timeOut(h, c);
    expect(h.posts.at(-1)).toMatchObject({ stepId: 'b', result: 'none' });
    await c.frameReport(7, 0, { type: 'wt:ambiguous', token });
    expect(h.posts.at(-1)).toMatchObject({ stepId: 'b', result: 'ambiguous' });
  });

  it('never posts run progress, so a hub watching the same tour logs nothing', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...checkStart(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/course/1');
    await c.overlayAction(7, 0, 'next');
    await c.start(checkStart());
    await c.tabClosed(8);
    expect(h.posts.every((p) => p.type.startsWith('web-tour/check-'))).toBe(
      true
    );
    expect(h.posts).toContainEqual({
      type: 'web-tour/check-end',
      setId: 'set1',
      runId: 'r1',
      stepIndex: 1,
      done: true,
    });
    expect(h.posts.at(-1)).toEqual({
      type: 'web-tour/check-end',
      setId: 'set1',
      runId: 'r1',
      stepIndex: 0,
      done: false,
    });
  });

  it('replays the current result to a page that reconnects', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(checkStart());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: false,
      url: '',
    });
    expect(await c.replay('set1')).toEqual([
      {
        type: 'web-tour/check-step',
        setId: 'set1',
        runId: 'r1',
        stepIndex: 0,
        stepId: 'a',
        result: 'found',
      },
    ]);
  });

  it('reports Not found when a step found earlier loses its target and then times out', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(checkStart());
    await c.committed(7, 0, 'https://a.example/home');
    const token = h.lastSeek().msg.token as string;
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token,
      weak: false,
      url: '',
    });
    await c.frameReport(7, 0, { type: 'wt:lost', token });
    expect(h.lastRender()).toMatchObject({
      status: 'seeking',
      check: 'pending',
    });
    await timeOut(h, c);
    expect(h.lastRender()).toMatchObject({ status: 'fallback', check: 'none' });
    expect(h.posts.at(-1)).toMatchObject({ stepId: 'a', result: 'none' });
  });

  it('works a revisited step out from the new seek only', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(checkStart());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: false,
      url: '',
    });
    await c.overlayAction(7, 0, 'next');
    await c.overlayAction(7, 0, 'back');
    expect(h.lastRender()).toMatchObject({ current: 1, check: 'pending' });
    await timeOut(h, c);
    expect(h.posts.at(-1)).toMatchObject({ stepId: 'a', result: 'none' });
  });

  it('replays every result of the run to a page that reconnects', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(checkStart());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: false,
      url: '',
    });
    await c.overlayAction(7, 0, 'next');
    await c.historyChanged(7, 0, 'https://a.example/course/2');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: true,
      url: '',
    });
    const replayed = await c.replay('set1');
    expect(
      replayed.map((p) =>
        p.type === 'web-tour/check-step' ? p.result : p.type
      )
    ).toEqual(['found', 'weak']);
  });

  it('keeps an ended check run for a while, so a late editor still gets its end', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(checkStart());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: false,
      url: '',
    });
    await c.overlayAction(7, 0, 'exit');
    expect(await c.isPlaying(7)).toBe(false);
    expect(await c.replay('set1')).toEqual([
      {
        type: 'web-tour/check-step',
        setId: 'set1',
        runId: 'r1',
        stepIndex: 0,
        stepId: 'a',
        result: 'found',
      },
      {
        type: 'web-tour/check-end',
        setId: 'set1',
        runId: 'r1',
        stepIndex: 0,
        done: false,
      },
    ]);
    expect(await c.replay('other')).toEqual([]);
    h.clock.now += CHECK_END_KEEP_MS;
    expect(await c.replay('set1')).toEqual([]);
  });

  it('replays the end of an exited check run whose record is still stored', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(checkStart());
    await c.committed(7, 0, 'https://a.example/home');
    const before = structuredClone(h.store.get('wt:tab:7')) as {
      state: { status: string };
    };
    await c.overlayAction(7, 0, 'exit');
    // A record left behind as exited (a forget that never finished) is not a live run.
    h.store.set('wt:tab:7', {
      ...before,
      state: { ...before.state, status: 'exited' },
    });
    h.store.set('wt:tabs', [7]);
    expect(await c.replay('set1')).toContainEqual({
      type: 'web-tour/check-end',
      setId: 'set1',
      runId: 'r1',
      stepIndex: 0,
      done: false,
    });
  });

  it('keeps only the last few ended check runs', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    for (let i = 0; i < CHECK_ENDS_KEPT + 2; i++) {
      const tab = await c.start({ ...checkStart(), runId: `r${i}` });
      await c.tabClosed(tab);
    }
    const ends = (await c.replay('set1')).flatMap((p) =>
      p.type === 'web-tour/check-end' ? [p.runId] : []
    );
    expect(ends).toEqual(['r2', 'r3', 'r4', 'r5', 'r6']);
  });

  it('ignores ambiguity reports outside check mode', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    const token = h.lastSeek().msg.token as string;
    await c.frameReport(7, 0, { type: 'wt:ambiguous', token });
    expect(h.posts).toEqual([]);
    expect('check' in h.lastRender()).toBe(false);
  });
});

describe('playback controller, suggested fixes (C14)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const fix = {
    role: 'button',
    name: 'Open course',
    css: '#open',
    box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
  };

  it("never posts a teacher's page words or page title, only the site's own clues (C15)", async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: true,
      url: '',
      fix: {
        role: 'link',
        name: 'Jane Smith',
        text: 'Jane Smith',
        heading: 'Smith, Jane',
        pageTitle: 'Smith, Jane - Grades',
        css: '#student-row',
        attrs: { ariaLabel: 'Open Jane Smith', testId: 'student-link' },
      },
    });
    const posted = h.posts.find((p) => p.type === 'web-tour/suggest');
    expect(posted).toMatchObject({
      locator: {
        role: 'link',
        name: 'Open',
        css: '#student-row',
        attrs: { testId: 'student-link' },
      },
    });
    expect(JSON.stringify(posted)).not.toMatch(/Jane|Smith|Grades/);
  });

  it('posts a fix again only when its clues change, not its position', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...parsed(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/course/3');
    const token = h.lastSeek().msg.token as string;
    h.timers.at(-1)!();
    await flush();
    await c.isPlaying(7);
    await flush();
    const moved = { ...fix, box: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } };
    await c.frameReport(7, 0, { type: 'wt:candidate', token, fix });
    await c.frameReport(7, 0, { type: 'wt:candidate', token, fix: moved });
    expect(h.posts.filter((p) => p.type === 'web-tour/suggest')).toHaveLength(
      1
    );
    await c.frameReport(7, 0, {
      type: 'wt:candidate',
      token,
      fix: { ...fix, css: '#other' },
    });
    expect(h.posts.filter((p) => p.type === 'web-tour/suggest')).toHaveLength(
      2
    );
  });

  it('replays the fix with the step to a page that reconnects, and with an ended check run', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: true,
      url: '',
      fix,
    });
    expect((await c.replay('set1')).map((p) => p.type)).toEqual([
      'web-tour/step',
      'web-tour/suggest',
    ]);

    const k = fakeHost();
    const check = createPlaybackController(k.host);
    await check.start({ ...parsed(), check: true, runId: 'r1' });
    await check.committed(7, 0, 'https://a.example/home');
    await check.frameReport(7, 0, {
      type: 'wt:found',
      token: k.lastSeek().msg.token as string,
      weak: true,
      url: '',
      fix,
    });
    expect((await check.replay('set1')).map((p) => p.type)).toEqual([
      'web-tour/check-step',
      'web-tour/suggest',
    ]);
    await check.overlayAction(7, 0, 'exit');
    await flush();
    const ended = (await check.replay('set1')).map((p) => p.type);
    expect(ended).toContain('web-tour/suggest');
    expect(ended.at(-1)).toBe('web-tour/check-end');
  });

  it('posts a weak match its own clues after the step', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: h.lastSeek().msg.token as string,
      weak: true,
      url: '',
      fix,
    });
    expect(h.posts.map((p) => p.type)).toEqual([
      'web-tour/step',
      'web-tour/suggest',
    ]);
    // A teacher's run keeps the step's own name; the site's clues are the candidate's.
    expect(h.posts[1]).toEqual({
      type: 'web-tour/suggest',
      setId: 'set1',
      stepIndex: 0,
      stepId: 'a',
      locator: { role: 'button', name: 'Open', css: '#open', box: fix.box },
    });
  });

  it('posts the closest candidate after a miss, once, and nothing for a clear find', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start({ ...parsed(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/course/3');
    const token = h.lastSeek().msg.token as string;
    await c.frameReport(7, 0, { type: 'wt:candidate', token, fix });
    expect(h.posts).toEqual([]);
    h.timers.at(-1)!();
    await flush();
    await c.isPlaying(7);
    await flush();
    expect(h.posts.map((p) => p.type)).toEqual([
      'web-tour/step',
      'web-tour/suggest',
    ]);
    await c.frameReport(7, 0, { type: 'wt:candidate', token, fix });
    expect(h.posts).toHaveLength(2);
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token,
      weak: false,
      url: '',
      fix,
    });
    expect(h.posts.at(-1)).toMatchObject({
      type: 'web-tour/step',
      match: 'role',
    });
  });

  it('marks a check run fix with its run id, and drops a fix from a frame off the step path', async () => {
    const frames: HostFrame[] = [
      { frameId: 0, parentFrameId: -1, url: 'https://a.example/home' },
      { frameId: 4, parentFrameId: 0, url: 'https://ads.example/x' },
    ];
    const h = fakeHost(frames);
    const c = createPlaybackController(h.host);
    await c.start({ ...parsed(), check: true, runId: 'r1' });
    await c.committed(7, 0, 'https://a.example/home');
    const token = h.lastSeek().msg.token as string;
    await c.frameReport(7, 4, { type: 'wt:candidate', token, fix });
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token,
      weak: true,
      url: '',
      fix,
    });
    const suggests = h.posts.filter((p) => p.type === 'web-tour/suggest');
    expect(suggests).toEqual([
      {
        type: 'web-tour/suggest',
        setId: 'set1',
        stepIndex: 0,
        stepId: 'a',
        locator: fix,
        runId: 'r1',
      },
    ]);
  });
});

describe('playback controller, waiting through sign-in (H1-H3)', () => {
  const navigationsTo = (h: ReturnType<typeof fakeHost>, url: string) =>
    h.navigated.filter((n) => n.url === url).length;

  it('arms in the given tab instead of opening one (H5)', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    expect(await c.start(parsed(), 42)).toBe(42);
    expect(h.opened).toEqual([]);
    expect(h.navigated).toEqual([
      { tabId: 42, url: 'https://a.example/home', saved: true },
    ]);
    await c.committed(42, 0, 'https://a.example/home');
    expect(h.lastRender()).toMatchObject({ status: 'seeking', current: 1 });
  });

  it('injects the overlay when the given tab only changes its fragment (H5)', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed(), 42);
    await c.historyChanged(42, 0, 'https://a.example/home');
    expect(h.injected).toContainEqual({ frameIds: [0], overlay: true });
    expect(h.lastRender()).toMatchObject({ status: 'seeking', current: 1 });
  });

  it('waits through a ClassLink redirect chain and starts on the start page', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    for (const url of [
      'https://launchpad.classlink.com/oauth2/v2/auth',
      'https://accounts.google.com/signin',
    ]) {
      await c.committed(7, 0, url);
      expect(h.lastRender()).toMatchObject({
        status: 'armed',
        goStart: false,
      });
    }
    expect(h.posts).toEqual([]);
    expect(h.sent.some((s) => s.msg.type === 'wt:seek')).toBe(false);
    await c.committed(7, 0, 'https://a.example/home');
    expect(h.lastRender()).toMatchObject({ status: 'seeking', current: 1 });
    expect(h.lastSeek().frameId).toBe(0);
    // The site came straight back to the start page, so no extra trip.
    expect(navigationsTo(h, 'https://a.example/home')).toBe(1);
  });

  it('goes to the start page once when sign-in lands on the home page', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.tour.startUrl = 'https://a.example/course/9';
    await c.start({ ...p, stepIndex: 1 });
    await c.committed(7, 0, 'https://launchpad.classlink.com/sso');
    await c.committed(7, 0, 'https://a.example/home');
    expect(navigationsTo(h, 'https://a.example/course/9')).toBe(2);
    expect(h.lastRender()).toMatchObject({ status: 'armed', goStart: false });
    await c.committed(7, 0, 'https://a.example/course/9');
    expect(h.lastRender()).toMatchObject({ status: 'seeking', current: 2 });
  });

  it('leaves the wait when a wildcard start step loads the site root', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.tour.startUrl = 'https://a.example/';
    p.tour.steps[0].urlPattern = 'https://a.example/*';
    await c.start({ ...p });
    await c.committed(7, 0, 'https://a.example/');
    expect(h.lastRender()).toMatchObject({ status: 'seeking', current: 1 });
  });

  it('keeps waiting on a same-site sign-in page the start url redirected to', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/users/sign_in');
    expect(h.lastRender()).toMatchObject({ status: 'armed' });
  });

  it('moves pictures one at a time and keeps them on the old tab if a move fails', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.pictures = {
      a: { mime: 'image/png', data: 'AAAA', w: 1, h: 1 },
      b: { mime: 'image/png', data: 'BBBB', w: 1, h: 1 },
    };
    await c.start(p);
    const saves: number[] = [];
    const save = h.host.save.bind(h.host);
    h.host.save = (e) => {
      saves.push(Object.keys(e).length);
      if (Object.keys(e).some((k) => k.startsWith('wt:pic:9:b')))
        return Promise.reject(new Error('quota'));
      return save(e);
    };
    await c.committed(7, 0, 'https://launchpad.classlink.com/home');
    await expect(
      c.committed(9, 0, 'https://a.example/dashboard')
    ).resolves.toBeUndefined();
    expect(saves.every((n) => n === 1)).toBe(true);
    expect(await c.isPlaying(7)).toBe(true);
    expect(await c.isPlaying(9)).toBe(false);
    expect(h.store.has('wt:pic:7:a')).toBe(true);
    expect(h.store.has('wt:pic:7:b')).toBe(true);
    expect(h.store.has('wt:pic:9:a')).toBe(false);
  });

  it('shows "Go to the start" instead of looping when the site bounces again', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.tour.startUrl = 'https://a.example/course/9';
    await c.start({ ...p, stepIndex: 1 });
    await c.committed(7, 0, 'https://launchpad.classlink.com/sso');
    await c.committed(7, 0, 'https://a.example/home');
    await c.committed(7, 0, 'https://launchpad.classlink.com/sso');
    await c.committed(7, 0, 'https://a.example/home');
    expect(navigationsTo(h, 'https://a.example/course/9')).toBe(2);
    expect(h.lastRender()).toMatchObject({ status: 'armed', goStart: true });
    await c.overlayAction(7, 0, 'start');
    expect(navigationsTo(h, 'https://a.example/course/9')).toBe(3);
    expect(h.lastRender()).toMatchObject({ status: 'armed', goStart: false });
  });

  it('offers "Go to the start" on a sign-in page of the site itself', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/login');
    expect(h.lastRender()).toMatchObject({ status: 'armed', goStart: true });
    expect(navigationsTo(h, 'https://a.example/home')).toBe(1);
  });

  it('follows a tab LaunchPad opens on the site and tells the first tab', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    const p = parsed();
    p.pictures = { b: { mime: 'image/png', data: 'AAAA', w: 10, h: 10 } };
    await c.start(p);
    await c.committed(7, 0, 'https://launchpad.classlink.com/home');
    await c.committed(9, 0, 'https://a.example/dashboard');
    expect(
      h.sent.some(
        (s) =>
          s.msg.type === 'overlay/render' &&
          (s.msg.state as { status: string }).status === 'moved'
      )
    ).toBe(true);
    expect(await c.isPlaying(7)).toBe(false);
    expect(await c.isPlaying(9)).toBe(true);
    expect(h.store.has('wt:pic:9:b')).toBe(true);
    expect(h.store.has('wt:pic:7:b')).toBe(false);
    // The new tab landed on a home page, so it goes to the start once.
    expect(h.navigated.at(-1)).toMatchObject({
      tabId: 9,
      url: 'https://a.example/home',
    });
    await c.committed(9, 0, 'https://a.example/home');
    expect(h.lastRender()).toMatchObject({ status: 'seeking' });
  });

  it('ignores tabs on other sites and a tab that reaches the site after 10 minutes', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(9, 0, 'https://other.example/');
    expect(await c.isPlaying(9)).toBe(false);
    h.clock.now += ARM_MS;
    await c.committed(10, 0, 'https://a.example/home');
    expect(await c.isPlaying(10)).toBe(false);
  });

  it('stops after 10 minutes without the site, and the page can start it again', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://launchpad.classlink.com/home');
    await c.sweep();
    expect(await c.isPlaying(7)).toBe(true);
    const before = h.backstops();
    h.clock.now += ARM_MS;
    await c.sweep();
    expect(await c.isPlaying(7)).toBe(false);
    expect(h.lastRender()).toMatchObject({ status: 'stopped' });
    expect(h.posts).toContainEqual({
      type: 'web-tour/exit',
      setId: 'set1',
      stepIndex: 0,
    });
    expect(h.backstops()).toBe(before);
  });

  it('keeps waking up while a tour is armed', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    const before = h.backstops();
    await c.sweep();
    expect(h.backstops()).toBe(before + 1);
  });

  it('lets the learner stop an armed tour', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://launchpad.classlink.com/home');
    await c.overlayAction(7, 0, 'exit');
    expect(await c.isPlaying(7)).toBe(false);
    expect(h.posts.map((p) => p.type)).toEqual(['web-tour/exit']);
  });
});
