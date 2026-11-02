import { describe, expect, it } from 'vitest';
import type { ClassRoster, Dashboard, WidgetData } from '@/types';
import { CHECKLIST_ROSTER_ORDER } from './checklistCurrent';
import { engineWidgets, type RosterView } from './connectionRosterView';

const checklist = (config: Record<string, unknown> = {}): WidgetData => ({
  id: 'cl',
  type: 'checklist',
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  z: 1,
  flipped: false,
  config: { mode: 'roster', rosterMode: 'class', items: [], ...config },
});

const board = (w: WidgetData): Dashboard => ({
  id: 'b',
  name: 'B',
  background: '',
  createdAt: 0,
  widgets: [w],
  connections: [
    {
      id: 'q',
      kind: 'sequence',
      repeat: 'once',
      steps: [{ id: '1', actions: [{ widgetId: 'cl', action: 'next' }] }],
    },
  ],
});

const roster = {
  id: 'r',
  name: 'Period 1',
  students: [
    { id: 's1', firstName: 'Ana', lastName: 'A' },
    { id: 's2', firstName: 'Ben', lastName: 'B' },
  ],
  groups: [{ id: 'g', name: 'Team', studentIds: ['s2'] }],
} as unknown as ClassRoster;

const view = (over: Partial<RosterView> = {}): RosterView => ({
  rosters: [roster],
  activeRosterId: 'r',
  groupsEnabled: false,
  groupsReady: false,
  ...over,
});

const orderOf = (ws: WidgetData[] | null) =>
  (ws?.[0].config as Record<string, unknown> | undefined)?.[
    CHECKLIST_ROSTER_ORDER
  ];

describe('engineWidgets', () => {
  it('gives a class-roster Checklist its students in order', () => {
    expect(orderOf(engineWidgets(board(checklist()), view()))).toEqual([
      's1',
      's2',
    ]);
  });

  it('waits while the class has not loaded', () => {
    expect(engineWidgets(board(checklist()), view({ rosters: [] }))).toBeNull();
    expect(
      engineWidgets(
        board(checklist()),
        view({ rosters: [{ ...roster, students: [] }] })
      )
    ).toBeNull();
  });

  it('waits for the saved-groups switch before using a saved group', () => {
    const pooled = checklist({ rosterPoolGroupId: 'g' });
    expect(engineWidgets(board(pooled), view())).toBeNull();
    expect(
      orderOf(
        engineWidgets(
          board(pooled),
          view({ groupsReady: true, groupsEnabled: true })
        )
      )
    ).toEqual(['s2']);
  });
});
