// Pins the "Show Arrows on Ends" Toggle's accessible name; without a label
// prop the switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { NumberLineGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { NumberLineConfigurationPanel } from '@/components/admin/NumberLineConfigurationPanel';

afterEach(cleanup);

describe('NumberLineConfigurationPanel — label associations', () => {
  it('names the Show Arrows on Ends toggle', () => {
    render(
      <NumberLineConfigurationPanel
        config={{} as NumberLineGlobalConfig}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Show Arrows on Ends' })
    ).toBeInTheDocument();
  });
});
