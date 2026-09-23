import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PeriodAccess } from '@/types';
import { PeriodAccessStrip } from '@/components/widgets/QuizWidget/components/monitor/PeriodAccessStrip';

vi.mock('@/utils/serverTime', () => ({ getServerNow: () => NOW }));

const NOW = new Date(2026, 8, 29, 10, 50).getTime();

const period = (over: Partial<PeriodAccess>): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});

const renderStrip = (periodAccess: Record<string, PeriodAccess>) => {
  const handlers = {
    onStart: vi.fn().mockResolvedValue(undefined),
    onPause: vi.fn().mockResolvedValue(undefined),
    onExtend: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <PeriodAccessStrip
      periodAccess={periodAccess}
      extendMs={600_000}
      {...handlers}
    />
  );
  return handlers;
};

describe('PeriodAccessStrip', () => {
  it('names each period’s state in words, not colour alone', () => {
    renderStrip({
      a: period({ label: 'P1', state: 'open', closeAt: NOW + 65_000 }),
      b: period({ label: 'P3' }),
      c: period({ label: 'P4', state: 'paused' }),
      d: period({ label: 'P5', state: 'open', openAt: NOW + 3_600_000 }),
      e: period({ label: 'P6', verified: false }),
    });
    expect(
      screen.getByRole('button', { name: /Pause P1, now Live/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start P3, now Closed/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start P4, now Paused/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start P5, now Opens/ })
    ).toBeInTheDocument();
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText('· PIN')).toBeInTheDocument();
  });

  it('starts a closed period and pauses a live one', async () => {
    const h = renderStrip({
      a: period({ label: 'P1', state: 'open' }),
      b: period({ label: 'P3' }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Start P3/ }));
    await waitFor(() => expect(h.onStart).toHaveBeenCalledWith('b'));
    fireEvent.click(screen.getByRole('button', { name: /Pause P1/ }));
    await waitFor(() => expect(h.onPause).toHaveBeenCalledWith('a'));
  });

  it('offers +10 min and Until I pause from a live period’s countdown', async () => {
    const h = renderStrip({
      a: period({ label: 'P1', state: 'open', closeAt: NOW + 65_000 }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Time left for P1' }));
    fireEvent.click(screen.getByRole('button', { name: '+10 min' }));
    await waitFor(() => expect(h.onExtend).toHaveBeenCalledWith('a', 600_000));
    fireEvent.click(screen.getByRole('button', { name: 'Time left for P1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Until I pause' }));
    await waitFor(() => expect(h.onExtend).toHaveBeenCalledWith('a', null));
  });
});
