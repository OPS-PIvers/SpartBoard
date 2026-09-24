import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';
import type { StepEvent } from '../types/stage';

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const next: GuidedLearningStep = {
  id: 'after',
  xPct: 30,
  yPct: 30,
  imageIndex: 0,
  interactionType: 'tooltip',
  text: 'Done',
  cursor: { hide: true },
};

// A 60s clip on a step whose reading time is the 3s floor.
const mediaSet = (media: Partial<GuidedLearningStep>): GuidedLearningSet => ({
  id: 'media-set',
  title: 'Media',
  imageUrls: ['https://example.com/slide.png'],
  steps: [
    {
      id: 'clip',
      xPct: 50,
      yPct: 50,
      imageIndex: 0,
      interactionType: 'audio',
      label: 'Listen',
      ...media,
    },
    next,
  ],
  mode: 'guided',
  createdAt: 0,
  updatedAt: 0,
});

const audioSet = () =>
  mediaSet({ interactionType: 'audio', audioUrl: 'https://x/clip.mp3' });
const videoSet = () =>
  mediaSet({ interactionType: 'video', videoUrl: 'https://x/clip.mp4' });
const youtubeSet = () =>
  mediaSet({
    interactionType: 'video',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });

const loadSlide = () =>
  fireEvent.load(
    document.querySelector('[data-gl-stage] img') as HTMLImageElement
  );
// The footer's Play, not the audio card's own.
const footerPlay = () =>
  screen.getAllByRole('button', { name: /^play$/i }).at(-1) as HTMLElement;

function renderPlayer(
  set: GuidedLearningSet,
  props: Partial<React.ComponentProps<typeof GuidedLearningPlayer>> = {}
) {
  const view = render(
    <GuidedLearningPlayer set={set} playerV2 autoPlay {...props} />
  );
  loadSlide();
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(
    () => undefined
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
  delete window.YT;
});

describe('GuidedLearningPlayer media steps hold the clock (v2)', () => {
  it('does not advance an audio clip at 5s, and advances on ended', () => {
    const events: StepEvent[] = [];
    renderPlayer(audioSet(), { onStepEvent: (e) => events.push(e) });
    tick(5000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    tick(55000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.ended(document.querySelector('audio') as HTMLAudioElement);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(
      events.some((e) => e.type === 'complete' && e.stepId === 'clip')
    ).toBe(true);
  });

  it('does not advance an uploaded video at 5s, and advances on ended', () => {
    renderPlayer(videoSet());
    tick(5000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.ended(document.querySelector('video') as HTMLVideoElement);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('advances a YouTube step on the IFrame API ENDED state', () => {
    let onStateChange: ((e: { data: number }) => void) | undefined;
    const Player = vi.fn(function (
      this: unknown,
      _id: string,
      opts: { events?: { onStateChange?: (e: { data: number }) => void } }
    ) {
      onStateChange = opts.events?.onStateChange;
      return { destroy: vi.fn() };
    });
    window.YT = { Player } as unknown as typeof window.YT;
    renderPlayer(youtubeSet());
    expect(Player).toHaveBeenCalledTimes(1);
    expect(Player.mock.calls[0][1]).toMatchObject({ videoId: 'dQw4w9WgXcQ' });
    tick(5000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    act(() => onStateChange?.({ data: 1 }));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    act(() => onStateChange?.({ data: 0 }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('waits for Next when the YouTube API never loads', () => {
    renderPlayer(youtubeSet());
    expect(
      document.querySelector('script[src*="youtube.com/iframe_api"]')
    ).not.toBeNull();
    tick(60000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('advances on the step clock after a clip that ended while paused', () => {
    renderPlayer(audioSet(), { autoPlay: false });
    fireEvent.ended(document.querySelector('audio') as HTMLAudioElement);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(footerPlay());
    tick(3100);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('keeps v1 on the step clock with a plain YouTube embed', () => {
    render(<GuidedLearningPlayer set={audioSet()} />);
    loadSlide();
    fireEvent.click(footerPlay());
    tick(5100);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    cleanup();
    render(<GuidedLearningPlayer set={youtubeSet()} />);
    expect(
      document.querySelector('iframe[src*="youtube.com/embed"]')
    ).not.toBeNull();
  });
});
