import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';
import type { StepEvent } from '../types/stage';

// 1600x900 in 800x600 letterboxes to 800x450, 75px from the top.
function layout() {
  const handle = mockStageLayout({
    container: { w: 800, h: 600 },
    image: { w: 1600, h: 900 },
  });
  restore = handle.restore;
  return handle;
}

let restore: (() => void) | null = null;
afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
  vi.useRealTimers();
  window.localStorage.clear();
});

const target: GuidedLearningStep = {
  id: 'one',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: 'Save',
  text: 'Press save',
  // 20% x 20% of the 800x450 image → 160x90px around (400, 300).
  region: { shape: 'rect', wPct: 20, hPct: 20 },
};

const makeSet = (
  mode: GuidedLearningSet['mode'],
  over: Partial<GuidedLearningStep> = {}
): GuidedLearningSet => ({
  id: 'set',
  schemaVersion: 3,
  title: 'Walkthrough',
  imageUrls: ['https://example.com/slide.png'],
  steps: [
    { ...target, ...over },
    { ...target, id: 'two', xPct: 25, yPct: 25, label: 'Next' },
  ],
  mode,
  createdAt: 0,
  updatedAt: 0,
});

function renderPlayer(
  set: GuidedLearningSet,
  props: Partial<React.ComponentProps<typeof GuidedLearningPlayer>> = {}
) {
  const handle = layout();
  const view = render(
    <GuidedLearningPlayer set={set} teacherMode playerV2 {...props} />
  );
  fireEvent.load(
    document.querySelector('[data-gl-stage] img') as HTMLImageElement
  );
  act(() => handle.fireResize());
  return view;
}

