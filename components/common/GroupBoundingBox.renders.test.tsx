import React, { Profiler, memo } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GroupBoundingBox } from './GroupBoundingBox';
import type { WidgetData } from '@/types';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import {
  DashboardActionsContext,
  type DashboardActions,
} from '@/context/dashboardCanvasStore';

const widget = (id: string, x: number): WidgetData =>
  ({
    id,
    type: 'clock',
    x,
    y: 0,
    w: 200,
    h: 200,
    z: 1,
    flipped: false,
    config: {},
    groupId: 'g1',
  }) as unknown as WidgetData;

let commits = 0;
const Isolated = memo(function Isolated(
  props: React.ComponentProps<typeof GroupBoundingBox>
) {
  return (
    <Profiler id="g" onRender={() => commits++}>
      <GroupBoundingBox {...props} />
    </Profiler>
  );
});

describe('GroupBoundingBox render isolation', () => {
  it('does not re-render when the full dashboard context value changes', () => {
    const actions = { updateWidgets: vi.fn() } as unknown as DashboardActions;
    const widgets = [widget('a', 0), widget('b', 200)];
    commits = 0;
    const tree = (v: number) => (
      <DashboardContext.Provider
        value={
          { updateWidgets: vi.fn(), v } as unknown as DashboardContextValue
        }
      >
        <DashboardActionsContext.Provider value={actions}>
          <Isolated groupWidgets={widgets} zoom={1} />
        </DashboardActionsContext.Provider>
      </DashboardContext.Provider>
    );
    const { rerender } = render(tree(0));
    const initial = commits;
    for (let i = 1; i <= 5; i++) rerender(tree(i));
    expect(commits).toBe(initial);
  });
});
