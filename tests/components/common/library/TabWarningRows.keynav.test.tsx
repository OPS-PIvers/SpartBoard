// Regression test: the tab-away time-limit radiogroup must support roving-tabindex arrow-key nav.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabAwayLimitRow } from '@/components/common/library/TabWarningRows';

describe('TabAwayLimitRow — time-limit radiogroup keyboard nav', () => {
  function renderRow(seconds = 30) {
    const onChange = vi.fn();
    render(
      <TabAwayLimitRow
        autoSubmit={true}
        seconds={seconds}
        onChange={onChange}
      />
    );
    return onChange;
  }

  it('only the checked radio is tab-stoppable (roving tabindex)', () => {
    renderRow(30);
    const radios = screen.getAllByRole('radio');
    const checked = radios.find(
      (r) => r.getAttribute('aria-checked') === 'true'
    );
    const unchecked = radios.filter((r) => r !== checked);

    expect(checked).toHaveAttribute('tabIndex', '0');
    unchecked.forEach((r) => expect(r).toHaveAttribute('tabIndex', '-1'));
  });

  it('ArrowRight moves focus and selection to the next radio', () => {
    const onChange = renderRow(30);
    const radios = screen.getAllByRole('radio');
    radios[0].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });

    expect(radios[1]).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith({
      tabAwayAutoSubmit: true,
      tabAwayLimitSeconds: 30,
    });
  });

  it('Home moves focus to the first radio', () => {
    renderRow(300);
    const radios = screen.getAllByRole('radio');
    radios[radios.length - 1].focus();

    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'Home' });

    expect(radios[0]).toHaveFocus();
  });

  // Regression: a value between presets (reachable via the +/- stepper) matches
  // no button — the roving tabindex must still land on one radio (the first),
  // not leave every radio at tabIndex=-1 (a keyboard trap).
  it('falls back to the first radio when the current value matches no preset', () => {
    renderRow(45);
    const radios = screen.getAllByRole('radio');

    radios.forEach((r) => expect(r).toHaveAttribute('aria-checked', 'false'));
    expect(radios[0]).toHaveAttribute('tabIndex', '0');
    radios.slice(1).forEach((r) => expect(r).toHaveAttribute('tabIndex', '-1'));
  });
});
