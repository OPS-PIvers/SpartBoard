import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WidgetData, TimeToolConfig } from '@/types';
import { RemoteTimerControl } from './RemoteTimerControl';

const makeWidget = (config: Partial<TimeToolConfig>): WidgetData =>
  ({
    id: 'timer-1',
    type: 'time-tool',
    x: 0,
    y: 0,
    w: 300,
    h: 300,
    z: 1,
    config: {
      mode: 'timer',
      visualType: 'digital',
      duration: 300,
      elapsedTime: 300,
      isRunning: false,
      startTime: null,
      selectedSound: 'Gong',
      ...config,
    },
  }) as WidgetData;

describe('RemoteTimerControl', () => {
  it('shows whole seconds for a timer paused at a fractional time', () => {
    render(
      <RemoteTimerControl
        widget={makeWidget({ elapsedTime: 287.354 })}
        updateWidget={vi.fn()}
      />
    );
    expect(screen.getByText('04:47')).toBeInTheDocument();
  });

  it('disables Start on an expired timer', () => {
    render(
      <RemoteTimerControl
        widget={makeWidget({ elapsedTime: 0 })}
        updateWidget={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Start')).toBeDisabled();
  });

  it('keeps Start enabled for a stopwatch at zero', () => {
    render(
      <RemoteTimerControl
        widget={makeWidget({ mode: 'stopwatch', elapsedTime: 0 })}
        updateWidget={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Start')).toBeEnabled();
  });
});
