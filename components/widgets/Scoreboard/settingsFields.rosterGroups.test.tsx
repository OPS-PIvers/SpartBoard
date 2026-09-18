/**
 * Scoreboard × saved class groups
 * (docs/plans/ROSTER_GROUPS_INTEGRATION.md D17/D20).
 *
 * Seed-once-then-independent is the whole point of the design, so the two
 * assertions that matter are that an import never projects a group's private
 * name by default, and that a re-sync moves membership without touching a
 * score a team has already earned.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ScoreboardSettings } from './settingsFields';
import { useDashboard } from '@/context/useDashboard';
import type { ScoreboardConfig, ScoreboardTeam, WidgetData } from '@/types';

vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => true }),
}));
vi.mock('@/hooks/useRosterGroupsIntegrationSettings', () => ({
  useRosterGroupsIntegrationSettings: () => ({ enabled: true }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));

const updateWidget = vi.fn();
const addToast = vi.fn();

const roster = {
  id: 'roster-1',
  name: 'Period 3',
  students: [
    { id: 's1', firstName: 'Ana', lastName: 'B' },
    { id: 's2', firstName: 'Cy', lastName: 'D' },
    { id: 's3', firstName: 'Eve', lastName: 'F' },
  ],
  groups: [
    { id: 'g1', name: 'Tier 3 Intervention', studentIds: ['s1', 's2'] },
    { id: 'g2', name: 'Enrichment', studentIds: ['s3', 'left-the-class'] },
  ],
};

const widgetWith = (config: Partial<ScoreboardConfig>): WidgetData =>
  ({
    id: 'scoreboard-1',
    type: 'scoreboard',
    config: { teams: [], ...config },
  }) as unknown as WidgetData;

const lastTeams = (): ScoreboardTeam[] => {
  const calls = updateWidget.mock.calls;
  if (calls.length === 0) throw new Error('updateWidget was never called');
  const config = (
    calls[calls.length - 1] as [string, { config: ScoreboardConfig }]
  )[1].config;
  return config.teams ?? [];
};

beforeEach(() => {
  vi.clearAllMocks();
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    updateWidget,
    addToast,
    updateDashboard: vi.fn(),
    activeDashboard: { widgets: [] },
    rosters: [roster],
    activeRosterId: 'roster-1',
  });
});

describe('Scoreboard — import class groups', () => {
  it('names the teams generically and never from the group', async () => {
    render(<ScoreboardSettings widget={widgetWith({})} />);
    fireEvent.click(screen.getByText('Make 2 teams from class groups'));
    await vi.waitFor(() => expect(updateWidget).toHaveBeenCalled());

    const teams = lastTeams();
    expect(teams.map((team) => team.name)).toEqual(['Team 1', 'Team 2']);
    // The reason the checkbox defaults off: this name is projected.
    expect(JSON.stringify(teams)).not.toContain('Tier 3 Intervention');
  });

  it('uses the group names only when the teacher opts in', async () => {
    render(<ScoreboardSettings widget={widgetWith({})} />);
    fireEvent.click(screen.getByLabelText('Use group names as team names'));
    fireEvent.click(screen.getByText('Make 2 teams from class groups'));
    await vi.waitFor(() => expect(updateWidget).toHaveBeenCalled());

    expect(lastTeams().map((team) => team.name)).toEqual([
      'Tier 3 Intervention',
      'Enrichment',
    ]);
  });

  it('seeds membership from the group, skipping students off the roster', async () => {
    render(<ScoreboardSettings widget={widgetWith({})} />);
    fireEvent.click(screen.getByText('Make 2 teams from class groups'));
    await vi.waitFor(() => expect(updateWidget).toHaveBeenCalled());

    const teams = lastTeams();
    expect(teams[0].memberStudentIds).toEqual(['s1', 's2']);
    expect(teams[0].linkedRosterGroupId).toBe('g1');
    expect(teams[1].memberStudentIds).toEqual(['s3']);
  });
});

describe('Scoreboard — re-sync members', () => {
  const seeded: ScoreboardTeam[] = [
    {
      id: 't1',
      name: 'Team 1',
      score: 7,
      linkedRosterGroupId: 'g1',
      memberStudentIds: ['s1'],
    },
    {
      id: 't2',
      name: 'Team 2',
      score: 3,
      linkedRosterGroupId: 'gone',
      memberStudentIds: ['s3'],
    },
  ];

  it('refreshes membership while leaving names and scores alone', () => {
    render(<ScoreboardSettings widget={widgetWith({ teams: seeded })} />);
    fireEvent.click(screen.getByText('Re-sync members from class'));

    const teams = lastTeams();
    expect(teams[0].memberStudentIds).toEqual(['s1', 's2']);
    expect(teams[0].score).toBe(7);
    expect(teams[0].name).toBe('Team 1');
  });

  it('keeps a team whose group was deleted, dropping only the dead link', () => {
    render(<ScoreboardSettings widget={widgetWith({ teams: seeded })} />);
    fireEvent.click(screen.getByText('Re-sync members from class'));

    const orphan = lastTeams()[1];
    expect(orphan.score).toBe(3);
    expect(orphan.linkedRosterGroupId).toBeUndefined();
  });

  it('offers no re-sync until something is linked', () => {
    render(
      <ScoreboardSettings
        widget={widgetWith({ teams: [{ id: 't1', name: 'Team 1', score: 0 }] })}
      />
    );
    expect(screen.queryByText('Re-sync members from class')).toBeNull();
  });
});
