import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  mockStageLayout,
  type StageLayoutHandle,
} from '@/tests/utils/mockStageLayout';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';
import { MISS_MARKER_MS } from './GuidedLearningStage';
import type { StepEvent } from '../types/stage';

let handle: StageLayoutHandle | null = null;
afterEach(() => {
  cleanup();
  handle?.restore();
  handle = null;
  vi.useRealTimers();
  window.localStorage.clear();
});

// 1600x900 in 800x600 letterboxes to 800x450, 75px from the top.
const tiny: GuidedLearningStep = {
  id: 'one',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: 'Tiny',
  text: 'Press the tiny button',
  // 2% x 2% of 800x450 → 16x9px around (400, 300).
  region: { shape: 'rect', wPct: 2, hPct: 2 },
};

const question: GuidedLearningStep = {
  id: 'q',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'question',
  question: {
    type: 'multiple-choice',
    text: 'Pick one',
    choices: ['Alpha', 'Beta'],
    correctAnswer: 'Beta',
  },
};

const makeSet = (
  mode: GuidedLearningSet['mode'],
  steps: GuidedLearningStep[] = [tiny, { ...tiny, id: 'two', label: 'Two' }]
): GuidedLearningSet => ({
  id: 'set',
  schemaVersion: 3,
  title: 'Walkthrough',
  imageUrls: ['https://example.com/slide.png'],
  steps,
  mode,
  createdAt: 0,
  updatedAt: 0,
});

function renderPlayer(
  set: GuidedLearningSet,
  props: Partial<React.ComponentProps<typeof GuidedLearningPlayer>> = {},
  container = { w: 800, h: 600 }
) {
  handle = mockStageLayout({ container, image: { w: 1600, h: 900 } });
  const view = render(
    <GuidedLearningPlayer set={set} teacherMode playerV2 {...props} />
  );
  fireEvent.load(
    document.querySelector('[data-gl-stage] img') as HTMLImageElement
  );
  act(() => handle?.fireResize());
  return view;
}

const stage = () => document.querySelector('[data-gl-stage]') as HTMLElement;
const footer = () => document.querySelector('[data-gl-footer]') as HTMLElement;

