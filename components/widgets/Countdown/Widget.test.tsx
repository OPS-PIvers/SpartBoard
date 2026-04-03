import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CountdownWidget } from './Widget';
import { CountdownConfig, WidgetData } from '@/types';

vi.mock('../WidgetLayout', () => ({
  WidgetLayout: ({ content }: { content: React.ReactNode }) => (
    <div data-testid="widget-layout">{content}</div>
  ),
}));

const buildWidget = (config: Partial<CountdownConfig>): WidgetData =>
  ({
    id: 'countdown-widget',
    type: 'countdown',
    x: 0,
    y: 0,
    w: 300,
    h: 250,
    z: 1,
    flipped: false,
    config: {
      title: 'Field Trip',
      startDate: '2026-04-03T12:00:00.000Z',
      eventDate: '2026-04-06T12:00:00.000Z',
      includeWeekends: true,
      countToday: true,
      viewMode: 'number',
      ...config,
    } satisfies CountdownConfig,
  }) as WidgetData;

describe('CountdownWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T09:00:00.000Z'));
  });

  it('shows the current day as excluded in grid mode when countToday is off', () => {
    render(
      <CountdownWidget
        widget={buildWidget({
          countToday: false,
          viewMode: 'grid',
        })}
      />
    );

    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('keeps the headline countdown in sync with the same countToday rule', () => {
    render(<CountdownWidget widget={buildWidget({ countToday: false })} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/days until/i)).toBeInTheDocument();
  });
});
