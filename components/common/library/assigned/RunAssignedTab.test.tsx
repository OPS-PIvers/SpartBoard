import { fireEvent, render, screen, within } from '@testing-library/react';
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
const menuItems = (): string[] => {
  fireEvent.click(screen.getByRole('button', { name: /more/i }));
  return screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
};
const chipItems = (chip: RegExp): string[] => {
  fireEvent.click(screen.getByRole('button', { name: chip }));
  const items = screen
    .getAllByRole('menuitemradio')
    .map((item) => item.textContent ?? '');
  return items;
};
const closeChip = () => fireEvent.keyDown(document, { key: 'Escape' });
const statusItems = () => chipItems(/^Status of/);
const publishItems = () => chipItems(/^Scores for/);
const onMonitor = vi.fn();
const onCopy = vi.fn<(id: string) => void>();

function renderTab(
  assignments: MiniAppAssignment[],
  responses: Record<string, AssignedResponse[]> = {},
  onBulkDelete?: (list: MiniAppAssignment[]) => Promise<number>,
  onBulkPublish?: (list: MiniAppAssignment[]) => void
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
          { id: 'copy-url', label: 'Copy student link', onClick: vi.fn() },
          { id: 'open', label: 'Open app', onClick: vi.fn() },
          { id: 'edit-classes', label: 'Edit classes', onClick: vi.fn() },
          { id: 'end', label: 'End assignment', onClick: vi.fn() },
          { id: 'results', label: 'Results', onClick: vi.fn() },
          { id: 'publish-scores', label: 'Publish scores', onClick: vi.fn() },
          {
            id: 'delete',
            label: 'Delete',
            destructive: true,
            onClick: vi.fn(),
          },
        ]}
        replacedMenuIds={['end', 'reactivate']}
        onBulkDelete={onBulkDelete}
        onBulkPublish={onBulkPublish}
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

  it('an open row offers Monitor on the row, never in the menu', async () => {
    renderTab([ma({ periodAccess: { p2: row('P2', { state: 'open' }) } })]);
    await userEvent.click(screen.getByRole('button', { name: 'Monitor' }));
    expect(onMonitor).toHaveBeenCalled();
    expect(menuItems()).toEqual([
      'Copy student link',
      'Open app',
      'Edit classes',
      'Move to Finished',
      'Delete',
    ]);
  });

  it('a not yet opened row keeps links and settings', () => {
    renderTab([ma({ periodAccess: { p2: row('P2') } })]);
    expect(menuItems()).toEqual([
      'Copy student link',
      'Open app',
      'Edit classes',
      'Move to Finished',
      'Delete',
    ]);
  });

  it('a row with several classes moves Closed to the status chip, and Reopen once all are closed', () => {
    renderTab([
      ma({
        periodAccess: {
          p1: row('P1', { state: 'open' }),
          p2: row('P2', { closedAt: NOW - 1000 }),
        },
      }),
    ]);
    expect(menuItems()).toEqual([
      'Copy student link',
      'Open app',
      'Edit classes',
      'Move to Finished',
      'Delete',
    ]);
    fireEvent.click(document.body);
    expect(statusItems()).toEqual(['Open', 'Closed']);
  });

  it('all closed and Active: no links or settings; the chips publish and reopen', () => {
    const a = ma({
      status: 'inactive',
      resultsVersion: 2,
      periodAccess: {
        p1: row('P1', { closedAt: NOW - 1000 }),
        p2: row('P2', { closedAt: NOW - 1000 }),
      },
    });
    renderTab([a], { a1: miniAppRowResponses(a, [{}]) });
    expect(menuItems()).toEqual(['Move to Finished', 'Delete']);
    fireEvent.click(document.body);
    expect(statusItems()).toEqual(['Reopen', 'Closed']);
    closeChip();
    expect(publishItems()).toEqual(['Not published', 'Published']);
  });

  it('an open row with a closed class keeps Reopen out of its menus', async () => {
    renderTab([
      ma({
        periodAccess: {
          p1: row('P1', { closedAt: NOW - 1000 }),
          p2: row('P2', { closedAt: NOW - 1000 }),
          p3: row('P3', { state: 'open' }),
        },
      }),
    ]);
    statusItems();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Open' }));
    expect(actions.openClass).not.toHaveBeenCalled();
    fireEvent.click(document.body);
    await userEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.queryByRole('menuitem', { name: 'Reopen' })).toBeNull();
  });

  it('Reopen from the status chip asks which class and reopens it for everyone', async () => {
    renderTab([
      ma({
        periodAccess: {
          p1: row('P1', { closedAt: NOW - 1000 }),
          p2: row('P2', { closedAt: NOW - 1000 }),
        },
      }),
    ]);
    statusItems();
    await userEvent.click(
      screen.getByRole('menuitemradio', { name: 'Reopen' })
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('radio', { name: 'Everyone in the class' })
    ).toBeTruthy();
    expect(within(dialog).queryByRole('radio', { name: /chosen/ })).toBeNull();
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Class' }),
      'p2'
    );
    expect(
      within(dialog)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['P1', 'P2']);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Reopen' })
    );
    expect(actions.reopenClass).toHaveBeenCalledWith('p2');
  });

  it('a Finished row keeps Delete in the menu and Reopen and Publish in its chips', async () => {
    renderTab([
      ma({
        status: 'inactive',
        doneAt: NOW - 500,
        periodAccess: { p1: row('P1', { closedAt: NOW - 1000 }) },
      } as Partial<MiniAppAssignment>),
    ]);
    await userEvent.click(screen.getByRole('button', { name: /^Finished/ }));
    expect(menuItems()).toEqual(['Delete']);
    fireEvent.click(document.body);
    expect(statusItems()).toEqual(['Reopen', 'Closed']);
    closeChip();
    expect(publishItems()).toEqual(['Not published', 'Published']);
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
    expect(screen.getByText('3 turned in · 1 class to go')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Details for/ }));
    const p1 = screen.getAllByText('P1').find((el) => el.tagName !== 'OPTION')
      ?.parentElement as HTMLElement;
    expect(within(p1).getByText('Open')).toBeTruthy();
    expect(screen.queryByText(/of \d+ turned in|0 turned in/)).toBeNull();
  });

  it('a view-only share keeps Copy link and lands in Finished once closed', async () => {
    renderTab([ma({ mode: 'view-only' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(onCopy).toHaveBeenCalledWith('a1');
    expect(screen.getByText('View only')).toBeTruthy();
  });

  it('a view-only share keeps only Delete while open, and Reopen once closed', () => {
    const { unmount } = renderTab([ma({ mode: 'view-only' })]);
    expect(menuItems()).toEqual(['Delete']);
    unmount();
    renderTab([ma({ mode: 'view-only', status: 'inactive' })]);
    fireEvent.click(screen.getByRole('button', { name: /^Finished/ }));
    expect(menuItems()).toEqual(['Delete']);
    fireEvent.click(document.body);
    expect(statusItems()).toEqual(['Reopen', 'Closed']);
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
    expect(screen.getByText('1 turned in')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Finished/ })).toBeNull();
  });

  it('an ended row from before the Assigned tab is Finished', () => {
    renderTab([ma({ status: 'inactive' })]);
    expect(screen.getByText('Nothing active')).toBeTruthy();
  });
});

