import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { GuidedLearningStep } from '@/types';
import { CalloutToolbar } from './CalloutToolbar';
import { cycleCalloutAlign } from './regionEdits';
import {
  isValidCalloutStyle,
  stepUsesCalloutStyle,
} from '../../utils/calloutStyle';

const step = (over: Partial<GuidedLearningStep> = {}): GuidedLearningStep => ({
  id: 'region-1',
  xPct: 30,
  yPct: 30,
  imageIndex: 0,
  interactionType: 'tooltip',
  text: 'Drag me',
  ...over,
});

describe('callout text alignment', () => {
  it('cycles left, centre, right and back to left, storing left as absent', () => {
    const centre = cycleCalloutAlign(step());
    expect(centre.calloutAlign).toBe('center');
    const right = cycleCalloutAlign(centre);
    expect(right.calloutAlign).toBe('right');
    const left = cycleCalloutAlign(right);
    expect('calloutAlign' in left).toBe(false);
  });

  it('counts a non-left alignment as a callout style and rejects unknown values', () => {
    expect(stepUsesCalloutStyle(step())).toBe(false);
    expect(stepUsesCalloutStyle(step({ calloutAlign: 'right' }))).toBe(true);
    expect(
      isValidCalloutStyle({
        calloutAlign: 'justify' as GuidedLearningStep['calloutAlign'],
      })
    ).toBe(false);
  });

  it('advances the alignment from the toolbar button', () => {
    const onChange = vi.fn();
    const { container } = render(
      <CalloutToolbar
        step={step({ calloutAlign: 'center' })}
        onChange={onChange}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const button = container.querySelector(
      '[data-tour="studio.callout-align"]'
    );
    expect(button).not.toBeNull();
    fireEvent.click(button as Element);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ calloutAlign: 'right' })
    );
  });
});
