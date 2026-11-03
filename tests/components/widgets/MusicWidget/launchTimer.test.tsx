import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MusicWidget } from '@/components/widgets/MusicWidget/Widget';
import type { WidgetData } from '@/types';

const canAccessFeature = vi.fn<(id: string) => boolean>();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature,
    canAccessWidget: () => true,
    profileLoaded: true,
  }),
}));

const addWidget = vi.fn<(type: string, overrides: { id: string }) => void>();
const updateWidget = vi.fn();
const updateDashboard = vi.fn();
let boardWidgets: WidgetData[] = [];
let readOnly = false;
let stationUrl = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: boardWidgets },
    addWidget,
    updateWidget,
    updateDashboard,
    isActiveBoardReadOnly: readOnly,
  }),
}));

vi.mock('@/hooks/useMusicStations', () => ({
  useMusicStations: () => ({
    stations: [
      {
        id: 's1',
        title: 'Lo-fi',
        channel: 'Channel',
        url: stationUrl,
        thumbnail: '',
        color: '#000',
        isActive: true,
        order: 0,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/utils/youtube', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/youtube')>()),
  loadYouTubeApi: vi.fn(),
}));

const music = (config: Record<string, unknown> = {}): WidgetData => ({
  id: 'm1',
  type: 'music',
  x: 10,
  y: 20,
  w: 300,
  h: 200,
  z: 1,
  flipped: false,
  config: { source: 'curated', stationId: 's1', ...config },
});

const timer = (id: string) =>
  ({ id, type: 'time-tool', config: { isRunning: false } }) as WidgetData;

beforeEach(() => {
  vi.clearAllMocks();
  canAccessFeature.mockImplementation((id) => id !== 'widget-connections');
  boardWidgets = [];
  readOnly = false;
  stationUrl = 'https://www.youtube.com/watch?v=jfKfPfyJRdk';
});

const button = () =>
  screen.queryByRole('button', { name: 'Add a linked timer' });

describe('Music launch timer button', () => {
  it('opens a Timer beside the widget and links it', () => {
    render(<MusicWidget widget={music()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a linked timer' }));
    const [type, overrides] = addWidget.mock.calls[0];
    expect(type).toBe('time-tool');
    expect(overrides).toMatchObject({ x: 330, y: 20 });
    expect(updateWidget).toHaveBeenCalledWith(
      'm1',
      { config: { syncWithTimeTool: true, linkedTimerId: overrides.id } },
      { skipHistory: true }
    );
  });

  it('with Connections on, makes the new Timer the one Music Follows', () => {
    canAccessFeature.mockImplementation((id) => id === 'widget-connections');
    render(<MusicWidget widget={music()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a linked timer' }));
    const [, overrides] = addWidget.mock.calls[0];
    expect(updateWidget).not.toHaveBeenCalled();
    expect(updateDashboard).toHaveBeenCalledWith({
      connections: [
        expect.objectContaining({
          kind: 'follow',
          leaderId: overrides.id,
          followerId: 'm1',
        }),
      ],
    });
  });

  it('is hidden on a read-only board', () => {
    readOnly = true;
    render(<MusicWidget widget={music()} />);
    expect(button()).toBeNull();
  });

  it('is hidden once synced with a Timer on the board', () => {
    boardWidgets = [timer('t1')];
    render(
      <MusicWidget
        widget={music({ syncWithTimeTool: true, linkedTimerId: 't1' })}
      />
    );
    expect(button()).toBeNull();
  });

  it('shows again when the synced Timer is removed', () => {
    render(
      <MusicWidget
        widget={music({ syncWithTimeTool: true, linkedTimerId: 't1' })}
      />
    );
    expect(button()).not.toBeNull();
  });

  it('is hidden on a Spotify station, which cannot sync', () => {
    stationUrl = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
    render(<MusicWidget widget={music()} />);
    expect(button()).toBeNull();
  });
});
