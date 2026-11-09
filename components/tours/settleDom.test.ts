import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForSettle } from './playbackEngine';
import { domSettleHost } from './settleDom';

// jsdom has no layout: each element reports the box its data-x attribute gives it.
const place = (el: HTMLElement, x: number) => {
  el.dataset.x = String(x);
  return el;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const x = Number(this.dataset.x ?? 0);
      return new DOMRect(x, 0, 40, 40);
    }
  );
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const flush = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('domSettleHost', () => {
  it('waits out changes near the target and ignores changes far away', async () => {
    const target = place(document.createElement('div'), 0);
    const near = place(document.createElement('div'), 60);
    const far = place(document.createElement('div'), 900);
    document.body.append(target, near, far);
    const host = domSettleHost(document, { near: () => target, margin: 48 });
    const wait = waitForSettle(host, { quietMs: 100, capMs: 2000 });
    let reason: string | null = null;
    void wait.done.then((r) => {
      reason = r;
    });
    // A clock ticking across the page doesn't hold the tour.
    for (let i = 0; i < 5; i++) {
      far.textContent = String(i);
      await flush(30);
    }
    expect(reason).toBe('quiet');

    const again = waitForSettle(host, { quietMs: 100, capMs: 2000 });
    let second: string | null = null;
    void again.done.then((r) => {
      second = r;
    });
    for (let i = 0; i < 5; i++) {
      near.textContent = String(i);
      await flush(60);
    }
    expect(second).toBeNull();
    await flush(120);
    expect(second).toBe('quiet');
  });

  it('never counts the tour’s own UI', async () => {
    const target = place(document.createElement('div'), 0);
    const tip = place(document.createElement('div'), 0);
    tip.setAttribute('data-tour-ignore', '');
    document.body.append(target, tip);
    const host = domSettleHost(document, {
      near: () => target,
      ignore: (el) => el.closest('[data-tour-ignore]') !== null,
    });
    const wait = waitForSettle(host, { quietMs: 100, capMs: 2000 });
    let reason: string | null = null;
    void wait.done.then((r) => {
      reason = r;
    });
    for (let i = 0; i < 3; i++) {
      tip.textContent = String(i);
      await flush(40);
    }
    expect(reason).toBe('quiet');
  });

  it('gives up at the cap when the area never rests', async () => {
    const target = place(document.createElement('div'), 0);
    document.body.append(target);
    const host = domSettleHost(document, { near: () => target });
    const wait = waitForSettle(host, { quietMs: 100, capMs: 500 });
    let reason: string | null = null;
    void wait.done.then((r) => {
      reason = r;
    });
    for (let i = 0; i < 12; i++) {
      target.textContent = String(i);
      await flush(50);
    }
    expect(reason).toBe('cap');
  });
});
