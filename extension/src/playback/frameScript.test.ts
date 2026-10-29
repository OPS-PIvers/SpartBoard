import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  installFrameSeeker as installSeeker,
  isFrameCommand,
  type FrameReport,
} from './frameScript';

// eslint-disable-next-line @typescript-eslint/unbound-method -- restored onto the prototype after the suite
const orig = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  return this.isConnected && this.tagName === 'BUTTON'
    ? new DOMRect(10, 10, 50, 20)
    : new DOMRect();
};

// Stopped after each test so no observer or timer outlives the environment.
const installed: ReturnType<typeof installSeeker>[] = [];
const installFrameSeeker: typeof installSeeker = (...args) => {
  const run = installSeeker(...args);
  installed.push(run);
  return run;
};

afterEach(() => {
  for (const run of installed.splice(0)) run({ type: 'wt:stop' });
  document.body.innerHTML = '';
  vi.useRealTimers();
  globalThis.__sbWebTourFrame = undefined;
});

const seek = {
  type: 'wt:seek' as const,
  token: 't1',
  clues: { role: 'button', name: 'Load more' },
  action: 'click' as const,
};

afterAll(() => {
  Element.prototype.getBoundingClientRect = orig;
});

describe('frame seeker', () => {
  it('finds a control that appears later and shares it with the overlay', async () => {
    vi.useFakeTimers();
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    expect(reports).toEqual([]);
    document.body.innerHTML = '<button>Load more</button>';
    await vi.advanceTimersByTimeAsync(300);
    expect(reports[0]).toMatchObject({
      type: 'wt:found',
      token: 't1',
      weak: false,
    });
    expect(globalThis.__sbWebTourFrame?.target?.el.tagName).toBe('BUTTON');
  });

  it('reports a lost target and ignores clicks the page script fakes', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button>Load more</button>';
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    document.querySelector('button')!.click();
    expect(reports.some((r) => r.type === 'wt:acted')).toBe(false);
    document.body.innerHTML = '';
    await vi.advanceTimersByTimeAsync(300);
    expect(reports.at(-1)).toEqual({ type: 'wt:lost', token: 't1' });
  });

  // jsdom can't make trusted events, so the target's handlers are called directly.
  const trusted = (type: string, button = 0) =>
    Object.create(MouseEvent.prototype, {
      isTrusted: { value: true },
      type: { value: type },
      button: { value: button },
    }) as MouseEvent;
  const handlersFor = (run: (cmd: typeof seek) => void) => {
    const handlers = new Map<string, EventListener>();
    const spy = vi
      .spyOn(EventTarget.prototype, 'addEventListener')
      .mockImplementation((type, cb) => {
        handlers.set(type, cb as EventListener);
      });
    run(seek);
    spy.mockRestore();
    return handlers;
  };

  it('advances a click step on mousedown, for menus that open before the click', () => {
    document.body.innerHTML = '<button>Load more</button>';
    const reports: FrameReport[] = [];
    const handlers = handlersFor(
      installFrameSeeker(document, (r) => reports.push(r))
    );
    expect([...handlers.keys()]).toEqual(['pointerdown', 'mousedown', 'click']);
    handlers.get('mousedown')!(trusted('mousedown'));
    expect(reports.filter((r) => r.type === 'wt:acted')).toHaveLength(1);
  });

  it('reports one press once, a later press again, and ignores other buttons', () => {
    document.body.innerHTML = '<button>Load more</button>';
    const reports: FrameReport[] = [];
    const handlers = handlersFor(
      installFrameSeeker(document, (r) => reports.push(r))
    );
    handlers.get('mousedown')!(trusted('mousedown', 2));
    expect(reports.some((r) => r.type === 'wt:acted')).toBe(false);
    for (const type of ['pointerdown', 'mousedown', 'click'])
      handlers.get(type)!(trusted(type));
    expect(reports.filter((r) => r.type === 'wt:acted')).toHaveLength(1);
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValue(performance.now() + 2000);
    handlers.get('click')!(trusted('click'));
    now.mockRestore();
    expect(reports.filter((r) => r.type === 'wt:acted')).toHaveLength(2);
  });

  // Searches after a page change run before the next frame paints.
  const FRAME = 17;

  it('searches again as soon as the page changes, not on a fixed delay', async () => {
    vi.useFakeTimers();
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    document.body.innerHTML = '<button>Load more</button>';
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(reports[0]).toMatchObject({ type: 'wt:found', token: 't1' });
  });

  it('finds a control that a component renders inside its shadow root later', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="host"></div>';
    const shadow = document
      .getElementById('host')!
      .attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p>Loading</p>';
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    shadow.innerHTML = '<button>Load more</button>';
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(reports[0]).toMatchObject({ type: 'wt:found', token: 't1' });
  });

  it('watches shadow roots added after the search began', async () => {
    vi.useFakeTimers();
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(reports).toEqual([]);
    shadow.innerHTML = '<button>Load more</button>';
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(reports[0]).toMatchObject({ type: 'wt:found', token: 't1' });
  });

  it('moves straight on to the next step when the learner acts, and keeps it when the worker confirms', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<button>Load more</button><button>Show all</button>';
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    const next = {
      token: 't2',
      clues: { role: 'button', name: 'Show all' },
      action: 'click' as const,
    };
    const handlers = new Map<string, EventListener>();
    const spy = vi
      .spyOn(EventTarget.prototype, 'addEventListener')
      .mockImplementation((type, cb) => {
        handlers.set(type, cb as EventListener);
      });
    run({ ...seek, next });
    spy.mockRestore();
    handlers.get('pointerdown')!(trusted('pointerdown'));
    // Nothing is searched inside the learner's own event.
    expect(reports.map((r) => r.type)).toEqual(['wt:found', 'wt:acted']);
    await vi.advanceTimersByTimeAsync(FRAME);
    expect(reports.map((r) => r.type)).toEqual([
      'wt:found',
      'wt:acted',
      'wt:found',
    ]);
    expect(reports[2]).toMatchObject({ token: 't2' });
    expect(globalThis.__sbWebTourFrame?.target?.el.textContent).toBe(
      'Show all'
    );
    run({ type: 'wt:seek', ...next });
    expect(reports).toHaveLength(3);
    expect(globalThis.__sbWebTourFrame?.target?.token).toBe('t2');
  });

  it('stops watching on stop', async () => {
    vi.useFakeTimers();
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    run({ type: 'wt:stop' });
    document.body.innerHTML = '<button>Load more</button>';
    await vi.advanceTimersByTimeAsync(300);
    expect(reports).toEqual([]);
  });

  it('reports the closest candidate when nothing matches, scrubbed, once per change (C14)', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<button aria-label="Load more for kid@school.org">Load more</button>';
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run({
      ...seek,
      clues: {
        role: 'link',
        name: 'Open the course page',
        text: 'Load more',
        css: '#gone',
        heading: 'Course',
        attrs: { testId: 'zz', ariaLabel: 'zz', name: 'zz', href: '/zz' },
        box: { x: 0.9, y: 0.9, w: 0.05, h: 0.05 },
      },
    });
    expect(reports.some((r) => r.type === 'wt:found')).toBe(false);
    const candidate = reports.find((r) => r.type === 'wt:candidate');
    expect(candidate).toMatchObject({
      type: 'wt:candidate',
      token: 't1',
      fix: { role: 'button', text: 'Load more', css: 'body > button' },
    });
    expect(JSON.stringify(candidate)).not.toContain('kid@school.org');
    document.body.setAttribute('data-x', '1');
    await vi.advanceTimersByTimeAsync(300);
    expect(reports.filter((r) => r.type === 'wt:candidate')).toHaveLength(1);
  });

  it('sends no fix with a clear match', () => {
    document.body.innerHTML = '<button>Load more</button>';
    const reports: FrameReport[] = [];
    installFrameSeeker(document, (r) => reports.push(r))(seek);
    const found = reports.find((r) => r.type === 'wt:found');
    expect(found).toMatchObject({ weak: false });
    expect(found).not.toHaveProperty('fix');
    expect(reports.some((r) => r.type === 'wt:candidate')).toBe(false);
  });

  it('validates commands', () => {
    expect(isFrameCommand(seek)).toBe(true);
    expect(isFrameCommand({ ...seek, action: 'submit' })).toBe(false);
    expect(isFrameCommand({ type: 'wt:seek', token: 1 })).toBe(false);
    expect(isFrameCommand({ ...seek, next: { ...seek, token: 't2' } })).toBe(
      true
    );
    expect(isFrameCommand({ ...seek, next: { token: 't2' } })).toBe(false);
    expect(isFrameCommand(null)).toBe(false);
  });
});
