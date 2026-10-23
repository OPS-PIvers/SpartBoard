import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLUR_DEFAULTS, type BlurSettings } from './blurSettings';
import {
  applyPageBlur,
  BLUR_ATTR,
  markPicks,
  PICK_ATTR,
  uniqueSelector,
} from './pageBlur';
import { createShooter } from './shooter';

const OFF: BlurSettings = {
  emails: false,
  ids: false,
  lastFirst: false,
  fields: false,
  tableRows: false,
  images: false,
};

const blurred = () =>
  Array.from(document.querySelectorAll(`[${BLUR_ATTR}]`)).filter(
    (el) => el.tagName !== 'STYLE'
  );
const styleCount = () =>
  document.querySelectorAll('style[data-spart-blur-style]').length;

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('applyPageBlur', () => {
  it('blurs the element holding a matched email and removes every trace after', () => {
    document.body.innerHTML =
      '<p id="a">Contact jane@school.org</p><p id="b">Plain text here</p>';
    const before = document.body.innerHTML;
    const undo = applyPageBlur(document, BLUR_DEFAULTS);
    expect(blurred().map((el) => el.id)).toEqual(['a']);
    expect(styleCount()).toBe(1);
    expect(document.head.querySelector('style')?.textContent).toContain(
      'filter:blur'
    );
    undo();
    expect(blurred()).toEqual([]);
    expect(styleCount()).toBe(0);
    expect(document.body.innerHTML).toBe(before);
  });

  it('blurs Last, First names and ids, but not ordinary phrases', () => {
    document.body.innerHTML =
      '<div id="name">Smith, Jane</div><span id="id">4501234</span><h2 id="h">Hello, World</h2>';
    applyPageBlur(document, BLUR_DEFAULTS);
    expect(blurred().map((el) => el.id)).toEqual(['name', 'id']);
  });

  it('follows each category switch', () => {
    document.body.innerHTML = '<p id="e">jane@school.org</p>';
    applyPageBlur(document, { ...OFF, ids: true });
    expect(blurred()).toEqual([]);
    applyPageBlur(document, { ...OFF, emails: true });
    expect(blurred().map((el) => el.id)).toEqual(['e']);
  });

  it('wraps a match whose parent holds much more, then puts the original text node back', () => {
    document.body.innerHTML =
      '<div id="box"><b>1</b><b>2</b><b>3</b><b>4</b>Email jane@school.org now</div>';
    const box = document.getElementById('box')!;
    const text = box.lastChild!;
    const undo = applyPageBlur(document, BLUR_DEFAULTS);
    expect(box.hasAttribute(BLUR_ATTR)).toBe(false);
    expect(blurred().map((el) => el.textContent)).toEqual(['jane@school.org']);
    undo();
    expect(box.lastChild).toBe(text);
    expect(box.textContent).toBe('1234Email jane@school.org now');
    expect(blurred()).toEqual([]);
  });

  it('blurs typed field values, and fields holding a match when typed fields are off', () => {
    document.body.innerHTML = `
      <input id="typed" value="my answer">
      <input id="empty" value="">
      <input id="mail" value="jane@school.org">
      <input id="btn" type="submit" value="Save">
      <textarea id="area">notes</textarea>`;
    applyPageBlur(document, BLUR_DEFAULTS);
    expect(
      blurred()
        .map((el) => el.id)
        .sort()
    ).toEqual(['area', 'mail', 'typed']);
    document
      .querySelectorAll(`[${BLUR_ATTR}]`)
      .forEach((el) => el.removeAttribute(BLUR_ATTR));
    applyPageBlur(document, { ...BLUR_DEFAULTS, fields: false });
    expect(blurred().map((el) => el.id)).toEqual(['mail']);
  });

  it('blurs table body rows only when switched on, never header rows', () => {
    document.body.innerHTML = `<table>
      <thead><tr id="head"><th>Name</th></tr></thead>
      <tbody><tr id="r1"><td>Ada</td></tr><tr id="r2"><td>Bo</td></tr></tbody>
    </table>`;
    applyPageBlur(document, BLUR_DEFAULTS);
    expect(blurred()).toEqual([]);
    applyPageBlur(document, { ...OFF, tableRows: true });
    expect(blurred().map((el) => el.id)).toEqual(['r1', 'r2']);
  });

  it('blurs rows with a row header, skipping only rows of column headers', () => {
    document.body.innerHTML = `<table>
      <tr id="cols"><th>Name</th><th>Score</th></tr>
      <tr id="th-row"><th scope="row">Smith, John</th><td>92</td></tr>
    </table>
    <div role="grid">
      <div role="row" id="grid-head"><span role="columnheader">Name</span></div>
      <div role="row" id="grid-row"><span role="rowheader">Ada</span><span role="gridcell">90</span></div>
    </div>`;
    applyPageBlur(document, { ...OFF, tableRows: true });
    expect(blurred().map((el) => el.id)).toEqual(['th-row', 'grid-row']);
  });

  it('blurs images only when switched on, skipping icons', () => {
    document.body.innerHTML =
      '<img id="photo" src="a.png"><img id="icon" src="b.png">';
    const size = (el: Element, w: number) =>
      vi
        .spyOn(el, 'getBoundingClientRect')
        .mockReturnValue({ width: w, height: w } as DOMRect);
    size(document.getElementById('photo')!, 200);
    size(document.getElementById('icon')!, 16);
    applyPageBlur(document, BLUR_DEFAULTS);
    expect(blurred()).toEqual([]);
    applyPageBlur(document, { ...OFF, images: true });
    expect(blurred().map((el) => el.id)).toEqual(['photo']);
  });

  it('blurs inside open shadow roots with a style of their own', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const shadow = document
      .getElementById('host')!
      .attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span id="in">jane@school.org</span>';
    const undo = applyPageBlur(document, BLUR_DEFAULTS);
    expect(shadow.getElementById('in')!.hasAttribute(BLUR_ATTR)).toBe(true);
    expect(shadow.querySelector('style[data-spart-blur-style]')).not.toBeNull();
    undo();
    expect(shadow.getElementById('in')!.hasAttribute(BLUR_ATTR)).toBe(false);
    expect(shadow.querySelector('style')).toBeNull();
  });

  it('never touches the extension’s own elements', () => {
    document.body.innerHTML =
      '<div data-spart-extension><p>jane@school.org</p></div>';
    applyPageBlur(document, BLUR_DEFAULTS);
    expect(blurred()).toEqual([]);
  });

  it('keeps picked elements blurred after the picture, and ignores bad selectors', () => {
    document.body.innerHTML = '<div id="secret">Plain</div>';
    const undo = applyPageBlur(document, OFF, ['#secret', '::nope(']);
    expect(document.getElementById('secret')!.hasAttribute(PICK_ATTR)).toBe(
      true
    );
    undo();
    expect(document.getElementById('secret')!.hasAttribute(PICK_ATTR)).toBe(
      true
    );
  });
});

