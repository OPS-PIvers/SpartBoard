import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { canHold, createPressHold, DRAG_PX, MAX_HOLD_MS } from './pressHold';

// As in Chrome, a pointer event is a mouse event; the shared jsdom mock is not.
class ChromePointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}
const sharedMock = window.PointerEvent;
beforeAll(() => {
  window.PointerEvent = ChromePointerEvent as unknown as typeof PointerEvent;
});
afterAll(() => {
  window.PointerEvent = sharedMock;
});

// jsdom can't make trusted events, so the test marks the ones a person made.
const real = new WeakSet<Event>();
const isReal = (e: Event) => real.has(e);

const press = (target: Element, type: string) => {
  const Ctor = type.startsWith('pointer') ? window.PointerEvent : MouseEvent;
  const e = new Ctor(type, {
    bubbles: true,
    cancelable: true,
    clientX: 12,
    clientY: 34,
  });
  real.add(e);
  target.dispatchEvent(e);
  return e;
};

const setup = () => {
  document.body.innerHTML =
    '<input id="field"><a id="link" href="#next">Next</a><div id="plain">Text</div><div data-spart-extension><button id="own">Own</button></div>';
  const link = document.getElementById('link') as HTMLAnchorElement;
  const seen: { type: string; trusted: boolean; x: number }[] = [];
  for (const type of [
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
  ])
    link.addEventListener(type, (e) =>
      seen.push({
        type,
        trusted: real.has(e),
        x: (e as MouseEvent).clientX,
      })
    );
  const hold = createPressHold(window, isReal);
  // Like the recorder, hold starts from a window capture listener on the press.
  let release: () => void = () => undefined;
  const onDown = (e: Event) => {
    if (isReal(e) && !hold.holding()) release = hold.hold(e as MouseEvent);
  };
  addEventListener('pointerdown', onDown, { capture: true });
  cleanups.push(() =>
    removeEventListener('pointerdown', onDown, { capture: true })
  );
  const start = (target: Element) => {
    press(target, 'pointerdown');
    return release;
  };
  cleanups.push(() => hold.dispose());
  return { hold, link, seen, start };
};

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('press hold', () => {
  it('keeps a whole click from the page until released, then replays it in order', () => {
    const { hold, link, seen, start } = setup();
    const release = start(link);
    const mousedown = press(link, 'mousedown');
    press(link, 'pointerup');
    press(link, 'mouseup');
    const click = press(link, 'click');
    expect(seen).toEqual([]);
    expect(mousedown.defaultPrevented).toBe(true);
    expect(click.defaultPrevented).toBe(true);
    release();
    expect(seen.map((s) => s.type)).toEqual([
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'click',
    ]);
    expect(seen.every((s) => !s.trusted && s.x === 12)).toBe(true);
    expect(hold.holding()).toBe(false);
  });

  it('focuses what was pressed when the page lets the press through', () => {
    const { link, start } = setup();
    (document.getElementById('field') as HTMLInputElement).focus();
    const release = start(link);
    press(link, 'mousedown');
    release();
    expect(document.activeElement).toBe(link);
  });

  it('lets a press the user is still holding finish for real', () => {
    const { link, seen, start } = setup();
    const release = start(link);
    press(link, 'mousedown');
    release();
    press(link, 'pointerup');
    press(link, 'click');
    expect(seen.map((s) => [s.type, s.trusted])).toEqual([
      ['pointerdown', false],
      ['mousedown', false],
      ['pointerup', true],
      ['click', true],
    ]);
  });

  it('lets the press go after the time limit even with no picture', () => {
    vi.useFakeTimers();
    const { hold, link, seen, start } = setup();
    const release = start(link);
    vi.advanceTimersByTime(MAX_HOLD_MS);
    expect(seen.map((s) => s.type)).toEqual(['pointerdown']);
    // A later press starts its own hold, which the late release can't end.
    start(link);
    release();
    expect(hold.holding()).toBe(true);
  });

  it('never holds presses on the extension or made by the page', () => {
    const { link, seen, start } = setup();
    const own = document.getElementById('own') as HTMLButtonElement;
    const ownClicks = vi.fn();
    own.addEventListener('click', ownClicks);
    start(link);
    press(own, 'click');
    expect(ownClicks).toHaveBeenCalledOnce();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(seen.map((s) => s.type)).toEqual(['click']);
  });

  it('lets a drag go at once so the page can follow it', () => {
    const { link, seen, start } = setup();
    start(link);
    press(link, 'mousedown');
    const move = new window.PointerEvent('pointermove', {
      bubbles: true,
      clientX: 12 + DRAG_PX,
      clientY: 34,
    });
    real.add(move);
    link.dispatchEvent(move);
    expect(seen.map((s) => s.type)).toEqual(['pointerdown', 'mousedown']);
  });

  it('drops a held press whose target left the page', () => {
    const { link, seen, start } = setup();
    const release = start(link);
    link.remove();
    release();
    expect(seen).toEqual([]);
  });

  it('stops holding once disposed', () => {
    const { hold, link, seen, start } = setup();
    start(link);
    hold.dispose();
    expect(seen.map((s) => s.type)).toEqual(['pointerdown']);
    press(link, 'click');
    expect(seen.map((s) => s.trusted)).toEqual([false, true]);
  });

  it('never holds presses that place a caret or open a native menu', () => {
    setup();
    expect(canHold(document.getElementById('field') as Element)).toBe(false);
    expect(canHold(document.getElementById('plain') as Element)).toBe(true);
    expect(canHold(document.getElementById('link') as Element)).toBe(true);
  });
});
