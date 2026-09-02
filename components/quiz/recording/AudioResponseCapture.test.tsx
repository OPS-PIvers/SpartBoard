import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
