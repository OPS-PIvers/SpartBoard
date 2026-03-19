import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CatalystSettings } from './CatalystSettings';
import { WidgetData } from '@/types';

describe('CatalystSettings', () => {
  const createWidget = (): WidgetData => {
    return {
      id: 'catalyst-1',
      type: 'catalyst',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      z: 1,
      flipped: false,
      config: {
        activeCategory: null,
        activeStrategyId: null,
      },
    } as WidgetData;
  };

  it('renders the admin managed message', () => {
    render(<CatalystSettings widget={createWidget()} />);
    expect(screen.getByText('Admin Managed')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Catalyst routines and categories are managed globally by administrators/i
      )
    ).toBeInTheDocument();
  });
});
