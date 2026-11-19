import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isBlankField,
  isTypingField,
  openPopupBoxes,
  shieldTourUi,
  untaggedControlOf,
  withLabel,
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

describe('shieldTourUi and text boxes', () => {
  const press = (id: string) => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    byId(id).dispatchEvent(e);
    return e.defaultPrevented;
  };

  it('keeps focus in an empty app text box when Next is pressed, so the box stays open', () => {
    document.body.innerHTML =
      '<input id="name" /><div data-tour-ignore><button id="next">Next</button><input id="note" /></div><button id="board">x</button>';
    const unshield = shieldTourUi();
    byId('name').focus();
    expect(press('next')).toBe(true);
    // A press on the page, or on a field in the tour UI, still moves focus.
    expect(press('board')).toBe(false);
    expect(press('note')).toBe(false);
    unshield();
    expect(press('next')).toBe(false);
  });

  it('lets a filled box lose focus as usual, so it saves what was typed', () => {
    document.body.innerHTML =
      '<input id="name" value="Unit 1" /><div data-tour-ignore><button id="next">Next</button></div>';
    const unshield = shieldTourUi();
    byId('name').focus();
    expect(press('next')).toBe(false);
    unshield();
  });

  it('ignores checkboxes and other controls that are pressed, not typed into', () => {
    document.body.innerHTML =
      '<input id="box" type="checkbox" /><div data-tour-ignore><button id="next">Next</button></div>';
    const unshield = shieldTourUi();
    byId('box').focus();
    expect(press('next')).toBe(false);
    unshield();
  });
});

describe('isTypingField and isBlankField', () => {
  it('counts text inputs, textareas and editable text, not buttons, checkboxes or selects', () => {
    document.body.innerHTML =
      '<input id="t" /><input id="n" type="number" /><textarea id="a"></textarea><input id="c" type="checkbox" /><input id="r" type="range" /><select id="s"></select><button id="b">B</button><div id="w"><span>Name</span><input id="inner" type="search" /></div>';
    for (const id of ['t', 'n', 'a'])
      expect(isTypingField(byId(id))).toBe(true);
    for (const id of ['c', 'r', 's', 'b'])
      expect(isTypingField(byId(id))).toBe(false);
    expect(isTypingField(null)).toBe(false);
    expect(isBlankField(byId('t'))).toBe(true);
    (byId('t') as HTMLInputElement).value = 'Unit 1';
    expect(isBlankField(byId('t'))).toBe(false);
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

describe('openPopupBoxes with the step control', () => {
  it('leaves out an open accordion section that holds the control, but keeps a menu it sits in', () => {
    document.body.innerHTML =
      '<button aria-expanded="true" aria-controls="sec"></button><div id="sec"><span id="ctl"></span></div><div role="menu" id="m"><span id="item"></span></div>';
    box(byId('sec'), 300, 200);
    box(byId('m'), 100, 50);
    expect(openPopupBoxes(byId('ctl'))).toEqual([
      { x: 10, y: 10, w: 100, h: 50 },
    ]);
    expect(openPopupBoxes(byId('item'))).toHaveLength(2);
    // For the spotlight, the menu the control sits in is left out too.
    expect(openPopupBoxes(byId('item'), true)).toEqual([
      { x: 10, y: 10, w: 300, h: 200 },
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

describe('withLabel', () => {
  it('grows a checkbox to its label and leaves a bare control alone', () => {
    document.body.innerHTML =
      '<label id="row"><input id="check" type="checkbox" />Ada</label><button id="solo"></button>';
    box(byId('row'), 200, 28);
    const target = { x: 16, y: 16, w: 16, h: 16 };
    expect(withLabel(target, byId('check'))).toEqual({
      x: 10,
      y: 10,
      w: 200,
      h: 28,
    });
    expect(withLabel(target, byId('solo'))).toBe(target);
  });
});
