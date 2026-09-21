import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { MusicStationField } from './settingsFields';

vi.mock('@/hooks/useMusicStations', () => ({
  useMusicStations: () => ({ stations: [], isLoading: false }),
}));

vi.mock('./PersonalSpotifyPanel', () => ({
  PersonalSpotifyPanel: () => <div data-testid="personal-spotify-panel" />,
}));

const makeCtx = (canUsePersonalSpotify: boolean) =>
  ({
    config: { source: 'personal' },
    widget: { id: 'w1', type: 'music', config: { source: 'personal' } },
    profileLoaded: true,
    canAccessFeature: () => canUsePersonalSpotify,
    t: (key: string) => key,
    id: 'station',
    labelId: 'station-label',
    updateConfig: vi.fn(),
  }) as unknown as CustomRenderCtx;

describe('MusicStationField', () => {
  it('shows the personal Spotify panel when the feature is allowed', () => {
    render(<MusicStationField ctx={makeCtx(true)} />);
    expect(screen.getByTestId('personal-spotify-panel')).toBeInTheDocument();
  });

  it('falls back to curated stations when personal Spotify is revoked', () => {
    render(<MusicStationField ctx={makeCtx(false)} />);
    expect(
      screen.queryByTestId('personal-spotify-panel')
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('widgetSettings.music.noStations')
    ).toBeInTheDocument();
  });
});
