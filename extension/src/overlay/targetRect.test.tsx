import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLIDE_MS, HOLD_MS, inView, useTargetRect } from './targetRect';
import type {} from '../playback/frameScript';

const button = (x: number, y: number) => {
  const el = document.createElement('button');
  document.body.append(el);
  el.getBoundingClientRect = () => new DOMRect(x, y, 100, 30);
  const scrolled = vi.fn();
  el.scrollIntoView = scrolled;
  return Object.assign(el, { scrolled });
};

const target = (el: Element | null) => {
  globalThis.__sbWebTourFrame = { target: el ? { token: 't', el } : null };
};

const frames = async (ms: number) => {
  await act(() => vi.advanceTimersByTimeAsync(ms));
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  globalThis.__sbWebTourFrame = undefined;
});

describe('useTargetRect', () => {
  it('glides from one target to the next instead of jumping', async () => {
    const a = button(0, 0);
    target(a);
    const { result } = renderHook(() => useTargetRect(true).rect);
    await frames(50);
    expect(result.current).toMatchObject({ x: 0, y: 0 });
    target(button(400, 200));
    await frames(GLIDE_MS / 3);
    const mid = result.current!;
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(400);
    await frames(GLIDE_MS);
    expect(result.current).toMatchObject({ x: 400, y: 200 });
  });

  it('holds over a target that vanished, then lets go', async () => {
    const a = button(20, 20);
    target(a);
    const { result } = renderHook(() => useTargetRect(true).rect);
    await frames(50);
    a.getBoundingClientRect = () => new DOMRect();
    await frames(HOLD_MS / 2);
    expect(result.current).toMatchObject({ x: 20, y: 20, width: 100 });
    await frames(HOLD_MS);
    expect(result.current).toBeNull();
  });

  it('moves to a target found mid-hold without ever dropping the spotlight', async () => {
    const a = button(20, 20);
    target(a);
    const { result } = renderHook(() => useTargetRect(true).rect);
    await frames(50);
    target(null);
    await frames(HOLD_MS / 2);
    expect(result.current).not.toBeNull();
    target(button(300, 20));
    await frames(GLIDE_MS + 50);
    expect(result.current).toMatchObject({ x: 300 });
  });

  it('draws a target the moment the seeker attaches it, without waiting a frame', async () => {
    target(null);
    const { result } = renderHook(() => useTargetRect(true).rect);
    await frames(50);
    expect(result.current).toBeNull();
    const shared = globalThis.__sbWebTourFrame!;
    shared.target = { token: 't', el: button(40, 60) };
    act(() => shared.onTarget?.());
    expect(result.current).toMatchObject({ x: 40, y: 60 });
  });

  it('draws nothing while inactive', async () => {
    target(button(20, 20));
    const { result } = renderHook(() => useTargetRect(false).rect);
    await frames(50);
    expect(result.current).toBeNull();
  });

  it('scrolls only a target that is out of view', async () => {
    const near = button(20, 100);
    target(near);
    renderHook(() => useTargetRect(true));
    await frames(50);
    expect(near.scrolled).not.toHaveBeenCalled();
    const far = button(20, 5000);
    target(far);
    await frames(50);
    expect(far.scrolled).toHaveBeenCalledOnce();
  });
});

describe('inView', () => {
  it('counts a control clipped by a scrolling box as out of view', () => {
    const box = document.createElement('div');
    box.style.overflowY = 'auto';
    box.getBoundingClientRect = () => new DOMRect(0, 0, 500, 200);
    document.body.append(box);
    const inside = document.createElement('button');
    box.append(inside);
    inside.getBoundingClientRect = () => new DOMRect(10, 50, 100, 30);
    expect(inView(inside)).toBe(true);
    inside.getBoundingClientRect = () => new DOMRect(10, 300, 100, 30);
    expect(inView(inside)).toBe(false);
  });
});
