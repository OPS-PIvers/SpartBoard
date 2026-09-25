import { describe, expect, it } from 'vitest';
import {
  MAX_EXCERPT_BYTES,
  captureUnmappedContext,
  rectToImagePct,
  redactedExcerpt,
  resolveRecordedAnchor,
} from './resolveAnchor';
import { buildNameMatcher } from './redaction';

const dom = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
};

const pick = (root: Element, selector: string): Element => {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
};

describe('resolveRecordedAnchor', () => {
  it('takes the nearest tagged ancestor', () => {
    const root = dom(
      '<button data-tour="sidebar.boards" aria-label="Boards"><span id="t">icon</span></button>'
    );
    const found = resolveRecordedAnchor(pick(root, '#t'));
    expect(found).toMatchObject({
      anchor: 'sidebar.boards',
      fallback: { role: 'button', name: 'boards' },
      untagged: false,
    });
    expect(found?.element.tagName).toBe('BUTTON');
  });

  it('adds the widget type for per-type anchors', () => {
    const root = dom(
      '<button data-tour="dock.item" data-tour-widget-type="clock">Clock</button>'
    );
    expect(resolveRecordedAnchor(pick(root, 'button'))?.anchor).toBe(
      'dock.item:clock'
    );
  });

  it('falls back to role and name for untagged controls, with a suggested id', () => {
    const root = dom(
      '<div><button><span class="u">Add a class</span></button></div>'
    );
    expect(resolveRecordedAnchor(pick(root, '.u'))).toMatchObject({
      anchor: '',
      fallback: { role: 'button', name: 'add a class' },
      untagged: true,
      suggestedId: 'button.add-a-class',
    });
  });

  it("ignores the recorder's own UI", () => {
    const root = dom(
      '<div data-tour-ignore><button data-tour="sidebar.boards">Pause</button></div>'
    );
    expect(resolveRecordedAnchor(pick(root, 'button'))).toBeNull();
  });
});

describe('captureUnmappedContext', () => {
  const matcher = buildNameMatcher([
    { firstName: 'Alice', lastName: 'Nguyen' },
  ]);

  it('captures the chain innermost first, the nearest anchor and the widget type', () => {
    const root = dom(
      '<section data-tour="widget.root" data-tour-widget-type="time-tool">' +
        '<div data-testid="timer-panel" role="group" aria-label="Timer controls">' +
        '<button id="go" class="px-2" onclick="x()" style="color:red">Start</button>' +
        '</div></section>'
    );
    const ctx = captureUnmappedContext(pick(root, '#go'), {
      matcher,
      fallback: { role: 'button', name: 'start' },
      suggestedId: 'button.start',
      pathname: '/',
    });
    expect(ctx).toMatchObject({
      suggestedId: 'button.start',
      role: 'button',
      name: 'start',
      widgetType: 'time-tool',
      pathname: '/',
      nearestAnchor: 'widget.root',
    });
    expect(ctx.ancestors.slice(0, 3)).toEqual([
      { tag: 'button' },
      {
        tag: 'div',
        testId: 'timer-panel',
        ariaLabel: 'Timer controls',
        role: 'group',
      },
      { tag: 'section' },
    ]);
    expect(ctx.htmlExcerpt).toBe('<button class="px-2">Start</button>');
  });

  it('caps the chain at 8 levels', () => {
    const deep =
      '<div>'.repeat(12) + '<button id="deep">x</button>' + '</div>'.repeat(12);
    const ctx = captureUnmappedContext(pick(dom(deep), '#deep'), {
      matcher: null,
      pathname: '/',
    });
    expect(ctx.ancestors).toHaveLength(8);
    expect(ctx.ancestors[0].tag).toBe('button');
  });

  it('replaces roster names in text and kept attributes, and drops data-pii subtrees', () => {
    const root = dom(
      '<div id="row" aria-label="Row for Alice Nguyen" data-student="Alice">' +
        '<span>Seat for Alice</span>' +
        '<span data-pii>Nguyen photo</span>' +
        '<input value="Alice Nguyen" />' +
        '</div>'
    );
    const html = redactedExcerpt(pick(root, '#row'), matcher);
    expect(html).not.toMatch(/alice|nguyen/i);
    expect(html).toContain('aria-label="Row for [name]"');
    expect(html).toContain('<span>Seat for [name]</span>');
    expect(html).not.toContain('data-student');
    expect(html).not.toContain('value=');
    expect(html).not.toContain('photo');
  });

  it('keeps only whitelisted attributes', () => {
    const root = dom(
      '<button id="b" type="button" title="Save" role="switch" aria-pressed="true" data-testid="save" data-tour-x="1" href="/x" data-other="y">Save</button>'
    );
    const html = redactedExcerpt(pick(root, '#b'), null);
    expect(html).toBe(
      '<button type="button" title="Save" role="switch" aria-pressed="true" data-testid="save" data-tour-x="1">Save</button>'
    );
  });

  it('stores no text from inside a data-pii element', () => {
    const root = dom(
      '<div data-pii aria-label="Photo of Sam"><button id="p" title="Sam">Zoom Sam</button></div>'
    );
    const ctx = captureUnmappedContext(pick(root, '#p'), {
      matcher: null,
      fallback: { role: 'button', name: 'zoom sam' },
      suggestedId: 'button.zoom-sam',
      pathname: '/',
    });
    expect(ctx.ancestors[1]).toEqual({ tag: 'div' });
    expect(ctx).toMatchObject({ name: null, suggestedId: null });
    expect(ctx.htmlExcerpt).toBe('<button></button>');
  });

  it('caps the excerpt at 2 KB', () => {
    const root = dom(`<div id="big">${'<p>word é</p>'.repeat(400)}</div>`);
    const html = redactedExcerpt(pick(root, '#big'), null);
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(
      MAX_EXCERPT_BYTES
    );
    expect(html.endsWith('...')).toBe(true);
  });
});

describe('rectToImagePct', () => {
  const rect = { x: 96, y: 46, width: 200, height: 100 };
  const viewport = { w: 1000, h: 500 };

  it('maps the padded rect to image-% at DPR 1', () => {
    expect(rectToImagePct(rect, viewport, { w: 1000, h: 500 })).toEqual({
      xPct: 19.6,
      yPct: 19.2,
      region: { shape: 'rect', wPct: 20.8, hPct: 21.6 },
    });
  });

  it('gives the same placement at DPR 2', () => {
    expect(rectToImagePct(rect, viewport, { w: 2000, h: 1000 })).toEqual(
      rectToImagePct(rect, viewport, { w: 1000, h: 500 })
    );
  });

  it('allows for a letterboxed frame', () => {
    // 1000x500 content centred in a 1000x600 frame: 50px bars above and below.
    const placed = rectToImagePct(rect, viewport, { w: 1000, h: 600 });
    expect(placed.xPct).toBe(19.6);
    expect(placed.yPct).toBe(Math.round(((50 + 96) / 600) * 10000) / 100);
    expect(placed.region.hPct).toBe(18);
  });
});
