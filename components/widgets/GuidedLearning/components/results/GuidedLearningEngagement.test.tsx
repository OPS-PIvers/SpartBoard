import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';

type SnapCb = (snap: { docs: { data: () => unknown }[] }) => void;
type ErrCb = (err: unknown) => void;
let emit: { next: SnapCb; error: ErrCb } | null = null;
const unsubscribe = vi.fn();

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: (_ref: unknown, next: SnapCb, error: ErrCb) => {
    emit = { next, error };
    return unsubscribe;
  },
}));

import { act } from 'react';
import { GuidedLearningEngagement } from './GuidedLearningEngagement';

const set = {
  id: 'set1',
  title: 'Log in',
  mode: 'guided',
  imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
  steps: [
    {
      id: 'a',
      imageIndex: 0,
      xPct: 10,
      yPct: 10,
      interactionType: 'tooltip',
      label: 'Open the menu',
    },
    { id: 'b', imageIndex: 0, xPct: 20, yPct: 20, interactionType: 'tooltip' },
    {
      id: 'c',
      imageIndex: 1,
      xPct: 30,
      yPct: 30,
      interactionType: 'tooltip',
      label: 'Press Save',
    },
  ],
} as unknown as GuidedLearningSet;

const fixtureDocs = [
  {
    mode: 'try',
    modeSwitches: 1,
    furthestStepIdx: 2,
    completed: true,
    steps: {
      a: {
        ms: 4000,
        misclicks: 2,
        hinted: false,
        clicks: [
          { x: 12, y: 40 },
          { x: 80, y: 5 },
        ],
      },
      c: { ms: 65000, misclicks: 1, hinted: true, clicks: [{ x: 50, y: 50 }] },
    },
  },
  {
    mode: 'watch',
    modeSwitches: 0,
    furthestStepIdx: 0,
    completed: false,
    steps: { a: { ms: 2000, misclicks: 0, hinted: false } },
  },
  // Written after the Watch / Try toggle was removed: no mode fields.
  {
    furthestStepIdx: 1,
    completed: true,
    steps: { a: { ms: 2000, misclicks: 0, hinted: false } },
  },
];

const push = (docs: unknown[]) =>
  act(() => emit?.next({ docs: docs.map((d) => ({ data: () => d })) }));

beforeEach(() => {
  emit = null;
  unsubscribe.mockClear();
});

describe('GuidedLearningEngagement', () => {
  it('renders the funnel, finished count and heatmap from old and new progress docs', () => {
    render(<GuidedLearningEngagement set={set} sessionId="s1" />);
    push(fixtureDocs);

    expect(screen.getByText(/3 viewers/)).toBeInTheDocument();
    expect(screen.getByTestId('engagement-finished')).toHaveTextContent(
      '2 of 3 finished'
    );
    expect(screen.queryByTestId('engagement-watch')).toBeNull();
    expect(screen.queryByTestId('engagement-try')).toBeNull();
    expect(screen.queryByText('Click along')).toBeNull();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('1. Open the menu');
    expect(items[0]).toHaveTextContent('3 of 3 · Median 2 s');
    expect(items[1]).toHaveTextContent('2. Step 2');
    expect(items[1]).toHaveTextContent('2 of 3');
    expect(items[2]).toHaveTextContent('Median 1 min 05 s');
    const bars = screen.getAllByTestId('funnel-bar');
    expect(bars.map((b) => b.style.width)).toEqual(['100%', '67%', '33%']);

    const slide0 = screen.getByTestId('heatmap-slide-0');
    expect(within(slide0).getByText('2 missed clicks')).toBeInTheDocument();
    const dots = slide0.querySelectorAll('span[aria-hidden="true"]');
    expect(dots).toHaveLength(2);
    expect((dots[0] as HTMLElement).style.left).toBe('12%');
    expect((dots[0] as HTMLElement).style.top).toBe('40%');
    expect(
      within(screen.getByTestId('heatmap-slide-1')).getByText('1 missed click')
    ).toBeInTheDocument();
  });

  it('says so when no one has opened the activity', () => {
    render(<GuidedLearningEngagement set={set} sessionId="s1" />);
    push([]);
    expect(
      screen.getByText('No one has opened this activity yet.')
    ).toBeInTheDocument();
  });

  it('shows an error when the listener fails and unsubscribes on unmount', () => {
    const { unmount } = render(
      <GuidedLearningEngagement set={set} sessionId="s1" />
    );
    act(() => emit?.error(new Error('denied')));
    expect(screen.getByText(/Couldn't load engagement/)).toBeInTheDocument();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
