import { describe, expect, it } from 'vitest';
import {
  createPlaybackController,
  framesForStep,
  SESSION_BUDGET,
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
      clue: 'role',
      tied: false,
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

  it('replays the current step for a page that starts watching late', async () => {
    const h = fakeHost();
    const c = createPlaybackController(h.host);
    await c.start(parsed());
    await c.committed(7, 0, 'https://a.example/home');
    const seek = h.lastSeek();
    await c.frameReport(7, 0, {
      type: 'wt:found',
      token: seek.msg.token as string,
      clue: 'text',
      tied: false,
      url: '',
    });
    expect(await c.replay('set1')).toEqual([
      {
        type: 'web-tour/step',
        setId: 'set1',
        stepIndex: 0,
        stepId: 'a',
        match: 'text',
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
      clue: 'role',
      tied: false,
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
    await c.start({ ...parsed(), stepIndex: 1 });
    await c.committed(7, 0, 'https://a.example/home');
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
    await c.frameReport(7, 4, {
      type: 'wt:found',
      token: seek.msg.token as string,
      clue: 'text',
      tied: false,
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
      clue: 'role',
      tied: false,
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
});
