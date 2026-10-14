import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WebcamWidget } from './Widget';
import type { WidgetData } from '@/types';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature: () => false }),
}));
vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({
    addWidget: vi.fn(),
    addToast: vi.fn(),
    updateWidget: vi.fn(),
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }),
}));

const widget = {
  id: 'w1',
  type: 'webcam',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: false,
  config: {},
} as unknown as WidgetData;

const makeStream = (deviceId: string) =>
  ({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [{ getSettings: () => ({ deviceId }) }],
  }) as unknown as MediaStream;

describe('WebcamWidget camera acquisition', () => {
  const getUserMedia =
    vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>();
  const enumerateDevices = vi.fn();

  beforeEach(() => {
    getUserMedia.mockReset();
    enumerateDevices.mockReset();
    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-a', label: 'A' },
      { kind: 'videoinput', deviceId: 'cam-b', label: 'B' },
    ]);
    getUserMedia.mockImplementation((c: MediaStreamConstraints) =>
      Promise.resolve(
        makeStream(
          (c.video as MediaTrackConstraints).deviceId
            ? ((c.video as MediaTrackConstraints).deviceId as { exact: string })
                .exact
            : 'cam-a'
        )
      )
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia, enumerateDevices },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the camera once on first load', async () => {
    render(<WebcamWidget widget={widget} />);
    await waitFor(() => expect(enumerateDevices).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTitle('Switch Camera')).toBeTruthy()
    );
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('switches to the other camera on the first click', async () => {
    render(<WebcamWidget widget={widget} />);
    const btn = await screen.findByTitle('Switch Camera');
    fireEvent.click(btn);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(getUserMedia.mock.calls[1][0].video).toEqual({
      deviceId: { exact: 'cam-b' },
    });
  });
});
