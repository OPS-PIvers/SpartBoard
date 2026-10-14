import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import '@/i18n';
import type { RecordingConfig, ResponseArtifact } from '@/types';
import type {
  WhiteboardRecordingDeps,
  WhiteboardTake,
} from '@/hooks/useWhiteboardRecording';
import type {
  RecoveredTake,
  TakeRecoveryStore,
} from '@/utils/takeRecoveryStore';
import { serializeWhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLog';
import { WhiteboardResponseCapture } from './WhiteboardResponseCapture';
import { commitActiveTake } from './activeTake';

const canvasMounts: { key: number; props: Record<string, unknown> }[] = [];
let mountCount = 0;

vi.mock('@/components/quiz/whiteboard/WhiteboardCanvas', async () => {
  const ReactMod = await import('react');
  const WhiteboardCanvas = ReactMod.forwardRef<
    { flush: () => unknown[] },
    { disabled?: boolean }
  >(function FakeCanvas(props, ref) {
    const [id] = ReactMod.useState(() => ++mountCount);
    ReactMod.useImperativeHandle(ref, () => ({ flush: () => [] }));
    canvasMounts.push({ key: id, props });
    return (
      <div
        data-testid="canvas"
        data-mount={id}
        data-disabled={String(!!props.disabled)}
      />
    );
  });
  return { WhiteboardCanvas };
});

vi.mock('@/components/quiz/whiteboard/WhiteboardReplayView', () => ({
  WhiteboardReplayView: (p: { durationMs: number; audioSrc?: string }) => (
    <div
      data-testid="replay"
      data-duration={p.durationMs}
      data-audio={p.audioSrc ?? ''}
    />
  ),
}));

const renderPicture = vi.fn(() =>
  Promise.resolve(new Blob(['png'], { type: 'image/png' }))
);
vi.mock('@/components/quiz/whiteboard/whiteboardPicture', () => ({
  renderWhiteboardPicture: (...a: unknown[]) => renderPicture(...(a as [])),
}));

const ACKED = 1_700_000_000_000;

const config = (over: Partial<RecordingConfig> = {}): RecordingConfig => ({
  prepSeconds: 0,
  limitSeconds: 60,
  prepExpiry: 'armed',
  takeLimit: null,
  mode: 'whiteboard',
  ...over,
});

class MockRecorder {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const clock = { now: 0 };
function deps(denied = false): WhiteboardRecordingDeps {
  const track = { readyState: 'live', stop: () => undefined };
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  return {
    getStream: vi.fn(() =>
      denied
        ? Promise.reject(new DOMException('no', 'NotAllowedError'))
        : Promise.resolve(stream)
    ),
    createRecorder: () => new MockRecorder() as unknown as MediaRecorder,
    isTypeSupported: () => true,
    now: () => clock.now,
  };
}

function memoryStore(seed?: RecoveredTake) {
  const removed: string[] = [];
  const store: TakeRecoveryStore = {
    begin: vi.fn(() => Promise.resolve()),
    appendChunk: vi.fn(() => Promise.resolve()),
    setLog: vi.fn(() => Promise.resolve()),
    load: vi.fn(() => Promise.resolve(seed ?? null)),
    remove: vi.fn((key: string) => {
      removed.push(key);
      return Promise.resolve();
    }),
  } as unknown as TakeRecoveryStore;
  return { store, removed };
}

function renderCapture(
  props: Partial<React.ComponentProps<typeof WhiteboardResponseCapture>> = {}
) {
  const onCommit = vi.fn((_take: WhiteboardTake) => Promise.resolve());
  const utils = render(
    <WhiteboardResponseCapture
      config={config()}
      takesCommitted={0}
      noticeAckedAt={ACKED}
      onAcknowledgeNotice={() => undefined}
      onCommit={onCommit}
      recorderDeps={deps()}
      {...props}
    />
  );
  return { ...utils, onCommit };
}

async function record() {
  await act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    return Promise.resolve();
  });
}

async function stop() {
  clock.now += 5_000;
  await act(() => {
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    return Promise.resolve();
  });
}

