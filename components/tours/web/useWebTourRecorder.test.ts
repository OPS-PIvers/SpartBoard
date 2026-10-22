import { act, renderHook, waitFor } from '@testing-library/react';
import { EXTENSION_PROTOCOL_VERSION } from './extensionProtocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORDER_PORT } from './recorderProtocol';
import { useWebTourRecorder } from './useWebTourRecorder';

type Listener = (msg: unknown) => void;

const fakePort = () => {
  const onMessage: Listener[] = [];
  const onDisconnect: (() => void)[] = [];
  return {
    posted: [] as unknown[],
    postMessage(msg: unknown) {
      this.posted.push(msg);
    },
    disconnect: vi.fn(),
    onMessage: { addListener: (fn: Listener) => onMessage.push(fn) },
    onDisconnect: { addListener: (fn: () => void) => onDisconnect.push(fn) },
    emit: (msg: unknown) => onMessage.forEach((fn) => fn(msg)),
    fireDisconnect: () => onDisconnect.forEach((fn) => fn()),
  };
};

const step = (id: string) => ({
  id,
  urlPattern: 'https://orono.schoology.com/home',
  action: 'click',
  locator: { name: 'Courses' },
});

let port: ReturnType<typeof fakePort>;
const connect = vi.fn();

beforeEach(() => {
  port = fakePort();
  connect.mockReset().mockImplementation(() => port);
  vi.stubEnv('VITE_SPART_EXTENSION_ID', 'ext-id');
  (globalThis as { chrome?: unknown }).chrome = { runtime: { connect } };
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('useWebTourRecorder', () => {
  it('attaches, saves each step once and acknowledges it', async () => {
    const onStep = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useWebTourRecorder({ setId: 't1', title: 'Tour', onStep })
    );
    act(() => result.current.connect());
    expect(connect).toHaveBeenCalledWith('ext-id', { name: RECORDER_PORT });
    // The page says which clues it reviews before attaching.
    expect(port.posted[0]).toEqual({
      type: 'recorder/hello',
      setId: 't1',
      protocol: EXTENSION_PROTOCOL_VERSION,
    });
    expect(port.posted[1]).toEqual({
      type: 'recorder/attach',
      setId: 't1',
      title: 'Tour',
    });
    act(() => port.emit({ type: 'recorder/attached', setId: 't1' }));
    expect(result.current.link).toBe('connected');
    act(() => {
      port.emit({ type: 'recorder/step', setId: 't1', step: step('a') });
      port.emit({ type: 'recorder/step', setId: 't1', step: step('a') });
    });
    await waitFor(() => expect(port.posted).toHaveLength(4));
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(port.posted.slice(2)).toEqual([
      { type: 'recorder/ack', setId: 't1', stepId: 'a' },
      { type: 'recorder/ack', setId: 't1', stepId: 'a' },
    ]);
  });

  it('ignores other tours, bad steps and steps it failed to save', async () => {
    const onStep = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useWebTourRecorder({ setId: 't1', title: 'Tour', onStep })
    );
    act(() => result.current.connect());
    act(() => {
      port.emit({ type: 'recorder/step', setId: 't2', step: step('x') });
      port.emit({
        type: 'recorder/step',
        setId: 't1',
        step: { ...step('../evil'), id: '../evil' },
      });
      port.emit({ type: 'recorder/step', setId: 't1', step: step('b') });
    });
    await waitFor(() => expect(onStep).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    // Not acknowledged, so the extension keeps it and re-sends on the next attach.
    expect(port.posted).toHaveLength(2);
  });

  it('reconnects when the extension restarts after attaching', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useWebTourRecorder({ setId: 't1', title: 'Tour', onStep: vi.fn() })
      );
      act(() => result.current.connect());
      act(() => port.emit({ type: 'recorder/attached', setId: 't1' }));
      const first = port;
      port = fakePort();
      act(() => first.fireDisconnect());
      expect(result.current.link).toBe('connecting');
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(connect).toHaveBeenCalledTimes(2);
      expect(port.posted[1]).toMatchObject({ type: 'recorder/attach' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps saving steps after a stop that lands mid-save', async () => {
    let finish = () => undefined as void;
    const onStep = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<void>((r) => (finish = () => r()))
      )
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useWebTourRecorder({ setId: 't1', title: 'Tour', onStep })
    );
    act(() => result.current.connect());
    const first = port;
    first.postMessage = () => {
      if (first.disconnect.mock.calls.length)
        throw new Error('Attempting to use a disconnected port object');
      first.posted.push('posted');
    };
    act(() =>
      first.emit({ type: 'recorder/step', setId: 't1', step: step('a') })
    );
    await waitFor(() => expect(onStep).toHaveBeenCalledTimes(1));
    act(() => result.current.disconnect());
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    port = fakePort();
    act(() => result.current.connect());
    act(() =>
      port.emit({ type: 'recorder/step', setId: 't1', step: step('b') })
    );
    await waitFor(() =>
      expect(port.posted).toContainEqual({
        type: 'recorder/ack',
        setId: 't1',
        stepId: 'b',
      })
    );
  });

  it('asks to re-pick a step once attached, then saves and acks the new pick', async () => {
    const onStep = vi.fn(() => Promise.resolve());
    const onRepicked = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useWebTourRecorder({ setId: 't1', title: 'Tour', onStep, onRepicked })
    );
    act(() => result.current.repick('a'));
    expect(connect).toHaveBeenCalledTimes(1);
    act(() => port.emit({ type: 'recorder/attached', setId: 't1' }));
    expect(port.posted).toContainEqual({
      type: 'recorder/repick',
      setId: 't1',
      stepId: 'a',
    });
    act(() =>
      port.emit({ type: 'recorder/repicked', setId: 't1', step: step('a') })
    );
    await waitFor(() =>
      expect(port.posted).toContainEqual({
        type: 'recorder/ack',
        setId: 't1',
        stepId: 'a',
      })
    );
    expect(onRepicked).toHaveBeenCalledTimes(1);
    expect(onStep).not.toHaveBeenCalled();
    // Already attached: a second Fix on site posts straight away.
    act(() => result.current.repick('b'));
    expect(port.posted.at(-1)).toEqual({
      type: 'recorder/repick',
      setId: 't1',
      stepId: 'b',
    });
  });

  it('reports no extension', () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    const { result } = renderHook(() =>
      useWebTourRecorder({ setId: 't1', title: 'Tour', onStep: vi.fn() })
    );
    act(() => result.current.connect());
    expect(result.current.link).toBe('unavailable');
  });
});
