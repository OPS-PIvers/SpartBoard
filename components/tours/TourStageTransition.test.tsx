import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DashboardCanvasStoreContext,
  clearTourHidden,
  createDashboardCanvasStore,
  setTourHidden,
} from '@/context/dashboardCanvasStore';
import type { Dashboard, WidgetData } from '@/types';
import { TourStageTransition } from './TourStageTransition';

let reduced = false;
vi.mock('./usePrefersReducedMotion', () => ({
  prefersReducedMotion: () => reduced,
}));

interface Call {
  id: string;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
}

const widget = (id: string, extra: Partial<WidgetData> = {}): WidgetData =>
  ({
    id,
    type: 'clock',
    x: 0,
    y: 0,
    w: 200,
    h: 100,
    z: 1,
    flipped: false,
    config: {},
    ...extra,
  }) as WidgetData;

const board = (widgets: WidgetData[]) =>
  ({ id: 'b', widgets }) as unknown as Dashboard;

const stateOf = (widgets: WidgetData[]) => ({
  activeDashboard: board(widgets),
  selectedWidgetId: null,
  selectedWidgetIds: [],
  groupBuildMode: false,
  zoom: 1,
  isActiveBoardReadOnly: false,
});

describe('TourStageTransition', () => {
  let calls: Call[];
  beforeEach(() => {
    reduced = false;
    calls = [];
    HTMLElement.prototype.animate = function (
      this: HTMLElement,
      frames: Keyframe[],
      options: KeyframeAnimationOptions
    ) {
      calls.push({ id: this.dataset.widgetId ?? '', frames, options });
      return { cancel: vi.fn() } as unknown as Animation;
    } as typeof HTMLElement.prototype.animate;
  });
  afterEach(() => {
    act(() => clearTourHidden());
    document.body.innerHTML = '';
  });

  const mount = (widgets: WidgetData[]) => {
    for (const w of widgets) {
      const el = document.createElement('div');
      el.dataset.widgetId = w.id;
      el.dataset.tourWidgetType = w.type;
      document.body.appendChild(el);
    }
    const store = createDashboardCanvasStore(stateOf(widgets));
    const view = render(
      <DashboardCanvasStoreContext.Provider value={store}>
        <TourStageTransition />
      </DashboardCanvasStoreContext.Provider>
    );
    return {
      view,
      setWidgets: (next: WidgetData[]) => {
        for (const w of next) {
          if (!document.querySelector(`[data-widget-id="${w.id}"]`)) {
            const el = document.createElement('div');
            el.dataset.widgetId = w.id;
            document.body.appendChild(el);
          }
        }
        store.setStateFromRender(stateOf(next));
        act(() => store.notify());
      },
    };
  };

  it('staggers the teacher widgets out, then back in when the tour ends', () => {
    mount([widget('a'), widget('b'), widget('c')]);
    act(() => setTourHidden(['a', 'b', 'c']));
    expect(calls.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(calls.map((c) => c.options.delay)).toEqual([0, 75, 150]);
    expect(calls[0].frames[1]).toMatchObject({ opacity: 0 });

    calls.length = 0;
    act(() => clearTourHidden());
    expect(calls.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(calls[0].frames[0]).toMatchObject({ opacity: 0 });
    expect(calls[0].frames[1]).toMatchObject({ opacity: 1, transform: 'none' });
  });

  it('skips widgets the teacher had already minimized', () => {
    mount([widget('a'), widget('b', { minimized: true })]);
    act(() => setTourHidden(['a', 'b']));
    expect(calls.map((c) => c.id)).toEqual(['a']);
  });

  it('cross-fades with no travel and no stagger under reduced motion', () => {
    reduced = true;
    mount([widget('a'), widget('b')]);
    act(() => setTourHidden(['a', 'b']));
    expect(calls.map((c) => c.options.delay)).toEqual([0, 0]);
    expect(calls[0].frames[1]).toEqual({ opacity: 0, transform: 'none' });
    expect(calls[0].options.duration).toBe(150);
  });

  it('fades a tour widget in once the stage has cleared', () => {
    const { setWidgets } = mount([widget('a')]);
    act(() => setTourHidden(['a']));
    calls.length = 0;
    setWidgets([widget('a'), widget('t', { transient: true })]);
    const arrival = calls.find((c) => c.id === 't');
    expect(arrival?.frames[0]).toMatchObject({ opacity: 0 });
    expect(arrival?.options.delay).toBeGreaterThan(0);
    calls.length = 0;
    setWidgets([widget('a'), widget('t', { transient: true })]);
    expect(calls).toHaveLength(0);
  });

  it('animates nothing when no tour is running', () => {
    const { setWidgets } = mount([widget('a')]);
    setWidgets([widget('a'), widget('t', { transient: true })]);
    expect(calls).toHaveLength(0);
  });
});
