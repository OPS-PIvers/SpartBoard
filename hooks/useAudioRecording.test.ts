import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  RECOVERY_CHUNK_MS,
  micStateFromError,
  useAudioRecording,
  defaultAudioRecordingDeps,
  SPEECH_AUDIO_BITS_PER_SECOND,
  type AudioRecordingDeps,
  type AudioTake,
} from './useAudioRecording';
import type { RecordingConfig } from '@/types';
import { memoryTakeRecoveryStore } from '@/utils/takeRecoveryStore';

class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  static instances: FakeRecorder[] = [];
  constructor() {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const liveTrack = () => ({ readyState: 'live', stop: vi.fn() });

function makeStream(track: unknown = liveTrack()) {
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

let clock = 1_000_000;
let revokeSpy = vi.fn();

function makeDeps(over: Partial<AudioRecordingDeps> = {}): AudioRecordingDeps {
  return {
    getStream: vi.fn(() => Promise.resolve(makeStream())),
    createRecorder: vi.fn(() => new FakeRecorder() as unknown as MediaRecorder),
    isTypeSupported: () => true,
    now: () => clock,
    ...over,
  };
}

const config = (over: Partial<RecordingConfig> = {}): RecordingConfig => ({
  prepSeconds: 4,
  limitSeconds: 60,
  prepExpiry: 'armed',
  takeLimit: null,
  ...over,
});

beforeEach(() => {
  clock = 1_000_000;
  FakeRecorder.instances = [];
  vi.useFakeTimers();
  revokeSpy = vi.fn();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:take');
  globalThis.URL.revokeObjectURL = revokeSpy;
});

afterEach(() => {
  vi.useRealTimers();
});

/** Advances both the injected clock and the interval timers together. */
function advance(ms: number) {
  act(() => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  });
}

/** Same, but flushes the microtask queue so an async start() settles. */
async function advanceAsync(ms: number) {
  await act(async () => {
    clock += ms;
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAudioRecording prep expiry', () => {
  it('auto-start begins capture when prep runs out', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepExpiry: 'auto-start' }),
        enabled: true,
        deps,
      })
    );
    expect(result.current.phase).toBe('prep');
    await advanceAsync(4000);
    expect(result.current.phase).toBe('recording');
    expect(deps.getStream).toHaveBeenCalledTimes(1);
  });

  it('armed leaves the button live and never acquires the mic', () => {
    const onPrepExpired = vi.fn();
    const deps = makeDeps();
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepExpiry: 'armed' }),
        enabled: true,
        onPrepExpired,
        deps,
      })
    );
    advance(4000);
    expect(result.current.phase).toBe('armed');
    expect(onPrepExpired).not.toHaveBeenCalled();
    expect(deps.getStream).not.toHaveBeenCalled();
  });

  it.each(['auto-advance', 'unanswered'] as const)(
    '%s bubbles the expiry up to the question renderer',
    (prepExpiry) => {
      const onPrepExpired = vi.fn();
      renderHook(() =>
        useAudioRecording({
          config: config({ prepExpiry }),
          enabled: true,
          onPrepExpired,
          deps: makeDeps(),
        })
      );
      advance(4000);
      expect(onPrepExpired).toHaveBeenCalledWith(prepExpiry);
    }
  );

  it('does not run the prep countdown until the notice is acknowledged', () => {
    const onPrepExpired = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepExpiry: 'unanswered' }),
        enabled: false,
        onPrepExpired,
        deps: makeDeps(),
      })
    );
    advance(10000);
    expect(result.current.phase).toBe('prep');
    expect(onPrepExpired).not.toHaveBeenCalled();
  });
});

