import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MathToolInstanceSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, MathToolType } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const widget: WidgetData = {
  id: 'math-tool-test-1',
  type: 'mathTool',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: true,
  config: {
    toolType: 'number-line',
    numberLineMin: -10,
    numberLineMax: 10,
  },
};

describe('MathToolInstanceSettings — Min/Max label associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
    });
  });

  it('names the Min input from its label', () => {
    render(<MathToolInstanceSettings widget={widget} />);

    expect(screen.getByLabelText('Min')).toHaveAttribute('type', 'number');
  });

  it('names the Max input from its label', () => {
    render(<MathToolInstanceSettings widget={widget} />);

    expect(screen.getByLabelText('Max')).toHaveAttribute('type', 'number');
  });

  it('names the true-scale calibration input from its label', () => {
    render(<MathToolInstanceSettings widget={widget} />);

    expect(
      screen.getByLabelText('True-Scale Calibration (px / inch)')
    ).toHaveAttribute('type', 'number');
  });
});

describe('MathToolInstanceSettings — Tool Type radiogroup keyboard reachability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
    });
  });

  it('keeps exactly one tab stop when toolType matches no known tool', () => {
    // A legacy/corrupted persisted value outside MathToolType — cast past
    // the type system deliberately, since that's exactly the runtime case
    // this test guards against.
    const widgetWithUnknownToolType: WidgetData = {
      ...widget,
      config: {
        ...widget.config,
        toolType: 'not-a-real-tool' as unknown as MathToolType,
      },
    };
    render(<MathToolInstanceSettings widget={widgetWithUnknownToolType} />);

    const options = screen.getAllByRole('radio');
    const tabbable = options.filter(
      (option) => option.getAttribute('tabindex') === '0'
    );
    expect(tabbable).toHaveLength(1);
  });
});
