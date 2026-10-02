import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useMeetingRecorder,
  type MeetingRecorderDeps,
} from './useMeetingRecorder';
import type { MeetingRecordingBackend } from '@/utils/meetingRecording/backend';
import {
  memorySegmentQueue,
  type SegmentQueue,
} from '@/utils/meetingRecording/segmentQueue';

class FakeTrack {
  readyState = 'live';
  private listeners: (() => void)[] = [];
  constructor(public deviceId: string | null) {}
  addEventListener(_type: string, fn: () => void) {
    this.listeners.push(fn);
  }
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
  end() {
    this.readyState = 'ended';
    this.listeners.forEach((fn) => fn());
  }
}

class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  timeslice: number | undefined;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  static instances: FakeRecorder[] = [];
  constructor(public stream: FakeStream) {
    FakeRecorder.instances.push(this);
  }
  start(timeslice?: number) {
    this.timeslice = timeslice;
    this.state = 'recording';
  }
  emit(text = 'seg') {
    this.ondataavailable?.({ data: new Blob([text], { type: 'audio/webm' }) });
  }
  stop() {
    this.state = 'inactive';
    this.emit('last');
    this.onstop?.();
  }
}

class FakeStream {
  track: FakeTrack;
  constructor(deviceId: string | null) {
    this.track = new FakeTrack(deviceId);
  }
  getAudioTracks() {
    return [this.track];
  }
  getTracks() {
    return [this.track];
  }
}

const PLC = 'plc1';
const REC = 'rec1';
const input = { plcId: PLC, noteId: 'note1', recorderUid: 'u1' };
const path = (part: number, seg: number) =>
  `plc_meeting_audio/${PLC}/${REC}/${part}/${seg}.webm`;

let backend: {
  [K in keyof MeetingRecordingBackend]: Mock<MeetingRecordingBackend[K]>;
};
let queue: SegmentQueue;
let streams: FakeStream[];
let savedMic: string | null;

function makeDeps(
  over: Partial<MeetingRecorderDeps> = {}
): MeetingRecorderDeps {
  return {
    backend,
    queue,
    getStream: vi.fn((deviceId: string | null) => {
      const s = new FakeStream(deviceId);
      streams.push(s);
      return Promise.resolve(s as unknown as MediaStream);
    }),
    createRecorder: (stream) =>
      new FakeRecorder(
        stream as unknown as FakeStream
      ) as unknown as MediaRecorder,
    isSupported: () => true,
    listMics: () => Promise.resolve([]),
    readMic: () => savedMic,
    writeMic: (id) => {
      savedMic = id;
    },
    now: () => Date.now(),
    ...over,
  };
}

const lastRecorder = () =>
  FakeRecorder.instances[FakeRecorder.instances.length - 1];

const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

