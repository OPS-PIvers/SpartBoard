import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  boxesIntersect,
  toRect,
  widgetsInRect,
  useBoardMarqueeSelect,
} from './useBoardMarqueeSelect';
import { widgetRefRegistry } from '@/components/common/widgetRefRegistry';

const box = (left: number, top: number, w: number, h: number) => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

const pointer = (
  type: string,
  init: { x: number; y: number; ctrl?: boolean; pointerType?: string }
) => {
  const e = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
    ctrlKey: init.ctrl ?? false,
    button: 0,
  });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'pointerType', {
    value: init.pointerType ?? 'mouse',
  });
  return e;
};

describe('box selection geometry', () => {
  it('normalises a drag in any direction', () => {
    expect(toRect(50, 60, 10, 20)).toEqual({
      left: 10,
      top: 20,
      width: 40,
      height: 40,
    });
  });

  it('treats touching edges as no overlap', () => {
    expect(boxesIntersect(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
    expect(boxesIntersect(box(0, 0, 10, 10), box(9, 9, 10, 10))).toBe(true);
  });

  it('selects widgets the box overlaps, skipping unrendered ones', () => {
    const boxes: Record<string, ReturnType<typeof box>> = {
      a: box(0, 0, 100, 100),
      b: box(300, 300, 100, 100),
      c: box(90, 90, 20, 20),
    };
    const ids = widgetsInRect(
      { left: 50, top: 50, width: 60, height: 60 },
      ['a', 'b', 'c', 'missing'],
      (id) => boxes[id] ?? null
    );
    expect(ids).toEqual(['a', 'c']);
  });
});

describe('useBoardMarqueeSelect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    widgetRefRegistry.clear();
  });

  const mountBoard = () => {
    const surface = document.createElement('div');
    surface.id = 'dashboard-zoom-surface';
    const widget = document.createElement('div');
    widget.className = 'widget';
    widget.getBoundingClientRect = () =>
      ({ left: 100, top: 100, right: 200, bottom: 200 }) as DOMRect;
    surface.appendChild(widget);
    document.body.appendChild(surface);
    widgetRefRegistry.set('w1', widget);
    return { surface, widget };
  };

  it('selects the widgets under a Ctrl+drag on empty board', () => {
    const { surface } = mountBoard();
    const onSelect = vi.fn();
    const outer = vi.fn();
    surface.addEventListener('pointerdown', outer);
    const { result } = renderHook(() =>
      useBoardMarqueeSelect({
        enabled: true,
        getSelectableIds: () => ['w1'],
        onSelect,
      })
    );
    act(() => {
      surface.dispatchEvent(
        pointer('pointerdown', { x: 50, y: 50, ctrl: true })
      );
      window.dispatchEvent(pointer('pointermove', { x: 150, y: 150 }));
    });
    expect(outer).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      left: 50,
      top: 50,
      width: 100,
      height: 100,
    });
    act(() => {
      window.dispatchEvent(pointer('pointerup', { x: 150, y: 150 }));
    });
    expect(onSelect).toHaveBeenCalledWith(['w1']);
    expect(result.current).toBeNull();
  });

  it('ignores drags without Ctrl, on a widget, by touch, or when disabled', () => {
    const { surface, widget } = mountBoard();
    const onSelect = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }) =>
        useBoardMarqueeSelect({
          enabled,
          getSelectableIds: () => ['w1'],
          onSelect,
        }),
      { initialProps: { enabled: true } }
    );
    const drag = (
      target: Element,
      opts: { ctrl?: boolean; pointerType?: string }
    ) =>
      act(() => {
        target.dispatchEvent(pointer('pointerdown', { x: 50, y: 50, ...opts }));
        window.dispatchEvent(pointer('pointermove', { x: 150, y: 150 }));
        window.dispatchEvent(pointer('pointerup', { x: 150, y: 150 }));
      });
    drag(surface, { ctrl: false });
    drag(widget, { ctrl: true });
    drag(surface, { ctrl: true, pointerType: 'touch' });
    rerender({ enabled: false });
    drag(surface, { ctrl: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('treats a Ctrl+click without movement as no selection', () => {
    const { surface } = mountBoard();
    const onSelect = vi.fn();
    renderHook(() =>
      useBoardMarqueeSelect({
        enabled: true,
        getSelectableIds: () => ['w1'],
        onSelect,
      })
    );
    act(() => {
      surface.dispatchEvent(
        pointer('pointerdown', { x: 50, y: 50, ctrl: true })
      );
      window.dispatchEvent(pointer('pointerup', { x: 51, y: 51 }));
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
