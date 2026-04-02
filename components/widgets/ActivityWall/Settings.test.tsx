import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ActivityWallAppearanceSettings,
  ActivityWallSettings,
} from './Settings';
import { WidgetData } from '@/types';

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

  it('explains that activity management moved into the widget body', () => {
    render(<ActivityWallSettings widget={widget} />);

    expect(
      screen.getByText(/activity management moved to the front of this widget/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /use the activity library in the widget body to create, view, edit, and delete activities/i
      )
    ).toBeInTheDocument();
  });

  it('shows the appearance settings guidance', () => {
    render(<ActivityWallAppearanceSettings widget={widget} />);

    expect(
      screen.getByText(
        /this widget uses the standard window appearance controls/i
      )
    ).toBeInTheDocument();
  });
});
