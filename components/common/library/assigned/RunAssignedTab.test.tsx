import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiniAppAssignment, PeriodAccess } from '@/types';
import { miniAppAssignedInput } from '@/utils/assignedAdapters';
import { miniAppRowResponses } from '@/components/widgets/MiniApp/utils/miniAppAssignedResponses';
import type { AssignedResponse } from '@/utils/assignedStatus';
import { RunAssignedTab } from './RunAssignedTab';
import { RunAssignedResponsesFixture } from './runAssignedFixture';

const actions = {
  openClass: vi.fn(() => Promise.resolve([] as string[])),
  pauseClass: vi.fn(() => Promise.resolve()),
  closeClass: vi.fn(() => Promise.resolve()),
  reopenClass: vi.fn(() => Promise.resolve([] as string[])),
  closeAll: vi.fn(() => Promise.resolve()),
  moveToDone: vi.fn(() => Promise.resolve()),
};
const addToast = vi.fn();

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 't1' }, featurePermissions: [] }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));
vi.mock('@/hooks/useAssignmentClassActions', () => ({
  useAssignmentClassActions: () => actions,
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

const NOW = Date.now();
const row = (
  label: string,
  over: Partial<PeriodAccess> = {}
): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
  rosterId: label,
  ...over,
});
const ma = (over: Partial<MiniAppAssignment>): MiniAppAssignment => ({
  id: 'a1',
  sessionId: 's1',
  appId: 'app1',
  appTitle: 'Fractions app',
  assignmentName: 'Fractions app',
  teacherUid: 't1',
  status: 'active',
  createdAt: NOW - 3 * 86_400_000,
  updatedAt: NOW,
  mode: 'submissions',
  ...over,
});

const lifecycle = { end: vi.fn(), reopen: vi.fn() };
const onMonitor = vi.fn();
const onCopy = vi.fn<(id: string) => void>();

function renderTab(
  assignments: MiniAppAssignment[],
  responses: Record<string, AssignedResponse[]> = {},
  onBulkDelete?: (list: MiniAppAssignment[]) => Promise<number>
) {
  return render(
    <RunAssignedResponsesFixture.Provider value={responses}>
      <RunAssignedTab<MiniAppAssignment>
        assignments={assignments}
        loading={false}
        rosters={[]}
        collections={{
          sessionCollection: 'mini_app_sessions',
          assignmentCollection: 'miniapp_assignments',
        }}
        lifecycle={lifecycle}
        tourWidgetType="miniApp"
        emptyTitle="Nothing active"
        emptySub="Assign a mini app from the Library."
        title={(a) => a.assignmentName}
        viewOnly={(a) => a.mode === 'view-only'}
        toInput={miniAppAssignedInput}
        responsesPath={(a) => `mini_app_sessions/${a.sessionId}/submissions`}
        toResponses={miniAppRowResponses}
        classCounts={(a) => Object.keys(a.periodAccess ?? {}).length <= 1}
        onMonitor={onMonitor}
        fallbackPrimary={(a) => ({
          label: 'Copy link',
          onClick: () => onCopy(a.id),
        })}
        menu={() => [
          { id: 'end', label: 'End assignment', onClick: vi.fn() },
          { id: 'copy-url', label: 'Copy link', onClick: vi.fn() },
        ]}
        replacedMenuIds={['end', 'reactivate']}
        onBulkDelete={onBulkDelete}
      />
    </RunAssignedResponsesFixture.Provider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('RunAssignedTab', () => {
  it('a Ready class row offers Open for that class, which opens it', async () => {
    renderTab([ma({ periodAccess: { p2: row('P2') } })]);
    const open = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(open);
    expect(actions.openClass).toHaveBeenCalledWith('p2');
  });

  it('an open row offers Monitor, and the menu swaps End for Close and Move to Done', async () => {
    renderTab([ma({ periodAccess: { p2: row('P2', { state: 'open' }) } })]);
    await userEvent.click(screen.getByRole('button', { name: 'Monitor' }));
    expect(onMonitor).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.queryByText('End assignment')).toBeNull();
    expect(screen.getByText('Close')).toBeTruthy();
    expect(screen.getByText('Move to Done')).toBeTruthy();
  });

  it('several classes with classless submissions show the total, not per-class counts', async () => {
    const a = ma({
      periodAccess: {
        p1: row('P1', { state: 'open' }),
        p2: row('P2'),
      },
    });
    renderTab([a], {
      a1: miniAppRowResponses(a, [{}, {}, {}]),
    });
    expect(screen.getByText('3 turned in')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Classes for/ }));
    const p1 = screen.getByText('P1').parentElement as HTMLElement;
    expect(within(p1).getByText('Open')).toBeTruthy();
    expect(screen.queryByText(/of \d+ turned in|0 turned in/)).toBeNull();
  });

  it('a view-only share keeps Copy link and lands in Done once closed', async () => {
    renderTab([ma({ mode: 'view-only' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(onCopy).toHaveBeenCalledWith('a1');
    expect(screen.getByText('Shared, view only')).toBeTruthy();
  });

  it('a closed version-2 run with unpublished submissions stays Active', () => {
    const a = ma({
      status: 'inactive',
      resultsVersion: 2,
      periodAccess: {
        p1: row('P1', { closedAt: NOW - 1000 }),
        p2: row('P2', { closedAt: NOW - 1000 }),
      },
    });
    renderTab([a], { a1: miniAppRowResponses(a, [{}]) });
    expect(screen.getByText('Scores not published')).toBeTruthy();
  });

  it('an ended row from before the Assigned tab is Done', () => {
    renderTab([ma({ status: 'inactive' })]);
    expect(screen.getByText('Nothing active')).toBeTruthy();
  });
});

describe('RunAssignedTab bulk select', () => {
  const two = () => [
    ma({ id: 'a1', periodAccess: { p2: row('P2', { state: 'open' }) } }),
    ma({ id: 'a2', assignmentName: 'Maps app', status: 'paused' }),
  ];

  it('shows no Select without a bulk delete', () => {
    renderTab(two());
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
  });

  it('closes every picked row and offers one Undo', async () => {
    renderTab(
      two(),
      {},
      vi.fn(() => Promise.resolve(0))
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    // Row buttons hide while picking.
    expect(screen.queryByRole('button', { name: 'Monitor' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(actions.closeAll).toHaveBeenCalledTimes(2);
    expect(addToast).toHaveBeenCalledWith(
      '2 assignments closed.',
      'success',
      expect.objectContaining({ label: 'Undo' })
    );
    expect(screen.getByText('0 selected')).toBeTruthy();
  });

  it('deletes only the picked rows and reports failures', async () => {
    const remove = vi.fn((list: MiniAppAssignment[]) =>
      Promise.resolve(list.length - 1)
    );
    renderTab(two(), {}, remove);
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select Maps app' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(remove).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a2' }),
    ]);
    expect(addToast).toHaveBeenCalledWith('1 assignment deleted.', 'success');
  });

  it('Cancel clears the picks and brings the row buttons back', async () => {
    renderTab(
      two(),
      {},
      vi.fn(() => Promise.resolve(0))
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Monitor' })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('miniAppRowResponses', () => {
  it('counts classless submissions against a handled class, so an unopened one stays Ready', () => {
    const out = miniAppRowResponses(
      {
        periodAccess: {
          p1: row('P1'),
          p2: row('P2', { state: 'open' }),
        },
      },
      [{}, {}]
    );
    expect(out.map((r) => r.classId)).toEqual(['p2', 'p2']);
  });

  it('with no class rows every submission counts for the whole line', () => {
    expect(miniAppRowResponses({}, [{}])[0].classId).toBeUndefined();
  });
});
