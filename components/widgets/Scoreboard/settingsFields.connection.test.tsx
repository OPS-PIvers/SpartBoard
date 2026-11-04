import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ScoreboardSettings } from './settingsFields';
import { useDashboard } from '@/context/useDashboard';
import { AuthContext } from '@/context/AuthContextValue';
import { connectionsUi } from '@/context/connectionsUiStore';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { WidgetData, WidgetConnection } from '@/types';

vi.mock('@/context/useDashboard');
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => false,
    featurePermissions: [{ widgetType: 'random', displayName: 'Group Maker' }],
  }),
}));
vi.mock('@/hooks/useRosterGroupsIntegrationSettings', () => ({
  useRosterGroupsIntegrationSettings: () => ({ enabled: false }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));

const scoreboard = {
  id: 'sb',
  type: 'scoreboard',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: true,
  config: {
    teams: [{ id: 'group-a', name: 'Group 1', score: 2, linkedGroupId: 'a' }],
  },
} as unknown as WidgetData;
const randomizer = {
  ...scoreboard,
  id: 'rnd',
  type: 'random',
  config: { lastResult: [{ id: 'a', names: ['Ana'] }] },
} as unknown as WidgetData;
const follow: WidgetConnection = {
  id: 'f1',
  kind: 'follow',
  leaderId: 'rnd',
  followerId: 'sb',
};

const renderWith = (
  connectionsOn: boolean,
  connections: WidgetConnection[]
) => {
  vi.mocked(useDashboard).mockReturnValue({
    updateWidget: vi.fn(),
    updateDashboard: vi.fn(),
    addToast: vi.fn(),
    rosters: [],
    activeRosterId: null,
    activeDashboard: {
      id: 'board',
      widgets: [randomizer, scoreboard],
      connections,
    },
  } as unknown as ReturnType<typeof useDashboard>);
  const auth = {
    canAccessFeature: () => connectionsOn,
  } as unknown as AuthContextType;
  return render(
    <AuthContext.Provider value={auth}>
      <ScoreboardSettings widget={scoreboard} />
    </AuthContext.Provider>
  );
};

describe('ScoreboardSettings connected to a Randomizer', () => {
  beforeEach(() => connectionsUi.set({ editor: null, connectMode: null }));

  it('replaces Import and team add/delete with the connected row', () => {
    renderWith(true, [follow]);
    expect(screen.getByText('Teams come from Group Maker')).toBeInTheDocument();
    expect(screen.queryByTestId('import-groups-btn')).toBeNull();
    expect(screen.queryByText('Add Team')).toBeNull();
    fireEvent.click(screen.getByText('Edit connection'));
    expect(connectionsUi.get().editor).toMatchObject({
      boardId: 'board',
      replaces: ['f1'],
    });
  });

  it('keeps the old Import card when the flag is off', () => {
    renderWith(false, [follow]);
    expect(screen.queryByText(/Teams come from/)).toBeNull();
    expect(screen.getByTestId('import-groups-btn')).toBeInTheDocument();
  });

  it('keeps the old Import card when nothing is connected', () => {
    renderWith(true, []);
    expect(screen.getByTestId('import-groups-btn')).toBeInTheDocument();
  });
});
