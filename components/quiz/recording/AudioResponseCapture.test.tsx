import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { AudioResponseCapture } from './AudioResponseCapture';
import { commitActiveTake } from './activeTake';
import type { RecordingConfig, ResponseArtifact } from '@/types';
import type { AudioRecordingDeps } from '@/hooks/useAudioRecording';
import { memoryTakeRecoveryStore } from '@/utils/takeRecoveryStore';

const config: RecordingConfig = {
  prepSeconds: 0,
  limitSeconds: 60,
  prepExpiry: 'armed',
  takeLimit: null,
};

const deps: AudioRecordingDeps = {
  getStream: vi.fn(),
  createRecorder: vi.fn(),
  isTypeSupported: () => true,
  now: () => 0,
};

const failedArtifact: ResponseArtifact = {
  id: 'art-1',
  slot: 'primary',
  kind: 'audio',
  mimeType: 'audio/webm',
  bytes: 1000,
  durationMs: 4000,
  uploadState: 'failed',
};

function renderCapture(
  props: Partial<React.ComponentProps<typeof AudioResponseCapture>> = {}
) {
  return render(
    <AudioResponseCapture
      config={config}
      takesCommitted={1}
      noticeAckedAt={1700000000000}
      onAcknowledgeNotice={() => undefined}
      onCommit={() => Promise.resolve()}
      latestArtifact={failedArtifact}
      recorderDeps={deps}
      {...props}
    />
  );
}

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

function liveDeps(clock: { now: number }): AudioRecordingDeps {
  const track = { readyState: 'live', stop: () => undefined };
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
  return {
    getStream: () => Promise.resolve(stream),
    createRecorder: () => new MockRecorder() as unknown as MediaRecorder,
    isTypeSupported: () => true,
    now: () => clock.now,
  };
}

// After a turn-in the record button reads Redo.
const RECORD = /^(Record|Redo)$/i;

beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:take');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('AudioResponseCapture — closed recording window', () => {
  it('locks the recorder and offers no controls', () => {
    renderCapture({ slotClosed: true, takesCommitted: 0 });

    expect(screen.getByText(/Recording time is over/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Turn in$/i })).toBeNull();
    expect(screen.queryByText(/Before you record/i)).toBeNull();
  });

  it('outranks an unacknowledged notice', () => {
    renderCapture({ slotClosed: true, noticeAckedAt: null });

    expect(screen.getByText(/Recording time is over/i)).toBeTruthy();
    expect(screen.queryByText(/Before you record/i)).toBeNull();
  });
});

describe('AudioResponseCapture — notice reminder overlay', () => {
  it('layers over live capture instead of replacing it', async () => {
    const clock = { now: 0 };
    renderCapture({ recorderDeps: liveDeps(clock), latestArtifact: undefined });

    fireEvent.click(screen.getByRole('button', { name: /Why we’re asking/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Redo$/i }));
    expect(
      await screen.findByRole('button', { name: /Stop recording/i })
    ).toBeTruthy();
    // The reminder is open while capture runs; Stop is still reachable.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('closes on Escape and returns focus to the reminder link', async () => {
    renderCapture({ latestArtifact: undefined });
    const link = screen.getByRole('button', { name: /Why we’re asking/i });

    fireEvent.click(link);
    const close = screen.getByRole('button', { name: /^Close$/i });
    await waitFor(() => expect(document.activeElement).toBe(close));

    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(link);
  });

  it('disables the reminder link while recording', async () => {
    const clock = { now: 0 };
    renderCapture({ recorderDeps: liveDeps(clock), latestArtifact: undefined });

    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    await screen.findByRole('button', { name: /Stop recording/i });
    expect(
      screen.getByRole('button', { name: /Why we’re asking/i })
    ).toHaveProperty('disabled', true);
  });
});

describe('AudioResponseCapture — playback progress', () => {
  it('announces elapsed and total time, not a percentage', async () => {
    const clock = { now: 0 };
    const { container } = renderCapture({
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
    });

    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    const stop = await screen.findByRole('button', {
      name: /Stop recording/i,
    });
    clock.now = 45_000;
    fireEvent.click(stop);

    const bar = await screen.findByRole('progressbar');
    expect(bar.getAttribute('aria-label')).toMatch(/Playback position/i);
    expect(bar.getAttribute('aria-valuetext')).toBe('0:00 of 0:45');

    const audio = container.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'currentTime', { value: 19, writable: true });
    fireEvent.timeUpdate(audio);
    await waitFor(() =>
      expect(
        screen.getByRole('progressbar').getAttribute('aria-valuetext')
      ).toBe('0:19 of 0:45')
    );
  });
});

