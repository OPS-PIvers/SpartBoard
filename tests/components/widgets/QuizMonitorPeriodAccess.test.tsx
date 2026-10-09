import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PeriodAccess } from '@/types';
import { PeriodAccessStrip } from '@/components/widgets/QuizWidget/components/monitor/PeriodAccessStrip';
import { PeriodBar } from '@/components/widgets/QuizWidget/components/monitor/PeriodBar';

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

const renderBar = (
  periodAccess: Record<string, PeriodAccess>,
  selected: string
) => {
  const h = {
    onSelect: vi.fn(),
    onStart: vi.fn().mockResolvedValue(undefined),
    onPause: vi.fn().mockResolvedValue(undefined),
    onExtend: vi.fn().mockResolvedValue(undefined),
  };
  const props = { periodAccess, selected, extendMs: 600_000, ...h };
  render(<PeriodBar {...props} />);
  return h;
};

describe('PeriodBar', () => {
  const classes = {
    a: period({ label: '5th Hour A', state: 'open', closeAt: NOW + 65_000 }),
    b: period({ label: '5th Hour B' }),
    c: period({ label: '5th Hour C', state: 'paused' }),
  };

  it('counts live classes and offers no start-all or pause-all', () => {
    renderBar(classes, '');
    expect(screen.getByText('1 of 3 live')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /all/ })).toBeNull();
  });

  it('names each class state in the picker and switches classes', () => {
    const h = renderBar(classes, 'a');
    expect(screen.getByRole('combobox', { name: 'Class' })).toHaveValue('a');
    expect(
      screen.getByRole('option', { name: '5th Hour B · Closed' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: 'b' },
    });
    expect(h.onSelect).toHaveBeenCalledWith('b');
  });

  it('offers More time only while the class has a close time', () => {
    renderBar({ a: period({ label: 'P1', state: 'open' }) }, 'a');
    expect(
      screen.queryByRole('button', { name: 'More time for P1' })
    ).toBeNull();
  });

  it('pauses or adds time to the picked live class', async () => {
    const h = renderBar(classes, 'a');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(h.onPause).toHaveBeenCalledWith('a'));
    fireEvent.click(
      screen.getByRole('button', { name: 'More time for 5th Hour A' })
    );
    fireEvent.click(screen.getByRole('button', { name: '+10 min' }));
    await waitFor(() => expect(h.onExtend).toHaveBeenCalledWith('a', 600_000));
  });

  it('starts the picked class when it is not live', async () => {
    const h = renderBar(classes, 'c');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(h.onStart).toHaveBeenCalledWith('c'));
  });
});
