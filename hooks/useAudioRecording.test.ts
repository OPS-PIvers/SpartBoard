import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useAudioRecording,
  type AudioRecordingDeps,
} from './useAudioRecording';
import type { RecordingConfig } from '@/types';

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
    expect(deps.createRecorder).not.toHaveBeenCalled();
    expect(onCaptureUnavailable).toHaveBeenCalledTimes(1);
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
    expect(deps.createRecorder).not.toHaveBeenCalled();
  });
});
