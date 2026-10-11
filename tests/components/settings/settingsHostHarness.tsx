import React from 'react';
import { vi } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  DashboardActionsContext,
  DashboardCanvasStoreContext,
  createDashboardCanvasStore,
  type DashboardActions,
  type DashboardCanvasState,
} from '@/context/dashboardCanvasStore';
import type { Dashboard, WidgetData } from '@/types';

export const makeWidget = (over: Partial<WidgetData> = {}): WidgetData =>
  ({
    id: 'w1',
    type: 'clock',
    x: 10,
    y: 10,
    w: 200,
    h: 150,
    z: 1,
    config: {},
    ...over,
  }) as WidgetData;

export const makeBoard = (widgets: WidgetData[], id = 'b1'): Dashboard => ({
  id,
  name: 'Board',
  background: 'bg-slate-900',
  widgets,
  createdAt: 0,
});

export interface HostHarness {
  actions: DashboardActions;
  updateWidget: ReturnType<typeof vi.fn>;
  updateWidgets: ReturnType<typeof vi.fn>;
  setState: (next: Partial<DashboardCanvasState>) => void;
  getWidgets: () => WidgetData[];
  unmount: () => void;
}

const baseState = (board: Dashboard): DashboardCanvasState => ({
  activeDashboard: board,
  selectedWidgetId: null,
  selectedWidgetIds: [],
  groupBuildMode: false,
  zoom: 1,
  isActiveBoardReadOnly: false,
});

/** Mounts a component under a real canvas store with recorded actions. */
export const renderWithCanvas = (
  ui: React.ReactElement,
  board: Dashboard,
  overrides: Partial<DashboardCanvasState> = {}
): HostHarness & ReturnType<typeof render> => {
  let state = { ...baseState(board), ...overrides };
  const store = createDashboardCanvasStore(state);
  const updateWidget = vi.fn();
  const updateWidgets = vi.fn();
  const actions = {
    updateWidget,
    updateWidgets,
  } as unknown as DashboardActions;

  const utils = render(
    <DashboardActionsContext.Provider value={actions}>
      <DashboardCanvasStoreContext.Provider value={store}>
        {ui}
      </DashboardCanvasStoreContext.Provider>
    </DashboardActionsContext.Provider>
  );

  const setState = (next: Partial<DashboardCanvasState>) => {
    state = { ...state, ...next };
    act(() => {
      store.setStateFromRender(state);
      store.notify();
    });
  };

  return {
    ...utils,
    actions,
    updateWidget,
    updateWidgets,
    setState,
    getWidgets: () => state.activeDashboard?.widgets ?? [],
    unmount: utils.unmount,
  };
};
