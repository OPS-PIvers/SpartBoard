// Pins the per-category "Enable ... category" and per-option "Enable ..." Toggles' accessible names; without a label prop the switches are unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { ExpectationsGlobalConfig } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [{ id: 'b1', name: 'Test School' }],
}));

import { ExpectationsConfigurationPanel } from '@/components/admin/ExpectationsConfigurationPanel';

afterEach(cleanup);

describe('ExpectationsConfigurationPanel — label associations', () => {
  it('names the category toggle and each per-option toggle', () => {
    render(
      <ExpectationsConfigurationPanel
        config={{ buildings: {} } as ExpectationsGlobalConfig}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Enable Volume Options category' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Enable Silence' })
    ).toBeInTheDocument();
  });
});
