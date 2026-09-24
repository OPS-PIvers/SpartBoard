import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANCHOR_SEARCH_MS,
  ANCHOR_SEARCH_THROTTLE_MS,
  useAnchorElement,
} from './useAnchorElement';

const h = vi.hoisted(() => ({ searches: 0 }));

vi.mock('./resolveTourAnchor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./resolveTourAnchor')>();
  return {
    ...actual,
    findTourAnchor: (...args: Parameters<typeof actual.findTourAnchor>) => {
      h.searches++;
      return actual.findTourAnchor(...args);
    },
  };
});

const binding = { anchor: 'sidebar.classes' };
const scope = {};

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const addAnchor = (parent: HTMLElement = document.body) => {
  const el = document.createElement('button');
  el.setAttribute('data-tour', 'sidebar.classes');
  el.textContent = 'My Classes';
  act(() => {
    parent.appendChild(el);
  });
  return el;
};

let rectReads = 0;

beforeEach(() => {
  vi.useFakeTimers();
  h.searches = 0;
  rectReads = 0;
  // jsdom has no layout: anything under [hidden] is zero-size, the rest is a 40px box.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      rectReads++;
      const size = this.closest('[hidden]') ? 0 : 40;
      const x = Number(this.dataset.x ?? 10);
      return new DOMRect(x, 10, size, size);
    }
  );
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAnchorElement', () => {
  it('reports missing after the search window, then continues when the anchor appears at 5s', async () => {
    const { result } = renderHook(() => useAnchorElement(binding, scope));
    expect(result.current.status).toBe('searching');
    await advance(ANCHOR_SEARCH_MS + 10);
    expect(result.current.status).toBe('missing');
    await advance(5000 - ANCHOR_SEARCH_MS - 10);
    const el = addAnchor();
    await advance(ANCHOR_SEARCH_THROTTLE_MS + 20);
    expect(result.current.status).toBe('found');
    expect(result.current.element).toBe(el);
    expect(result.current.rect?.width).toBe(40);
  });

  it('finds an anchor when its hidden panel opens', async () => {
    const panel = document.createElement('div');
    panel.hidden = true;
    document.body.appendChild(panel);
    addAnchor(panel);
    const { result } = renderHook(() => useAnchorElement(binding, scope));
    await advance(ANCHOR_SEARCH_THROTTLE_MS * 2);
    expect(result.current.status).toBe('searching');
    act(() => {
      panel.hidden = false;
    });
    await advance(ANCHOR_SEARCH_THROTTLE_MS + 20);
    expect(result.current.status).toBe('found');
  });

  it('searches at most once per throttle window, and not at all without DOM changes', async () => {
    renderHook(() => useAnchorElement(binding, scope));
    const afterFirst = h.searches;
    await advance(2000);
    expect(h.searches).toBe(afterFirst);
    const busy = document.createElement('div');
    document.body.appendChild(busy);
    for (let i = 0; i < 20; i++) {
      act(() => {
        busy.setAttribute('class', `tick-${i}`);
      });
      await advance(10);
    }
    // 200ms of mutations: one immediate search, then one after the throttle gap.
    await advance(ANCHOR_SEARCH_THROTTLE_MS);
    expect(h.searches - afterFirst).toBeLessThanOrEqual(2);
  });

  it('ignores mutations inside the tour UI', async () => {
    const tourUi = document.createElement('div');
    tourUi.setAttribute('data-tour-ignore', '');
    document.body.appendChild(tourUi);
    renderHook(() => useAnchorElement(binding, scope));
    const afterFirst = h.searches;
    act(() => {
      tourUi.style.left = '5px';
    });
    await advance(ANCHOR_SEARCH_THROTTLE_MS * 2);
    expect(h.searches).toBe(afterFirst);
  });

  it('reads no layout per frame while nothing moves', async () => {
    const el = addAnchor();
    const { result } = renderHook(() => useAnchorElement(binding, scope));
    await advance(100);
    expect(result.current.status).toBe('found');
    const settled = rectReads;
    await advance(2000);
    expect(rectReads).toBe(settled);
    el.dataset.x = '200';
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    await advance(50);
    expect(result.current.rect?.x).toBe(200);
    const moved = rectReads;
    await advance(2000);
    expect(rectReads).toBe(moved);
  });

  it('re-measures when an ancestor moves by style', async () => {
    const win = document.createElement('div');
    document.body.appendChild(win);
    const el = addAnchor(win);
    const { result } = renderHook(() => useAnchorElement(binding, scope));
    await advance(100);
    el.dataset.x = '300';
    act(() => {
      win.style.transform = 'translate(290px, 0)';
    });
    await advance(50);
    expect(result.current.rect?.x).toBe(300);
  });

  it('goes back to searching when the anchor closes, and picks it up again', async () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    addAnchor(panel);
    const { result } = renderHook(() => useAnchorElement(binding, scope));
    await advance(100);
    expect(result.current.status).toBe('found');
    act(() => {
      panel.hidden = true;
    });
    await advance(50);
    expect(result.current.status).toBe('searching');
    act(() => {
      panel.hidden = false;
    });
    await advance(ANCHOR_SEARCH_THROTTLE_MS + 20);
    expect(result.current.status).toBe('found');
  });

  it('goes straight to the fallback when the anchor is empty', async () => {
    const fallbackOnly = {
      anchor: '',
      fallback: { role: 'button', name: 'Open menu' },
    };
    const { result } = renderHook(() => useAnchorElement(fallbackOnly, scope));
    expect(result.current.status).toBe('searching');
    const el = document.createElement('button');
    el.textContent = 'Open menu';
    act(() => {
      document.body.appendChild(el);
    });
    await advance(ANCHOR_SEARCH_THROTTLE_MS + 20);
    expect(result.current.status).toBe('found');
    expect(result.current.element).toBe(el);

    const bare = renderHook(() => useAnchorElement({ anchor: '' }, scope));
    expect(bare.result.current.status).toBe('idle');
  });

  it('observes nothing without an anchor and disconnects on unmount', async () => {
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const idle = renderHook(() => useAnchorElement(null, scope));
    expect(idle.result.current.status).toBe('idle');
    expect(observe).not.toHaveBeenCalled();
    idle.unmount();

    const { unmount } = renderHook(() => useAnchorElement(binding, scope));
    expect(observe).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    const before = h.searches;
    addAnchor();
    await advance(ANCHOR_SEARCH_MS * 2);
    expect(h.searches).toBe(before);
  });
});
