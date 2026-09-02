import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { AudioResponseCapture } from './AudioResponseCapture';
import type { RecordingConfig, ResponseArtifact } from '@/types';
import type { AudioRecordingDeps } from '@/hooks/useAudioRecording';

const config: RecordingConfig = {
  prepSeconds: 0,
  limitSeconds: 60,
  prepExpiry: 'armed',
  takeLimit: null,
};

const deps: AudioRecordingDeps = {
  getStream: vi.fn(),
  createRecorder: vi.fn(),
  isTypeSupported: () => true,
  now: () => 0,
};

const failedArtifact: ResponseArtifact = {
  id: 'art-1',
  slot: 'primary',
  kind: 'audio',
  mimeType: 'audio/webm',
  bytes: 1000,
  durationMs: 4000,
  uploadState: 'failed',
};

function renderCapture(
  props: Partial<React.ComponentProps<typeof AudioResponseCapture>> = {}
) {
  return render(
    <AudioResponseCapture
      config={config}
      takesCommitted={1}
      noticeAckedAt={1700000000000}
      onAcknowledgeNotice={() => undefined}
      onCommit={() => Promise.resolve()}
      latestArtifact={failedArtifact}
      recorderDeps={deps}
      {...props}
    />
  );
}

class MockRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

function liveDeps(clock: { now: number }): AudioRecordingDeps {
  const track = { readyState: 'live', stop: () => undefined };
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  return {
    getStream: () => Promise.resolve(stream),
    createRecorder: () => new MockRecorder() as unknown as MediaRecorder,
    isTypeSupported: () => true,
    now: () => clock.now,
  };
}

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:take');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('AudioResponseCapture — closed recording window', () => {
  it('locks the recorder and offers no controls', () => {
    renderCapture({ slotClosed: true, takesCommitted: 0 });

    expect(screen.getByText(/Recording time is over/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Keep this take/i })
    ).toBeNull();
    expect(screen.queryByText(/Before you record/i)).toBeNull();
  });

  it('outranks an unacknowledged notice', () => {
    renderCapture({ slotClosed: true, noticeAckedAt: null });

    expect(screen.getByText(/Recording time is over/i)).toBeTruthy();
    expect(screen.queryByText(/Before you record/i)).toBeNull();
  });
});

describe('AudioResponseCapture — notice reminder overlay', () => {
  it('layers over live capture instead of replacing it', async () => {
    const clock = { now: 0 };
    renderCapture({ recorderDeps: liveDeps(clock), latestArtifact: undefined });

    fireEvent.click(screen.getByRole('button', { name: /Why we’re asking/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Record/i }));
    expect(
      await screen.findByRole('button', { name: /Stop recording/i })
    ).toBeTruthy();
    // The reminder is open while capture runs; Stop is still reachable.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes on Escape and returns focus to the reminder link', async () => {
    renderCapture({ latestArtifact: undefined });
    const link = screen.getByRole('button', { name: /Why we’re asking/i });

    fireEvent.click(link);
    const close = screen.getByRole('button', { name: /^Close$/i });
    await waitFor(() => expect(document.activeElement).toBe(close));

    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(link);
  });

  it('disables the reminder link while recording', async () => {
    const clock = { now: 0 };
    renderCapture({ recorderDeps: liveDeps(clock), latestArtifact: undefined });

    fireEvent.click(screen.getByRole('button', { name: /^Record/i }));
    await screen.findByRole('button', { name: /Stop recording/i });
    expect(
      screen.getByRole('button', { name: /Why we’re asking/i })
    ).toHaveProperty('disabled', true);
  });
});

describe('AudioResponseCapture — playback progress', () => {
  it('announces elapsed and total time, not a percentage', async () => {
    const clock = { now: 0 };
    const { container } = renderCapture({
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
    });

    fireEvent.click(screen.getByRole('button', { name: /^Record/i }));
    const stop = await screen.findByRole('button', {
      name: /Stop recording/i,
    });
    clock.now = 45_000;
    fireEvent.click(stop);

    const bar = await screen.findByRole('progressbar');
    expect(bar.getAttribute('aria-label')).toMatch(/Playback position/i);
    expect(bar.getAttribute('aria-valuetext')).toBe('0:00 of 0:45');

    const audio = container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentTime', { value: 19, writable: true });
    fireEvent.timeUpdate(audio);
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar').getAttribute('aria-valuetext')
      ).toBe('0:19 of 0:45')
    );
  });
});

describe('AudioResponseCapture — retry focus', () => {
  it('keeps focus on the retry button when the retry fails again', async () => {
    const user = userEvent.setup();
    const onRetryUpload = vi.fn().mockRejectedValue(new Error('nope'));
    renderCapture({ onRetryUpload });

    const retry = screen.getByRole('button', { name: /Try again/i });
    await user.click(retry);

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /Try again/i })
      )
    );
  });

  it('moves focus to the status banner when the retry succeeds', async () => {
    const onRetryUpload = vi.fn().mockResolvedValue(undefined);
    const { container } = renderCapture({ onRetryUpload });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
      await Promise.resolve();
    });

    const banner = container.querySelector('[tabindex="-1"]');
    await waitFor(() => expect(document.activeElement).toBe(banner));
  });
});

describe('AudioResponseCapture — failed upload', () => {
  it('offers a real retry that re-sends the same artifact', () => {
    const onRetryUpload = vi.fn().mockResolvedValue(undefined);
    renderCapture({ onRetryUpload });

    expect(screen.getByText(/Nothing is retrying on its own/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
    expect(onRetryUpload).toHaveBeenCalledTimes(1);
  });

  it('tells the truth and offers no retry when the bytes are gone', () => {
    renderCapture();

    expect(
      screen.getByText(/can no longer be sent from this device/i)
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Try again/i })).toBeNull();
    expect(screen.queryByText(/We are still trying/i)).toBeNull();
  });
});
