// Pins the Lunch Time group's aria-labelledby ↔ SettingsLabel id pairing; dropping the id leaves the group unnamed with nothing else failing.

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LunchCountSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const widget: WidgetData = {
  id: 'lunch-count-test-1',
  type: 'lunchCount',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: true,
  config: {
    schoolSite: 'schumann-elementary',
    lunchTimeHour: '11',
    lunchTimeMinute: '30',
  },
};

describe('LunchCountSettings — label associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
      rosters: [],
      activeRosterId: null,
    });
  });

  it('names the Lunch Time group from its heading', () => {
    render(<LunchCountSettings widget={widget} />);

    expect(
      screen.getByRole('group', { name: 'Lunch Time' })
    ).toBeInTheDocument();
  });
});
