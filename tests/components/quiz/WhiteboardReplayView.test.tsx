import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import type { WhiteboardLog } from '@/components/quiz/whiteboard/whiteboardLog';

const cursorAt = vi.fn((_ms: number) => []);
vi.mock('@/components/quiz/whiteboard/whiteboardLog', () => ({
  createWhiteboardReplayer: () => ({ seek: cursorAt, durationMs: 30_000 }),
  whiteboardLogDuration: () => 30_000,
}));
vi.mock('@/utils/whiteboard/startingPage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/whiteboard/startingPage')>()),
  renderStartingPageCanvas: vi.fn(() => document.createElement('canvas')),
}));

const { WhiteboardReplayView } =
  await import('@/components/quiz/whiteboard/WhiteboardReplayView');

const LOG = { v: 1, events: [] } as unknown as WhiteboardLog;

const mockSliderRect = () => {
  const slider = screen.getByRole('slider');
  vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 48,
    width: 400,
    height: 48,
    toJSON: () => ({}),
  });
  return slider;
};

const lastAt = () => cursorAt.mock.calls.at(-1)?.[0];

const fakeCtx = (canvas: HTMLCanvasElement) => {
  const state: Record<string, unknown> = { canvas };
  return new Proxy(state, {
    get: (target, key: string): unknown =>
      key in target ? target[key] : () => undefined,
    set: (target, key: string, value: unknown) => {
      target[key] = value;
      return true;
    },
  });
};

beforeEach(() => {
  cursorAt.mockClear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      return fakeCtx(this) as unknown as CanvasRenderingContext2D;
    } as never
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WhiteboardReplayView', () => {
  it('opens on the final picture without painting a replay frame', () => {
    render(
      <WhiteboardReplayView
        pictureUrl="data:image/png;base64,AA=="
        log={LOG}
        startingPage={{ pattern: { kind: 'grid' } }}
        durationMs={60_000}
      />
    );
    expect(screen.getByAltText('Finished drawing')).toBeInTheDocument();
    expect(cursorAt).not.toHaveBeenCalled();
  });

  it('scrubbing switches to the replay at that moment, backwards too', () => {
    render(
      <WhiteboardReplayView
        pictureUrl="data:image/png;base64,AA=="
        log={LOG}
        durationMs={60_000}
      />
    );
    const slider = mockSliderRect();
    fireEvent.pointerDown(slider, { clientX: 300, button: 0, pointerId: 1 });
    expect(screen.queryByAltText('Finished drawing')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Drawing replay' })).toBeVisible();
    expect(lastAt()).toBe(45_000);
    fireEvent.pointerMove(slider, { clientX: 100, pointerId: 1 });
    expect(lastAt()).toBe(15_000);
  });

  it('plays a draw-only take on its own clock and stops at the end', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] });
    const onPositionChange = vi.fn();
    render(
      <WhiteboardReplayView
        pictureUrl="data:image/png;base64,AA=="
        log={LOG}
        durationMs={2_000}
        onPositionChange={onPositionChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play the drawing' }));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(lastAt()).toBeGreaterThanOrEqual(900);
    expect(lastAt()).toBeLessThanOrEqual(1_100);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(lastAt()).toBe(2_000);
    expect(onPositionChange).toHaveBeenLastCalledWith(2_000);
    expect(
      screen.getByRole('button', { name: 'Play the drawing' })
    ).toBeInTheDocument();
  });

  it('follows the audio element as the clock for a narrated take', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] });
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const { container } = render(
      <WhiteboardReplayView
        pictureUrl="data:image/png;base64,AA=="
        log={LOG}
        audioSrc="blob:narration"
        durationMs={60_000}
      />
    );
    const audio = container.querySelector('audio') as HTMLAudioElement;
    fireEvent.click(screen.getByRole('button', { name: 'Play the drawing' }));
    expect(play).toHaveBeenCalled();
    audio.currentTime = 12.5;
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(lastAt()).toBe(12_500);
  });

  it('honours a parent seek request once per nonce', () => {
    const { rerender } = render(
      <WhiteboardReplayView
        pictureUrl="data:image/png;base64,AA=="
        log={LOG}
        durationMs={60_000}
        seekToMs={20_000}
        seekNonce={1}
      />
    );
    expect(lastAt()).toBe(20_000);
    const calls = cursorAt.mock.calls.length;
    rerender(
      <WhiteboardReplayView
        pictureUrl="data:image/png;base64,AA=="
        log={LOG}
        durationMs={60_000}
        seekToMs={20_000}
        seekNonce={1}
      />
    );
    expect(cursorAt.mock.calls.length).toBe(calls);
  });

  it('keeps the picture and disables Play when the drawing log is missing', () => {
    render(
      <WhiteboardReplayView
        pictureUrl="data:image/png;base64,AA=="
        log={null}
        durationMs={60_000}
      />
    );
    expect(screen.getByAltText('Finished drawing')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play the drawing' })
    ).toBeDisabled();
  });
});
