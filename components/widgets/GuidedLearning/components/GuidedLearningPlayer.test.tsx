import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  afterAll,
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GuidedLearningPlayer } from './GuidedLearningPlayer';
import { GuidedLearningSet } from '@/types';

vi.mock('./interactions/TooltipInteraction', () => ({
  TooltipInteraction: ({
    step,
  }: {
    step: { xPct: number; yPct: number; text?: string };
  }) => <div data-testid="tooltip-coords">{`${step.xPct},${step.yPct}`}</div>,
}));

let mockQuestionOnAnswer:
  | ((answer: string, isCorrect: boolean | null) => void)
  | null = null;
vi.mock('./interactions/QuestionInteraction', () => ({
  QuestionInteraction: ({
    onAnswer,
  }: {
    onAnswer: (answer: string, isCorrect: boolean | null) => void;
  }) => {
    mockQuestionOnAnswer = onAnswer;
    return <div data-testid="question-interaction">Question</div>;
  },
}));

vi.mock('./interactions/SpotlightInteraction', () => ({
  SpotlightInteraction: ({
    step,
  }: {
    step: { id: string; xPct: number; yPct: number; spotlightRadius?: number };
  }) => (
    <div data-testid="spotlight">
      {`${step.id}|${Math.round(step.xPct)},${Math.round(step.yPct)},r${step.spotlightRadius ?? 'none'}`}
    </div>
  ),
}));

vi.mock('./interactions/BannerInteraction', () => ({
  BannerInteraction: ({ step }: { step: { text?: string } }) => (
    <div data-testid="banner">{step.text}</div>
  ),
}));

class ResizeObserverMock {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 400,
            height: 200,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 400,
            bottom: 200,
            toJSON: () => ({}),
          },
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }

  disconnect = () => undefined;

  unobserve = () => undefined;
}

