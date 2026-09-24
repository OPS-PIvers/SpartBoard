import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import { StudioRegionControls } from './StudioRegionControls';

const STEP: GuidedLearningStep = {
  id: 's1',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  text: 'Hi',
  calloutPin: { xPct: 20, yPct: 20 },
  calloutWidthPct: 42,
  calloutScale: 1.25,
  calloutTone: 'light',
};

describe('StudioRegionControls callout style', () => {
  it('summarises width, scale and colour, and Reset all clears placement and size', () => {
    const onChange = vi.fn();
    render(
      <StudioRegionControls step={STEP} onChange={onChange} calloutEditing />
    );
    expect(screen.getByTestId('gl-studio-callout-style')).toHaveTextContent(
      'Width 42% · 1.25× · Light'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    const next = onChange.mock.calls[0][0] as GuidedLearningStep;
    expect(next.calloutPin).toBeUndefined();
    expect(next.calloutWidthPct).toBeUndefined();
    expect(next.calloutScale).toBeUndefined();
    expect(next.calloutTone).toBe('light');
  });

  it('keeps today’s panel with the flag off', () => {
    render(<StudioRegionControls step={STEP} onChange={vi.fn()} />);
    expect(screen.queryByTestId('gl-studio-callout-style')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Reset to auto' })
    ).toBeInTheDocument();
  });
});
