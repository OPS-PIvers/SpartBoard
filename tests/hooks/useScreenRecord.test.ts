import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScreenRecord } from '@/hooks/useScreenRecord';

// Intercept onstop assignments through a getter/setter so we can check whether
// the cleanup nulled it out — without storing a `this` reference (no-this-alias).
let recorderOnStop: (() => void) | null | undefined;

class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;

  get onstop(): (() => void) | null | undefined {
    return recorderOnStop;
  }
  set onstop(handler: (() => void) | null | undefined) {
    recorderOnStop = handler;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    // Simulate async onstop (microtask delay like real browsers).
    // void is intentional: we don't need the caller to await this internal side-effect.
    void Promise.resolve().then(() => {
      this.onstop?.();
    });
  }

  static isTypeSupported(_type: string) {
    return true;
  }
}

describe('useScreenRecord', () => {
  let mockTrack: {
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  };

  beforeEach(() => {
    recorderOnStop = undefined;
    mockTrack = { stop: vi.fn(), onended: null };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
      getAudioTracks: () => [],
      getTracks: () => [mockTrack],
    };

    global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getDisplayMedia: vi.fn().mockResolvedValue(mockStream) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('nulls out onstop on cleanup so onSuccess is not called after unmount', async () => {
    const onSuccess = vi.fn();
    const { result, unmount } = renderHook(() =>
      useScreenRecord({ onSuccess })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    // onstop is wired up while recording
    expect(recorderOnStop).not.toBeNull();

    // Unmount while still recording — cleanup should null out onstop
    unmount();

    expect(recorderOnStop).toBeNull();

    // Flush pending microtasks that might try to call the old onstop
    await act(async () => {
      await Promise.resolve();
    });

    // onSuccess must never be delivered to an abandoned consumer
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
