import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

interface Hoisted {
  pending: boolean;
  canRun: boolean;
  running: boolean;
  next: { setId: string; itemId: string } | null;
  start: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}
const h = vi.hoisted((): Hoisted => ({
  pending: true,
  canRun: true,
  running: false,
  next: { setId: 'set-profile', itemId: 'item-profile' },
  start: vi.fn(),
  dismiss: vi.fn(() => Promise.resolve()),
  navigate: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' } }),
}));
vi.mock('@/hooks/useFirstRun', () => ({
  useFirstRun: () => ({
    welcomePending: h.pending,
    quiet: true,
    firstRun: true,
  }),
}));
vi.mock('@/components/tours/useCanRunLiveTour', () => ({
  useCanRunLiveTour: () => h.canRun,
}));
vi.mock('@/components/tours/tourState', () => ({
  requestStartTour: h.start,
  useTourRunning: () => h.running,
}));
vi.mock('@/components/sparty/useShowSparty', () => ({
  useShowSparty: () => false,
}));
vi.mock('@/hooks/useGettingStarted', () => ({
  useGettingStarted: () => ({ loading: false, nextEssential: h.next }),
}));
vi.mock('@/hooks/useHelpResources', () => ({
  incrementHelpOpenCount: () => Promise.resolve(),
}));
vi.mock('@/utils/gettingStartedProgress', () => ({
  dismissWelcome: h.dismiss,
}));
vi.mock('@/utils/plcPath', () => ({ spaNavigate: h.navigate }));

const { GettingStartedWelcome } = await import('./GettingStartedWelcome');

beforeEach(() => {
  h.pending = true;
  h.canRun = true;
  h.running = false;
  h.next = { setId: 'set-profile', itemId: 'item-profile' };
  h.start.mockClear();
  h.dismiss.mockClear();
  h.navigate.mockClear();
});

describe('GettingStartedWelcome', () => {
  it('Start runs the first Essentials tour, chained, and puts the welcome away', () => {
    render(<GettingStartedWelcome />);
    fireEvent.click(screen.getByTestId('getting-started-welcome-start'));
    expect(h.start).toHaveBeenCalledWith({
      setId: 'set-profile',
      chain: 'getting-started',
    });
    expect(h.dismiss).toHaveBeenCalledWith('u1');
    expect(
      screen.queryByTestId('getting-started-welcome-start')
    ).not.toBeInTheDocument();
  });

  it('Start opens the page when no tours are curated yet', () => {
    h.next = null;
    render(<GettingStartedWelcome />);
    fireEvent.click(screen.getByTestId('getting-started-welcome-start'));
    expect(h.start).not.toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalledWith('/getting-started');
  });

  it('Later puts it away without starting anything', () => {
    render(<GettingStartedWelcome />);
    fireEvent.click(screen.getByTestId('getting-started-welcome-later'));
    expect(h.dismiss).toHaveBeenCalledWith('u1');
    expect(h.start).not.toHaveBeenCalled();
  });

  it('waits on a phone, during a tour, and once answered', () => {
    h.canRun = false;
    const { rerender } = render(<GettingStartedWelcome />);
    expect(screen.queryByText('Welcome to SpartBoard')).not.toBeInTheDocument();
    h.canRun = true;
    h.running = true;
    rerender(<GettingStartedWelcome />);
    expect(screen.queryByText('Welcome to SpartBoard')).not.toBeInTheDocument();
    h.running = false;
    h.pending = false;
    rerender(<GettingStartedWelcome />);
    expect(screen.queryByText('Welcome to SpartBoard')).not.toBeInTheDocument();
  });
});
