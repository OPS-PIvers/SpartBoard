// Regression test: the callout colour picker must support roving-tabindex arrow-key nav.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GuidedLearningStep } from '@/types';
import { CalloutToolbar } from './CalloutToolbar';

function buildStep(
  tone?: GuidedLearningStep['calloutTone']
): GuidedLearningStep {
  return {
    id: 'region-1',
    xPct: 30,
    yPct: 30,
    imageIndex: 0,
    interactionType: 'tooltip',
    showOverlay: 'tooltip',
    text: 'Drag me',
    region: { shape: 'rect', wPct: 20, hPct: 20 },
    ...(tone ? { calloutTone: tone } : {}),
  };
}

describe('CalloutToolbar — colour radiogroup keyboard nav', () => {
  function renderToolbar(tone?: GuidedLearningStep['calloutTone']) {
    const onChange = vi.fn();
    render(
      <CalloutToolbar
        step={buildStep(tone)}
        onChange={onChange}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    return onChange;
  }

  it('only the checked colour radio is tab-stoppable (roving tabindex)', () => {
    renderToolbar();
    const radios = screen.getAllByRole('radio');
    const checked = radios.find(
      (r) => r.getAttribute('aria-checked') === 'true'
    );
    const unchecked = radios.filter((r) => r !== checked);

    expect(checked).toHaveAttribute('tabIndex', '0');
    unchecked.forEach((r) => expect(r).toHaveAttribute('tabIndex', '-1'));
  });

  it('ArrowRight moves focus and selection to the next colour', () => {
    const onChange = renderToolbar('dark');
    const radios = screen.getAllByRole('radio');
    radios[0].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });

    expect(radios[1]).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ calloutTone: 'light' })
    );
  });

  it('Home moves focus to the first colour', () => {
    renderToolbar('accent');
    const radios = screen.getAllByRole('radio');
    radios[radios.length - 1].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'Home' });

    expect(radios[0]).toHaveFocus();
  });
});
