import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  installFrameSeeker,
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

afterEach(() => {
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
      clue: 'role',
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

  it('validates commands', () => {
    expect(isFrameCommand(seek)).toBe(true);
    expect(isFrameCommand({ ...seek, action: 'submit' })).toBe(false);
    expect(isFrameCommand({ type: 'wt:seek', token: 1 })).toBe(false);
    expect(isFrameCommand(null)).toBe(false);
  });
});
