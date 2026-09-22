import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { SubsDashboardProvider } from '@/components/subs/SubsDashboardProvider';
import { useSubsControl } from '@/components/subs/SubsControlContext';
import { useDashboard } from '@/context/useDashboard';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';
import type { ClassRoster, WidgetData } from '@/types';
import type { SubstituteRosterState } from '@/hooks/useSubstituteRosters';

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

function expectHandle(h: ProbeHandle | null): ProbeHandle {
  if (!h) throw new Error('Probe handle was not set');
  return h;
}

describe('SubsDashboardProvider', () => {
  it('exposes isActiveBoardReadOnly: true so DraggableWindow auto-locks', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    expect(expectHandle(handle).isReadOnly).toBe(true);
  });

  it('updateWidget mutates local state but does not touch Firestore', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    act(() => {
      expectHandle(handle).update('w1', {
        config: { counts: { hot: 99, cold: 0, home: 0 } },
      } as Partial<WidgetData>);
    });
    expect(
      (
        expectHandle(handle).widgets[0].config as {
          counts: Record<string, number>;
        }
      ).counts.hot
    ).toBe(99);
  });

  it('updateWidget shallow-merges config (preserves sibling fields)', () => {
    // Pins the canonical shallow-merge at the config level. Without it, a
    // widget calling updateWidget(id, { config: { newField: x } }) would
    // silently clobber every other sibling config field (counts, etc.).
    // Matches DashboardContext.updateWidget's merge semantics.
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    // Add a NEW sibling field at the config level. The existing `counts`
    // field must survive — the merge is { ...w.config, ...updates.config }.
    act(() => {
      expectHandle(handle).update('w1', {
        config: { addedByUser: 'sub-note' },
      } as unknown as Partial<WidgetData>);
    });
    const merged = expectHandle(handle).widgets[0].config as {
      counts: Record<string, number>;
      addedByUser: string;
    };
    expect(merged.addedByUser).toBe('sub-note');
    // If this fails, the provider regressed to a naive `{ ...w, ...updates }`
    // that overwrites the entire config object.
    expect(merged.counts).toBeDefined();
    expect(merged.counts.hot).toBe(5);
    expect(merged.counts.cold).toBe(2);
    expect(merged.counts.home).toBe(1);
  });

  it('resetWidgets restores the initialState snapshot', () => {
    let handle: ProbeHandle | null = null;
    render(
      <SubsDashboardProvider share={makeShare()}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    act(() => {
      expectHandle(handle).update('w1', {
        config: { counts: { hot: 99, cold: 0, home: 0 } },
      } as Partial<WidgetData>);
    });
    expect(
      (
        expectHandle(handle).widgets[0].config as {
          counts: Record<string, number>;
        }
      ).counts.hot
    ).toBe(99);
    act(() => {
      expectHandle(handle).reset();
    });
    expect(
      (
        expectHandle(handle).widgets[0].config as {
          counts: Record<string, number>;
        }
      ).counts.hot
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
      expectHandle(handle).update('w1', {
        config: { counts: { hot: 99, cold: 0, home: 0 } },
      } as Partial<WidgetData>);
    });
    expect(
      (
        expectHandle(handle).widgets[0].config as {
          counts: Record<string, number>;
        }
      ).counts.hot
    ).toBe(99);
    rerender(
      <SubsDashboardProvider share={makeShare({ shareId: 'b' })}>
        <Probe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    expect(
      (
        expectHandle(handle).widgets[0].config as {
          counts: Record<string, number>;
        }
      ).counts.hot
    ).toBe(5);
  });

  it('exposes loaded rosters and switches the active roster locally', () => {
    const roster = (id: string, name: string): ClassRoster => ({
      id,
      name,
      driveFileId: `file-${id}`,
      studentCount: 1,
      createdAt: 0,
      students: [
        { id: `${id}-s1`, firstName: 'Ada', lastName: 'L', pin: '01' },
      ],
    });
    const rosterState: SubstituteRosterState = {
      rosters: [roster('r1', 'Period 1'), roster('r2', 'Period 2')],
      status: 'ready',
      loadRosters: () => Promise.resolve(),
    };
    interface RosterHandle {
      dash: ReturnType<typeof useDashboard>;
      status: string;
    }
    let handle: RosterHandle | null = null;
    function RosterProbe({ onReady }: { onReady: (h: RosterHandle) => void }) {
      const dash = useDashboard();
      const { rosterStatus } = useSubsControl();
      React.useEffect(() => {
        onReady({ dash, status: rosterStatus });
      });
      return null;
    }
    render(
      <SubsDashboardProvider share={makeShare()} rosterState={rosterState}>
        <RosterProbe onReady={(h) => (handle = h)} />
      </SubsDashboardProvider>
    );
    const read = (): RosterHandle => {
      if (!handle) throw new Error('Probe did not render');
      return handle;
    };
    expect(read().status).toBe('ready');
    expect(read().dash.rosters.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(read().dash.activeRosterId).toBe('r1');
    act(() => {
      read().dash.setActiveRoster('r2');
    });
    expect(read().dash.activeRosterId).toBe('r2');
  });
});

