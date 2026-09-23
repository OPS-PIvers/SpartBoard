// Pins the "Sound Effects" Toggle's accessible name; without a label prop the switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { RandomGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { RandomConfigurationPanel } from '@/components/admin/RandomConfigurationPanel';

afterEach(cleanup);

describe('RandomConfigurationPanel — label associations', () => {
  it('names the Sound Effects toggle', () => {
    render(
      <RandomConfigurationPanel
        config={{} as RandomGlobalConfig}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Sound Effects' })
    ).toBeInTheDocument();
  });
});
