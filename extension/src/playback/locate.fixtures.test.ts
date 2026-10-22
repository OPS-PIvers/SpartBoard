import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  accessibleName,
  byCss,
  byText,
  INTERACTIVE,
  isShown,
  locate,
  roleOf,
  rootsOf,
  type WebLocatorClues,
} from './locate';
import { captureTarget } from '../recorder/captureTarget';

// Fixtures shaped like the markup of real sites tours were recorded on (plan Risks: old tours' picks).

const rects = new WeakMap<Element, DOMRect>();
const place = (el: Element | null, x: number, y: number, w = 80, h = 24) => {
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

const $ = (sel: string) => document.querySelector(sel)!;
const $$ = (sel: string) => [...document.querySelectorAll(sel)];

/** What the recorder stores for a click on this element, box included. */
function record(el: Element): WebLocatorClues {
  const { locator } = captureTarget(el);
  const r = el.closest('[role],a,button')!.getBoundingClientRect();
  return {
    ...locator,
    box: {
      x: r.x / innerWidth,
      y: r.y / innerHeight,
      w: r.width / innerWidth,
      h: r.height / innerHeight,
    },
  };
}

/** A locator from before C3, without the newer clues. */
const old = (l: WebLocatorClues): WebLocatorClues => {
  const { heading: _h, pageTitle: _t, attrs: _a, ...rest } = l;
  return rest;
};

/** The chain `locate` replaced: role and name, then text, then CSS; the box only breaks a tie. */
function legacyLocate(doc: Document, c: WebLocatorClues): Element | null {
  const roots = rootsOf(doc);
  const pick = (found: Element[]) => {
    const shown = [...new Set(found)].filter(isShown);
    if (shown.length <= 1) return shown[0] ?? null;
    const box = c.box;
    if (!box) return null;
    const d = (el: Element) => {
      const r = el.getBoundingClientRect();
      const dx = (r.left + r.width / 2) / innerWidth - (box.x + box.w / 2);
      const dy = (r.top + r.height / 2) / innerHeight - (box.y + box.h / 2);
      return dx * dx + dy * dy;
    };
    return shown.sort((a, b) => d(a) - d(b))[0];
  };
  const layers: (() => Element[])[] = [];
  if (c.role && c.name) {
    const want = c.name.replace(/\s+/g, ' ').trim().toLowerCase();
    const { role } = c;
    layers.push(() =>
      roots
        .flatMap((r) => [...r.querySelectorAll(INTERACTIVE)])
        .filter((el) => roleOf(el) === role && accessibleName(el) === want)
    );
  }
  if (c.text) {
    const { text } = c;
    layers.push(() => byText(doc, roots, text));
  }
  if (c.css) {
    const { css } = c;
    layers.push(() => byCss(roots, css));
  }
  for (const find of layers) {
    const hit = pick(find());
    if (hit) return hit;
  }
  return null;
}

const schoology = () => {
  document.body.innerHTML = `
    <div id="center-top"><h2 class="page-title">Biology: Period 3</h2></div>
    <ul id="course-nav">
      <li class="course-nav-updates"><a href="/course/7712345678/updates">Updates</a></li>
      <li class="course-nav-materials"><a href="/course/7712345678/materials">Materials</a></li>
      <li class="course-nav-gradebook"><a href="/course/7712345678/gradebook">Gradebook</a></li>
    </ul>
    <div id="toolbar"><div class="action-links-unfold" role="button" tabindex="0"><span class="action-links-unfold-text">Add Materials</span></div></div>
    <table id="folder-contents-table"><tbody>
      <tr id="f-2203391"><td><h3><a href="/course/7712345678/materials?f=2203391">Unit 1: Cells</a></h3></td>
        <td><div class="action-links-unfold" role="button" tabindex="0" aria-label="Edit"></div></td></tr>
      <tr id="f-2203392"><td><h3><a href="/course/7712345678/materials?f=2203392">Unit 2: Genetics</a></h3></td>
        <td><div class="action-links-unfold" role="button" tabindex="0" aria-label="Edit"></div></td></tr>
    </tbody></table>`;
  $$('#course-nav a').forEach((a, i) => place(a, 10, 120 + i * 30, 120));
  place($('#toolbar [role=button]'), 700, 120, 140);
  place($('#toolbar span'), 710, 124, 120);
  $$('tbody tr').forEach((tr, i) => {
    place(tr.querySelector('h3 a'), 200, 200 + i * 40, 200);
    place(tr.querySelector('[role=button]'), 900, 200 + i * 40, 24);
  });
};

const googleDocs = () => {
  document.body.innerHTML = `
    <div id="docs-menubar" role="menubar" aria-label="Menu bar">
      <div id="docs-file-menu" role="menuitem" class="menu-button goog-control">File</div>
      <div id="docs-edit-menu" role="menuitem" class="menu-button goog-control">Edit</div>
      <div id="docs-extensions-menu" role="menuitem" class="menu-button goog-control">Extensions</div>
      <div id="docs-help-menu" role="menuitem" class="menu-button goog-control">Help</div>
    </div>
    <div class="goog-menu goog-menu-vertical" role="menu" id="tools-menu">
      <div class="goog-menuitem" role="menuitem"><div class="goog-menuitem-content"><span class="goog-menuitem-label">Apps Script</span></div></div>
    </div>
    <div class="goog-menu goog-menu-vertical" role="menu">
      <div class="goog-menuitem" role="menuitem"><div class="goog-menuitem-content"><span class="goog-menuitem-label">Add-ons</span></div></div>
      <div class="goog-menuitem" role="menuitem"><div class="goog-menuitem-content"><span class="goog-menuitem-label">Apps Script</span></div></div>
    </div>`;
  $$('#docs-menubar [role=menuitem]').forEach((m, i) =>
    place(m, 60 + i * 70, 40, 60)
  );
  // The Tools menu stays in the page, hidden, while Extensions is open.
  const open = $$('.goog-menu')[1];
  [...open.querySelectorAll('[role=menuitem]')].forEach((m, i) =>
    place(m, 200, 70 + i * 30, 180)
  );
};

const G = { general: '', account: '', privacy: '' };
const claudeSettings = (order: (keyof typeof G)[], glyph = G) => {
  const label = { general: 'General', account: 'Account', privacy: 'Privacy' };
  document.body.innerHTML = `
    <nav aria-label="Settings">${order
      .map(
        (k) =>
          `<a href="/settings/${k}" class="nav-item"><span class="icon">${glyph[k]}</span>${label[k]}</a>`
      )
      .join('')}</nav>
    <main><h2>Account</h2><button>Log out of all devices</button></main>`;
  $$('nav a').forEach((a, i) => place(a, 20, 100 + i * 36, 180));
  place($('main button'), 400, 160, 200);
};

describe('scored matching keeps the picks of the old chain', () => {
  it('Schoology: course nav, Add Materials and a row action', () => {
    schoology();
    const targets = [
      $('.course-nav-materials a'),
      $('#toolbar span'),
      $$('tbody [role=button]')[1],
    ];
    for (const el of targets) {
      const clues = old(record(el));
      const want = legacyLocate(document, clues);
      expect(want).not.toBeNull();
      const hit = locate(document, clues);
      expect(hit?.el).toBe(want);
      expect(hit?.weak).toBe(false);
    }
  });

  it('Google Docs: Extensions, then Apps Script beside a hidden twin', () => {
    googleDocs();
    for (const el of [
      $('#docs-extensions-menu'),
      $$('.goog-menu-vertical [role=menuitem]')[2],
    ]) {
      const clues = old(record(el));
      expect(locate(document, clues)?.el).toBe(legacyLocate(document, clues));
      expect(locate(document, clues)?.el).toBe(el);
    }
  });

  it('claude.ai: settings links whose names start with an icon glyph', () => {
    claudeSettings(['general', 'account', 'privacy']);
    for (const el of $$('nav a')) {
      const clues = old(record(el));
      expect(locate(document, clues)?.el).toBe(legacyLocate(document, clues));
      expect(locate(document, clues)?.el).toBe(el);
    }
  });

  it('the same picks with the new clues recorded', () => {
    schoology();
    const row = $$('tbody [role=button]')[1];
    expect(locate(document, record(row))).toMatchObject({
      el: row,
      weak: false,
    });
    googleDocs();
    const item = $$('.goog-menu-vertical [role=menuitem]')[2];
    expect(locate(document, record(item))?.el).toBe(item);
  });
});

describe('scored matching after a site changes', () => {
  it('finds a renamed Schoology button by its similar name and position', () => {
    schoology();
    const clues = old(record($('#toolbar span')));
    $('#toolbar span').textContent = 'Add Material';
    expect(locate(document, clues)).toMatchObject({
      el: $('#toolbar [role=button]'),
      weak: false,
    });
  });

  it('ignores a swapped icon glyph in a claude.ai link name', () => {
    claudeSettings(['general', 'account', 'privacy']);
    const clues = old(record($$('nav a')[1]));
    claudeSettings(['general', 'account', 'privacy'], {
      ...G,
      account: '',
    });
    expect(locate(document, clues)).toMatchObject({
      el: $$('nav a')[1],
      weak: false,
    });
  });

  it('follows a reordered link the old chain lost to its CSS path', () => {
    claudeSettings(['general', 'account', 'privacy']);
    const clues = record($$('nav a')[1]);
    claudeSettings(['general', 'privacy', 'account'], {
      ...G,
      account: '',
    });
    const account = $('a[href="/settings/account"]');
    // The old chain falls through to `nav > a:nth-of-type(2)`, now Privacy.
    expect(legacyLocate(document, old(clues))).toBe(
      $('a[href="/settings/privacy"]')
    );
    expect(locate(document, old(clues))?.el).toBe(account);
    expect(locate(document, clues)?.el).toBe(account);
  });

  it('finds a link by its stable path when its words change', () => {
    claudeSettings(['general', 'account', 'privacy']);
    const clues = record($$('nav a')[2]);
    $$('nav a')[2].lastChild!.textContent = 'Data controls';
    expect(locate(document, clues)?.el).toBe($('a[href="/settings/privacy"]'));
  });
});

describe('ambiguous matches', () => {
  const twoEdits = () => {
    document.body.innerHTML = `<section><h3>Unit 1: Cells</h3><button id="a">Edit</button></section>
      <section><h3>Unit 2: Genetics</h3><button id="b">Edit</button></section>`;
    place($('#a'), 100, 100, 40);
    place($('#b'), 300, 100, 40);
  };
  const boxAt = (x: number) => ({
    x: x / innerWidth,
    y: 100 / innerHeight,
    w: 40 / innerWidth,
    h: 24 / innerHeight,
  });

  it('refuses twins it cannot tell apart, as the old chain did', () => {
    twoEdits();
    const clues = { role: 'button', name: 'Edit' };
    expect(legacyLocate(document, clues)).toBeNull();
    expect(locate(document, clues)).toBeNull();
    // A box halfway between them doesn't settle it either.
    expect(locate(document, { ...clues, box: boxAt(200) })).toBeNull();
  });

  it('plays a narrow lead as a weak match', () => {
    twoEdits();
    const hit = locate(document, {
      role: 'button',
      name: 'Edit',
      box: boxAt(150),
    });
    expect(hit?.el.id).toBe('a');
    expect(hit?.weak).toBe(true);
  });

  it('lets the recorded heading pick between same-named buttons', () => {
    twoEdits();
    const hit = locate(document, {
      role: 'button',
      name: 'Edit',
      heading: 'Unit 2: Genetics',
    });
    expect(hit?.el.id).toBe('b');
  });

  it('never matches on position, heading or page title alone', () => {
    twoEdits();
    expect(
      locate(document, { box: boxAt(300), heading: 'Unit 2: Genetics' })
    ).toBeNull();
    expect(locate(document, { pageTitle: 'Course' })).toBeNull();
  });
});

describe('a long page', () => {
  it('finds one of 300 same-named buttons, reading few headings', () => {
    document.body.innerHTML = Array.from(
      { length: 300 },
      (_, i) =>
        `<section><h3>Row ${i}</h3><button id="b${i}">Edit</button></section>`
    ).join('');
    const buttons = $$('button');
    buttons.forEach((b, i) =>
      place(b, (i % 10) * 100, Math.floor(i / 10) * 25, 40, 20)
    );
    const target = buttons[250];
    const r = target.getBoundingClientRect();
    const spy = vi.spyOn(Element.prototype, 'querySelectorAll');
    const hit = locate(document, {
      role: 'button',
      name: 'Edit',
      heading: 'Row 250',
      box: {
        x: r.x / innerWidth,
        y: r.y / innerHeight,
        w: r.width / innerWidth,
        h: r.height / innerHeight,
      },
    });
    const headingWalks = spy.mock.calls.length;
    spy.mockRestore();
    expect(hit?.el).toBe(target);
    // Headings are read only for the few candidates that could still win.
    expect(headingWalks).toBeGreaterThan(0);
    expect(headingWalks).toBeLessThan(100);
  });
});
