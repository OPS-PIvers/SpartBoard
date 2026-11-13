import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiddleHighLunchCount } from './MiddleHighLunchCount';
import { useDashboard } from '@/context/useDashboard';
import type { WidgetData, LunchCountConfig } from '@/types';

vi.mock('@/context/useDashboard');
const nut = vi.hoisted(() => ({ isSyncing: false, fetch: vi.fn() }));
vi.mock('./useNutrislice', () => ({
  useNutrislice: () => ({
    isSyncing: nut.isSyncing,
    fetchNutrislice: nut.fetch,
  }),
}));

const createWidget = (config: Partial<LunchCountConfig> = {}): WidgetData =>
  ({
    id: 'lunch-1',
    type: 'lunchCount',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    config: {
      schoolSite: 'orono-middle-school',
      rosterMode: 'class',
      assignments: { s1: 'hot' },
      cachedMenu: {
        hotLunch: { name: 'Pizza' },
        hotLunchSides: [],
        bentoBox: { name: 'Yogurt Parfait' },
        date: new Date().toISOString(),
      },
      ...config,
    },
  }) as WidgetData;

describe('MiddleHighLunchCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nut.isSyncing = false;
    vi.mocked(useDashboard).mockReturnValue({
      updateWidget: vi.fn(),
      addToast: vi.fn(),
      activeDashboard: { widgets: [{ id: 'lunch-1' }] },
    } as unknown as ReturnType<typeof useDashboard>);
  });

  it.each(['orono-middle-school', 'orono-high-school'] as const)(
    'shows the hot lunch without a count to send for %s',
    (schoolSite) => {
      render(<MiddleHighLunchCount widget={createWidget({ schoolSite })} />);
      expect(screen.getByText('Hot Lunch')).toBeTruthy();
      expect(screen.getByText('Pizza')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Submit/i })).toBeNull();
      expect(screen.queryByTestId('hot-zone')).toBeNull();
    }
  );

  it('shows the manual hot lunch in manual mode', () => {
    render(
      <MiddleHighLunchCount
        widget={createWidget({ isManualMode: true, manualHotLunch: 'Tacos' })}
      />
    );
    expect(screen.getByText('Tacos')).toBeTruthy();
  });

  it('refreshes the menu and keeps its tour anchor', () => {
    render(<MiddleHighLunchCount widget={createWidget()} />);
    const refresh = screen.getByRole('button', { name: 'Refresh menu' });
    expect(refresh.getAttribute('data-tour')).toContain(
      'lunch-count.refresh-menu'
    );
    fireEvent.click(refresh);
    expect(nut.fetch).toHaveBeenCalledTimes(1);
  });

  it('disables Refresh while syncing', () => {
    nut.isSyncing = true;
    render(<MiddleHighLunchCount widget={createWidget()} />);
    expect(
      (screen.getByRole('button', { name: 'Refresh menu' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
