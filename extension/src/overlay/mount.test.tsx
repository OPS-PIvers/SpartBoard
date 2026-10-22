import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mountOverlay,
  OVERLAY_HOST_SELECTOR,
  type OverlayHandle,
} from './mount';
import { placeTip } from './OverlayRoot';

const state = {
  title: 'Open Grades',
  text: '<img src=x onerror=alert(1)>Click Grades.',
  current: 2,
  total: 3,
  rect: { x: 40, y: 40, width: 120, height: 32 },
};

let handle: OverlayHandle | null = null;
let shadow: ShadowRoot | null = null;

// The overlay's shadow root is closed, so capture it as it is attached.
const captureShadow = () => {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- re-called with the element as `this`
  const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
    this: Element,
    init: ShadowRootInit
  ) {
    shadow = attach.call(this, init);
    return shadow;
  });
};

afterEach(() => {
  act(() => handle?.unmount());
  handle = null;
  shadow = null;
  vi.restoreAllMocks();
});

describe('mountOverlay', () => {
  it('draws the tour inside a closed shadow root, with tip text as plain text', () => {
    captureShadow();
    const onAction = vi.fn();
    handle = mountOverlay('.x{color:red}', onAction);
    act(() => handle?.render(state));

    const host = document.querySelector(OVERLAY_HOST_SELECTOR);
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).toBeNull();
    expect(host?.hasAttribute('data-tour-ignore')).toBe(true);
    expect(host?.getAttribute('style')).toContain(
      'z-index: 2147483647 !important'
    );
    expect(document.querySelector('[data-testid="tour-callout"]')).toBeNull();

    const tip = shadow?.querySelector('[data-testid="tour-callout"]');
    expect(tip?.textContent).toContain('Open Grades');
    expect(tip?.textContent).toContain(
      '<img src=x onerror=alert(1)>Click Grades.'
    );
    expect(shadow?.querySelector('img')).toBeNull();
    expect(
      shadow?.querySelector('[data-testid="tour-spotlight"]')
    ).not.toBeNull();
    expect(shadow?.querySelector('[data-testid="tour-bar"]')).not.toBeNull();
  });

  it('has no Autopilot and keeps nothing in the site storage', () => {
    captureShadow();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    handle = mountOverlay('', vi.fn());
    act(() => handle?.render(state));
    expect(shadow?.querySelector('[role="switch"]')).toBeNull();
    const grip = shadow?.querySelector('[data-testid="tour-bar-grip"]');
    act(() => {
      grip?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
      );
    });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('reports bar actions and removes its host on unmount', () => {
    captureShadow();
    const onAction = vi.fn();
    handle = mountOverlay('', onAction);
    act(() => handle?.render(state));
    const buttons = [
      ...(shadow?.querySelectorAll('[data-testid="tour-bar"] button') ?? []),
    ];
    const byText = (text: string) =>
      buttons.find((b) => b.textContent?.trim() === text);
    act(() => (byText('Back') as HTMLButtonElement | undefined)?.click());
    act(() => (byText('Next') as HTMLButtonElement | undefined)?.click());
    expect(onAction.mock.calls).toEqual([['back'], ['next']]);
    act(() => handle?.unmount());
    handle = null;
    expect(document.querySelector(OVERLAY_HOST_SELECTOR)).toBeNull();
  });
});

describe('placeTip', () => {
  const view = { w: 1280, h: 800 };

  it('centres the tip when there is no target', () => {
    expect(placeTip(null, view)).toEqual({
      left: 480,
      top: 800 / 3,
      width: 320,
    });
  });

  it('keeps the tip on screen next to a target at the edge', () => {
    const tip = placeTip({ x: 1250, y: 760, width: 30, height: 30 }, view);
    expect(tip.left + tip.width).toBeLessThanOrEqual(view.w - 12);
    expect(tip.top).toBeLessThan(760);
  });
});
