import React, { useState } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TourWidgetLayout, WidgetType } from '@/types';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import {
  DialogContext,
  type DialogContextValue,
} from '@/context/DialogContextValue';
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
    expect(screen.getByText(/^None/)).toBeInTheDocument();
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

describe('StudioTourSetup board layout', () => {
  const widget = (id: string, type: WidgetType, z: number) => ({
    id,
    type,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    xProp: 0.1 * z,
    yProp: 0.1,
    wProp: 0.2,
    hProp: 0.3,
    z,
    flipped: false,
    config: {},
  });
  const board = [widget('b', 'clock', 3), widget('a', 'dice', 1)];

  const renderWithBoard = (confirm: boolean) => {
    const onLayoutsChange = vi.fn();
    const showConfirm = vi.fn(() => Promise.resolve(confirm));
    render(
      <DialogContext.Provider
        value={{ showConfirm } as unknown as DialogContextValue}
      >
        <DashboardContext.Provider
          value={
            {
              activeDashboard: { widgets: board },
            } as unknown as DashboardContextValue
          }
        >
          <StudioTourSetup
            widgets={[]}
            onChange={vi.fn()}
            layouts={[]}
            onLayoutsChange={onLayoutsChange}
          />
        </DashboardContext.Provider>
      </DialogContext.Provider>
    );
    return { onLayoutsChange, showConfirm };
  };

  it('replaces the layouts with the current board after a confirm', async () => {
    const { onLayoutsChange, showConfirm } = renderWithBoard(true);
    expect(screen.getByText('No saved layout')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Capture board layout' })
    );
    await waitFor(() => expect(onLayoutsChange).toHaveBeenCalled());
    expect(showConfirm).toHaveBeenCalledTimes(1);
    const layouts = onLayoutsChange.mock.lastCall?.[0] as TourWidgetLayout[];
    expect(layouts.map((l) => [l.slot, l.type])).toEqual([
      [0, 'dice'],
      [1, 'clock'],
    ]);
  });

  it('changes nothing when the confirm is declined', async () => {
    const { onLayoutsChange, showConfirm } = renderWithBoard(false);
    fireEvent.click(
      screen.getByRole('button', { name: 'Capture board layout' })
    );
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(onLayoutsChange).not.toHaveBeenCalled();
  });
});
