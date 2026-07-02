import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useScreenRecord } from '@/hooks/useScreenRecord';

// ---------------------------------------------------------------------------
// Fakes for the browser media APIs the hook drives (getDisplayMedia +
// MediaRecorder). jsdom implements neither, so we stub controllable versions
// that let each test inspect wiring and drive the recorder lifecycle.
// ---------------------------------------------------------------------------

class FakeMediaStreamTrack {
  kind: string;
  onended: (() => void) | null = null;
  stop = vi.fn();
  constructor(kind: string) {
    this.kind = kind;
  }
}

class FakeMediaStream {
  videoTrack = new FakeMediaStreamTrack('video');
  audioTrack = new FakeMediaStreamTrack('audio');
  getVideoTracks = vi.fn(() => [this.videoTrack]);
  getTracks = vi.fn(() => [this.videoTrack, this.audioTrack]);
}

let recorderInstances: FakeMediaRecorder[] = [];

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType: string;
  stream: FakeMediaStream;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.onstop?.();
  });

  constructor(stream: FakeMediaStream, opts: { mimeType: string }) {
    this.stream = stream;
    this.mimeType = opts.mimeType;
    recorderInstances.push(this);
  }

  /** Test helper: simulate the browser emitting a data chunk. */
  emitData(data: Blob) {
    this.ondataavailable?.({ data });
  }
}

const lastRecorder = () => recorderInstances[recorderInstances.length - 1];

let getDisplayMedia: ReturnType<typeof vi.fn>;
let currentStream: FakeMediaStream;

const stubMediaApis = () => {
  currentStream = new FakeMediaStream();
  getDisplayMedia = vi.fn(() => Promise.resolve(currentStream));
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getDisplayMedia },
    configurable: true,
    writable: true,
  });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
};

describe('useScreenRecord', () => {
  beforeEach(() => {
    recorderInstances = [];
    FakeMediaRecorder.isTypeSupported.mockReturnValue(true);
    stubMediaApis();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts in an idle state', () => {
    const { result } = renderHook(() => useScreenRecord());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.duration).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it('requests display media with browser + audio constraints and flips isRecording on', async () => {
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: { displaySurface: 'browser' },
      audio: true,
    });
    expect(lastRecorder().start).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('prefers the vp9/opus mime type when supported', async () => {
    FakeMediaRecorder.isTypeSupported.mockReturnValue(true);
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(FakeMediaRecorder.isTypeSupported).toHaveBeenCalledWith(
      'video/webm;codecs=vp9,opus'
    );
    expect(lastRecorder().mimeType).toBe('video/webm;codecs=vp9,opus');
  });

  it('falls back to plain video/webm when vp9/opus is unsupported', async () => {
    FakeMediaRecorder.isTypeSupported.mockReturnValue(false);
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(lastRecorder().mimeType).toBe('video/webm');
  });

  it('increments duration once per second while recording', async () => {
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.duration).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.duration).toBe(3);
  });

  it('collects non-empty chunks and delivers a blob of the recorder mime type via onSuccess', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useScreenRecord({ onSuccess }));

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      lastRecorder().emitData(new Blob(['abc'])); // size 3 → kept
      lastRecorder().emitData(new Blob([])); // size 0 → ignored
      lastRecorder().emitData(new Blob(['de'])); // size 2 → kept
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    const blob = onSuccess.mock.calls[0][0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('video/webm;codecs=vp9,opus');
    // Only the two non-empty chunks (3 + 2 bytes) should have been assembled.
    expect(blob.size).toBe(5);
  });

  it('resets recording state and stops all tracks when the recorder stops', async () => {
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.isRecording).toBe(true);
    expect(result.current.duration).toBe(2);

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.duration).toBe(0);
    expect(currentStream.videoTrack.stop).toHaveBeenCalled();
    expect(currentStream.audioTrack.stop).toHaveBeenCalled();
  });

  it('clears the duration timer on stop so it no longer ticks', async () => {
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      result.current.stopRecording();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.duration).toBe(0);
  });

  it('calls recorder.stop() only while the recorder is active', async () => {
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });
    const recorder = lastRecorder();

    act(() => {
      result.current.stopRecording();
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(recorder.state).toBe('inactive');

    // A second stop must not re-invoke stop() now that state is 'inactive'.
    act(() => {
      result.current.stopRecording();
    });
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it('does not throw when stopRecording is called before any recording starts', () => {
    const { result } = renderHook(() => useScreenRecord());
    expect(() => {
      act(() => {
        result.current.stopRecording();
      });
    }).not.toThrow();
  });

  it('stops recording when the user ends the share via the browser UI', async () => {
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });
    const recorder = lastRecorder();
    expect(currentStream.videoTrack.onended).toBeInstanceOf(Function);

    act(() => {
      currentStream.videoTrack.onended?.();
    });

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(result.current.isRecording).toBe(false);
  });

  it('surfaces a getDisplayMedia rejection through state, onError and console.error', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const denied = new Error('Permission denied');
    getDisplayMedia.mockRejectedValueOnce(denied);
    const onError = vi.fn();
    const { result } = renderHook(() => useScreenRecord({ onError }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe(denied);
    expect(result.current.isRecording).toBe(false);
    expect(onError).toHaveBeenCalledWith(denied);
    expect(consoleSpy).toHaveBeenCalledWith('Screen recording failed:', denied);
  });

  it('wraps a non-Error rejection in a generic Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getDisplayMedia.mockRejectedValueOnce('nope');
    const onError = vi.fn();
    const { result } = renderHook(() => useScreenRecord({ onError }));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Failed to start recording');
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe(
      'Failed to start recording'
    );
  });

  it('clears a prior error when a new recording starts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getDisplayMedia.mockRejectedValueOnce(new Error('first failure'));
    const { result } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.isRecording).toBe(true);
  });

  it('stops the active stream tracks on unmount', async () => {
    const { result, unmount } = renderHook(() => useScreenRecord());

    await act(async () => {
      await result.current.startRecording();
    });

    unmount();

    expect(currentStream.videoTrack.stop).toHaveBeenCalled();
    expect(currentStream.audioTrack.stop).toHaveBeenCalled();
  });
});
