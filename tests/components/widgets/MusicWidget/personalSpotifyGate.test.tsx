import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MusicSettings } from '@/components/widgets/MusicWidget/Settings';
import { MusicWidget } from '@/components/widgets/MusicWidget/Widget';
import type { WidgetData } from '@/types';

// Replace `useAuth` so we can flip `canAccessFeature` per test without
// spinning up the full AuthProvider.
const canAccessFeatureMock = vi.fn<(featureId: string) => boolean>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: canAccessFeatureMock,
    selectedBuildings: [],
  }),
}));

// MusicSettings calls useDashboard().updateWidget; mock it minimally.
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ updateWidget: vi.fn() }),
}));

// useMusicStations hits Firestore; mock it so tests stay unit-level.
vi.mock('@/hooks/useMusicStations', () => ({
  useMusicStations: () => ({ stations: [], isLoading: false }),
}));

// PersonalSpotifyPlayer uses the Web Playback SDK; mock it to a simple sentinel.
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyPlayer', () => ({
  PersonalSpotifyPlayer: () => <div data-testid="personal-player" />,
}));

const baseWidget: WidgetData = {
  id: 'w1',
  type: 'music',
  x: 0,
  y: 0,
  w: 300,
  h: 200,
  z: 1,
  flipped: false,
  minimized: false,
  config: { source: 'curated' },
};

beforeEach(() => {
  vi.clearAllMocks();
  canAccessFeatureMock.mockReset();
});

describe('MusicWidget Settings — personal Spotify gate', () => {
  it('shows the Source toggle when canAccessFeature("personal-spotify") returns true', () => {
    canAccessFeatureMock.mockReturnValue(true);
    render(<MusicSettings widget={baseWidget} />);
    expect(screen.getByText(/source/i)).toBeInTheDocument();
    // The "My Spotify" option label should be reachable when the toggle is rendered.
    expect(screen.getByText(/my spotify/i)).toBeInTheDocument();
  });

  it('hides the Source toggle entirely when canAccessFeature returns false', () => {
    canAccessFeatureMock.mockReturnValue(false);
    render(<MusicSettings widget={baseWidget} />);
    expect(screen.queryByText(/source/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/my spotify/i)).not.toBeInTheDocument();
  });
});

describe('MusicWidget render dispatch — personal Spotify gate', () => {
  it('renders the personal player when source=personal AND canAccessFeature is true', () => {
    canAccessFeatureMock.mockReturnValue(true);
    render(
      <MusicWidget widget={{ ...baseWidget, config: { source: 'personal' } }} />
    );
    expect(screen.getByTestId('personal-player')).toBeInTheDocument();
  });

  it('renders the curated body when source=personal but canAccessFeature is false', () => {
    canAccessFeatureMock.mockReturnValue(false);
    render(
      <MusicWidget widget={{ ...baseWidget, config: { source: 'personal' } }} />
    );
    // The personal player must NOT be mounted — transparent fallback per spec.
    expect(screen.queryByTestId('personal-player')).not.toBeInTheDocument();
  });

  it('renders the curated body when source=curated regardless of gate', () => {
    canAccessFeatureMock.mockReturnValue(true);
    render(
      <MusicWidget widget={{ ...baseWidget, config: { source: 'curated' } }} />
    );
    expect(screen.queryByTestId('personal-player')).not.toBeInTheDocument();
  });
});