describe('SubsDashboardProvider per-board session state', () => {
  const boardWidgets = (boardId: string, hot: number): WidgetData[] => [
    {
      id: `w-${boardId}`,
      type: 'lunch-count',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      z: 1,
      config: { counts: { hot } },
    } as unknown as WidgetData,
  ];

  const B1 = boardWidgets('b1', 1);
  const B2 = boardWidgets('b2', 2);

  const hotCount = (h: ProbeHandle) =>
    (h.widgets[0]?.config as { counts: { hot: number } }).counts.hot;

  interface WalkHandle extends ProbeHandle {
    goTo: (boardId: string) => void;
  }

  function Walker({ onReady }: { onReady: (h: WalkHandle) => void }) {
    const [boardId, setBoardId] = React.useState('b1');
    const widgets = boardId === 'b1' ? B1 : B2;
    const share = React.useMemo(
      () => makeShare({ widgets, initialState: widgets }),
      [widgets]
    );
    return (
      <SubsDashboardProvider share={share} boardKey={boardId}>
        <Probe onReady={(h) => onReady({ ...h, goTo: setBoardId })} />
      </SubsDashboardProvider>
    );
  }

  function renderWalker() {
    let handle: WalkHandle | null = null;
    render(<Walker onReady={(h) => (handle = h)} />);
    return (): WalkHandle => {
      if (!handle) throw new Error('Probe handle was not set');
      return handle;
    };
  }

  // Plan D3: a running timer or a ticked checklist survives the walk.
  it('keeps each board’s edits while the sub walks the collection', () => {
    const read = renderWalker();
    act(() => read().update('w-b1', { config: { counts: { hot: 9 } } }));
    expect(hotCount(read())).toBe(9);

    act(() => read().goTo('b2'));
    expect(read().widgets.map((w) => w.id)).toEqual(['w-b2']);
    expect(hotCount(read())).toBe(2);

    act(() => read().goTo('b1'));
    expect(read().widgets.map((w) => w.id)).toEqual(['w-b1']);
    expect(hotCount(read())).toBe(9);
  });

  it('resets the open board only', () => {
    const read = renderWalker();
    act(() => read().update('w-b1', { config: { counts: { hot: 9 } } }));
    act(() => read().goTo('b2'));
    act(() => read().update('w-b2', { config: { counts: { hot: 8 } } }));

    act(() => read().reset());
    expect(hotCount(read())).toBe(2);

    act(() => read().goTo('b1'));
    expect(hotCount(read())).toBe(9);
  });

  it('never lets an edit cross into another board', () => {
    const read = renderWalker();
    act(() => read().goTo('b2'));
    act(() => read().update('w-b2', { config: { counts: { hot: 8 } } }));
    act(() => read().goTo('b1'));
    expect(hotCount(read())).toBe(1);
  });

  // A different teacher's share is a fresh start, not a resumed session.
  it('drops every board’s state when the share itself changes', () => {
    let handle: ProbeHandle | null = null;
    const read = (): ProbeHandle => {
      if (!handle) throw new Error('Probe handle was not set');
      return handle;
    };
    function Fixed({ shareId }: { shareId: string }) {
      const share = React.useMemo(
        () => makeShare({ shareId, widgets: B1, initialState: B1 }),
        [shareId]
      );
      return (
        <SubsDashboardProvider share={share} boardKey="b1">
          <Probe onReady={(h) => (handle = h)} />
        </SubsDashboardProvider>
      );
    }
    const { rerender } = render(<Fixed shareId="share-1" />);
    act(() => read().update('w-b1', { config: { counts: { hot: 9 } } }));
    expect(hotCount(read())).toBe(9);

    rerender(<Fixed shareId="share-2" />);
    expect(hotCount(read())).toBe(1);
  });
});
