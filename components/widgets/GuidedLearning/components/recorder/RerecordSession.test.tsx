import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('RerecordSession', () => {
  it('uploads the one captured frame and hands back the step’s new slide, region and binding', async () => {
    h.recording = {
      frames: [FRAME],
      redactions: [[]],
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
      ],
    };
    h.upload.mockResolvedValue({
      url: 'https://example.com/new.png',
      storagePath: 'gl/new.png',
      thumbnailUrl: 'https://example.com/new-thumb.webp',
    });
    const onDone = vi.fn();
    render(
      <RerecordSession
        target={{ setId: 'set-1', stepId: 'step-4' }}
        onDone={onDone}
      />
    );
    expect(screen.getByText('single mode')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Stub click'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
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

  it('reopens the Studio unchanged when cancelled or the upload fails', async () => {
    const onDone = vi.fn();
    render(
      <RerecordSession
        target={{ setId: 'set-1', stepId: 'step-4' }}
        onDone={onDone}
      />
    );
    fireEvent.click(screen.getByText('Stub cancel'));
    expect(onDone).toHaveBeenLastCalledWith(null);

    h.upload.mockRejectedValue(new Error('offline'));
    fireEvent.click(screen.getByText('Stub click'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(2));
    expect(onDone).toHaveBeenLastCalledWith(null);
  });
});