describe('useAudioRecording capture', () => {
  it('hard stops at exactly limitSeconds with no grace tail', async () => {
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0, limitSeconds: 10 }),
        enabled: true,
        deps: makeDeps(),
      })
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe('recording');
    advance(9000);
    expect(result.current.phase).toBe('recording');
    advance(1000);
    expect(result.current.phase).toBe('reviewing');
    expect(result.current.take?.durationMs).toBe(10000);
  });

  it('raises the wrap-up warning inside the final stretch, not after the limit', async () => {
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0, limitSeconds: 60 }),
        enabled: true,
        deps: makeDeps(),
      })
    );
    await act(async () => {
      await result.current.start();
    });
    advance(50000);
    expect(result.current.wrapUpWarning).toBe(false);
    advance(4000);
    expect(result.current.wrapUpWarning).toBe(true);
  });

  it('discard drops the blob and returns to armed with no upload', async () => {
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0, limitSeconds: 10 }),
        enabled: true,
        deps: makeDeps(),
      })
    );
    await act(async () => {
      await result.current.start();
    });
    advance(2000);
    act(() => {
      result.current.stop();
    });
    expect(result.current.phase).toBe('reviewing');
    act(() => {
      result.current.discard();
    });
    expect(result.current.phase).toBe('armed');
    expect(result.current.take).toBeNull();
    expect(revokeSpy).toHaveBeenCalledWith('blob:take');
  });

  it('commit hands the take to the caller and re-arms', async () => {
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0, limitSeconds: 10 }),
        enabled: true,
        deps: makeDeps(),
      })
    );
    await act(async () => {
      await result.current.start();
    });
    advance(3000);
    act(() => {
      result.current.stop();
    });
    expect(result.current.phase).toBe('reviewing');
    let committed: { durationMs: number } | null = null;
    act(() => {
      committed = result.current.commit();
    });
    expect(committed).not.toBeNull();
    expect((committed as unknown as { durationMs: number }).durationMs).toBe(
      3000
    );
    expect(result.current.phase).toBe('armed');
  });

  it('hands the take straight to onTakeReady and skips review', async () => {
    const onTakeReady = vi.fn<(take: AudioTake) => void>();
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0, limitSeconds: 10 }),
        enabled: true,
        onTakeReady,
        deps: makeDeps(),
      })
    );
    await act(async () => {
      await result.current.start();
    });
    advance(10_000);
    expect(onTakeReady).toHaveBeenCalledTimes(1);
    expect(onTakeReady.mock.calls[0][0].durationMs).toBe(10_000);
    expect(result.current.phase).toBe('armed');
    expect(result.current.take).toBeNull();
    expect(result.current.takeUrl).toBeNull();
  });
});

describe('useAudioRecording mic unavailable', () => {
  it('lands in capture-unavailable without ever constructing a recorder', async () => {
    const onCaptureUnavailable = vi.fn();
    const deps = makeDeps({
      getStream: vi.fn(() =>
        Promise.reject(new DOMException('denied', 'NotAllowedError'))
      ),
    });
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0 }),
        enabled: true,
        onCaptureUnavailable,
        deps,
      })
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe('capture-unavailable');
    expect(result.current.micState).toBe('denied');
    expect(deps.createRecorder).not.toHaveBeenCalled();
    expect(onCaptureUnavailable).toHaveBeenCalledTimes(1);
  });

  it('records a missing device as unavailable, not denied', async () => {
    const deps = makeDeps({
      getStream: vi.fn(() =>
        Promise.reject(new DOMException('no mic', 'NotFoundError'))
      ),
    });
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0 }),
        enabled: true,
        deps,
      })
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe('capture-unavailable');
    expect(result.current.micState).toBe('unavailable');
  });

  it('treats an already-ended track as unavailable', async () => {
    const deps = makeDeps({
      getStream: vi.fn(() =>
        Promise.resolve(makeStream({ readyState: 'ended', stop: vi.fn() }))
      ),
    });
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0 }),
        enabled: true,
        deps,
      })
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.phase).toBe('capture-unavailable');
    expect(result.current.micState).toBe('unavailable');
    expect(deps.createRecorder).not.toHaveBeenCalled();
  });
});

describe('useAudioRecording mic on', () => {
  it('stamps on once recording starts and carries it on the take', async () => {
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0 }),
        enabled: true,
        deps: makeDeps(),
      })
    );
    expect(result.current.micState).toBeNull();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.micState).toBe('on');
    act(() => result.current.stop());
    expect(result.current.take?.micState).toBe('on');
  });
});

describe('micStateFromError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'unavailable'],
    ['NotReadableError', 'unavailable'],
  ] as const)('%s maps to %s', (name, expected) => {
    expect(micStateFromError(new DOMException('x', name))).toBe(expected);
  });

  it('treats a non-error throw as unavailable', () => {
    expect(micStateFromError(undefined)).toBe('unavailable');
  });
});

