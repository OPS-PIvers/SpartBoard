import { describe, expect, it } from 'vitest';
import { rectToImagePct, resolveRecordedAnchor } from './resolveAnchor';

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
