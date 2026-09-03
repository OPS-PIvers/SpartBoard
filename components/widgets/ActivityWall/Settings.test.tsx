import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ActivityWallAppearanceSettings,
  ActivityWallSettings,
} from './Settings';
import { WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ updateWidget: vi.fn() }),
}));

describe('ActivityWallSettings', () => {
  const widget: WidgetData = {
    id: 'widget-1',
    type: 'activity-wall',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    z: 1,
    flipped: false,
    config: {
      activeActivityId: 'activity-1',
      activities: [],
    },
  } as WidgetData;

  it('explains that wall management moved into the widget body', () => {
    render(<ActivityWallSettings widget={widget} />);

    expect(
      screen.getByText(/walls are managed from the widget face/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /use the library button to pick, create, edit, duplicate, or delete a wall/i
      )
    ).toBeInTheDocument();
  });

  it('renders typography and surface color settings', () => {
    render(<ActivityWallAppearanceSettings widget={widget} />);

    expect(screen.getByText(/typography/i)).toBeInTheDocument();
  });
});
