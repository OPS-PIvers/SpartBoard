import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WidgetType } from '@/types';
import { StudioTourSetup } from './StudioTourSetup';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ featurePermissions: [] }),
}));

function renderSetup(initial: WidgetType[]) {
  const seen = vi.fn();
  const Harness = () => {
    const [widgets, setWidgets] = useState(initial);
    return (
      <StudioTourSetup
        widgets={widgets}
        onChange={(next) => {
          seen(next);
          setWidgets(next);
        }}
      />
    );
  };
  render(<Harness />);
  return () => seen.mock.lastCall?.[0] as WidgetType[];
}

const chips = () =>
  within(screen.getByTestId('gl-studio-tour-setup'))
    .queryAllByRole('listitem')
    .map((li) => li.textContent);

describe('StudioTourSetup', () => {
  it('shows the widgets this tour adds as chips', () => {
    renderSetup(['time-tool', 'clock']);
    expect(
      screen.getByRole('region', { name: 'Widgets this tour adds' })
    ).toBeInTheDocument();
    expect(chips()).toEqual(['Timer', 'Clock']);
  });

  it('removes a chip', () => {
    const last = renderSetup(['time-tool', 'clock']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Timer' }));
    expect(last()).toEqual(['clock']);
    expect(chips()).toEqual(['Clock']);
  });

  it('adds a widget, offering only ones not already listed', () => {
    const last = renderSetup([]);
    expect(
      screen.getByText('None. The tour runs on the board as it is.')
    ).toBeInTheDocument();
    const add = screen.getByRole('combobox', { name: 'Add a widget' });
    fireEvent.change(add, { target: { value: 'dice' } });
    expect(last()).toEqual(['dice']);
    expect(chips()).toEqual(['Dice']);
    expect(
      within(add).queryByRole('option', { name: 'Dice' })
    ).not.toBeInTheDocument();
    expect(
      within(add).queryByRole('option', { name: /Magic/ })
    ).not.toBeInTheDocument();
  });
});
