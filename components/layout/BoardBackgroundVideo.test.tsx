import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BoardBackgroundVideo } from './BoardBackgroundVideo';
import { buildBackgroundVideoSrc } from '@/utils/youtube';

type StateHandler = (event: { data: number }) => void;

describe('buildBackgroundVideoSrc', () => {
  it('leaves out the playlist loop that reloads the video', () => {
    const src = new URL(
      buildBackgroundVideoSrc('abcdefghijk', 'https://x.test', false)
    );
    expect(src.pathname).toBe('/embed/abcdefghijk');
    expect(src.searchParams.get('enablejsapi')).toBe('1');
    expect(src.searchParams.get('origin')).toBe('https://x.test');
    expect(src.searchParams.get('mute')).toBe('1');
    expect(src.searchParams.has('loop')).toBe(false);
    expect(src.searchParams.has('playlist')).toBe(false);
  });

  it('falls back to the playlist loop when asked', () => {
    const src = new URL(
      buildBackgroundVideoSrc('abcdefghijk', 'https://x.test', true)
    );
    expect(src.searchParams.get('loop')).toBe('1');
    expect(src.searchParams.get('playlist')).toBe('abcdefghijk');
  });
});

describe('BoardBackgroundVideo', () => {
  let handler: StateHandler | undefined;
  const seekTo = vi.fn();
  const playVideo = vi.fn();
  let ready: (() => void) | undefined;
  const Player = vi.fn(function (
    this: unknown,
    _el: HTMLElement,
    opts: { events?: { onStateChange?: StateHandler; onReady?: () => void } }
  ) {
    handler = opts.events?.onStateChange;
    ready = opts.events?.onReady;
    return { seekTo, playVideo };
  });

  beforeEach(() => {
    handler = undefined;
    seekTo.mockClear();
    playVideo.mockClear();
    Player.mockClear();
    (window as unknown as { YT: unknown }).YT = { Player };
  });

  afterEach(() => {
    delete (window as unknown as { YT?: unknown }).YT;
    vi.useRealTimers();
  });

  it('keeps the seek loop once the player connects', () => {
    vi.useFakeTimers();
    const onFallback = vi.fn();
    const ref = React.createRef<HTMLIFrameElement>();
    const { container } = render(
      <BoardBackgroundVideo
        videoId="abcdefghijk"
        ref={ref}
        onFallback={onFallback}
      />
    );
    act(() => ready?.());
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onFallback).not.toHaveBeenCalled();
    expect(container.querySelector('iframe')?.src).not.toContain('playlist=');
  });

  it('falls back to the plain YouTube loop when the player never connects', () => {
    vi.useFakeTimers();
    const onFallback = vi.fn();
    const ref = React.createRef<HTMLIFrameElement>();
    const { container } = render(
      <BoardBackgroundVideo
        videoId="abcdefghijk"
        ref={ref}
        onFallback={onFallback}
      />
    );
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onFallback).toHaveBeenCalledTimes(1);
    const iframe = container.querySelector('iframe');
    expect(iframe?.src).toContain('playlist=abcdefghijk');
    expect(ref.current).toBe(iframe);
  });

  it('loops by seeking to the start when the video ends', () => {
    const ref = React.createRef<HTMLIFrameElement>();
    const { container } = render(
      <BoardBackgroundVideo videoId="abcdefghijk" ref={ref} />
    );
    const iframe = container.querySelector('iframe');
    expect(ref.current).toBe(iframe);
    expect(Player).toHaveBeenCalledWith(iframe, expect.anything());
    expect(iframe?.src).not.toContain('playlist=');

    act(() => handler?.({ data: 1 }));
    expect(seekTo).not.toHaveBeenCalled();

    act(() => handler?.({ data: 0 }));
    expect(seekTo).toHaveBeenCalledWith(0, true);
    expect(playVideo).toHaveBeenCalled();
  });

  it('attaches a fresh player when the video changes', () => {
    const ref = React.createRef<HTMLIFrameElement>();
    const { rerender, container } = render(
      <BoardBackgroundVideo videoId="abcdefghijk" ref={ref} />
    );
    const stale = handler;
    rerender(<BoardBackgroundVideo videoId="zyxwvutsrqp" ref={ref} />);
    expect(Player).toHaveBeenCalledTimes(2);
    expect(container.querySelector('iframe')?.src).toContain(
      '/embed/zyxwvutsrqp'
    );
    act(() => stale?.({ data: 0 }));
    expect(seekTo).not.toHaveBeenCalled();
  });
});
