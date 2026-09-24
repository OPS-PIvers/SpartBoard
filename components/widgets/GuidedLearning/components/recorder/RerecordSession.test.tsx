import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RerecordSession } from './RerecordSession';
import type { TourRecording } from './useTourCapture';

const h = vi.hoisted(() => ({
  upload: vi.fn(),
  recording: null as unknown,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadGuidedLearningImage: h.upload }),
}));
vi.mock('@/utils/guidedLearningMedia', () => ({
  prepareImageForUpload: (file: File) => Promise.resolve(file),
}));
vi.mock('../../utils/redactImage', () => ({ redactImage: vi.fn() }));
vi.mock('./TourRecorder', () => ({
  TourRecorder: ({
    single,
    onFinish,
    onDiscard,
  }: {
    single?: boolean;
    onFinish: (r: TourRecording) => void;
    onDiscard: () => void;
  }) => (
    <div>
      <span>{single ? 'single mode' : 'full mode'}</span>
      <button
        type="button"
        onClick={() => onFinish(h.recording as TourRecording)}
      >
        Stub click
      </button>
      <button type="button" onClick={onDiscard}>
        Stub cancel
      </button>
    </div>
  ),
}));

const FRAME = new Blob(['frame'], { type: 'image/png' });
const EXTRA = new Blob(['late click'], { type: 'image/png' });
const BOX = { xPct: 5, yPct: 5, wPct: 10, hPct: 3 };

const captured = (): TourRecording => ({
  frames: [FRAME, EXTRA],
  redactions: [[BOX], []],
  steps: [
    {
      id: 'rec-1',
      xPct: 30,
      yPct: 20,
      region: { shape: 'rect', wPct: 5, hPct: 4 },
      tour: { anchor: 'widget.close', action: 'click' },
      frameIndex: 0,
      untagged: false,
    },
    {
      id: 'rec-2',
      xPct: 1,
      yPct: 1,
      region: { shape: 'rect', wPct: 1, hPct: 1 },
      tour: { anchor: 'sidebar.boards', action: 'click' },
      frameIndex: 1,
      untagged: false,
    },
  ],
});

const renderSession = () => {
  const onDone = vi.fn();
  render(
    <RerecordSession
      target={{ setId: 'set-1', stepId: 'step-4' }}
      onDone={onDone}
    />
  );
  return onDone;
};

const uploadButton = () =>
  screen.getByRole('button', { name: 'Upload and open in Studio' });

beforeEach(() => {
  h.upload.mockReset();
  h.recording = captured();
});

describe('RerecordSession', () => {
  it('reviews the one captured frame before anything uploads', () => {
    renderSession();
    expect(screen.getByText('single mode')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Stub click'));
    expect(
      screen.getByRole('dialog', {
        name: 'Check every frame before it uploads',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Frame 1 of 1')).toBeInTheDocument();
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('uploads the reviewed frame and hands back the step’s new slide, region and binding', async () => {
    h.upload.mockResolvedValue({
      url: 'https://example.com/new.png',
      storagePath: 'gl/new.png',
      thumbnailUrl: 'https://example.com/new-thumb.webp',
    });
    const onDone = renderSession();
    fireEvent.click(screen.getByText('Stub click'));
    fireEvent.click(uploadButton());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.upload.mock.calls[0][0]).toBe('admin-1');
    expect(h.upload.mock.calls[0][3]).toBe('storage');
    expect(onDone).toHaveBeenCalledWith({
      stepId: 'step-4',
      url: 'https://example.com/new.png',
      thumbnailUrl: 'https://example.com/new-thumb.webp',
      placement: {
        xPct: 30,
        yPct: 20,
        region: { shape: 'rect', wPct: 5, hPct: 4 },
      },
      tour: { anchor: 'widget.close', action: 'click' },
    });
  });

  it('discarding in review reopens the Studio unchanged', () => {
    const onDone = renderSession();
    fireEvent.click(screen.getByText('Stub click'));
    const [, footerDiscard] = screen.getAllByRole('button', {
      name: 'Discard recording',
    });
    fireEvent.click(footerDiscard);
    expect(onDone).toHaveBeenCalledWith(null);
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('cancelling the recorder reopens the Studio unchanged', () => {
    const onDone = renderSession();
    fireEvent.click(screen.getByText('Stub cancel'));
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it('keeps the reviewed frame for a retry when the upload fails', async () => {
    h.upload.mockRejectedValueOnce(new Error('offline'));
    h.upload.mockResolvedValueOnce({ url: 'https://example.com/new.png' });
    const onDone = renderSession();
    fireEvent.click(screen.getByText('Stub click'));
    fireEvent.click(uploadButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't upload the new click"
    );
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(uploadButton());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0]).toMatchObject({
      url: 'https://example.com/new.png',
    });
  });
});
