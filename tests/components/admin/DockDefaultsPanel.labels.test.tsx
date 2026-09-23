// Pins each building's dock-default Toggle to an accessible name; without a
// label prop every building's switch shares the same unnamed role="switch".

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'b1', name: 'North Elementary' },
    { id: 'b2', name: 'South Middle' },
  ],
}));

import { DockDefaultsPanel } from '@/components/admin/DockDefaultsPanel';

afterEach(cleanup);

describe('DockDefaultsPanel — label associations', () => {
  it('names every building dock-default toggle from its building', () => {
    render(
      <DockDefaultsPanel config={{ dockDefaults: {} }} onChange={vi.fn()} />
    );

    expect(
      screen.getByRole('switch', {
        name: 'Dock on North Elementary by default',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Dock on South Middle by default' })
    ).toBeInTheDocument();
  });

  it('leaves no switch without an aria-label', () => {
    render(
      <DockDefaultsPanel config={{ dockDefaults: {} }} onChange={vi.fn()} />
    );

    // Toggle renders visible "ON"/"OFF" text inside the button, so a bare
    // toHaveAccessibleName() would pass via that text-content fallback even
    // with no aria-label at all — assert the attribute itself instead.
    for (const el of screen.getAllByRole('switch')) {
      expect(el).toHaveAttribute('aria-label');
    }
  });
});
