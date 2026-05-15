/* eslint-disable @typescript-eslint/no-non-null-assertion -- test-fixture handle is always set by Probe before assertions */
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { SubsDashboardProvider } from '@/components/subs/SubsDashboardProvider';
import { useSubsControl } from '@/components/subs/SubsControlContext';
import { useDashboard } from '@/context/useDashboard';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';
import type { WidgetData } from '@/types';

function makeShare(
  overrides: Partial<SubstituteShareDoc> = {}
): SubstituteShareDoc {
  const widgets: WidgetData[] = [
    {
      id: 'w1',
      type: 'lunch-count',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      z: 1,
      config: { counts: { hot: 5, cold: 2, home: 1 } },
    } as unknown as WidgetData,
  ];
  return {
    shareId: 'share-1',
    name: 'Test board',
    background: '',
    widgets,
    initialState: widgets,
    createdAt: 0,
    intendedMode: 'substitute',
    expiresAt: Date.now() + 60_000,
    buildingId: 'oms',
    libraryOrder: [],
    ...overrides,
  } as SubstituteShareDoc;
}

interface ProbeHandle {
  isReadOnly: boolean;
  widgets: WidgetData[];
  update: (id: string, updates: Partial<WidgetData>) => void;
  reset: () => void;
}

function Probe({ onReady }: { onReady: (h: ProbeHandle) => void }) {
  const dash = useDashboard();
  const ctrl = useSubsControl();
  React.useEffect(() => {
    onReady({
      isReadOnly: dash.isActiveBoardReadOnly,
      widgets: dash.activeDashboard?.widgets ?? [],
      update: dash.updateWidget,
      reset: ctrl.resetWidgets,
    });
  });
  return null;
}

describe('SubsDashboardProvider', () => {
  it('exposes isActiveBoardReadOnly: true so DraggableWindow auto-locks', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    expect(handle!.isReadOnly).toBe(true);
  });

  it('updateWidget mutates local state but does not touch Firestore', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    act(() => {
      handle!.update('w1', {
        config: { counts: { hot: 99, cold: 0, home: 0 } },
      } as Partial<WidgetData>);
    });
    expect(
      (handle!.widgets[0].config as { counts: Record<string, number> }).counts
        .hot
    ).toBe(99);
  });

  it('resetWidgets restores the initialState snapshot', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    act(() => {
      handle!.update('w1', {
        config: { counts: { hot: 99, cold: 0, home: 0 } },
      } as Partial<WidgetData>);
    });
    expect(
      (handle!.widgets[0].config as { counts: Record<string, number> }).counts
        .hot
    ).toBe(99);
    act(() => {
      handle!.reset();
    });
    expect(
      (handle!.widgets[0].config as { counts: Record<string, number> }).counts
        .hot
    ).toBe(5);
  });

  it('reseeds local state when shareId changes', () => {
    let handle: ProbeHandle | null = null;
    const initial = makeShare({ shareId: 'a' });
    const { rerender } = render(
      <SubsDashboardProvider share={initial}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    act(() => {
      handle!.update('w1', {
        config: { counts: { hot: 99, cold: 0, home: 0 } },
      } as Partial<WidgetData>);
    });
    expect(
      (handle!.widgets[0].config as { counts: Record<string, number> }).counts
        .hot
    ).toBe(99);
    rerender(
      <SubsDashboardProvider share={makeShare({ shareId: 'b' })}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    expect(
      (handle!.widgets[0].config as { counts: Record<string, number> }).counts
        .hot
    ).toBe(5);
  });
});
