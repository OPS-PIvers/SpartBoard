// Pins the sensitivity slider's label association; dropping htmlFor/id leaves it unnamed with nothing else failing.

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const widget: WidgetData = {
  id: 'sound-test-1',
  type: 'sound',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: true,
  config: { sensitivity: 1 },
};

describe('SoundSettings — label associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: vi.fn(),
      activeDashboard: { widgets: [] },
    });
  });

  it('names the sensitivity slider from its label', () => {
    render(<SoundSettings widget={widget} />);

    expect(screen.getByLabelText('Sensitivity')).toHaveAttribute(
      'type',
      'range'
    );
  });
});
