import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StudentProgressLine } from './StudentProgressLine';

const NOW = Date.UTC(2026, 9, 2, 18, 0, 0);

afterEach(() => vi.useRealTimers());

function renderLine(
  props: Partial<React.ComponentProps<typeof StudentProgressLine>>
) {
  vi.useFakeTimers({ now: NOW });
  return render(
    <StudentProgressLine
      progress={{ furthestStepIdx: 6, completed: false, updatedAt: NOW }}
      playerV2
      stepCount={12}
      {...props}
    />
  );
}

describe('StudentProgressLine', () => {
  it('reads "Slide 7 of 12 · active 2 days ago"', () => {
    renderLine({
      progress: {
        furthestStepIdx: 6,
        completed: false,
        updatedAt: NOW - 2 * 24 * 60 * 60_000,
      },
    });
    expect(
      screen.getByText('Slide 7 of 12 · active 2 days ago')
    ).toBeInTheDocument();
  });

  it.each([
    [30_000, 'active just now'],
    [5 * 60_000, 'active 5 minutes ago'],
    [60 * 60_000, 'active 1 hour ago'],
    [3 * 60 * 60_000, 'active 3 hours ago'],
    [24 * 60 * 60_000, 'active 1 day ago'],
  ])('formats an age of %i ms', (age, label) => {
    renderLine({
      progress: { furthestStepIdx: 0, completed: false, updatedAt: NOW - age },
    });
    expect(screen.getByText(`Slide 1 of 12 · ${label}`)).toBeInTheDocument();
  });

  it('drops the time while the server timestamp is pending', () => {
    renderLine({
      progress: { furthestStepIdx: 2, completed: false, updatedAt: null },
    });
    expect(screen.getByText('Slide 3 of 12')).toBeInTheDocument();
  });

  it('never shows a slide past the last one', () => {
    renderLine({
      progress: { furthestStepIdx: 40, completed: true, updatedAt: null },
    });
    expect(screen.getByText('Slide 12 of 12')).toBeInTheDocument();
  });

  it('omits the total when the step count is unknown', () => {
    renderLine({ stepCount: null });
    expect(screen.getByText('Slide 7 · active just now')).toBeInTheDocument();
  });

  it('says "Not tracked" for a session without the v2 player', () => {
    renderLine({ playerV2: false, progress: undefined });
    expect(screen.getByText('Not tracked')).toBeInTheDocument();
  });

  it('renders nothing for a tracked student with no progress doc yet', () => {
    const { container } = renderLine({ progress: undefined });
    expect(container).toBeEmptyDOMElement();
  });
});
