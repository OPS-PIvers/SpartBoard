import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';
import { MicrophoneGate, type MicrophoneGateDeps } from './MicrophoneGate';
import { AudioResponseCapture } from './AudioResponseCapture';
import type { RecordingConfig } from '@/types';

const fakeStream = () => {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
};

const makeDeps = (
  state: PermissionState | null,
  getStream: MicrophoneGateDeps['getStream'] = vi.fn()
): MicrophoneGateDeps => ({
  queryPermission: vi.fn(() => Promise.resolve(state)),
  watchPermission: vi.fn(() => () => undefined),
  getStream,
});

const gate = (
  deps: MicrophoneGateDeps,
  props: Partial<React.ComponentProps<typeof MicrophoneGate>> = {}
) => {
  const onReady = vi.fn();
  render(
    <MicrophoneGate
      light
      noticeRequired={false}
      noticeAckedAt={null}
      onAcknowledgeNotice={() => undefined}
      onReady={onReady}
      deps={deps}
      {...props}
    />
  );
  return onReady;
};

describe('MicrophoneGate', () => {
  it('passes straight through when the mic is already allowed', async () => {
    const onReady = gate(makeDeps('granted'));
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it('asks for the mic, releases it, then lets the student in', async () => {
    const { stream, stop } = fakeStream();
    const getStream = vi.fn(() => Promise.resolve(stream));
    const onReady = gate(makeDeps('prompt', getStream));
    fireEvent.click(
      await screen.findByRole('button', { name: /allow microphone/i })
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(stop).toHaveBeenCalled();
  });

  it('stays closed when the student refuses, with a way to try again', async () => {
    const getStream = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('no'), { name: 'NotAllowedError' })
      )
      .mockResolvedValueOnce(fakeStream().stream);
    const onReady = gate(makeDeps(null, getStream));
    fireEvent.click(
      await screen.findByRole('button', { name: /allow microphone/i })
    );
    expect(await screen.findByText(/microphone is blocked/i)).toBeTruthy();
    expect(onReady).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(onReady).toHaveBeenCalled());
  });

  it('shows the blocked state up front when the browser already blocks the mic', async () => {
    gate(makeDeps('denied'));
    expect(await screen.findByText(/microphone is blocked/i)).toBeTruthy();
  });

  it('says no microphone was found when the device is missing', async () => {
    const getStream = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('none'), { name: 'NotFoundError' })
      );
    gate(makeDeps('prompt', getStream));
    fireEvent.click(
      await screen.findByRole('button', { name: /allow microphone/i })
    );
    expect(await screen.findByText(/no microphone found/i)).toBeTruthy();
  });

  it('shows the recording notice first and never checks the mic before it', () => {
    const deps = makeDeps('granted');
    const onReady = gate(deps, { noticeRequired: true, noticeAckedAt: null });
    expect(screen.getByText(/who receives your recording/i)).toBeTruthy();
    expect(deps.queryPermission).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('recording notice switched off', () => {
  const config: RecordingConfig = {
    prepSeconds: 30,
    limitSeconds: 60,
    prepExpiry: 'armed',
    takeLimit: null,
  };

  it('skips the notice and its reminder link in the recorder', () => {
    render(
      <AudioResponseCapture
        config={config}
        takesCommitted={0}
        noticeAckedAt={null}
        onAcknowledgeNotice={() => undefined}
        noticeRequired={false}
        onCommit={() => Promise.resolve()}
        recorderDeps={{
          getStream: vi.fn(),
          createRecorder: vi.fn(),
          isTypeSupported: () => true,
          now: () => 0,
        }}
      />
    );
    expect(screen.queryByText(/who receives your recording/i)).toBeNull();
    expect(screen.queryByText(/why we.re asking/i)).toBeNull();
  });
});