describe('defaultAudioRecordingDeps.createRecorder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records speech at 32 kbps, with and without a mime type', () => {
    const ctor = vi.fn();
    vi.stubGlobal(
      'MediaRecorder',
      class {
        constructor(stream: MediaStream, options?: MediaRecorderOptions) {
          ctor(stream, options);
        }
      }
    );
    const stream = {} as MediaStream;
    defaultAudioRecordingDeps.createRecorder(stream, 'audio/webm;codecs=opus');
    defaultAudioRecordingDeps.createRecorder(stream, '');
    expect(SPEECH_AUDIO_BITS_PER_SECOND).toBe(32000);
    expect(ctor).toHaveBeenNthCalledWith(1, stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 32000,
    });
    expect(ctor).toHaveBeenNthCalledWith(2, stream, {
      audioBitsPerSecond: 32000,
    });
  });
});

describe('useAudioRecording crash recovery', () => {
  const recoveryKey = 's1/r1/q1';

  it('streams chunks to the recovery store while recording', async () => {
    const store = memoryTakeRecoveryStore();
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0, limitSeconds: 10 }),
        enabled: true,
        deps: makeDeps(),
        recovery: { store, key: recoveryKey },
      })
    );
    const startSpy = vi.spyOn(FakeRecorder.prototype, 'start');
    await act(async () => {
      await result.current.start();
    });
    expect(startSpy).toHaveBeenCalledWith(RECOVERY_CHUNK_MS);
    await act(async () => {
      FakeRecorder.instances[0].ondataavailable?.({
        data: new Blob(['chunk'], { type: 'audio/webm' }),
      });
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    const saved = await store.load(recoveryKey, clock);
    expect(saved?.chunks).toHaveLength(1);
    expect(saved?.mimeType).toBe('audio/webm');
    startSpy.mockRestore();
  });

  it('records without a timeslice when no recovery store is given', async () => {
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0 }),
        enabled: true,
        deps: makeDeps(),
      })
    );
    const startSpy = vi.spyOn(FakeRecorder.prototype, 'start');
    await act(async () => {
      await result.current.start();
    });
    expect(startSpy).toHaveBeenCalledWith();
    startSpy.mockRestore();
  });

  it.each(['commit', 'discard'] as const)(
    'wipes the local copy on %s',
    async (action) => {
      const store = memoryTakeRecoveryStore();
      const { result } = renderHook(() =>
        useAudioRecording({
          config: config({ prepSeconds: 0, limitSeconds: 10 }),
          enabled: true,
          deps: makeDeps(),
          recovery: { store, key: recoveryKey },
        })
      );
      await act(async () => {
        await result.current.start();
      });
      act(() => result.current.stop());
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(await store.load(recoveryKey, clock)).not.toBeNull();
      act(() => {
        if (action === 'commit') result.current.commit();
        else result.current.discard();
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(await store.load(recoveryKey, clock)).toBeNull();
    }
  );

  it('wipes the local copy when review is off and the take commits on stop', async () => {
    const store = memoryTakeRecoveryStore();
    const onTakeReady = vi.fn();
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0, limitSeconds: 10 }),
        enabled: true,
        deps: makeDeps(),
        recovery: { store, key: recoveryKey },
        onTakeReady,
      })
    );
    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.stop());
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onTakeReady).toHaveBeenCalledTimes(1);
    expect(await store.load(recoveryKey, clock)).toBeNull();
  });

  it('restore puts a recovered take on the review screen', () => {
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 4 }),
        enabled: true,
        deps: makeDeps(),
      })
    );
    const take = {
      blob: new Blob(['x'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      durationMs: 3000,
      micState: 'on' as const,
    };
    let restored = false;
    act(() => {
      restored = result.current.restore(take);
    });
    expect(restored).toBe(true);
    expect(result.current.phase).toBe('reviewing');
    expect(result.current.take).toBe(take);
    expect(result.current.prepSecondsLeft).toBeNull();
    // The prep countdown no longer runs once the take is restored.
    advance(10000);
    expect(result.current.phase).toBe('reviewing');
  });

  it('restore refuses while a take is recording', async () => {
    const { result } = renderHook(() =>
      useAudioRecording({
        config: config({ prepSeconds: 0 }),
        enabled: true,
        deps: makeDeps(),
      })
    );
    await act(async () => {
      await result.current.start();
    });
    let restored = true;
    act(() => {
      restored = result.current.restore({
        blob: new Blob(['x']),
        mimeType: 'audio/webm',
        durationMs: 1,
        micState: 'on',
      });
    });
    expect(restored).toBe(false);
    expect(result.current.phase).toBe('recording');
  });
});
