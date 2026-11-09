import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  installFrameSeeker as installSeeker,
  isFrameCommand,
  type FrameCommand,
  type FrameReport,
} from './frameScript';
import { SETTLE_QUIET_MS } from '@/components/tours/playbackEngine';

// Counts searches, so a test can prove none runs inside a press.
const searches = vi.hoisted(() => ({ n: 0 }));
vi.mock('./locate', async (importOriginal) => {
  const real = await importOriginal<typeof import('./locate')>();
  return {
    ...real,
    assessTarget: (...args: Parameters<typeof real.assessTarget>) => {
      searches.n += 1;
      return real.assessTarget(...args);
    },
  };
});

// eslint-disable-next-line @typescript-eslint/unbound-method -- restored onto the prototype after the suite
const orig = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  return this.isConnected && this.tagName === 'BUTTON'
    ? new DOMRect(10, 10, 50, 20)
    : new DOMRect();
};

const installed: ((cmd: FrameCommand) => void)[] = [];

afterEach(() => {
  for (const run of installed.splice(0)) run({ type: 'wt:stop' });
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.__sbWebTourFrame = undefined;
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = orig;
});

const clues = (name: string) => ({ role: 'button', name });

const ahead = [
  { index: 2, stepId: 'c', clues: clues('Gamma'), action: 'click' as const },
  { index: 3, stepId: 'd', clues: clues('Delta'), action: 'click' as const },
];

const seek: Extract<FrameCommand, { type: 'wt:seek' }> = {
  type: 'wt:seek',
  token: 't1',
  index: 0,
  stepId: 'a',
  clues: clues('Alpha'),
  action: 'click',
  next: {
    token: 't2',
    index: 1,
    stepId: 'b',
    clues: clues('Beta'),
    action: 'click',
  },
  ahead: [
    { index: 1, stepId: 'b', clues: clues('Beta'), action: 'click' },
    ...ahead,
  ],
};

// jsdom can't make trusted events, so the frame's document listener is called directly.
const press = (type: string, el: Element) =>
  Object.create(MouseEvent.prototype, {
    isTrusted: { value: true },
    type: { value: type },
    button: { value: 0 },
    composedPath: {
      value: () => {
        const path: EventTarget[] = [];
        for (let n: Node | null = el; n; n = n.parentNode) path.push(n);
        return path;
      },
    },
  }) as MouseEvent;

/** Installs a seeker and returns the listeners it put on the document and on targets. */
function setUp(cmd = seek) {
  document.body.innerHTML =
    '<button>Alpha</button><button>Beta</button><button>Gamma</button><button>Delta</button>';
  const reports: FrameReport[] = [];
  const onDoc = new Map<string, EventListener>();
  const onTarget = new Map<string, EventListener>();
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called back with its own target below
  const real = EventTarget.prototype.addEventListener;
  vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(
    function (this: EventTarget, type, cb, opts) {
      if (this === document) onDoc.set(type, cb as EventListener);
      else if (this instanceof HTMLButtonElement)
        onTarget.set(type, cb as EventListener);
      else real.call(this, type, cb, opts);
    }
  );
  const run = installSeeker(document, (r) => reports.push(r));
  installed.push(run);
  run(cmd);
  const button = (name: string) =>
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent === name
    )!;
  const pressDoc = (name: string) => {
    for (const type of ['pointerdown', 'mousedown', 'click'])
      onDoc.get(type)?.(press(type, button(name)));
  };
  return { reports, onDoc, onTarget, button, pressDoc };
}

// Watched elements are found when the frame is idle, never inside the press.
const resolved = () => vi.advanceTimersByTimeAsync(400);

const aheadReports = (reports: FrameReport[]) =>
  reports.filter((r) => r.type === 'wt:ahead');

