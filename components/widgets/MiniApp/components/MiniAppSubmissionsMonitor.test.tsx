// Older Mini App submissions behind monitor-parity: names, Not started / Done counts, class picker.
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClassRoster, MiniAppSession, PeriodAccess } from '@/types';
import type { StudentName } from '@/hooks/useAssignmentPseudonyms';
import { MiniAppSubmissionsMonitor } from './MiniAppSubmissionsMonitor';

const { rosters, classMaps } = vi.hoisted(() => ({
  rosters: [] as Partial<ClassRoster>[],
  classMaps: new Map<
    string,
    Map<string, { givenName: string; familyName: string }>
  >(),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn(), rosters }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  formatStudentName: (n?: StudentName) =>
    n ? `${n.givenName} ${n.familyName}`.trim() : '',
  useAssignmentPseudonymsMulti: (_id: string | null, ids: string[] | null) => ({
    byAssignmentPseudonym: classMaps.get(ids?.[0] ?? '') ?? new Map(),
    loading: false,
  }),
}));
vi.mock('@/hooks/useServerNow', () => ({ useServerNow: () => 1_000 }));

const name = (givenName: string, familyName: string): StudentName => ({
  givenName,
  familyName,
});
const ALL = new Map([
  ['p-ava', name('Ava', 'Martinez')],
  ['p-ben', name('Ben', 'Okafor')],
  ['p-cat', name('Cat', 'Nguyen')],
]);

const session = (over: Partial<MiniAppSession> = {}): MiniAppSession => ({
  id: 's1',
  appId: 'app-1',
  appTitle: 'Fractions',
  appHtml: '',
  teacherUid: 't1',
  assignmentName: 'Fractions',
  status: 'active',
  createdAt: 0,
  ...over,
});

const subs = [
  { id: 'p-ava', submittedAt: 2_000, payload: { score: 4 } },
  { id: 'anon-xyz', submittedAt: 1_000, payload: { score: 2 } },
];

const renderMonitor = (s: MiniAppSession, names = ALL) =>
  render(
    <MiniAppSubmissionsMonitor
      session={s}
      assignmentName="Fractions pizza"
      submissions={subs}
      loading={false}
      error={null}
      names={names}
      namesLoading={false}
      orgId="org"
      onClose={vi.fn()}
    />
  );

describe('MiniAppSubmissionsMonitor', () => {
  it('counts Not started and Done, and never shows raw ids', () => {
    renderMonitor(session());
    const buckets = screen.getByRole('group', { name: 'Student status' });
    expect(
      within(buckets).getByRole('button', { name: /2\s*Done/ })
    ).toBeVisible();
    expect(
      within(buckets).getByRole('button', { name: /2\s*Not started/ })
    ).toBeVisible();
    expect(screen.getByText('Ava Martinez')).toBeVisible();
    expect(screen.getByText('Student 1')).toBeVisible();
    expect(screen.queryByText('anon-xyz')).toBeNull();
  });

  it('lists who has not started, by last name', () => {
    renderMonitor(session());
    fireEvent.click(screen.getByRole('button', { name: /Not started/ }));
    const names = screen
      .getAllByText(/Okafor|Nguyen/)
      .map((el) => el.textContent);
    expect(names).toEqual(['Cat Nguyen', 'Ben Okafor']);
  });

  it('keeps the submitted data one tap away', () => {
    renderMonitor(session());
    expect(screen.queryByText(/"score": 4/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ava Martinez/ }));
    expect(screen.getByText(/"score": 4/)).toBeVisible();
  });

  it('shows only Done when no class roster is known', () => {
    renderMonitor(session(), new Map());
    expect(screen.queryByRole('button', { name: /Not started/ })).toBeNull();
    expect(screen.getByRole('button', { name: /2\s*Done/ })).toBeVisible();
  });

  it('filters by the picked class', () => {
    rosters.splice(
      0,
      rosters.length,
      { id: 'r1', name: 'Period 1', classlinkClassId: 'cl-1' },
      { id: 'r2', name: 'Period 3', classlinkClassId: 'cl-3' }
    );
    classMaps.set('cl-3', new Map([['p-ben', name('Ben', 'Okafor')]]));
    renderMonitor(session({ rosterIds: ['r1', 'r2'] }));
    const picker = screen.getByRole('combobox', { name: 'Class' });
    expect(
      within(picker).getByRole('option', { name: 'Period 1 · Live' })
    ).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: 'Period 3' } });
    expect(screen.getByRole('button', { name: /0\s*Done/ })).toBeVisible();
    expect(
      screen.getByRole('button', { name: /1\s*Not started/ })
    ).toBeVisible();
  });

  it('uses the period picker for per-period sessions', () => {
    const period = (
      label: string,
      state: PeriodAccess['state']
    ): PeriodAccess => ({
      state,
      openAt: null,
      closeAt: null,
      bellPeriodId: null,
      verified: true,
      label,
    });
    render(
      <MiniAppSubmissionsMonitor
        session={session({
          periodAccess: {
            'cl-1': period('P1', 'open'),
            'cl-3': period('P3', 'closed'),
          },
        })}
        assignmentName="Fractions pizza"
        submissions={subs}
        loading={false}
        error={null}
        names={ALL}
        namesLoading={false}
        periodActions={{} as never}
        orgId="org"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('1 of 2 live')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: 'cl-3' },
    });
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible();
  });
});