const stage = () => document.querySelector('[data-gl-stage]') as HTMLElement;
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
describe('GuidedLearningPlayer author mode', () => {
  it('has no Watch / Try toggle in any mode', () => {
    for (const mode of ['guided', 'structured', 'explore'] as const) {
      renderPlayer(makeSet(mode));
      expect(screen.queryByRole('button', { name: /^watch$/i })).toBeNull();
      expect(
        screen.queryByRole('button', { name: /^click along$/i })
      ).toBeNull();
      cleanup();
      restore?.();
    }
  });

  it('shows a visible chip saying what to do for each mode', () => {
    const chips = {
      guided: 'Watch the steps',
      structured: 'Tap the highlighted spot',
      explore: 'Explore the pins',
    } as const;
    for (const mode of ['guided', 'structured', 'explore'] as const) {
      renderPlayer(makeSet(mode));
      expect(screen.getByTestId('gl-mode-chip')).toHaveTextContent(chips[mode]);
      cleanup();
      restore?.();
    }
    renderPlayer(makeSet('explore'));
    expect(screen.queryByText('Click any pin to explore')).toBeNull();
  });

  it('plays guided sets as Watch: scrubber and Play, no Try clicks', () => {
    renderPlayer(makeSet('guided'));
    expect(
      screen.getByRole('slider', { name: /walkthrough position/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    expect(screen.getByTestId('gl-cursor')).toBeInTheDocument();
  });

  it('plays structured sets as Try: no Play button, and Next always works', () => {
    const events: StepEvent[] = [];
    renderPlayer(makeSet('structured'), {
      onStepEvent: (e) => events.push(e),
    });
    expect(screen.queryByRole('button', { name: /^play$/i })).toBeNull();
    expect(screen.queryByTestId('gl-cursor')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(events.every((e) => e.mode === 'try')).toBe(true);
  });

  it('shows no chip, toggle or cursor when player v2 is off', () => {
    vi.useFakeTimers();
    renderPlayer(makeSet('guided'), { playerV2: false });
    expect(screen.queryByTestId('gl-mode-chip')).toBeNull();
    expect(screen.queryByTestId('gl-cursor')).toBeNull();
    expect(screen.getByTestId('gl-tooltip-card')).toBeInTheDocument();
    cleanup();
    restore?.();
    renderPlayer(makeSet('explore'), { playerV2: false });
    expect(screen.getByText('Click any pin to explore')).toBeInTheDocument();
  });
});

describe('GuidedLearningPlayer guided start', () => {
  // Glide 600ms + ripple 420ms, then the 3s step floor.
  const oneStep = () => {
    tick(600);
    tick(420);
    tick(3100);
  };

  it('auto-plays a guided set when asked (the student app)', () => {
    vi.useFakeTimers();
    renderPlayer(makeSet('guided'), { autoPlay: true });
    expect(
      screen.getByRole('button', { name: /^pause$/i })
    ).toBeInTheDocument();
    oneStep();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('starts paused without autoPlay (the teacher board)', () => {
    vi.useFakeTimers();
    renderPlayer(makeSet('guided'));
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    oneStep();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('never auto-plays structured sets or v1 guided sets', () => {
    vi.useFakeTimers();
    renderPlayer(makeSet('structured'), { autoPlay: true });
    oneStep();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    cleanup();
    restore?.();
    renderPlayer(makeSet('guided'), { autoPlay: true, playerV2: false });
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();
    tick(10000);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('holds auto-play while the resume question is open', () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      'spartboard.gl.resume.set',
      JSON.stringify({
        id: 'set',
        idx: 1,
        mode: 'watch',
        updatedAt: Date.now(),
      })
    );
    renderPlayer(
      {
        ...makeSet('guided'),
        steps: [target, { ...target, id: 'two' }, { ...target, id: 'three' }],
      },
      { autoPlay: true }
    );
    oneStep();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    oneStep();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });
});

describe('GuidedLearningPlayer Watch / Try', () => {
  it('glides the Watch cursor first, then auto-advances after the step time', () => {
    vi.useFakeTimers();
    renderPlayer(makeSet('guided'));
    // Glide from the frame centre to (400, 300): 0px, so the 600ms floor.
    expect(screen.getByTestId('gl-cursor')).toHaveAttribute(
      'data-arrived',
      'false'
    );
    expect(screen.queryByTestId('gl-tooltip-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    tick(600);
    expect(screen.getByTestId('gl-cursor-ripple')).toBeInTheDocument();
    tick(420);
    expect(screen.queryByTestId('gl-cursor')).toBeNull();
    expect(screen.getByTestId('gl-tooltip-card')).toBeInTheDocument();
    // 2 words → 3s floor, counted from the cursor landing.
    tick(2900);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    tick(200);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('skips the cursor on a step that hides it', () => {
    vi.useFakeTimers();
    renderPlayer(makeSet('guided', { cursor: { hide: true } }));
    expect(screen.queryByTestId('gl-cursor')).toBeNull();
    expect(screen.getByTestId('gl-tooltip-card')).toBeInTheDocument();
  });

  it('places the cursor without animating it under reduced motion', () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    renderPlayer(makeSet('guided'));
    const cursor = screen.getByTestId('gl-cursor');
    expect(cursor).toHaveAttribute('data-arrived', 'true');
    expect(cursor.style.transform).toBe('translate(400px, 300px)');
    expect(screen.queryByTestId('gl-cursor-ripple')).toBeNull();
    tick(0);
    expect(screen.getByTestId('gl-tooltip-card')).toBeInTheDocument();
  });

  it('advances Try only on a click inside the region and counts misclicks', () => {
    const events: StepEvent[] = [];
    renderPlayer(makeSet('structured'), {
      onStepEvent: (e) => events.push(e),
    });
    fireEvent.click(stage(), { clientX: 100, clientY: 100 });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(stage(), { clientX: 470, clientY: 330 });
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(events.map((e) => `${e.stepId}:${e.type}`)).toEqual([
      'one:enter',
      'one:misclick',
      'one:complete',
      'one:leave',
      'two:enter',
    ]);
    expect(events.every((e) => e.mode === 'try')).toBe(true);
    const miss = events[1];
    expect(miss.xPct).toBeCloseTo(12.5);
    expect(miss.yPct).toBeCloseTo(((100 - 75) / 450) * 100);
    expect(events[2].ms).toBeGreaterThanOrEqual(0);
  });

  it('ignores clicks on the callout itself', () => {
    const events: StepEvent[] = [];
    renderPlayer(makeSet('structured'), {
      onStepEvent: (e) => events.push(e),
    });
    fireEvent.click(screen.getByTestId('gl-tooltip-card'));
    expect(events.map((e) => e.type)).toEqual(['enter']);
  });

  it('shows the hint cursor on the second misclick', () => {
    const events: StepEvent[] = [];
    renderPlayer(makeSet('structured'), {
      onStepEvent: (e) => events.push(e),
    });
    fireEvent.click(stage(), { clientX: 100, clientY: 100 });
    expect(screen.queryByTestId('gl-cursor')).toBeNull();
    fireEvent.click(stage(), { clientX: 700, clientY: 500 });
    expect(screen.getByTestId('gl-cursor')).toBeInTheDocument();
    expect(events.map((e) => e.type)).toEqual([
      'enter',
      'misclick',
      'misclick',
      'hint',
    ]);
  });

  it('shows the hint cursor after 5s without progress', () => {
    vi.useFakeTimers();
    const events: StepEvent[] = [];
    renderPlayer(makeSet('structured'), {
      onStepEvent: (e) => events.push(e),
    });
    tick(4900);
    expect(screen.queryByTestId('gl-cursor')).toBeNull();
    tick(200);
    expect(screen.getByTestId('gl-cursor')).toBeInTheDocument();
    expect(events.map((e) => e.type)).toEqual(['enter', 'hint']);
  });

  it('completes a Try step with Enter on the focused stage', () => {
    renderPlayer(makeSet('structured'));
    stage().focus();
    fireEvent.keyDown(stage(), { key: 'Enter' });
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('seeks to a step start from the Watch scrubber', () => {
    renderPlayer(makeSet('guided'));
    const slider = screen.getByRole('slider', {
      name: /walkthrough position/i,
    });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(slider).toHaveAttribute('aria-valuenow', '2');
  });
});

describe('GuidedLearningPlayer reaching the end', () => {
  it('finishes when Next is pressed on the last step (v2)', () => {
    const onReachedEnd = vi.fn();
    renderPlayer(makeSet('structured'), { onReachedEnd });
    const next = () => screen.getByRole('button', { name: /next step/i });
    fireEvent.click(next());
    expect(onReachedEnd).not.toHaveBeenCalled();
    expect(next()).toBeEnabled();
    fireEvent.click(next());
    expect(onReachedEnd).toHaveBeenCalledTimes(1);
  });

  it('finishes when a guided run auto-advances off the last step', () => {
    vi.useFakeTimers();
    const onReachedEnd = vi.fn();
    renderPlayer(
      { ...makeSet('guided'), steps: [{ ...target, cursor: { hide: true } }] },
      { autoPlay: true, onReachedEnd }
    );
    tick(3100);
    expect(onReachedEnd).toHaveBeenCalledTimes(1);
  });

  it('never finishes from the player in v1', () => {
    const onReachedEnd = vi.fn();
    renderPlayer(makeSet('structured'), { onReachedEnd, playerV2: false });
    const next = screen.getByRole('button', { name: /next step/i });
    fireEvent.click(next);
    expect(next).toBeDisabled();
    expect(onReachedEnd).not.toHaveBeenCalled();
  });
});

describe('GuidedLearningPlayer presenting keys (v2)', () => {
  const threeSteps = (mode: GuidedLearningSet['mode']) => ({
    ...makeSet(mode),
    steps: [target, { ...target, id: 'two' }, { ...target, id: 'three' }],
  });
  const nextBtn = () => screen.getByRole('button', { name: /next step/i });
  const prevBtn = () => screen.getByRole('button', { name: /previous step/i });

  it('steps with PageDown and PageUp from a clicker', () => {
    renderPlayer(threeSteps('structured'));
    stage().focus();
    fireEvent.keyDown(stage(), { key: 'PageDown' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    fireEvent.keyDown(stage(), { key: 'PageDown' });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    fireEvent.keyDown(stage(), { key: 'PageUp' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('steps with arrows and PageDown while a footer button has focus', () => {
    renderPlayer(threeSteps('guided'));
    nextBtn().focus();
    fireEvent.keyDown(nextBtn(), { key: 'ArrowRight' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    const play = screen.getByRole('button', { name: /^play$/i });
    play.focus();
    fireEvent.keyDown(play, { key: 'PageDown' });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    prevBtn().focus();
    fireEvent.keyDown(prevBtn(), { key: 'ArrowLeft' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('ignores step keys when focus is outside the player', () => {
    renderPlayer(threeSteps('structured'));
    const outside = document.createElement('div');
    outside.tabIndex = 0;
    document.body.appendChild(outside);
    outside.focus();
    fireEvent.keyDown(outside, { key: 'PageDown' });
    fireEvent.keyDown(outside, { key: 'ArrowRight' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    outside.remove();
  });

  it('leaves Enter on a footer button to the button', () => {
    renderPlayer(threeSteps('structured'));
    prevBtn().focus();
    fireEvent.keyDown(prevBtn(), { key: 'Enter' });
    fireEvent.keyDown(prevBtn(), { key: ' ', code: 'Space' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('keeps v1 on arrows over the canvas only', () => {
    renderPlayer(threeSteps('structured'), { playerV2: false });
    stage().focus();
    fireEvent.keyDown(stage(), { key: 'PageDown' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    nextBtn().focus();
    fireEvent.keyDown(nextBtn(), { key: 'ArrowRight' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    stage().focus();
    fireEvent.keyDown(stage(), { key: 'ArrowRight' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('scales callout text up to 30px in v2 only', () => {
    renderPlayer(makeSet('structured'));
    const root = screen.getByTestId('gl-player-root');
    expect(root.style.getPropertyValue('--gl-text-title')).toBe(
      'clamp(14px, 4.4cqmin, 30px)'
    );
    expect(screen.getByTestId('gl-tooltip-card').style.fontSize).toContain(
      'var(--gl-text-body'
    );
    cleanup();
    restore?.();
    renderPlayer(makeSet('structured'), { playerV2: false });
    expect(
      screen
        .getByTestId('gl-player-root')
        .style.getPropertyValue('--gl-text-title')
    ).toBe('');
  });
});