beforeEach(() => {
  clock.now = 1_000;
  canvasMounts.length = 0;
  renderPicture.mockClear();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('WhiteboardResponseCapture', () => {
  it('shows the notice first and never asks for the mic', () => {
    const d = deps();
    renderCapture({ noticeAckedAt: null, recorderDeps: d });
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(d.getStream).not.toHaveBeenCalled();
  });

  it('keeps the page visible but locked during thinking time', () => {
    renderCapture({ config: config({ prepSeconds: 30 }) });
    expect(screen.getByTestId('canvas').dataset.disabled).toBe('true');
    expect(screen.getByText('Thinking time')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
  });

  it('unlocks drawing only while recording', async () => {
    renderCapture();
    expect(screen.getByTestId('canvas').dataset.disabled).toBe('true');
    expect(screen.getByText('Press Record to draw and talk.')).toBeTruthy();
    await record();
    expect(screen.getByTestId('canvas').dataset.disabled).toBe('false');
  });

  it('reviews, then commits picture, log and audio and starts a fresh page', async () => {
    const { onCommit } = renderCapture();
    const firstMount = screen.getByTestId('canvas').dataset.mount;
    await record();
    await stop();
    const replay = await screen.findByTestId('replay');
    expect(replay.dataset.duration).toBe('5000');
    expect(onCommit).not.toHaveBeenCalled();

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep this take' }));
      return Promise.resolve();
    });
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const take = onCommit.mock.calls[0][0];
    expect(take.picture.type).toBe('image/png');
    expect(take.log.type).toBe('application/json');
    expect((JSON.parse(await take.log.text()) as { v: number }).v).toBe(1);
    expect(take.audio?.mimeType).toBe('audio/webm');
    expect(take.micState).toBe('on');
    expect(take.durationMs).toBe(5_000);
    await waitFor(() =>
      expect(screen.getByTestId('canvas').dataset.mount).not.toBe(firstMount)
    );
  });

  it('discard never writes and restarts from the starting page', async () => {
    const { store, removed } = memoryStore();
    const { onCommit } = renderCapture({
      recovery: { store, key: 'k' },
    });
    const firstMount = screen.getByTestId('canvas').dataset.mount;
    await record();
    await stop();
    await screen.findByTestId('replay');
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      return Promise.resolve();
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(removed).toEqual(['k']);
    expect(screen.getByTestId('canvas').dataset.mount).not.toBe(firstMount);
    expect(screen.getByRole('button', { name: 'Record' })).toBeTruthy();
  });

  it('a take discarded mid-render does not lend its picture to the next', async () => {
    let finish: (b: Blob) => void = () => undefined;
    renderPicture.mockImplementationOnce(
      () => new Promise<Blob>((r) => (finish = r))
    );
    const { onCommit } = renderCapture();
    await record();
    await stop();
    await screen.findByTestId('replay');
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
      return Promise.resolve();
    });
    const stale = new Blob(['stale'], { type: 'image/png' });
    await act(() => {
      finish(stale);
      return Promise.resolve();
    });
    await record();
    await stop();
    await screen.findByTestId('replay');
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep this take' }));
      return Promise.resolve();
    });
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit.mock.calls[0][0].picture).not.toBe(stale);
  });

  it('commits the moment the take ends when review is off', async () => {
    const { onCommit } = renderCapture({ config: config({ review: false }) });
    await record();
    await stop();
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Keep this take' })).toBeNull();
  });

  it('draw-only skips the mic and records no mic state', async () => {
    const d = deps();
    const { onCommit } = renderCapture({
      config: config({ explainAloud: false, review: false }),
      recorderDeps: d,
    });
    expect(screen.getByText('Press Record to start drawing.')).toBeTruthy();
    await record();
    await stop();
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(d.getStream).not.toHaveBeenCalled();
    const take = onCommit.mock.calls[0][0];
    expect(take.audio).toBeNull();
    expect(take.micState).toBeUndefined();
  });

  it('a blocked mic still records the drawing', async () => {
    renderCapture({ recorderDeps: deps(true) });
    await record();
    expect(screen.getByTestId('canvas').dataset.disabled).toBe('false');
    expect(
      screen.getByText('Your microphone is off. Your drawing still counts.')
    ).toBeTruthy();
  });

  it('a cutoff mid-take commits what was captured', async () => {
    const { onCommit } = renderCapture();
    await record();
    clock.now += 2_000;
    await commitActiveTake();
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
  });

  it('opens a recovered take in review', async () => {
    const log = serializeWhiteboardLog({
      v: 1,
      page: { w: 1600, h: 1200 },
      startingPageId: 'x',
      events: [],
    });
    const { store } = memoryStore({
      key: 'k',
      mimeType: 'audio/webm',
      startedAt: 10_000,
      updatedAt: 17_000,
      chunks: [new Blob(['a'])],
      log,
      micState: 'on',
    });
    const { onCommit } = renderCapture({ recovery: { store, key: 'k' } });
    const replay = await screen.findByTestId('replay');
    expect(replay.dataset.duration).toBe('7000');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('keeps a recovered take when the parent re-renders mid-load', async () => {
    const log = serializeWhiteboardLog({
      v: 1,
      page: { w: 1600, h: 1200 },
      startingPageId: 'x',
      events: [],
    });
    let resolve: (t: RecoveredTake) => void = () => undefined;
    const { store } = memoryStore();
    store.load = vi.fn(
      () => new Promise<RecoveredTake | null>((r) => (resolve = r))
    );
    const props = {
      config: config(),
      takesCommitted: 0,
      noticeAckedAt: ACKED,
      onAcknowledgeNotice: () => undefined,
      onCommit: () => Promise.resolve(),
      recorderDeps: deps(),
    };
    const { rerender } = render(
      <WhiteboardResponseCapture {...props} recovery={{ store, key: 'k' }} />
    );
    rerender(
      <WhiteboardResponseCapture {...props} recovery={{ store, key: 'k' }} />
    );
    resolve({
      key: 'k',
      mimeType: 'audio/webm',
      startedAt: 10_000,
      updatedAt: 13_000,
      chunks: [],
      log,
      micState: 'on',
    });
    const replay = await screen.findByTestId('replay');
    expect(replay.dataset.duration).toBe('3000');
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it('hides Record once the take limit is used', () => {
    renderCapture({ config: config({ takeLimit: 1 }), takesCommitted: 1 });
    expect(screen.queryByRole('button', { name: /Record/ })).toBeNull();
    expect(screen.getByText('No takes left')).toBeTruthy();
  });

  it('shows the worst upload state across the take', () => {
    const art = (s: ResponseArtifact['uploadState']): ResponseArtifact => ({
      id: s ?? 'x',
      slot: 'primary',
      kind: 'whiteboard',
      mimeType: 'image/png',
      bytes: 1,
      durationMs: 1,
      uploadState: s,
    });
    renderCapture({
      latestArtifacts: [art('uploaded'), art('failed')],
      onRetryUpload: () => Promise.resolve(),
    });
    expect(
      screen.getByText("Your answer didn't send. Choose Try again.")
    ).toBeTruthy();
  });
});