describe('P8-6 touch targets', () => {
  it('gives pins and footer buttons a 44px hit box in v2 only', () => {
    renderPlayer(makeSet('explore'));
    const [region, pin] = screen.getAllByRole('button', { name: 'Tiny' });
    expect(region).toHaveAttribute('data-gl-region', 'one');
    for (const el of [pin, region]) {
      const box = el.querySelector('[data-gl-hitbox]') as HTMLElement;
      expect(box).not.toBeNull();
      expect(box.style.minWidth).toBe('44px');
      expect(box.style.minHeight).toBe('44px');
    }
    cleanup();
    handle?.restore();

    renderPlayer(makeSet('structured'));
    for (const name of [/previous step/i, /next step/i, /step 1 of 2/i]) {
      expect(
        screen.getByRole('button', { name }).querySelector('[data-gl-hitbox]')
      ).not.toBeNull();
    }
    cleanup();
    handle?.restore();

    renderPlayer(makeSet('structured'), { playerV2: false });
    expect(document.querySelector('[data-gl-hitbox]')).toBeNull();
  });

  it('counts a tap within 44px of a small Try target as a hit', () => {
    const events: StepEvent[] = [];
    renderPlayer(makeSet('structured'), {
      onStepEvent: (e) => events.push(e),
    });
    // 15px right of centre: outside the 16px-wide region, inside the 44px box.
    fireEvent.click(stage(), { clientX: 415, clientY: 300 });
    expect(events.map((e) => e.type)).toContain('complete');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('still misses outside the 44px box', () => {
    const events: StepEvent[] = [];
    renderPlayer(makeSet('structured'), {
      onStepEvent: (e) => events.push(e),
    });
    fireEvent.click(stage(), { clientX: 430, clientY: 300 });
    expect(events.map((e) => e.type)).toEqual(['enter', 'misclick']);
  });
});

describe('P8-6 misclick feedback', () => {
  it('shows a static miss marker and a polite message, then clears the marker', () => {
    vi.useFakeTimers();
    renderPlayer(makeSet('structured'));
    expect(screen.queryByTestId('gl-miss-marker')).toBeNull();
    fireEvent.click(stage(), { clientX: 100, clientY: 100 });
    const marker = screen.getByTestId('gl-miss-marker');
    expect(parseFloat(marker.style.left)).toBeCloseTo(100);
    expect(parseFloat(marker.style.top)).toBeCloseTo(100);
    expect(marker.style.animation).toBe('');
    const live = screen.getByTestId('gl-miss-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Not there. Try the highlighted spot.');
    act(() => {
      vi.advanceTimersByTime(MISS_MARKER_MS);
    });
    expect(screen.queryByTestId('gl-miss-marker')).toBeNull();
  });

  it('shows the marker under reduced motion too', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    renderPlayer(makeSet('structured'));
    fireEvent.click(stage(), { clientX: 100, clientY: 100 });
    expect(screen.getByTestId('gl-miss-marker')).toBeInTheDocument();
    expect(screen.getByTestId('gl-miss-live')).toHaveTextContent(/not there/i);
  });

  it('has no marker or message when player v2 is off', () => {
    renderPlayer(makeSet('structured'), { playerV2: false });
    fireEvent.click(stage(), { clientX: 100, clientY: 100 });
    expect(screen.queryByTestId('gl-miss-marker')).toBeNull();
    expect(screen.queryByTestId('gl-miss-live')).toBeNull();
  });
});

describe('P8-6 remembered answers', () => {
  const qSet = () =>
    makeSet('structured', [question, { ...tiny, id: 'after' }]);

  it('opens a question on its saved answer, which can be changed', () => {
    const onAnswer = vi.fn();
    renderPlayer(qSet(), {
      teacherMode: false,
      onAnswer,
      initialAnswers: [{ stepId: 'q', answer: 'Alpha' }],
    });
    expect(screen.getByText('Answer recorded')).toBeInTheDocument();
    expect(screen.getByText('Your answer: Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit answer/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /change answer/i }));
    const alpha = screen.getByRole('button', { name: 'Alpha' });
    expect(alpha.className).toContain('border-indigo-400');
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    expect(onAnswer).toHaveBeenCalledWith('q', 'Beta', null);
  });

  it('remembers an answer given this visit when the student comes back', () => {
    renderPlayer(qSet(), { teacherMode: false });
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    fireEvent.click(screen.getByRole('button', { name: /submit answer/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /previous step/i }));
    expect(screen.getByText('Your answer: Beta')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /change answer/i })
    ).toBeInTheDocument();
  });
});

describe('P8-6 footer', () => {
  it('renders one footer for structured and guided, differing only in Play and the scrubber', () => {
    const names = (mode: 'structured' | 'guided') => {
      renderPlayer(makeSet(mode));
      const labels = within(footer())
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent);
      cleanup();
      handle?.restore();
      return labels;
    };
    const structured = names('structured');
    const guided = names('guided');
    expect(guided.filter((n) => n !== 'Play')).toEqual(
      structured.filter((n) => !/^Go to step/.test(n ?? ''))
    );
  });

  it('moves speed and read-aloud into an overflow menu below the breakpoint', () => {
    vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
    renderPlayer(makeSet('guided'), {}, { w: 800, h: 600 });
    expect(
      screen.getByRole('group', { name: /playback speed/i })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /more options/i })).toBeNull();

    act(() => handle?.resize({ w: 400, h: 300 }));
    expect(screen.queryByRole('group', { name: /playback speed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read aloud' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));
    const menu = screen.getByTestId('gl-footer-overflow');
    expect(
      within(menu).getByRole('group', { name: /playback speed/i })
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('button', { name: 'Read aloud' })
    ).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByTestId('gl-footer-overflow')).toBeNull();
  });

  it('keeps the v1 footer without an overflow menu at any width', () => {
    renderPlayer(makeSet('guided'), { playerV2: false }, { w: 400, h: 300 });
    expect(screen.queryByRole('button', { name: /more options/i })).toBeNull();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });
});