describe('AudioResponseCapture — retry focus', () => {
  it('keeps focus on the retry button when the retry fails again', async () => {
    const user = userEvent.setup();
    const onRetryUpload = vi.fn().mockRejectedValue(new Error('nope'));
    renderCapture({ onRetryUpload });

    const retry = screen.getByRole('button', { name: /Try again/i });
    await user.click(retry);

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: /Try again/i })
      )
    );
  });

  it('moves focus to the status banner when the retry succeeds', async () => {
    const onRetryUpload = vi.fn().mockResolvedValue(undefined);
    const { container } = renderCapture({ onRetryUpload });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
      await Promise.resolve();
    });

    const banner = container.querySelector('[tabindex="-1"]');
    await waitFor(() => expect(document.activeElement).toBe(banner));
  });
});

describe('AudioResponseCapture — failed upload', () => {
  it('offers a real retry that re-sends the same artifact', () => {
    const onRetryUpload = vi.fn().mockResolvedValue(undefined);
    renderCapture({ onRetryUpload });

    expect(screen.getByText(/didn't send\. Choose Try again/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));
    expect(onRetryUpload).toHaveBeenCalledTimes(1);
  });

  it('tells the truth and offers no retry when the bytes are gone', () => {
    renderCapture();

    expect(screen.getByText(/can't be sent from this device/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Try again/i })).toBeNull();
    expect(screen.queryByText(/We are still trying/i)).toBeNull();
  });
});

describe('AudioResponseCapture — dark shell', () => {
  it('renders a dark card in the teacher-paced shell', () => {
    const { container } = renderCapture({ light: false });
    const section = container.querySelector('section');
    expect(section?.className).toContain('bg-slate-800/60');
    expect(section?.className).not.toContain('bg-white/90');
  });

  it('renders a light card by default', () => {
    const { container } = renderCapture();
    expect(container.querySelector('section')?.className).toContain(
      'bg-white/90'
    );
  });

  it('carries the dark shell into the closed-slot state', () => {
    const { container } = renderCapture({ light: false, slotClosed: true });
    expect(screen.getByText(/Recording time is over/i)).toBeTruthy();
    expect(container.querySelector('section')?.className).toContain(
      'bg-slate-800/60'
    );
  });

  it('carries the dark shell into the consent notice', () => {
    const { container } = renderCapture({ light: false, noticeAckedAt: null });
    expect(screen.getByText(/Before you record/i)).toBeTruthy();
    expect(container.querySelector('section')?.className).toContain(
      'bg-slate-800/60'
    );
  });
});

describe('AudioResponseCapture — used-up budget', () => {
  it('shows the turned-in answer and no record button', () => {
    renderCapture({
      config: { ...config, takeLimit: 1 },
      takesCommitted: 1,
      latestArtifact: undefined,
    });
    expect(screen.getByText('Turned in')).toBeTruthy();
    expect(screen.queryByRole('button', { name: RECORD })).toBeNull();
  });

  it('still offers Record when redos used the budget but nothing was turned in', () => {
    localStorage.setItem(
      'quiz-redos:s1/r1/q9',
      JSON.stringify({ redos: 2, takes: 0 })
    );
    renderCapture({
      config: { ...config, takeLimit: 2 },
      takesCommitted: 0,
      latestArtifact: undefined,
      recovery: { store: memoryTakeRecoveryStore(), key: 's1/r1/q9' },
    });
    expect(screen.getByRole('button', { name: RECORD })).toBeTruthy();
    localStorage.clear();
  });
});

describe('AudioResponseCapture — cutoffs commit first (D16)', () => {
  it('stops a running take and commits it', async () => {
    const clock = { now: 0 };
    const onCommit = vi.fn().mockResolvedValue(undefined);
    renderCapture({
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
      onCommit,
    });

    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    await screen.findByRole('button', { name: /Stop recording/i });
    clock.now = 12_000;

    await commitActiveTake();

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0]).toMatchObject({ durationMs: 12_000 });
    expect(
      screen.queryByRole('button', { name: /Stop recording/i })
    ).toBeNull();
  });

  it('commits a take waiting in review', async () => {
    const clock = { now: 0 };
    const onCommit = vi.fn().mockResolvedValue(undefined);
    renderCapture({
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
      onCommit,
    });

    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Stop recording/i })
    );
    await screen.findByRole('button', { name: /^Turn in$/i });

    await commitActiveTake();

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits nothing when no take is running', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    renderCapture({ latestArtifact: undefined, onCommit });

    await commitActiveTake();

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not commit twice when the student already pressed commit', async () => {
    const clock = { now: 0 };
    let finish: () => void = () => undefined;
    const onCommit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    renderCapture({
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
      onCommit,
    });

    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Stop recording/i })
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Turn in$/i }));

    let cutoffDone = false;
    const cutoff = commitActiveTake().then(() => {
      cutoffDone = true;
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(cutoffDone).toBe(false);
    await act(async () => {
      finish();
      await cutoff;
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(cutoffDone).toBe(true);
  });

  it('stops answering once unmounted', async () => {
    const clock = { now: 0 };
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderCapture({
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
      onCommit,
    });
    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    await screen.findByRole('button', { name: /Stop recording/i });
    unmount();

    await commitActiveTake();

    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('AudioResponseCapture — review setting', () => {
  it('commits the moment Stop is pressed when review is off', async () => {
    const clock = { now: 0 };
    const onCommit = vi.fn(() => Promise.resolve());
    renderCapture({
      config: { ...config, review: false },
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
      takesCommitted: 0,
      onCommit,
    });

    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    const stop = await screen.findByRole('button', {
      name: /Stop and submit/i,
    });
    clock.now = 12_000;
    fireEvent.click(stop);

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 12_000 })
    );
    expect(screen.queryByRole('button', { name: /^Turn in$/i })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('commits when the limit ends the take with review off', async () => {
    const clock = { now: 0 };
    const onCommit = vi.fn(() => Promise.resolve());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderCapture({
        config: { ...config, limitSeconds: 5, review: false },
        recorderDeps: liveDeps(clock),
        latestArtifact: undefined,
        takesCommitted: 0,
        onCommit,
      });
      fireEvent.click(screen.getByRole('button', { name: RECORD }));
      await screen.findByRole('button', { name: /Stop and submit/i });
      clock.now = 5_000;
      act(() => {
        vi.advanceTimersByTime(300);
      });
      await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the review step when the block has no review field', async () => {
    const clock = { now: 0 };
    const onCommit = vi.fn(() => Promise.resolve());
    renderCapture({
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
      onCommit,
    });

    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Stop recording/i })
    );
    expect(
      await screen.findByRole('button', { name: /^Turn in$/i })
    ).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('a cutoff waits for the review-off commit of a running take', async () => {
    const clock = { now: 0 };
    let finish: () => void = () => undefined;
    const onCommit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    renderCapture({
      config: { ...config, review: false },
      recorderDeps: liveDeps(clock),
      latestArtifact: undefined,
      takesCommitted: 0,
      onCommit,
    });
    fireEvent.click(screen.getByRole('button', { name: RECORD }));
    await screen.findByRole('button', { name: /Stop and submit/i });

    let cutoffDone = false;
    const cutoff = commitActiveTake().then(() => {
      cutoffDone = true;
    });
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(cutoffDone).toBe(false);
    await act(async () => {
      finish();
      await cutoff;
    });
    expect(cutoffDone).toBe(true);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('AudioResponseCapture — crash recovery', () => {
  const key = 's1/r1/q1';

  async function seededStore() {
    const store = memoryTakeRecoveryStore();
    const startedAt = Date.now() - 5000;
    await store.begin(key, 'audio/webm', startedAt);
    await store.appendChunk(
      key,
      new Blob(['saved'], { type: 'audio/webm' }),
      startedAt + 4000
    );
    return store;
  }

  it('opens a saved take on the review screen and keeps it on commit', async () => {
    const store = await seededStore();
    const onCommit = vi.fn(() => Promise.resolve());
    renderCapture({
      takesCommitted: 0,
      latestArtifact: undefined,
      onCommit,
      recovery: { store, key },
    });

    expect(await screen.findByText('Your saved attempt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Turn in$/i }));
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const [take] = onCommit.mock.calls[0] as unknown as [
      { blob: Blob; durationMs: number },
    ];
    expect(take.blob.size).toBeGreaterThan(0);
    expect(take.durationMs).toBe(4000);
    await waitFor(async () =>
      expect(await store.load(key, Date.now())).toBeNull()
    );
  });

  it('redoing a saved take wipes it without writing', async () => {
    const store = await seededStore();
    const onCommit = vi.fn(() => Promise.resolve());
    renderCapture({
      takesCommitted: 0,
      latestArtifact: undefined,
      onCommit,
      recovery: { store, key },
    });

    await screen.findByText('Your saved attempt');
    fireEvent.click(screen.getByRole('button', { name: /^Redo$/i }));
    expect(screen.getByRole('button', { name: /^Record$/i })).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
    await waitFor(async () =>
      expect(await store.load(key, Date.now())).toBeNull()
    );
  });

  it('commits a saved take straight away when review is off', async () => {
    const store = await seededStore();
    const onCommit = vi.fn(() => Promise.resolve());
    renderCapture({
      config: { ...config, review: false },
      takesCommitted: 0,
      latestArtifact: undefined,
      onCommit,
      recovery: { store, key },
    });

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Your saved attempt')).toBeNull();
    await waitFor(async () =>
      expect(await store.load(key, Date.now())).toBeNull()
    );
  });

  it('leaves a saved take alone once the recording window has closed', async () => {
    const store = await seededStore();
    const onCommit = vi.fn(() => Promise.resolve());
    renderCapture({
      config: { ...config, review: false },
      takesCommitted: 0,
      latestArtifact: undefined,
      slotClosed: true,
      onCommit,
      recovery: { store, key },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('offers nothing back when the take budget is spent', async () => {
    const store = await seededStore();
    renderCapture({
      config: { ...config, takeLimit: 1 },
      takesCommitted: 1,
      latestArtifact: undefined,
      recovery: { store, key },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('Your saved attempt')).toBeNull();
  });
});

describe('AudioResponseCapture — attempts are redos', () => {
  function TurnInHarness({
    takeLimit,
    onCommit,
    clock,
  }: {
    takeLimit: number | null;
    onCommit: () => void;
    clock: { now: number };
  }) {
    const [committed, setCommitted] = React.useState(0);
    const recorderDeps = React.useMemo(() => liveDeps(clock), [clock]);
    return (
      <AudioResponseCapture
        config={{ ...config, takeLimit }}
        takesCommitted={committed}
        noticeAckedAt={1700000000000}
        onAcknowledgeNotice={() => undefined}
        onCommit={() => {
          onCommit();
          setCommitted((n) => n + 1);
          return Promise.resolve();
        }}
        recorderDeps={recorderDeps}
      />
    );
  }

  async function recordAndStop(clock: { now: number }, label: RegExp) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    const stop = await screen.findByRole('button', { name: /Stop recording/i });
    clock.now += 5_000;
    fireEvent.click(stop);
    await screen.findByRole('button', { name: /^Turn in$/i });
  }

  it('shows the turned-in recording and offers Redo while attempts remain', async () => {
    const clock = { now: 0 };
    const onCommit = vi.fn();
    const { container } = render(
      <TurnInHarness takeLimit={3} onCommit={onCommit} clock={clock} />
    );

    await recordAndStop(clock, /^Record$/i);
    fireEvent.click(screen.getByRole('button', { name: /^Turn in$/i }));

    expect(await screen.findByText('Turned in')).toBeTruthy();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(container.querySelector('audio')?.getAttribute('src')).toBe(
      'blob:take'
    );
    expect(screen.getByRole('button', { name: /^Redo$/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record$/i })).toBeNull();
  });

  it('counts a redo in review against the take limit', async () => {
    const clock = { now: 0 };
    const onCommit = vi.fn();
    render(<TurnInHarness takeLimit={2} onCommit={onCommit} clock={clock} />);

    await recordAndStop(clock, /^Record$/i);
    fireEvent.click(screen.getByRole('button', { name: /^Redo$/i }));
    expect(onCommit).not.toHaveBeenCalled();

    await recordAndStop(clock, /^Record$/i);
    expect(screen.queryByRole('button', { name: /^Redo$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Turn in$/i }));
    expect(await screen.findByText('Turned in')).toBeTruthy();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: RECORD })).toBeNull();
  });

  it('offers no Redo in review on a one-attempt question', async () => {
    const clock = { now: 0 };
    render(<TurnInHarness takeLimit={1} onCommit={vi.fn()} clock={clock} />);

    await recordAndStop(clock, /^Record$/i);
    expect(screen.queryByRole('button', { name: /^Redo$/i })).toBeNull();
  });
});
