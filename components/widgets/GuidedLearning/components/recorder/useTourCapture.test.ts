import { afterEach, describe, expect, it } from 'vitest';
import { panelOpenerOf, resolveCaptureTarget } from './useTourCapture';

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

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveCaptureTarget', () => {
  it('binds an untagged opener inside a tagged panel to the opener, not the panel', () => {
    const root = dom(
      '<div data-tour="settings.root" data-tour-widget-type="clock"><button aria-haspopup="menu"><span id="t">Font</span></button></div>'
    );
    const found = resolveCaptureTarget(pick(root, '#t'));
    expect(found).toMatchObject({
      anchor: '',
      fallback: { role: 'button', name: 'font' },
      untagged: true,
      suggestedId: 'button.font',
    });
    expect(found?.element.tagName).toBe('BUTTON');
  });

  it('keeps a tagged opener as is', () => {
    const root = dom(
      '<div data-tour="widget.window"><button data-tour="widget.settings-opener" aria-expanded="false" id="t">Settings</button></div>'
    );
    expect(resolveCaptureTarget(pick(root, '#t'))).toMatchObject({
      anchor: 'widget.settings-opener',
      untagged: false,
    });
  });

  it('leaves ordinary clicks inside a tagged container alone', () => {
    const root = dom(
      '<div data-tour="settings.root"><button id="t">Save</button></div>'
    );
    expect(resolveCaptureTarget(pick(root, '#t'))?.anchor).toBe(
      'settings.root'
    );
  });

  it("skips the recorder's own UI", () => {
    const root = dom(
      '<div data-tour-ignore><button aria-expanded="false" id="t">Pause</button></div>'
    );
    expect(resolveCaptureTarget(pick(root, '#t'))).toBeNull();
    expect(panelOpenerOf(pick(root, '#t'))).toBeNull();
  });

  it('does not treat aria-haspopup="false" as an opener', () => {
    const root = dom('<button aria-haspopup="false" id="t">Go</button>');
    expect(panelOpenerOf(pick(root, '#t'))).toBeNull();
  });
});