describe('Click to blur selectors', () => {
  it('saves a selector that matches only the picked element', () => {
    document.body.innerHTML = `
      <table><tbody><tr><td><a>Ada</a></td></tr></tbody></table>
      <table><tbody><tr><td><a id="x">Bo</a></td></tr><tr><td><a>Cy</a></td></tr></tbody></table>`;
    const picked = document.querySelectorAll('a')[2];
    const sel = uniqueSelector(picked);
    expect(Array.from(document.querySelectorAll(sel))).toEqual([picked]);
    expect(uniqueSelector(document.getElementById('x')!)).toBe('#x');
  });

  it('blurs every element a vague saved selector matches', () => {
    document.body.innerHTML = '<p class="n">Ada</p><p class="n">Bo</p>';
    markPicks(document, ['p.n']);
    expect(document.querySelectorAll(`[${PICK_ATTR}]`)).toHaveLength(2);
  });
});

describe('createShooter', () => {
  it('covers frames that could not blur themselves, and lifts that after the picture', async () => {
    document.body.innerHTML = '<iframe id="f"></iframe>';
    const shooter = createShooter(document, () => Promise.resolve());
    await shooter.shoot(OFF, []);
    const frame = document.getElementById('f')!;
    await shooter.cover([frame]);
    expect(frame.hasAttribute(BLUR_ATTR)).toBe(true);
    expect(styleCount()).toBe(1);
    await shooter.done();
    expect(frame.hasAttribute(BLUR_ATTR)).toBe(false);
    expect(styleCount()).toBe(0);
  });

  it('blurs, hides the pill and waits for paint before resolving, then restores', async () => {
    document.body.innerHTML = '<p id="a">jane@school.org</p>';
    const pill: boolean[] = [];
    const shooter = createShooter(document, (shown) => {
      pill.push(shown);
      return Promise.resolve();
    });
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    await shooter.shoot(BLUR_DEFAULTS, []);
    expect(raf).toHaveBeenCalledTimes(2);
    expect(blurred().map((el) => el.id)).toEqual(['a']);
    expect(pill).toEqual([false]);
    await shooter.done();
    expect(blurred()).toEqual([]);
    expect(pill).toEqual([false, true]);
  });

  it('lifts an earlier blur before applying the next', async () => {
    document.body.innerHTML = '<p id="a">jane@school.org</p>';
    const shooter = createShooter(document, () => Promise.resolve());
    await shooter.shoot(BLUR_DEFAULTS, []);
    document.body.insertAdjacentHTML('beforeend', '<p id="b">Plain</p>');
    await shooter.shoot({ ...BLUR_DEFAULTS, emails: false }, []);
    expect(blurred()).toEqual([]);
  });

  it('picks and unpicks with Click to blur, hiding the hover outline from the picture', async () => {
    document.body.innerHTML = '<div id="x">Plain</div>';
    const shooter = createShooter(document, () => Promise.resolve());
    shooter.setPicking(true, []);
    const el = document.getElementById('x')!;
    el.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(el.hasAttribute('data-spart-blur-hover')).toBe(true);
    expect(shooter.togglePick(el)).toBe(true);
    await shooter.shoot(OFF, []);
    expect(el.hasAttribute('data-spart-blur-hover')).toBe(false);
    await shooter.done();
    expect(el.hasAttribute('data-spart-blur-hover')).toBe(true);
    expect(shooter.togglePick(el)).toBe(false);
    shooter.dispose();
    expect(el.hasAttribute('data-spart-blur-hover')).toBe(false);
    expect(shooter.picking()).toBe(false);
  });
});
