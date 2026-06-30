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

  it('is a no-op when called while already recording (re-entrancy guard)', async () => {
    const startSpy = vi.spyOn(MockMediaRecorder.prototype, 'start');

    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(startSpy).toHaveBeenCalledTimes(1);

    // Call again while state is 'recording' — guard should short-circuit
    await act(async () => {
      await result.current.startRecording();
    });

    // start() must not have been called a second time
    expect(startSpy).toHaveBeenCalledTimes(1);
  });

  it('stale onstop from a superseded recorder is a no-op (identity guard)', async () => {
    const onSuccess = vi.fn();

    // Prevent MockMediaRecorder.stop() from firing onstop automatically so we
    // can control exactly when it fires (simulating the async browser timing).
    const stopMock = vi
      .spyOn(MockMediaRecorder.prototype, 'stop')
      .mockImplementation(function (this: MockMediaRecorder) {
        this.state = 'inactive';
        // onstop deliberately NOT fired here — we fire it manually below.
      });

    const { result } = renderHook(() => useScreenRecord({ onSuccess }));

    // Start first recording — recorder1 stored in mediaRecorderRef.current.
    await act(async () => {
      await result.current.startRecording();
    });

    // Capture recorder1's onstop handler before stopping.
    const staleOnStop = recorderOnStop;
    expect(staleOnStop).toBeTruthy();

    // Stop recorder1 (state → inactive; onstop not yet fired).
    act(() => {
      result.current.stopRecording();
    });

    // Restore normal stop() so the second recording can stop normally.
    stopMock.mockRestore();

    // Start a second recording — recorder2 now owns mediaRecorderRef.current.
    await act(async () => {
      await result.current.startRecording();
    });

    // Simulate recorder1's onstop firing late (after recorder2 is live).
    act(() => {
      staleOnStop?.();
    });

    // onSuccess must NOT be called with recorder1's stale (empty) blob.
    expect(onSuccess).not.toHaveBeenCalled();
    // isRecording must remain true — recorder2 is still active.
    expect(result.current.isRecording).toBe(true);
  });

  it('stops stream1 tracks when stale onstop fires even though identity guard bails (stream leak fix)', async () => {
    const track1 = { stop: vi.fn(), onended: null as (() => void) | null };
    const stream1 = {
      getVideoTracks: () => [track1],
      getAudioTracks: () => [],
      getTracks: () => [track1],
    };
    const track2 = { stop: vi.fn(), onended: null as (() => void) | null };
    const stream2 = {
      getVideoTracks: () => [track2],
      getAudioTracks: () => [],
      getTracks: () => [track2],
    };

    let callCount = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve(callCount === 1 ? stream1 : stream2);
        }),
      },
      writable: true,
      configurable: true,
    });

    // Prevent auto-fire so we control when onstop runs.
    const stopMock = vi
      .spyOn(MockMediaRecorder.prototype, 'stop')
      .mockImplementation(function (this: MockMediaRecorder) {
        this.state = 'inactive';
      });

    const { result } = renderHook(() => useScreenRecord());

    // First recording — stream1.
    await act(async () => {
      await result.current.startRecording();
    });
    const staleOnStop = recorderOnStop;
    act(() => {
      result.current.stopRecording();
    });

    stopMock.mockRestore();

    // Second recording — stream2 now owns mediaRecorderRef.current.
    await act(async () => {
      await result.current.startRecording();
    });

    expect(track1.stop).not.toHaveBeenCalled();

    // Fire recorder1's stale onstop. Identity guard bails on shared-ref
    // mutations, but stream1's tracks must be stopped unconditionally.
    act(() => {
      staleOnStop?.();
    });

    expect(track1.stop).toHaveBeenCalledTimes(1);
    // stream2 must be unaffected.
    expect(track2.stop).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(true);
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
