import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useWhiteboardRecording,
  micStateFromError,
  WHITEBOARD_AUDIO_BITS_PER_SECOND,
  type WhiteboardCapturedTake,
  type WhiteboardLogSink,
  type WhiteboardRecordingDeps,
} from './useWhiteboardRecording';
import type { RecordingConfig } from '@/types';
import type { WhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLogTypes';

class FakeRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  timeslice: number | undefined;
  start(timeslice?: number) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const liveTrack = () => ({ readyState: 'live', stop: vi.fn() });
const makeStream = () => {
  const track = liveTrack();
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
};

let clock = 1_000;
let recorders: FakeRecorder[] = [];

function makeDeps(
  over: Partial<WhiteboardRecordingDeps> = {}
): WhiteboardRecordingDeps {
  return {
    getStream: vi.fn(() => Promise.resolve(makeStream())),
    createRecorder: vi.fn(() => {
      const r = new FakeRecorder();
      recorders.push(r);
      return r as unknown as MediaRecorder;
    }),
    isTypeSupported: () => true,
    now: () => clock,
    ...over,
  };
}

const LOG: WhiteboardLog = {
  v: 1,
  page: { w: 1600, h: 1200 },
  startingPageId: 'blank',
  events: [],
};

function makeSink(): WhiteboardLogSink & { t0: number | null } {
  const sink = {
    t0: null as number | null,
    start: (t0: number) => {
      sink.t0 = t0;
    },
    toLog: () => LOG,
  };
  return sink;
}

const config = (over: Partial<RecordingConfig> = {}): RecordingConfig => ({
  prepSeconds: 0,
  limitSeconds: 60,
  prepExpiry: 'armed',
  takeLimit: null,
  ...over,
});

beforeEach(() => {
  clock = 1_000;
  recorders = [];
  vi.useFakeTimers();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:take');
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  });
}

function setup(
  cfg: RecordingConfig,
  deps = makeDeps(),
  extra: Partial<Parameters<typeof useWhiteboardRecording>[0]> = {}
) {
  const sink = makeSink();
  const onTakeReady = vi.fn<(take: WhiteboardCapturedTake) => void>();
  const hook = renderHook(() =>
    useWhiteboardRecording({
      config: cfg,
      enabled: true,
      logSink: sink,
      onTakeReady,
      deps,
      ...extra,
    })
  );
  return { hook, sink, onTakeReady, deps };
}

describe('useWhiteboardRecording', () => {
  it('starts mic and log on one clock', async () => {
    const { hook, sink } = setup(config());
    await act(() => hook.result.current.start());
    expect(hook.result.current.phase).toBe('recording');
    expect(hook.result.current.micState).toBe('on');
    expect(sink.t0).toBe(1_000);
    expect(recorders[0].timeslice).toBe(1_000);
  });

  it('asks for 32 kbps speech', () => {
    expect(WHITEBOARD_AUDIO_BITS_PER_SECOND).toBe(32_000);
  });

  it('draw-only never asks for the mic and records no mic state', async () => {
    const deps = makeDeps();
    const { hook, onTakeReady } = setup(config({ explainAloud: false }), deps);
    await act(() => hook.result.current.start());
    expect(deps.getStream).not.toHaveBeenCalled();
    expect(hook.result.current.phase).toBe('recording');
    advance(4_000);
    await act(async () => {
      await hook.result.current.stop();
    });
    const take = onTakeReady.mock.calls[0][0];
    expect(take.audio).toBeNull();
    expect(take.micState).toBeUndefined();
    expect(take.durationMs).toBe(4_000);
    expect(hook.result.current.phase).toBe('reviewing');
  });

  it('a denied mic arms the canvas alone', async () => {
    const deps = makeDeps({
      getStream: vi.fn(() =>
        Promise.reject(new DOMException('no', 'NotAllowedError'))
      ),
    });
    const { hook, onTakeReady } = setup(config(), deps);
    await act(() => hook.result.current.start());
    expect(hook.result.current.phase).toBe('recording');
    expect(hook.result.current.micState).toBe('denied');
    await act(async () => {
      await hook.result.current.stop();
    });
    expect(onTakeReady.mock.calls[0][0]).toMatchObject({
      audio: null,
      micState: 'denied',
    });
  });

  it('classifies mic errors', () => {
    expect(micStateFromError(new DOMException('', 'NotAllowedError'))).toBe(
      'denied'
    );
    expect(micStateFromError(new DOMException('', 'NotFoundError'))).toBe(
      'unavailable'
    );
  });

  it('stops at exactly the limit with the audio attached', async () => {
    const { hook, onTakeReady } = setup(config({ limitSeconds: 10 }));
    await act(() => hook.result.current.start());
    advance(10_000);
    await act(async () => {
      await Promise.resolve();
    });
    const take = onTakeReady.mock.calls[0][0];
    expect(take.stopReason).toBe('limit');
    expect(take.durationMs).toBe(10_000);
    expect(take.audio?.mimeType).toBe('audio/webm');
    expect(take.log).toBe(LOG);
  });

  it('stop reports the reason and is idempotent while flushing', async () => {
    const { hook, onTakeReady } = setup(config());
    await act(() => hook.result.current.start());
    let a: unknown;
    let b: unknown;
    await act(async () => {
      const p1 = hook.result.current.stop('budget');
      const p2 = hook.result.current.stop('user');
      [a, b] = await Promise.all([p1, p2]);
    });
    expect(a).toBe(b);
    expect(onTakeReady).toHaveBeenCalledTimes(1);
    expect(onTakeReady.mock.calls[0][0].stopReason).toBe('budget');
  });

  it('discard writes nothing and re-arms', async () => {
    const { hook } = setup(config());
    await act(() => hook.result.current.start());
    await act(async () => {
      await hook.result.current.stop();
    });
    act(() => hook.result.current.discard());
    expect(hook.result.current.phase).toBe('armed');
    expect(hook.result.current.take).toBeNull();
  });

  it('commit hands back the take once', async () => {
    const { hook } = setup(config());
    await act(() => hook.result.current.start());
    await act(async () => {
      await hook.result.current.stop();
    });
    let first: unknown;
    act(() => {
      first = hook.result.current.commit();
    });
    expect(first).not.toBeNull();
    expect(hook.result.current.commit()).toBeNull();
    expect(hook.result.current.phase).toBe('armed');
  });

  it.each([
    ['auto-start', 'recording', false],
    ['armed', 'armed', false],
    ['auto-advance', 'armed', true],
    ['unanswered', 'armed', true],
  ] as const)(
    'prep expiry %s leaves the take %s',
    async (expiry, phase, bubbles) => {
      const onPrepExpired = vi.fn();
      const { hook } = setup(
        config({ prepSeconds: 3, prepExpiry: expiry }),
        makeDeps(),
        { onPrepExpired }
      );
      expect(hook.result.current.phase).toBe('prep');
      advance(3_000);
      await act(async () => {
        await Promise.resolve();
      });
      expect(hook.result.current.phase).toBe(phase);
      expect(onPrepExpired).toHaveBeenCalledTimes(bubbles ? 1 : 0);
    }
  );

  it('restore opens a recovered take in review', () => {
    const { hook } = setup(config());
    act(() =>
      hook.result.current.restore({
        audio: null,
        log: LOG,
        durationMs: 5_000,
        micState: 'on',
        stopReason: 'cutoff',
        startedAt: 1,
      })
    );
    expect(hook.result.current.phase).toBe('reviewing');
    expect(hook.result.current.take?.durationMs).toBe(5_000);
  });
});
