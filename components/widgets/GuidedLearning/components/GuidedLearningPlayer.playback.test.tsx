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
  fireEvent.load(screen.getByAltText('Walkthrough'));
  act(() => handle.fireResize());
  return view;
}

const stage = () => document.querySelector('[data-gl-stage]') as HTMLElement;
const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const pressed = (name: RegExp) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('GuidedLearningPlayer Watch / Try', () => {
  it('starts guided sets in Watch and structured sets in Try', () => {
    renderPlayer(makeSet('guided'));
    expect(pressed(/^watch$/i)).toBe('true');
    cleanup();
    restore?.();
    renderPlayer(makeSet('structured'));
    expect(pressed(/^try it$/i)).toBe('true');
  });

  it('shows no toggle in explore mode', () => {
    renderPlayer(makeSet('explore'));
    expect(screen.queryByRole('group', { name: /playback mode/i })).toBeNull();
  });

  it('shows no toggle or cursor when player v2 is off', () => {
    vi.useFakeTimers();
    renderPlayer(makeSet('guided'), { playerV2: false });
    expect(screen.queryByRole('group', { name: /playback mode/i })).toBeNull();
    expect(screen.queryByTestId('gl-cursor')).toBeNull();
    expect(screen.getByTestId('gl-tooltip-card')).toBeInTheDocument();
  });

  it('keeps the current step when switching between Try and Watch', () => {
    renderPlayer(makeSet('structured'));
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^watch$/i }));
    expect(pressed(/^watch$/i)).toBe('true');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(
      screen.getByRole('slider', { name: /walkthrough position/i })
    ).toHaveAttribute('aria-valuenow', '2');
    // The step stays shown rather than replaying its cursor.
    expect(screen.queryByTestId('gl-cursor')).toBeNull();
  });

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
