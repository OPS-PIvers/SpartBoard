import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';
import { writeResume } from './player/useResume';
import { holdsForMedia } from './player/playback';
import type { StepEvent } from '../types/stage';

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const tip = (id: string): GuidedLearningStep => ({
  id,
  xPct: 30,
  yPct: 30,
  imageIndex: 0,
  interactionType: 'tooltip',
  text: id,
  cursor: { hide: true },
});

const makeSet = (
  steps: GuidedLearningStep[],
  over: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id: 'review-set',
  title: 'Review',
  imageUrls: ['https://example.com/slide.png'],
  steps,
  mode: 'guided',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const media = (over: Partial<GuidedLearningStep>): GuidedLearningStep => ({
  id: 'clip',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'audio',
  label: 'Clip',
  ...over,
});

const loadSlides = () =>
  document
    .querySelectorAll('[data-gl-stage] img')
    .forEach((img) => fireEvent.load(img));

function renderPlayer(
  set: GuidedLearningSet,
  props: Partial<React.ComponentProps<typeof GuidedLearningPlayer>> = {}
) {
  const view = render(
    <GuidedLearningPlayer set={set} playerV2 autoPlay {...props} />
  );
  loadSlides();
  return view;
}

const nextButton = () => screen.getByRole('button', { name: /next step/i });

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
});

describe('GuidedLearningPlayer held (period paused, finishing card)', () => {
  it('stops Watch auto-advance while held and resumes when released', () => {
    const set = makeSet([tip('a'), tip('b')]);
    const { rerender } = renderPlayer(set, { held: true });
    tick(20000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    rerender(<GuidedLearningPlayer set={set} playerV2 autoPlay />);
    tick(20000);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('pauses the step’s audio while held', () => {
    const set = makeSet([
      media({ audioUrl: 'https://x/clip.mp3' }),
      tip('after'),
    ]);
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    const { rerender } = renderPlayer(set);
    pause.mockClear();
    rerender(<GuidedLearningPlayer set={set} playerV2 autoPlay held />);
    expect(pause).toHaveBeenCalled();
  });

  it('ignores step keys while held', () => {
    renderPlayer(makeSet([tip('a'), tip('b')], { mode: 'structured' }), {
      held: true,
    });
    nextButton().focus();
    fireEvent.keyDown(nextButton(), { key: 'ArrowRight' });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('keeps v1 on the clock whatever held says', () => {
    render(<GuidedLearningPlayer set={makeSet([tip('a'), tip('b')])} held />);
    loadSlides();
    fireEvent.click(screen.getAllByRole('button', { name: /^play$/i })[0]);
    tick(20000);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});

describe('GuidedLearningPlayer finishing a Watch run', () => {
  it('sends complete for the last step when Next finishes the run', () => {
    const events: StepEvent[] = [];
    const order: string[] = [];
    renderPlayer(makeSet([tip('a'), tip('b')]), {
      autoPlay: false,
      onStepEvent: (e) => {
        events.push(e);
        if (e.type === 'complete') order.push(`complete:${e.stepId}`);
      },
      onReachedEnd: () => order.push('end'),
    });
    fireEvent.click(nextButton());
    fireEvent.click(nextButton());
    expect(order).toEqual(['complete:b', 'end']);
  });

  it('sends complete once when the clock finishes the last step', () => {
    const events: StepEvent[] = [];
    const onReachedEnd = vi.fn();
    renderPlayer(makeSet([tip('a'), tip('b')]), {
      onStepEvent: (e) => events.push(e),
      onReachedEnd,
    });
    tick(20000);
    tick(20000);
    expect(onReachedEnd).toHaveBeenCalledTimes(1);
    expect(
      events.filter((e) => e.type === 'complete' && e.stepId === 'b')
    ).toHaveLength(1);
  });
});

describe('GuidedLearningPlayer media the player cannot hear end', () => {
  it('only holds for media whose end is observable', () => {
    const video = (videoUrl: string) =>
      holdsForMedia({ ...media({ interactionType: 'video' }), videoUrl });
    expect(video('https://x/clip.mp4')).toBe(true);
    expect(video('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(
      video(
        'https://firebasestorage.googleapis.com/v0/b/b/o/gl%2Fclip?alt=media'
      )
    ).toBe(true);
    expect(video('https://vimeo.com/123456')).toBe(false);
    expect(video('https://drive.google.com/file/d/abc/view')).toBe(false);
  });

  it('runs a Vimeo step on the step clock', () => {
    renderPlayer(
      makeSet([
        media({ interactionType: 'video', videoUrl: 'https://vimeo.com/1' }),
        tip('after'),
      ])
    );
    tick(20000);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('resumes the clock when the video is closed', () => {
    renderPlayer(
      makeSet([
        media({ interactionType: 'video', videoUrl: 'https://x/clip.mp4' }),
        tip('after'),
      ])
    );
    tick(20000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close video/i }));
    tick(200);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('resumes the clock when the audio fails to load', () => {
    renderPlayer(
      makeSet([media({ audioUrl: 'https://x/clip.mp3' }), tip('after')])
    );
    tick(20000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.error(document.querySelector('audio') as HTMLAudioElement);
    tick(200);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});

describe('GuidedLearningPlayer keyboard scope', () => {
  it('lets only the player that owns the focused footer button take an arrow key', () => {
    const set = makeSet([tip('a'), tip('b')], { mode: 'structured' });
    render(
      <>
        <GuidedLearningPlayer set={set} playerV2 />
        <GuidedLearningPlayer set={{ ...set, id: 'other' }} playerV2 />
      </>
    );
    const [rootA, rootB] = screen.getAllByTestId('gl-player-root');
    const { matches } = Element.prototype as {
      matches: (s: string) => boolean;
    };
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      sel: string
    ) {
      if (sel === ':hover') return this === rootA;
      return matches.call(this, sel);
    });
    // Focus in B while the pointer rests on A, whose listener runs first.
    const nextB = within(rootB).getByRole('button', { name: /next step/i });
    nextB.focus();
    fireEvent.keyDown(nextB, { key: 'ArrowRight' });
    expect(within(rootB).getByText('2 / 2')).toBeInTheDocument();
    expect(within(rootA).getByText('1 / 2')).toBeInTheDocument();
  });
});

describe('GuidedLearningPlayer resume prompt', () => {
  it('does not let media under the resume prompt advance the step', () => {
    writeResume({
      id: 'review-set',
      idx: 2,
      mode: 'watch',
      updatedAt: Date.now(),
    });
    renderPlayer(
      makeSet([media({ audioUrl: 'https://x/clip.mp3' }), tip('b'), tip('c')])
    );
    expect(screen.getByText('Resume at step 3?')).toBeInTheDocument();
    fireEvent.ended(document.querySelector('audio') as HTMLAudioElement);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });
});

describe('GuidedLearningPlayer Studio preview (teacherMode)', () => {
  it('does not show a revisited question as recorded', () => {
    vi.useRealTimers();
    const set = makeSet(
      [
        {
          id: 'mc',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'question',
          question: {
            type: 'multiple-choice',
            text: 'Capital of France?',
            choices: ['Paris', 'Rome'],
            correctAnswer: 'Paris',
          },
        },
        tip('after'),
      ],
      { mode: 'structured' }
    );
    render(<GuidedLearningPlayer set={set} playerV2 teacherMode />);
    fireEvent.click(screen.getByText('Paris'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Answer' }));
    expect(screen.getByText('Correct!')).toBeInTheDocument();
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole('button', { name: /previous step/i }));
    expect(screen.queryByText('Answer recorded')).toBeNull();
  });
});
