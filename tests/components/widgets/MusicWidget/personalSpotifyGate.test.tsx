import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MusicSettings } from '@/components/widgets/MusicWidget/Settings';
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