async function startRecording(deps = makeDeps()) {
  const hook = renderHook(() => useMeetingRecorder({ deps }));
  await settle();
  await act(async () => {
    await hook.result.current.start(input);
  });
  return { hook, deps };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
  FakeRecorder.instances = [];
  streams = [];
  savedMic = null;
  queue = memorySegmentQueue();
  backend = {
    createRecording: vi.fn<MeetingRecordingBackend['createRecording']>(() =>
      Promise.resolve(REC)
    ),
    updateRecording: vi.fn<MeetingRecordingBackend['updateRecording']>(() =>
      Promise.resolve()
    ),
    uploadSegment: vi.fn<MeetingRecordingBackend['uploadSegment']>(() =>
      Promise.resolve()
    ),
    finalize: vi.fn<MeetingRecordingBackend['finalize']>(() =>
      Promise.resolve()
    ),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMeetingRecorder', () => {
  it('asks for the mic before creating the recording, then records in 30-second segments', async () => {
    const { hook, deps } = await startRecording();
    expect(deps.getStream).toHaveBeenCalledWith(null);
    expect(backend.createRecording).toHaveBeenCalledWith(input);
    expect(lastRecorder().timeslice).toBe(30_000);
    expect(hook.result.current.phase).toBe('recording');
    expect(hook.result.current.recordingId).toBe(REC);
  });

  it('leaves nothing behind when the mic is refused', async () => {
    const denied = Object.assign(new Error('no'), { name: 'NotAllowedError' });
    const deps = makeDeps({ getStream: vi.fn(() => Promise.reject(denied)) });
    const { hook } = await startRecording(deps);
    expect(hook.result.current.error).toBe('mic-denied');
    expect(hook.result.current.phase).toBe('idle');
    expect(backend.createRecording).not.toHaveBeenCalled();
  });

  it('reports unsupported browsers without touching the mic', async () => {
    const deps = makeDeps({ isSupported: () => false });
    const { hook } = await startRecording(deps);
    expect(hook.result.current.isSupported).toBe(false);
    expect(hook.result.current.error).toBe('unsupported');
    expect(deps.getStream).not.toHaveBeenCalled();
  });

  it('uploads each segment to its part and segment path', async () => {
    await startRecording();
    act(() => {
      lastRecorder().emit();
      lastRecorder().emit();
    });
    await settle();
    expect(backend.uploadSegment.mock.calls.map((c) => c[0])).toEqual([
      path(0, 0),
      path(0, 1),
    ]);
    expect(await queue.list()).toEqual([]);
  });

  it('keeps a failed segment queued and sends it when the network returns', async () => {
    backend.uploadSegment.mockRejectedValueOnce(new Error('offline'));
    const { hook } = await startRecording();
    act(() => {
      lastRecorder().emit();
    });
    await settle();
    expect(hook.result.current.pendingUploads).toBe(1);
    expect((await queue.list()).map((s) => s.path)).toEqual([path(0, 0)]);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();
    expect(backend.uploadSegment).toHaveBeenCalledTimes(2);
    expect(hook.result.current.pendingUploads).toBe(0);
    expect(await queue.list()).toEqual([]);
  });

  it('drops a segment the create-only rule refuses instead of retrying forever', async () => {
    backend.uploadSegment.mockRejectedValueOnce({
      code: 'storage/unauthorized',
    });
    const { hook } = await startRecording();
    act(() => {
      lastRecorder().emit();
    });
    await settle();
    expect(hook.result.current.pendingUploads).toBe(0);
    expect(await queue.list()).toEqual([]);
  });

  it('uploads segments left from an earlier session on mount', async () => {
    await queue.put({
      path: path(0, 4),
      blob: new Blob(['x']),
      queuedAt: 1,
    });
    renderHook(() => useMeetingRecorder({ deps: makeDeps() }));
    await settle();
    expect(backend.uploadSegment).toHaveBeenCalledWith(
      path(0, 4),
      expect.any(Blob)
    );
    expect(await queue.list()).toEqual([]);
  });

  it('pause closes the part and resume starts a new one', async () => {
    const { hook } = await startRecording();
    act(() => {
      lastRecorder().emit();
    });
    await settle(10_000);
    await act(async () => {
      await hook.result.current.pause();
    });
    expect(hook.result.current.phase).toBe('paused');
    expect(streams[0].track.stop).toHaveBeenCalled();
    expect(backend.updateRecording).toHaveBeenLastCalledWith(PLC, REC, {
      status: 'paused',
      parts: [{ segmentCount: 2, durationMs: 10_000 }],
      durationMs: 10_000,
      heartbeat: true,
    });

    await settle(60_000);
    await act(async () => {
      await hook.result.current.resume();
    });
    expect(hook.result.current.phase).toBe('recording');
    act(() => {
      lastRecorder().emit();
    });
    await settle(5_000);
    expect(backend.uploadSegment).toHaveBeenLastCalledWith(
      path(1, 0),
      expect.any(Blob)
    );
    expect(hook.result.current.elapsedMs).toBe(15_000);
  });

  it('heartbeats every 30 seconds while recording and not while paused', async () => {
    const { hook } = await startRecording();
    await settle(30_000);
    expect(backend.updateRecording).toHaveBeenCalledTimes(1);
    expect(backend.updateRecording.mock.calls[0][2]).toMatchObject({
      heartbeat: true,
      durationMs: 30_000,
    });
    await act(async () => {
      await hook.result.current.pause();
    });
    const afterPause = backend.updateRecording.mock.calls.length;
    await settle(5 * 60_000);
    expect(backend.updateRecording).toHaveBeenCalledTimes(afterPause);
  });

  it('stop closes the part, flushes uploads and finalizes', async () => {
    const { hook } = await startRecording();
    await settle(45_000);
    await act(async () => {
      await hook.result.current.stop();
    });
    expect(backend.uploadSegment).toHaveBeenCalledWith(
      path(0, 0),
      expect.any(Blob)
    );
    expect(backend.updateRecording).toHaveBeenLastCalledWith(PLC, REC, {
      parts: [{ segmentCount: 1, durationMs: 45_000 }],
      durationMs: 45_000,
    });
    expect(backend.finalize).toHaveBeenCalledWith(PLC, REC);
    expect(hook.result.current.phase).toBe('stopped');
  });

  it('shows finalize failures and can retry', async () => {
    backend.finalize.mockRejectedValueOnce(new Error('network'));
    const { hook } = await startRecording();
    await act(async () => {
      await hook.result.current.stop();
    });
    expect(hook.result.current.error).toBe('finalize-failed');
    await act(async () => {
      await hook.result.current.retryFinalize();
    });
    expect(backend.finalize).toHaveBeenCalledTimes(2);
    expect(hook.result.current.error).toBeNull();
  });

  it('warns at 55 minutes and stops on its own at 60', async () => {
    const { hook } = await startRecording();
    await settle(55 * 60_000);
    expect(hook.result.current.lengthWarning).toBe(true);
    expect(hook.result.current.phase).toBe('recording');
    await settle(5 * 60_000);
    expect(backend.finalize).toHaveBeenCalledTimes(1);
    expect(hook.result.current.phase).toBe('stopped');
  });

  it('finalizes a recording left paused for 30 minutes', async () => {
    const { hook } = await startRecording();
    await act(async () => {
      await hook.result.current.pause();
    });
    await settle(30 * 60_000);
    expect(backend.finalize).toHaveBeenCalledTimes(1);
    expect(hook.result.current.phase).toBe('stopped');
  });

  it('falls back to the default mic as a new part when the chosen one disconnects', async () => {
    savedMic = 'usb-mic';
    const { hook, deps } = await startRecording();
    expect(deps.getStream).toHaveBeenCalledWith('usb-mic');
    act(() => {
      streams[0].track.end();
    });
    await settle();
    expect(deps.getStream).toHaveBeenLastCalledWith(null);
    expect(hook.result.current.micFallback).toBe(true);
    expect(hook.result.current.phase).toBe('recording');
    act(() => {
      lastRecorder().emit();
    });
    await settle();
    expect(backend.uploadSegment).toHaveBeenLastCalledWith(
      path(1, 0),
      expect.any(Blob)
    );
  });

  it('uses the default mic when the remembered one is gone', async () => {
    savedMic = 'gone';
    const getStream = vi.fn((deviceId: string | null) =>
      deviceId
        ? Promise.reject(Object.assign(new Error(), { name: 'NotFoundError' }))
        : Promise.resolve(new FakeStream(null) as unknown as MediaStream)
    );
    const { hook } = await startRecording(makeDeps({ getStream }));
    expect(getStream).toHaveBeenLastCalledWith(null);
    expect(hook.result.current.phase).toBe('recording');
  });

  it('remembers the chosen mic and switches to it as a new part mid-recording', async () => {
    const { hook, deps } = await startRecording();
    await act(async () => {
      await hook.result.current.selectMic('desk-mic');
    });
    expect(savedMic).toBe('desk-mic');
    expect(hook.result.current.selectedMicId).toBe('desk-mic');
    expect(deps.getStream).toHaveBeenLastCalledWith('desk-mic');
    expect(FakeRecorder.instances).toHaveLength(2);
    expect(backend.uploadSegment).toHaveBeenCalledWith(
      path(0, 0),
      expect.any(Blob)
    );
  });

  it('warns before leaving while recording or while uploads are waiting', async () => {
    backend.uploadSegment.mockRejectedValue(new Error('offline'));
    const { hook } = await startRecording();
    const during = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    await act(async () => {
      await hook.result.current.stop();
    });
    expect(hook.result.current.pendingUploads).toBe(1);
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
  });

  it('stops the mic on unmount without finalizing', async () => {
    const { hook } = await startRecording();
    hook.unmount();
    expect(streams[0].track.stop).toHaveBeenCalled();
    expect(backend.finalize).not.toHaveBeenCalled();
  });
  it('turns the mic off when the view closes while the mic prompt is open', async () => {
    let grant: ((s: MediaStream) => void) | undefined;
    const getStream = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        })
    );
    const hook = renderHook(() =>
      useMeetingRecorder({ deps: makeDeps({ getStream }) })
    );
    await settle();
    let started: Promise<void> = Promise.resolve();
    act(() => {
      started = hook.result.current.start(input);
    });
    await settle();
    expect(getStream).toHaveBeenCalled();
    hook.unmount();
    const late = new FakeStream(null);
    await act(async () => {
      grant?.(late as unknown as MediaStream);
      await started;
    });
    expect(late.track.stop).toHaveBeenCalled();
    expect(backend.createRecording).not.toHaveBeenCalled();
    expect(FakeRecorder.instances).toHaveLength(0);
  });
});
