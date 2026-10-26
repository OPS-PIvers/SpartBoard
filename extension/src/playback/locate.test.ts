import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { accessibleName, locate, roleOf } from './locate';

const rects = new WeakMap<Element, DOMRect>();
const place = (el: Element | null, x: number, y: number, w = 40, h = 20) => {
  if (el) rects.set(el, new DOMRect(x, y, w, h));
};

// eslint-disable-next-line @typescript-eslint/unbound-method -- restored onto the prototype after the suite
const orig = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function (this: Element) {
  return rects.get(this) ?? new DOMRect(0, 0, 0, 0);
};

afterEach(() => {
  document.body.innerHTML = '';
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = orig;
});

const html = (markup: string) => {
  document.body.innerHTML = markup;
};

describe('roleOf and accessibleName', () => {
  it('reads implicit roles and label sources', () => {
    html(`<button id="b">  Save  </button><a id="a" href="#">Go</a>
      <label for="i">First name</label><input id="i" type="text">
      <span id="s" role="tab" aria-label="Grades"></span>`);
    expect(roleOf(document.getElementById('b')!)).toBe('button');
    expect(accessibleName(document.getElementById('b')!)).toBe('save');
    expect(roleOf(document.getElementById('a')!)).toBe('link');
    expect(accessibleName(document.getElementById('i')!)).toBe('first name');
    expect(roleOf(document.getElementById('s')!)).toBe('tab');
    expect(accessibleName(document.getElementById('s')!)).toBe('grades');
  });
});

describe('locate', () => {
  it('prefers role and name over text and CSS', () => {
    html(`<div class="x">Add</div><button id="b">Add</button>`);
    place(document.querySelector('.x'), 0, 0);
    place(document.getElementById('b'), 100, 0);
    const hit = locate(document, {
      role: 'button',
      name: 'Add',
      text: 'Add',
      css: '.x',
    });
    expect(hit?.el.id).toBe('b');
    expect(hit?.weak).toBe(false);
  });

  it('falls back to the innermost text match, then the CSS path', () => {
    html(
      `<div id="w"><span id="t">Materials</span></div><i id="c" class="icon"></i>`
    );
    place(document.getElementById('w'), 0, 0);
    place(document.getElementById('t'), 0, 0);
    place(document.getElementById('c'), 0, 50);
    expect(
      locate(document, { role: 'button', name: 'Materials', text: 'Materials' })
        ?.el.id
    ).toBe('t');
    const css = locate(document, {
      role: 'button',
      name: 'Nope',
      text: 'Nope',
      css: 'i.icon',
    });
    expect(css?.el.id).toBe('c');
    expect(css?.weak).toBe(false);
  });

  it('skips hidden matches', () => {
    html(`<button id="h">Post</button><button id="v">Post</button>`);
    place(document.getElementById('v'), 10, 10);
    expect(locate(document, { role: 'button', name: 'Post' })?.el.id).toBe('v');
  });

  it('lets the recorded box separate same-named controls', () => {
    html(`<button id="l">Edit</button><button id="r">Edit</button>`);
    place(document.getElementById('l'), 0, 0);
    place(document.getElementById('r'), 900, 0);
    const hit = locate(document, {
      role: 'button',
      name: 'Edit',
      box: { x: 0.88, y: 0, w: 0.04, h: 0.02 },
    });
    expect(hit?.el.id).toBe('r');
    expect(hit?.weak).toBe(false);
  });

  it('never matches by the box alone', () => {
    html(`<button id="l">Edit</button><button id="r">Edit</button>`);
    place(document.getElementById('l'), 0, 0);
    place(document.getElementById('r'), 900, 0);
    expect(
      locate(document, { box: { x: 0, y: 0, w: 0.04, h: 0.02 } })
    ).toBeNull();
    expect(locate(document, { role: 'button', name: 'Edit' })).toBeNull();
  });

  it('finds targets inside open shadow roots', () => {
    html(`<div id="host"></div>`);
    const root = document
      .getElementById('host')!
      .attachShadow({ mode: 'open' });
    root.innerHTML = `<button id="in">Submit</button>`;
    place(root.getElementById('in'), 5, 5);
    expect(locate(document, { role: 'button', name: 'Submit' })?.el.id).toBe(
      'in'
    );
  });

  it('finds text targets inside open shadow roots', () => {
    html(`<div id="host"></div>`);
    const root = document
      .getElementById('host')!
      .attachShadow({ mode: 'open' });
    root.innerHTML = `<span id="in">Grades</span>`;
    place(root.getElementById('in'), 5, 5);
    expect(locate(document, { text: 'Grades' })?.el.id).toBe('in');
  });

  it('names shadow-root fields by labels in the same shadow root', () => {
    html(`<div id="host"></div>`);
    const root = document
      .getElementById('host')!
      .attachShadow({ mode: 'open' });
    root.innerHTML = `<label for="c">Comment</label><input id="c">
      <span id="n">Notes</span><textarea id="t" aria-labelledby="n"></textarea>`;
    place(root.getElementById('c'), 5, 5);
    place(root.getElementById('t'), 5, 40);
    expect(locate(document, { role: 'textbox', name: 'Comment' })?.el.id).toBe(
      'c'
    );
    expect(locate(document, { role: 'textbox', name: 'Notes' })?.el.id).toBe(
      't'
    );
  });

  it('ignores an invalid CSS path', () => {
    html(`<button>x</button>`);
    expect(locate(document, { css: '##bad' })).toBeNull();
  });
});

describe('see-through controls', () => {
  // jsdom has no checkVisibility; these elements act as if styled with opacity: 0.
  const transparent = (el: Element) => {
    el.checkVisibility = (opts?: CheckVisibilityOptions) => !opts?.checkOpacity;
  };

  it('finds a native checkbox a site hides with opacity under its own label', () => {
    html(
      '<input type="checkbox" role="button" id="tools" aria-label="Tools"><label for="tools">Tools</label>'
    );
    const box = document.getElementById('tools')!;
    place(box, 10, 10, 60, 30);
    transparent(box);
    expect(locate(document, { role: 'button', name: 'Tools' })?.el).toBe(box);
  });

  it('still skips any other element that is fully transparent, like a menu fading in', () => {
    html('<button>Assignment</button>');
    const item = document.querySelector('button')!;
    place(item, 10, 10);
    transparent(item);
    expect(locate(document, { role: 'button', name: 'Assignment' })).toBeNull();
  });
});
