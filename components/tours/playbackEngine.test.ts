import { describe, expect, it } from 'vitest';
import {
  backTarget,
  GLIDE_MS,
  rhythmOf,
  takeBackUrl,
  TICK_MS,
  catchUp,
  createSettle,
  enterRun,
  lookaheadIndices,
  matchLookahead,
  matchPageAhead,
  previousSkipped,
  skippedIndices,
  waitForSettle,
  type SettleHost,
} from './playbackEngine';

const steps = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));

// A hand-cranked clock: timers fire only when the test advances time.
function fakeHost() {
  let t = 0;
  let timers: { at: number; cb: () => void }[] = [];
  let listener: (() => void) | null = null;
  const host: SettleHost = {
    now: () => t,
    setTimer(ms, cb) {
      const timer = { at: t + ms, cb };
      timers.push(timer);
      return () => {
        timers = timers.filter((x) => x !== timer);
      };
    },
    watch(onChange) {
      listener = onChange;
      return () => {
        listener = null;
      };
    },
  };
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      const next = timers
        .filter((x) => x.at <= end)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      t = next.at;
      timers = timers.filter((x) => x !== next);
      next.cb();
    }
    t = end;
  };
  return {
    host,
    advance,
    change: () => listener?.(),
    watching: () => listener !== null,
  };
}

describe('lookahead', () => {
  it('watches the current step and the next three, within the tour', () => {
    expect(lookaheadIndices(0, 6)).toEqual([0, 1, 2, 3]);
    expect(lookaheadIndices(4, 6)).toEqual([4, 5]);
  });

  it('prefers the nearest match, so a repeated control resolves to the earlier step', () => {
    const target = { b: 'save', d: 'save' } as Record<string, string>;
    expect(matchLookahead(steps, 0, (s) => target[s.id] === 'save')).toBe(1);
  });

  it('ignores a match beyond the lookahead', () => {
    expect(matchLookahead(steps, 0, (s) => s.id === 'e')).toBeNull();
    expect(matchLookahead(steps, 1, (s) => s.id === 'e')).toBe(4);
  });

  it('finds the step whose action led to a newly reached page', () => {
    const pages = ['/home', '/home', '/class', '/class', '/work', '/work'];
    const onPage = (s: { id: string }, url: string) =>
      pages[steps.indexOf(s)] === url;
    // From step 0 on /home, reaching /class means step 1 led there.
    expect(matchPageAhead(steps, 0, '/class', onPage)).toBe(1);
    expect(matchPageAhead(steps, 2, '/work', onPage)).toBe(3);
    expect(matchPageAhead(steps, 1, '/class', onPage)).toBe(1);
    // Four steps ahead is beyond the lookahead.
    expect(matchPageAhead(steps, 0, '/work', onPage)).toBe(3);
  });

  it('never matches a page when the current step still plays there', () => {
    const onPage = () => true;
    expect(matchPageAhead(steps, 0, '/x', onPage)).toBeNull();
  });

  it('skips steps that cannot lead away from their page', () => {
    const pages = ['/a', '/b', '/c', '/c', '/c', '/c'];
    const onPage = (s: { id: string }, url: string) =>
      pages[steps.indexOf(s)] === url;
    expect(
      matchPageAhead(steps, 0, '/c', onPage, (s) => s.id !== 'b')
    ).toBeNull();
  });
});

describe('catch-up run state', () => {
  it('lands on the step after the match and records the passed-over steps', () => {
    const run = catchUp({ index: 1 }, steps, 3);
    expect(run.index).toBe(4);
    expect(run.skipped).toEqual(['b', 'c']);
    expect(skippedIndices(run, steps)).toEqual([1, 2]);
    expect(previousSkipped(run, steps)).toBe(2);
  });

  it('records nothing when the match is the current step', () => {
    const run = catchUp({ index: 2 }, steps, 2);
    expect(run).toEqual({ index: 3, skipped: [] });
  });

  it('keeps earlier skips and drops a step once it is visited or done', () => {
    let run = catchUp({ index: 0 }, steps, 2);
    expect(run.skipped).toEqual(['a', 'b']);
    run = enterRun(run, steps, 1);
    expect(run.skipped).toEqual(['a']);
    expect(run.index).toBe(1);
    run = catchUp(run, steps, 4);
    expect(run.skipped).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps other fields of the run', () => {
    const run = catchUp({ index: 0, status: 'seeking' }, steps, 0);
    expect(run.status).toBe('seeking');
  });
});