describe('frame seeker catch-up (TOURS_10X.md P2)', () => {
  it('reports an early action on a later step once the page settles', async () => {
    vi.useFakeTimers();
    const { reports, pressDoc } = setUp();
    await resolved();
    pressDoc('Delta');
    expect(aheadReports(reports)).toEqual([]);
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toEqual([
      { type: 'wt:ahead', token: 't1', index: 3, stepId: 'd' },
    ]);
  });

  it('reports only the furthest step of a quick burst', async () => {
    vi.useFakeTimers();
    const { reports, pressDoc } = setUp();
    await resolved();
    pressDoc('Gamma');
    await vi.advanceTimersByTimeAsync(40);
    pressDoc('Delta');
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toEqual([
      { type: 'wt:ahead', token: 't1', index: 3, stepId: 'd' },
    ]);
  });

  it('leaves the current step to its own listener and ignores controls no step watches', async () => {
    vi.useFakeTimers();
    const { reports, pressDoc } = setUp({ ...seek, ahead });
    await resolved();
    document.body.insertAdjacentHTML('beforeend', '<button>Elsewhere</button>');
    pressDoc('Alpha');
    pressDoc('Elsewhere');
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toEqual([]);
  });

  it('counts a press on the next step before the frame has found it', async () => {
    vi.useFakeTimers();
    const { reports, onTarget, pressDoc, button } = setUp();
    await resolved();
    // The learner presses Alpha; the frame moves on to Beta but searches only after the page answers.
    const down = press('pointerdown', button('Alpha'));
    onTarget.get('pointerdown')!(down);
    expect(reports.map((r) => r.type)).toEqual(['wt:found', 'wt:acted']);
    pressDoc('Beta');
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toEqual([
      { type: 'wt:ahead', token: 't2', index: 1, stepId: 'b' },
    ]);
  });

  it('drops a waiting report when the tour stops', async () => {
    vi.useFakeTimers();
    const { reports, pressDoc } = setUp();
    await resolved();
    pressDoc('Delta');
    installed[0]({ ...seek, token: 't9', index: 0 });
    installed[0]({ type: 'wt:stop' });
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toEqual([]);
  });

  it('keeps a waiting report across a new seek it is still ahead of', async () => {
    vi.useFakeTimers();
    const { reports, pressDoc } = setUp();
    await resolved();
    pressDoc('Delta');
    installed[0]({ ...seek, token: 't5', index: 1, stepId: 'b' });
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toEqual([
      { type: 'wt:ahead', token: 't5', index: 3, stepId: 'd' },
    ]);
  });

  it('runs no search inside a press, on or off a watched step', async () => {
    vi.useFakeTimers();
    const { reports, pressDoc } = setUp();
    document.body.insertAdjacentHTML('beforeend', '<button>Elsewhere</button>');
    await resolved();
    const before = searches.n;
    pressDoc('Elsewhere');
    pressDoc('Delta');
    expect(searches.n).toBe(before);
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toHaveLength(1);
  });

  it('never matches a watched element that left the page, and finds its replacement', async () => {
    vi.useFakeTimers();
    const { reports, button, onDoc } = setUp();
    await resolved();
    const old = button('Delta');
    old.remove();
    const fresh = document.createElement('button');
    fresh.textContent = 'Delta';
    document.body.append(fresh);
    const pressEl = (el: Element) => {
      for (const type of ['pointerdown', 'mousedown', 'click'])
        onDoc.get(type)?.(press(type, el));
    };
    // Before the frame has looked again, neither the old node nor the new one counts.
    pressEl(old);
    pressEl(fresh);
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    pressEl(fresh);
    await vi.advanceTimersByTimeAsync(SETTLE_QUIET_MS + 20);
    expect(aheadReports(reports)).toEqual([
      { type: 'wt:ahead', token: 't1', index: 3, stepId: 'd' },
    ]);
  });

  it('looks for a watched step that is not on the page less and less often while the page keeps changing', async () => {
    vi.useFakeTimers();
    const { button } = setUp({
      ...seek,
      ahead: [
        { index: 2, stepId: 'c', clues: clues('Missing'), action: 'click' },
      ],
    });
    await resolved();
    const before = searches.n;
    const clock = button('Gamma');
    for (let i = 0; i < 100; i++) {
      clock.setAttribute('data-tick', String(i));
      await vi.advanceTimersByTimeAsync(30);
    }
    // Three seconds of a ticking page: a handful of retries, not one per tick.
    expect(searches.n - before).toBeLessThanOrEqual(5);
    expect(searches.n - before).toBeGreaterThan(0);
  });

  it('validates the watched steps in a seek', () => {
    expect(isFrameCommand(seek)).toBe(true);
    expect(isFrameCommand({ ...seek, ahead: [{ index: 'x' }] })).toBe(false);
    expect(isFrameCommand({ ...seek, ahead: 'x' })).toBe(false);
    expect(isFrameCommand({ ...seek, index: 'x' })).toBe(false);
  });
});
