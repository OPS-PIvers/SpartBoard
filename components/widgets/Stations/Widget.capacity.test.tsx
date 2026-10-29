import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { DragEndEvent } from '@dnd-kit/core';
import { StationsWidget } from './Widget';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, StationsConfig } from '@/types';
import { getLocalIsoDate } from '@/utils/localDate';

const dnd = vi.hoisted(() => ({
  onDragEnd: null as null | ((e: DragEndEvent) => void),
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  const Real = actual.DndContext;
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof Real>) => {
      dnd.onDragEnd = (e) => props.onDragEnd?.(e);
      return <Real {...props} />;
    },
  };
});
vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => false }),
}));
vi.mock('@/hooks/useRosterGroupsIntegrationSettings', () => ({
  useRosterGroupsIntegrationSettings: () => ({ enabled: false }),
}));

const updateWidget = vi.fn();
const addToast = vi.fn();

const widgetWith = (config: Partial<StationsConfig>): WidgetData =>
  ({
    id: 'stations-1',
    type: 'stations',
    x: 0,
    y: 0,
    w: 600,
    h: 420,
    z: 1,
    config: {
      rosterMode: 'class',
      stations: [
        {
          id: 'st-a',
          title: 'Reading',
          color: '#10b981',
          order: 0,
          maxStudents: 2,
        },
      ],
      ...config,
    },
  }) as WidgetData;

const drop = (studentId: string, overId: string) =>
  dnd.onDragEnd?.({
    active: { id: studentId },
    over: { id: overId },
  } as unknown as DragEndEvent);

describe('Stations drop capacity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget,
      addToast,
      rosters: [
        {
          id: 'roster-1',
          name: 'Class',
          absent: { date: getLocalIsoDate(), studentIds: ['s3'] },
          students: [
            { id: 's1', firstName: 'Ann', lastName: 'A' },
            { id: 's2', firstName: 'Ben', lastName: 'B' },
            { id: 's3', firstName: 'Cy', lastName: 'C' },
          ],
        },
      ],
      activeRosterId: 'roster-1',
      activeDashboard: { widgets: [] },
    });
  });

  it('lets a present student take a seat held only by an absent student', () => {
    render(
      <StationsWidget
        widget={widgetWith({ assignments: { s1: 'st-a', s3: 'st-a' } })}
      />
    );
    drop('s2', 'station:st-a');
    expect(addToast).not.toHaveBeenCalled();
    const [, payload] = updateWidget.mock.calls.at(-1) as [
      string,
      { config: StationsConfig },
    ];
    expect(payload.config.assignments.s2).toBe('st-a');
  });

  it('still refuses once the visible chips fill the station', () => {
    render(
      <StationsWidget
        widget={widgetWith({ assignments: { s1: 'st-a', s2: 'st-a' } })}
      />
    );
    drop('s3', 'station:st-a');
    expect(addToast).toHaveBeenCalledWith('Reading is full.', 'info');
    expect(updateWidget).not.toHaveBeenCalled();
  });
});
