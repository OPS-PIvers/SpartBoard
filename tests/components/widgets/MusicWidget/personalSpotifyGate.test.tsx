import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MusicWidget } from '@/components/widgets/MusicWidget/Widget';
import musicSchema from '@/components/widgets/MusicWidget/settings.schema';
import type { Field, FieldCtx } from '@/components/settings/schema/types';
import type { WidgetData } from '@/types';

// Replace `useAuth` so we can flip `canAccessFeature` per test without
// spinning up the full AuthProvider.
const canAccessFeatureMock = vi.fn<(featureId: string) => boolean>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: canAccessFeatureMock,
    // profileLoaded must be true so the optimistic-render gate logic in
    // Widget.tsx and the settings schema can produce a definitive denial when
    // canAccessFeature returns false. Without it, gateDenied is always false
    // (profile hasn't "loaded") and the gate never fires in tests.
    profileLoaded: true,
    selectedBuildings: [],
  }),
}));

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

describe('MusicWidget settings schema — personal Spotify gate', () => {
  const sourceField = musicSchema.groups
    .flatMap((group) => group.fields as ReadonlyArray<Field>)
    .find((field) => field.key === 'source');

  const fieldContext = (allowed: boolean): FieldCtx => ({
    config: baseWidget.config as Record<string, unknown>,
    widget: baseWidget,
    isAdmin: false,
    profileLoaded: true,
    canAccessFeature: () => allowed,
    t: (key) => key,
  });

  it('shows the Source control when personal Spotify is allowed', () => {
    expect(sourceField?.visibleWhen?.(fieldContext(true))).toBe(true);
  });

  it('hides the Source control when personal Spotify is denied', () => {
    expect(sourceField?.visibleWhen?.(fieldContext(false))).toBe(false);
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
