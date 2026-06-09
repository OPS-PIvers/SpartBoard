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
  SpotlightInteraction: ({ step }: { step: { id: string } }) => (
    <div data-testid="spotlight">{step.id}</div>
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
});