describe('GuidedLearningPlayer', () => {
  const originalGetBoundingClientRectDescriptor =
    Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getBoundingClientRect'
    );

  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return {
          width: 400,
          height: 200,
          top: 0,
          left: 0,
          right: 400,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuestionOnAnswer = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    if (originalGetBoundingClientRectDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'getBoundingClientRect',
        originalGetBoundingClientRectDescriptor
      );
    }
    vi.unstubAllGlobals();
  });

  it('converts tooltip and pin positions from image space into container space', () => {
    const set: GuidedLearningSet = {
      id: 'set-1',
      title: 'Player Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 10,
          yPct: 80,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Hello',
        },
      ],
      mode: 'structured',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);

    fireEvent.load(screen.getByAltText('Player Test'));

    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('30,80');
    // The active step's hotspot pin is auto-hidden in any mode (the
    // interaction overlay is the visual anchor instead). Validating the
    // tooltip's transformed coordinates above is sufficient — the pin's
    // own coordinates would just duplicate that math.
    expect(
      screen.queryByRole('button', { name: /step 1/i })
    ).not.toBeInTheDocument();
  });

  it('does not restart the auto-advance timer when a question is answered in guided mode', () => {
    vi.useFakeTimers();

    const set: GuidedLearningSet = {
      id: 'set-timer',
      title: 'Timer Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'q-step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'question',
          autoAdvanceDuration: 10,
          question: {
            type: 'multiple-choice',
            text: 'Pick one',
            choices: ['A', 'B'],
            correctAnswer: 'A',
          },
        },
        {
          id: 'q-step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Step 2',
        },
      ],
      mode: 'guided',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Timer Test'));

    // Start playing
    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    // Advance 5 seconds (50% of the 10s duration)
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // The key invariant is that answering the question must NOT restart
    // progressRef to 0. Answer the question at the 5-second mark.
    const answerQuestion = mockQuestionOnAnswer;
    if (answerQuestion === null)
      throw new Error('mockQuestionOnAnswer was not set');
    act(() => {
      answerQuestion('A', true);
    });

    // After answering, the timer should NOT have restarted. We advance another
    // 5.1 seconds — if the timer restarted we would still be at 50%; if it
    // continued from 50% we'd pass 100% and auto-advance to step 2.
    act(() => {
      vi.advanceTimersByTime(5100);
    });

    // The question-interaction mock should no longer be visible: the player
    // must have advanced to step 2 (tooltip). If the timer restarted, it
    // would still be at the question step.
    expect(
      screen.queryByTestId('question-interaction')
    ).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('scales the guided-mode auto-advance duration by timeMultiplier (M17 C3-gl)', () => {
    vi.useFakeTimers();

    const set: GuidedLearningSet = {
      id: 'set-multiplier',
      title: 'Multiplier Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'tooltip',
          autoAdvanceDuration: 10,
          text: 'Step 1',
        },
        {
          id: 'step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Step 2',
        },
      ],
      mode: 'guided',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} timeMultiplier={2} />);
    fireEvent.load(screen.getByAltText('Multiplier Test'));
    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    // At the un-multiplied 10s mark, a 2x student should NOT have advanced.
    act(() => {
      vi.advanceTimersByTime(10100);
    });
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('50,50');

    // Past the doubled 20s mark, they should have advanced.
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('40,30');

    vi.useRealTimers();
  });

  it('never auto-advances guided mode when timeMultiplier is unlimited', () => {
    vi.useFakeTimers();

    const set: GuidedLearningSet = {
      id: 'set-unlimited',
      title: 'Unlimited Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'tooltip',
          autoAdvanceDuration: 5,
          text: 'Step 1',
        },
        {
          id: 'step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Step 2',
        },
      ],
      mode: 'guided',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} timeMultiplier="unlimited" />);
    fireEvent.load(screen.getByAltText('Unlimited Test'));
    fireEvent.click(screen.getByRole('button', { name: /play/i }));

    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('50,50');

    vi.useRealTimers();
  });

  it('lets explore mode switch images and keeps pan-zoom spotlight overlays visible', () => {
    const set: GuidedLearningSet = {
      id: 'set-2',
      title: 'Explore Test',
      imageUrls: [
        'https://example.com/image-1.png',
        'https://example.com/image-2.png',
      ],
      steps: [
        {
          id: 'step-1',
          xPct: 20,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'First image',
        },
        {
          id: 'step-2',
          xPct: 75,
          yPct: 45,
          imageIndex: 1,
          interactionType: 'pan-zoom-spotlight',
          showOverlay: 'banner',
          text: 'Second image banner',
        },
      ],
      mode: 'explore',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);

    const image = screen.getByAltText('Explore Test');
    if (!(image instanceof HTMLImageElement)) {
      throw new Error(
        'Expected explore mode image to render as an img element'
      );
    }

    expect(image.src).toContain('image-1.png');
    expect(screen.getByRole('button', { name: /step 1/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /step 2/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show slide 2/i }));
    expect(image.src).toContain('image-2.png');

    fireEvent.click(screen.getByRole('button', { name: /step 2/i }));
    expect(screen.getByTestId('spotlight')).toHaveTextContent('step-2');
    expect(screen.getByTestId('banner')).toHaveTextContent(
      'Second image banner'
    );
  });

  it('animates legacy sets back to identity instead of snapping when leaving a pan-zoom step', () => {
    const set: GuidedLearningSet = {
      id: 'set-legacy-zoom',
      title: 'Legacy Zoom Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'zoom-step',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'pan-zoom',
          panZoomScale: 3,
        },
        {
          id: 'plain-step',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Plain',
        },
      ],
      mode: 'structured',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Legacy Zoom Test'));

    const layer = screen.getByTestId('gl-panzoom-layer');
    expect(layer.style.transform).toContain('scale(3)');

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    // Legacy sets reset per step, but with an animated transition — never {}.
    expect(layer.style.transform).toBe('scale(1) translate(0px, 0px)');
    expect(layer.style.transition).toContain('transform');
    // No reset-view button on legacy sets.
    expect(
      screen.queryByRole('button', { name: /reset view/i })
    ).not.toBeInTheDocument();
  });

  it('persists zoom across steps for v2 sets and offers a reset-view button', () => {
    const set: GuidedLearningSet = {
      id: 'set-v2-zoom',
      title: 'V2 Zoom Test',
      schemaVersion: 2,
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'zoom-step',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'pan-zoom',
          panZoomScale: 3,
        },
        {
          id: 'plain-step',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Plain',
        },
      ],
      mode: 'structured',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('V2 Zoom Test'));

    const layer = screen.getByTestId('gl-panzoom-layer');
    expect(layer.style.transform).toContain('scale(3)');

    // Arriving at a non-pan-zoom step keeps the zoom and pans to its hotspot.
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(layer.style.transform).toContain('scale(3)');

    // Reset view animates back to identity and dismisses the button.
    fireEvent.click(screen.getByRole('button', { name: /reset view/i }));
    expect(layer.style.transform).toBe('scale(1) translate(0px, 0px)');
    expect(
      screen.queryByRole('button', { name: /reset view/i })
    ).not.toBeInTheDocument();
  });

  it('anchors overlays through the rendered transform when v2 zoom persists onto a non-pan-zoom step', () => {
    const set: GuidedLearningSet = {
      id: 'set-v2-overlay',
      title: 'V2 Overlay Test',
      schemaVersion: 2,
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'zoom-step',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'pan-zoom',
          panZoomScale: 3,
        },
        {
          id: 'tooltip-step',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Persisted zoom',
        },
      ],
      mode: 'structured',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('V2 Overlay Test'));

    // Zoom persists onto the tooltip step, panning its hotspot to center —
    // the tooltip must anchor at the transformed (centered) position.
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('50,50');

    // Reset returns to identity — the tooltip must anchor at raw coords.
    fireEvent.click(screen.getByRole('button', { name: /reset view/i }));
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('40,30');
  });

  it('re-anchors and re-scales a v2 pan-zoom-spotlight after Reset view', () => {
    const set: GuidedLearningSet = {
      id: 'set-v2-spotlight',
      title: 'V2 Spotlight Test',
      schemaVersion: 2,
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'spot-step',
          xPct: 10,
          yPct: 80,
          imageIndex: 0,
          interactionType: 'pan-zoom-spotlight',
          panZoomScale: 2,
          spotlightRadius: 25,
        },
      ],
      mode: 'structured',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('V2 Spotlight Test'));

    // Zoomed on its own hotspot: centered, radius scaled by the zoom.
    expect(screen.getByTestId('spotlight')).toHaveTextContent(
      'spot-step|50,50,r50'
    );

    // Reset view: overlay follows the identity transform back to raw coords.
    fireEvent.click(screen.getByRole('button', { name: /reset view/i }));
    expect(screen.getByTestId('spotlight')).toHaveTextContent(
      'spot-step|30,80,r25'
    );
  });

  it('clears the held v2 zoom when the active explore pin is deselected', () => {
    const set: GuidedLearningSet = {
      id: 'set-v2-explore',
      title: 'V2 Explore Test',
      schemaVersion: 2,
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'zoom-pin',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'pan-zoom',
          panZoomScale: 3,
        },
        {
          id: 'plain-pin',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Plain pin',
        },
      ],
      mode: 'explore',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('V2 Explore Test'));

    const layer = screen.getByTestId('gl-panzoom-layer');
    fireEvent.click(screen.getByRole('button', { name: /step 1/i }));
    expect(layer.style.transform).toContain('scale(3)');
    expect(
      screen.getByRole('button', { name: /reset view/i })
    ).toBeInTheDocument();

    // Deselect via Escape: view returns to identity AND the held zoom clears.
    const container = layer.parentElement;
    if (!(container instanceof HTMLElement))
      throw new Error('Expected canvas container');
    container.focus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(layer.style.transform).toBe('scale(1) translate(0px, 0px)');
    expect(
      screen.queryByRole('button', { name: /reset view/i })
    ).not.toBeInTheDocument();

    // Clicking a non-pan-zoom pin must not surprise-re-zoom.
    fireEvent.click(screen.getByRole('button', { name: /step 2/i }));
    expect(layer.style.transform).toBe('scale(1) translate(0px, 0px)');
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('40,30');
  });

  it('navigates structured mode via the footer prev/next buttons', () => {
    const set: GuidedLearningSet = {
      id: 'set-footer-nav',
      title: 'Footer Nav Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 10,
          yPct: 80,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'One',
        },
        {
          id: 'step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Two',
        },
      ],
      mode: 'structured',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Footer Nav Test'));

    const prev = screen.getByRole('button', { name: /previous step/i });
    const next = screen.getByRole('button', { name: /next step/i });
    expect(prev).toBeDisabled();
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('30,80');

    fireEvent.click(next);
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('40,30');
    expect(next).toBeDisabled();

    fireEvent.click(prev);
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('30,80');

    // Footer dots jump directly to a step.
    fireEvent.click(screen.getByRole('button', { name: /go to step 2/i }));
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('40,30');
  });

  it('replaces footer dots with a progress bar when a structured set exceeds 20 steps', () => {
    const set: GuidedLearningSet = {
      id: 'set-many-steps',
      title: 'Many Steps Test',
      imageUrls: ['https://example.com/image.png'],
      steps: Array.from({ length: 25 }, (_, i) => ({
        id: `step-${i + 1}`,
        xPct: 50,
        yPct: 50,
        imageIndex: 0,
        interactionType: 'tooltip' as const,
        text: `Step ${i + 1}`,
      })),
      mode: 'structured',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Many Steps Test'));

    expect(
      screen.queryByRole('button', { name: /go to step 1/i })
    ).not.toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: /step progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '25');

    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(bar).toHaveAttribute('aria-valuenow', '2');
  });

  it('renders guided-mode play/pause and session progress in the footer', () => {
    vi.useFakeTimers();

    const set: GuidedLearningSet = {
      id: 'set-guided-footer',
      title: 'Guided Footer Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'tooltip',
          autoAdvanceDuration: 10,
          text: 'One',
        },
        {
          id: 'step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Two',
        },
      ],
      mode: 'guided',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Guided Footer Test'));

    // Guided mode keeps manual prev/next alongside play/pause.
    expect(
      screen.getByRole('button', { name: /next step/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /previous step/i })
    ).toBeDisabled();

    const bar = screen.getByRole('progressbar', { name: /session progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '0');

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    expect(
      screen.getByRole('button', { name: /^pause$/i })
    ).toBeInTheDocument();

    // Half of a 10s step across 2 steps = 25% of the session.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '25');

    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(screen.getByRole('button', { name: /^play$/i })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('navigates guided mode manually and restarts the step timer on a jump', () => {
    vi.useFakeTimers();

    const set: GuidedLearningSet = {
      id: 'set-guided-nav',
      title: 'Guided Nav Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'tooltip',
          autoAdvanceDuration: 10,
          text: 'One',
        },
        {
          id: 'step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          autoAdvanceDuration: 10,
          text: 'Two',
        },
      ],
      mode: 'guided',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Guided Nav Test'));

    const bar = screen.getByRole('progressbar', { name: /session progress/i });

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '25');

    // Manual jump forward restarts that step's timer from zero.
    fireEvent.click(screen.getByRole('button', { name: /next step/i }));
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('40,30');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '75');

    // Manual jump back also restarts the step timer state.
    fireEvent.click(screen.getByRole('button', { name: /previous step/i }));
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('50,50');
    expect(bar).toHaveAttribute('aria-valuenow', '0');

    vi.useRealTimers();
  });

  it('supports arrow-key navigation in guided mode', () => {
    const set: GuidedLearningSet = {
      id: 'set-guided-keys',
      title: 'Guided Keys Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'One',
        },
        {
          id: 'step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Two',
        },
      ],
      mode: 'guided',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Guided Keys Test'));

    const layer = screen.getByTestId('gl-panzoom-layer');
    const container = layer.parentElement;
    if (!(container instanceof HTMLElement))
      throw new Error('Expected canvas container');
    container.focus();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('40,30');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('tooltip-coords')).toHaveTextContent('50,50');
  });

  it('keeps in-step progress on pause and restarts it on resume', () => {
    vi.useFakeTimers();

    const set: GuidedLearningSet = {
      id: 'set-guided-pause',
      title: 'Guided Pause Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'tooltip',
          autoAdvanceDuration: 10,
          text: 'One',
        },
        {
          id: 'step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'Two',
        },
      ],
      mode: 'guided',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Guided Pause Test'));

    const bar = screen.getByRole('progressbar', { name: /session progress/i });

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '20');

    // Pause keeps the current in-step progress instead of zeroing it.
    fireEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '20');

    // Resume restarts the step's timer from zero (dot-jump semantics).
    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '25');

    vi.useRealTimers();
  });

  it('holds the session progress bar at 100% once the final step completes', () => {
    vi.useFakeTimers();

    const set: GuidedLearningSet = {
      id: 'set-guided-final',
      title: 'Guided Final Test',
      imageUrls: ['https://example.com/image.png'],
      steps: [
        {
          id: 'step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'tooltip',
          autoAdvanceDuration: 10,
          text: 'One',
        },
        {
          id: 'step-2',
          xPct: 30,
          yPct: 30,
          imageIndex: 0,
          interactionType: 'tooltip',
          autoAdvanceDuration: 10,
          text: 'Two',
        },
      ],
      mode: 'guided',
      createdAt: 0,
      updatedAt: 0,
    };

    render(<GuidedLearningPlayer set={set} />);
    fireEvent.load(screen.getByAltText('Guided Final Test'));

    const bar = screen.getByRole('progressbar', { name: /session progress/i });

    fireEvent.click(screen.getByRole('button', { name: /^play$/i }));
    // First step's 10s timer completes and auto-advances into the second
    // (final) step, resetting in-step progress for the new step.
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '50');

    // Final step's timer expiring must not clamp progress back down —
    // the bar should reach and hold 100% instead of dropping.
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '100');

    // Holds at 100% rather than resetting on further ticks.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(bar).toHaveAttribute('aria-valuenow', '100');

    vi.useRealTimers();
  });

  it('renders video slides in a <video> element and skips them when preloading', () => {
    // Record every Image preload by spying on the prototype src setter.
    // Not forwarding to the real setter — jsdom would try (and fail) to
    // fetch the URL; recording it is all the test needs.
    const imageConstructed: string[] = [];
    const srcSpy = vi
      .spyOn(HTMLImageElement.prototype, 'src', 'set')
      .mockImplementation(function (this: HTMLImageElement, value: string) {
        imageConstructed.push(value);
      });
    try {
      const set: GuidedLearningSet = {
        id: 'set-3',
        title: 'Video Slide Test',
        imageUrls: [
          'https://example.com/clip.mp4',
          'https://example.com/image-1.png',
        ],
        imageKinds: ['video', 'image'],
        steps: [
          {
            id: 'step-1',
            xPct: 50,
            yPct: 50,
            imageIndex: 0,
            interactionType: 'tooltip',
            text: 'On the video',
          },
        ],
        mode: 'structured',
        createdAt: 0,
        updatedAt: 0,
      };

      const { container } = render(<GuidedLearningPlayer set={set} />);

      // The current slide is a video — rendered via <video>, not <img>.
      const video = container.querySelector('video');
      expect(video).not.toBeNull();
      expect(video?.src).toContain('clip.mp4');
      expect(screen.queryByAltText('Video Slide Test')).not.toBeInTheDocument();

      // Preloading warms only the image slide; the MP4 streams on demand.
      expect(imageConstructed).toContain('https://example.com/image-1.png');
      expect(imageConstructed).not.toContain('https://example.com/clip.mp4');
    } finally {
      srcSpy.mockRestore();
    }
  });

  it('honors a per-slide playback trim: seeks to start on load and loops back at end', () => {
    const set: GuidedLearningSet = {
      id: 'set-4',
      title: 'Trimmed Video Test',
      imageUrls: ['https://example.com/clip.mp4'],
      imageKinds: ['video'],
      videoTrims: [{ start: 2, end: 5 }],
      steps: [
        {
          id: 'step-1',
          xPct: 50,
          yPct: 50,
          imageIndex: 0,
          interactionType: 'tooltip',
          text: 'On the video',
        },
      ],
      mode: 'structured',
      createdAt: 0,
      updatedAt: 0,
    };

    const { container } = render(<GuidedLearningPlayer set={set} />);
    const video = container.querySelector('video');
    if (!video) throw new Error('Expected a <video> element for video slide');

    // Metadata load seeks to the trim start.
    fireEvent(video, new Event('loadedmetadata'));
    expect(video.currentTime).toBe(2);

    // Inside the range — playback continues untouched.
    video.currentTime = 4;
    fireEvent(video, new Event('timeupdate'));
    expect(video.currentTime).toBe(4);

    // Reaching the trim end loops back to the trim start.
    video.currentTime = 5;
    fireEvent(video, new Event('timeupdate'));
    expect(video.currentTime).toBe(2);

    // Far before the range (e.g. native loop restarted the file) snaps
    // forward to the trim start.
    video.currentTime = 0;
    fireEvent(video, new Event('timeupdate'));
    expect(video.currentTime).toBe(2);
  });
});
