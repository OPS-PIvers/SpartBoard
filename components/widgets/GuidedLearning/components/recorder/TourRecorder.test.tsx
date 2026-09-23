import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourRecorder } from './TourRecorder';
import type { TourRecording } from './useTourCapture';

const h = vi.hoisted(() => ({
  pillVisibility: [] as string[],
  grabFrame: vi.fn(),
}));

vi.mock('../../utils/displayCapture', () => ({
  canCaptureDisplay: () => true,
  grabFrame: h.grabFrame,
}));

const stopTrack = vi.fn();
const mockStream = (displaySurface: string) => {
  const track = {
    getSettings: () => ({ displaySurface }),
    stop: stopTrack,
    onended: null,
  };
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
};

const getDisplayMedia = vi.fn();

beforeEach(() => {
  h.pillVisibility = [];
  h.grabFrame.mockReset();
  h.grabFrame.mockImplementation(() => {
    h.pillVisibility.push(screen.getByTestId('tour-recorder').style.visibility);
    return Promise.resolve(new Blob(['frame']));
  });
  getDisplayMedia.mockReset();
  stopTrack.mockReset();
  vi.stubGlobal('navigator', {
    ...navigator,
    userAgentData: { brands: [{ brand: 'Chromium' }] },
    mediaDevices: { getDisplayMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(
    window.innerWidth
  );
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(
    window.innerHeight
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
};

const renderRecorder = (onFinish = vi.fn()) => {
  render(
    <>
      <button data-tour="sidebar.boards">Boards</button>
      <TourRecorder available onFinish={onFinish} onDiscard={vi.fn()} />
    </>
  );
  return onFinish;
};

describe('TourRecorder', () => {
  it('cannot start until recording is available', () => {
    render(<TourRecorder onFinish={vi.fn()} onDiscard={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
    expect(
      screen.getByText('Recording opens once slide redaction is ready.')
    ).toBeInTheDocument();
  });

  it('refuses a shared window or screen', async () => {
    getDisplayMedia.mockResolvedValue(mockStream('window'));
    renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await settle();
    expect(stopTrack).toHaveBeenCalled();
    expect(
      screen.getByText('Share this tab, not a window or screen, to record.')
    ).toBeInTheDocument();
  });

  it('asks for this tab without the pointer', async () => {
    getDisplayMedia.mockResolvedValue(mockStream('browser'));
    renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await settle();
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: { cursor: 'never' },
        preferCurrentTab: true,
      })
    );
    expect(screen.getByText('Recording · 0 steps')).toBeInTheDocument();
  });

  it('records a step per click with the pill hidden from the frame', async () => {
    getDisplayMedia.mockResolvedValue(mockStream('browser'));
    const onFinish = renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await settle();

    fireEvent.pointerDown(screen.getByText('Boards'), { button: 0 });
    await settle();
    expect(h.pillVisibility).toEqual(['hidden']);
    expect(screen.getByTestId('tour-recorder').style.visibility).toBe('');
    expect(screen.getByText('Recording · 1 step')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pause' }), {
      button: 0,
    });
    await settle();
    expect(h.grabFrame).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    const recording = onFinish.mock.calls[0][0] as TourRecording;
    expect(recording.frames).toHaveLength(1);
    expect(recording.steps[0]).toMatchObject({
      tour: { anchor: 'sidebar.boards', action: 'click' },
      frameIndex: 0,
      untagged: false,
    });
    expect(stopTrack).toHaveBeenCalled();
  });
});