describe('RunAssignedTab bulk select', () => {
  const two = () => [
    ma({ id: 'a1', periodAccess: { p2: row('P2', { state: 'open' }) } }),
    ma({ id: 'a2', assignmentName: 'Maps app', status: 'active' }),
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

  it('publishes only the closed rows and counts the rest as skipped', async () => {
    const publish = vi.fn();
    renderTab(
      [
        ma({
          id: 'c1',
          assignmentName: 'Closed app',
          status: 'inactive',
        }),
        ...two(),
      ],
      {},
      vi.fn(() => Promise.resolve(0)),
      publish
    );
    await userEvent.click(screen.getByRole('button', { name: /^Finished/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Publish scores' })
    );
    expect(publish).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'c1' }),
    ]);
    expect(addToast).toHaveBeenCalledWith(
      '2 assignments were skipped. They are not closed yet.',
      'info'
    );
  });

  it('leaves already-published rows out of Publish scores', async () => {
    renderTab(
      [ma({ id: 'p1', status: 'inactive', scoreVisibility: 'score-only' })],
      {},
      vi.fn(() => Promise.resolve(0)),
      vi.fn()
    );
    await userEvent.click(screen.getByRole('button', { name: /^Finished/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.queryByRole('button', { name: 'Publish scores' })).toBeNull();
  });

  it('offers no Publish scores when every pick is open', async () => {
    renderTab(
      two(),
      {},
      vi.fn(() => Promise.resolve(0)),
      vi.fn()
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.queryByRole('button', { name: 'Publish scores' })).toBeNull();
  });

  it('offers no Move to Finished for a view-only share', async () => {
    renderTab(
      [ma({ id: 'v1', mode: 'view-only' })],
      {},
      vi.fn(() => Promise.resolve(0))
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(
      screen.queryByRole('button', { name: 'Move to Finished' })
    ).toBeNull();
  });

  it('Cancel clears the picks and brings the row buttons back', async () => {
    renderTab(
      two(),
      {},
      vi.fn(() => Promise.resolve(0))
    );
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getAllByRole('button', { name: 'Monitor' })).toHaveLength(2);
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
