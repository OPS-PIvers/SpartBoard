import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mountOverlay,
  OVERLAY_HOST_SELECTOR,
  type OverlayHandle,
} from './mount';
import { aheadState, LOOKING_DELAY_MS, placeTip } from './OverlayRoot';
import type {} from '../playback/frameScript';

const state = {
  title: 'Open Grades',
  text: '<img src=x onerror=alert(1)>Click Grades.',
  current: 2,
  total: 3,
  status: 'shown' as const,
  role: 'top' as const,
  targetHere: true,
  observe: false,
  picture: null,
};

const target = document.createElement('button');
target.getBoundingClientRect = () => new DOMRect(40, 40, 120, 32);
target.scrollIntoView = () => undefined;
globalThis.__sbWebTourFrame = { target: { token: 't', el: target } };

// The one utility the stylesheet probe reads.
const STYLED = '.hidden{display:none}';

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
    handle = mountOverlay(STYLED, onAction);
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
    handle = mountOverlay(STYLED, vi.fn());
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
    handle = mountOverlay(STYLED, onAction);
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

describe('web tour states', () => {
  const picture = { mime: 'image/png' as const, data: 'AAAA', w: 10, h: 10 };

  it('shows the next step as soon as this frame finds it, before the worker renders it', () => {
    captureShadow();
    handle = mountOverlay(STYLED, vi.fn());
    const ahead = {
      token: 'next',
      title: 'Pick a class',
      text: 'Pick one.',
      observe: false,
    };
    act(() => handle?.render({ ...state, ahead }));
    const title = () =>
      shadow?.querySelector('[data-testid="tour-step-title"]')?.textContent;
    expect(title()).toBe('Open Grades');
    expect(aheadState({ ...state, ahead }, 'next')).toMatchObject({
      title: 'Pick a class',
      text: 'Pick one.',
      current: 3,
    });
    expect(aheadState({ ...state, ahead }, 't')).not.toHaveProperty('ahead');
    expect(aheadState({ ...state, ahead }, 't').title).toBe('Open Grades');
  });

  it('says it is looking only when the next step takes a while to find', () => {
    vi.useFakeTimers();
    try {
      captureShadow();
      handle = mountOverlay(STYLED, vi.fn());
      act(() =>
        handle?.render({ ...state, status: 'seeking', targetHere: false })
      );
      const tip = () => shadow?.querySelector('[data-testid="tour-callout"]');
      expect(tip()?.querySelector('[role="status"]')).toBeNull();
      act(() => {
        vi.advanceTimersByTime(LOOKING_DELAY_MS);
      });
      expect(tip()?.querySelector('[role="status"]')).not.toBeNull();
      act(() => handle?.render(state));
      expect(tip()?.querySelector('[role="status"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the picture and a Next button when the target can not be found', () => {
    captureShadow();
    const onAction = vi.fn();
    handle = mountOverlay(STYLED, onAction);
    act(() =>
      handle?.render({
        ...state,
        status: 'fallback',
        targetHere: false,
        picture,
      })
    );
    const img = shadow?.querySelector('[data-testid="web-tour-picture"]');
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(
      shadow?.querySelector('[data-testid="web-tour-find-it"]')
    ).not.toBeNull();
    expect(shadow?.querySelector('[data-testid="tour-spotlight"]')).toBeNull();
    act(() =>
      (
        shadow?.querySelector(
          '[data-testid="tour-tip-next"]'
        ) as HTMLButtonElement | null
      )?.click()
    );
    expect(onAction).toHaveBeenCalledWith('next');
  });

  it('shows the check result and a Next button on a found click step in check mode', () => {
    captureShadow();
    const onAction = vi.fn();
    handle = mountOverlay(STYLED, onAction);
    act(() => handle?.render(state));
    expect(shadow?.querySelector('[data-testid="tour-tip-next"]')).toBeNull();
    act(() => handle?.render({ ...state, check: 'ambiguous' }));
    expect(
      shadow?.querySelector('[data-testid="web-tour-check-result"]')
        ?.textContent
    ).toBe('Matches more than one');
    const next = shadow?.querySelector(
      '[data-testid="tour-tip-next"]'
    ) as HTMLButtonElement | null;
    expect(next?.textContent).toMatch(/Next/);
    act(() => next?.click());
    expect(onAction).toHaveBeenCalledWith('next');
    act(() => handle?.render({ ...state, check: 'pending' }));
    expect(
      shadow?.querySelector('[data-testid="web-tour-check-result"]')
    ).toBeNull();
  });

  it('says the step is on another page', () => {
    captureShadow();
    handle = mountOverlay(STYLED, vi.fn());
    act(() =>
      handle?.render({
        ...state,
        status: 'wrong-page',
        targetHere: false,
        picture,
      })
    );
    expect(
      shadow?.querySelector('[data-testid="web-tour-other-page"]')
    ).not.toBeNull();
    expect(
      shadow?.querySelector('[data-testid="web-tour-picture"]')
    ).not.toBeNull();
  });

  it('draws only the spotlight in a frame that holds the target', () => {
    captureShadow();
    handle = mountOverlay(STYLED, vi.fn());
    act(() => handle?.render({ ...state, role: 'target' }));
    expect(
      shadow?.querySelector('[data-testid="tour-spotlight"]')
    ).not.toBeNull();
    expect(shadow?.querySelector('[data-testid="tour-bar"]')).toBeNull();
    expect(shadow?.querySelector('[data-testid="tour-callout"]')).toBeNull();
  });

  it('ends the tour from the finished tip', () => {
    captureShadow();
    const onAction = vi.fn();
    handle = mountOverlay(STYLED, onAction);
    act(() =>
      handle?.render({
        ...state,
        current: 3,
        status: 'done',
        targetHere: false,
      })
    );
    expect(
      shadow?.querySelector('[data-testid="tour-callout"]')?.textContent
    ).toContain('Tour complete');
    act(() =>
      (
        shadow?.querySelector(
          '[data-testid="tour-tip-next"]'
        ) as HTMLButtonElement | null
      )?.click()
    );
    expect(onAction).toHaveBeenCalledWith('exit');
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

describe('stylesheet safety', () => {
  it('dims with an inline fill and lets clicks through to the website', () => {
    captureShadow();
    handle = mountOverlay(STYLED, vi.fn());
    act(() => handle?.render(state));
    const dim = shadow?.querySelector('[data-testid="tour-spotlight"] path');
    expect(dim?.getAttribute('fill')).toBe('rgba(2,6,23,0.55)');
    expect((dim as SVGPathElement | null)?.style.pointerEvents).toBe('none');
  });

  it('shows the find-it tip instead of a spotlight when the stylesheet is missing', () => {
    captureShadow();
    handle = mountOverlay('', vi.fn());
    act(() => handle?.render(state));
    expect(shadow?.querySelector('[data-testid="tour-spotlight"]')).toBeNull();
    expect(
      shadow?.querySelector('[data-testid="web-tour-find-it"]')
    ).not.toBeNull();
  });
});
