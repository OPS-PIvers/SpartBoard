import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openPopupBoxes,
  shieldTourUi,
  untaggedControlOf,
  withNearbyPopups,
} from './popups';

const box = (el: Element, w: number, h: number) =>
  vi
    .spyOn(el, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(10, 10, w, h));

const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('shieldTourUi', () => {
  it('keeps clicks on tour UI from the page outside-click handlers, but not other clicks', () => {
    document.body.innerHTML =
      '<div data-tour-ignore><button id="pick">Pick</button></div><button id="board">x</button>';
    const outside = vi.fn();
    document.addEventListener('pointerdown', outside);
    const unshield = shieldTourUi();
    document
      .getElementById('pick')
      ?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(outside).not.toHaveBeenCalled();
    document
      .getElementById('board')
      ?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(outside).toHaveBeenCalledTimes(1);
    unshield();
    document
      .getElementById('pick')
      ?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(outside).toHaveBeenCalledTimes(2);
    document.removeEventListener('pointerdown', outside);
  });
});

describe('untaggedControlOf', () => {
  it('ignores a control outside the tagged element and nameless controls', () => {
    document.body.innerHTML =
      '<div data-tour="widget.window" id="w"><button id="a"><svg></svg></button></div><button id="b">B</button>';
    const w = document.getElementById('w');
    expect(untaggedControlOf(byId('a'), w)).toBeNull();
    expect(untaggedControlOf(byId('b'), w)).toBeNull();
  });
});

describe('openPopupBoxes', () => {
  it('lists open menus and controlled popovers, not tour UI or full-screen panels', () => {
    document.body.innerHTML =
      '<div role="menu" id="m"></div><button aria-expanded="true" aria-controls="p"></button><div id="p"></div><div data-tour-ignore><div role="dialog" id="t"></div></div><div role="dialog" id="big"></div><div role="dialog" aria-modal="true" id="modal"></div>';
    box(byId('m'), 100, 50);
    box(byId('p'), 80, 40);
    box(byId('t'), 80, 40);
    box(byId('big'), 4000, 4000);
    box(byId('modal'), 80, 40);
    expect(openPopupBoxes()).toEqual([
      { x: 10, y: 10, w: 100, h: 50 },
      { x: 10, y: 10, w: 80, h: 40 },
    ]);
  });
});

describe('withNearbyPopups', () => {
  it('grows the target over a menu next to it and ignores one far away', () => {
    const target = { x: 20, y: 840, w: 40, h: 30 };
    expect(
      withNearbyPopups(target, [
        { x: 16, y: 640, w: 256, h: 190 },
        { x: 900, y: 100, w: 100, h: 100 },
      ])
    ).toEqual({ x: 16, y: 640, w: 256, h: 230 });
  });
});
