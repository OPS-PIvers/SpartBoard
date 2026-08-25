// Pins the DPI input's label association; dropping htmlFor/id leaves it unnamed with nothing else failing.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MathToolsConfigurationPanel } from '@/components/admin/MathToolsConfigurationPanel';

afterEach(cleanup);

describe('MathToolsConfigurationPanel — label associations', () => {
  it('names the building-wide DPI calibration input from its label', () => {
    render(<MathToolsConfigurationPanel config={{}} onChange={vi.fn()} />);

    expect(
      screen.getByLabelText('Building-Wide DPI Calibration (px / inch)')
    ).toHaveAttribute('type', 'number');
  });
});
