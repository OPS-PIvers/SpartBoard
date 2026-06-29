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

  it('stops the MediaRecorder on cleanup even when no video track was wired (empty getVideoTracks)', async () => {
    const mockStreamNoVideo = {
      getVideoTracks: () => [],
      getAudioTracks: () => [],
      getTracks: () => [mockTrack],
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStreamNoVideo),
      },
      writable: true,
      configurable: true,
    });

    const stopSpy = vi.spyOn(MockMediaRecorder.prototype, 'stop');

    const { result, unmount } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });

    stopSpy.mockClear();

    unmount();

    // Cleanup must call stop() so the MediaRecorder doesn't stay active
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it('nulls videoTrack.onended before stopping tracks so track.stop does not trigger stopRecording during cleanup', async () => {
    const { result, unmount } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockTrack.onended).not.toBeNull();

    let onendedAtStopTime: (() => void) | null = null;
    mockTrack.stop.mockImplementation(() => {
      onendedAtStopTime = mockTrack.onended as (() => void) | null;
    });

    unmount();

    expect(onendedAtStopTime).toBeNull();
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
