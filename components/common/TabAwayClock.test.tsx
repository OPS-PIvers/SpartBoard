import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabAwayClock } from './TabAwayClock';

describe('TabAwayClock', () => {
  afterEach(() => vi.restoreAllMocks());

  it('counts up while auto-submit is off', () => {
    vi.spyOn(performance, 'now').mockReturnValue(13_000);
    render(
      <TabAwayClock
        away={{ leftAtPerf: 1_000, durationMs: null, outcome: null }}
        limitMs={30_000}
        autoSubmit={false}
      />
    );
    expect(screen.getByText('Away 0:12')).toBeInTheDocument();
  });

  it('counts down and announces the last 30 seconds', () => {
    vi.spyOn(performance, 'now').mockReturnValue(13_000);
    render(
      <TabAwayClock
        away={{ leftAtPerf: 1_000, durationMs: null, outcome: null }}
        limitMs={30_000}
        autoSubmit
      />
    );
    expect(screen.getByText('0:18')).toBeInTheDocument();
    expect(screen.getByText('30 seconds left')).toBeInTheDocument();
  });

  it('freezes on the closed exit and says when time ran out', () => {
    render(
      <TabAwayClock
        away={{ leftAtPerf: 0, durationMs: 30_000, outcome: 'auto-submitted' }}
        limitMs={30_000}
        autoSubmit
      />
    );
    expect(screen.getByText("Time's up")).toBeInTheDocument();
  });

  it('shows the time away once the student is back', () => {
    render(
      <TabAwayClock
        away={{ leftAtPerf: 0, durationMs: 4_200, outcome: 'returned' }}
        limitMs={30_000}
        autoSubmit={false}
      />
    );
    expect(screen.getByText('Away 0:04')).toBeInTheDocument();
  });
});
