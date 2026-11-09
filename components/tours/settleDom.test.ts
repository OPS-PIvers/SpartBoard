import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForSettle } from './playbackEngine';
import { domSettleHost, SETTLE_MAX_RECORDS } from './settleDom';

// jsdom has no layout: each element's box comes from this map, so moving one is not a mutation.
const xOf = new WeakMap<Element, number>();
const rectReads: Element[] = [];
const place = (el: HTMLElement, x: number) => {
  xOf.set(el, x);
  return el;
};

beforeEach(() => {
  vi.useFakeTimers();
  rectReads.length = 0;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      rectReads.push(this);
      return new DOMRect(xOf.get(this) ?? 0, 0, 40, 40);
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

const track = (wait: { done: Promise<string> }) => {
  const out: { reason: string | null } = { reason: null };
  void wait.done.then((r) => {
    out.reason = r;
  });
  return out;
};

describe('domSettleHost', () => {
  it('waits out changes near the target and ignores changes far away', async () => {
    const target = place(document.createElement('div'), 0);
    const near = place(document.createElement('div'), 60);
    const far = place(document.createElement('div'), 900);
    document.body.append(target, near, far);
    const host = domSettleHost(document, { near: () => target, margin: 48 });
    const first = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    // A clock ticking across the page doesn't hold the tour.
    for (let i = 0; i < 5; i++) {
      far.style.width = `${i}px`;
      await flush(30);
    }
    expect(first.reason).toBe('quiet');

    const second = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    for (let i = 0; i < 5; i++) {
      near.style.width = `${i}px`;
      await flush(60);
    }
    expect(second.reason).toBeNull();
    await flush(120);
    expect(second.reason).toBe('quiet');
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
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    for (let i = 0; i < 3; i++) {
      tip.textContent = String(i);
      await flush(40);
    }
    expect(wait.reason).toBe('quiet');
  });

  it('gives up at the cap when the area never rests', async () => {
    const target = place(document.createElement('div'), 0);
    document.body.append(target);
    const host = domSettleHost(document, { near: () => target });
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 500 }));
    for (let i = 0; i < 12; i++) {
      target.textContent = String(i);
      await flush(50);
    }
    expect(wait.reason).toBe('cap');
  });

  it('is not settled while the target slides with no mutation, and settles once it rests', async () => {
    const target = place(document.createElement('div'), 0);
    document.body.append(target);
    const host = domSettleHost(document, { near: () => target });
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    // A CSS transition: the box moves every frame for 300ms.
    for (let t = 0; t < 300; t += 16) {
      place(target, t);
      await flush(16);
    }
    expect(wait.reason).toBeNull();
    await flush(60);
    expect(wait.reason).toBeNull();
    await flush(80);
    expect(wait.reason).toBe('quiet');
  });

  it('lands at the cap when the target never stops moving', async () => {
    const target = place(document.createElement('div'), 0);
    document.body.append(target);
    const host = domSettleHost(document, { near: () => target });
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 400 }));
    for (let t = 0; t < 600; t += 16) {
      place(target, t);
      await flush(16);
    }
    expect(wait.reason).toBe('cap');
  });

  it('counts the target appearing or leaving the page as a change', async () => {
    const target = place(document.createElement('div'), 0);
    let shown: Element | null = null;
    const host = domSettleHost(document, { near: () => shown });
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    await flush(80);
    shown = target;
    await flush(80);
    expect(wait.reason).toBeNull();
    await flush(40);
    expect(wait.reason).toBe('quiet');
  });

  it('counts a batch too big to read as a change, even far from the target', async () => {
    const target = place(document.createElement('div'), 0);
    const far = place(document.createElement('div'), 900);
    document.body.append(target, far);
    const host = domSettleHost(document, { near: () => target });
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    await flush(60);
    for (let i = 0; i <= SETTLE_MAX_RECORDS; i++)
      far.appendChild(document.createElement('span'));
    await flush(60);
    expect(wait.reason).toBeNull();
    await flush(60);
    expect(wait.reason).toBe('quiet');
  });

  it('decides changes inside the target or the tour’s UI without reading their boxes', async () => {
    const target = place(document.createElement('div'), 0);
    const inner = document.createElement('span');
    target.append(inner);
    const tip = place(document.createElement('div'), 0);
    tip.setAttribute('data-tour-ignore', '');
    const tipText = document.createElement('span');
    tip.append(tipText);
    document.body.append(target, tip);
    const host = domSettleHost(document, {
      near: () => target,
      ignore: (el) => el.closest('[data-tour-ignore]') !== null,
    });
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    await flush(20);
    rectReads.length = 0;
    inner.textContent = 'changed';
    tipText.textContent = 'tip';
    await flush(0);
    expect(rectReads).not.toContain(inner);
    expect(rectReads).not.toContain(tipText);
    expect(rectReads).not.toContain(tip);
    expect(wait.reason).toBeNull();
  });

  it('reads the watch area once per batch', async () => {
    const target = place(document.createElement('div'), 0);
    const far = Array.from({ length: 5 }, (_, i) =>
      place(document.createElement('div'), 900 + i * 50)
    );
    document.body.append(target, ...far);
    const host = domSettleHost(document, { near: () => target });
    track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    // Between frames, so only the batch reads boxes.
    await flush(1);
    rectReads.length = 0;
    for (const el of far) el.style.width = '1px';
    await Promise.resolve();
    await Promise.resolve();
    expect(rectReads.filter((el) => el === target)).toHaveLength(1);
  });

  it('is not held by text ticking beside the target or by attributes that only repaint', async () => {
    const target = place(document.createElement('div'), 0);
    const clock = place(document.createElement('span'), 50);
    const dot = place(document.createElement('span'), 60);
    document.body.append(target, clock, dot);
    const host = domSettleHost(document, { near: () => target });
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    for (let i = 0; i < 4; i++) {
      clock.textContent = `12:00:0${i}`;
      dot.dataset.on = String(i % 2);
      await flush(30);
    }
    expect(wait.reason).toBe('quiet');
  });

  it('counts text changing inside the target', async () => {
    const target = place(document.createElement('button'), 0);
    document.body.append(target);
    const host = domSettleHost(document, { near: () => target });
    const wait = track(waitForSettle(host, { quietMs: 100, capMs: 2000 }));
    for (let i = 0; i < 4; i++) {
      target.textContent = `Loading ${i}`;
      await flush(60);
    }
    expect(wait.reason).toBeNull();
  });
});
