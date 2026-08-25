// Pins the DPI input's label association; dropping htmlFor/id leaves it unnamed with nothing else failing.

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MathToolsSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const widget: WidgetData = {
  id: 'math-tools-test-1',
  type: 'mathTools',
  x: 0,
  y: 0,
  w: 400,
  h: 400,
  z: 1,
  flipped: true,
  config: {},
};

describe('MathToolsSettings — label associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
    });
  });

  it('names the palette DPI calibration input from its label', () => {
    render(<MathToolsSettings widget={widget} />);

    expect(
      screen.getByLabelText('Palette DPI Calibration (px / inch)')
    ).toHaveAttribute('type', 'number');
  });
});
