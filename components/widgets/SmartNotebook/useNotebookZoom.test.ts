import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNotebookZoom } from './useNotebookZoom';

// jsdom lays nothing out, so give the zoom container a real-looking rect.
const container = (width = 400, height = 300): HTMLDivElement => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
    }) as DOMRect;
  return el;
};

const mount = (resetKey = 'a') => {
  const view = renderHook(({ key }) => useNotebookZoom(key), {
    initialProps: { key: resetKey },
  });
  act(() => view.result.current.setContainer(container()));
  return view;
};

describe('useNotebookZoom', () => {
  it('starts at fit', () => {
    const { result } = mount();
    expect(result.current.scale).toBe(1);
    expect(result.current.isZoomed).toBe(false);
    expect(result.current.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('steps by 1.25 and clamps at the min and max', () => {
    const { result } = mount();
    act(() => result.current.zoomIn());
    expect(result.current.scale).toBeCloseTo(1.25);

    act(() => result.current.zoomOut());
    expect(result.current.scale).toBeCloseTo(1);

    // Already at fit — must not go below it.
    act(() => result.current.zoomOut());
    expect(result.current.scale).toBe(1);

    for (let i = 0; i < 20; i += 1) act(() => result.current.zoomIn());
    expect(result.current.scale).toBe(8);
  });

  it('keeps the anchor point fixed when zooming at a cursor', () => {
    const { result } = mount();
    act(() => result.current.zoomAt(100, 90, 2));
    const { scale, offsetX, offsetY } = result.current;
    expect(scale).toBe(2);
    // The container-local point under the cursor must still land there.
    expect(offsetX + 100 * scale).toBeCloseTo(100);
    expect(offsetY + 90 * scale).toBeCloseTo(90);
  });

  it('clamps panning so the page cannot leave the container', () => {
    const { result } = mount();
    act(() => result.current.zoomAt(0, 0, 2));
    act(() => result.current.panBy(500, 500));
    expect(result.current.offsetX).toBe(0);
    expect(result.current.offsetY).toBe(0);

    act(() => result.current.panBy(-5000, -5000));
    // At scale 2 the layer is twice the container, so one container away.
    expect(result.current.offsetX).toBe(-400);
    expect(result.current.offsetY).toBe(-300);
  });

  it('resets to fit when the reset key changes', () => {
    const view = mount('page-0');
    act(() => view.result.current.zoomIn());
    expect(view.result.current.scale).toBeGreaterThan(1);

    view.rerender({ key: 'page-1' });
    expect(view.result.current.scale).toBe(1);
    expect(view.result.current.offsetX).toBe(0);
  });

  it('resets on demand', () => {
    const { result } = mount();
    act(() => result.current.zoomAt(200, 150, 4));
    act(() => result.current.reset());
    expect(result.current.scale).toBe(1);
    expect(result.current.transform).toBe('translate(0px, 0px) scale(1)');
  });
});