describe('settle', () => {
  it('is settled after a quiet window, and a change restarts it', () => {
    const s = createSettle(0, { quietMs: 100, capMs: 1000 });
    expect(s.settled(50)).toBeNull();
    s.change(80);
    expect(s.settled(150)).toBeNull();
    expect(s.due(150)).toBe(30);
    expect(s.settled(180)).toBe('quiet');
    expect(s.due(180)).toBe(0);
  });

  it('gives up at the cap on a page that never rests', () => {
    const s = createSettle(0, { quietMs: 100, capMs: 300 });
    for (let t = 0; t < 300; t += 50) s.change(t);
    expect(s.settled(299)).toBeNull();
    expect(s.settled(300)).toBe('cap');
  });

  it('waits on the host clock and resolves quiet once changes stop', async () => {
    const f = fakeHost();
    const wait = waitForSettle(f.host, { quietMs: 100, capMs: 1000 });
    let reason: string | null = null;
    void wait.done.then((r) => {
      reason = r;
    });
    f.advance(60);
    f.change();
    f.advance(90);
    await Promise.resolve();
    expect(reason).toBeNull();
    f.advance(20);
    await Promise.resolve();
    expect(reason).toBe('quiet');
    expect(f.watching()).toBe(false);
  });

  it('resolves at the cap while the area keeps changing', async () => {
    const f = fakeHost();
    const wait = waitForSettle(f.host, { quietMs: 100, capMs: 400 });
    let reason: string | null = null;
    void wait.done.then((r) => {
      reason = r;
    });
    for (let i = 0; i < 10; i++) {
      f.advance(50);
      f.change();
    }
    await Promise.resolve();
    expect(reason).toBe('cap');
  });

  it('never resolves once cancelled', async () => {
    const f = fakeHost();
    const wait = waitForSettle(f.host, { quietMs: 100 });
    let reason: string | null = null;
    void wait.done.then((r) => {
      reason = r;
    });
    wait.cancel();
    f.advance(5000);
    await Promise.resolve();
    expect(reason).toBeNull();
    expect(f.watching()).toBe(false);
  });
});

describe('Back, Take me back and the rhythm', () => {
  it('Back returns to the nearest skipped step, else the step before', () => {
    expect(backTarget({ index: 4, skipped: ['b', 'c'] }, steps)).toBe(2);
    expect(backTarget({ index: 4 }, steps)).toBe(3);
    expect(backTarget({ index: 0 }, steps)).toBe(0);
  });

  const matches = (pattern: string, url: string) =>
    new RegExp(`^${pattern.replace(/\*/g, '.*')}$`).test(url);

  it('Take me back uses an exact address, else one already visited that matches', () => {
    expect(
      takeBackUrl('https://a.example/home', [], 'https://a.example/x', matches)
    ).toBe('https://a.example/home');
    expect(
      takeBackUrl(
        'https://a.example/class/*',
        ['https://a.example/class/1', 'https://a.example/class/7'],
        'https://a.example/x',
        matches
      )
    ).toBe('https://a.example/class/7');
  });

  it('Take me back is not offered without a known address, or to where the learner is', () => {
    expect(
      takeBackUrl(
        'https://a.example/class/*',
        [],
        'https://a.example/x',
        matches
      )
    ).toBeNull();
    expect(
      takeBackUrl(
        'https://a.example/home',
        [],
        'https://a.example/home/',
        matches
      )
    ).toBeNull();
  });

  it('reduced motion drops the tick and the glide', () => {
    expect(rhythmOf(false)).toEqual({ tickMs: TICK_MS, glideMs: GLIDE_MS });
    expect(rhythmOf(true)).toEqual({ tickMs: 0, glideMs: 0 });
    // About half a second from settle to tip.
    expect(TICK_MS + GLIDE_MS).toBeGreaterThanOrEqual(400);
    expect(TICK_MS + GLIDE_MS).toBeLessThanOrEqual(600);
  });
});
